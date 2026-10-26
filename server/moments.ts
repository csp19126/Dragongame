/**
 * Moments (Khoảnh khắc): a public wall of short posts. A post can carry a sticker the player
 * owns or a "win card": the player picks one of their own recent big wins and the server copies
 * the real numbers from game_plays, so a win can't be made up. Likes, comments, mentions,
 * reports (3 hide a post until an admin looks) and live updates over the social socket.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { and, count, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import { users, userSocial, userBlocks, moments, momentLikes, momentComments, momentReports, gamePlays, type User } from "@shared/schema";
import {
  MOMENT_MAX_LEN, MOMENT_COMMENT_MAX, MOMENTS_PER_DAY, MOMENT_COOLDOWN_MS, MOMENT_COMMENT_COOLDOWN_MS, MOMENT_PAGE, WIN_CARD_DAYS,
  isBragWorthy, type MomentView, type MomentComment, type WinCard,
} from "@shared/social3";
import { checkChat, CHAT_AUTO_HIDE_REPORTS } from "@shared/chat";
import { findMentions, quote } from "@shared/friends";
import { speakerRefusal, paceLimiter, ownsSticker } from "./speech";
import { pushAll, push, connectedUsers } from "./hub";
import { notify, blockedEither, friendIdsOf } from "./friends";
import { reactAllowed } from "./social";
import { clubTagOf, clubOf, reportedClubMessages } from "./clubs";
import { questEvent } from "./quests";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const postPace = paceLimiter(MOMENT_COOLDOWN_MS);
const commentPace = paceLimiter(MOMENT_COMMENT_COOLDOWN_MS);

const blockedSql = (me: string) => sql`(select blocked_id from ${userBlocks} where blocker_id = ${me} union select blocker_id from ${userBlocks} where blocked_id = ${me})`;

type Row = Record<string, any>;
function toView(r: Row, viewer: string): MomentView {
  return {
    id: r.id,
    author: { username: r.username, avatarUrl: r.avatar ?? null, level: Number(r.level ?? 1), club: clubTagOf(r.user_id) },
    text: r.text ?? null, sticker: r.sticker ?? null,
    win: r.win ? { playId: r.play_id, ...r.win } as WinCard : null,
    likes: Number(r.likes), liked: !!r.liked, comments: Number(r.comments), mine: r.user_id === viewer, at: new Date(r.created_at).toISOString(),
  };
}

const momentSelect = (viewer: string, where: ReturnType<typeof sql>, order: ReturnType<typeof sql>, limit: number) => sql`
  select m.id, m.user_id, m.text, m.sticker, m.play_id, m.win, m.likes, m.comments, m.created_at,
    u.username, u.profile_image_url as avatar, coalesce(s.level, 1) as level,
    exists (select 1 from ${momentLikes} l where l.moment_id = m.id and l.user_id = ${viewer}) as liked
  from ${moments} m join ${users} u on u.id = m.user_id left join ${userSocial} s on s.user_id = m.user_id
  where not m.hidden and not u.banned and m.user_id not in ${blockedSql(viewer)} and ${where}
  order by ${order} limit ${limit}`;

export async function wall(viewer: string, scope: "all" | "friends" | "club", before?: number) {
  const conds = [sql`true`];
  if (scope === "friends") {
    const ids = [viewer, ...(await friendIdsOf(viewer))];
    conds.push(sql`m.user_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  } else if (scope === "club") {
    const c = clubOf(viewer);
    if (!c) return { items: [], more: false };
    conds.push(sql`m.user_id in (select user_id from club_members where club_id = ${c.id})`);
  }
  if (before && Number.isInteger(before)) conds.push(sql`m.id < ${before}`);
  const rows = (await db.execute(momentSelect(viewer, sql.join(conds, sql` and `), sql`m.id desc`, MOMENT_PAGE + 1))).rows as Row[];
  return { items: rows.slice(0, MOMENT_PAGE).map((r) => toView(r, viewer)), more: rows.length > MOMENT_PAGE };
}

async function momentById(id: number, viewer: string) {
  const [r] = (await db.execute(momentSelect(viewer, sql`m.id = ${id}`, sql`m.id`, 1))).rows as Row[];
  return r ? toView(r, viewer) : null;
}

/** Today's most-liked Moment (Vietnam day), from players who show up in the activity feed */
export async function topMomentToday(viewer: string) {
  const VN = 7 * 3600_000;
  const local = new Date(Date.now() + VN);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VN);
  const [r] = (await db.execute(momentSelect(viewer, sql`m.created_at >= ${start} and coalesce(s.show_in_feed, true)`, sql`m.likes desc, m.comments desc, m.id desc`, 1))).rows as Row[];
  return r ? toView(r, viewer) : null;
}

