/**
 * Clubs (Hội): up to 30 players under an emblem, with their own chat, a weekly XP race and a
 * weekly reward for the top three. Starting a club costs coins (they leave the game, a sink).
 * One club per player: club_members is keyed by user_id.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users, deposits, clubs, clubMembers, ugcReports, clubRequests, clubMessages, clubChatReports, clubWeeks, clubRewardPayouts, userSocial, feedItems, type User,
} from "@shared/schema";
import {
  CLUB_FEE, CLUB_MAX_MEMBERS, CLUB_DESC_MAX, CLUB_EMBLEMS, CLUB_COLORS, CLUB_WEEKLY_REWARDS, CLUB_MAX_REQUESTS,
  checkClubName, checkClubTag, clubAllowed, type ClubRole, type ClubTag,
} from "@shared/social3";
import { checkChat, CHAT_AUTO_HIDE_REPORTS, CHAT_COOLDOWN_MS } from "@shared/chat";
import { SOCIAL_MIN_GAMES } from "@shared/social";
import { vnWeekStart, type FeedItem } from "@shared/friends";
import { vnDay } from "@shared/league";
import { speakerRefusal, paceLimiter, readMessage } from "./speech";
import { push } from "./hub";
import { notify, visibleOnline, findPlayer, presenceHidden } from "./friends";
import { playingNow } from "./hub";
import { questEvent } from "./quests";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fail = { status: number; message: string };

export const CLUB_FEE_METHOD = "club_fee";
export const CLUB_WEEKLY_METHOD = "club_weekly";

// ---------------- Who is in which club (kept in memory for name tags and live pushes) ----------------

interface Membership { id: number; name: string; tag: string; emblem: string; color: string; role: ClubRole }
const byUser = new Map<string, Membership>();
const byClub = new Map<number, Set<string>>();

export function clubTagOf(userId: string | null | undefined): ClubTag | null {
  const m = userId ? byUser.get(userId) : undefined;
  return m ? { id: m.id, tag: m.tag, emblem: m.emblem, color: m.color } : null;
}
export const clubOf = (userId: string) => byUser.get(userId) ?? null;

/** Re-reads one club's members from the database into memory */
async function syncClub(clubId: number) {
  const [c] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  const old = byClub.get(clubId) ?? new Set<string>();
  for (const u of old) if (byUser.get(u)?.id === clubId) byUser.delete(u);
  byClub.delete(clubId);
  if (!c) return;
  const rows = await db.select().from(clubMembers).where(eq(clubMembers.clubId, clubId));
  const set = new Set<string>();
  for (const r of rows) {
    set.add(r.userId);
    byUser.set(r.userId, { id: c.id, name: c.name, tag: c.tag, emblem: c.emblem, color: c.color, role: r.role as ClubRole });
  }
  byClub.set(clubId, set);
}

export async function loadClubs() {
  byUser.clear(); byClub.clear();
  const rows = await db.select({ m: clubMembers, c: clubs }).from(clubMembers).innerJoin(clubs, eq(clubs.id, clubMembers.clubId));
  for (const { m, c } of rows) {
    byUser.set(m.userId, { id: c.id, name: c.name, tag: c.tag, emblem: c.emblem, color: c.color, role: m.role as ClubRole });
    let s = byClub.get(c.id);
    if (!s) byClub.set(c.id, (s = new Set()));
    s.add(m.userId);
  }
}

function pushClub(clubId: number, msg: object, except?: string) {
  for (const u of byClub.get(clubId) ?? []) if (u !== except) push(u, msg);
}

// ---------------- Weekly XP ----------------

/** Each club's members and the XP they made for it between `from` and `to` (only while members) */
async function contributions(from: Date, to: Date, clubId?: number) {
  const rows = (await db.execute(sql`
    select m.club_id, m.user_id, (floor(coalesce(sum(p.bet), 0) / 1000))::bigint as xp
    from ${clubMembers} m
    left join game_plays p on p.user_id = m.user_id and p.created_at >= greatest(${from}::timestamp, m.joined_at) and p.created_at < ${to}
    where m.joined_at < ${to} ${clubId ? sql`and m.club_id = ${clubId}` : sql``}
    group by m.club_id, m.user_id`)).rows as { club_id: number; user_id: string; xp: string }[];
  return rows.map((r) => ({ clubId: Number(r.club_id), userId: r.user_id, xp: Number(r.xp) }));
}

