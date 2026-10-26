import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { randomInt } from "crypto";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { logPlay } from "./storage";
import { users, deposits, chatMessages, footballMatches, footballRatings, footballWeeks, type User } from "@shared/schema";
import { vnDay } from "@shared/league";
import {
  CHOOSE_MS, REVEAL_MS, FOOTBALL_STAKES, FOOTBALL_EMOTES, ELO_START, LADDER_MIN_GAMES, LADDER_MIN_KICKS,
  LADDER_MAX_PER_PAIR_PER_DAY, LADDER_PRIZES, AI_REACH, FOOTBALL_DAILY_WIN, LEVELS,
  newShootout, addKick, shooterOf, keeperOf, shootoutWinner, tally, resolveKick, cleanShot, isZone, validKit,
  aiShot, aiDive, randomShot, eloDelta, weekOf, weekEnd, previousWeek,
  type Side, type Zone, type ShotChoice, type Shootout, type KickResult, type Level,
  type FootballServerMsg, type FootballTable, type LadderRow, type LadderView,
} from "@shared/football";

/**
 * Online penalty shootouts. Tables (and their stakes) live in the database; the shootout in
 * progress lives here in memory with this server as the referee. Every kick is a simultaneous
 * hidden choice: the shooter's aim/power/bend and the keeper's dive are both locked in here
 * before either is shown to anyone, then the server plays the kick with a crypto-random seed.
 * The money model is pool's: both stakes held in escrow from the start, the winner takes the
 * pot, an abandoned table is refunded, and a restart refunds every unfinished table.
 */

const GONE_MS = 60_000; // a seated player away this long forfeits (both away: refunded)
const WAITING_MS = 30 * 60_000; // an open table with nobody joining is closed and refunded
const MAX_TIMEOUTS = 4; // running out of time this many kicks in a row forfeits
const FIRST_KICK_GRACE_MS = 3_000;

type Choice = { kind: "shot"; shot: ShotChoice } | { kind: "dive"; zone: Zone };
interface Client { ws: WebSocket; userId: string; seat: Side | null; lastEmote: number }

interface Room {
  id: number;
  code: string;
  stake: number;
  players: [string, string | null];
  names: [string, string | null];
  kits: [string, string];
  avatars: [string | null, string | null];
  status: "waiting" | "playing" | "finished";
  shootout: Shootout | null;
  phase: "choose" | "reveal";
  /** The secret choices for the kick being taken, by seat. Never sent to anyone until both are in. */
  pending: [Choice | null, Choice | null];
  log: KickResult[];
  deadline: number;
  createdAt: number;
  lastSeen: [number, number];
  timeouts: [number, number];
  clients: Set<Client>;
  result?: { winner: Side; reason: string; payout: number; ladder?: { counted: boolean; delta: number } };
  rematch: [boolean, boolean];
  rematchBusy?: boolean;
}

const rooms = new Map<string, Room>();
const activeByUser = new Map<string, string>(); // userId -> table code

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
/** Uniform 0..1 from crypto, for the computer's and the timeout's random picks */
const cryptoRand = () => randomInt(1_000_000_000) / 1_000_000_000;
const newSeed = () => randomInt(4_294_967_296);
const dayStartOf = (now: Date) => new Date(new Date(`${vnDay(now)}T00:00:00Z`).getTime() - 7 * 3600_000);

function seatOf(room: Room, userId: string): Side | null {
  return room.players[0] === userId ? 0 : room.players[1] === userId ? 1 : null;
}

