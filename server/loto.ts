/**
 * Lô Tô rounds: tickets are sold, then 50 numbers are called. A ticket is paid the moment
 * the calls complete its first row (worked out when it was bought, kept secret till then).
 * A timer settles tickets, so a restart never loses a payout.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { randomInt } from "crypto";
import { z } from "zod";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { users, lotoRounds, lotoTickets, chatMessages, type User } from "@shared/schema";
import {
  LOTO_PRICES, LOTO_MAX_TICKETS, LOTO_BUY_AT_ONCE, LOTO_CALLS,
  lotoRoundAt, lotoCallsMade, lotoCallTime, lotoKinhAt, lotoMultiplier, isValidLotoGrid,
  type LotoView, type LotoTicketView,
} from "@shared/loto";
import { logPlay } from "./storage";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
const fmt = (n: number) => n.toLocaleString("vi-VN");

/** The round's 90 numbers in calling order, made (by a fair shuffle) the first time anyone needs them */
export async function roundDraws(round: number): Promise<number[]> {
  const [have] = await db.select().from(lotoRounds).where(eq(lotoRounds.round, round));
  if (have) return have.draws;
  const d = Array.from({ length: 90 }, (_, i) => i + 1);
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  await db.insert(lotoRounds).values({ round, draws: d }).onConflictDoNothing();
  const [row] = await db.select().from(lotoRounds).where(eq(lotoRounds.round, round));
  return row.draws;
}

/** What a player may see of a ticket: the row and prize only once the calls have got there */
function ticketView(t: typeof lotoTickets.$inferSelect, callsMade: number): LotoTicketView {
  const reached = t.kinhAt !== null && t.kinhAt <= callsMade;
  return {
    id: t.id, grid: t.grid, price: t.price,
    kinhAt: reached ? t.kinhAt : null,
    payout: reached || callsMade >= LOTO_CALLS ? t.payout : null,
    settled: t.settled,
  };
}

export async function lotoView(user: User, now = Date.now()): Promise<LotoView> {
  const r = lotoRoundAt(now);
  const draws = await roundDraws(r.round);
  const made = lotoCallsMade(r.round, now);
  const mine = await db.select().from(lotoTickets)
    .where(and(eq(lotoTickets.round, r.round), eq(lotoTickets.userId, user.id))).orderBy(lotoTickets.id);
  const prev = await db.select().from(lotoTickets)
    .where(and(eq(lotoTickets.round, r.round - 1), eq(lotoTickets.userId, user.id))).orderBy(lotoTickets.id);
  const prevDraws = prev.length ? await roundDraws(r.round - 1) : [];
  const [count] = await db.select({
    players: sql<number>`count(distinct ${lotoTickets.userId})::int`, tickets: sql<number>`count(*)::int`,
  }).from(lotoTickets).where(eq(lotoTickets.round, r.round));
  // Recent winners: paid tickets from rounds whose calls have reached them
  const winners = await db.select({
    username: users.username, price: lotoTickets.price, payout: lotoTickets.payout, kinhAt: lotoTickets.kinhAt, round: lotoTickets.round,
  }).from(lotoTickets).innerJoin(users, eq(users.id, lotoTickets.userId))
    .where(and(eq(lotoTickets.settled, true), gt(lotoTickets.payout, 0)))
    .orderBy(desc(lotoTickets.id)).limit(10);
  const [me] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, user.id));
  return {
    serverNow: now, round: r.round, start: r.start, drawStart: r.drawStart, callsEnd: r.callsEnd, end: r.end,
    calls: draws.slice(0, made),
    mine: mine.map((t) => ticketView(t, made)),
    lastRound: prev.length ? { round: r.round - 1, calls: prevDraws.slice(0, LOTO_CALLS), tickets: prev.map((t) => ticketView(t, LOTO_CALLS)) } : null,
    players: count?.players ?? 0, tickets: count?.tickets ?? 0,
    winners: winners.map((w) => ({ username: w.username, price: w.price, payout: w.payout, kinhAt: w.kinhAt ?? 0, round: w.round })),
    balance: me?.balance ?? 0,
  };
}

const buySchema = z.object({
  price: z.number().int().refine((p) => LOTO_PRICES.includes(p), "Pick a ticket price"),
  grids: z.array(z.unknown()).min(1).max(LOTO_BUY_AT_ONCE),
});

