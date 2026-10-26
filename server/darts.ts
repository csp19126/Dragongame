import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { randomInt } from "crypto";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { logPlay } from "./storage";
import { users, deposits, chatMessages, dartsMatches, dartsDaily, dartsDailyResults, dartsRewards, type User } from "@shared/schema";
import { vnDay } from "@shared/league";
import {
  applyDart, newX01, throwDart, botDart, hitAt, gaussFrom, dailyConditions, isBotLevel, BOTS,
  DARTS_STAKES, DARTS_EMOTES, DARTS_DART_MS, DARTS_LEGS, DAILY_DARTS, DAILY_PRIZES, PRACTICE_WIN_BONUS, PRACTICE_BONUS_LEVELS,
  type X01State, type Seat, type Hit, type BotLevel, type DartsServerMsg, type DartsTable, type DailyView, type DartEvent, type Visit, type Gauss,
} from "@shared/darts";

/**
 * Darts. Every dart is thrown here: the client says where it aimed and how it flicked, and
 * the server adds the scatter (crypto randomness) and decides where the dart lands.
 *  - Practice against the computer: the game lives in memory and never pays coins, apart from
 *    a small reward for the first win of the day against Anh Tư or Big Jock.
 *  - Online 1v1 501 with stakes, the same money model as pool: each stake is taken when the
 *    player sits down, the winner gets both, refunds for abandoned tables and after a restart.
 *  - Daily Challenge: 9 darts, one ranked attempt a day, top three paid at Vietnam midnight.
 */

const cryptoUniform = () => randomInt(1, 2 ** 47) / 2 ** 47;
const cryptoGauss = gaussFrom(cryptoUniform);
let gauss: Gauss = cryptoGauss;
/** Tests only: a fixed scatter (no argument puts the crypto randomness back) */
export function setDartsScatterForTest(g?: Gauss) { gauss = g ?? cryptoGauss; }
const DAY_MS = 86_400_000;
const fmt = (n: number) => n.toLocaleString("vi-VN");
/** Vietnam midnight at the start of `day`, in UTC */
const dayStartUtc = (day: string) => new Date(new Date(`${day}T00:00:00Z`).getTime() - 7 * 3600_000);

type Mw = RequestHandler;
const uid = (res: Response) => (res.locals.user as User).id;
const uname = (res: Response) => (res.locals.user as User).username;

/** Throws come in at most this often per player */
const MIN_THROW_GAP_MS = 250;
const lastThrow = new Map<string, number>();
function tooFast(userId: string) {
  const now = Date.now();
  if (now - (lastThrow.get(userId) ?? 0) < MIN_THROW_GAP_MS) return true;
  lastThrow.set(userId, now);
  return false;
}

// =====================================================================================
// Practice against the computer
// =====================================================================================

interface Practice { level: BotLevel; game: X01State; at: number; rewarded: boolean }
const practices = new Map<string, Practice>();
const PRACTICE_IDLE_MS = 6 * 3600_000;

/** Pays the first win of the day against a strong enough opponent, once */
async function practiceReward(userId: string): Promise<number> {
  const day = vnDay(new Date());
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(dartsRewards).values({ userId, day, amount: PRACTICE_WIN_BONUS }).onConflictDoNothing().returning({ day: dartsRewards.day });
    if (!row) return 0;
    await tx.update(users).set({ balance: sql`${users.balance} + ${PRACTICE_WIN_BONUS}` }).where(eq(users.id, userId));
    await tx.insert(deposits).values({ userId, amount: PRACTICE_WIN_BONUS, method: "darts_practice_win" });
    return PRACTICE_WIN_BONUS;
  });
}

async function rewardTaken(userId: string) {
  const [r] = await db.select({ d: dartsRewards.day }).from(dartsRewards).where(and(eq(dartsRewards.userId, userId), eq(dartsRewards.day, vnDay(new Date()))));
  return !!r;
}

// =====================================================================================
// Daily Challenge
// =====================================================================================

