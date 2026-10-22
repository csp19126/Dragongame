/**
 * Community: the chat room, the sticker album, inviting friends, and the admin tools
 * that keep it clean (delete, mute, ban, announcement).
 */
import type { Express, Request, Response, NextFunction } from "express";
import { randomInt } from "crypto";
import { z } from "zod";
import { db } from "./db";
import {
  users, deposits, chatMessages, chatReports, userStickers, stickerRewards, appSettings, poolMatches, userSocial, type User,
} from "@shared/schema";
import {
  STICKERS, STICKER_BY_ID, STICKER_SETS, RARITY_WEIGHT, PACK_SIZE, FREE_PACK_COOLDOWN_MS, PLAY_PACK_EVERY,
  GIFTS_PER_DAY, TRADE_IN, ALBUM_REWARD, REFERRAL_WELCOME, REFERRAL_REWARD, REFERRAL_GAMES_NEEDED, REFERRAL_MAX_PAID,
  type AlbumView, type Sticker,
} from "@shared/stickers";
import { CHAT_COOLDOWN_MS, CHAT_MIN_GAMES, CHAT_AUTO_HIDE_REPORTS } from "@shared/chat";
import { speakerRefusal, paceLimiter, readMessage } from "./speech";
import { findMentions, isReaction, quote, type ReactionCount, type ReplyRef } from "@shared/friends";
import { notifyChat, notifyReaction, blockedEither } from "./friends";
import { reactionsFor, reactAllowed, toggleReaction } from "./social";
import { pushAll, disconnect } from "./hub";
import { and, desc, eq, gt, gte, lt, isNull, or, sql, count, inArray } from "drizzle-orm";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ANNOUNCEMENT_KEY = "announcement";
const TOTAL_WEIGHT = STICKERS.reduce((t, s) => t + RARITY_WEIGHT[s.rarity], 0);

/** One sticker, weighted by rarity, from the crypto random generator */
export function drawSticker(): Sticker {
  let r = randomInt(TOTAL_WEIGHT);
  for (const s of STICKERS) {
    r -= RARITY_WEIGHT[s.rarity];
    if (r < 0) return s;
  }
  return STICKERS[0];
}

// Per-player limits held in memory (one server; they reset on a redeploy, which is harmless)
const chatPace = paceLimiter(CHAT_COOLDOWN_MS);
const gifts = new Map<string, { day: string; n: number }>();
const today = () => new Date().toISOString().slice(0, 10);
function giftsLeft(userId: string) {
  const g = gifts.get(userId);
  return g && g.day === today() ? Math.max(0, GIFTS_PER_DAY - g.n) : GIFTS_PER_DAY;
}

async function credit(tx: Tx, userId: string, amount: number, method: string) {
  const [u] = await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId)).returning();
  await tx.insert(deposits).values({ userId, amount, method });
  return u;
}

async function addStickers(tx: Tx, userId: string, ids: string[]) {
  for (const id of ids) {
    await tx.insert(userStickers).values({ userId, stickerId: id, count: 1 })
      .onConflictDoUpdate({ target: [userStickers.userId, userStickers.stickerId], set: { count: sql`${userStickers.count} + 1` } });
  }
}

// ---------------- Album ----------------

export async function albumView(user: User): Promise<AlbumView> {
  const rows = await db.select().from(userStickers).where(eq(userStickers.userId, user.id));
  const claimed = await db.select({ setId: stickerRewards.setId }).from(stickerRewards).where(eq(stickerRewards.userId, user.id));
  const freeAt = user.lastFreePackAt ? new Date(user.lastFreePackAt.getTime() + FREE_PACK_COOLDOWN_MS) : null;
  return {
    owned: Object.fromEntries(rows.filter((r) => r.count > 0).map((r) => [r.stickerId, r.count])),
    claimedSets: claimed.map((c) => c.setId),
    packs: {
      free: !freeAt || freeAt.getTime() <= Date.now(),
      freeAt: freeAt && freeAt.getTime() > Date.now() ? freeAt.toISOString() : null,
      play: Math.max(0, Math.floor(user.gamesPlayed / PLAY_PACK_EVERY) - user.playPacksOpened),
      bonus: user.bonusPacks,
      nextPlayIn: PLAY_PACK_EVERY - (user.gamesPlayed % PLAY_PACK_EVERY),
    },
    giftsLeft: giftsLeft(user.id),
  };
}

