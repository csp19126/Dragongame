/**
 * Social: profile photos, public player profiles, private messages (DMs), blocking,
 * and the reports admins act on. Admins can only read a private message once the
 * player who received it has reported it (plus the few messages before it, for context).
 */
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql, count } from "drizzle-orm";
import { db } from "./db";
import {
  users, userAvatars, directMessages, userBlocks, dmReports, profileReports, userStickers, poolMatches, type User,
} from "@shared/schema";
import {
  AVATAR_MAX_BYTES, AVATAR_CHANGES_PER_DAY, DM_MAX_LEN, DM_COOLDOWN_MS, DM_PAGE, ONLINE_MS, sniffImage,
  type PlayerProfile, type DmConversation, type DmMessage, type DmThread,
} from "@shared/social";
import { LEAGUE_WIN, LEAGUE_LOSS, seasonOf, tierOf } from "@shared/league";
import { speakerRefusal, paceLimiter, readMessage } from "./speech";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------- Presence ----------------

// "Last seen" in the database is only written every few minutes, so who is online right now
// is kept in memory too (every signed-in request marks the player)
const activeAt = new Map<string, number>();
export function markActive(userId: string) {
  activeAt.set(userId, Date.now());
  if (activeAt.size > 20000) {
    const cutoff = Date.now() - ONLINE_MS;
    for (const [id, at] of activeAt) if (at < cutoff) activeAt.delete(id);
  }
}
export function isOnline(userId: string, lastSeenAt: Date | string | null | undefined) {
  const mem = activeAt.get(userId) ?? 0;
  const stored = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  return Date.now() - Math.max(mem, stored) < ONLINE_MS;
}

// ---------------- Profile photos ----------------

export const AVATAR_ROUTE = "/api/profile/photo";
const photoChanges = new Map<string, { day: string; n: number }>();
const today = () => new Date().toISOString().slice(0, 10);
function photoChangesLeft(userId: string) {
  const c = photoChanges.get(userId);
  return c && c.day === today() ? AVATAR_CHANGES_PER_DAY - c.n : AVATAR_CHANGES_PER_DAY;
}
function countPhotoChange(userId: string) {
  const c = photoChanges.get(userId);
  photoChanges.set(userId, c && c.day === today() ? { day: c.day, n: c.n + 1 } : { day: today(), n: 1 });
  if (photoChanges.size > 20000) photoChanges.clear();
}

/** Checks an uploaded photo (base64, optionally a data: URL) by its real bytes */
export function decodePhoto(raw: unknown): { data: Buffer; mime: string } | { error: string } {
  if (typeof raw !== "string" || !raw) return { error: "Photo must be a JPEG, PNG or WebP image" };
  const b64 = raw.replace(/^data:[\w/+.-]+;base64,/, "");
  if (b64.length > Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 8) return { error: "Photo is too big (150 KB max)" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { error: "Photo must be a JPEG, PNG or WebP image" };
  const data = Buffer.from(b64, "base64");
  if (data.length > AVATAR_MAX_BYTES) return { error: "Photo is too big (150 KB max)" };
  const mime = sniffImage(data);
  if (!mime) return { error: "Photo must be a JPEG, PNG or WebP image" };
  return { data, mime };
}

/** Deletes a player's photo (their own choice, an admin, or account deletion) */
export async function removePhoto(userId: string) {
  await db.delete(userAvatars).where(eq(userAvatars.userId, userId));
  await db.update(users).set({ profileImageUrl: null }).where(eq(users.id, userId));
}

// ---------------- Blocks ----------------

async function blockState(me: string, other: string) {
  const rows = await db.select({ blocker: userBlocks.blockerId }).from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, me), eq(userBlocks.blockedId, other)), and(eq(userBlocks.blockerId, other), eq(userBlocks.blockedId, me))));
  return { byMe: rows.some((r) => r.blocker === me), either: rows.length > 0 };
}