function send(ws: WebSocket, msg: FootballServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function online(room: Room): [boolean, boolean] {
  const on: [boolean, boolean] = [false, false];
  for (const c of room.clients) if (c.seat !== null) on[c.seat] = true;
  return on;
}

function stateMsg(room: Room, seat: Side | null): FootballServerMsg {
  return {
    t: "state",
    code: room.code,
    stake: room.stake,
    seat,
    names: room.names,
    kits: room.kits,
    avatars: room.avatars,
    status: room.status,
    shootout: room.shootout,
    phase: room.status === "playing" ? room.phase : null,
    committed: [!!room.pending[0], !!room.pending[1]],
    msLeft: room.status === "playing" ? Math.max(0, room.deadline - Date.now()) : null,
    online: online(room),
    spectators: [...room.clients].filter((c) => c.seat === null).length,
    result: room.result ?? null,
    rematch: room.rematch,
  };
}

function broadcastState(room: Room) {
  for (const c of room.clients) send(c.ws, stateMsg(room, c.seat));
}
function broadcast(room: Room, msg: FootballServerMsg) {
  for (const c of room.clients) send(c.ws, msg);
}

// ---------------- Money and the ladder ----------------

/** Settles a finished match exactly once: pays the winner both stakes, records the ladder */
async function finish(room: Room, winner: Side, reason: string) {
  if (room.status === "finished") return;
  room.status = "finished";
  room.pending = [null, null];
  const payout = room.stake * 2;
  const winnerId = room.players[winner]!;
  const loserId = room.players[(1 - winner) as Side]!;
  const now = new Date();
  const week = weekOf(now);
  const kicks = room.shootout?.kicks.length ?? 0;
  const t = room.shootout ? tally(room.shootout) : null;
  const score = t ? `${t.goals[0]}-${t.goals[1]}` : null;
  let counted = false;
  let delta = 0;
  await db.transaction(async (tx) => {
    let counts = kicks >= LADDER_MIN_KICKS;
    if (counts) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(footballMatches).where(and(
        eq(footballMatches.counted, true), gte(footballMatches.finishedAt, dayStartOf(now)),
        or(and(eq(footballMatches.player1, winnerId), eq(footballMatches.player2, loserId)), and(eq(footballMatches.player1, loserId), eq(footballMatches.player2, winnerId))),
      ));
      counts = n < LADDER_MAX_PER_PAIR_PER_DAY;
    }
    const [m] = await tx.update(footballMatches)
      .set({ status: "finished", winner: winnerId, reason, finishedAt: now, score, kicks: room.log, week, counted: counts })
      .where(and(eq(footballMatches.id, room.id), eq(footballMatches.status, "playing")))
      .returning({ id: footballMatches.id });
    if (!m) return; // already settled
    if (payout > 0) {
      await tx.update(users).set({
        balance: sql`${users.balance} + ${payout}`,
        gamesPlayed: sql`${users.gamesPlayed} + 1`,
        totalWins: sql`${users.totalWins} + 1`,
        maxWin: sql`greatest(${users.maxWin}, ${payout})`,
      }).where(eq(users.id, winnerId));
    } else {
      await tx.update(users).set({ gamesPlayed: sql`${users.gamesPlayed} + 1`, totalWins: sql`${users.totalWins} + 1` }).where(eq(users.id, winnerId));
    }
    await tx.update(users).set({ gamesPlayed: sql`${users.gamesPlayed} + 1` }).where(eq(users.id, loserId));
    await logPlay(tx, winnerId, "football", room.stake, payout);
    await logPlay(tx, loserId, "football", room.stake, 0);
    if (counts) {
      // Weekly Elo: both rows locked so two matches finishing together can't lose an update
      for (const id of [winnerId, loserId]) {
        await tx.insert(footballRatings).values({ userId: id, week, rating: ELO_START }).onConflictDoNothing();
      }
      const rows = await tx.select().from(footballRatings)
        .where(and(eq(footballRatings.week, week), inArray(footballRatings.userId, [winnerId, loserId])))
        .for("update");
      const rw = rows.find((r) => r.userId === winnerId)!.rating;
      const rl = rows.find((r) => r.userId === loserId)!.rating;
      delta = eloDelta(rw, rl);
      await tx.update(footballRatings).set({ rating: sql`${footballRatings.rating} + ${delta}`, played: sql`${footballRatings.played} + 1`, won: sql`${footballRatings.won} + 1`, updatedAt: now })
        .where(and(eq(footballRatings.userId, winnerId), eq(footballRatings.week, week)));
      await tx.update(footballRatings).set({ rating: sql`${footballRatings.rating} - ${delta}`, played: sql`${footballRatings.played} + 1`, updatedAt: now })
        .where(and(eq(footballRatings.userId, loserId), eq(footballRatings.week, week)));
      await tx.update(footballMatches).set({ eloDelta: delta }).where(eq(footballMatches.id, room.id));
      counted = true;
    }
  });
  room.result = { winner, reason, payout, ladder: { counted, delta } };
  for (const id of room.players) if (id && activeByUser.get(id) === room.code) activeByUser.delete(id);
  broadcastState(room);
  setTimeout(() => { if (rooms.get(room.code) === room) rooms.delete(room.code); }, 10 * 60_000).unref?.();
}