/** All clubs with their member counts and this week's XP, best first */
async function standings(from = vnWeekStart(new Date())) {
  const to = new Date(from.getTime() + 7 * 86_400_000);
  const contrib = await contributions(from, to);
  const xp = new Map<number, number>();
  for (const c of contrib) xp.set(c.clubId, (xp.get(c.clubId) ?? 0) + c.xp);
  const rows = await db.select({ c: clubs, n: sql<number>`(select count(*)::int from ${clubMembers} m where m.club_id = ${clubs.id})` }).from(clubs);
  return rows
    .map(({ c, n }) => ({ ...summaryOf(c, Number(n)), weeklyXp: xp.get(c.id) ?? 0 }))
    .sort((a, b) => b.weeklyXp - a.weeklyXp || a.id - b.id)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

type ClubRow = typeof clubs.$inferSelect;
function summaryOf(c: ClubRow, members: number) {
  return { id: c.id, name: c.name, tag: c.tag, emblem: c.emblem, color: c.color, description: c.description, open: c.open, members, maxMembers: CLUB_MAX_MEMBERS };
}

// ---------------- The weekly reward ----------------

/**
 * Pays the top three clubs of the Vietnam week starting `weekStart`: every member who made
 * XP for the club that week gets the rank's fixed reward. The club_weeks row is inserted in
 * the same transaction as the payments, so a week is paid exactly once, even across restarts
 * or two servers. Returns false if that week was already paid.
 */
export async function payClubWeek(weekStart: Date): Promise<boolean> {
  const week = vnDay(weekStart);
  const end = new Date(weekStart.getTime() + 7 * 86_400_000);
  const told: { userId: string; rank: number; amount: number; clubId: number; name: string }[] = [];
  const paid = await db.transaction(async (tx) => {
    const [claimed] = await tx.insert(clubWeeks).values({ week }).onConflictDoNothing().returning();
    if (!claimed) return false;
    const contrib = await contributions(weekStart, end);
    const totals = new Map<number, number>();
    for (const c of contrib) totals.set(c.clubId, (totals.get(c.clubId) ?? 0) + c.xp);
    const top = [...totals].filter(([, xp]) => xp > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, CLUB_WEEKLY_REWARDS.length);
    const winners = [];
    for (const [i, [clubId, xp]] of top.entries()) {
      const amount = CLUB_WEEKLY_REWARDS[i];
      const [c] = await tx.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, clubId));
      let n = 0;
      for (const m of contrib.filter((x) => x.clubId === clubId && x.xp > 0)) {
        const [row] = await tx.insert(clubRewardPayouts).values({ week, userId: m.userId, clubId, rank: i + 1, amount }).onConflictDoNothing().returning();
        if (!row) continue;
        await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, m.userId));
        await tx.insert(deposits).values({ userId: m.userId, amount, method: CLUB_WEEKLY_METHOD });
        told.push({ userId: m.userId, rank: i + 1, amount, clubId, name: c?.name ?? "" });
        n++;
      }
      winners.push({ clubId, name: c?.name ?? "", rank: i + 1, xp, paid: n });
    }
    await tx.update(clubWeeks).set({ winners }).where(eq(clubWeeks.week, week));
    return true;
  });
  for (const t of told) await notify(t.userId, "club", null, { action: "reward", rank: t.rank, amount: t.amount, clubId: t.clubId, club: t.name, week }).catch(() => {});
  return paid;
}

const paidWeeks = new Set<string>();
export async function clubWeeklyTick(now = new Date()) {
  const prev = new Date(vnWeekStart(now).getTime() - 7 * 86_400_000);
  const key = vnDay(prev);
  if (paidWeeks.has(key)) return;
  await payClubWeek(prev);
  paidWeeks.add(key);
}

export async function startClubs(httpServer: { on: (e: "close", f: () => void) => unknown }) {
  await loadClubs();
  const run = () => clubWeeklyTick().catch((e) => console.error("[club week]", e));
  void run();
  const timer = setInterval(run, 60_000);
  timer.unref?.();
  httpServer.on("close", () => clearInterval(timer));
}

// ---------------- Views ----------------

async function clubView(c: ClubRow, me: User) {
  const week = vnWeekStart(new Date());
  const to = new Date(week.getTime() + 7 * 86_400_000);
  const contrib = await contributions(week, to, c.id);
  const xpOf = new Map(contrib.map((x) => [x.userId, x.xp]));
  const rows = (await db.execute(sql`
    select u.id, u.username, u.profile_image_url, u.last_seen_at, coalesce(s.level, 1) as level, m.role, m.joined_at
    from ${clubMembers} m join ${users} u on u.id = m.user_id left join ${userSocial} s on s.user_id = u.id
    where m.club_id = ${c.id} and not u.banned`)).rows as Record<string, any>[];
  const order: Record<string, number> = { owner: 0, officer: 1, member: 2 };
  const members = rows.map((r) => {
    const online = visibleOnline(r.id, r.last_seen_at);
    return {
      username: r.username, avatarUrl: r.profile_image_url ?? null, level: Number(r.level), role: r.role as ClubRole,
      online, playing: online && !presenceHidden(r.id) ? playingNow(r.id) : null, weeklyXp: xpOf.get(r.id) ?? 0, joinedAt: new Date(r.joined_at).toISOString(),
    };
  }).sort((a, b) => order[a.role] - order[b.role] || b.weeklyXp - a.weeklyXp || a.username.localeCompare(b.username));
  const mine = byUser.get(me.id)?.id === c.id ? byUser.get(me.id)!.role : null;
  const board = await standings(week);
  const rank = board.find((b) => b.id === c.id)?.rank ?? null;
  const [req] = await db.select().from(clubRequests).where(and(eq(clubRequests.clubId, c.id), eq(clubRequests.userId, me.id)));
  const requests = mine && clubAllowed(mine, "approve") ? ((await db.execute(sql`
    select u.username, u.profile_image_url, coalesce(s.level, 1) as level, r.created_at
    from ${clubRequests} r join ${users} u on u.id = r.user_id left join ${userSocial} s on s.user_id = u.id
    where r.club_id = ${c.id} and not u.banned order by r.created_at`)).rows as Record<string, any>[]).map((r) => ({ username: r.username, avatarUrl: r.profile_image_url ?? null, level: Number(r.level), at: new Date(r.created_at).toISOString() })) : [];
  return {
    ...summaryOf(c, members.length),
    createdAt: c.createdAt.toISOString(),
    weeklyXp: members.reduce((t, m) => t + m.weeklyXp, 0), rank, weekStart: week.toISOString(), weekEnd: to.toISOString(),
    members, requests,
    me: { role: mine, requested: !!req, inOtherClub: !mine && byUser.has(me.id) },
    rewards: CLUB_WEEKLY_REWARDS,
  };
}