/** Practice runs of the challenge (not stored, not ranked) */
const dailyPractice = new Map<string, { day: string; darts: Hit[] }>();

/** The day's ranked table: best score first, ties to whoever got there first */
async function dailyTop(day: string, limit = 20) {
  return db.select({ userId: dartsDaily.userId, username: users.username, avatarUrl: users.profileImageUrl, score: dartsDaily.score, darts: dartsDaily.darts })
    .from(dartsDaily).innerJoin(users, eq(users.id, dartsDaily.userId))
    .where(and(eq(dartsDaily.day, day), gt(dartsDaily.score, 0)))
    .orderBy(desc(dartsDaily.score), asc(dartsDaily.updatedAt), asc(dartsDaily.id))
    .limit(limit);
}

/** Pays a finished day's top three once (the results row is the lock), then tells the chat */
export async function settleDaily(day: string) {
  const paid = await db.transaction(async (tx) => {
    const top = await tx.select({ userId: dartsDaily.userId, username: users.username, score: dartsDaily.score })
      .from(dartsDaily).innerJoin(users, eq(users.id, dartsDaily.userId))
      .where(and(eq(dartsDaily.day, day), gt(dartsDaily.score, 0)))
      .orderBy(desc(dartsDaily.score), asc(dartsDaily.updatedAt), asc(dartsDaily.id))
      .limit(DAILY_PRIZES.length);
    const summary = top.map((r, i) => ({ username: r.username, score: r.score, prize: DAILY_PRIZES[i] }));
    const [row] = await tx.insert(dartsDailyResults).values({ day, summary }).onConflictDoNothing().returning({ day: dartsDailyResults.day });
    if (!row) return null; // already paid
    for (const [i, r] of top.entries()) {
      await tx.update(users).set({ balance: sql`${users.balance} + ${DAILY_PRIZES[i]}` }).where(eq(users.id, r.userId));
      await tx.insert(deposits).values({ userId: r.userId, amount: DAILY_PRIZES[i], method: "darts_daily" });
    }
    return summary;
  });
  if (paid?.length) {
    const w = paid[0];
    await db.insert(chatMessages).values({
      userId: "system", username: "🎯 Phi Tiêu",
      text: `🎯 Thử thách 9 phi tiêu ngày ${day}: ${w.username} vô địch với ${w.score} điểm (+${fmt(w.prize)} xu)!${paid[1] ? ` Hạng 2: ${paid[1].username} (${paid[1].score}).` : ""}${paid[2] ? ` Hạng 3: ${paid[2].username} (${paid[2].score}).` : ""} Hôm nay ai sẽ phá kỷ lục?`,
    }).catch((e) => console.error("[darts] chat", e));
  }
  return paid;
}

/** Settles the last few finished days that haven't been paid yet (so a restart or downtime can't skip one) */
export async function dartsDailyTick(now = new Date()) {
  for (let k = 3; k >= 1; k--) {
    const day = vnDay(new Date(now.getTime() - k * DAY_MS));
    const [done] = await db.select({ d: dartsDailyResults.day }).from(dartsDailyResults).where(eq(dartsDailyResults.day, day));
    if (!done) await settleDaily(day);
  }
}

export function startDartsScheduler(httpServer?: { on(event: "close", fn: () => void): unknown }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await dartsDailyTick(); } catch (e) { console.error("[darts]", e); } finally { running = false; }
    // Forget idle practice games
    const now = Date.now();
    for (const [k, p] of practices) if (now - p.at > PRACTICE_IDLE_MS) practices.delete(k);
    for (const [k, p] of dailyPractice) if (p.day !== vnDay(new Date())) dailyPractice.delete(k);
  };
  void run();
  const timer = setInterval(run, 60_000);
  timer.unref?.();
  httpServer?.on("close", () => clearInterval(timer));
}

// =====================================================================================
// Online tables
// =====================================================================================

