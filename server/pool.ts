import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { randomInt } from "crypto";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import { logPlay } from "./storage";
import { poolMatches, users, deposits } from "@shared/schema";
import { MIN_SHOTS, MAX_PER_PAIR_PER_DAY, DAILY_WIN_BONUS, seasonOf, vnDay } from "@shared/league";
import { newGame, playShot, cleanShot, type GameState, type Shot, type Side } from "@shared/pool/engine";
import { POOL_STAKES, POOL_EMOTES, POOL_TURN_MS, TOURNAMENT_GRACE_MS, type PoolServerMsg, type PoolTable } from "@shared/pool/protocol";

/**
 * Online pool. Tables (and their stakes) live in the database; the game in progress lives
 * here in memory, with this server as the referee: players send shots, the server plays
 * them with the shared engine and tells everyone at the table what happened.
 */

const GONE_MS = 90_000; // a seated player away this long forfeits
const WAITING_MS = 30 * 60_000; // an open table with nobody joining is closed and refunded
const MAX_TIMEOUTS = 3; // running out of time this many turns in a row forfeits

interface Client { ws: WebSocket; userId: string; seat: Side | null; lastAim: number; lastEmote: number }

interface Room {
  id: number;
  code: string;
  stake: number;
  players: [string, string | null];
  names: [string, string | null];
  status: "waiting" | "playing" | "finished";
  game: GameState | null;
  deadline: number;
  createdAt: number;
  lastSeen: [number, number];
  timeouts: [number, number];
  clients: Set<Client>;
  result?: { winner: Side; reason: string; payout: number; league?: { counted: boolean; bonus: number } };
  /** A tournament match: both players are seated from the start and get a few minutes to arrive */
  tournament?: { id: number; matchId: number; name: string; round: number; rounds: number; graceUntil: number; seen: [boolean, boolean] };
}

type TournamentHook = (matchId: number, winnerId: string, reason: string) => Promise<void>;
let tournamentHook: TournamentHook | null = null;
/** The tournament module hears about every tournament match result through this */
export function setTournamentHook(fn: TournamentHook) { tournamentHook = fn; }

/** True until both players of a tournament match have turned up */
const waitingForPlayers = (room: Room) => !!room.tournament && !(room.tournament.seen[0] && room.tournament.seen[1]);

const rooms = new Map<string, Room>();
const activeByUser = new Map<string, string>(); // userId -> table code

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
const cryptoRng = (m: number) => randomInt(m);

function seatOf(room: Room, userId: string): Side | null {
  return room.players[0] === userId ? 0 : room.players[1] === userId ? 1 : null;
}

