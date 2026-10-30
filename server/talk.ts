/**
 * Talk (Trò chuyện): topic boards with threads and replies, for grown-ups to talk about the
 * games or anything else. Newest activity first, paged, live over the social socket. One simple
 * 👍 per thread. No content filter (owner policy): rate limits, block, report and the admin
 * queue only. Reports from three players hide a thread or reply until an admin looks.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { talkThreads, talkReplies, talkThumbs, ugcReports, userBlocks, type User } from "@shared/schema";
import {
  isTalkBoard, TALK_TITLE_MAX, TALK_BODY_MAX, TALK_REPLY_MAX, TALK_PAGE, TALK_REPLY_PAGE, TALK_THREAD_COOLDOWN_MS, TALK_REPLY_COOLDOWN_MS,
  TALK_THREADS_PER_DAY, TALK_BOARDS, type TalkThreadView, type TalkReplyView, type TalkBoard,
} from "@shared/social3";
import { checkChat, CHAT_AUTO_HIDE_REPORTS } from "@shared/chat";
import { quote } from "@shared/friends";
import { speakerRefusal, paceLimiter } from "./speech";
import { push, connectedUsers } from "./hub";
import { notify, friendIdsOf } from "./friends";
import { clubTagOf } from "./clubs";
import { questEvent } from "./quests";
import { ownPhoto } from "./photos";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = Record<string, any>;

const threadPace = paceLimiter(TALK_THREAD_COOLDOWN_MS);
const replyPace = paceLimiter(TALK_REPLY_COOLDOWN_MS);
const blockedSql = (me: string) => sql`(select blocked_id from ${userBlocks} where blocker_id = ${me} union select blocker_id from ${userBlocks} where blocked_id = ${me})`;

function author(r: Row) {
  return { username: r.username, avatarUrl: r.avatar ?? null, level: Number(r.level ?? 1), club: clubTagOf(r.user_id) };
}

async function threadRows(viewer: string, where: ReturnType<typeof sql>, limit: number) {
  const friends = new Set(await friendIdsOf(viewer));
  const rows = (await db.execute(sql`
    select t.*, u.username, u.profile_image_url as avatar, coalesce(s.level, 1) as level,
      exists (select 1 from ${talkThumbs} k where k.thread_id = t.id and k.user_id = ${viewer}) as thumbed
    from ${talkThreads} t join users u on u.id = t.user_id left join user_social s on s.user_id = t.user_id
    where not t.hidden and not u.banned and t.user_id not in ${blockedSql(viewer)} and ${where}
    order by t.last_at desc, t.id desc limit ${limit}`)).rows as Row[];
  return rows.map((r): TalkThreadView => ({
    id: r.id, board: r.board, title: r.title, body: r.body, photo: r.photo_id ?? null, author: author(r),
    replies: Number(r.replies), thumbs: Number(r.thumbs), thumbed: !!r.thumbed,
    lastAt: new Date(r.last_at).toISOString(), at: new Date(r.created_at).toISOString(), mine: r.user_id === viewer, friend: friends.has(r.user_id),
  }));
}

/** Board summaries: thread counts and the latest activity */
async function boards() {
  const rows = (await db.execute(sql`select board, count(*)::int as n, max(last_at) as last from ${talkThreads} where not hidden group by board`)).rows as Row[];
  const by = new Map(rows.map((r) => [r.board, r]));
  return TALK_BOARDS.map((b) => ({ id: b.id, threads: Number(by.get(b.id)?.n ?? 0), lastAt: by.get(b.id)?.last ? new Date(by.get(b.id)!.last).toISOString() : null }));
}

/** A thread page: newest activity first; `before` is "lastAt|id" from the previous page */
export async function listThreads(viewer: string, board: TalkBoard | "all", before?: string) {
  const conds = [board === "all" ? sql`true` : sql`t.board = ${board}`];
  const m = before?.match(/^(\d{4}-[\d:T.\-Z]+)\|(\d+)$/);
  if (m) conds.push(sql`(t.last_at, t.id) < (${new Date(m[1])}::timestamp, ${Number(m[2])})`);
  const rows = await threadRows(viewer, sql.join(conds, sql` and `), TALK_PAGE + 1);
  const items = rows.slice(0, TALK_PAGE);
  const last = items[items.length - 1];
  return { items, more: rows.length > TALK_PAGE, next: rows.length > TALK_PAGE && last ? `${last.lastAt}|${last.id}` : null };
}