const GONE_MS = 90_000; // a seated player away this long forfeits
const WAITING_MS = 30 * 60_000; // an open table nobody joins is closed and refunded
const MAX_TIMEOUTS = 6; // six darts in a row not thrown in time forfeits
const RESERVE_MS = 60_000; // a rematch table waits this long for the old opponent only

interface Client { ws: WebSocket; userId: string; seat: Seat | null; lastAim: number; lastEmote: number; lastThrow: number }

interface Room {
  id: number;
  code: string;
  stake: number;
  legs: number;
  players: [string, string | null];
  names: [string, string | null];
  status: "waiting" | "playing" | "finished";
  game: X01State | null;
  deadline: number;
  createdAt: number;
  lastSeen: [number, number];
  timeouts: [number, number];
  clients: Set<Client>;
  result?: { winner: Seat; reason: string; payout: number };
  rematch?: { code: string; by: Seat };
  reservedFor?: { userId: string; until: number };
}

const rooms = new Map<string, Room>();
const activeByUser = new Map<string, string>();
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

const seatOf = (room: Room, userId: string): Seat | null => (room.players[0] === userId ? 0 : room.players[1] === userId ? 1 : null);
const reserved = (room: Room, userId?: string) => !!room.reservedFor && room.reservedFor.until > Date.now() && room.reservedFor.userId !== userId;