function send(ws: WebSocket, msg: PoolServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function online(room: Room): [boolean, boolean] {
  const on: [boolean, boolean] = [false, false];
  for (const c of room.clients) if (c.seat !== null) on[c.seat] = true;
  return on;
}

function stateMsg(room: Room, seat: Side | null): PoolServerMsg {
  return {
    t: "state",
    code: room.code,
    stake: room.stake,
    seat,
    names: room.names,
    status: room.status,
    game: room.game,
    turnMsLeft: room.status === "playing" ? Math.max(0, room.deadline - Date.now()) : null,
    online: online(room),
    spectators: [...room.clients].filter((c) => c.seat === null).length,
    result: room.result ?? null,
    tournament: room.tournament ? { id: room.tournament.id, name: room.tournament.name, round: room.tournament.round, rounds: room.tournament.rounds } : null,
    ready: !waitingForPlayers(room),
  };
}

function broadcastState(room: Room) {
  for (const c of room.clients) send(c.ws, stateMsg(room, c.seat));
}

function broadcast(room: Room, msg: PoolServerMsg, except?: Client) {
  for (const c of room.clients) if (c !== except) send(c.ws, msg);
}

// ---------------- Money ----------------

/** Settles a finished game: pays the winner both stakes and records stats */
async function finish(room: Room, winner: Side, reason: string) {
  if (room.status === "finished") return;
  room.status = "finished";
  const payout = room.stake * 2;
  const winnerId = room.players[winner]!;
  const loserId = room.players[(1 - winner) as Side]!;
  const now = new Date();
  const shots = room.game?.shots ?? 0;
  // Vietnam midnight today, in UTC
  const dayStart = new Date(new Date(`${vnDay(now)}T00:00:00Z`).getTime() - 7 * 3600_000);
  let counted = false;
  let bonus = 0;
  await db.transaction(async (tx) => {
    // League: a real game (both there, long enough), and not too many today between the same two
    let counts = reason !== "no_show" && shots >= MIN_SHOTS;
    if (counts) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(poolMatches).where(and(
        eq(poolMatches.counted, true), gte(poolMatches.finishedAt, dayStart),
        or(and(eq(poolMatches.player1, winnerId), eq(poolMatches.player2, loserId)), and(eq(poolMatches.player1, loserId), eq(poolMatches.player2, winnerId))),
      ));
      counts = n < MAX_PER_PAIR_PER_DAY;
    }
    const [m] = await tx.update(poolMatches)
      .set({ status: "finished", winner: winnerId, reason, finishedAt: now, shots, season: seasonOf(now), counted: counts })
      .where(and(eq(poolMatches.id, room.id), eq(poolMatches.status, "playing")))
      .returning({ id: poolMatches.id });
    if (!m) return; // already settled
    counted = counts;
    await tx.update(users).set({
      balance: sql`${users.balance} + ${payout}`,
      gamesPlayed: sql`${users.gamesPlayed} + 1`,
      totalWins: sql`${users.totalWins} + 1`,
      maxWin: sql`greatest(${users.maxWin}, ${payout})`,
    }).where(eq(users.id, winnerId));
    await tx.update(users).set({ gamesPlayed: sql`${users.gamesPlayed} + 1` }).where(eq(users.id, loserId));
    await logPlay(tx, winnerId, "pool", room.stake, payout);
    await logPlay(tx, loserId, "pool", room.stake, 0);
    // The first counted win of the day earns a bonus
    if (counted) {
      const [b] = await tx.update(users).set({ balance: sql`${users.balance} + ${DAILY_WIN_BONUS}`, lastPoolBonusAt: now })
        .where(and(eq(users.id, winnerId), or(isNull(users.lastPoolBonusAt), lt(users.lastPoolBonusAt, dayStart))))
        .returning({ id: users.id });
      if (b) {
        bonus = DAILY_WIN_BONUS;
        await tx.insert(deposits).values({ userId: winnerId, amount: DAILY_WIN_BONUS, method: "pool_daily_win" });
      }
    }
  });
  room.result = { winner, reason, payout, league: { counted, bonus } };
  for (const id of room.players) if (id && activeByUser.get(id) === room.code) activeByUser.delete(id);
  broadcastState(room);
  if (room.tournament && tournamentHook) {
    await tournamentHook(room.tournament.matchId, winnerId, reason).catch((e) => console.error("[pool] tournament result", e));
  }
  setTimeout(() => { if (rooms.get(room.code) === room) rooms.delete(room.code); }, 10 * 60_000).unref?.();
}

/** Closes a table nobody joined, refunding its creator */
async function cancel(room: Room, reason: string) {
  await db.transaction(async (tx) => {
    const [m] = await tx.update(poolMatches).set({ status: "cancelled", reason, finishedAt: new Date() })
      .where(and(eq(poolMatches.id, room.id), eq(poolMatches.status, "waiting"))).returning({ id: poolMatches.id });
    if (m && room.stake > 0) await tx.update(users).set({ balance: sql`${users.balance} + ${room.stake}` }).where(eq(users.id, room.players[0]));
  });
  rooms.delete(room.code);
  activeByUser.delete(room.players[0]);
  for (const c of room.clients) { send(c.ws, { t: "closed", reason }); c.ws.close(); }
}