/** My recent wins that can go on a win card (and haven't yet) */
async function myWins(userId: string) {
  const since = new Date(Date.now() - WIN_CARD_DAYS * 86_400_000);
  const rows = await db.select().from(gamePlays)
    .where(and(eq(gamePlays.userId, userId), gt(gamePlays.createdAt, since), sql`${gamePlays.payout} > ${gamePlays.bet}`,
      sql`${gamePlays.id} not in (select play_id from ${moments} where play_id is not null)`))
    .orderBy(desc(sql`${gamePlays.payout} - ${gamePlays.bet}`)).limit(200);
  return rows.filter((p) => isBragWorthy(p.bet, p.payout)).slice(0, 20)
    .map((p): WinCard => ({ playId: p.id, game: p.game, bet: p.bet, payout: p.payout, at: p.createdAt.toISOString() }));
}

async function authorOf(userId: string) {
  const [r] = await db.select({ username: users.username, avatar: users.profileImageUrl, level: userSocial.level }).from(users).leftJoin(userSocial, eq(userSocial.userId, users.id)).where(eq(users.id, userId));
  return { username: r?.username ?? "?", avatarUrl: r?.avatar ?? null, level: r?.level ?? 1, club: clubTagOf(userId) };
}

/** Sends something to everyone online except players on either side of a block with `authorId` */
async function pushAround(authorId: string, msg: (viewer: string) => object) {
  const rows = await db.select({ a: userBlocks.blockerId, b: userBlocks.blockedId }).from(userBlocks).where(or(eq(userBlocks.blockerId, authorId), eq(userBlocks.blockedId, authorId)));
  const hide = new Set(rows.map((r) => (r.a === authorId ? r.b : r.a)));
  for (const uid of connectedUsers()) if (!hide.has(uid)) push(uid, msg(uid));
}

async function notifyMentions(author: User, text: string | null, picked: unknown, momentId: number, already: Set<string>) {
  if (!text) return;
  const names = findMentions(text, picked);
  if (!names.length) return;
  const found = await db.select({ id: users.id }).from(users).where(and(inArray(sql`lower(${users.username})`, names), eq(users.banned, false)));
  for (const u of found) {
    if (already.has(u.id) || u.id === author.id || (await blockedEither(author.id, u.id))) continue;
    already.add(u.id);
    await notify(u.id, "mention", author.id, { scope: "moment", momentId, snippet: quote(text) });
  }
}

const postSchema = z.object({
  text: z.string().max(1000).optional().nullable(),
  sticker: z.string().max(40).optional().nullable(),
  playId: z.number().int().positive().optional().nullable(),
  mentions: z.array(z.string()).max(10).optional(),
});

type Fail = { status: number; message: string };