/** Opens a pack the player has, or returns null if they don't have that kind */
export async function openPack(userId: string, kind: "free" | "play" | "bonus") {
  return db.transaction(async (tx) => {
    let used;
    if (kind === "free") {
      const cutoff = new Date(Date.now() - FREE_PACK_COOLDOWN_MS);
      [used] = await tx.update(users).set({ lastFreePackAt: new Date() })
        .where(and(eq(users.id, userId), or(isNull(users.lastFreePackAt), lt(users.lastFreePackAt, cutoff)))).returning({ id: users.id });
    } else if (kind === "play") {
      [used] = await tx.update(users).set({ playPacksOpened: sql`${users.playPacksOpened} + 1` })
        .where(and(eq(users.id, userId), sql`${users.playPacksOpened} < ${users.gamesPlayed} / ${PLAY_PACK_EVERY}`)).returning({ id: users.id });
    } else {
      [used] = await tx.update(users).set({ bonusPacks: sql`${users.bonusPacks} - 1` })
        .where(and(eq(users.id, userId), gt(users.bonusPacks, 0))).returning({ id: users.id });
    }
    if (!used) return null;
    const before = await tx.select().from(userStickers).where(eq(userStickers.userId, userId));
    const had = new Set(before.filter((r) => r.count > 0).map((r) => r.stickerId));
    const drawn = Array.from({ length: PACK_SIZE }, drawSticker);
    await addStickers(tx, userId, drawn.map((s) => s.id));
    const seen = new Set<string>();
    return drawn.map((s) => {
      const isNew = !had.has(s.id) && !seen.has(s.id);
      seen.add(s.id);
      return { id: s.id, isNew };
    });
  });
}

/** Pays a completed set (or "album" for the whole book) once */
export async function claimSet(userId: string, setId: string) {
  const isAlbum = setId === "album";
  const set = STICKER_SETS.find((s) => s.id === setId);
  if (!isAlbum && !set) return { error: "No such set" } as const;
  const need = STICKERS.filter((s) => isAlbum || s.set === setId).map((s) => s.id);
  const reward = isAlbum ? ALBUM_REWARD : set!.reward;
  return db.transaction(async (tx) => {
    const have = await tx.select({ id: userStickers.stickerId }).from(userStickers)
      .where(and(eq(userStickers.userId, userId), inArray(userStickers.stickerId, need), gt(userStickers.count, 0)));
    if (have.length < need.length) return { error: "Set not complete yet" } as const;
    const [paid] = await tx.insert(stickerRewards).values({ userId, setId }).onConflictDoNothing().returning();
    if (!paid) return { error: "Already claimed" } as const;
    const u = await credit(tx, userId, reward, isAlbum ? "sticker_album" : "sticker_set");
    return { reward, balance: u.balance };
  });
}

/** Swaps TRADE_IN spare stickers (commonest first) for one bonus pack */
export async function tradeIn(userId: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(userStickers).where(and(eq(userStickers.userId, userId), gt(userStickers.count, 1)));
    const order = ["common", "rare", "epic", "legendary"];
    rows.sort((a, b) => order.indexOf(STICKER_BY_ID.get(a.stickerId)?.rarity ?? "common") - order.indexOf(STICKER_BY_ID.get(b.stickerId)?.rarity ?? "common") || b.count - a.count);
    let left = TRADE_IN;
    const take: { id: string; n: number }[] = [];
    for (const r of rows) {
      if (!left) break;
      const n = Math.min(left, r.count - 1);
      take.push({ id: r.stickerId, n });
      left -= n;
    }
    if (left) return { error: `You need ${TRADE_IN} spare stickers` } as const;
    for (const t of take) {
      await tx.update(userStickers).set({ count: sql`${userStickers.count} - ${t.n}` })
        .where(and(eq(userStickers.userId, userId), eq(userStickers.stickerId, t.id)));
    }
    await tx.update(users).set({ bonusPacks: sql`${users.bonusPacks} + 1` }).where(eq(users.id, userId));
    return { traded: take };
  });
}