/** After a restart the games in memory are gone: give every stake back */
export async function recoverPoolMatches() {
  const open = await db.select().from(poolMatches).where(inArray(poolMatches.status, ["waiting", "playing"]));
  for (const m of open) {
    await db.transaction(async (tx) => {
      const [done] = await tx.update(poolMatches).set({ status: "cancelled", reason: "server_restart", finishedAt: new Date() })
        .where(and(eq(poolMatches.id, m.id), inArray(poolMatches.status, ["waiting", "playing"]))).returning({ id: poolMatches.id });
      if (!done || m.stake <= 0) return;
      await tx.update(users).set({ balance: sql`${users.balance} + ${m.stake}` }).where(eq(users.id, m.player1));
      if (m.player2) await tx.update(users).set({ balance: sql`${users.balance} + ${m.stake}` }).where(eq(users.id, m.player2));
    });
  }
  if (open.length) console.log(`[startup] pool: refunded ${open.length} unfinished table(s)`);
}

// ---------------- Game flow ----------------

function startTurnClock(room: Room) {
  room.deadline = Date.now() + POOL_TURN_MS;
}

async function onShot(room: Room, client: Client, shot: Shot, cue?: { x: number; y: number }) {
  const g = room.game;
  if (room.status !== "playing" || !g || client.seat === null) return;
  if (g.turn !== client.seat) return send(client.ws, { t: "error", message: "Not your turn" });
  if (waitingForPlayers(room)) return send(client.ws, { t: "error", message: "Waiting for your opponent" });
  let result;
  try {
    result = playShot(g, cleanShot(shot), g.ballInHand ? cue : undefined, false);
  } catch (e) {
    return send(client.ws, { t: "error", message: (e as Error).message });
  }
  room.timeouts[client.seat] = 0;
  const startBalls = g.ballInHand && cue ? g.balls.map((b) => (b.n === 0 ? { ...b, x: cue.x, y: cue.y, potted: false } : b)) : g.balls;
  room.game = result.state;
  startTurnClock(room);
  broadcast(room, { t: "shot", by: client.seat, start: startBalls, shot: cleanShot(shot), state: result.state });
  if (result.state.winner !== null) await finish(room, result.state.winner, "win");
  else broadcastState(room); // the new turn and its clock
}

async function tick() {
  const now = Date.now();
  for (const room of rooms.values()) {
    try {
      if (room.status === "waiting" && now - room.createdAt > WAITING_MS) { await cancel(room, "expired"); continue; }
      if (room.status !== "playing" || !room.game) continue;
      if (room.tournament && waitingForPlayers(room)) {
        if (now < room.tournament.graceUntil) continue;
        // Time's up: whoever turned up wins; if nobody did, a coin toss decides
        const [s0, s1] = room.tournament.seen;
        await finish(room, s0 ? 0 : s1 ? 1 : (randomInt(2) as Side), "no_show");
        continue;
      }
      const on = online(room);
      for (const s of [0, 1] as Side[]) {
        if (on[s]) room.lastSeen[s] = now;
        else if (now - room.lastSeen[s] > GONE_MS) { await finish(room, (1 - s) as Side, "left"); break; }
      }
      if (room.status !== "playing") continue;
      if (now > room.deadline) {
        // Out of time: the turn passes with ball in hand
        const s = room.game.turn;
        room.timeouts[s]++;
        if (room.timeouts[s] >= MAX_TIMEOUTS) { await finish(room, (1 - s) as Side, "timeouts"); continue; }
        room.game = { ...room.game, turn: (1 - s) as Side, ballInHand: true, last: { foul: "timeout", potted: [], switched: true } };
        startTurnClock(room);
        broadcastState(room);
      }
    } catch (e) {
      console.error("[pool] tick", e);
    }
  }
}

// ---------------- Tournament matches ----------------

/** Tests shorten the wait for no-shows */
const graceMs = () => Number(process.env.TOURNAMENT_GRACE_MS) || TOURNAMENT_GRACE_MS;

