/**
 * Pool tournaments. Free to enter; the house pays coin prizes. Single elimination: the
 * bracket is drawn when the tournament starts (byes fill it up to a power of two), and
 * each match is a normal online pool table where both players are already seated.
 *
 * Everything lives in the database, so a redeploy loses nothing but the frames being
 * played: a watchdog notices matches whose table is gone and opens a fresh one.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { randomInt } from "crypto";
import { z } from "zod";
import { db } from "./db";
import {
  users, deposits, chatMessages, appSettings, tournaments, tournamentPlayers, tournamentMatches,
  type Tournament, type TournamentMatch, type User,
} from "@shared/schema";
import {
  WEEKLY_DAY_UTC, WEEKLY_HOUR_UTC, WEEKLY_NAME, DEFAULT_SIZE, DEFAULT_PRIZES, TOURNAMENT_SIZES, MIN_PLAYERS,
  type TournamentView,
} from "@shared/tournament";
import { createTournamentRoom, roomExists, setTournamentHook } from "./pool";
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const WEEKLY_KEY = "tournament_weekly";
const fmt = (n: number) => n.toLocaleString("vi-VN");

/** The next Saturday 13:00 UTC at least an hour away */
export function nextWeeklyStart(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), WEEKLY_HOUR_UTC));
  d.setUTCDate(d.getUTCDate() + ((WEEKLY_DAY_UTC - d.getUTCDay() + 7) % 7));
  if (d.getTime() - now.getTime() < 3600_000) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

async function systemChat(text: string) {
  await db.insert(chatMessages).values({ userId: "system", username: "🏆 VnSlot 888", text });
}

async function weeklyEnabled() {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, WEEKLY_KEY));
  return row?.value !== "off";
}