export async function postMoment(u: User, body: unknown): Promise<MomentView | Fail> {
  const parsed = postSchema.safeParse(body ?? {});
  if (!parsed.success) return { status: 400, message: "Bad request" };
  const no = speakerRefusal(u);
  if (no) return { status: no.status, message: no.message };
  const early = postPace.check(u, null);
  if (early) return early;
  let text: string | null = null;
  if (parsed.data.text && parsed.data.text.trim()) {
    const c = checkChat(parsed.data.text, MOMENT_MAX_LEN);
    if (!c.ok) return { status: 400, message: c.reason };
    text = c.text;
  }
  let sticker: string | null = null;
  if (parsed.data.sticker) {
    if (!(await ownsSticker(u.id, parsed.data.sticker))) return { status: 400, message: "not_owned" };
    sticker = parsed.data.sticker;
  }
  let playId: number | null = null;
  let win: { game: string; bet: number; payout: number; at: string } | null = null;
  if (parsed.data.playId) {
    // The server reads the play itself: only the player's own, recent, real big win
    const [p] = await db.select().from(gamePlays).where(and(eq(gamePlays.id, parsed.data.playId), eq(gamePlays.userId, u.id)));
    if (!p || p.createdAt.getTime() < Date.now() - WIN_CARD_DAYS * 86_400_000 || !isBragWorthy(p.bet, p.payout)) return { status: 400, message: "That win can't be shared" };
    playId = p.id;
    win = { game: p.game, bet: p.bet, payout: p.payout, at: p.createdAt.toISOString() };
  }
  if (!text && !sticker && !win) return { status: 400, message: "empty" };
  const again = text ? postPace.check(u, text) : null;
  if (again) return again;
  const VN = 7 * 3600_000;
  const local = new Date(Date.now() + VN);
  const dayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VN);
  const [{ n }] = await db.select({ n: count() }).from(moments).where(and(eq(moments.userId, u.id), gt(moments.createdAt, dayStart)));
  if (n >= MOMENTS_PER_DAY && !u.isAdmin) return { status: 429, message: "You've posted enough Moments for today" };
  postPace.record(u, text);
  let m;
  try {
    [m] = await db.insert(moments).values({ userId: u.id, text, sticker, playId, win }).returning();
  } catch (e: any) {
    if (e?.code === "23505") return { status: 409, message: "You already shared this win" };
    throw e;
  }
  const view: MomentView = {
    id: m.id, author: await authorOf(u.id), text, sticker, win: win ? { playId: playId!, ...win } : null,
    likes: 0, liked: false, comments: 0, mine: true, at: m.createdAt.toISOString(),
  };
  await pushAround(u.id, (viewer) => ({ t: "moment", item: { ...view, mine: viewer === u.id } }));
  await questEvent(u.id, "moment", `moment:${m.id}`);
  void notifyMentions(u, text, parsed.data.mentions, m.id, new Set()).catch((e) => console.error("[moment mentions]", e));
  return view;
}

async function visibleMoment(id: number, viewer: string) {
  const [m] = await db.select().from(moments).where(and(eq(moments.id, id), eq(moments.hidden, false)));
  if (!m) return null;
  const [a] = await db.select({ banned: users.banned }).from(users).where(eq(users.id, m.userId));
  if (!a || a.banned || (await blockedEither(viewer, m.userId))) return null;
  return m;
}

async function commentsOf(momentId: number, viewer: string): Promise<MomentComment[]> {
  const rows = (await db.execute(sql`
    select c.id, c.user_id, c.text, c.created_at, u.username, u.profile_image_url as avatar, coalesce(s.level, 1) as level
    from ${momentComments} c join ${users} u on u.id = c.user_id left join ${userSocial} s on s.user_id = c.user_id
    where c.moment_id = ${momentId} and not c.hidden and not u.banned and c.user_id not in ${blockedSql(viewer)}
    order by c.id limit 200`)).rows as Row[];
  return rows.map((r) => ({ id: r.id, text: r.text, mine: r.user_id === viewer, at: new Date(r.created_at).toISOString(), author: { username: r.username, avatarUrl: r.avatar ?? null, level: Number(r.level), club: clubTagOf(r.user_id) } }));
}

