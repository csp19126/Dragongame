/**
 * Find a match (Tìm trận / 找對手): "8-ball, 10K stake, next 20 min". A short-lived post per
 * player (a new one replaces the old). Joining sends you to the game's own table flow: the
 * poster's open table if they're sitting at one, otherwise the game page with
 * ?challenge=<poster>&stake=<stake>, which opens a table and invites them (POST /api/invites).
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { matchPosts, ugcReports, userBlocks, type User } from "@shared/schema";
import { INVITE_GAMES, INVITE_GAME_IDS, MATCH_MINUTES, MATCH_STAKES, MATCH_NOTE_MAX, type InviteGame, type MatchPostView } from "@shared/social3";
import { checkChat } from "@shared/chat";
import { speakerRefusal, paceLimiter } from "./speech";
import { pushAll } from "./hub";
import { notify, blockedEither, joinOf, factsFor, visibleOnline } from "./friends";
import { clubTagOf } from "./clubs";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const pace = paceLimiter(10_000);
const open = () => and(isNull(matchPosts.closedAt), gt(matchPosts.expiresAt, new Date()));

export async function openMatches(viewer: string): Promise<MatchPostView[]> {
  const rows = (await db.execute(sql`
    select m.*, u.username, u.profile_image_url as avatar, u.last_seen_at, coalesce(s.level, 1) as level
    from ${matchPosts} m join users u on u.id = m.user_id left join user_social s on s.user_id = m.user_id
    where m.closed_at is null and m.expires_at > now() and not u.banned
      and m.user_id not in (select blocked_id from ${userBlocks} where blocker_id = ${viewer} union select blocker_id from ${userBlocks} where blocked_id = ${viewer})
    order by m.id desc limit 50`)).rows as Record<string, any>[];
  const facts = await factsFor(rows.map((r) => r.user_id));
  return rows.map((r) => {
    const f = facts.get(r.user_id)!;
    return {
      id: r.id, game: r.game as InviteGame, stake: Number(r.stake), note: r.note ?? null, expiresAt: new Date(r.expires_at).toISOString(), at: new Date(r.created_at).toISOString(),
      mine: r.user_id === viewer,
      author: { username: r.username, avatarUrl: r.avatar ?? null, level: Number(r.level), club: clubTagOf(r.user_id), online: visibleOnline(r.user_id, r.last_seen_at), languages: f.languages, country: f.country, playStyle: f.playStyle },
    };
  });
}

const postSchema = z.object({
  game: z.enum(INVITE_GAME_IDS as [InviteGame, ...InviteGame[]]),
  stake: z.number().int(),
  minutes: z.number().int(),
  note: z.string().max(400).nullable().optional(),
});

/** Where Join takes you for a post */
export function joinHref(posterId: string, posterName: string, game: InviteGame, stake: number): string {
  const route = INVITE_GAMES[game].route;
  const seat = joinOf(posterId);
  if (seat && seat.href.startsWith(`${route}?`)) return seat.href;
  return `${route}?challenge=${encodeURIComponent(posterName)}${stake ? `&stake=${stake}` : ""}`;
}

export function registerMatchRoutes(app: Express, requireUser: Mw) {
  const me = (res: Response) => res.locals.user as User;

  app.get("/api/matches", requireUser, async (_req, res) => { res.json({ posts: await openMatches(me(res).id), minutes: MATCH_MINUTES, stakes: MATCH_STAKES }); });

  app.post("/api/matches", requireUser, async (req, res) => {
    const u = me(res);
    const no = speakerRefusal(u);
    if (no) return res.status(no.status).json({ message: no.message, until: no.until });
    const parsed = postSchema.safeParse(req.body ?? {});
    if (!parsed.success || !(MATCH_STAKES as readonly number[]).includes(parsed.data.stake) || !(MATCH_MINUTES as readonly number[]).includes(parsed.data.minutes)) return res.status(400).json({ message: "Bad request" });
    if (parsed.data.stake > u.balance) return res.status(400).json({ message: "Not enough coins" });
    let note: string | null = null;
    if (parsed.data.note && parsed.data.note.trim()) {
      const c = checkChat(parsed.data.note.replace(/\n/g, " "), MATCH_NOTE_MAX);
      if (!c.ok) return res.status(400).json({ message: c.reason });
      note = c.text;
    }
    const early = pace.check(u, null);
    if (early) return res.status(early.status).json({ message: early.message });
    pace.record(u, null);
    // One active post per player: a new one replaces the old
    const post = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from users where id = ${u.id} for update`);
      await tx.update(matchPosts).set({ closedAt: new Date() }).where(and(eq(matchPosts.userId, u.id), isNull(matchPosts.closedAt)));
      const [p] = await tx.insert(matchPosts).values({ userId: u.id, game: parsed.data.game, stake: parsed.data.stake, note, expiresAt: new Date(Date.now() + parsed.data.minutes * 60_000) }).returning();
      return p;
    });
    pushAll({ t: "matches" });
    res.json({ id: post.id, expiresAt: post.expiresAt.toISOString() });
  });

  app.delete("/api/matches/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    const [p] = Number.isInteger(id) ? await db.update(matchPosts).set({ closedAt: new Date() }).where(and(eq(matchPosts.id, id), eq(matchPosts.userId, me(res).id), isNull(matchPosts.closedAt))).returning() : [];
    if (!p) return res.status(404).json({ message: "Not found" });
    pushAll({ t: "matches" });
    res.json({ ok: true });
  });

  app.post("/api/matches/:id/join", requireUser, async (req, res) => {
    const u = me(res);
    const id = Number(req.params.id);
    const [p] = Number.isInteger(id) ? await db.select().from(matchPosts).where(and(eq(matchPosts.id, id), open())) : [];
    if (!p) return res.status(404).json({ message: "This post has expired" });
    if (p.userId === u.id) return res.status(400).json({ message: "That's your own post" });
    if (await blockedEither(u.id, p.userId)) return res.status(404).json({ message: "This post has expired" });
    const [poster] = (await db.execute(sql`select username from users where id = ${p.userId}`)).rows as { username: string }[];
    const game = p.game as InviteGame;
    const href = joinHref(p.userId, poster.username, game, p.stake);
    await notify(p.userId, "match", u.id, { game, stake: p.stake, postId: p.id }, `match:${p.id}:${u.id}`);
    res.json({ href });
  });

  app.post("/api/matches/:id/report", requireUser, async (req, res) => {
    const u = me(res);
    const id = Number(req.params.id);
    const [p] = Number.isInteger(id) ? await db.select().from(matchPosts).where(eq(matchPosts.id, id)) : [];
    if (!p) return res.status(404).json({ message: "Not found" });
    if (p.userId === u.id) return res.status(400).json({ message: "That's your own message" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) || null : null;
    await db.insert(ugcReports).values({ kind: "match", targetId: id, reporterId: u.id, reason }).onConflictDoNothing();
    res.json({ ok: true });
  });
}

export async function activeMatchCount() {
  const [{ n }] = await db.select({ n: count() }).from(matchPosts).where(open());
  return n;
}

export async function deleteMatchData(tx: Tx, userId: string) {
  const ids = (await tx.select({ id: matchPosts.id }).from(matchPosts).where(eq(matchPosts.userId, userId))).map((r) => r.id);
  if (ids.length) await tx.delete(ugcReports).where(and(eq(ugcReports.kind, "match"), sql`${ugcReports.targetId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
  await tx.delete(matchPosts).where(eq(matchPosts.userId, userId));
}