/** Members' big wins since they joined (only players who appear in the activity feed) */
async function clubActivity(clubId: number): Promise<FeedItem[]> {
  const rows = (await db.execute(sql`
    select f.id, f.kind, f.game, f.amount, f.bet, f.level, f.created_at, u.username, u.profile_image_url as avatar, coalesce(us.level, 1) as ulevel
    from ${feedItems} f join ${clubMembers} m on m.user_id = f.user_id and f.created_at >= m.joined_at
    join ${users} u on u.id = f.user_id left join ${userSocial} us on us.user_id = f.user_id
    where m.club_id = ${clubId} and f.kind in ('big_win', 'jackpot', 'horse', 'level_up') and not u.banned and coalesce(us.show_in_feed, true)
    order by f.id desc limit 30`)).rows as Record<string, any>[];
  return rows.map((r) => ({
    id: r.id, kind: r.kind, game: r.game ?? null, amount: r.amount === null ? null : Number(r.amount), bet: r.bet === null ? null : Number(r.bet), level: r.level ?? null,
    at: new Date(r.created_at).toISOString(), user: { username: r.username, avatarUrl: r.avatar ?? null, level: Number(r.ulevel) }, other: null,
  }));
}

// ---------------- Club chat ----------------

type ClubMsgRow = typeof clubMessages.$inferSelect;
async function chatOut(rows: ClubMsgRow[]) {
  const ids = [...new Set(rows.map((r) => r.userId))];
  const people = ids.length ? await db.select({ id: users.id, avatar: users.profileImageUrl, admin: users.isAdmin, level: userSocial.level })
    .from(users).leftJoin(userSocial, eq(userSocial.userId, users.id)).where(inArray(users.id, ids)) : [];
  const by = new Map(people.map((p) => [p.id, p]));
  return rows.map((m) => ({
    id: m.id, username: m.username, text: m.text, sticker: m.sticker, photo: m.photoId ?? null, createdAt: m.createdAt.toISOString(),
    avatar: by.get(m.userId)?.avatar ?? null, level: by.get(m.userId)?.level ?? 1, admin: !!by.get(m.userId)?.admin, role: byUser.get(m.userId)?.role ?? null,
  }));
}

const clubChatPace = paceLimiter(CHAT_COOLDOWN_MS);
/** A kicked player can't come straight back (a day, in memory) */
const kicked = new Map<string, number>();
const KICK_COOLDOWN_MS = 24 * 3600_000;

// ---------------- Mutations ----------------

async function lockClub(tx: Tx, clubId: number) {
  const [c] = (await tx.execute(sql`select * from ${clubs} where id = ${clubId} for update`)).rows as Record<string, any>[];
  return c ?? null;
}
async function memberCount(tx: Tx, clubId: number) {
  const [{ n }] = await tx.select({ n: count() }).from(clubMembers).where(eq(clubMembers.clubId, clubId));
  return n;
}

/** Deletes a club and everything in it (members are told) */
export async function disbandClub(clubId: number, reason: "owner" | "admin" | "empty") {
  const memberIds = [...(byClub.get(clubId) ?? [])];
  const [c] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  if (!c) return false;
  await db.transaction(async (tx) => {
    const msgs = tx.select({ id: clubMessages.id }).from(clubMessages).where(eq(clubMessages.clubId, clubId));
    await tx.delete(clubChatReports).where(inArray(clubChatReports.messageId, msgs));
    await tx.delete(clubMessages).where(eq(clubMessages.clubId, clubId));
    await tx.delete(clubRequests).where(eq(clubRequests.clubId, clubId));
    await tx.delete(clubMembers).where(eq(clubMembers.clubId, clubId));
    await tx.delete(ugcReports).where(and(eq(ugcReports.kind, "club"), eq(ugcReports.targetId, clubId)));
    await tx.delete(clubs).where(eq(clubs.id, clubId));
  });
  await syncClub(clubId);
  for (const u of memberIds) {
    push(u, { t: "club", action: "disbanded", clubId });
    if (u !== c.ownerId || reason !== "owner") await notify(u, "club", null, { action: "disbanded", clubId, club: c.name, reason }).catch(() => {});
  }
  return true;
}