async function findPlayer(name: unknown) {
  if (typeof name !== "string" || !name.trim() || name.length > 40) return undefined;
  const [u] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${name.trim()})`);
  return u && !u.banned ? u : undefined;
}

// ---------------- Profiles ----------------

async function profileOf(u: User, viewer: User): Promise<PlayerProfile> {
  const season = seasonOf(new Date());
  const [league] = (await db.execute(sql`
    select count(*) filter (where winner = ${u.id})::int as won, count(*) filter (where winner <> ${u.id})::int as lost
    from ${poolMatches} where season = ${season} and counted and (player1 = ${u.id} or player2 = ${u.id})
  `)).rows as { won: number; lost: number }[];
  const played = (league?.won ?? 0) + (league?.lost ?? 0);
  const points = (league?.won ?? 0) * LEAGUE_WIN + (league?.lost ?? 0) * LEAGUE_LOSS;
  const tier = tierOf(points);
  const [{ n: stickers }] = await db.select({ n: count() }).from(userStickers).where(and(eq(userStickers.userId, u.id), gt(userStickers.count, 0)));
  const blocks = u.id === viewer.id ? { byMe: false } : await blockState(viewer.id, u.id);
  return {
    username: u.username,
    avatarUrl: u.profileImageUrl,
    online: isOnline(u.id, u.lastSeenAt),
    memberSince: u.createdAt ? u.createdAt.toISOString() : null,
    gamesPlayed: u.gamesPlayed,
    biggestWin: u.maxWin,
    league: played ? { tier: tier.id, icon: tier.icon, vi: tier.vi, en: tier.en, zh: tier.zh, points } : null,
    stickers,
    admin: u.isAdmin,
    you: u.id === viewer.id,
    blockedByYou: blocks.byMe,
  };
}

// ---------------- Private messages ----------------

const dmPace = paceLimiter(DM_COOLDOWN_MS);
const CANT_MESSAGE = "Can't message this player";

function toDm(m: typeof directMessages.$inferSelect, me: string): DmMessage {
  return { id: m.id, mine: m.fromId === me, text: m.text, sticker: m.sticker, createdAt: m.createdAt.toISOString(), read: !!m.readAt };
}

const between = (a: string, b: string) =>
  or(and(eq(directMessages.fromId, a), eq(directMessages.toId, b)), and(eq(directMessages.fromId, b), eq(directMessages.toId, a)));

/** Unread private messages (not counting senders who have since been banned: their conversations are hidden) */
export async function unreadTotal(userId: string) {
  const [{ n }] = await db.select({ n: count() }).from(directMessages)
    .where(and(eq(directMessages.toId, userId), isNull(directMessages.readAt), eq(directMessages.deleted, false),
      sql`${directMessages.fromId} not in (select id from ${users} where banned)`));
  return n;
}

async function conversations(me: string): Promise<DmConversation[]> {
  const rows = (await db.execute(sql`
    with mine as (
      select d.*, case when d.from_id = ${me} then d.to_id else d.from_id end as other
      from ${directMessages} d where (d.from_id = ${me} or d.to_id = ${me}) and not d.deleted
    ),
    latest as (select distinct on (other) * from mine order by other, id desc)
    select l.id, l.from_id, l.text, l.sticker, l.created_at, l.other, u.username, u.profile_image_url, u.last_seen_at,
      (select count(*)::int from ${directMessages} x where x.to_id = ${me} and x.from_id = l.other and x.read_at is null and not x.deleted) as unread
    from latest l join ${users} u on u.id = l.other
    where not u.banned
    order by l.id desc limit 100
  `)).rows as Record<string, any>[];
  return rows.map((r) => ({
    username: r.username, avatarUrl: r.profile_image_url ?? null, online: isOnline(r.other, r.last_seen_at),
    last: { text: r.text, sticker: r.sticker, mine: r.from_id === me, at: new Date(r.created_at).toISOString() },
    unread: r.unread,
  }));
}

// ---------------- Admin views ----------------

async function reportedProfiles() {
  const rows = (await db.execute(sql`
    select r.user_id, u.username, u.profile_image_url, u.muted_until, u.banned,
      count(*)::int as reporters, max(r.created_at) as last_at,
      (array_agg(r.reason order by r.created_at desc) filter (where r.reason is not null and r.reason <> ''))[1:3] as reasons
    from ${profileReports} r join ${users} u on u.id = r.user_id
    group by r.user_id, u.username, u.profile_image_url, u.muted_until, u.banned
    order by max(r.created_at) desc limit 100
  `)).rows as Record<string, any>[];
  return rows.map((r) => ({
    userId: r.user_id, username: r.username, avatarUrl: r.profile_image_url ?? null, reporters: r.reporters,
    reasons: r.reasons ?? [], lastAt: new Date(r.last_at).toISOString(),
    mutedUntil: r.muted_until ? new Date(r.muted_until).toISOString() : null, banned: !!r.banned,
  }));
}

async function reportedMessages() {
  const reported = (await db.execute(sql`
    select m.id, m.from_id, m.to_id, m.text, m.sticker, m.created_at, m.deleted,
      f.username as from_name, f.profile_image_url as from_avatar, f.muted_until, f.banned, t.username as to_name,
      count(r.id)::int as reports, max(r.created_at) as last_at,
      (array_agg(r.reason order by r.created_at desc) filter (where r.reason is not null and r.reason <> ''))[1:3] as reasons
    from ${dmReports} r join ${directMessages} m on m.id = r.message_id
    left join ${users} f on f.id = m.from_id left join ${users} t on t.id = m.to_id
    group by m.id, f.username, f.profile_image_url, f.muted_until, f.banned, t.username
    order by max(r.created_at) desc limit 50
  `)).rows as Record<string, any>[];
  const out = [];
  for (const m of reported) {
    // The five messages before it in the same conversation, for context (oldest first)
    const before = await db.select().from(directMessages)
      .where(and(between(m.from_id, m.to_id), lt(directMessages.id, m.id)))
      .orderBy(desc(directMessages.id)).limit(5);
    const name = (id: string) => (id === m.from_id ? m.from_name : m.to_name);
    out.push({
      id: m.id, fromId: m.from_id, fromName: m.from_name ?? "?", fromAvatar: m.from_avatar ?? null, toName: m.to_name ?? "?",
      text: m.text, sticker: m.sticker, createdAt: new Date(m.created_at).toISOString(), deleted: !!m.deleted,
      reports: m.reports, reasons: m.reasons ?? [], lastAt: new Date(m.last_at).toISOString(),
      mutedUntil: m.muted_until ? new Date(m.muted_until).toISOString() : null, banned: !!m.banned,
      context: before.reverse().map((c) => ({ id: c.id, from: name(c.fromId) ?? "?", text: c.text, sticker: c.sticker, createdAt: c.createdAt.toISOString(), deleted: c.deleted })),
    });
  }
  return out;
}

// ---------------- Routes ----------------

const reasonSchema = z.object({ reason: z.string().trim().max(200).optional() });

export function registerSocialRoutes(app: Express, requireUser: Mw, requireAdmin: Mw) {
  // ---- Photos ----
  app.post(AVATAR_ROUTE, express.json({ limit: "300kb" }), requireUser, async (req, res) => {
    const u: User = res.locals.user;
    const no = speakerRefusal(u);
    if (no) return res.status(no.status).json({ message: no.message });
    if (photoChangesLeft(u.id) <= 0 && !u.isAdmin) return res.status(429).json({ message: "Too many photo changes today" });
    const photo = decodePhoto(req.body?.photo);
    if ("error" in photo) return res.status(400).json({ message: photo.error });
    const at = new Date();
    const key = randomBytes(16).toString("hex");
    await db.insert(userAvatars).values({ userId: u.id, key, data: photo.data, mime: photo.mime, updatedAt: at })
      .onConflictDoUpdate({ target: userAvatars.userId, set: { key, data: photo.data, mime: photo.mime, updatedAt: at } });
    const url = `/api/avatar/${key}`;
    await db.update(users).set({ profileImageUrl: url }).where(eq(users.id, u.id));
    countPhotoChange(u.id);
    res.json({ profileImageUrl: url });
  });

  app.delete(AVATAR_ROUTE, requireUser, async (_req, res) => {
    const u: User = res.locals.user;
    if (photoChangesLeft(u.id) <= 0 && !u.isAdmin) return res.status(429).json({ message: "Too many photo changes today" });
    if (u.profileImageUrl) countPhotoChange(u.id);
    await removePhoto(u.id);
    res.json({ profileImageUrl: null });
  });

  // Public: every upload gets a new random key, so a photo's URL never changes and can be cached for a year
  app.get("/api/avatar/:key", async (req, res) => {
    const key = String(req.params.key);
    if (!/^[0-9a-f]{32}$/.test(key)) return res.status(404).json({ message: "Not found" });
    const [a] = await db.select().from(userAvatars).where(eq(userAvatars.key, key));
    if (!a) return res.status(404).json({ message: "Not found" });
    const etag = `"${key}"`;
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", etag);
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.type(a.mime).send(a.data);
  });

  // ---- Profiles ----
  app.get("/api/players/:username/profile", requireUser, async (req, res) => {
    const u = await findPlayer(req.params.username);
    if (!u) return res.status(404).json({ message: "Player not found" });
    res.json(await profileOf(u, res.locals.user));
  });

  app.post("/api/players/:username/report", requireUser, async (req, res) => {
    const me: User = res.locals.user;
    const parsed = reasonSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const u = await findPlayer(req.params.username);
    if (!u) return res.status(404).json({ message: "Player not found" });
    if (u.id === me.id) return res.status(400).json({ message: "Not on yourself" });
    await db.insert(profileReports).values({ userId: u.id, reporterId: me.id, reason: parsed.data.reason || null }).onConflictDoNothing();
    res.json({ ok: true });
  });

  // ---- Blocks ----
  app.post("/api/players/:username/block", requireUser, async (req, res) => {
    const me: User = res.locals.user;
    const block = req.body?.block;
    if (typeof block !== "boolean") return res.status(400).json({ message: "Bad request" });
    const u = await findPlayer(req.params.username);
    if (!u) return res.status(404).json({ message: "Player not found" });
    if (u.id === me.id) return res.status(400).json({ message: "Not on yourself" });
    if (block) await db.insert(userBlocks).values({ blockerId: me.id, blockedId: u.id }).onConflictDoNothing();
    else await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, u.id)));
    res.json({ blocked: block });
  });

  // ---- Private messages ----
  app.get("/api/dm/unread", requireUser, async (_req, res) => {
    res.json({ total: await unreadTotal(res.locals.user.id) });
  });

  app.get("/api/dm/conversations", requireUser, async (_req, res) => {
    res.json({ conversations: await conversations(res.locals.user.id) });
  });

  app.get("/api/dm/thread/:username", requireUser, async (req, res) => {
    const me: User = res.locals.user;
    const u = await findPlayer(req.params.username);
    if (!u || u.id === me.id) return res.status(404).json({ message: "Player not found" });
    const after = Number(req.query.after), before = Number(req.query.before);
    const base = and(between(me.id, u.id), eq(directMessages.deleted, false));
    let rows;
    let more = false;
    if (Number.isInteger(after) && after > 0) {
      rows = await db.select().from(directMessages).where(and(base, gt(directMessages.id, after))).orderBy(directMessages.id).limit(200);
    } else {
      const page = await db.select().from(directMessages)
        .where(Number.isInteger(before) && before > 0 ? and(base, lt(directMessages.id, before)) : base)
        .orderBy(desc(directMessages.id)).limit(DM_PAGE + 1);
      more = page.length > DM_PAGE;
      rows = page.slice(0, DM_PAGE).reverse();
    }
    // Which of my messages they've read (read ticks), so screens showing older ones can update
    const [seen] = await db.select({ id: sql<number>`max(${directMessages.id})` }).from(directMessages)
      .where(and(eq(directMessages.fromId, me.id), eq(directMessages.toId, u.id), sql`${directMessages.readAt} is not null`));
    const blocks = await blockState(me.id, u.id);
    const thread: DmThread & { readUpTo: number } = {
      peer: { username: u.username, avatarUrl: u.profileImageUrl, online: isOnline(u.id, u.lastSeenAt) },
      messages: rows.map((m) => toDm(m, me.id)),
      more,
      cantMessage: blocks.either,
      blockedByYou: blocks.byMe,
      readUpTo: seen?.id ?? 0,
    };
    res.json(thread);
  });

  app.post("/api/dm/send", requireUser, async (req, res) => {
    const me: User = res.locals.user;
    const no = speakerRefusal(me);
    if (no) return res.status(no.status).json({ message: no.message, until: no.until });
    const to = await findPlayer(req.body?.to);
    if (!to) return res.status(404).json({ message: "Player not found" });
    if (to.id === me.id) return res.status(400).json({ message: "You can't message yourself" });
    if ((await blockState(me.id, to.id)).either) return res.status(403).json({ message: CANT_MESSAGE });
    const early = dmPace.check(me, null);
    if (early) return res.status(early.status).json({ message: early.message });
    const msg = await readMessage(me, req.body, DM_MAX_LEN);
    if ("status" in msg) return res.status(msg.status).json({ message: msg.message });
    const again = msg.text ? dmPace.check(me, msg.text) : null;
    if (again) return res.status(again.status).json({ message: again.message });
    dmPace.record(me, msg.text);
    const [m] = await db.insert(directMessages).values({ fromId: me.id, toId: to.id, text: msg.text, sticker: msg.sticker }).returning();
    res.json(toDm(m, me.id));
  });

  app.post("/api/dm/read", requireUser, async (req, res) => {
    const me: User = res.locals.user;
    const u = await findPlayer(req.body?.with);
    if (!u) return res.status(404).json({ message: "Player not found" });
    await db.update(directMessages).set({ readAt: new Date() })
      .where(and(eq(directMessages.fromId, u.id), eq(directMessages.toId, me.id), isNull(directMessages.readAt)));
    res.json({ total: await unreadTotal(me.id) });
  });

  app.post("/api/dm/:id/report", requireUser, async (req, res) => {
    const me: User = res.locals.user;
    const id = Number(req.params.id);
    const parsed = reasonSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ message: "Bad request" });
    const [m] = await db.select().from(directMessages).where(eq(directMessages.id, id));
    // Only the player it was sent to can report it (nobody else may see it)
    if (!m || m.toId !== me.id) return res.status(404).json({ message: "Not found" });
    await db.insert(dmReports).values({ messageId: id, reporterId: me.id, reason: parsed.data.reason || null }).onConflictDoNothing();
    res.json({ ok: true });
  });

  // ---- Admin ----
  app.get("/api/admin/social/reports", requireAdmin, async (_req, res) => {
    res.json({ profiles: await reportedProfiles(), messages: await reportedMessages() });
  });

  app.post("/api/admin/social/photo/:userId/remove", requireAdmin, async (req, res) => {
    const id = String(req.params.userId);
    await removePhoto(id);
    await db.delete(profileReports).where(eq(profileReports.userId, id));
    res.json({ ok: true });
  });

  app.post("/api/admin/social/profile/:userId/dismiss", requireAdmin, async (req, res) => {
    await db.delete(profileReports).where(eq(profileReports.userId, String(req.params.userId)));
    res.json({ ok: true });
  });

  app.post("/api/admin/social/dm/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const action = req.body?.action;
    if (!Number.isInteger(id) || (action !== "delete" && action !== "dismiss")) return res.status(400).json({ message: "Bad request" });
    if (action === "delete") await db.update(directMessages).set({ deleted: true }).where(eq(directMessages.id, id));
    await db.delete(dmReports).where(eq(dmReports.messageId, id));
    res.json({ ok: true });
  });
}

/** Everything social a player leaves behind, removed with their account (inside its transaction) */
export async function deleteSocialData(tx: Tx, userId: string) {
  const theirs = tx.select({ id: directMessages.id }).from(directMessages)
    .where(or(eq(directMessages.fromId, userId), eq(directMessages.toId, userId)));
  await tx.delete(dmReports).where(or(eq(dmReports.reporterId, userId), inArray(dmReports.messageId, theirs)));
  await tx.delete(directMessages).where(or(eq(directMessages.fromId, userId), eq(directMessages.toId, userId)));
  await tx.delete(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
  await tx.delete(profileReports).where(or(eq(profileReports.userId, userId), eq(profileReports.reporterId, userId)));
  await tx.delete(userAvatars).where(eq(userAvatars.userId, userId));
}