/** Closes a table nobody joined (or one both players walked away from), refunding every stake */
async function cancel(room: Room, reason: string) {
  const from = room.status === "playing" ? "playing" : "waiting";
  room.status = "finished";
  await db.transaction(async (tx) => {
    const [m] = await tx.update(footballMatches).set({ status: "cancelled", reason, finishedAt: new Date(), kicks: room.log })
      .where(and(eq(footballMatches.id, room.id), eq(footballMatches.status, from))).returning({ id: footballMatches.id });
    if (!m || room.stake <= 0) return;
    for (const id of room.players) if (id) await tx.update(users).set({ balance: sql`${users.balance} + ${room.stake}` }).where(eq(users.id, id));
  });
  rooms.delete(room.code);
  for (const id of room.players) if (id && activeByUser.get(id) === room.code) activeByUser.delete(id);
  for (const c of room.clients) { send(c.ws, { t: "closed", reason }); c.ws.close(); }
}

/** After a restart the matches in memory are gone: give every stake back */
export async function recoverFootballMatches() {
  const open = await db.select().from(footballMatches).where(inArray(footballMatches.status, ["waiting", "playing"]));
  for (const m of open) {
    await db.transaction(async (tx) => {
      const [done] = await tx.update(footballMatches).set({ status: "cancelled", reason: "server_restart", finishedAt: new Date() })
        .where(and(eq(footballMatches.id, m.id), inArray(footballMatches.status, ["waiting", "playing"]))).returning({ id: footballMatches.id });
      if (!done || m.stake <= 0) return;
      await tx.update(users).set({ balance: sql`${users.balance} + ${m.stake}` }).where(eq(users.id, m.player1));
      if (m.player2) await tx.update(users).set({ balance: sql`${users.balance} + ${m.stake}` }).where(eq(users.id, m.player2));
    });
  }
  if (open.length) console.log(`[startup] football: refunded ${open.length} unfinished table(s)`);
}

// ---------------- The kicks ----------------

function startKick(room: Room, extra = 0) {
  room.phase = "choose";
  room.pending = [null, null];
  room.deadline = Date.now() + CHOOSE_MS + extra;
}

/** Both choices are in: play the kick, show it to everyone, and settle if it decided the match */
async function resolve(room: Room) {
  const s = room.shootout;
  if (!s || room.status !== "playing" || room.phase !== "choose") return;
  const shooter = shooterOf(s);
  const keeper = keeperOf(s);
  const a = room.pending[shooter];
  const b = room.pending[keeper];
  if (a?.kind !== "shot" || b?.kind !== "dive") return;
  const kick = resolveKick(a.shot, b.zone, newSeed());
  const index = s.kicks.length;
  room.shootout = addKick(s, kick.scored, kick.outcome);
  room.log.push(kick);
  room.pending = [null, null];
  room.phase = "reveal";
  room.deadline = Date.now() + REVEAL_MS;
  const winner = shootoutWinner(room.shootout);
  broadcast(room, { t: "kick", index, by: shooter, kick, shootout: room.shootout, decisive: winner !== null });
  if (winner !== null) await finish(room, winner, "win");
  else broadcastState(room);
}