async function visibleThread(id: number, viewer: string) {
  const [t] = await threadRows(viewer, sql`t.id = ${id}`, 1);
  return t ?? null;
}

async function repliesOf(threadId: number, viewer: string, after = 0) {
  const friends = new Set(await friendIdsOf(viewer));
  const rows = (await db.execute(sql`
    select r.*, u.username, u.profile_image_url as avatar, coalesce(s.level, 1) as level
    from ${talkReplies} r join users u on u.id = r.user_id left join user_social s on s.user_id = r.user_id
    where r.thread_id = ${threadId} and not r.hidden and not u.banned and r.user_id not in ${blockedSql(viewer)} and r.id > ${after}
    order by r.id limit ${TALK_REPLY_PAGE + 1}`)).rows as Row[];
  return {
    items: rows.slice(0, TALK_REPLY_PAGE).map((r): TalkReplyView => ({ id: r.id, text: r.text, photo: r.photo_id ?? null, author: author(r), at: new Date(r.created_at).toISOString(), mine: r.user_id === viewer, friend: friends.has(r.user_id) })),
    more: rows.length > TALK_REPLY_PAGE,
  };
}

/** Everyone online except players on either side of a block with `authorId` */
async function pushAround(authorId: string, msg: (viewer: string) => object) {
  const rows = await db.select({ a: userBlocks.blockerId, b: userBlocks.blockedId }).from(userBlocks).where(sql`${userBlocks.blockerId} = ${authorId} or ${userBlocks.blockedId} = ${authorId}`);
  const hide = new Set(rows.map((r) => (r.a === authorId ? r.b : r.a)));
  for (const uid of connectedUsers()) if (!hide.has(uid)) push(uid, msg(uid));
}

const threadSchema = z.object({ board: z.string(), title: z.string().max(400), body: z.string().max(8000), photoId: z.number().int().positive().nullable().optional() });