function send(ws: WebSocket, msg: DartsServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function online(room: Room): [boolean, boolean] {
  const on: [boolean, boolean] = [false, false];
  for (const c of room.clients) if (c.seat !== null) on[c.seat] = true;
  return on;
}
function stateMsg(room: Room, seat: Seat | null): DartsServerMsg {
  return {
    t: "state", code: room.code, stake: room.stake, legs: room.legs, seat, names: room.names, status: room.status, game: room.game,
    msLeft: room.status === "playing" ? Math.max(0, room.deadline - Date.now()) : null,
    online: online(room), spectators: [...room.clients].filter((c) => c.seat === null).length,
    result: room.result ?? null, rematch: room.rematch?.code ? room.rematch : null,
  };
}
function broadcastState(room: Room) {
  for (const c of room.clients) send(c.ws, stateMsg(room, c.seat));
}
function broadcast(room: Room, msg: DartsServerMsg, except?: Client) {
  for (const c of room.clients) if (c !== except) send(c.ws, msg);
}

/** Settles a finished match once: the winner gets both stakes */
async function finish(room: Room, winner: Seat, reason: string) {
  if (room.status === "finished") return;
  room.status = "finished";
  const payout = room.stake * 2;
  const winnerId = room.players[winner]!;
  const loserId = room.players[(1 - winner) as Seat]!;
  await db.transaction(async (tx) => {
    const [m] = await tx.update(dartsMatches).set({ status: "finished", winner: winnerId, reason, finishedAt: new Date() })
      .where(and(eq(dartsMatches.id, room.id), eq(dartsMatches.status, "playing"))).returning({ id: dartsMatches.id });
    if (!m) return; // already settled
    await tx.update(users).set({
      balance: sql`${users.balance} + ${payout}`,
      gamesPlayed: sql`${users.gamesPlayed} + 1`,
      totalWins: sql`${users.totalWins} + 1`,
      maxWin: sql`greatest(${users.maxWin}, ${payout})`,
    }).where(eq(users.id, winnerId));
    await tx.update(users).set({ gamesPlayed: sql`${users.gamesPlayed} + 1` }).where(eq(users.id, loserId));
    await logPlay(tx, winnerId, "darts", room.stake, payout);
    await logPlay(tx, loserId, "darts", room.stake, 0);
  }).catch((e) => console.error("[darts] settle", e));
  room.result = { winner, reason, payout };
  for (const id of room.players) if (id && activeByUser.get(id) === room.code) activeByUser.delete(id);
  broadcastState(room);
  setTimeout(() => { if (rooms.get(room.code) === room) rooms.delete(room.code); }, 10 * 60_000).unref?.();
}

/** Closes a table, refunding every stake taken (nobody joined, or both players walked away) */
async function cancel(room: Room, reason: string) {
  const from = room.status === "playing" ? "playing" : "waiting";
  room.status = "finished";
  await db.transaction(async (tx) => {
    const [m] = await tx.update(dartsMatches).set({ status: "cancelled", reason, finishedAt: new Date() })
      .where(and(eq(dartsMatches.id, room.id), eq(dartsMatches.status, from))).returning({ id: dartsMatches.id });
    if (!m || room.stake <= 0) return;
    await tx.update(users).set({ balance: sql`${users.balance} + ${room.stake}` }).where(eq(users.id, room.players[0]));
    if (from === "playing" && room.players[1]) await tx.update(users).set({ balance: sql`${users.balance} + ${room.stake}` }).where(eq(users.id, room.players[1]));
  });
  rooms.delete(room.code);
  for (const id of room.players) if (id && activeByUser.get(id) === room.code) activeByUser.delete(id);
  for (const c of room.clients) { send(c.ws, { t: "closed", reason }); c.ws.close(); }
}

/** After a restart the games in memory are gone: every stake goes back */
export async function recoverDartsMatches() {
  const open = await db.select().from(dartsMatches).where(inArray(dartsMatches.status, ["waiting", "playing"]));
  for (const m of open) {
    await db.transaction(async (tx) => {
      const [done] = await tx.update(dartsMatches).set({ status: "cancelled", reason: "server_restart", finishedAt: new Date() })
        .where(and(eq(dartsMatches.id, m.id), inArray(dartsMatches.status, ["waiting", "playing"]))).returning({ id: dartsMatches.id });
      if (!done || m.stake <= 0) return;
      await tx.update(users).set({ balance: sql`${users.balance} + ${m.stake}` }).where(eq(users.id, m.player1));
      if (m.player2) await tx.update(users).set({ balance: sql`${users.balance} + ${m.stake}` }).where(eq(users.id, m.player2));
    });
  }
  if (open.length) console.log(`[startup] darts: refunded ${open.length} unfinished table(s)`);
}

/** Opens a table, taking the host's stake. Null if they can't afford it. */
async function openTable(userId: string, name: string, stake: number, legs: number, reservedFor?: string): Promise<Room | null> {
  let code = newCode();
  while (rooms.has(code)) code = newCode();
  const created = await db.transaction(async (tx) => {
    if (stake > 0) {
      const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${stake}` })
        .where(and(eq(users.id, userId), sql`${users.balance} >= ${stake}`)).returning({ id: users.id });
      if (!paid) return null;
    }
    const [m] = await tx.insert(dartsMatches).values({ code, player1: userId, stake, legs, status: "waiting" }).returning();
    return m;
  });
  if (!created) return null;
  const now = Date.now();
  const room: Room = {
    id: created.id, code, stake, legs, players: [userId, null], names: [name, null], status: "waiting", game: null,
    deadline: 0, createdAt: now, lastSeen: [now, now], timeouts: [0, 0], clients: new Set(),
    ...(reservedFor ? { reservedFor: { userId: reservedFor, until: now + RESERVE_MS } } : {}),
  };
  rooms.set(code, room);
  activeByUser.set(userId, code);
  return room;
}

function startClock(room: Room) { room.deadline = Date.now() + DARTS_DART_MS; }

/** One dart at an online table (thrown, or a timeout's miss) */
async function playDart(room: Room, seat: Seat, hit: Hit, timeout = false) {
  const g = room.game!;
  const r = applyDart(g, hit);
  room.game = r.state;
  startClock(room);
  broadcast(room, { t: "dart", by: seat, hit, event: r.event, visit: r.visit, game: r.state, ...(timeout ? { timeout: true } : {}) });
  if (r.state.winner !== null) await finish(room, r.state.winner, "win");
}

async function onThrow(room: Room, client: Client, raw: unknown) {
  const g = room.game;
  if (room.status !== "playing" || !g || client.seat === null) return;
  if (g.turn !== client.seat) return send(client.ws, { t: "error", message: "Not your turn" });
  const now = Date.now();
  if (now - client.lastThrow < MIN_THROW_GAP_MS) return;
  client.lastThrow = now;
  room.timeouts[client.seat] = 0;
  await playDart(room, client.seat, throwDart(raw, gauss));
}

async function tick() {
  const now = Date.now();
  for (const room of rooms.values()) {
    try {
      if (room.status === "waiting" && now - room.createdAt > WAITING_MS) { await cancel(room, "expired"); continue; }
      if (room.status !== "playing" || !room.game) continue;
      const on = online(room);
      for (const s of [0, 1] as Seat[]) if (on[s]) room.lastSeen[s] = now;
      const gone = ([0, 1] as Seat[]).map((s) => !on[s] && now - room.lastSeen[s] > GONE_MS);
      if (gone[0] && gone[1]) { await cancel(room, "abandoned"); continue; } // both walked away: refund
      if (gone[0] || gone[1]) { await finish(room, gone[0] ? 1 : 0, "left"); continue; }
      if (now > room.deadline) {
        const s = room.game.turn;
        room.timeouts[s]++;
        if (room.timeouts[s] >= MAX_TIMEOUTS) { await finish(room, (1 - s) as Seat, "timeouts"); continue; }
        await playDart(room, s, hitAt(0, 300), true);
      }
    } catch (e) {
      console.error("[darts] tick", e);
    }
  }
}

/** Tests only: forget every table, as a restart would */
export function dropAllDartsRoomsForTest() {
  rooms.clear();
  activeByUser.clear();
  practices.clear();
  dailyPractice.clear();
}

/** The darts table a player has open, and whether its second seat is free (for "join your friend") */
export function dartsRoomOf(userId: string): { code: string; open: boolean } | null {
  const code = activeByUser.get(userId);
  const room = code ? rooms.get(code) : undefined;
  if (!room) return null;
  return { code: room.code, open: room.status === "waiting" && !room.players[1] && room.players[0] === userId && !reserved(room) };
}

// =====================================================================================
// HTTP
// =====================================================================================

export function registerDartsRoutes(app: Express, requireUser: Mw) {
  // ---------- Practice ----------
  const practiceView = (p: Practice | undefined) => p ? { level: p.level, bot: BOTS[p.level], game: p.game } : null;

  app.get("/api/darts/practice", requireUser, async (_req, res) => {
    const me = uid(res);
    res.json({ practice: practiceView(practices.get(me)), rewardTaken: await rewardTaken(me), reward: PRACTICE_WIN_BONUS, rewardLevels: PRACTICE_BONUS_LEVELS });
  });

  app.post("/api/darts/practice/start", requireUser, (req, res) => {
    const level = req.body?.level;
    const legs = Number(req.body?.legs ?? 3);
    if (!isBotLevel(level) || !DARTS_LEGS.includes(legs as 1 | 3)) return res.status(400).json({ message: "Bad request" });
    const p: Practice = { level, game: newX01(legs === 3 ? 2 : 1, 0), at: Date.now(), rewarded: false };
    practices.set(uid(res), p);
    res.json({ practice: practiceView(p) });
  });

  app.post("/api/darts/practice/throw", requireUser, async (req, res) => {
    const me = uid(res);
    const p = practices.get(me);
    if (!p || p.game.winner !== null) return res.status(409).json({ message: "Start a new game" });
    if (p.game.turn !== 0) return res.status(409).json({ message: "Not your turn" });
    if (tooFast(me)) return res.status(429).json({ message: "Slow down a little!" });
    const hit = throwDart(req.body, gauss);
    const mine = applyDart(p.game, hit);
    p.game = mine.state;
    p.at = Date.now();
    // The computer's visit (or visits, until it's the player's turn again or the match ends)
    const bot: { hit: Hit; event: DartEvent; visit?: Visit }[] = [];
    while (p.game.winner === null && p.game.turn === 1 && bot.length < 12) {
      const b = botDart(p.level, p.game.scores[1], 3 - p.game.visit.length, gauss);
      const r = applyDart(p.game, b);
      p.game = r.state;
      bot.push({ hit: b, event: r.event, visit: r.visit });
    }
    let reward = 0;
    if (p.game.winner === 0 && !p.rewarded && PRACTICE_BONUS_LEVELS.includes(p.level)) {
      p.rewarded = true;
      reward = await practiceReward(me);
    }
    res.json({ hit, event: mine.event, visit: mine.visit, bot, game: p.game, reward });
  });

  // ---------- Daily Challenge ----------
  app.get("/api/darts/daily", requireUser, async (_req, res) => {
    const me = uid(res);
    const now = new Date();
    const day = vnDay(now);
    const top = await dailyTop(day);
    const [mine] = await db.select().from(dartsDaily).where(and(eq(dartsDaily.userId, me), eq(dartsDaily.day, day)));
    let rank: number | null = null;
    if (mine) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(dartsDaily).where(and(
        eq(dartsDaily.day, day),
        sql`(${dartsDaily.score} > ${mine.score} or (${dartsDaily.score} = ${mine.score} and (${dartsDaily.updatedAt} < ${mine.updatedAt} or (${dartsDaily.updatedAt} = ${mine.updatedAt} and ${dartsDaily.id} < ${mine.id}))))`,
      ));
      rank = n + 1;
    }
    const prac = dailyPractice.get(me);
    const yday = vnDay(new Date(now.getTime() - DAY_MS));
    const [y] = await db.select().from(dartsDailyResults).where(eq(dartsDailyResults.day, yday));
    const view: DailyView = {
      day,
      endsAt: new Date(dayStartUtc(day).getTime() + DAY_MS).toISOString(),
      conditions: dailyConditions(day),
      prizes: DAILY_PRIZES,
      top: top.map((r, i) => ({ rank: i + 1, username: r.username, avatarUrl: r.avatarUrl ?? null, score: r.score, darts: r.darts.length })),
      me: {
        ranked: mine ? { darts: mine.darts as Hit[], score: mine.score, done: mine.darts.length >= DAILY_DARTS } : null,
        rank,
        practice: prac && prac.day === day ? { darts: prac.darts, score: prac.darts.reduce((a, h) => a + h.score, 0), done: prac.darts.length >= DAILY_DARTS } : null,
      },
      yesterday: y ? { day: yday, winners: y.summary } : null,
    };
    res.json(view);
  });

  app.post("/api/darts/daily/start", requireUser, async (req, res) => {
    const me = uid(res);
    const day = vnDay(new Date());
    if (req.body?.ranked) {
      await db.insert(dartsDaily).values({ userId: me, day }).onConflictDoNothing();
      const [row] = await db.select().from(dartsDaily).where(and(eq(dartsDaily.userId, me), eq(dartsDaily.day, day)));
      if (row.darts.length >= DAILY_DARTS) return res.status(409).json({ message: "You've already played today's ranked challenge" });
      return res.json({ ranked: true, darts: row.darts, score: row.score, done: false });
    }
    dailyPractice.set(me, { day, darts: [] });
    res.json({ ranked: false, darts: [], score: 0, done: false });
  });

  app.post("/api/darts/daily/throw", requireUser, async (req, res) => {
    const me = uid(res);
    const day = vnDay(new Date());
    const cond = dailyConditions(day);
    if (tooFast(me)) return res.status(429).json({ message: "Slow down a little!" });
    if (!req.body?.ranked) {
      const p = dailyPractice.get(me);
      if (!p || p.day !== day || p.darts.length >= DAILY_DARTS) return res.status(409).json({ message: "Start the challenge first" });
      const hit = throwDart(req.body, gauss, cond);
      p.darts.push(hit);
      return res.json({ hit, darts: p.darts, score: p.darts.reduce((a, h) => a + h.score, 0), done: p.darts.length >= DAILY_DARTS });
    }
    const out = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(dartsDaily).where(and(eq(dartsDaily.userId, me), eq(dartsDaily.day, day))).for("update");
      if (!row) return { error: "Start the challenge first" } as const;
      if (row.darts.length >= DAILY_DARTS) return { error: "You've already played today's ranked challenge" } as const;
      const hit = throwDart(req.body, gauss, cond);
      const darts = [...(row.darts as Hit[]), hit];
      const score = row.score + hit.score;
      await tx.update(dartsDaily).set({ darts, score, updatedAt: new Date() }).where(eq(dartsDaily.id, row.id));
      return { hit, darts, score, done: darts.length >= DAILY_DARTS };
    });
    if ("error" in out) return res.status(409).json({ message: out.error });
    res.json(out);
  });

  // ---------- Online tables ----------
  app.get("/api/darts/tables", requireUser, (_req, res) => {
    const me = uid(res);
    const open: DartsTable[] = [...rooms.values()]
      .filter((r) => r.status === "waiting" && r.players[0] !== me && !reserved(r, me))
      .map((r) => ({ code: r.code, stake: r.stake, legs: r.legs, host: r.names[0], status: "waiting" as const }));
    const live: DartsTable[] = [...rooms.values()]
      .filter((r) => r.status === "playing")
      .map((r) => ({ code: r.code, stake: r.stake, legs: r.legs, host: r.names[0], guest: r.names[1] ?? undefined, status: "playing" as const }));
    res.json({ open, live, mine: activeByUser.get(me) ?? null, stakes: DARTS_STAKES });
  });

  app.post("/api/darts/tables", requireUser, async (req, res) => {
    const stake = Number(req.body?.stake);
    const legs = Number(req.body?.legs ?? 1);
    if (!DARTS_STAKES.includes(stake)) return res.status(400).json({ message: "Invalid stake" });
    if (!DARTS_LEGS.includes(legs as 1 | 3)) return res.status(400).json({ message: "Bad request" });
    const me = uid(res);
    if (activeByUser.has(me)) return res.status(409).json({ message: "You already have a table", code: activeByUser.get(me) });
    const room = await openTable(me, uname(res), stake, legs);
    if (!room) return res.status(400).json({ message: "Insufficient balance", code: "insufficient_balance" });
    res.json({ code: room.code });
  });

  app.post("/api/darts/tables/:code/join", requireUser, async (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const me = uid(res);
    if (!room) return res.status(404).json({ message: "Table not found" });
    if (room.players[0] === me) return res.json({ code: room.code });
    if (room.status !== "waiting") return res.status(409).json({ message: "Someone already took that seat" });
    if (reserved(room, me)) return res.status(409).json({ message: "This table is saved for someone else" });
    if (activeByUser.has(me)) return res.status(409).json({ message: "Finish your own table first", code: activeByUser.get(me) });
    room.status = "playing"; // claim the seat before the await, so two joins can't both win it
    room.players[1] = me;
    const ok = await db.transaction(async (tx) => {
      if (room.stake > 0) {
        const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${room.stake}` })
          .where(and(eq(users.id, me), sql`${users.balance} >= ${room.stake}`)).returning({ id: users.id });
        if (!paid) return false;
      }
      const [m] = await tx.update(dartsMatches).set({ player2: me, status: "playing" })
        .where(and(eq(dartsMatches.id, room.id), eq(dartsMatches.status, "waiting"))).returning({ id: dartsMatches.id });
      if (!m) throw new Error("Table is gone");
      return true;
    }).catch(() => false);
    if (!ok) {
      room.status = "waiting";
      room.players[1] = null;
      return res.status(400).json({ message: "Insufficient balance", code: "insufficient_balance" });
    }
    room.names[1] = uname(res);
    room.reservedFor = undefined;
    room.game = newX01(room.legs === 3 ? 2 : 1, randomInt(2) as Seat);
    room.lastSeen = [Date.now(), Date.now()];
    startClock(room);
    activeByUser.set(me, room.code);
    broadcastState(room);
    res.json({ code: room.code });
  });

  app.post("/api/darts/tables/:code/cancel", requireUser, async (req, res) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    if (!room || room.players[0] !== uid(res)) return res.status(404).json({ message: "Table not found" });
    if (room.status !== "waiting") return res.status(409).json({ message: "The game has started" });
    await cancel(room, "cancelled");
    res.json({ ok: true });
  });
}