function onChoice(room: Room, client: Client, choice: Choice) {
  const s = room.shootout;
  if (room.status !== "playing" || !s || client.seat === null) return;
  if (room.phase !== "choose") return send(client.ws, { t: "error", message: "Wait for the next kick" });
  if (room.pending[client.seat]) return send(client.ws, { t: "error", message: "Already chosen" });
  const shooting = shooterOf(s) === client.seat;
  if (shooting !== (choice.kind === "shot")) return send(client.ws, { t: "error", message: "Not your turn" });
  room.pending[client.seat] = choice;
  room.timeouts[client.seat] = 0;
  if (room.pending[0] && room.pending[1]) void resolve(room).catch((e) => console.error("[football] resolve", e));
  else broadcastState(room);
}

async function tick() {
  const now = Date.now();
  for (const room of rooms.values()) {
    try {
      if (room.status === "waiting" && now - room.createdAt > WAITING_MS) { await cancel(room, "expired"); continue; }
      if (room.status !== "playing" || !room.shootout) continue;
      const on = online(room);
      for (const s of [0, 1] as Side[]) if (on[s]) room.lastSeen[s] = now;
      const gone = ([0, 1] as Side[]).filter((s) => now - room.lastSeen[s] > GONE_MS);
      if (gone.length === 2) { await cancel(room, "abandoned"); continue; }
      if (gone.length === 1) { await finish(room, (1 - gone[0]) as Side, "left"); continue; }
      if (now <= room.deadline) continue;
      if (room.phase === "reveal") { startKick(room); broadcastState(room); continue; }
      // Out of time: whoever hasn't chosen gets a random choice
      const shooter = shooterOf(room.shootout);
      for (const s of [0, 1] as Side[]) {
        if (room.pending[s]) continue;
        room.timeouts[s]++;
        room.pending[s] = s === shooter ? { kind: "shot", shot: randomShot(cryptoRand) } : { kind: "dive", zone: randomInt(6) as Zone };
      }
      const afk = ([0, 1] as Side[]).filter((s) => room.timeouts[s] >= MAX_TIMEOUTS);
      if (afk.length === 2) { await cancel(room, "abandoned"); continue; } // nobody is playing: refund both
      if (afk.length === 1) { await finish(room, (1 - afk[0]) as Side, "timeouts"); continue; }
      await resolve(room);
    } catch (e) {
      console.error("[football] tick", e);
    }
  }
}

function startMatch(room: Room) {
  room.status = "playing";
  room.shootout = newShootout(randomInt(2) as Side);
  room.log = [];
  room.lastSeen = [Date.now(), Date.now()];
  room.timeouts = [0, 0];
  room.rematch = [false, false];
  startKick(room, FIRST_KICK_GRACE_MS);
}