/** Gives one spare copy of a sticker to another player (the giver always keeps one) */
export async function giftSticker(from: User, toName: string, stickerId: string) {
  if (!STICKER_BY_ID.has(stickerId)) return { error: "No such sticker" } as const;
  if (giftsLeft(from.id) <= 0) return { error: "No gifts left today" } as const;
  const [to] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${toName.trim()})`);
  if (!to || to.banned) return { error: "Player not found" } as const;
  if (to.id === from.id) return { error: "You can't gift yourself" } as const;
  const r = await db.transaction(async (tx) => {
    const [took] = await tx.update(userStickers).set({ count: sql`${userStickers.count} - 1` })
      .where(and(eq(userStickers.userId, from.id), eq(userStickers.stickerId, stickerId), gte(userStickers.count, 2))).returning();
    if (!took) return { error: "You need a spare one to gift" } as const;
    await addStickers(tx, to.id, [stickerId]);
    return { to: to.username };
  });
  if (!("error" in r)) {
    const g = gifts.get(from.id);
    gifts.set(from.id, g && g.day === today() ? { day: g.day, n: g.n + 1 } : { day: today(), n: 1 });
  }
  return r;
}

// ---------------- Invite a friend ----------------

/** Links a new account to the player who invited it and pays the welcome bonus */
export async function applyReferral(newUserId: string, ref: unknown) {
  if (typeof ref !== "string" || !ref.trim() || ref.length > 40) return false;
  const [inviter] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${ref.trim()})`);
  if (!inviter || inviter.banned || inviter.id === newUserId) return false;
  await db.transaction(async (tx) => {
    const [linked] = await tx.update(users).set({ referredBy: inviter.id })
      .where(and(eq(users.id, newUserId), isNull(users.referredBy))).returning({ id: users.id });
    if (linked) await credit(tx, newUserId, REFERRAL_WELCOME, "referral_welcome");
  });
  return true;
}

async function referralView(user: User) {
  const friends = await db.select({ username: users.username, gamesPlayed: users.gamesPlayed, paid: users.referralPaid, createdAt: users.createdAt })
    .from(users).where(eq(users.referredBy, user.id)).orderBy(desc(users.createdAt)).limit(200);
  const paid = friends.filter((f) => f.paid).length;
  const ready = friends.filter((f) => !f.paid && f.gamesPlayed >= REFERRAL_GAMES_NEEDED).length;
  return {
    code: user.username,
    welcome: REFERRAL_WELCOME,
    reward: REFERRAL_REWARD,
    gamesNeeded: REFERRAL_GAMES_NEEDED,
    maxPaid: REFERRAL_MAX_PAID,
    paid,
    claimable: Math.max(0, Math.min(ready, REFERRAL_MAX_PAID - paid)),
    friends: friends.map((f) => ({ username: f.username, gamesPlayed: f.gamesPlayed, paid: f.paid })),
  };
}

/** Pays the inviter for every invited friend who has now played enough (plus a bonus sticker pack each) */
export async function claimReferrals(userId: string) {
  return db.transaction(async (tx) => {
    // Lock the inviter's row so two taps can't both pay
    await tx.execute(sql`select id from users where id = ${userId} for update`);
    const [{ n: alreadyPaid }] = await tx.select({ n: count() }).from(users).where(and(eq(users.referredBy, userId), eq(users.referralPaid, true)));
    const room = REFERRAL_MAX_PAID - alreadyPaid;
    if (room <= 0) return { paid: 0, amount: 0 };
    const ready = await tx.select({ id: users.id }).from(users)
      .where(and(eq(users.referredBy, userId), eq(users.referralPaid, false), gte(users.gamesPlayed, REFERRAL_GAMES_NEEDED)))
      .limit(room);
    if (!ready.length) return { paid: 0, amount: 0 };
    await tx.update(users).set({ referralPaid: true }).where(inArray(users.id, ready.map((r) => r.id)));
    const amount = ready.length * REFERRAL_REWARD;
    const u = await credit(tx, userId, amount, "referral");
    await tx.update(users).set({ bonusPacks: sql`${users.bonusPacks} + ${ready.length}` }).where(eq(users.id, userId));
    return { paid: ready.length, amount, balance: u.balance };
  });
}

// ---------------- Chat ----------------

type ChatOut = {
  id: number; username: string; text: string | null; sticker: string | null; createdAt: Date; admin: boolean | null; avatar: string | null;
  level: number; reply: ReplyRef | null; reactions: ReactionCount[];
};

