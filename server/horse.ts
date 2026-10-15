/**
 * Đua Ngựa: a race a minute, shared by everyone. A race's prices and result are drawn (crypto
 * randomness) the first time anyone needs the round, kept secret until the gates open, and bets
 * are paid by a timer once the race is over, so a restart never loses a payout.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { randomInt } from "crypto";
import { z } from "zod";
import { and, desc, eq, lt, lte, sql, inArray } from "drizzle-orm";
import { db } from "./db";
import { users, horseRounds, horseBets, chatMessages, type User } from "@shared/schema";
import {
  HORSES, HORSE_COUNT, HORSE_CHANCES, HORSE_MAX_PER_RACE, HORSE_CLOSE_EARLY_MS, HORSE_BIG_WIN,
  horseRoundAt, horseRoundTimes, horseOdds10, horsePayout, shuffled, drawOrder,
  type HorseView, type HorseBetView,
} from "@shared/horse";
import { logPlay } from "./storage";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type RoundRow = typeof horseRounds.$inferSelect;
const fmt = (n: number) => n.toLocaleString("vi-VN");
const rand = (n: number) => randomInt(n);

/** The round's prices and result, made the first time anyone needs them (race-safe) */
export async function horseRound(round: number): Promise<RoundRow> {
  const [have] = await db.select().from(horseRounds).where(eq(horseRounds.round, round));
  if (have) return have;
  const chances = shuffled(HORSE_CHANCES, rand);
  const order = drawOrder(chances, rand);
  await db.insert(horseRounds).values({
    round, chances, odds: chances.map(horseOdds10), winner: order[0], finishOrder: order, seed: randomInt(2 ** 31 - 1),
  }).onConflictDoNothing();
  const [row] = await db.select().from(horseRounds).where(eq(horseRounds.round, round));
  return row;
}

function betView(b: typeof horseBets.$inferSelect): HorseBetView {
  return {
    id: b.id, round: b.round, horse: b.horse, amount: b.amount, odds10: b.odds,
    status: !b.settled ? "pending" : (b.payout ?? 0) > 0 ? "won" : "lost",
    payout: b.settled ? b.payout ?? 0 : null,
  };
}

export async function horseView(user: User, now = Date.now()): Promise<HorseView> {
  const r = horseRoundAt(now);
  const row = await horseRound(r.round);
  const raced = now >= r.raceStart;
  const mine = await db.select().from(horseBets)
    .where(and(eq(horseBets.round, r.round), eq(horseBets.userId, user.id))).orderBy(horseBets.id);
  const history = await db.select().from(horseBets)
    .where(and(lt(horseBets.round, r.round), eq(horseBets.userId, user.id))).orderBy(desc(horseBets.id)).limit(10);
  const byHorse = await db.select({
    horse: horseBets.horse, amount: sql<number>`coalesce(sum(${horseBets.amount}), 0)::bigint`, players: sql<number>`count(distinct ${horseBets.userId})::int`,
  }).from(horseBets).where(eq(horseBets.round, r.round)).groupBy(horseBets.horse);
  const [count] = await db.select({ players: sql<number>`count(distinct ${horseBets.userId})::int` })
    .from(horseBets).where(eq(horseBets.round, r.round));
  // The last races' winners; this race's only once it's over
  const past = await db.select({ round: horseRounds.round, winner: horseRounds.winner, odds: horseRounds.odds })
    .from(horseRounds).where(now >= r.raceEnd ? lte(horseRounds.round, r.round) : lt(horseRounds.round, r.round))
    .orderBy(desc(horseRounds.round)).limit(10);
  const [me] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, user.id));
  const pool = Array.from({ length: HORSE_COUNT }, () => ({ amount: 0, players: 0 }));
  for (const p of byHorse) pool[p.horse] = { amount: Number(p.amount), players: p.players };
  return {
    serverNow: now, round: r.round, start: r.start, raceStart: r.raceStart, raceEnd: r.raceEnd, end: r.end,
    odds10: row.odds,
    // The result stays on the server until the gates open
    race: raced ? { seed: row.seed, order: row.finishOrder } : null,
    pool, players: count?.players ?? 0,
    mine: mine.map(betView), history: history.map(betView),
    winners: past.map((p) => ({ round: p.round, horse: p.winner, odds10: p.odds[p.winner] })),
    balance: me?.balance ?? 0,
  };
}

const betSchema = z.object({
  bets: z.array(z.object({
    horse: z.number().int().min(0, "Pick a horse").max(HORSE_COUNT - 1, "Pick a horse"),
    amount: z.number().int().min(1000, "Bets come in chips of 1,000 coins or more")
      .refine((a) => a % 1000 === 0, "Bets come in chips of 1,000 coins or more"),
  })).min(1, "Pick a horse").max(HORSE_COUNT * 4),
});