const createSchema = z.object({
  name: z.string().max(60), tag: z.string().max(20),
  emblem: z.string().max(16), color: z.string().max(16),
  description: z.string().max(400).nullable().optional(),
  open: z.boolean().optional(),
});
const editSchema = z.object({
  description: z.string().max(400).nullable().optional(),
  emblem: z.string().max(16).optional(), color: z.string().max(16).optional(), open: z.boolean().optional(),
});

function cleanDescription(raw: string | null | undefined): { ok: true; text: string | null } | Fail {
  const t = (raw ?? "").trim();
  if (!t) return { ok: true, text: null };
  const c = checkChat(t, CLUB_DESC_MAX);
  if (!c.ok) return { status: 400, message: c.reason };
  return { ok: true, text: c.text };
}

export async function createClub(u: User, body: unknown): Promise<{ id: number; balance: number } | Fail> {
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) return { status: 400, message: "Bad request" };
  const no = speakerRefusal(u);
  if (no) return { status: no.status, message: no.message };
  const name = checkClubName(parsed.data.name);
  if (!name.ok) return { status: 400, message: name.reason };
  const tag = checkClubTag(parsed.data.tag);
  if (!tag.ok) return { status: 400, message: tag.reason };
  if (!(CLUB_EMBLEMS as readonly string[]).includes(parsed.data.emblem)) return { status: 400, message: "Pick an emblem from the list" };
  if (!(CLUB_COLORS as readonly string[]).includes(parsed.data.color)) return { status: 400, message: "Pick a colour from the list" };
  const desc = cleanDescription(parsed.data.description);
  if (!("ok" in desc)) return desc;
  const [taken] = await db.select({ id: clubs.id }).from(clubs).where(sql`lower(${clubs.name}) = lower(${name.name})`);
  if (taken) return { status: 409, message: "That club name is taken" };
  let r: { id: number; balance: number } | Fail;
  try {
    r = await db.transaction(async (tx) => {
      const [me] = (await tx.execute(sql`select balance from ${users} where id = ${u.id} for update`)).rows as { balance: string }[];
      const [inClub] = await tx.select().from(clubMembers).where(eq(clubMembers.userId, u.id));
      if (inClub) return { status: 409, message: "You're already in a club" } as Fail;
      if (Number(me?.balance ?? 0) < CLUB_FEE) return { status: 400, message: "Not enough coins" } as Fail;
      const [c] = await tx.insert(clubs).values({ name: name.name, tag: tag.tag, emblem: parsed.data.emblem, color: parsed.data.color, description: desc.text, open: parsed.data.open ?? true, ownerId: u.id }).returning();
      await tx.insert(clubMembers).values({ userId: u.id, clubId: c.id, role: "owner" });
      const [after] = await tx.update(users).set({ balance: sql`${users.balance} - ${CLUB_FEE}` }).where(eq(users.id, u.id)).returning({ balance: users.balance });
      // The fee leaves the game: logged as a negative bonus so the admin's totals stay honest
      await tx.insert(deposits).values({ userId: u.id, amount: -CLUB_FEE, method: CLUB_FEE_METHOD });
      await tx.delete(clubRequests).where(eq(clubRequests.userId, u.id));
      return { id: c.id, balance: after.balance };
    });
  } catch (e: any) {
    if (e?.code === "23505") return { status: 409, message: "That club name is taken" };
    throw e;
  }
  if ("id" in r) await syncClub(r.id);
  return r;
}

async function addMember(clubId: number, userId: string, role: ClubRole = "member"): Promise<true | Fail> {
  const r = await db.transaction(async (tx) => {
    const c = await lockClub(tx, clubId);
    if (!c) return { status: 404, message: "Club not found" } as Fail;
    if ((await memberCount(tx, clubId)) >= CLUB_MAX_MEMBERS) return { status: 409, message: "This club is full" } as Fail;
    const [added] = await tx.insert(clubMembers).values({ userId, clubId, role }).onConflictDoNothing().returning();
    if (!added) return { status: 409, message: "Already in a club" } as Fail;
    await tx.delete(clubRequests).where(eq(clubRequests.userId, userId));
    return true as const;
  });
  if (r === true) {
    await syncClub(clubId);
    pushClub(clubId, { t: "club", action: "members", clubId });
  }
  return r;
}

async function removeMember(clubId: number, userId: string) {
  await db.delete(clubMembers).where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)));
  await syncClub(clubId);
  pushClub(clubId, { t: "club", action: "members", clubId });
  push(userId, { t: "club", action: "left", clubId });
}