export function registerMomentRoutes(app: Express, requireUser: Mw, requireAdmin: Mw) {
  const me = (res: Response) => res.locals.user as User;

  app.get("/api/moments", requireUser, async (req, res) => {
    const scope = req.query.scope === "friends" ? "friends" : req.query.scope === "club" ? "club" : "all";
    res.json(await wall(me(res).id, scope, Number(req.query.before) || undefined));
  });

  app.get("/api/moments/top", requireUser, async (_req, res) => {
    res.json({ item: await topMomentToday(me(res).id) });
  });

  app.get("/api/moments/wins", requireUser, async (_req, res) => {
    res.json({ wins: await myWins(me(res).id) });
  });

  app.post("/api/moments", requireUser, async (req, res) => {
    const r = await postMoment(me(res), req.body);
    if ("status" in r) return res.status(r.status).json({ message: r.message });
    res.json(r);
  });

  app.get("/api/moments/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    const m = Number.isInteger(id) ? await momentById(id, me(res).id) : null;
    if (!m) return res.status(404).json({ message: "Not found" });
    res.json(m);
  });

  app.delete("/api/moments/:id", requireUser, async (req, res) => {
    const u = me(res);
    const id = Number(req.params.id);
    const [m] = Number.isInteger(id) ? await db.select().from(moments).where(eq(moments.id, id)) : [];
    if (!m || m.userId !== u.id) return res.status(404).json({ message: "Not found" });
    await db.transaction((tx) => removeMoments(tx, [id]));
    pushAll({ t: "moment_removed", id });
    res.json({ ok: true });
  });

  app.post("/api/moments/:id/like", requireUser, async (req, res) => {
    const u = me(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Bad id" });
    const m = await visibleMoment(id, u.id);
    if (!m) return res.status(404).json({ message: "Not found" });
    if (u.mutedUntil && u.mutedUntil.getTime() > Date.now()) return res.status(403).json({ message: "muted" });
    if (!reactAllowed(u.id)) return res.status(429).json({ message: "slow_down" });
    const r = await db.transaction(async (tx) => {
      const [added] = await tx.insert(momentLikes).values({ momentId: id, userId: u.id }).onConflictDoNothing().returning();
      if (!added) await tx.delete(momentLikes).where(and(eq(momentLikes.momentId, id), eq(momentLikes.userId, u.id)));
      // Counted from the likes themselves, so the number can never drift
      const [row] = await tx.update(moments).set({ likes: sql`(select count(*)::int from ${momentLikes} where moment_id = ${id})` }).where(eq(moments.id, id)).returning({ likes: moments.likes });
      return { on: !!added, likes: row.likes };
    });
    await pushAround(m.userId, () => ({ t: "moment_like", id, likes: r.likes, by: u.username, on: r.on }));
    if (r.on) {
      await questEvent(u.id, "like", `like:${id}`);
      if (m.userId !== u.id) await notify(m.userId, "moment", u.id, { action: "like", momentId: id, likes: r.likes, snippet: quote(m.text) }, `mlike:${id}`);
    }
    res.json(r);
  });

  app.get("/api/moments/:id/comments", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !(await visibleMoment(id, me(res).id))) return res.status(404).json({ message: "Not found" });
    res.json({ comments: await commentsOf(id, me(res).id) });
  });

  app.post("/api/moments/:id/comments", requireUser, async (req, res) => {
    const u = me(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Bad id" });
    const no = speakerRefusal(u);
    if (no) return res.status(no.status).json({ message: no.message, until: no.until });
    const m = await visibleMoment(id, u.id);
    if (!m) return res.status(404).json({ message: "Not found" });
    const early = commentPace.check(u, null);
    if (early) return res.status(early.status).json({ message: early.message });
    const c = checkChat(String(req.body?.text ?? ""), MOMENT_COMMENT_MAX);
    if (!c.ok) return res.status(400).json({ message: c.reason });
    const again = commentPace.check(u, c.text);
    if (again) return res.status(again.status).json({ message: again.message });
    if (m.comments >= 500) return res.status(409).json({ message: "This Moment has too many comments" });
    commentPace.record(u, c.text);
    const row = await db.transaction(async (tx) => {
      const [x] = await tx.insert(momentComments).values({ momentId: id, userId: u.id, text: c.text }).returning();
      await tx.update(moments).set({ comments: sql`${moments.comments} + 1` }).where(eq(moments.id, id));
      return x;
    });
    const out: MomentComment = { id: row.id, text: row.text, mine: true, at: row.createdAt.toISOString(), author: await authorOf(u.id) };
    await pushAround(u.id, (viewer) => ({ t: "moment_comment", id, comment: { ...out, mine: viewer === u.id } }));
    const told = new Set<string>([u.id]);
    if (m.userId !== u.id) { told.add(m.userId); await notify(m.userId, "moment", u.id, { action: "comment", momentId: id, snippet: quote(c.text) }); }
    void notifyMentions(u, c.text, req.body?.mentions, id, told).catch((e) => console.error("[moment mentions]", e));
    res.json(out);
  });

  app.delete("/api/moments/comments/:cid", requireUser, async (req, res) => {
    const u = me(res);
    const cid = Number(req.params.cid);
    const [c] = Number.isInteger(cid) ? await db.select().from(momentComments).where(eq(momentComments.id, cid)) : [];
    const [m] = c ? await db.select().from(moments).where(eq(moments.id, c.momentId)) : [];
    // Your own comment, or any comment on your own Moment
    if (!c || !m || (c.userId !== u.id && m.userId !== u.id)) return res.status(404).json({ message: "Not found" });
    await db.transaction((tx) => removeComments(tx, [cid]));
    pushAll({ t: "moment_comment_removed", id: m.id, commentId: cid });
    res.json({ ok: true });
  });

  const reasonSchema = z.object({ reason: z.string().trim().max(200).optional() });
  app.post("/api/moments/:id/report", requireUser, async (req, res) => {
    const u = me(res);
    const id = Number(req.params.id);
    const parsed = reasonSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ message: "Bad request" });
    const m = await visibleMoment(id, u.id);
    if (!m) return res.status(404).json({ message: "Not found" });
    if (m.userId === u.id) return res.status(400).json({ message: "That's your own message" });
    await db.insert(momentReports).values({ kind: "moment", targetId: id, reporterId: u.id, reason: parsed.data.reason || null }).onConflictDoNothing();
    const [{ n }] = await db.select({ n: count() }).from(momentReports).where(and(eq(momentReports.kind, "moment"), eq(momentReports.targetId, id)));
    if (n >= CHAT_AUTO_HIDE_REPORTS) { await db.update(moments).set({ hidden: true }).where(eq(moments.id, id)); pushAll({ t: "moment_removed", id }); }
    res.json({ ok: true });
  });

  app.post("/api/moments/comments/:cid/report", requireUser, async (req, res) => {
    const u = me(res);
    const cid = Number(req.params.cid);
    const parsed = reasonSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(cid) || !parsed.success) return res.status(400).json({ message: "Bad request" });
    const [c] = await db.select().from(momentComments).where(and(eq(momentComments.id, cid), eq(momentComments.hidden, false)));
    if (!c || !(await visibleMoment(c.momentId, u.id))) return res.status(404).json({ message: "Not found" });
    if (c.userId === u.id) return res.status(400).json({ message: "That's your own message" });
    await db.insert(momentReports).values({ kind: "comment", targetId: cid, reporterId: u.id, reason: parsed.data.reason || null }).onConflictDoNothing();
    const [{ n }] = await db.select({ n: count() }).from(momentReports).where(and(eq(momentReports.kind, "comment"), eq(momentReports.targetId, cid)));
    if (n >= CHAT_AUTO_HIDE_REPORTS) {
      await db.update(momentComments).set({ hidden: true }).where(eq(momentComments.id, cid));
      pushAll({ t: "moment_comment_removed", id: c.momentId, commentId: cid });
    }
    res.json({ ok: true });
  });

  // ---- Admin ----
  app.get("/api/admin/social3/reports", requireAdmin, async (_req, res) => {
    res.json({ clubMessages: await reportedClubMessages(), moments: await reportedMoments() });
  });

  app.post("/api/admin/moments/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const hidden = req.body?.hidden;
    if (!Number.isInteger(id) || typeof hidden !== "boolean") return res.status(400).json({ message: "Bad request" });
    const [m] = await db.update(moments).set({ hidden }).where(eq(moments.id, id)).returning();
    if (!m) return res.status(404).json({ message: "Not found" });
    await db.delete(momentReports).where(and(eq(momentReports.kind, "moment"), eq(momentReports.targetId, id)));
    if (hidden) pushAll({ t: "moment_removed", id });
    res.json({ ok: true });
  });

  app.post("/api/admin/moments/comments/:cid", requireAdmin, async (req, res) => {
    const cid = Number(req.params.cid);
    const hidden = req.body?.hidden;
    if (!Number.isInteger(cid) || typeof hidden !== "boolean") return res.status(400).json({ message: "Bad request" });
    const [c] = await db.update(momentComments).set({ hidden }).where(eq(momentComments.id, cid)).returning();
    if (!c) return res.status(404).json({ message: "Not found" });
    await db.delete(momentReports).where(and(eq(momentReports.kind, "comment"), eq(momentReports.targetId, cid)));
    if (hidden) pushAll({ t: "moment_comment_removed", id: c.momentId, commentId: cid });
    res.json({ ok: true });
  });
}