/** Both players asked for another go: a new table with the same stake, both stakes held again */
async function rematch(room: Room) {
  if (room.rematchBusy || room.status !== "finished" || !room.players[1]) return;
  room.rematchBusy = true;
  try {
    const [p0, p1] = [room.players[0], room.players[1]!];
    if (activeByUser.has(p0) || activeByUser.has(p1)) throw new Error("Finish your own table first");
    let code = newCode();
    while (rooms.has(code)) code = newCode();
    // The other player hosts this time
    const created = await db.transaction(async (tx) => {
      if (room.stake > 0) {
        for (const id of [p0, p1]) {
          const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${room.stake}` })
            .where(and(eq(users.id, id), sql`${users.balance} >= ${room.stake}`)).returning({ id: users.id });
          if (!paid) throw new Error("Insufficient balance");
        }
      }
      const [m] = await tx.insert(footballMatches).values({ code, player1: p1, player2: p0, stake: room.stake, status: "playing" }).returning();
      return m;
    });
    const next: Room = {
      id: created.id, code, stake: room.stake, players: [p1, p0], names: [room.names[1] ?? "", room.names[0]],
      kits: [room.kits[1], room.kits[0]], avatars: [room.avatars[1], room.avatars[0]], status: "playing",
      shootout: null, phase: "choose", pending: [null, null], log: [], deadline: 0, createdAt: Date.now(),
      lastSeen: [Date.now(), Date.now()], timeouts: [0, 0], clients: new Set(), rematch: [false, false],
    };
    startMatch(next);
    rooms.set(code, next);
    activeByUser.set(p0, code);
    activeByUser.set(p1, code);
    broadcast(room, { t: "rematch", code });
  } catch (e) {
    const message = (e as Error).message === "Finish your own table first" ? "Finish your own table first" : "Insufficient balance";
    room.rematch = [false, false];
    broadcast(room, { t: "error", message });
    broadcastState(room);
  } finally {
    room.rematchBusy = false;
  }
}

/** Tests only: forget every table, as a restart would */
export function dropAllFootballRoomsForTest() {
  rooms.clear();
  activeByUser.clear();
  practices.clear();
}
/** Tests only: make the current choice's clock run out now */
export function expireFootballClockForTest(code: string) {
  const room = rooms.get(code);
  if (room) room.deadline = Date.now() - 1;
}

/** The football table a player has open, and whether its second seat is free (for "join your friend") */
export function footballRoomOf(userId: string): { code: string; open: boolean } | null {
  const code = activeByUser.get(userId);
  const room = code ? rooms.get(code) : undefined;
  if (!room) return null;
  return { code: room.code, open: room.status === "waiting" && !room.players[1] && room.players[0] === userId };
}

// ---------------- Practice against the computer (never pays, except a small daily first win) ----------------

interface Practice { level: Level; kit: string; shootout: Shootout; log: KickResult[]; busy: boolean; at: number; bonus: number }
const practices = new Map<string, Practice>();

function practiceView(p: Practice) {
  return { level: p.level, kit: p.kit, shootout: p.shootout, winner: shootoutWinner(p.shootout), bonus: p.bonus };
}

// ---------------- Weekly Penalty King ladder ----------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function ladderRows(week: string, q: Pick<typeof db, "execute"> | Tx = db) {
  return (await q.execute(sql`
    select r.user_id, u.username, u.profile_image_url, r.rating, r.played, r.won,
      rank() over (order by r.rating desc, r.won desc, r.played asc, u.username asc)::int as rank
    from football_ratings r join users u on u.id = r.user_id
    where r.week = ${week} and r.played > 0 and u.banned = false
    order by rank
  `)).rows as { user_id: string; username: string; profile_image_url: string | null; rating: number; played: number; won: number; rank: number }[];
}

/** Pays a finished week once: fixed prizes for the top 3 who played enough */
export async function settleFootballWeek(week: string) {
  return db.transaction(async (tx) => {
    const rows = (await ladderRows(week, tx)).filter((r) => r.played >= LADDER_MIN_GAMES).slice(0, LADDER_PRIZES.length);
    const summary = rows.map((r, i) => ({ username: r.username, rating: r.rating, prize: LADDER_PRIZES[i] }));
    const [row] = await tx.insert(footballWeeks).values({ week, summary }).onConflictDoNothing().returning();
    if (!row) return null; // already paid
    for (const [i, r] of rows.entries()) {
      await tx.update(users).set({ balance: sql`${users.balance} + ${LADDER_PRIZES[i]}` }).where(eq(users.id, r.user_id));
      await tx.insert(deposits).values({ userId: r.user_id, amount: LADDER_PRIZES[i], method: "football_weekly" });
    }
    if (rows.length) {
      const medals = ["🥇", "🥈", "🥉"];
      const fmt = (n: number) => n.toLocaleString("vi-VN");
      await tx.insert(chatMessages).values({
        userId: "system", username: "⚽ VnSlot 888",
        text: `⚽ Vua Phạt Đền tuần ${week}: ${rows.map((r, i) => `${medals[i]} ${r.username} (${r.rating}, +${fmt(LADDER_PRIZES[i])} xu)`).join(" · ")}. Tuần mới bắt đầu!`,
      });
    }
    return { paid: rows.length, summary };
  });
}

/** Settles last week if it hasn't been yet (runs on a timer; safe to run any number of times) */
export async function footballTick(now = new Date()) {
  const last = previousWeek(weekOf(now));
  const [done] = await db.select({ w: footballWeeks.week }).from(footballWeeks).where(eq(footballWeeks.week, last));
  if (!done) await settleFootballWeek(last);
}

export function startFootballScheduler(httpServer?: { on(event: "close", fn: () => void): unknown }) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await footballTick(); } catch (e) { console.error("[football]", e); } finally { running = false; }
  };
  void run();
  const timer = setInterval(run, 5 * 60_000);
  timer.unref?.();
  // Stopped together with the table clock (one "close" listener for the whole game)
  if (httpServer) timers.push(timer);
}
const timers: ReturnType<typeof setInterval>[] = [];

// ---------------- HTTP ----------------

export function registerFootballRoutes(app: Express, requireUser: RequestHandler) {
  const me = (res: Response) => res.locals.user as User;

  app.get("/api/football/tables", requireUser, (_req, res) => {
    const uid = me(res).id;
    const open: FootballTable[] = [...rooms.values()]
      .filter((r) => r.status === "waiting" && r.players[0] !== uid)
      .map((r) => ({ code: r.code, stake: r.stake, host: r.names[0], hostKit: r.kits[0], status: "waiting" as const }));
    const live: FootballTable[] = [...rooms.values()]
      .filter((r) => r.status === "playing")
      .map((r) => ({ code: r.code, stake: r.stake, host: r.names[0], hostKit: r.kits[0], guest: r.names[1] ?? undefined, guestKit: r.kits[1], status: "playing" as const }));
    res.json({ open, live, mine: activeByUser.get(uid) ?? null, stakes: FOOTBALL_STAKES });
  });

  app.post("/api/football/tables", requireUser, async (req: Request, res: Response) => {
    const stake = Number(req.body?.stake);
    if (!FOOTBALL_STAKES.includes(stake)) return res.status(400).json({ message: "Invalid stake" });
    const u = me(res);
    if (activeByUser.has(u.id)) return res.status(409).json({ message: "You already have a table", code: activeByUser.get(u.id) });
    let code = newCode();
    while (rooms.has(code)) code = newCode();
    activeByUser.set(u.id, code); // claimed before the await, so two creates can't both go through
    const created = await db.transaction(async (tx) => {
      if (stake > 0) {
        const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${stake}` })
          .where(and(eq(users.id, u.id), sql`${users.balance} >= ${stake}`)).returning({ id: users.id });
        if (!paid) return null;
      }
      const [m] = await tx.insert(footballMatches).values({ code, player1: u.id, stake, status: "waiting" }).returning();
      return m;
    }).catch(() => null);
    if (!created) {
      activeByUser.delete(u.id);
      return res.status(400).json({ message: "Insufficient balance", code: "insufficient_balance" });
    }
    const room: Room = {
      id: created.id, code, stake, players: [u.id, null], names: [u.username, null], kits: [validKit(req.body?.kit), "th"],
      avatars: [u.profileImageUrl ?? null, null], status: "waiting", shootout: null, phase: "choose", pending: [null, null], log: [],
      deadline: 0, createdAt: Date.now(), lastSeen: [Date.now(), Date.now()], timeouts: [0, 0], clients: new Set(), rematch: [false, false],
    };
    rooms.set(code, room);
    res.json({ code });
  });

  app.post("/api/football/tables/:code/join", requireUser, async (req: Request, res: Response) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const u = me(res);
    if (!room) return res.status(404).json({ message: "Table not found" });
    if (room.players[0] === u.id || room.players[1] === u.id) return res.json({ code: room.code });
    if (room.status !== "waiting") return res.status(409).json({ message: "Someone already took that seat" });
    if (activeByUser.has(u.id)) return res.status(409).json({ message: "Finish your own table first", code: activeByUser.get(u.id) });
    room.status = "playing"; // claim the seat before the await, so two joins can't both win it
    room.players[1] = u.id;
    activeByUser.set(u.id, room.code);
    const ok = await db.transaction(async (tx) => {
      if (room.stake > 0) {
        const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${room.stake}` })
          .where(and(eq(users.id, u.id), sql`${users.balance} >= ${room.stake}`)).returning({ id: users.id });
        if (!paid) return false;
      }
      const [m] = await tx.update(footballMatches).set({ player2: u.id, status: "playing" })
        .where(and(eq(footballMatches.id, room.id), eq(footballMatches.status, "waiting"))).returning({ id: footballMatches.id });
      if (!m) throw new Error("Table is gone");
      return true;
    }).catch(() => false);
    if (!ok) {
      if (rooms.get(room.code) === room && room.players[1] === u.id) { room.status = "waiting"; room.players[1] = null; }
      activeByUser.delete(u.id);
      return res.status(400).json({ message: "Insufficient balance", code: "insufficient_balance" });
    }
    room.names[1] = u.username;
    room.avatars[1] = u.profileImageUrl ?? null;
    let kit = validKit(req.body?.kit);
    if (kit === room.kits[0]) kit = kit === "vn" ? "th" : "vn"; // two teams in the same shirt would be confusing
    room.kits[1] = kit;
    startMatch(room);
    broadcastState(room);
    res.json({ code: room.code });
  });

  app.post("/api/football/tables/:code/cancel", requireUser, async (req: Request, res: Response) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    if (!room || room.players[0] !== me(res).id) return res.status(404).json({ message: "Table not found" });
    if (room.status !== "waiting") return res.status(409).json({ message: "The game has started" });
    await cancel(room, "cancelled");
    res.json({ ok: true });
  });

  // ----- Practice -----

  app.get("/api/football/practice", requireUser, (_req, res) => {
    const p = practices.get(me(res).id);
    res.json({ practice: p ? practiceView(p) : null });
  });

  app.post("/api/football/practice", requireUser, (req: Request, res: Response) => {
    const level = LEVELS.includes(req.body?.level) ? (req.body.level as Level) : "medium";
    const p: Practice = { level, kit: validKit(req.body?.kit), shootout: newShootout(randomInt(2) as Side), log: [], busy: false, at: Date.now(), bonus: 0 };
    practices.set(me(res).id, p);
    if (practices.size > 5000) { // forget the oldest abandoned games
      const old = [...practices.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 1000);
      for (const [k] of old) practices.delete(k);
    }
    res.json({ practice: practiceView(p) });
  });

  // The player is side 0, the computer side 1. The player sends their own choice; the
  // computer's is drawn here at the same moment, so neither can react to the other.
  app.post("/api/football/practice/kick", requireUser, async (req: Request, res: Response) => {
    const u = me(res);
    const p = practices.get(u.id);
    if (!p) return res.status(404).json({ message: "Start a new game" });
    if (shootoutWinner(p.shootout) !== null) return res.status(409).json({ message: "This game is over" });
    if (p.busy) return res.status(429).json({ message: "Just a moment" });
    p.busy = true;
    try {
      p.at = Date.now();
      const playerShoots = shooterOf(p.shootout) === 0;
      let kick: KickResult;
      if (playerShoots) {
        if (!req.body?.shot || typeof req.body.shot !== "object") return res.status(400).json({ message: "Invalid input" });
        const theirShots = p.log.filter((k) => k.shot && shooterOfLog(p, k) === 0 && k.zone !== null).map((k) => k.zone as Zone);
        const dive = aiDive(p.level, cryptoRand, theirShots);
        kick = resolveKick(cleanShot(req.body.shot), dive, newSeed(), AI_REACH[p.level]);
      } else {
        const zone = isZone(req.body?.dive) ? req.body.dive : (randomInt(6) as Zone);
        const theirDives = p.log.filter((k) => shooterOfLog(p, k) === 1).map((k) => k.dive);
        kick = resolveKick(aiShot(p.level, cryptoRand, theirDives), zone, newSeed());
      }
      p.shootout = addKick(p.shootout, kick.scored, kick.outcome);
      p.log.push(kick);
      const winner = shootoutWinner(p.shootout);
      if (winner === 0 && p.level !== "easy") {
        const now = new Date();
        await db.transaction(async (tx) => {
          const [b] = await tx.update(users).set({ balance: sql`${users.balance} + ${FOOTBALL_DAILY_WIN}`, lastFootballBonusAt: now })
            .where(and(eq(users.id, u.id), or(isNull(users.lastFootballBonusAt), lt(users.lastFootballBonusAt, dayStartOf(now)))))
            .returning({ id: users.id });
          if (b) {
            p.bonus = FOOTBALL_DAILY_WIN;
            await tx.insert(deposits).values({ userId: u.id, amount: FOOTBALL_DAILY_WIN, method: "football_daily_win" });
          }
        });
      }
      res.json({ kick, by: playerShoots ? 0 : 1, practice: practiceView(p), decisive: winner !== null });
    } finally {
      p.busy = false;
    }
  });

  // ----- Ladder -----

  app.get("/api/football/ladder", requireUser, async (_req, res) => {
    const u = me(res);
    const now = new Date();
    const week = weekOf(now);
    const rows = await ladderRows(week);
    const view = (r: (typeof rows)[number]): LadderRow => ({ rank: r.rank, username: r.username, avatarUrl: r.profile_image_url ?? null, rating: r.rating, played: r.played, won: r.won });
    const mine = rows.find((r) => r.user_id === u.id);
    const [last] = await db.select().from(footballWeeks).where(eq(footballWeeks.week, previousWeek(week)));
    const out: LadderView = {
      week,
      endsAt: weekEnd(week).toISOString(),
      prizes: LADDER_PRIZES,
      minGames: LADDER_MIN_GAMES,
      table: rows.slice(0, 10).map(view),
      me: mine ? view(mine) : null,
      last: last ? { week: last.week, winners: last.summary.map((w) => ({ username: w.username, prize: w.prize, rating: w.rating })) } : null,
      serverNow: now.toISOString(),
    };
    res.json({ ...out, todayBonusTaken: !!u.lastFootballBonusAt && vnDay(u.lastFootballBonusAt) === vnDay(now), dailyWin: FOOTBALL_DAILY_WIN });
  });
}

/** Which side took a logged practice kick (its position in the log) */
function shooterOfLog(p: Practice, k: KickResult): Side {
  return shooterOf(p.shootout, p.log.indexOf(k));
}

// ---------------- WebSocket: the table ----------------

export function attachFootballSockets(httpServer: Server, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const timer = setInterval(() => { void tick(); }, 500);
  timer.unref?.();
  timers.push(timer);
  httpServer.on("close", () => { for (const t of timers.splice(0)) clearInterval(t); });

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/ws/football") return;
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
    const client: Client = { ws, userId, seat: seatOf(room, userId), lastEmote: 0 };
    room.clients.add(client);
    if (client.seat !== null) room.lastSeen[client.seat] = Date.now();
    broadcastState(room);

    ws.on("message", (raw) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!msg || typeof msg !== "object") return;
      const now = Date.now();
      if (msg.t === "shoot" && msg.shot && typeof msg.shot === "object") {
        onChoice(room, client, { kind: "shot", shot: cleanShot(msg.shot) });
      } else if (msg.t === "dive" && isZone(msg.zone)) {
        onChoice(room, client, { kind: "dive", zone: msg.zone });
      } else if (msg.t === "emote" && FOOTBALL_EMOTES.includes(msg.e) && now - client.lastEmote > 1200) {
        client.lastEmote = now;
        broadcast(room, { t: "emote", from: client.seat, e: msg.e });
      } else if (msg.t === "resign" && client.seat !== null && room.status === "playing") {
        void finish(room, (1 - client.seat) as Side, "resign").catch((e) => console.error("[football] resign", e));
      } else if (msg.t === "rematch" && client.seat !== null && room.status === "finished" && room.result) {
        room.rematch[client.seat] = true;
        if (room.rematch[0] && room.rematch[1]) void rematch(room);
        else broadcastState(room);
      }
    });
    ws.on("close", () => {
      room.clients.delete(client);
      if (client.seat !== null) room.lastSeen[client.seat] = Date.now();
      if (rooms.get(room.code) === room) broadcastState(room);
    });
  }
}