export function registerTalkRoutes(app: Express, requireUser: Mw) {
  const me = (res: Response) => res.locals.user as User;

  app.get("/api/talk/boards", requireUser, async (_req, res) => { res.json({ boards: await boards() }); });

  app.get("/api/talk/threads", requireUser, async (req, res) => {
    const board = isTalkBoard(req.query.board) ? req.query.board : "all";
    res.json(await listThreads(me(res).id, board, typeof req.query.before === "string" ? req.query.before : undefined));
  });

  app.post("/api/talk/threads", requireUser, async (req, res) => {
    const u = me(res);
    const no = speakerRefusal(u);
    if (no) return res.status(no.status).json({ message: no.message, until: no.until });
    const parsed = threadSchema.safeParse(req.body ?? {});
    if (!parsed.success || !isTalkBoard(parsed.data.board)) return res.status(400).json({ message: "Bad request" });
    const early = threadPace.check(u, null);
    if (early) return res.status(early.status).json({ message: early.message });
    const title = checkChat(parsed.data.title.replace(/\n/g, " "), TALK_TITLE_MAX);
    if (!title.ok) return res.status(400).json({ message: title.reason === "empty" ? "A thread needs a title" : "long" });
    const body = checkChat(parsed.data.body, TALK_BODY_MAX);
    if (!body.ok) return res.status(400).json({ message: body.reason === "empty" ? "Write something in your post" : "long" });
    const photo = await ownPhoto(u.id, parsed.data.photoId ?? null, "talk", null);
    if (photo && typeof photo === "object") return res.status(photo.status).json({ message: photo.message });
    const [{ n }] = await db.select({ n: count() }).from(talkThreads).where(and(eq(talkThreads.userId, u.id), gt(talkThreads.createdAt, new Date(Date.now() - 86_400_000))));
    if (n >= TALK_THREADS_PER_DAY && !u.isAdmin) return res.status(429).json({ message: "You've started enough threads for today" });
    threadPace.record(u, title.text);
    const [t] = await db.insert(talkThreads).values({ board: parsed.data.board, userId: u.id, title: title.text, body: body.text, photoId: photo }).returning();
    const view = (await visibleThread(t.id, u.id))!;
    const fa = new Set(await friendIdsOf(u.id));
    await pushAround(u.id, (viewer) => ({ t: "talk_thread", item: { ...view, mine: viewer === u.id, friend: fa.has(viewer) } }));
    await questEvent(u.id, "talk", `thread:${t.id}`);
    res.json(view);
  });

  app.get("/api/talk/threads/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    const t = Number.isInteger(id) ? await visibleThread(id, me(res).id) : null;
    if (!t) return res.status(404).json({ message: "Not found" });
    res.json({ thread: t, replies: await repliesOf(id, me(res).id, Number(req.query.after) || 0) });
  });

  app.post("/api/talk/threads/:id/replies", requireUser, async (req, res) => {
    const u = me(res);
    const id = Number(req.params.id);
    const no = speakerRefusal(u);
    if (no) return res.status(no.status).json({ message: no.message, until: no.until });
    const t = Number.isInteger(id) ? await visibleThread(id, u.id) : null;
    if (!t) return res.status(404).json({ message: "Not found" });
    const early = replyPace.check(u, null);
    if (early) return res.status(early.status).json({ message: early.message });
    const photo = await ownPhoto(u.id, req.body?.photoId ?? null, "talk", null);
    if (photo && typeof photo === "object") return res.status(photo.status).json({ message: photo.message });
    let text: string | null = null;
    const raw = typeof req.body?.text === "string" ? req.body.text : "";
    if (raw.trim() || !photo) {
      const c = checkChat(raw, TALK_REPLY_MAX);
      if (!c.ok) return res.status(400).json({ message: c.reason });
      text = c.text;
    }
    const again = text ? replyPace.check(u, text) : null;
    if (again) return res.status(again.status).json({ message: again.message });
    replyPace.record(u, text);
    const r = await db.transaction(async (tx) => {
      const [x] = await tx.insert(talkReplies).values({ threadId: id, userId: u.id, text, photoId: photo }).returning();
      await tx.update(talkThreads).set({ replies: sql`${talkThreads.replies} + 1`, lastAt: x.createdAt }).where(eq(talkThreads.id, id));
      return x;
    });
    const [a] = (await db.execute(sql`select u.username, u.profile_image_url as avatar, coalesce(s.level, 1) as level, u.id as user_id from users u left join user_social s on s.user_id = u.id where u.id = ${u.id}`)).rows as Row[];
    const out: TalkReplyView = { id: r.id, text, photo, author: author(a), at: r.createdAt.toISOString(), mine: true, friend: false };
    const [owner] = await db.select({ userId: talkThreads.userId }).from(talkThreads).where(eq(talkThreads.id, id));
    const friendsOfAuthor = new Set(await friendIdsOf(u.id));
    await pushAround(u.id, (viewer) => ({ t: "talk_reply", threadId: id, board: t.board, reply: { ...out, mine: viewer === u.id, friend: friendsOfAuthor.has(viewer) }, replies: t.replies + 1, lastAt: out.at }));
    if (owner && owner.userId !== u.id) await notify(owner.userId, "talk", u.id, { threadId: id, title: t.title, snippet: quote(text) }, `talk:${id}`);
    await questEvent(u.id, "talk", `reply:${r.id}`);
    res.json(out);
  });

  app.post("/api/talk/threads/:id/thumb", requireUser, async (req, res) => {
    const u = me(res);
    const id = Number(req.params.id);
    const t = Number.isInteger(id) ? await visibleThread(id, u.id) : null;
    if (!t) return res.status(404).json({ message: "Not found" });
    const r = await db.transaction(async (tx) => {
      const [added] = await tx.insert(talkThumbs).values({ threadId: id, userId: u.id }).onConflictDoNothing().returning();
      if (!added) await tx.delete(talkThumbs).where(and(eq(talkThumbs.threadId, id), eq(talkThumbs.userId, u.id)));
      const [row] = await tx.update(talkThreads).set({ thumbs: sql`(select count(*)::int from ${talkThumbs} where thread_id = ${id})` }).where(eq(talkThreads.id, id)).returning({ thumbs: talkThreads.thumbs });
      return { on: !!added, thumbs: row.thumbs };
    });
    res.json(r);
  });

  // The author can delete their own thread or reply
  app.delete("/api/talk/threads/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    const [t] = Number.isInteger(id) ? await db.select().from(talkThreads).where(eq(talkThreads.id, id)) : [];
    if (!t || t.userId !== me(res).id) return res.status(404).json({ message: "Not found" });
    await db.transaction((tx) => removeThreads(tx, [id]));
    for (const uid of connectedUsers()) push(uid, { t: "talk_removed", threadId: id });
    res.json({ ok: true });
  });
  app.delete("/api/talk/replies/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    const [r] = Number.isInteger(id) ? await db.select().from(talkReplies).where(eq(talkReplies.id, id)) : [];
    if (!r || r.userId !== me(res).id) return res.status(404).json({ message: "Not found" });
    await db.transaction((tx) => removeReplies(tx, [id]));
    for (const uid of connectedUsers()) push(uid, { t: "talk_reply_removed", threadId: r.threadId, id });
    res.json({ ok: true });
  });

  // Reports: into the admin queue; three different players hide it until an admin looks
  const report = (kind: "thread" | "reply") => async (req: Request, res: Response) => {
    const u = me(res);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Bad id" });
    const row = kind === "thread"
      ? (await db.select({ userId: talkThreads.userId, threadId: talkThreads.id }).from(talkThreads).where(and(eq(talkThreads.id, id), eq(talkThreads.hidden, false))))[0]
      : (await db.select({ userId: talkReplies.userId, threadId: talkReplies.threadId }).from(talkReplies).where(and(eq(talkReplies.id, id), eq(talkReplies.hidden, false))))[0];
    if (!row || !(await visibleThread(row.threadId, u.id))) return res.status(404).json({ message: "Not found" });
    if (row.userId === u.id) return res.status(400).json({ message: "That's your own message" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) || null : null;
    await db.insert(ugcReports).values({ kind, targetId: id, reporterId: u.id, reason }).onConflictDoNothing();
    const [{ n }] = await db.select({ n: count() }).from(ugcReports).where(and(eq(ugcReports.kind, kind), eq(ugcReports.targetId, id)));
    if (n >= CHAT_AUTO_HIDE_REPORTS) {
      if (kind === "thread") await db.update(talkThreads).set({ hidden: true }).where(eq(talkThreads.id, id));
      else await db.update(talkReplies).set({ hidden: true }).where(eq(talkReplies.id, id));
    }
    res.json({ ok: true });
  };
  app.post("/api/talk/threads/:id/report", requireUser, report("thread"));
  app.post("/api/talk/replies/:id/report", requireUser, report("reply"));
}

