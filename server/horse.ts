/**
 * Đua Ngựa: a race a minute, shared by everyone. A race's chances and result are drawn (crypto
 * randomness) the first time anyone needs the round, kept secret until the gates open, and bets
 * are paid by a timer once the race is over, so a restart never loses a payout.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { randomInt } from "crypto";
import { z } from "zod";
import { and, desc, eq, gt, gte, lt, lte, sql, inArray } from "drizzle-orm";
import { db } from "./db";
import { users, horseRounds, horseBets, chatMessages, type User } from "@shared/schema";
import {
  HORSES, HORSE_COUNT, HORSE_CHANCES, HORSE_MAX_PER_RACE, HORSE_MAX_LINES, HORSE_CLOSE_EARLY_MS, HORSE_BIG_WIN,
  HORSE_BET_TYPES, HORSE_CHEERS, HORSE_CHEER_GAP_MS, HORSE_CHEERS_PER_RACE,
  horseRoundAt, horseRoundTimes, horseMarket, horseBetOdds, horseBetWins, horsePayout, shuffled, drawOrder,
  type HorseView, type HorseBetView, type HorseBetType, type HorseForm,
} from "@shared/horse";
import { vnDay } from "@shared/league";
import { logPlay } from "./storage";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type RoundRow = typeof horseRounds.$inferSelect;
type BetRow = typeof horseBets.$inferSelect;
const fmt = (n: number) => n.toLocaleString("vi-VN");
const rand = (n: number) => randomInt(n);

/** The round's chances, prices and result, made the first time anyone needs them (race-safe) */
export async function horseRound(round: number): Promise<RoundRow> {
  const [have] = await db.select().from(horseRounds).where(eq(horseRounds.round, round));
  if (have) return have;
  const chances = shuffled(HORSE_CHANCES, rand);
  const order = drawOrder(chances, rand);
  const win = horseMarket(chances).win;
  await db.insert(horseRounds).values({
    round, chances, odds: win.map((o) => Math.floor(o / 10)), odds100: win, winner: order[0], finishOrder: order, seed: randomInt(2 ** 31 - 1),
  }).onConflictDoNothing();
  const [row] = await db.select().from(horseRounds).where(eq(horseRounds.round, round));
  return row;
}

const asType = (t: string): HorseBetType => (HORSE_BET_TYPES as string[]).includes(t) ? t as HorseBetType : "win";

function betView(b: BetRow): HorseBetView {
  return {
    id: b.id, round: b.round, type: asType(b.betType), horse: b.horse, horse2: b.horse2 ?? null, amount: b.amount, odds100: b.odds100,
    status: !b.settled ? "pending" : (b.payout ?? 0) > 0 ? "won" : "lost",
    payout: b.settled ? b.payout ?? 0 : null,
  };
}

/** Start of today in Vietnam, and the first race that started today */
function todayFirstRound(now: number) {
  const start = new Date(`${vnDay(new Date(now))}T00:00:00Z`).getTime() - 7 * 3600_000;
  const r = horseRoundAt(start);
  return { start, round: r.start >= start ? r.round : r.round + 1 };
}

// The form guide only changes when a race finishes, so it's worked out once per race
let formCache: { key: string; form: HorseForm } | null = null;
async function horseForm(lastDone: number, now: number): Promise<HorseForm> {
  const today = todayFirstRound(now);
  const key = `${lastDone}:${today.round}`;
  if (formCache?.key === key) return formCache.form;
  const recent = await db.select({ order: horseRounds.finishOrder }).from(horseRounds)
    .where(lte(horseRounds.round, lastDone)).orderBy(desc(horseRounds.round)).limit(5);
  const wins = await db.select({ horse: horseRounds.winner, n: sql<number>`count(*)::int` }).from(horseRounds)
    .where(and(gte(horseRounds.round, today.round), lte(horseRounds.round, lastDone))).groupBy(horseRounds.winner);
  const form: HorseForm = {
    last: HORSES.map((_, h) => recent.map((r) => r.order.indexOf(h) + 1)),
    winsToday: HORSES.map((_, h) => wins.find((w) => w.horse === h)?.n ?? 0),
  };
  formCache = { key, form };
  return form;
}