async function chatRows(where: ReturnType<typeof and> | undefined, limit: number, newestFirst: boolean, viewer: string): Promise<ChatOut[]> {
  const rows = await db.select({
    id: chatMessages.id, username: chatMessages.username, text: chatMessages.text, sticker: chatMessages.sticker, replyTo: chatMessages.replyTo,
    createdAt: chatMessages.createdAt, admin: users.isAdmin, avatar: users.profileImageUrl, level: userSocial.level,
  }).from(chatMessages).leftJoin(users, eq(users.id, chatMessages.userId)).leftJoin(userSocial, eq(userSocial.userId, chatMessages.userId))
    .where(where).orderBy(newestFirst ? desc(chatMessages.id) : chatMessages.id).limit(limit);
  return withExtras(rows, viewer);
}

/** Adds the quoted message (if it's still visible) and the reactions to chat rows */
async function withExtras(rows: { id: number; username: string; text: string | null; sticker: string | null; replyTo: number | null; createdAt: Date; admin: boolean | null; avatar: string | null; level: number | null }[], viewer: string): Promise<ChatOut[]> {
  const replyIds = [...new Set(rows.map((r) => r.replyTo).filter((x): x is number => !!x))];
  const quoted = new Map((replyIds.length ? await db.select().from(chatMessages).where(inArray(chatMessages.id, replyIds)) : []).map((r) => [r.id, r]));
  const reactions = await reactionsFor("chat", rows.map((r) => r.id), viewer);
  return rows.map(({ replyTo, level, ...r }) => {
    const q = replyTo ? quoted.get(replyTo) : undefined;
    const reply: ReplyRef | null = replyTo ? (q && !q.deleted ? { id: q.id, username: q.username, text: quote(q.text), sticker: q.sticker } : { id: replyTo, username: null, text: null, sticker: null }) : null;
    return { ...r, level: level ?? 1, reply, reactions: reactions.get(r.id) ?? [] };
  });
}

export async function getAnnouncement(): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, ANNOUNCEMENT_KEY));
  return row?.value || null;
}

export async function communityStats() {
  const dayAgo = new Date(Date.now() - 86_400_000), weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  return {
    activeToday: await one(db.select({ n: count() }).from(users).where(gt(users.lastSeenAt, dayAgo))),
    activeWeek: await one(db.select({ n: count() }).from(users).where(gt(users.lastSeenAt, weekAgo))),
    newUsersWeek: await one(db.select({ n: count() }).from(users).where(gt(users.createdAt, weekAgo))),
    chatToday: await one(db.select({ n: count() }).from(chatMessages).where(gt(chatMessages.createdAt, dayAgo))),
    poolToday: await one(db.select({ n: count() }).from(poolMatches).where(gt(poolMatches.createdAt, dayAgo))),
    invitedPlayers: await one(db.select({ n: count() }).from(users).where(sql`${users.referredBy} is not null`)),
    mutedOrBanned: await one(db.select({ n: count() }).from(users).where(or(eq(users.banned, true), gt(users.mutedUntil, new Date())))),
  };
}