/** Keeps one upcoming weekly tournament on the calendar */
async function ensureWeekly() {
  if (!(await weeklyEnabled())) return;
  const [active] = await db.select({ n: count() }).from(tournaments).where(inArray(tournaments.status, ["open", "live"]));
  if (active.n > 0) return;
  // A lock so two servers (or two ticks) can't both make it
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(778899)`);
    const [again] = await tx.select({ n: count() }).from(tournaments).where(inArray(tournaments.status, ["open", "live"]));
    if (again.n > 0) return;
    const startsAt = nextWeeklyStart();
    // One per week: if the admin cancelled this week's, don't make it again
    const [same] = await tx.select({ n: count() }).from(tournaments).where(and(eq(tournaments.auto, true), eq(tournaments.startsAt, startsAt)));
    if (same.n > 0) return;
    await tx.insert(tournaments).values({ name: WEEKLY_NAME, startsAt, size: DEFAULT_SIZE, prizes: DEFAULT_PRIZES, status: "open", auto: true });
  });
}

// ---------------- The bracket ----------------

/** Order of first-round slots that get byes, spread so bye-winners don't all meet early */
function byeOrder(half: number) {
  const even = Array.from({ length: half }, (_, i) => i).filter((i) => i % 2 === 0);
  const odd = Array.from({ length: half }, (_, i) => i).filter((i) => i % 2 === 1);
  return [...even, ...odd];
}

/** Puts a match winner into the next round's match */
async function advance(tx: Tx, t: Tournament, m: TournamentMatch, winnerId: string, winnerName: string) {
  const nextSlot = Math.floor(m.slot / 2);
  const set = m.slot % 2 === 0 ? { player1: winnerId, name1: winnerName } : { player2: winnerId, name2: winnerName };
  await tx.update(tournamentMatches).set({ ...set, updatedAt: new Date() })
    .where(and(eq(tournamentMatches.tournamentId, t.id), eq(tournamentMatches.round, m.round + 1), eq(tournamentMatches.slot, nextSlot)));
}

/** Draws the bracket. Returns false (and cancels) if too few players signed up. */
export async function startTournament(id: number): Promise<"started" | "cancelled" | "not_open"> {
  const r = await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, id)).for("update");
    if (!t || t.status !== "open") return { r: "not_open" as const };
    const players = await tx.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, id));
    if (players.length < MIN_PLAYERS) {
      await tx.update(tournaments).set({ status: "cancelled", finishedAt: new Date() }).where(eq(tournaments.id, id));
      return { r: "cancelled" as const, t };
    }
    // Shuffle with the crypto generator
    for (let i = players.length - 1; i > 0; i--) { const j = randomInt(i + 1); [players[i], players[j]] = [players[j], players[i]]; }
    let size = 2;
    while (size < players.length) size *= 2;
    const rounds = Math.log2(size);
    const half = size / 2;
    const byeSlots = new Set(byeOrder(half).slice(0, size - players.length));
    let k = 0;
    const first: (typeof tournamentMatches.$inferInsert)[] = [];
    for (let slot = 0; slot < half; slot++) {
      const a = players[k++];
      if (byeSlots.has(slot)) {
        first.push({ tournamentId: id, round: 1, slot, player1: a.userId, name1: a.username, status: "finished", winnerId: a.userId, reason: "bye" });
      } else {
        const b = players[k++];
        first.push({ tournamentId: id, round: 1, slot, player1: a.userId, name1: a.username, player2: b.userId, name2: b.username, status: "pending" });
      }
    }
    await tx.insert(tournamentMatches).values(first);
    for (let round = 2; round <= rounds; round++) {
      await tx.insert(tournamentMatches).values(Array.from({ length: size / 2 ** round }, (_, slot) => ({ tournamentId: id, round, slot, status: "pending" })));
    }
    const live = { ...t, status: "live", rounds };
    await tx.update(tournaments).set({ status: "live", rounds }).where(eq(tournaments.id, id));
    // Byes go straight through
    const byes = await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, id), eq(tournamentMatches.round, 1), eq(tournamentMatches.reason, "bye")));
    for (const m of byes) await advance(tx, live, m, m.player1!, m.name1!);
    return { r: "started" as const, t: live, n: players.length };
  });
  if (r.r === "cancelled") await systemChat(`${r.t.name}: không đủ người chơi nên giải bị huỷ. Hẹn tuần sau nhé!`);
  if (r.r === "started") {
    await systemChat(`🎱 ${r.t.name} bắt đầu với ${r.n} cơ thủ! Vào mục Giải đấu để xem bảng đấu.`);
    await startReadyMatches(id);
  }
  return r.r;
}

/** Opens a table for every match that has both players */
async function startReadyMatches(tournamentId: number) {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t || t.status !== "live") return;
  const ready = await db.select().from(tournamentMatches).where(and(
    eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.status, "pending"),
    sql`${tournamentMatches.player1} is not null and ${tournamentMatches.player2} is not null`,
  ));
  for (const m of ready) {
    const [claimed] = await db.update(tournamentMatches).set({ status: "playing", updatedAt: new Date() })
      .where(and(eq(tournamentMatches.id, m.id), eq(tournamentMatches.status, "pending"))).returning();
    if (claimed) await openTable(t, claimed);
  }
}

async function openTable(t: Tournament, m: TournamentMatch) {
  const code = await createTournamentRoom({
    tournamentId: t.id, matchId: m.id, name: t.name, round: m.round, rounds: t.rounds ?? 1,
    players: [m.player1!, m.player2!], names: [m.name1 ?? "?", m.name2 ?? "?"],
  });
  await db.update(tournamentMatches).set({ code, updatedAt: new Date() }).where(eq(tournamentMatches.id, m.id));
}

/** A tournament table finished: record it, move the winner on, and settle the tournament after the final */
export async function onMatchFinished(matchId: number, winnerId: string, reason: string) {
  const r = await db.transaction(async (tx) => {
    const [m] = await tx.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId)).for("update");
    if (!m || m.status !== "playing") return null;
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, m.tournamentId)).for("update");
    if (!t || t.status !== "live") return null;
    await tx.update(tournamentMatches).set({ status: "finished", winnerId, reason, updatedAt: new Date() }).where(eq(tournamentMatches.id, m.id));
    const winnerName = (winnerId === m.player1 ? m.name1 : m.name2) ?? "?";
    if (m.round < (t.rounds ?? 1)) {
      await advance(tx, t, m, winnerId, winnerName);
      return { t, final: false as const };
    }
    // The final: places and prizes
    const loserId = winnerId === m.player1 ? m.player2! : m.player1!;
    const semis = (t.rounds ?? 1) >= 2
      ? await tx.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, t.id), eq(tournamentMatches.round, (t.rounds ?? 1) - 1)))
      : [];
    const semiLosers = semis.map((s) => (s.winnerId === s.player1 ? s.player2 : s.player1)).filter((x): x is string => !!x);
    const places: { userId: string; place: number; prize: number }[] = [
      { userId: winnerId, place: 1, prize: t.prizes[0] ?? 0 },
      { userId: loserId, place: 2, prize: t.prizes[1] ?? 0 },
      ...semiLosers.map((userId) => ({ userId, place: 3, prize: t.prizes[2] ?? 0 })),
    ];
    for (const p of places) {
      await tx.update(tournamentPlayers).set({ place: p.place, prize: p.prize })
        .where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, p.userId)));
      if (p.prize > 0) {
        await tx.update(users).set({ balance: sql`${users.balance} + ${p.prize}`, maxWin: sql`greatest(${users.maxWin}, ${p.prize})` }).where(eq(users.id, p.userId));
        await tx.insert(deposits).values({ userId: p.userId, amount: p.prize, method: "tournament_prize" });
      }
    }
    await tx.update(tournaments).set({ status: "finished", winnerId, winnerName, finishedAt: new Date() }).where(eq(tournaments.id, t.id));
    return { t, final: true as const, winnerName, prize: t.prizes[0] ?? 0 };
  });
  if (!r) return;
  if (r.final) await systemChat(`🏆 ${r.winnerName} vô địch ${r.t.name}! +${fmt(r.prize)} xu. Chúc mừng!`);
  else await startReadyMatches(r.t.id);
}

/** Starts tournaments that are due, reopens tables lost in a restart, keeps the weekly one scheduled */
export async function tournamentTick() {
  await ensureWeekly();
  const due = await db.select().from(tournaments).where(and(eq(tournaments.status, "open"), lte(tournaments.startsAt, new Date())));
  for (const t of due) await startTournament(t.id);
  const live = await db.select().from(tournaments).where(eq(tournaments.status, "live"));
  for (const t of live) {
    const playing = await db.select().from(tournamentMatches).where(and(eq(tournamentMatches.tournamentId, t.id), eq(tournamentMatches.status, "playing")));
    for (const m of playing) if (!roomExists(m.code)) await openTable(t, m);
    await startReadyMatches(t.id);
  }
}

export function startTournamentScheduler(httpServer?: { on(event: "close", fn: () => void): unknown }) {
  setTournamentHook(onMatchFinished);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tournamentTick(); } catch (e) { console.error("[tournament]", e); } finally { running = false; }
  };
  void run();
  const timer = setInterval(run, 10_000);
  timer.unref?.();
  httpServer?.on("close", () => clearInterval(timer));
}

// ---------------- Views ----------------

async function view(user: User): Promise<TournamentView> {
  // Live first; then results of one that just ended; then the next one to sign up for
  const pick = async () => {
    const [live] = await db.select().from(tournaments).where(eq(tournaments.status, "live")).orderBy(asc(tournaments.startsAt)).limit(1);
    if (live) return live;
    const [recent] = await db.select().from(tournaments)
      .where(and(eq(tournaments.status, "finished"), gte(tournaments.finishedAt, new Date(Date.now() - 6 * 3600_000))))
      .orderBy(desc(tournaments.finishedAt)).limit(1);
    if (recent) return recent;
    const [open] = await db.select().from(tournaments).where(eq(tournaments.status, "open")).orderBy(asc(tournaments.startsAt)).limit(1);
    if (open) return open;
    const [last] = await db.select().from(tournaments).where(inArray(tournaments.status, ["finished", "cancelled"])).orderBy(desc(tournaments.startsAt)).limit(1);
    return last;
  };
  const [nextOpen] = await db.select().from(tournaments).where(eq(tournaments.status, "open")).orderBy(asc(tournaments.startsAt)).limit(1);
  const next = async (exclude?: number) => {
    if (!nextOpen || nextOpen.id === exclude) return null;
    const ps = await db.select({ userId: tournamentPlayers.userId }).from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, nextOpen.id));
    return { id: nextOpen.id, name: nextOpen.name, startsAt: nextOpen.startsAt.toISOString(), size: nextOpen.size, count: ps.length, joined: ps.some((p) => p.userId === user.id) };
  };
  const t = await pick();
  const champions = (await db.select().from(tournaments).where(eq(tournaments.status, "finished")).orderBy(desc(tournaments.finishedAt)).limit(5))
    .map((c) => ({ name: c.winnerName ?? "?", tournament: c.name, date: (c.finishedAt ?? c.startsAt).toISOString(), prize: c.prizes[0] ?? 0 }));
  if (!t) return { tournament: null, players: [], joined: false, matches: [], myMatch: null, champions, next: await next(), serverNow: new Date().toISOString() };
  const players = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id)).orderBy(asc(tournamentPlayers.joinedAt));
  const matches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id)).orderBy(asc(tournamentMatches.round), asc(tournamentMatches.slot));
  const mine = matches.find((m) => m.status === "playing" && m.code && (m.player1 === user.id || m.player2 === user.id));
  return {
    tournament: { id: t.id, name: t.name, startsAt: t.startsAt.toISOString(), size: t.size, prizes: t.prizes, status: t.status as "open", rounds: t.rounds, winnerName: t.winnerName },
    players: players.map((p) => ({ username: p.username, place: p.place, prize: p.prize })),
    joined: players.some((p) => p.userId === user.id),
    matches: matches.map((m) => ({
      id: m.id, round: m.round, slot: m.slot, name1: m.name1, name2: m.name2, status: m.status, code: m.status === "playing" ? m.code : null,
      winner: m.winnerId ? (m.winnerId === m.player1 ? 1 : 2) : null, reason: m.reason,
    })),
    myMatch: mine ? { code: mine.code!, opponent: (mine.player1 === user.id ? mine.name2 : mine.name1) ?? "?", round: mine.round } : null,
    champions,
    next: await next(t.id),
    serverNow: new Date().toISOString(),
  };
}

const createSchema = z.object({
  name: z.string().trim().min(3).max(60),
  startsAt: z.string().datetime({ offset: true }),
  size: z.number().int().refine((n) => TOURNAMENT_SIZES.includes(n), "Size must be 4, 8, 16 or 32"),
  prizes: z.array(z.number().int().min(0).max(1_000_000_000)).length(3),
});

export function registerTournamentRoutes(app: Express, requireUser: Mw, requireAdmin: Mw) {
  app.get("/api/tournaments/current", requireUser, async (_req, res) => {
    res.json(await view(res.locals.user));
  });

  app.post("/api/tournaments/:id/join", requireUser, async (req, res) => {
    const u: User = res.locals.user;
    const id = Number(req.params.id);
    const r = await db.transaction(async (tx) => {
      const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, id)).for("update");
      if (!t || t.status !== "open") return "Registration is closed";
      const [n] = await tx.select({ n: count() }).from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, id));
      if (n.n >= t.size) return "The tournament is full";
      await tx.insert(tournamentPlayers).values({ tournamentId: id, userId: u.id, username: u.username }).onConflictDoNothing();
      return null;
    });
    if (r) return res.status(409).json({ message: r });
    res.json(await view(u));
  });

  app.post("/api/tournaments/:id/leave", requireUser, async (req, res) => {
    const u: User = res.locals.user;
    const id = Number(req.params.id);
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!t || t.status !== "open") return res.status(409).json({ message: "The tournament has started" });
    await db.delete(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, id), eq(tournamentPlayers.userId, u.id)));
    res.json(await view(u));
  });

  // ---- Admin ----
  app.get("/api/admin/tournaments", requireAdmin, async (_req, res) => {
    const list = await db.select({
      id: tournaments.id, name: tournaments.name, startsAt: tournaments.startsAt, size: tournaments.size, prizes: tournaments.prizes,
      status: tournaments.status, auto: tournaments.auto, winnerName: tournaments.winnerName,
      players: sql<number>`(select count(*)::int from ${tournamentPlayers} where ${tournamentPlayers.tournamentId} = ${tournaments.id})`,
    }).from(tournaments).orderBy(desc(tournaments.startsAt)).limit(30);
    res.json({ tournaments: list, weekly: await weeklyEnabled(), nextWeekly: nextWeeklyStart().toISOString() });
  });

  app.post("/api/admin/tournaments", requireAdmin, async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    const startsAt = new Date(parsed.data.startsAt);
    if (startsAt.getTime() < Date.now() - 60_000) return res.status(400).json({ message: "Pick a time in the future" });
    const [t] = await db.insert(tournaments).values({ ...parsed.data, startsAt, status: "open" }).returning();
    res.json(t);
  });

  app.post("/api/admin/tournaments/:id/start", requireAdmin, async (req, res) => {
    const r = await startTournament(Number(req.params.id));
    if (r === "not_open") return res.status(409).json({ message: "Only an open tournament can be started" });
    res.json({ result: r });
  });

  app.post("/api/admin/tournaments/:id/cancel", requireAdmin, async (req, res) => {
    const [t] = await db.update(tournaments).set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(tournaments.id, Number(req.params.id)), eq(tournaments.status, "open"))).returning();
    if (!t) return res.status(409).json({ message: "Only an open tournament can be cancelled" });
    res.json({ ok: true });
  });

  app.put("/api/admin/tournaments/weekly", requireAdmin, async (req, res) => {
    const enabled = req.body?.enabled === true;
    await db.insert(appSettings).values({ key: WEEKLY_KEY, value: enabled ? "on" : "off" })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: enabled ? "on" : "off", updatedAt: new Date() } });
    res.json({ weekly: enabled });
  });
}
