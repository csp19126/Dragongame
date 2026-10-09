/**
 * Tiến Lên against three computer players. The server deals, plays the computer players and
 * checks every move; the stake is taken at the deal and the prize paid when you go out (or
 * when three are out before you).
 */
import type { Express, Request, Response, NextFunction } from "express";
import { randomInt } from "crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { users, tienlenGames } from "@shared/schema";
import {
  TIENLEN_STAKES, TIENLEN_PAYS, newGame, runBots, playError, applyPlay, applyPass, gameOver, placeOf,
  type TienLenState, type TienLenEvent, type TienLenView,
} from "@shared/tienlen";
import { logPlay } from "./storage";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rand = (n: number) => randomInt(n);

function view(row: typeof tienlenGames.$inferSelect, events: TienLenEvent[], balance: number): TienLenView {
  const s = row.state as TienLenState;
  return {
    id: row.id, stake: row.stake,
    hand: s.hands[0],
    counts: s.hands.map((h) => h.length),
    turn: s.turn,
    table: s.table ? { cards: s.table.cards, by: s.table.by, type: s.table.combo.type } : null,
    passed: s.passed, finished: s.finished, opening: s.opening,
    over: row.finished, place: row.place, payout: row.payout,
    events, balance,
  };
}

/** Saves the game; if it has just ended, pays the prize */
async function save(tx: Tx, row: typeof tienlenGames.$inferSelect, s: TienLenState) {
  const over = gameOver(s);
  const place = over ? placeOf(s) : null;
  const payout = place ? Math.round(row.stake * TIENLEN_PAYS[place - 1]) : null;
  const [saved] = await tx.update(tienlenGames).set({ state: s, finished: over, place, payout, updatedAt: new Date() })
    .where(and(eq(tienlenGames.id, row.id), eq(tienlenGames.finished, false))).returning();
  if (!saved) throw new Error("Game already finished");
  let balance: number;
  if (over) {
    const [u] = await tx.update(users).set({
      balance: sql`${users.balance} + ${payout!}`,
      gamesPlayed: sql`${users.gamesPlayed} + 1`,
      totalWins: place === 1 ? sql`${users.totalWins} + 1` : users.totalWins,
      maxWin: sql`greatest(${users.maxWin}, ${payout!})`,
    }).where(eq(users.id, row.userId)).returning({ balance: users.balance });
    await logPlay(tx, row.userId, "tienlen", row.stake, payout!);
    balance = u.balance;
  } else {
    const [u] = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, row.userId));
    balance = u.balance;
  }
  return { saved, balance };
}

async function active(tx: Tx | typeof db, userId: string, lock = false) {
  const q = tx.select().from(tienlenGames).where(and(eq(tienlenGames.userId, userId), eq(tienlenGames.finished, false)));
  const [row] = lock ? await q.for("update") : await q;
  return row ?? null;
}

const startSchema = z.object({ stake: z.number().int().refine((n) => TIENLEN_STAKES.includes(n), "Pick a stake") });
const moveSchema = z.union([
  z.object({ cards: z.array(z.number().int().min(0).max(51)).min(1).max(13) }),
  z.object({ pass: z.literal(true) }),
]);

export function registerTienLenRoutes(app: Express, requireUser: Mw) {
  app.get("/api/tienlen", requireUser, async (_req, res) => {
    const row = await active(db, res.locals.user.id);
    const [u] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, res.locals.user.id));
    res.json({ game: row ? view(row, [], u.balance) : null });
  });

  app.post("/api/tienlen/start", requireUser, async (req, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
    const userId = res.locals.user.id as string;
    const out = await db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      if (await active(tx, userId)) return { error: "Finish the game you're playing first", status: 409 };
      const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${parsed.data.stake}` })
        .where(and(eq(users.id, userId), sql`${users.balance} >= ${parsed.data.stake}`)).returning({ id: users.id });
      if (!paid) return { error: "Not enough coins", status: 400 };
      const s = newGame(rand);
      const events: TienLenEvent[] = [];
      runBots(s, rand, events);
      const [row] = await tx.insert(tienlenGames).values({ userId, stake: parsed.data.stake, state: s }).returning();
      const { saved, balance } = await save(tx, row, s);
      return { game: view(saved, events, balance) };
    });
    if ("error" in out) return res.status(out.status!).json({ message: out.error });
    res.json(out);
  });

  // Giving up counts as last place
  app.post("/api/tienlen/resign", requireUser, async (_req, res) => {
    const userId = res.locals.user.id as string;
    const out = await db.transaction(async (tx) => {
      const row = await active(tx, userId, true);
      if (!row) return null;
      const [saved] = await tx.update(tienlenGames).set({ finished: true, place: 4, payout: 0, updatedAt: new Date() })
        .where(and(eq(tienlenGames.id, row.id), eq(tienlenGames.finished, false))).returning();
      await tx.update(users).set({ gamesPlayed: sql`${users.gamesPlayed} + 1` }).where(eq(users.id, userId));
      await logPlay(tx, userId, "tienlen", row.stake, 0);
      const [u] = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
      return { game: view(saved, [], u.balance) };
    });
    if (!out) return res.status(404).json({ message: "No game in progress" });
    res.json(out);
  });

  app.post("/api/tienlen/move", requireUser, async (req, res) => {
    const parsed = moveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Pick some cards, or pass" });
    const userId = res.locals.user.id as string;
    const out = await db.transaction(async (tx) => {
      const row = await active(tx, userId, true);
      if (!row) return { error: "No game in progress", status: 404 };
      const s = row.state as TienLenState;
      const events: TienLenEvent[] = [];
      if ("pass" in parsed.data) {
        const err = applyPass(s, 0, events);
        if (err) return { error: err, status: 400 };
      } else {
        const err = playError(s, 0, parsed.data.cards);
        if (err) return { error: err, status: 400 };
        applyPlay(s, 0, parsed.data.cards, events);
      }
      runBots(s, rand, events);
      const { saved, balance } = await save(tx, row, s);
      return { game: view(saved, events, balance) };
    });
    if ("error" in out) return res.status(out.status!).json({ message: out.error });
    res.json(out);
  });
}