export function registerCommunityRoutes(app: Express, requireUser: Mw, requireAdmin: Mw) {
  // ---- Album ----
  app.get("/api/stickers", requireUser, async (_req, res) => {
    res.json(await albumView(res.locals.user));
  });

  app.post("/api/stickers/open", requireUser, async (req, res) => {
    const kind = req.body?.kind;
    if (kind !== "free" && kind !== "play" && kind !== "bonus") return res.status(400).json({ message: "Which pack?" });
    const got = await openPack(res.locals.user.id, kind);
    if (!got) return res.status(409).json({ message: "No pack of that kind to open" });
    res.json({ stickers: got });
  });

  app.post("/api/stickers/claim", requireUser, async (req, res) => {
    const r = await claimSet(res.locals.user.id, String(req.body?.set ?? ""));
    if ("error" in r) return res.status(400).json({ message: r.error });
    res.json(r);
  });

  app.post("/api/stickers/trade", requireUser, async (_req, res) => {
    const r = await tradeIn(res.locals.user.id);
    if ("error" in r) return res.status(400).json({ message: r.error });
    res.json(r);
  });

  app.post("/api/stickers/gift", requireUser, async (req, res) => {
    const to = req.body?.to, sticker = req.body?.sticker;
    if (typeof to !== "string" || typeof sticker !== "string") return res.status(400).json({ message: "Who and which sticker?" });
    const r = await giftSticker(res.locals.user, to, sticker);
    if ("error" in r) return res.status(400).json({ message: r.error });
    res.json(r);
  });

  // ---- Invite a friend ----
  app.get("/api/referrals", requireUser, async (_req, res) => {
    res.json(await referralView(res.locals.user));
  });

  app.post("/api/referrals/claim", requireUser, async (_req, res) => {
    res.json(await claimReferrals(res.locals.user.id));
  });

  // ---- Chat ----
  app.get("/api/announcement", async (_req, res) => {
    res.json({ text: await getAnnouncement() });
  });

  app.get("/api/chat", requireUser, async (req, res) => {
    const after = Number(req.query.after);
    const u0: User = res.locals.user;
    const messages = Number.isInteger(after) && after > 0
      ? await chatRows(and(gt(chatMessages.id, after), eq(chatMessages.deleted, false)), 100, false, u0.id)
      : (await chatRows(eq(chatMessages.deleted, false), 60, true, u0.id)).reverse();
    // Messages removed lately, so screens that already show them can drop them
    const removed = await db.select({ id: chatMessages.id }).from(chatMessages)
      .where(and(eq(chatMessages.deleted, true), gt(chatMessages.createdAt, new Date(Date.now() - 6 * 3600_000))))
      .orderBy(desc(chatMessages.id)).limit(200);
    const u: User = res.locals.user;
    res.json({
      messages,
      removed: removed.map((r) => r.id),
      me: {
        mutedUntil: u.mutedUntil && u.mutedUntil.getTime() > Date.now() ? u.mutedUntil.toISOString() : null,
        gamesToUnlock: Math.max(0, CHAT_MIN_GAMES - u.gamesPlayed),
      },
    });
  });

  app.post("/api/chat", requireUser, async (req, res) => {
    const u: User = res.locals.user;
    const no = speakerRefusal(u);
    if (no) return res.status(no.status).json({ message: no.message, until: no.until });
    const early = chatPace.check(u, null);
    if (early) return res.status(early.status).json({ message: early.message });
    const msg = await readMessage(u, req.body);
    if ("status" in msg) return res.status(msg.status).json({ message: msg.message });
    // A reply must answer a message that's still in the room
    let replyAuthor: string | null = null;
    let replyTo: number | null = null;
    if (req.body?.replyTo !== undefined && req.body?.replyTo !== null) {
      const id = Number(req.body.replyTo);
      const [orig] = Number.isInteger(id) ? await db.select().from(chatMessages).where(and(eq(chatMessages.id, id), eq(chatMessages.deleted, false))) : [];
      if (!orig) return res.status(400).json({ message: "That message can't be answered" });
      replyTo = id;
      replyAuthor = orig.userId;
    }
    const again = msg.text ? chatPace.check(u, msg.text) : null;
    if (again) return res.status(again.status).json({ message: again.message });
    chatPace.record(u, msg.text);
    const [m] = await db.insert(chatMessages).values({ userId: u.id, username: u.username, text: msg.text, sticker: msg.sticker, replyTo }).returning();
    const [lvl] = await db.select({ level: userSocial.level }).from(userSocial).where(eq(userSocial.userId, u.id));
    const [out] = await withExtras([{ id: m.id, username: m.username, text: m.text, sticker: m.sticker, replyTo, createdAt: m.createdAt, admin: u.isAdmin, avatar: u.profileImageUrl, level: lvl?.level ?? 1 }], u.id);
    // Everyone with the app open sees it at once (screens skip ids they already have)
    pushAll({ t: "chat", m: out });
    res.json(out);
    // Bells for the replied-to player and anyone @mentioned (real players only, not across a block)
    void notifyChat(u, m.id, m.text, m.text ? findMentions(m.text, req.body?.mentions) : [], replyAuthor).catch((e) => console.error("[chat notify]", e));
  });

  app.post("/api/chat/:id/react", requireUser, async (req, res) => {
    const u: User = res.locals.user;
    const id = Number(req.params.id);
    const emoji = req.body?.emoji;
    if (!Number.isInteger(id) || !isReaction(emoji)) return res.status(400).json({ message: "Bad request" });
    const no = speakerRefusal(u);
    if (no) return res.status(no.status).json({ message: no.message, until: no.until });
    const [m] = await db.select().from(chatMessages).where(and(eq(chatMessages.id, id), eq(chatMessages.deleted, false)));
    if (!m) return res.status(404).json({ message: "Not found" });
    if (!reactAllowed(u.id)) return res.status(429).json({ message: "slow_down" });
    const on = await toggleReaction("chat", id, u.id, emoji);
    pushAll({ t: "react", scope: "chat", id, e: emoji, by: u.username, on });
    if (on && m.userId !== u.id && !(await blockedEither(u.id, m.userId))) await notifyReaction(m.userId, u.id, "chat", id, quote(m.text), emoji);
    res.json({ on, reactions: (await reactionsFor("chat", [id], u.id)).get(id) ?? [] });
  });

  app.post("/api/chat/:id/report", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Bad id" });
    const [m] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    if (!m) return res.status(404).json({ message: "Not found" });
    if (m.userId === res.locals.user.id) return res.status(400).json({ message: "That's your own message" });
    await db.insert(chatReports).values({ messageId: id, reporterId: res.locals.user.id }).onConflictDoNothing();
    const [{ n }] = await db.select({ n: count() }).from(chatReports).where(eq(chatReports.messageId, id));
    if (n >= CHAT_AUTO_HIDE_REPORTS) {
      await db.update(chatMessages).set({ deleted: true }).where(eq(chatMessages.id, id));
      pushAll({ t: "chat_removed", ids: [id] });
    }
    res.json({ ok: true });
  });

  // ---- Admin ----
  app.get("/api/admin/community/chat", requireAdmin, async (_req, res) => {
    const rows = await db.select({
      id: chatMessages.id, userId: chatMessages.userId, username: chatMessages.username, text: chatMessages.text,
      sticker: chatMessages.sticker, deleted: chatMessages.deleted, createdAt: chatMessages.createdAt,
      reports: sql<number>`(select count(*)::int from ${chatReports} where ${chatReports.messageId} = ${chatMessages.id})`,
      mutedUntil: users.mutedUntil, banned: users.banned,
    }).from(chatMessages).leftJoin(users, eq(users.id, chatMessages.userId)).orderBy(desc(chatMessages.id)).limit(200);
    const restricted = await db.select({ id: users.id, username: users.username, mutedUntil: users.mutedUntil, banned: users.banned })
      .from(users).where(or(eq(users.banned, true), gt(users.mutedUntil, new Date()))).orderBy(users.username);
    res.json({ messages: rows, restricted, announcement: await getAnnouncement() });
  });

  app.post("/api/admin/community/chat/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const deleted = req.body?.deleted;
    if (!Number.isInteger(id) || typeof deleted !== "boolean") return res.status(400).json({ message: "Bad request" });
    await db.update(chatMessages).set({ deleted }).where(eq(chatMessages.id, id));
    if (!deleted) await db.delete(chatReports).where(eq(chatReports.messageId, id));
    else pushAll({ t: "chat_removed", ids: [id] });
    res.json({ ok: true });
  });

  const restrictSchema = z.object({ minutes: z.number().int().min(0).max(525_600).optional(), banned: z.boolean().optional() });
  app.post("/api/admin/community/users/:id", requireAdmin, async (req, res) => {
    const parsed = restrictSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const target = String(req.params.id);
    if (target === res.locals.user.id) return res.status(400).json({ message: "Not on yourself" });
    const set: Partial<User> = {};
    if (parsed.data.minutes !== undefined) set.mutedUntil = parsed.data.minutes ? new Date(Date.now() + parsed.data.minutes * 60_000) : null;
    if (parsed.data.banned !== undefined) set.banned = parsed.data.banned;
    const [u] = await db.update(users).set(set).where(eq(users.id, target)).returning({ id: users.id, mutedUntil: users.mutedUntil, banned: users.banned });
    if (!u) return res.status(404).json({ message: "No such player" });
    // A ban also hides everything they said today
    if (parsed.data.banned) {
      const hidden = await db.update(chatMessages).set({ deleted: true })
        .where(and(eq(chatMessages.userId, target), gt(chatMessages.createdAt, new Date(Date.now() - 86_400_000)))).returning({ id: chatMessages.id });
      if (hidden.length) pushAll({ t: "chat_removed", ids: hidden.map((h) => h.id) });
      disconnect(target);
    }
    res.json(u);
  });

  app.put("/api/admin/announcement", requireAdmin, async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 300) : "";
    if (!text) await db.delete(appSettings).where(eq(appSettings.key, ANNOUNCEMENT_KEY));
    else await db.insert(appSettings).values({ key: ANNOUNCEMENT_KEY, value: text })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: text, updatedAt: new Date() } });
    res.json({ text: text || null });
  });
}