// Today's biggest payouts, refreshed at most every few seconds
let bigCache: { at: number; day: string; rows: HorseView["bigWins"] } | null = null;
async function horseBigWins(now: number): Promise<HorseView["bigWins"]> {
  const day = vnDay(new Date(now));
  if (bigCache && bigCache.day === day && now - bigCache.at < 5000 && now >= bigCache.at) return bigCache.rows;
  const first = todayFirstRound(now).round;
  const rows = await db.select({
    username: users.username, avatarUrl: users.profileImageUrl, payout: horseBets.payout, type: horseBets.betType,
    horse: horseBets.horse, horse2: horseBets.horse2, odds100: horseBets.odds100,
  }).from(horseBets).innerJoin(users, eq(users.id, horseBets.userId))
    .where(and(eq(horseBets.settled, true), gt(horseBets.payout, 0), gte(horseBets.round, first), eq(users.banned, false)))
    .orderBy(desc(horseBets.payout), horseBets.id).limit(5);
  const out = rows.map((r) => ({ ...r, avatarUrl: r.avatarUrl ?? null, payout: r.payout ?? 0, type: asType(r.type), horse2: r.horse2 ?? null }));
  bigCache = { at: now, day, rows: out };
  return out;
}

// Cheers live in memory: they only matter while the race is on
interface Cheer { id: number; username: string; emoji: string; horse: number | null; at: number }
const cheers = new Map<number, Cheer[]>();
const cheerers = new Map<string, { round: number; last: number; n: number }>();
let cheerId = 0;

