/**
 * Bắn Cá: one request per bullet that hits a fish. The stake and any prize are settled in a
 * single conditional update. Shots are too many to record one by one, so the play log gets
 * a running total per player every few seconds.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { randomInt } from "crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { users, gamePlays, chatMessages } from "@shared/schema";
import { BANCA_LEVELS, BANCA_MAX_RATE, catchThreshold, fishById } from "@shared/banca";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
const fmt = (n: number) => n.toLocaleString("vi-VN");

/** A catch, with exactly BANCA_RTP / mult chance (in millionths, which divide exactly for every fish) */
export function rollCatch(mult: number, roll: (n: number) => number = randomInt): boolean {
  return roll(1_000_000) < catchThreshold(mult);
}

// Shots per player in the last second
const recent = new Map<string, number[]>();
function allowShot(userId: string, now = Date.now()) {
  const times = (recent.get(userId) ?? []).filter((t) => now - t < 1000);
  if (times.length >= BANCA_MAX_RATE) { recent.set(userId, times); return false; }
  times.push(now);
  recent.set(userId, times);
  return true;
}

// Running totals for the play log, written every few seconds
const pending = new Map<string, { bet: number; payout: number }>();
export async function flushBancaLog() {
  const rows = [...pending.entries()];
  pending.clear();
  if (rows.length) await db.insert(gamePlays).values(rows.map(([userId, t]) => ({ userId, game: "banca", bet: t.bet, payout: t.payout })));
  for (const t of recent.keys()) if (!(recent.get(t) ?? []).some((x) => Date.now() - x < 5000)) recent.delete(t);
}

export async function shoot(userId: string, level: number, fishId: string) {
  const fish = fishById(fishId);
  if (!fish || !BANCA_LEVELS.includes(level)) return { error: "Bad shot", status: 400 } as const;
  if (!allowShot(userId)) return { error: "Slow down a little!", status: 429 } as const;
  const caught = rollCatch(fish.mult);
  const payout = caught ? level * fish.mult : 0;
  const [u] = await db.update(users).set({
    balance: sql`${users.balance} - ${level} + ${payout}`,
    ...(caught ? { maxWin: sql`greatest(${users.maxWin}, ${payout})`, totalWins: sql`${users.totalWins} + 1` } : {}),
  }).where(and(eq(users.id, userId), sql`${users.balance} >= ${level}`)).returning({ balance: users.balance, username: users.username });
  if (!u) return { error: "Not enough coins", status: 400 } as const;
  const t = pending.get(userId) ?? { bet: 0, payout: 0 };
  pending.set(userId, { bet: t.bet + level, payout: t.payout + payout });
  if (caught && fish.mult >= 100) {
    void db.insert(chatMessages).values({
      userId: "system", username: "🐟 Bắn Cá",
      text: `${u.username} vừa bắn trúng ${fish.vi} ${fish.icon} ×${fish.mult}, ăn ${fmt(payout)} xu! 🎯`,
    }).catch(() => {});
  }
  return { caught, fish: fish.id, mult: fish.mult, payout, balance: u.balance };
}

export function startBancaLogger(httpServer?: { on(event: "close", fn: () => void): unknown }) {
  const timer = setInterval(() => { flushBancaLog().catch((e) => console.error("[banca]", e)); }, 10_000);
  timer.unref?.();
  httpServer?.on("close", () => { clearInterval(timer); void flushBancaLog().catch(() => {}); });
}

const shotSchema = z.object({ level: z.number().int(), fish: z.string().max(20) });

export function registerBancaRoutes(app: Express, requireUser: Mw) {
  app.post("/api/banca/shoot", requireUser, async (req, res) => {
    const parsed = shotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Bad shot" });
    const r = await shoot(res.locals.user.id, parsed.data.level, parsed.data.fish);
    if ("error" in r) return res.status(r.status ?? 400).json({ message: r.error });
    res.json(r);
  });
}