// =====================================================================================
// WebSocket: the table
// =====================================================================================

export function attachDartsSockets(httpServer: Server, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const timer = setInterval(() => { void tick(); }, 1000);
  timer.unref?.();
  httpServer.on("close", () => clearInterval(timer));

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/ws/darts") return;
    sessionMiddleware(req as Request, {} as Response, (() => {
      const userId = (req as Request).session?.userId;
      const room = rooms.get((url.searchParams.get("code") ?? "").toUpperCase());
      if (!userId || !room) {
        socket.write(`HTTP/1.1 ${userId ? "404 Not Found" : "401 Unauthorized"}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws, room, userId));
    }) as NextFunction);
  });

  function onConnect(ws: WebSocket, room: Room, userId: string) {
    const client: Client = { ws, userId, seat: seatOf(room, userId), lastAim: 0, lastEmote: 0, lastThrow: 0 };
    room.clients.add(client);
    if (client.seat !== null) room.lastSeen[client.seat] = Date.now();
    broadcastState(room);

    ws.on("message", (raw) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!msg || typeof msg !== "object") return;
      const now = Date.now();
      if (msg.t === "throw") {
        void onThrow(room, client, msg).catch((e) => console.error("[darts] throw", e));
      } else if (msg.t === "aim" && client.seat !== null && room.game?.turn === client.seat && room.status === "playing" && now - client.lastAim > 80) {
        client.lastAim = now;
        const n = (v: unknown, lim: number) => (Number.isFinite(Number(v)) ? Math.max(-lim, Math.min(lim, Math.round(Number(v) * 10) / 10)) : 0);
        broadcast(room, { t: "aim", x: n(msg.x, 260), y: n(msg.y, 260), hold: n(msg.hold, 10_000) }, client);
      } else if (msg.t === "emote" && DARTS_EMOTES.includes(msg.e) && now - client.lastEmote > 1200) {
        client.lastEmote = now;
        broadcast(room, { t: "emote", from: client.seat, e: msg.e });
      } else if (msg.t === "resign" && client.seat !== null && room.status === "playing") {
        void finish(room, (1 - client.seat) as Seat, "resign");
      } else if (msg.t === "rematch" && client.seat !== null && room.status === "finished" && room.result && !room.rematch) {
        void rematch(room, client).catch((e) => console.error("[darts] rematch", e));
      }
    });
    ws.on("close", () => {
      room.clients.delete(client);
      if (client.seat !== null) room.lastSeen[client.seat] = Date.now();
      if (rooms.get(room.code) === room) broadcastState(room);
    });
  }

  /** Opens a new table for the same stake, saved for the old opponent for a minute */
  async function rematch(room: Room, client: Client) {
    const seat = client.seat!;
    if (activeByUser.has(client.userId)) return send(client.ws, { t: "error", message: "You already have a table" });
    room.rematch = { code: "", by: seat }; // claimed: a second request can't open another
    const other = room.players[(1 - seat) as Seat]!;
    const next = await openTable(client.userId, room.names[seat]!, room.stake, room.legs, other);
    if (!next) {
      room.rematch = undefined;
      return send(client.ws, { t: "error", message: "Insufficient balance" });
    }
    room.rematch = { code: next.code, by: seat };
    broadcastState(room);
  }
}