export async function placeHorseBets(userId: string, body: unknown, now = Date.now()) {
  const parsed = betSchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Bad request" } as const;
  // One row per horse
  const byHorse = new Map<number, number>();
  for (const b of parsed.data.bets) byHorse.set(b.horse, (byHorse.get(b.horse) ?? 0) + b.amount);
  const total = [...byHorse.values()].reduce((a, b) => a + b, 0);
  const tooMuch = "At most 5,000,000 coins on one race";
  if (total > HORSE_MAX_PER_RACE) return { error: tooMuch } as const;
  const r = horseRoundAt(now);
  if (now > r.raceStart - HORSE_CLOSE_EARLY_MS) return { error: "Betting has closed for this race. Wait for the next one!", code: "closed" } as const;
  const row = await horseRound(r.round);
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [{ sum }] = await tx.select({ sum: sql<number>`coalesce(sum(${horseBets.amount}), 0)::bigint` }).from(horseBets)
      .where(and(eq(horseBets.round, r.round), eq(horseBets.userId, userId)));
    if (Number(sum) + total > HORSE_MAX_PER_RACE) return { error: tooMuch } as const;
    const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${total}` })
      .where(and(eq(users.id, userId), sql`${users.balance} >= ${total}`)).returning({ balance: users.balance });
    if (!paid) return { error: "Not enough coins" } as const;
    const rows = await tx.insert(horseBets).values([...byHorse].map(([horse, amount]) => ({
      round: r.round, userId, horse, amount, odds: row.odds[horse],
    }))).returning();
    return { balance: paid.balance, bets: rows.map(betView) };
  });
}

/** Pays every bet on a race that has finished, each exactly once */
export async function settleHorse(now = Date.now()) {
  const current = horseRoundAt(now).round;
  const due = (await db.select().from(horseBets)
    .where(and(eq(horseBets.settled, false), lte(horseBets.round, current))))
    .filter((b) => now >= horseRoundTimes(b.round).raceEnd);
  if (!due.length) return 0;
  const rounds = new Map<number, RoundRow>();
  const rows = await db.select().from(horseRounds).where(inArray(horseRounds.round, [...new Set(due.map((b) => b.round))]));
  for (const row of rows) rounds.set(row.round, row);
  const won = new Map<string, { round: number; userId: string; horse: number; odds: number; payout: number }>();
  for (const b of due) {
    const round = rounds.get(b.round) ?? await horseRound(b.round);
    const payout = b.horse === round.winner ? horsePayout(b.amount, b.odds) : 0;
    const paid = await db.transaction(async (tx) => {
      const [bet] = await tx.update(horseBets).set({ settled: true, payout })
        .where(and(eq(horseBets.id, b.id), eq(horseBets.settled, false))).returning();
      if (!bet) return false;
      await tx.update(users).set({
        balance: payout > 0 ? sql`${users.balance} + ${payout}` : users.balance,
        totalWins: payout > bet.amount ? sql`${users.totalWins} + 1` : users.totalWins,
        maxWin: payout > 0 ? sql`greatest(${users.maxWin}, ${payout})` : users.maxWin,
        gamesPlayed: sql`${users.gamesPlayed} + 1`,
      }).where(eq(users.id, bet.userId));
      await logPlay(tx, bet.userId, "horse", bet.amount, payout);
      return true;
    });
    if (paid && payout > 0) {
      const key = `${b.round}:${b.userId}`;
      const w = won.get(key) ?? { round: b.round, userId: b.userId, horse: b.horse, odds: b.odds, payout: 0 };
      w.payout += payout;
      won.set(key, w);
    }
  }
  // Big wins are announced in the chat
  for (const w of won.values()) {
    if (w.payout < HORSE_BIG_WIN) continue;
    const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, w.userId));
    if (!u) continue;
    await db.insert(chatMessages).values({
      userId: "system", username: "🏇 Đua Ngựa",
      text: `Về nhất! ${u.username} đặt Số ${w.horse + 1} ${HORSES[w.horse].name.vi} (×${(w.odds / 10).toLocaleString("vi-VN")}) và thắng ${fmt(w.payout)} xu! 🏆`,
    });
  }
  return due.length;
}

export function startHorseScheduler(httpServer?: { on(event: "close", fn: () => void): unknown }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await settleHorse(); } catch (e) { console.error("[horse]", e); } finally { running = false; }
  };
  void run(); // pays any race that finished while the server was down
  const timer = setInterval(run, 1000);
  timer.unref?.();
  httpServer?.on("close", () => clearInterval(timer));
}

export function registerHorseRoutes(app: Express, requireUser: Mw) {
  app.get("/api/horse", requireUser, async (_req, res) => {
    res.json(await horseView(res.locals.user));
  });
  app.post("/api/horse/bet", requireUser, async (req, res) => {
    const r = await placeHorseBets(res.locals.user.id, req.body);
    if ("error" in r) {
      const closed = "code" in r && r.code === "closed";
      return res.status(closed ? 409 : 400).json({ message: r.error, code: closed ? "closed" : undefined });
    }
    res.json(r);
  });
}