function clubIdParam(req: Request) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function registerClubRoutes(app: Express, requireUser: Mw, requireAdmin: Mw) {
  const me = (res: Response) => res.locals.user as User;
  const fail = (res: Response, f: Fail) => res.status(f.status).json({ message: f.message });

  app.get("/api/clubs", requireUser, async (req, res) => {
    const u = me(res);
    const q = String(req.query.q ?? "").trim().toLowerCase().slice(0, 30);
    const all = await standings();
    const list = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q)) : all;
    const mine = byUser.get(u.id);
    const requested = (await db.select({ id: clubRequests.clubId }).from(clubRequests).where(eq(clubRequests.userId, u.id))).map((r) => r.id);
    const [last] = await db.select().from(clubWeeks).orderBy(desc(clubWeeks.week)).limit(1);
    res.json({
      clubs: list.slice(0, 60), top: all.filter((c) => c.weeklyXp > 0).slice(0, 10),
      mine: mine ? all.find((c) => c.id === mine.id) ?? null : null, myRole: mine?.role ?? null, requested,
      fee: CLUB_FEE, maxMembers: CLUB_MAX_MEMBERS, rewards: CLUB_WEEKLY_REWARDS, emblems: CLUB_EMBLEMS, colors: CLUB_COLORS,
      weekStart: vnWeekStart(new Date()).toISOString(), lastWeek: last ? { week: last.week, winners: last.winners } : null,
    });
  });

  app.post("/api/clubs", requireUser, async (req, res) => {
    const r = await createClub(me(res), req.body);
    if ("status" in r) return fail(res, r);
    res.json(r);
  });

  app.get("/api/clubs/:id", requireUser, async (req, res) => {
    const id = clubIdParam(req);
    const [c] = id ? await db.select().from(clubs).where(eq(clubs.id, id)) : [];
    if (!c) return res.status(404).json({ message: "Club not found" });
    res.json(await clubView(c, me(res)));
  });

  app.get("/api/clubs/:id/activity", requireUser, async (req, res) => {
    const id = clubIdParam(req);
    if (!id) return res.status(404).json({ message: "Club not found" });
    res.json({ items: await clubActivity(id) });
  });

  app.post("/api/clubs/:id/join", requireUser, async (req, res) => {
    const u = me(res);
    const id = clubIdParam(req);
    const [c] = id ? await db.select().from(clubs).where(eq(clubs.id, id)) : [];
    if (!c) return res.status(404).json({ message: "Club not found" });
    if (u.gamesPlayed < SOCIAL_MIN_GAMES && !u.isAdmin) return res.status(403).json({ message: "play_first" });
    if (byUser.has(u.id)) return res.status(409).json({ message: "You're already in a club" });
    if ((kicked.get(`${c.id}:${u.id}`) ?? 0) > Date.now()) return res.status(403).json({ message: "You were removed from this club recently" });
    if (c.open) {
      const r = await addMember(c.id, u.id);
      if (r !== true) return fail(res, r);
      return res.json({ joined: true });
    }
    const [{ n }] = await db.select({ n: count() }).from(clubRequests).where(eq(clubRequests.clubId, c.id));
    if (n >= CLUB_MAX_REQUESTS) return res.status(409).json({ message: "This club has too many requests waiting" });
    const [made] = await db.insert(clubRequests).values({ clubId: c.id, userId: u.id }).onConflictDoNothing().returning();
    if (made) {
      for (const m of byClub.get(c.id) ?? []) {
        const role = byUser.get(m)?.role;
        if (role && clubAllowed(role, "approve")) await notify(m, "club", u.id, { action: "request", clubId: c.id, club: c.name }, `clubreq:${c.id}:${u.id}`);
      }
    }
    res.json({ joined: false, requested: true });
  });

  app.post("/api/clubs/:id/cancel-request", requireUser, async (req, res) => {
    const id = clubIdParam(req);
    if (!id) return res.status(404).json({ message: "Club not found" });
    await db.delete(clubRequests).where(and(eq(clubRequests.clubId, id), eq(clubRequests.userId, me(res).id)));
    res.json({ ok: true });
  });

  app.post("/api/clubs/:id/requests", requireUser, async (req, res) => {
    const u = me(res);
    const id = clubIdParam(req);
    const accept = req.body?.accept;
    if (!id || typeof accept !== "boolean") return res.status(400).json({ message: "Bad request" });
    const mine = byUser.get(u.id);
    if (!mine || mine.id !== id || !clubAllowed(mine.role, "approve")) return res.status(403).json({ message: "Only the club's leaders can do that" });
    const other = await findPlayer(req.body?.username);
    if (!other) return res.status(404).json({ message: "Player not found" });
    const [reqRow] = await db.select().from(clubRequests).where(and(eq(clubRequests.clubId, id), eq(clubRequests.userId, other.id)));
    if (!reqRow) return res.status(404).json({ message: "No request from this player" });
    if (!accept) {
      await db.delete(clubRequests).where(and(eq(clubRequests.clubId, id), eq(clubRequests.userId, other.id)));
      return res.json({ ok: true });
    }
    const r = await addMember(id, other.id);
    if (r !== true) {
      if (r.message === "Already in a club") await db.delete(clubRequests).where(and(eq(clubRequests.clubId, id), eq(clubRequests.userId, other.id)));
      return fail(res, r);
    }
    await notify(other.id, "club", u.id, { action: "accepted", clubId: id, club: mine.name });
    res.json({ ok: true });
  });

  app.post("/api/clubs/:id/leave", requireUser, async (req, res) => {
    const u = me(res);
    const id = clubIdParam(req);
    const mine = byUser.get(u.id);
    if (!id || !mine || mine.id !== id) return res.status(404).json({ message: "You're not in this club" });
    if (mine.role === "owner") {
      if ((byClub.get(id)?.size ?? 0) > 1) return res.status(409).json({ message: "Hand the club to another member first" });
      await disbandClub(id, "empty");
      return res.json({ ok: true, disbanded: true });
    }
    await removeMember(id, u.id);
    res.json({ ok: true });
  });

  app.post("/api/clubs/:id/members", requireUser, async (req, res) => {
    const u = me(res);
    const id = clubIdParam(req);
    const action = req.body?.action;
    if (!id || !["kick", "promote", "demote", "transfer"].includes(action)) return res.status(400).json({ message: "Bad request" });
    const mine = byUser.get(u.id);
    const other = await findPlayer(req.body?.username);
    const theirs = other ? byUser.get(other.id) : undefined;
    if (!mine || mine.id !== id || !other || !theirs || theirs.id !== id) return res.status(404).json({ message: "Player not found" });
    if (other.id === u.id || !clubAllowed(mine.role, action, theirs.role)) return res.status(403).json({ message: "You can't do that" });
    if (action === "kick") {
      await removeMember(id, other.id);
      kicked.set(`${id}:${other.id}`, Date.now() + KICK_COOLDOWN_MS);
      if (kicked.size > 20000) kicked.clear();
      await notify(other.id, "club", null, { action: "kicked", clubId: id, club: mine.name });
    } else if (action === "transfer") {
      await db.transaction(async (tx) => {
        await tx.update(clubMembers).set({ role: "officer" }).where(eq(clubMembers.userId, u.id));
        await tx.update(clubMembers).set({ role: "owner" }).where(eq(clubMembers.userId, other.id));
        await tx.update(clubs).set({ ownerId: other.id }).where(eq(clubs.id, id));
      });
      await notify(other.id, "club", u.id, { action: "owner", clubId: id, club: mine.name });
    } else {
      await db.update(clubMembers).set({ role: action === "promote" ? "officer" : "member" }).where(eq(clubMembers.userId, other.id));
      if (action === "promote") await notify(other.id, "club", u.id, { action: "officer", clubId: id, club: mine.name });
    }
    await syncClub(id);
    pushClub(id, { t: "club", action: "members", clubId: id });
    res.json({ ok: true });
  });

  app.put("/api/clubs/:id", requireUser, async (req, res) => {
    const u = me(res);
    const id = clubIdParam(req);
    const mine = byUser.get(u.id);
    if (!id || !mine || mine.id !== id || !clubAllowed(mine.role, "edit")) return res.status(403).json({ message: "Only the club owner can do that" });
    const parsed = editSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const set: Partial<ClubRow> = {};
    if (parsed.data.description !== undefined) {
      const no = speakerRefusal(u);
      if (no) return res.status(no.status).json({ message: no.message });
      const d = cleanDescription(parsed.data.description);
      if (!("ok" in d)) return fail(res, d);
      set.description = d.text;
    }
    if (parsed.data.emblem !== undefined) {
      if (!(CLUB_EMBLEMS as readonly string[]).includes(parsed.data.emblem)) return res.status(400).json({ message: "Pick an emblem from the list" });
      set.emblem = parsed.data.emblem;
    }
    if (parsed.data.color !== undefined) {
      if (!(CLUB_COLORS as readonly string[]).includes(parsed.data.color)) return res.status(400).json({ message: "Pick a colour from the list" });
      set.color = parsed.data.color;
    }
    if (parsed.data.open !== undefined) set.open = parsed.data.open;
    if (Object.keys(set).length) await db.update(clubs).set(set).where(eq(clubs.id, id));
    await syncClub(id);
    pushClub(id, { t: "club", action: "info", clubId: id });
    res.json({ ok: true });
  });

  app.post("/api/clubs/:id/disband", requireUser, async (req, res) => {
    const u = me(res);
    const id = clubIdParam(req);
    const mine = byUser.get(u.id);
    if (!id || !mine || mine.id !== id || !clubAllowed(mine.role, "disband")) return res.status(403).json({ message: "Only the club owner can do that" });
    await disbandClub(id, "owner");
    res.json({ ok: true });
  });

  // ---- Club chat ----
  app.get("/api/clubs/:id/chat", requireUser, async (req, res) => {
    const u = me(res);
    const id = clubIdParam(req);
    if (!id || byUser.get(u.id)?.id !== id) return res.status(403).json({ message: "Only members can read the club chat" });
    const after = Number(req.query.after);
    const rows = Number.isInteger(after) && after > 0
      ? await db.select().from(clubMessages).where(and(eq(clubMessages.clubId, id), eq(clubMessages.deleted, false), gt(clubMessages.id, after))).orderBy(asc(clubMessages.id)).limit(100)
      : (await db.select().from(clubMessages).where(and(eq(clubMessages.clubId, id), eq(clubMessages.deleted, false))).orderBy(desc(clubMessages.id)).limit(60)).reverse();
    const removed = await db.select({ id: clubMessages.id }).from(clubMessages)
      .where(and(eq(clubMessages.clubId, id), eq(clubMessages.deleted, true), gt(clubMessages.createdAt, new Date(Date.now() - 6 * 3600_000)))).limit(200);
    res.json({ messages: await chatOut(rows), removed: removed.map((r) => r.id) });
  });

  app.post("/api/clubs/:id/chat", requireUser, async (req, res) => {
    const u = me(res);
    const id = clubIdParam(req);
    if (!id || byUser.get(u.id)?.id !== id) return res.status(403).json({ message: "Only members can write in the club chat" });
    const no = speakerRefusal(u);
    if (no) return res.status(no.status).json({ message: no.message, until: no.until });
    const early = clubChatPace.check(u, null);
    if (early) return res.status(early.status).json({ message: early.message });
    const msg = await readMessage(u, req.body, undefined, { scope: "club", ref: String(id) });
    if ("status" in msg) return res.status(msg.status).json({ message: msg.message });
    const again = msg.text ? clubChatPace.check(u, msg.text) : null;
    if (again) return res.status(again.status).json({ message: again.message });
    clubChatPace.record(u, msg.text);
    const [m] = await db.insert(clubMessages).values({ clubId: id, userId: u.id, username: u.username, text: msg.text, sticker: msg.sticker, photoId: msg.photoId }).returning();
    const [out] = await chatOut([m]);
    pushClub(id, { t: "club_chat", clubId: id, m: out });
    await questEvent(u.id, "chat", `club:${m.id}`);
    res.json(out);
  });

  app.post("/api/clubs/chat/:msgId/report", requireUser, async (req, res) => {
    const u = me(res);
    const msgId = Number(req.params.msgId);
    if (!Number.isInteger(msgId)) return res.status(400).json({ message: "Bad id" });
    const [m] = await db.select().from(clubMessages).where(eq(clubMessages.id, msgId));
    // Only members of that club can see (and so report) its messages
    if (!m || byUser.get(u.id)?.id !== m.clubId) return res.status(404).json({ message: "Not found" });
    if (m.userId === u.id) return res.status(400).json({ message: "That's your own message" });
    await db.insert(clubChatReports).values({ messageId: msgId, reporterId: u.id }).onConflictDoNothing();
    const [{ n }] = await db.select({ n: count() }).from(clubChatReports).where(eq(clubChatReports.messageId, msgId));
    if (n >= CHAT_AUTO_HIDE_REPORTS && !m.deleted) {
      await db.update(clubMessages).set({ deleted: true }).where(eq(clubMessages.id, msgId));
      pushClub(m.clubId, { t: "club_chat_removed", clubId: m.clubId, ids: [msgId] });
    }
    res.json({ ok: true });
  });

  // ---- Admin ----
  app.get("/api/admin/clubs", requireAdmin, async (_req, res) => {
    const all = await standings();
    const owners = await db.select({ id: clubs.id, owner: users.username }).from(clubs).leftJoin(users, eq(users.id, clubs.ownerId));
    const ownerOf = new Map(owners.map((o) => [o.id, o.owner]));
    const weeks = await db.select().from(clubWeeks).orderBy(desc(clubWeeks.week)).limit(8);
    res.json({ clubs: all.map((c) => ({ ...c, owner: ownerOf.get(c.id) ?? null })), weeks });
  });

  app.post("/api/admin/clubs/:id/rename", requireAdmin, async (req, res) => {
    const id = clubIdParam(req);
    const name = checkClubName(req.body?.name);
    if (!id || !name.ok) return res.status(400).json({ message: name.ok ? "Bad request" : name.reason });
    const set: Partial<ClubRow> = { name: name.name };
    if (req.body?.tag !== undefined) {
      const tag = checkClubTag(req.body.tag);
      if (!tag.ok) return res.status(400).json({ message: tag.reason });
      set.tag = tag.tag;
    }
    if (req.body?.clearDescription) set.description = null;
    try {
      const [c] = await db.update(clubs).set(set).where(eq(clubs.id, id)).returning();
      if (!c) return res.status(404).json({ message: "Club not found" });
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ message: "That club name is taken" });
      throw e;
    }
    await syncClub(id);
    pushClub(id, { t: "club", action: "info", clubId: id });
    res.json({ ok: true });
  });

  app.post("/api/admin/clubs/:id/disband", requireAdmin, async (req, res) => {
    const id = clubIdParam(req);
    if (!id || !(await disbandClub(id, "admin"))) return res.status(404).json({ message: "Club not found" });
    res.json({ ok: true });
  });

  app.post("/api/admin/clubs/messages/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const hidden = req.body?.hidden;
    if (!Number.isInteger(id) || typeof hidden !== "boolean") return res.status(400).json({ message: "Bad request" });
    const [m] = await db.update(clubMessages).set({ deleted: hidden }).where(eq(clubMessages.id, id)).returning();
    if (!m) return res.status(404).json({ message: "Not found" });
    // Hiding settles the reports too; restoring means they were wrong
    await db.delete(clubChatReports).where(eq(clubChatReports.messageId, id));
    if (hidden) pushClub(m.clubId, { t: "club_chat_removed", clubId: m.clubId, ids: [id] });
    res.json({ ok: true });
  });
}