/** Reported Moments and comments for the admin's reports queue */
export async function reportedMoments() {
  const rows = (await db.execute(sql`
    select r.kind, r.target_id, count(*)::int as reports, max(r.created_at) as last_at,
      (array_agg(r.reason order by r.created_at desc) filter (where r.reason is not null and r.reason <> ''))[1:3] as reasons,
      coalesce(m.user_id, c.user_id) as user_id, coalesce(m.text, c.text) as text, m.sticker, m.win, coalesce(m.hidden, c.hidden) as hidden,
      coalesce(m.created_at, c.created_at) as created_at, c.moment_id, u.username, u.muted_until, u.banned
    from ${momentReports} r
    left join ${moments} m on r.kind = 'moment' and m.id = r.target_id
    left join ${momentComments} c on r.kind = 'comment' and c.id = r.target_id
    left join ${users} u on u.id = coalesce(m.user_id, c.user_id)
    group by r.kind, r.target_id, m.user_id, c.user_id, m.text, c.text, m.sticker, m.win, m.hidden, c.hidden, m.created_at, c.created_at, c.moment_id, u.username, u.muted_until, u.banned
    order by max(r.created_at) desc limit 50`)).rows as Row[];
  return rows.filter((r) => r.user_id).map((r) => ({
    kind: r.kind as "moment" | "comment", id: Number(r.target_id), momentId: r.kind === "comment" ? Number(r.moment_id) : Number(r.target_id),
    userId: r.user_id, username: r.username ?? "?", text: r.text, sticker: r.sticker ?? null, win: r.win ?? null, hidden: !!r.hidden,
    createdAt: new Date(r.created_at).toISOString(), reports: r.reports, reasons: r.reasons ?? [], lastAt: new Date(r.last_at).toISOString(),
    mutedUntil: r.muted_until ? new Date(r.muted_until).toISOString() : null, banned: !!r.banned,
  }));
}