/** Opens a table for a tournament match with both players already seated. Returns its code. */
export async function createTournamentRoom(t: {
  tournamentId: number; matchId: number; name: string; round: number; rounds: number;
  players: [string, string]; names: [string, string];
}): Promise<string> {
  let code = newCode();
  while (rooms.has(code)) code = newCode();
  const [m] = await db.insert(poolMatches).values({ code, player1: t.players[0], player2: t.players[1], stake: 0, status: "playing" }).returning();
  const now = Date.now();
  const room: Room = {
    id: m.id, code, stake: 0, players: [t.players[0], t.players[1]], names: [t.names[0], t.names[1]], status: "playing",
    game: newGame(cryptoRng, randomInt(2) as Side), deadline: now + graceMs(), createdAt: now,
    lastSeen: [now, now], timeouts: [0, 0], clients: new Set(),
    tournament: { id: t.tournamentId, matchId: t.matchId, name: t.name, round: t.round, rounds: t.rounds, graceUntil: now + graceMs(), seen: [false, false] },
  };
  rooms.set(code, room);
  for (const id of t.players) activeByUser.set(id, code);
  return code;
}

/** Tests only: forget every table, as a restart would */
export function dropAllRoomsForTest() {
  rooms.clear();
  activeByUser.clear();
}

/** Whether this server holds the table (false after a restart wiped it) */
export function roomExists(code: string | null | undefined) {
  return !!code && rooms.has(code);
}

// ---------------- HTTP: the lobby ----------------

export function registerPoolRoutes(app: Express, requireUser: RequestHandler) {
  const name = (res: Response) => (res.locals.user as { username: string }).username;
  const uid = (res: Response) => (res.locals.user as { id: string }).id;

  app.get("/api/pool/tables", requireUser, (_req, res) => {
    const me = uid(res);
    const open: PoolTable[] = [...rooms.values()]
      .filter((r) => r.status === "waiting" && r.players[0] !== me)
      .map((r) => ({ code: r.code, stake: r.stake, host: r.names[0], status: "waiting" as const }));
    const live: PoolTable[] = [...rooms.values()]
      .filter((r) => r.status === "playing")
      .map((r) => ({ code: r.code, stake: r.stake, host: r.names[0], guest: r.names[1] ?? undefined, status: "playing" as const, ...(r.tournament ? { tournament: r.tournament.name } : {}) }));
    res.json({ open, live, mine: activeByUser.get(me) ?? null, stakes: POOL_STAKES });
  });

  app.post("/api/pool/tables", requireUser, async (req: Request, res: Response) => {
    const stake = Number(req.body?.stake);
    if (!POOL_STAKES.includes(stake)) return res.status(400).json({ message: "Invalid stake" });
    const me = uid(res);
    if (activeByUser.has(me)) return res.status(409).json({ message: "You already have a table", code: activeByUser.get(me) });
    let code = newCode();
    while (rooms.has(code)) code = newCode();
    const created = await db.transaction(async (tx) => {
      if (stake > 0) {
        const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${stake}` })
          .where(and(eq(users.id, me), sql`${users.balance} >= ${stake}`)).returning({ id: users.id });
        if (!paid) return null;
      }
      const [m] = await tx.insert(poolMatches).values({ code, player1: me, stake, status: "waiting" }).returning();
      return m;
    });
    if (!created) return res.status(400).json({ message: "Insufficient balance", code: "insufficient_balance" });
    const room: Room = {
      id: created.id, code, stake, players: [me, null], names: [name(res), null], status: "waiting", game: null,
      deadline: 0, createdAt: Date.now(), lastSeen: [Date.now(), Date.now()], timeouts: [0, 0], clients: new Set(),
    };
    rooms.set(code, room);
    activeByUser.set(me, code);
    res.json({ code });
  });

  app.post("/api/pool/tables/:code/join", requireUser, async (req: Request, res: Response) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    const me = uid(res);
    if (!room) return res.status(404).json({ message: "Table not found" });
    if (room.players[0] === me) return res.json({ code: room.code });
    if (room.status !== "waiting") return res.status(409).json({ message: "Someone already took that seat" });
    if (activeByUser.has(me)) return res.status(409).json({ message: "Finish your own table first", code: activeByUser.get(me) });
    room.status = "playing"; // claim the seat before the await, so two joins can't both win it
    room.players[1] = me;
    const ok = await db.transaction(async (tx) => {
      if (room.stake > 0) {
        const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${room.stake}` })
          .where(and(eq(users.id, me), sql`${users.balance} >= ${room.stake}`)).returning({ id: users.id });
        if (!paid) return false;
      }
      const [m] = await tx.update(poolMatches).set({ player2: me, status: "playing" })
        .where(and(eq(poolMatches.id, room.id), eq(poolMatches.status, "waiting"))).returning({ id: poolMatches.id });
      if (!m) throw new Error("Table is gone");
      return true;
    }).catch(() => false);
    if (!ok) {
      room.status = "waiting";
      room.players[1] = null;
      return res.status(400).json({ message: "Insufficient balance", code: "insufficient_balance" });
    }
    room.names[1] = name(res);
    room.game = newGame(cryptoRng, randomInt(2) as Side);
    room.lastSeen = [Date.now(), Date.now()];
    startTurnClock(room);
    activeByUser.set(me, room.code);
    broadcastState(room);
    res.json({ code: room.code });
  });

  app.post("/api/pool/tables/:code/cancel", requireUser, async (req: Request, res: Response) => {
    const room = rooms.get(String(req.params.code).toUpperCase());
    if (!room || room.players[0] !== uid(res)) return res.status(404).json({ message: "Table not found" });
    if (room.status !== "waiting") return res.status(409).json({ message: "The game has started" });
    await cancel(room, "cancelled");
    res.json({ ok: true });
  });
}