export async function buyTickets(userId: string, body: unknown, now = Date.now()) {
  const parsed = buySchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Bad request" } as const;
  const { price, grids } = parsed.data;
  if (!grids.every(isValidLotoGrid)) return { error: "That isn't a valid ticket" } as const;
  const r = lotoRoundAt(now);
  // Sales close a moment before the first call, so a slow request can't buy after it
  if (now > r.drawStart - 1000) return { error: "Sales have closed for this round. Wait for the next one!", code: "closed" } as const;
  const draws = await roundDraws(r.round);
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(lotoTickets)
      .where(and(eq(lotoTickets.round, r.round), eq(lotoTickets.userId, userId)));
    if (n + grids.length > LOTO_MAX_TICKETS) return { error: `At most ${LOTO_MAX_TICKETS} tickets a round` } as const;
    const cost = price * grids.length;
    const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${cost}` })
      .where(and(eq(users.id, userId), sql`${users.balance} >= ${cost}`)).returning({ balance: users.balance });
    if (!paid) return { error: "Not enough coins" } as const;
    const rows = await tx.insert(lotoTickets).values(grids.map((grid) => {
      const kinhAt = lotoKinhAt(grid, draws);
      return { round: r.round, userId, grid, price, kinhAt, payout: Math.round(price * lotoMultiplier(kinhAt)) };
    })).returning();
    return { balance: paid.balance, tickets: rows.map((t) => ticketView(t, 0)) };
  });
}

/** Pays every ticket whose moment has come: its winning call, or the end of the calls for the rest */
export async function settleLoto(now = Date.now()) {
  const current = lotoRoundAt(now).round;
  const due = await db.select().from(lotoTickets)
    .where(and(eq(lotoTickets.settled, false), lte(lotoTickets.round, current)));
  const ready = due.filter((t) => now >= lotoCallTime(t.round, t.kinhAt ?? LOTO_CALLS));
  for (const t of ready) {
    const paid = await db.transaction(async (tx) => {
      const [row] = await tx.update(lotoTickets).set({ settled: true })
        .where(and(eq(lotoTickets.id, t.id), eq(lotoTickets.settled, false))).returning();
      if (!row) return false;
      if (row.payout > 0) {
        await tx.update(users).set({
          balance: sql`${users.balance} + ${row.payout}`,
          totalWins: row.payout > row.price ? sql`${users.totalWins} + 1` : users.totalWins,
          maxWin: sql`greatest(${users.maxWin}, ${row.payout})`,
        }).where(eq(users.id, row.userId));
      }
      await tx.update(users).set({ gamesPlayed: sql`${users.gamesPlayed} + 1` }).where(eq(users.id, row.userId));
      await logPlay(tx, row.userId, "loto", row.price, row.payout);
      return true;
    });
    // Big wins are announced in the chat
    if (paid && t.kinhAt !== null && lotoMultiplier(t.kinhAt) >= 8) {
      const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, t.userId));
      if (u) {
        await db.insert(chatMessages).values({
          userId: "system", username: "🎱 Lô Tô",
          text: `KINH! ${u.username} kín một hàng chỉ sau ${t.kinhAt} số, thắng ×${lotoMultiplier(t.kinhAt)} = ${fmt(t.payout)} xu! 🎉`,
        });
      }
    }
  }
  return ready.length;
}

export function startLotoScheduler(httpServer?: { on(event: "close", fn: () => void): unknown }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await settleLoto(); } catch (e) { console.error("[loto]", e); } finally { running = false; }
  };
  void run();
  const timer = setInterval(run, 1000);
  timer.unref?.();
  httpServer?.on("close", () => clearInterval(timer));
}

export function registerLotoRoutes(app: Express, requireUser: Mw) {
  app.get("/api/loto", requireUser, async (_req, res) => {
    res.json(await lotoView(res.locals.user));
  });
  app.post("/api/loto/buy", requireUser, async (req, res) => {
    const r = await buyTickets(res.locals.user.id, req.body);
    if ("error" in r) {
      const closed = "code" in r && r.code === "closed";
      return res.status(closed ? 409 : 400).json({ message: r.error, code: closed ? "closed" : undefined });
    }
    res.json(r);
  });
}