async function removeComments(tx: Tx, ids: number[]) {
  if (!ids.length) return;
  const rows = await tx.select({ m: momentComments.momentId }).from(momentComments).where(inArray(momentComments.id, ids));
  await tx.delete(momentReports).where(and(eq(momentReports.kind, "comment"), inArray(momentReports.targetId, ids)));
  await tx.delete(momentComments).where(inArray(momentComments.id, ids));
  for (const m of [...new Set(rows.map((r) => r.m))]) {
    await tx.update(moments).set({ comments: sql`(select count(*)::int from ${momentComments} where moment_id = ${m})` }).where(eq(moments.id, m));
  }
}

async function removeMoments(tx: Tx, ids: number[]) {
  if (!ids.length) return;
  const cids = (await tx.select({ id: momentComments.id }).from(momentComments).where(inArray(momentComments.momentId, ids))).map((r) => r.id);
  if (cids.length) await tx.delete(momentReports).where(and(eq(momentReports.kind, "comment"), inArray(momentReports.targetId, cids)));
  await tx.delete(momentComments).where(inArray(momentComments.momentId, ids));
  await tx.delete(momentLikes).where(inArray(momentLikes.momentId, ids));
  await tx.delete(momentReports).where(and(eq(momentReports.kind, "moment"), inArray(momentReports.targetId, ids)));
  await tx.delete(moments).where(inArray(moments.id, ids));
}

/** Account deletion (inside its transaction): their Moments, comments, likes and reports */
export async function deleteMomentData(tx: Tx, userId: string) {
  const mine = (await tx.select({ id: moments.id }).from(moments).where(eq(moments.userId, userId))).map((r) => r.id);
  await removeMoments(tx, mine);
  const myComments = (await tx.select({ id: momentComments.id }).from(momentComments).where(eq(momentComments.userId, userId))).map((r) => r.id);
  await removeComments(tx, myComments);
  const liked = (await tx.select({ id: momentLikes.momentId }).from(momentLikes).where(eq(momentLikes.userId, userId))).map((r) => r.id);
  await tx.delete(momentLikes).where(eq(momentLikes.userId, userId));
  for (const m of liked) await tx.update(moments).set({ likes: sql`(select count(*)::int from ${momentLikes} where moment_id = ${m})` }).where(eq(moments.id, m));
  await tx.delete(momentReports).where(eq(momentReports.reporterId, userId));
}