// ---------------- WebSocket: the table ----------------

export function attachPoolSockets(httpServer: Server, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const timer = setInterval(() => { void tick(); }, 1000);
  timer.unref?.();

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/ws/pool") return; // other upgrades (Vite's dev reload) aren't ours
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
    const client: Client = { ws, userId, seat: seatOf(room, userId), lastAim: 0, lastEmote: 0 };
    room.clients.add(client);
    if (client.seat !== null) room.lastSeen[client.seat] = Date.now();
    if (client.seat !== null && room.tournament && waitingForPlayers(room)) {
      room.tournament.seen[client.seat] = true;
      // Both here: the clock starts now
      if (!waitingForPlayers(room)) { room.lastSeen = [Date.now(), Date.now()]; startTurnClock(room); }
    }
    broadcastState(room);

    ws.on("message", (raw) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!msg || typeof msg !== "object") return;
      const now = Date.now();
      if (msg.t === "shoot" && msg.shot && typeof msg.shot === "object") {
        const s = msg.shot;
        const cue = msg.cue && typeof msg.cue === "object" ? { x: Number(msg.cue.x), y: Number(msg.cue.y) } : undefined;
        void onShot(room, client, { dx: Number(s.dx), dy: Number(s.dy), power: Number(s.power), spin: Number(s.spin ?? 0) }, cue);
      } else if (msg.t === "aim" && client.seat !== null && room.game?.turn === client.seat && now - client.lastAim > 60) {
        client.lastAim = now;
        const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 1000) / 1000 : 0);
        broadcast(room, { t: "aim", dx: n(msg.dx), dy: n(msg.dy), power: n(msg.power), cue: msg.cue ? { x: n(msg.cue.x), y: n(msg.cue.y) } : null }, client);
      } else if (msg.t === "emote" && POOL_EMOTES.includes(msg.e) && now - client.lastEmote > 1200) {
        client.lastEmote = now;
        broadcast(room, { t: "emote", from: client.seat, e: msg.e });
      } else if (msg.t === "resign" && client.seat !== null && room.status === "playing") {
        void finish(room, (1 - client.seat) as Side, "resign");
      }
    });
    ws.on("close", () => {
      room.clients.delete(client);
      if (client.seat !== null) room.lastSeen[client.seat] = Date.now();
      if (rooms.get(room.code) === room) broadcastState(room);
    });
  }
}