export function horseCheer(user: { id: string; username: string }, body: unknown, now = Date.now()) {
  const parsed = z.object({
    emoji: z.enum(HORSE_CHEERS),
    horse: z.number().int().min(0).max(HORSE_COUNT - 1).nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) return { error: "Bad request", status: 400 } as const;
  const r = horseRoundAt(now);
  if (now < r.raceStart) return { error: "Cheer once the race is on!", status: 409 } as const;
  const me = cheerers.get(user.id);
  if (me && me.round === r.round && (now - me.last < HORSE_CHEER_GAP_MS || me.n >= HORSE_CHEERS_PER_RACE)) {
    return { error: "Slow down a little!", status: 429 } as const;
  }
  cheerers.set(user.id, { round: r.round, last: now, n: me && me.round === r.round ? me.n + 1 : 1 });
  const list = cheers.get(r.round) ?? [];
  const cheer: Cheer = { id: ++cheerId, username: user.username, emoji: parsed.data.emoji, horse: parsed.data.horse ?? null, at: now };
  list.push(cheer);
  if (list.length > 200) list.shift();
  cheers.set(r.round, list);
  // Forget old races
  for (const k of cheers.keys()) if (k < r.round - 1) cheers.delete(k);
  if (cheerers.size > 20000) cheerers.clear();
  return { cheer };
}

export async function horseView(user: User, now = Date.now()): Promise<HorseView> {
  const r = horseRoundAt(now);
  const row = await horseRound(r.round);
  const raced = now >= r.raceStart;
  const over = now >= r.raceEnd;
  const mine = await db.select().from(horseBets)
    .where(and(eq(horseBets.round, r.round), eq(horseBets.userId, user.id))).orderBy(horseBets.id);
  const history = await db.select().from(horseBets)
    .where(and(lt(horseBets.round, r.round), eq(horseBets.userId, user.id))).orderBy(desc(horseBets.id)).limit(30);
  const byHorse = await db.select({
    horse: horseBets.horse, amount: sql<number>`coalesce(sum(${horseBets.amount}), 0)::bigint`, players: sql<number>`count(distinct ${horseBets.userId})::int`,
  }).from(horseBets).where(eq(horseBets.round, r.round)).groupBy(horseBets.horse);
  const [count] = await db.select({ players: sql<number>`count(distinct ${horseBets.userId})::int` })
    .from(horseBets).where(eq(horseBets.round, r.round));
  // A few faces per horse: the first players to back it
  const faces = await db.execute(sql`
    select horse, username, avatar from (
      select b.horse, u.username, u.profile_image_url as avatar,
        row_number() over (partition by b.horse order by min(b.id)) as k
      from ${horseBets} b join ${users} u on u.id = b.user_id
      where b.round = ${r.round}
      group by b.horse, u.id, u.username, u.profile_image_url
    ) x where k <= 3 order by horse, k`);
  // The last races' winners; this race's only once it's over
  const past = await db.select({ round: horseRounds.round, winner: horseRounds.winner, odds100: horseRounds.odds100 })
    .from(horseRounds).where(over ? lte(horseRounds.round, r.round) : lt(horseRounds.round, r.round))
    .orderBy(desc(horseRounds.round)).limit(10);
  const [me] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, user.id));
  const pool = Array.from({ length: HORSE_COUNT }, () => ({ amount: 0, players: 0 }));
  for (const p of byHorse) pool[p.horse] = { amount: Number(p.amount), players: p.players };
  const backers: HorseView["backers"] = HORSES.map(() => []);
  for (const f of faces.rows as { horse: number; username: string; avatar: string | null }[]) {
    backers[f.horse]?.push({ username: f.username, avatarUrl: f.avatar ?? null });
  }
  const recentCheers = raced ? (cheers.get(r.round) ?? []).filter((c) => c.at > now - 4000 && c.at <= now).slice(-30) : [];
  return {
    serverNow: now, round: r.round, start: r.start, raceStart: r.raceStart, raceEnd: r.raceEnd, end: r.end,
    odds: horseMarket(row.chances),
    // The result stays on the server until the gates open
    race: raced ? { seed: row.seed, order: row.finishOrder } : null,
    pool, backers, players: count?.players ?? 0,
    mine: mine.map(betView), history: history.map(betView),
    winners: past.map((p) => ({ round: p.round, horse: p.winner, odds100: p.odds100[p.winner] })),
    form: await horseForm(over ? r.round : r.round - 1, now),
    bigWins: await horseBigWins(now),
    cheers: recentCheers,
    balance: me?.balance ?? 0,
  };
}

const betSchema = z.object({
  bets: z.array(z.object({
    type: z.enum(HORSE_BET_TYPES as [HorseBetType, ...HorseBetType[]], { errorMap: () => ({ message: "Pick a bet type" }) }).default("win"),
    horse: z.number().int().min(0, "Pick a horse").max(HORSE_COUNT - 1, "Pick a horse"),
    horse2: z.number().int().min(0, "Pick a horse").max(HORSE_COUNT - 1, "Pick a horse").nullable().optional(),
    amount: z.number().int().min(1000, "Bets come in chips of 1,000 coins or more")
      .refine((a) => a % 1000 === 0, "Bets come in chips of 1,000 coins or more"),
  }).superRefine((b, ctx) => {
    if (b.type === "forecast") {
      if (b.horse2 == null) ctx.addIssue({ code: "custom", message: "Pick the horses for 1st and 2nd" });
      else if (b.horse2 === b.horse) ctx.addIssue({ code: "custom", message: "Pick two different horses for 1st and 2nd" });
    } else if (b.horse2 != null) ctx.addIssue({ code: "custom", message: "Pick a bet type" });
  })).min(1, "Pick a horse").max(HORSE_MAX_LINES, "Too many bets"),
});