/** Reported club chat for the admin's reports queue */
export async function reportedClubMessages() {
  const rows = (await db.execute(sql`
    select m.id, m.club_id, m.user_id, m.username, m.text, m.sticker, m.deleted, m.created_at, c.name as club, c.emblem,
      u.muted_until, u.banned, count(r.id)::int as reports, max(r.created_at) as last_at
    from ${clubChatReports} r join ${clubMessages} m on m.id = r.message_id
    left join ${clubs} c on c.id = m.club_id left join ${users} u on u.id = m.user_id
    group by m.id, c.name, c.emblem, u.muted_until, u.banned
    order by max(r.created_at) desc limit 50`)).rows as Record<string, any>[];
  return rows.map((r) => ({
    id: r.id, clubId: r.club_id, club: r.club ?? "?", emblem: r.emblem ?? "", userId: r.user_id, username: r.username, text: r.text, sticker: r.sticker,
    deleted: !!r.deleted, createdAt: new Date(r.created_at).toISOString(), reports: r.reports, lastAt: new Date(r.last_at).toISOString(),
    mutedUntil: r.muted_until ? new Date(r.muted_until).toISOString() : null, banned: !!r.banned,
  }));
}

/** The player's profile: which club they're in */
export function clubProfileOf(userId: string) {
  const m = byUser.get(userId);
  return m ? { id: m.id, name: m.name, tag: m.tag, emblem: m.emblem, color: m.color, role: m.role } : null;
}