export async function removeReplies(tx: Tx, ids: number[]) {
  if (!ids.length) return;
  const rows = await tx.select({ t: talkReplies.threadId }).from(talkReplies).where(inArray(talkReplies.id, ids));
  await tx.delete(ugcReports).where(and(eq(ugcReports.kind, "reply"), inArray(ugcReports.targetId, ids)));
  await tx.delete(talkReplies).where(inArray(talkReplies.id, ids));
  for (const t of [...new Set(rows.map((r) => r.t))]) {
    await tx.update(talkThreads).set({ replies: sql`(select count(*)::int from ${talkReplies} where thread_id = ${t})` }).where(eq(talkThreads.id, t));
  }
}

export async function removeThreads(tx: Tx, ids: number[]) {
  if (!ids.length) return;
  const rids = (await tx.select({ id: talkReplies.id }).from(talkReplies).where(inArray(talkReplies.threadId, ids))).map((r) => r.id);
  if (rids.length) await tx.delete(ugcReports).where(and(eq(ugcReports.kind, "reply"), inArray(ugcReports.targetId, rids)));
  await tx.delete(talkReplies).where(inArray(talkReplies.threadId, ids));
  await tx.delete(talkThumbs).where(inArray(talkThumbs.threadId, ids));
  await tx.delete(ugcReports).where(and(eq(ugcReports.kind, "thread"), inArray(ugcReports.targetId, ids)));
  await tx.delete(talkThreads).where(inArray(talkThreads.id, ids));
}

/** Account deletion (inside its transaction): their threads (with replies), replies and 👍 */
export async function deleteTalkData(tx: Tx, userId: string) {
  await removeThreads(tx, (await tx.select({ id: talkThreads.id }).from(talkThreads).where(eq(talkThreads.userId, userId))).map((r) => r.id));
  await removeReplies(tx, (await tx.select({ id: talkReplies.id }).from(talkReplies).where(eq(talkReplies.userId, userId))).map((r) => r.id));
  const thumbed = (await tx.select({ id: talkThumbs.threadId }).from(talkThumbs).where(eq(talkThumbs.userId, userId))).map((r) => r.id);
  await tx.delete(talkThumbs).where(eq(talkThumbs.userId, userId));
  for (const t of thumbed) await tx.update(talkThreads).set({ thumbs: sql`(select count(*)::int from ${talkThumbs} where thread_id = ${t})` }).where(eq(talkThreads.id, t));
}