export async function placeHorseBets(userId: string, body: unknown, now = Date.now()) {
  const parsed = betSchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Bad request" } as const;
  // One row per bet (type, horse, second horse)
  const lines = new Map<string, { type: HorseBetType; horse: number; horse2: number | null; amount: number }>();
  for (const b of parsed.data.bets) {
    const horse2 = b.type === "forecast" ? b.horse2 ?? null : null;
    const key = `${b.type}:${b.horse}:${horse2}`;
    const l = lines.get(key) ?? { type: b.type, horse: b.horse, horse2, amount: 0 };
    l.amount += b.amount;
    lines.set(key, l);
  }
  const total = [...lines.values()].reduce((a, b) => a + b.amount, 0);
  const tooMuch = "At most 5,000,000 coins on one race";
  if (total > HORSE_MAX_PER_RACE) return { error: tooMuch } as const;
  const r = horseRoundAt(now);
  if (now > r.raceStart - HORSE_CLOSE_EARLY_MS) return { error: "Betting has closed for this race. Wait for the next one!", code: "closed" } as const;
  const row = await horseRound(r.round);
  const market = horseMarket(row.chances);
  const values = [...lines.values()].map((l) => {
    const odds100 = horseBetOdds(market, l.type, l.horse, l.horse2);
    return { round: r.round, userId, betType: l.type, horse: l.horse, horse2: l.horse2, amount: l.amount, odds100, odds: Math.floor(odds100 / 10) };
  });
  if (values.some((v) => v.odds100 < 101)) return { error: "Pick a bet type" } as const;
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [{ sum }] = await tx.select({ sum: sql<number>`coalesce(sum(${horseBets.amount}), 0)::bigint` }).from(horseBets)
      .where(and(eq(horseBets.round, r.round), eq(horseBets.userId, userId)));
    if (Number(sum) + total > HORSE_MAX_PER_RACE) return { error: tooMuch } as const;
    const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${total}` })
      .where(and(eq(users.id, userId), sql`${users.balance} >= ${total}`)).returning({ balance: users.balance });
    if (!paid) return { error: "Not enough coins" } as const;
    const rows = await tx.insert(horseBets).values(values).returning();
    return { balance: paid.balance, bets: rows.map(betView) };
  });
}

const betName = (b: { betType: string; horse: number; horse2: number | null }) => {
  const t = asType(b.betType);
  const n = `Số ${b.horse + 1} ${HORSES[b.horse].name.vi}`;
  return t === "win" ? `${n} về nhất` : t === "top2" ? `${n} vào Top 2` : t === "top3" ? `${n} vào Top 3`
    : `Số ${b.horse + 1} → Số ${(b.horse2 ?? 0) + 1} (nhất – nhì)`;
};

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
  const won = new Map<string, { round: number; userId: string; best: BetRow; payout: number }>();
  for (const b of due) {
    const round = rounds.get(b.round) ?? await horseRound(b.round);
    const payout = horseBetWins(asType(b.betType), b.horse, b.horse2, round.finishOrder) ? horsePayout(b.amount, b.odds100) : 0;
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
      const w = won.get(key) ?? { round: b.round, userId: b.userId, best: b, payout: 0 };
      if (horsePayout(b.amount, b.odds100) > horsePayout(w.best.amount, w.best.odds100)) w.best = b;
      w.payout += payout;
      won.set(key, w);
    }
  }
  if (won.size) bigCache = null;
  // Big wins are announced in the chat
  for (const w of won.values()) {
    if (w.payout < HORSE_BIG_WIN) continue;
    const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, w.userId));
    if (!u) continue;
    await db.insert(chatMessages).values({
      userId: "system", username: "🏇 Đua Ngựa",
      text: `Trúng lớn! ${u.username} đặt ${betName(w.best)} (×${(w.best.odds100 / 100).toLocaleString("vi-VN")}) và thắng ${fmt(w.payout)} xu! 🏆`,
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
  app.post("/api/horse/cheer", requireUser, (req, res) => {
    const r = horseCheer(res.locals.user, req.body);
    if ("cheer" in r) return res.json(r);
    res.status(r.status ?? 400).json({ message: r.error });
  });
}