/**
 * Account deletion (inside its transaction): their membership, requests, chat and reports go.
 * An owner's club passes to its longest-serving officer (or member); a club left empty is disbanded.
 */
export async function deleteClubData(tx: Tx, userId: string) {
  const [mine] = await tx.select().from(clubMembers).where(eq(clubMembers.userId, userId));
  const myMsgs = tx.select({ id: clubMessages.id }).from(clubMessages).where(eq(clubMessages.userId, userId));
  await tx.delete(clubChatReports).where(inArray(clubChatReports.messageId, myMsgs));
  await tx.delete(clubChatReports).where(eq(clubChatReports.reporterId, userId));
  await tx.delete(clubMessages).where(eq(clubMessages.userId, userId));
  await tx.delete(clubRequests).where(eq(clubRequests.userId, userId));
  await tx.delete(clubRewardPayouts).where(eq(clubRewardPayouts.userId, userId));
  await tx.delete(clubMembers).where(eq(clubMembers.userId, userId));
  if (!mine) return null;
  if (mine.role === "owner") {
    const [heir] = await tx.select().from(clubMembers).where(eq(clubMembers.clubId, mine.clubId))
      .orderBy(sql`case when ${clubMembers.role} = 'officer' then 0 else 1 end`, asc(clubMembers.joinedAt)).limit(1);
    if (heir) {
      await tx.update(clubMembers).set({ role: "owner" }).where(eq(clubMembers.userId, heir.userId));
      await tx.update(clubs).set({ ownerId: heir.userId }).where(eq(clubs.id, mine.clubId));
    } else {
      const msgs = tx.select({ id: clubMessages.id }).from(clubMessages).where(eq(clubMessages.clubId, mine.clubId));
      await tx.delete(clubChatReports).where(inArray(clubChatReports.messageId, msgs));
      await tx.delete(clubMessages).where(eq(clubMessages.clubId, mine.clubId));
      await tx.delete(clubRequests).where(eq(clubRequests.clubId, mine.clubId));
      await tx.delete(ugcReports).where(and(eq(ugcReports.kind, "club"), eq(ugcReports.targetId, mine.clubId)));
      await tx.delete(clubs).where(eq(clubs.id, mine.clubId));
    }
  }
  return mine.clubId;
}

/** After deletion has committed: memory catches up */
export async function afterClubDataDeleted(userId: string, clubId: number | null) {
  byUser.delete(userId);
  if (clubId) { await syncClub(clubId); pushClub(clubId, { t: "club", action: "members", clubId }); }
}
