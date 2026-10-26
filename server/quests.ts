/**
 * Daily quests: three per player per Vietnam day, at least one of them social. Progress is
 * counted from what really happened: game quests straight from game_plays, social ones from
 * quest_events (written by small questEvent() calls; each event has a ref so it counts once).
 * Rewards, the chest for finishing all three and the 7-day streak bonus are made by the game
 * and logged as bonuses (method "daily_quest").
 */
import type { Express, Request, Response, NextFunction } from "express";
import { randomInt } from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { users, deposits, dailyQuests, questEvents, questChests } from "@shared/schema";
import {
  QUESTS, QUEST_BY_ID, QUEST_CHEST, QUEST_STREAK_DAYS, QUEST_STREAK_BONUS, PLAY_QUEST_KINDS,
  drawQuests, streakOf, type QuestKind, type EventQuestKind,
} from "@shared/social3";
import { PLAY_GAME_TO_PLAYABLE } from "@shared/friends";
import { vnDay } from "@shared/league";
import { notify, areFriends } from "./friends";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export const QUEST_BONUS_METHOD = "daily_quest";
const VN = 7 * 3600_000;
/** Vietnam midnight starting a day, as a UTC instant */
const dayStart = (day: string) => new Date(new Date(`${day}T00:00:00Z`).getTime() - VN);
const prevDay = (day: string) => new Date(new Date(`${day}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);

/** Today's three quests for a player, drawn the first time they're needed */
async function questsFor(userId: string, day: string, q: Db = db) {
  let rows = await q.select().from(dailyQuests).where(and(eq(dailyQuests.userId, userId), eq(dailyQuests.day, day))).orderBy(dailyQuests.slot);
  if (rows.length) return rows;
  const picks = drawQuests((n) => randomInt(n));
  // One statement, so two tabs drawing at once can't mix their picks
  await q.insert(dailyQuests).values(picks.map((p, slot) => ({ userId, day, slot, questId: p.id }))).onConflictDoNothing();
  rows = await q.select().from(dailyQuests).where(and(eq(dailyQuests.userId, userId), eq(dailyQuests.day, day))).orderBy(dailyQuests.slot);
  return rows;
}

/** How far a player has got with every kind of quest today */
export async function progressOf(userId: string, day: string, q: Db = db): Promise<Record<QuestKind, number>> {
  const from = dayStart(day), to = new Date(dayStart(day).getTime() + 86_400_000);
  const [p] = (await q.execute(sql`
    select count(*) filter (where game in ('slot', 'slot777'))::int as spins,
      count(*)::int as plays,
      count(*) filter (where payout > bet)::int as wins,
      count(*) filter (where game = 'horse' and payout > bet)::int as horse_win,
      coalesce(array_agg(distinct game), '{}') as games
    from game_plays where user_id = ${userId} and created_at >= ${from} and created_at < ${to}`)).rows as Record<string, any>[];
  const events = await q.select({ kind: questEvents.kind, n: sql<number>`count(*)::int` }).from(questEvents)
    .where(and(eq(questEvents.userId, userId), eq(questEvents.day, day))).groupBy(questEvents.kind);
  const ev = new Map(events.map((e) => [e.kind, Number(e.n)]));
  const games = new Set(((p?.games ?? []) as string[]).filter(Boolean).map((g) => PLAY_GAME_TO_PLAYABLE[g] ?? g));
  return {
    spins: Number(p?.spins ?? 0), plays: Number(p?.plays ?? 0), wins: Number(p?.wins ?? 0), horse_win: Number(p?.horse_win ?? 0), games: games.size,
    friend_match: ev.get("friend_match") ?? 0, chat: ev.get("chat") ?? 0, react: ev.get("react") ?? 0, gift: ev.get("gift") ?? 0,
    moment: ev.get("moment") ?? 0, like: ev.get("like") ?? 0,
  };
}

/** Rings the bell for quests that just got done (once each: the notified flag is set conditionally) */
async function announceDone(userId: string, day: string, kinds?: QuestKind[]) {
  const rows = await db.select().from(dailyQuests).where(and(eq(dailyQuests.userId, userId), eq(dailyQuests.day, day), eq(dailyQuests.notified, false), isNull(dailyQuests.claimedAt)));
  const todo = rows.filter((r) => { const d = QUEST_BY_ID.get(r.questId); return d && (!kinds || kinds.includes(d.kind)); });
  if (!todo.length) return;
  const prog = await progressOf(userId, day);
  for (const r of todo) {
    const d = QUEST_BY_ID.get(r.questId)!;
    if (prog[d.kind] < d.target) continue;
    const [won] = await db.update(dailyQuests).set({ notified: true })
      .where(and(eq(dailyQuests.userId, userId), eq(dailyQuests.day, day), eq(dailyQuests.slot, r.slot), eq(dailyQuests.notified, false))).returning();
    if (won) await notify(userId, "quest", null, { questId: d.id, reward: d.reward, slot: r.slot }, `quest:${day}:${r.slot}`);
  }
}

/**
 * Records a social thing a player did, for their quests. Safe to call more than once with the
 * same ref (it counts once) and never throws (a failure only costs quest progress).
 */
export async function questEvent(userId: string, kind: EventQuestKind, ref: string): Promise<void> {
  try {
    const day = vnDay(new Date());
    const [added] = await db.insert(questEvents).values({ userId, day, kind, ref: ref.slice(0, 120) }).onConflictDoNothing().returning();
    if (added) await announceDone(userId, day, [kind]);
  } catch (e) {
    console.error("[quest event]", e);
  }
}

/** A finished match between real players: every pair of friends among them did "play a friend" */
export async function questFriendMatch(players: string[], ref: string): Promise<void> {
  const ids = [...new Set(players.filter(Boolean))];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    try {
      if (!(await areFriends(ids[i], ids[j]))) continue;
      await questEvent(ids[i], "friend_match", `${ref}:${ids[j]}`);
      await questEvent(ids[j], "friend_match", `${ref}:${ids[i]}`);
    } catch (e) { console.error("[quest match]", e); }
  }
}

// ---- Game quests: noticed from game_plays every few seconds ----

let scannedUpTo = -1;
/** Players with new plays since the last look: tell them about game quests they just finished */
export async function questTick() {
  if (scannedUpTo < 0) {
    const [m] = (await db.execute(sql`select coalesce(max(id), 0)::int as m from game_plays`)).rows as { m: number }[];
    scannedUpTo = Math.max(0, Number(m?.m ?? 0) - 2000);
  }
  const rows = (await db.execute(sql`select user_id, max(id)::int as m from game_plays where id > ${scannedUpTo} group by user_id limit 2000`)).rows as { user_id: string; m: number }[];
  if (!rows.length) return;
  scannedUpTo = Math.max(scannedUpTo, ...rows.map((r) => Number(r.m)));
  const day = vnDay(new Date());
  for (const r of rows) await announceDone(r.user_id, day, PLAY_QUEST_KINDS).catch((e) => console.error("[quest tick]", e));
}

export function startQuestTicker(httpServer: { on: (e: "close", f: () => void) => unknown }) {
  const timer = setInterval(() => { questTick().catch((e) => console.error("[quest tick]", e)); }, 6000);
  timer.unref?.();
  httpServer.on("close", () => clearInterval(timer));
}

// ---- View, claim, chest ----

async function chestDays(userId: string, q: Db = db) {
  const rows = await q.select({ day: questChests.day }).from(questChests).where(eq(questChests.userId, userId)).orderBy(desc(questChests.day)).limit(QUEST_STREAK_DAYS * 2);
  return rows.map((r) => r.day);
}

export async function questView(userId: string) {
  const now = new Date();
  const day = vnDay(now);
  const rows = await questsFor(userId, day);
  const prog = await progressOf(userId, day);
  const days = await chestDays(userId);
  const chestToday = days.includes(day);
  const streak = streakOf(days, chestToday ? day : prevDay(day));
  const quests = rows.map((r) => {
    const d = QUEST_BY_ID.get(r.questId) ?? QUESTS[0];
    return { slot: r.slot, id: d.id, kind: d.kind, icon: d.icon, social: d.social, target: d.target, reward: d.reward, progress: Math.min(d.target, prog[d.kind]), claimed: !!r.claimedAt };
  });
  const cycle = streak % QUEST_STREAK_DAYS;
  return {
    day,
    resetsAt: new Date(dayStart(day).getTime() + 86_400_000).toISOString(),
    quests,
    chest: { amount: QUEST_CHEST, claimed: chestToday, ready: !chestToday && quests.every((x) => x.claimed) },
    // Days in a row with the chest opened; the bonus comes with the 7th, 14th, … chest
    streak: { days: streak, inCycle: chestToday ? (cycle === 0 && streak > 0 ? QUEST_STREAK_DAYS : cycle) : cycle, target: QUEST_STREAK_DAYS, bonus: QUEST_STREAK_BONUS },
  };
}

async function credit(tx: Tx, userId: string, amount: number) {
  const [u] = await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId)).returning({ balance: users.balance });
  await tx.insert(deposits).values({ userId, amount, method: QUEST_BONUS_METHOD });
  return u.balance;
}

type Fail = { status: number; message: string };

export async function claimQuest(userId: string, slot: number): Promise<{ reward: number; balance: number } | Fail> {
  const day = vnDay(new Date());
  return db.transaction(async (tx) => {
    // The player's row is the lock: two taps can't both claim
    await tx.execute(sql`select id from ${users} where id = ${userId} for update`);
    const [row] = await tx.select().from(dailyQuests).where(and(eq(dailyQuests.userId, userId), eq(dailyQuests.day, day), eq(dailyQuests.slot, slot)));
    if (!row) return { status: 404, message: "No such quest" };
    if (row.claimedAt) return { status: 409, message: "Already claimed" };
    const d = QUEST_BY_ID.get(row.questId);
    if (!d) return { status: 404, message: "No such quest" };
    const prog = await progressOf(userId, day, tx);
    if (prog[d.kind] < d.target) return { status: 409, message: "Quest not finished yet" };
    await tx.update(dailyQuests).set({ claimedAt: new Date(), notified: true }).where(and(eq(dailyQuests.userId, userId), eq(dailyQuests.day, day), eq(dailyQuests.slot, slot)));
    return { reward: d.reward, balance: await credit(tx, userId, d.reward) };
  });
}

export async function claimChest(userId: string): Promise<{ amount: number; streakBonus: number; streak: number; balance: number } | Fail> {
  const day = vnDay(new Date());
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${users} where id = ${userId} for update`);
    const rows = await tx.select().from(dailyQuests).where(and(eq(dailyQuests.userId, userId), eq(dailyQuests.day, day)));
    if (rows.length < 3 || rows.some((r) => !r.claimedAt)) return { status: 409, message: "Finish all three quests first" };
    const [chest] = await tx.insert(questChests).values({ userId, day, amount: QUEST_CHEST }).onConflictDoNothing().returning();
    if (!chest) return { status: 409, message: "Already claimed" };
    const streak = streakOf(await chestDays(userId, tx), day);
    const bonus = streak > 0 && streak % QUEST_STREAK_DAYS === 0 ? QUEST_STREAK_BONUS : 0;
    let balance = await credit(tx, userId, QUEST_CHEST);
    if (bonus) {
      await tx.update(questChests).set({ streakBonus: bonus }).where(and(eq(questChests.userId, userId), eq(questChests.day, day)));
      balance = await credit(tx, userId, bonus);
    }
    return { amount: QUEST_CHEST, streakBonus: bonus, streak, balance };
  });
}

export function registerQuestRoutes(app: Express, requireUser: Mw) {
  app.get("/api/quests", requireUser, async (_req, res) => {
    res.json(await questView(res.locals.user.id));
  });
  app.post("/api/quests/:slot/claim", requireUser, async (req, res) => {
    const slot = Number(req.params.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) return res.status(400).json({ message: "Bad request" });
    const r = await claimQuest(res.locals.user.id, slot);
    if ("status" in r) return res.status(r.status).json({ message: r.message });
    res.json(r);
  });
  app.post("/api/quests/chest", requireUser, async (_req, res) => {
    const r = await claimChest(res.locals.user.id);
    if ("status" in r) return res.status(r.status).json({ message: r.message });
    res.json(r);
  });
}

export async function deleteQuestData(tx: Tx, userId: string) {
  await tx.delete(dailyQuests).where(eq(dailyQuests.userId, userId));
  await tx.delete(questEvents).where(eq(questEvents.userId, userId));
  await tx.delete(questChests).where(eq(questChests.userId, userId));
}

