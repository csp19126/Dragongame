/**
 * Live card tables (Bàn Chung blackjack against the dealer, and Xì Dách with a player banker).
 * Tables live in memory and talk over a WebSocket; money is only touched in transactions:
 * what each player could lose is held aside (table_escrows) when a round starts, and the
 * round settles everyone at once. A restart refunds anything still held.
 */
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { randomInt } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { users, tableEscrows } from "@shared/schema";
import {
  TABLE_STAKES, TABLE_SEATS, TURN_MS, BETWEEN_ROUNDS_MS, PLAYER_STAND_MIN, BANKER_STAND_MIN, HOUSE_HOLD, BANKER_HOLD,
  handTotal, isBlackjack, xiKind, xiDachResult, houseReturn,
  type Card, type TableMode, type TableView, type SeatView, type SeatStatus, type TableSummary,
} from "@shared/cardtable";
import { logPlay } from "./storage";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const GONE_MS = 60_000; // a seat whose player has been away this long is freed between rounds
const EMPTY_MS = 120_000; // an empty table is closed
const KIND_VI: Record<string, string> = { xiban: "Xì Bàn", xidach: "Xì Dách", nguLinh: "Ngũ Linh", quac: "Quắc", non: "Non" };

interface Seat { userId: string; name: string; lastSeen: number; leaving: boolean; bot?: boolean }

// A computer player sits in at a Xì Dách table when only one person is there, so nobody waits.
// It banks to 18 and plays to 16: with those, simulations show a person playing its best only
// about breaks even against it over the banker rotation, so it isn't a free coin machine.
const BOT_NAMES = ["Bà Tư", "Chú Sáu", "Anh Ba"];
const BOT_BANKER_STOP = 18;
const BOT_PLAYER_STOP = 16;
const BOT_THINK_MS = 1200;
const isBot = (s: Seat | null | undefined) => !!s?.bot;
interface Hand { cards: Card[]; status: SeatStatus; doubled: boolean; hold: number; net: number | null; label: string | null }
interface Client { ws: WebSocket; userId: string; lastEmote: number }
interface Table {
  code: string; mode: TableMode; stake: number; host: string;
  seats: (Seat | null)[];
  clients: Set<Client>;
  phase: "waiting" | "playing" | "dealer" | "settled";
  round: number;
  hands: Map<number, Hand>;
  banker: number | null;
  nextBanker: number;
  dealer: Card[];
  shoe: Card[];
  turn: number | null;
  deadline: number | null;
  nextRoundAt: number | null;
  message: string | null;
  emptySince: number | null;
  busy: boolean;
}

const tables = new Map<string, Table>();
const seatedAt = new Map<string, string>(); // userId -> table code
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

function newShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of ["S", "H", "D", "C"]) for (const r of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) shoe.push(r + s);
  for (let i = shoe.length - 1; i > 0; i--) { const j = randomInt(i + 1); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
  return shoe;
}
const draw = (t: Table) => { const c = t.shoe.pop(); if (!c) throw new Error("Out of cards"); return c; };

// ---------------- What each person sees ----------------

function view(t: Table, userId: string | null): TableView {
  const you = t.seats.findIndex((s) => s?.userId === userId);
  const reveal = t.phase === "settled";
  const online = new Set([...t.clients].map((c) => c.userId));
  const seats = t.seats.map((s, i): SeatView | null => {
    if (!s) return null;
    const h = t.hands.get(i);
    const mine = i === you;
    const open = !!h && (mine || reveal || t.mode === "house");
    return {
      seat: i, username: s.name, you: mine, online: !!s.bot || online.has(s.userId), bot: !!s.bot,
      playing: !!h, banker: t.banker === i,
      cards: open ? h!.cards : null, count: h?.cards.length ?? 0, total: open ? handTotal(h!.cards) : null,
      status: h?.status ?? "out", doubled: h?.doubled ?? false,
      net: reveal ? h?.net ?? null : null, label: reveal ? h?.label ?? null : null,
    };
  });
  const dealerOpen = t.phase === "dealer" || t.phase === "settled";
  return {
    code: t.code, mode: t.mode, stake: t.stake, phase: t.phase, seats,
    dealer: t.mode === "house" && t.dealer.length ? { cards: t.dealer.map((c, i) => (i === 1 && !dealerOpen ? null : c)), total: dealerOpen ? handTotal(t.dealer) : null } : null,
    turn: t.turn, deadline: t.deadline, nextRoundAt: t.nextRoundAt,
    you: you >= 0 ? you : null, serverNow: Date.now(), message: t.message, round: t.round,
  };
}

function broadcast(t: Table) {
  for (const c of t.clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify({ t: "state", s: view(t, c.userId) }));
}
function sendAll(t: Table, msg: object) {
  for (const c of t.clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

// ---------------- Rounds ----------------

const occupied = (t: Table) => t.seats.map((s, i) => (s && !s.leaving ? i : -1)).filter((i) => i >= 0);

async function balanceOf(userId: string) {
  const [u] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
  return u?.balance ?? 0;
}

/** Holds each player's possible loss and deals. Returns false if the round can't start yet. */
async function startRound(t: Table): Promise<boolean> {
  // Only players who are actually at the table (connected) are dealt in, so nobody plays while away
  const here = new Set([...t.clients].map((c) => c.userId));
  const humans = occupied(t).filter((i) => !isBot(t.seats[i]) && here.has(t.seats[i]!.userId));
  if (t.mode === "banker") {
    const botSeat = t.seats.findIndex((x) => isBot(x));
    if (humans.length === 1 && botSeat < 0) {
      const free = t.seats.findIndex((x) => !x);
      if (free >= 0) t.seats[free] = { userId: `bot:${t.code}`, name: `${BOT_NAMES[t.round % BOT_NAMES.length]} 🤖`, lastSeen: Date.now(), leaving: false, bot: true };
    } else if (humans.length !== 1 && botSeat >= 0) t.seats[botSeat] = null; // people to play with (or nobody): the computer steps aside
  }
  const seated = occupied(t).filter((i) => isBot(t.seats[i]) || here.has(t.seats[i]!.userId));
  if (!humans.length || seated.length < (t.mode === "house" ? 1 : 2)) { t.message = t.mode === "banker" ? "need_players" : null; return false; }
  const bal = new Map<number, number>();
  for (const i of seated) bal.set(i, isBot(t.seats[i]) ? Number.MAX_SAFE_INTEGER : await balanceOf(t.seats[i]!.userId));
  let players: number[];
  let banker: number | null = null;
  const holds = new Map<number, number>();
  if (t.mode === "house") {
    players = seated.filter((i) => bal.get(i)! >= HOUSE_HOLD * t.stake);
    for (const i of players) holds.set(i, HOUSE_HOLD * t.stake);
  } else {
    // The banker's seat moves round; the banker must be able to cover everyone at the worst odds
    const order = [...seated.filter((i) => i >= t.nextBanker), ...seated.filter((i) => i < t.nextBanker)];
    players = [];
    for (const b of order) {
      const others = seated.filter((i) => i !== b && bal.get(i)! >= BANKER_HOLD * t.stake);
      if (others.length >= 1 && bal.get(b)! >= BANKER_HOLD * t.stake * others.length) { banker = b; players = others; break; }
    }
    if (banker === null) { t.message = "banker_coins"; return false; }
    for (const i of players) holds.set(i, BANKER_HOLD * t.stake);
    holds.set(banker, BANKER_HOLD * t.stake * players.length);
  }
  if (!players.length) { t.message = "no_coins"; return false; }
  const ok = await db.transaction(async (tx) => {
    for (const [i, amount] of holds) {
      if (isBot(t.seats[i])) continue; // the computer's coins are the game's
      const userId = t.seats[i]!.userId;
      const [u] = await tx.update(users).set({ balance: sql`${users.balance} - ${amount}` })
        .where(and(eq(users.id, userId), sql`${users.balance} >= ${amount}`)).returning({ id: users.id });
      if (!u) throw new Error("balance changed");
      await tx.insert(tableEscrows).values({ userId, code: t.code, amount });
    }
    return true;
  }).catch(() => false);
  if (!ok) return false;

  t.round++;
  t.message = null;
  t.banker = banker;
  t.hands = new Map();
  t.shoe = newShoe(t.mode === "house" ? 6 : 1);
  t.dealer = [];
  const dealTo = banker === null ? players : [...players, banker];
  for (const i of dealTo) t.hands.set(i, { cards: [draw(t)], status: "playing", doubled: false, hold: holds.get(i)!, net: null, label: null });
  if (t.mode === "house") t.dealer.push(draw(t));
  for (const i of dealTo) t.hands.get(i)!.cards.push(draw(t));
  if (t.mode === "house") t.dealer.push(draw(t));
  t.phase = "playing";

  if (t.mode === "house") {
    const up = handTotal([t.dealer[0]]);
    if ((up === 11 || up === 10) && isBlackjack(t.dealer)) { await settle(t); return true; } // the dealer checks first
    for (const i of players) if (isBlackjack(t.hands.get(i)!.cards)) t.hands.get(i)!.status = "done";
  } else {
    const bk = xiKind(t.hands.get(banker!)!.cards, true);
    if (bk === "xiban" || bk === "xidach") { await settle(t); return true; }
    for (const i of players) {
      const k = xiKind(t.hands.get(i)!.cards, false);
      if (k === "xiban" || k === "xidach") t.hands.get(i)!.status = "done";
    }
  }
  t.turn = null;
  await advance(t);
  return true;
}

/** Moves to the next player still to act; then the dealer (house) or the banker */
async function advance(t: Table) {
  const order = [...t.hands.keys()].filter((i) => i !== t.banker).sort((a, b) => a - b);
  const next = order.find((i) => (t.turn === null || i > t.turn) && t.hands.get(i)!.status === "playing");
  if (next !== undefined && t.phase === "playing") {
    t.turn = next;
    t.deadline = Date.now() + (isBot(t.seats[next]) ? BOT_THINK_MS : TURN_MS);
    if (t.seats[next]?.leaving) await autoPlay(t, next);
    return;
  }
  if (t.mode === "house") {
    t.phase = "dealer";
    t.turn = null; t.deadline = null;
    // The dealer only draws if someone is still in
    if ([...t.hands.values()].some((h) => handTotal(h.cards) <= 21 && !isBlackjack(h.cards))) {
      while (handTotal(t.dealer) < 17) t.dealer.push(draw(t));
    }
    await settle(t);
    return;
  }
  // The banker plays last
  const bankerHand = t.hands.get(t.banker!)!;
  if (t.phase === "playing" && bankerHand.status === "playing") {
    t.phase = "dealer";
    t.turn = t.banker; t.deadline = Date.now() + (isBot(t.seats[t.banker!]) ? BOT_THINK_MS : TURN_MS);
    if (t.seats[t.banker!]?.leaving) await autoPlay(t, t.banker!);
    return;
  }
  await settle(t);
}

/** One move. Returns an error message, or null. */
async function act(t: Table, seat: number, action: string): Promise<string | null> {
  if (t.turn !== seat || (t.phase !== "playing" && t.phase !== "dealer")) return "It isn't your turn";
  const h = t.hands.get(seat)!;
  const isBanker = t.mode === "banker" && seat === t.banker;
  if (t.mode === "house") {
    if (action === "hit") {
      h.cards.push(draw(t));
      if (handTotal(h.cards) >= 21) h.status = "done";
    } else if (action === "stand") h.status = "done";
    else if (action === "double") {
      if (h.cards.length !== 2 || h.doubled) return "You can only double on your first two cards";
      h.doubled = true; h.cards.push(draw(t)); h.status = "done";
    } else return "Unknown move";
  } else {
    const min = isBanker ? BANKER_STAND_MIN : PLAYER_STAND_MIN;
    if (action === "hit") {
      if (h.cards.length >= 5) return "Five cards is the most";
      h.cards.push(draw(t));
      if (handTotal(h.cards) > 21 || h.cards.length >= 5) h.status = "done";
    } else if (action === "stand") {
      if (handTotal(h.cards) < min) return `You need ${min} or more to stand`;
      h.status = "done";
    } else return "Unknown move";
  }
  if (h.status === "done") { if (isBanker) await settle(t); else await advance(t); }
  else t.deadline = Date.now() + TURN_MS;
  return null;
}

/** Plays a hand for someone who ran out of time or left: sensible moves, never deliberately losing */
async function autoPlay(t: Table, seat: number) {
  let guard = 0;
  while (t.turn === seat && guard++ < 10) {
    const h = t.hands.get(seat)!;
    const total = handTotal(h.cards);
    const bot = isBot(t.seats[seat]);
    const min = t.mode === "house" ? 17 : seat === t.banker ? (bot ? BOT_BANKER_STOP : BANKER_STAND_MIN) : bot ? BOT_PLAYER_STOP : PLAYER_STAND_MIN;
    await act(t, seat, total < min && h.cards.length < 5 ? "hit" : "stand");
  }
}

/** Works out everyone's result and pays it, all in one transaction */
async function settle(t: Table) {
  t.turn = null; t.deadline = null;
  const nets = new Map<number, { net: number; bet: number }>();
  if (t.mode === "house") {
    for (const [i, h] of t.hands) {
      const used = t.stake * (h.doubled ? 2 : 1);
      const ret = houseReturn(h.cards, t.dealer);
      const payout = Math.round(used * ret);
      h.net = payout - used;
      const p = handTotal(h.cards), d = handTotal(t.dealer);
      h.label = isBlackjack(h.cards) && ret === 2.5 ? "Blackjack" : p > 21 ? "Bust" : ret === 1 ? "Push" : ret > 1 ? (d > 21 ? "Dealer bust" : "Win") : "Lose";
      nets.set(i, { net: h.net, bet: used });
    }
  } else {
    const bankerCards = t.hands.get(t.banker!)!.cards;
    let bankerNet = 0, bankerRisk = 0;
    for (const [i, h] of t.hands) {
      if (i === t.banker) continue;
      const r = xiDachResult(h.cards, bankerCards);
      h.net = r * t.stake;
      bankerNet -= h.net;
      bankerRisk += t.stake * Math.max(1, r);
      const k = xiKind(h.cards, false);
      h.label = (KIND_VI[k] ? `${KIND_VI[k]} · ` : "") + (r > 0 ? "Thắng" : r < 0 ? "Thua" : "Hoà");
      nets.set(i, { net: h.net, bet: t.stake * Math.max(1, -r) });
    }
    const bh = t.hands.get(t.banker!)!;
    bh.net = bankerNet;
    const bk = xiKind(bh.cards, true);
    bh.label = `Nhà cái${KIND_VI[bk] ? ` · ${KIND_VI[bk]}` : ""}`;
    nets.set(t.banker!, { net: bankerNet, bet: bankerRisk });
  }
  for (const h of t.hands.values()) h.status = "done";
  await db.transaction(async (tx: Tx) => {
    for (const [i, h] of t.hands) {
      if (isBot(t.seats[i])) continue;
      const userId = t.seats[i]?.userId ?? null;
      const owner = userId ?? (await ownerOfHold(tx, t.code, h.hold));
      if (!owner) continue;
      const { net, bet } = nets.get(i)!;
      await tx.update(users).set({
        balance: sql`${users.balance} + ${h.hold + net}`,
        gamesPlayed: sql`${users.gamesPlayed} + 1`,
        ...(net > 0 ? { totalWins: sql`${users.totalWins} + 1`, maxWin: sql`greatest(${users.maxWin}, ${net})` } : {}),
      }).where(eq(users.id, owner));
      await logPlay(tx, owner, t.mode === "house" ? "bj_table" : "xidach", bet, bet + net);
    }
    await tx.delete(tableEscrows).where(eq(tableEscrows.code, t.code));
  });
  t.phase = "settled";
  t.nextRoundAt = Date.now() + BETWEEN_ROUNDS_MS;
  if (t.banker !== null) t.nextBanker = (t.banker + 1) % TABLE_SEATS;
  // Players who left mid-round go now
  t.seats.forEach((s, i) => { if (s?.leaving) { seatedAt.delete(s.userId); t.seats[i] = null; } });
  broadcast(t);
}
// A seat is never emptied mid-round, so this is only a safety net
async function ownerOfHold(tx: Tx, code: string, amount: number) {
  const [row] = await tx.select({ userId: tableEscrows.userId }).from(tableEscrows).where(and(eq(tableEscrows.code, code), eq(tableEscrows.amount, amount)));
  return row?.userId ?? null;
}

/** Refunds every hold left by a restart (the rounds they belonged to are gone) */
export async function recoverTableEscrows() {
  const rows = await db.select().from(tableEscrows);
  if (!rows.length) return;
  await db.transaction(async (tx) => {
    for (const r of rows) await tx.update(users).set({ balance: sql`${users.balance} + ${r.amount}` }).where(eq(users.id, r.userId));
    await tx.delete(tableEscrows);
  });
  console.log(`[startup] card tables: refunded ${rows.length} unfinished hold(s)`);
}

async function tick() {
  const now = Date.now();
  for (const t of [...tables.values()]) {
    if (t.busy) continue;
    t.busy = true;
    try {
      // Away too long, between rounds: the seat is freed
      if (t.phase === "waiting" || t.phase === "settled") {
        t.seats.forEach((s, i) => {
          if (s && !s.bot && now - s.lastSeen > GONE_MS && ![...t.clients].some((c) => c.userId === s.userId)) { seatedAt.delete(s.userId); t.seats[i] = null; }
        });
      }
      if ((t.phase === "playing" || t.phase === "dealer") && t.deadline && now > t.deadline && t.turn !== null) {
        await autoPlay(t, t.turn);
        broadcast(t);
      } else if ((t.phase === "waiting" || t.phase === "settled") && (!t.nextRoundAt || now >= t.nextRoundAt)) {
        const before = t.message;
        if (await startRound(t)) broadcast(t);
        else { t.nextRoundAt = now + 3000; if (t.message !== before) broadcast(t); if (t.phase === "settled") { t.phase = "waiting"; broadcast(t); } }
      }
      const empty = t.seats.every((s) => !s || s.bot) && t.clients.size === 0;
      if (empty) { t.emptySince ??= now; if (now - t.emptySince > EMPTY_MS) tables.delete(t.code); }
      else t.emptySince = null;
    } catch (e) {
      console.error("[cards]", e);
    } finally {
      t.busy = false;
    }
  }
}

function sit(t: Table, userId: string, name: string): string | null {
  if (t.seats.some((s) => s?.userId === userId)) return null;
  const other = seatedAt.get(userId);
  if (other && other !== t.code && tables.has(other)) return "You're already sitting at another table";
  const free = t.seats.findIndex((s) => !s);
  if (free < 0) return "The table is full";
  t.seats[free] = { userId, name, lastSeen: Date.now(), leaving: false };
  seatedAt.set(userId, t.code);
  if (t.phase === "waiting" && !t.nextRoundAt) t.nextRoundAt = Date.now() + 3000;
  return null;
}

function leave(t: Table, userId: string) {
  const i = t.seats.findIndex((s) => s?.userId === userId);
  if (i < 0) return;
  if (t.hands.has(i) && (t.phase === "playing" || t.phase === "dealer")) {
    // In a hand: it's played out for them, and the seat goes when the round ends
    t.seats[i]!.leaving = true;
    if (t.turn === i) void autoPlay(t, i).then(() => broadcast(t));
  } else {
    t.seats[i] = null;
    seatedAt.delete(userId);
  }
}

export function dropAllTablesForTest() { tables.clear(); seatedAt.clear(); }
export const tableForTest = (code: string) => tables.get(code);
export { tick as cardTablesTick };

export function registerCardTableRoutes(app: Express, requireUser: RequestHandler) {
  const me = (res: Response) => res.locals.user as { id: string; username: string };
  app.get("/api/cards/tables", requireUser, (_req, res) => {
    const list: TableSummary[] = [...tables.values()].map((t) => ({
      code: t.code, mode: t.mode, stake: t.stake, players: t.seats.filter(Boolean).length, host: t.host,
    }));
    res.json({ tables: list, mine: seatedAt.get(me(res).id) ?? null, stakes: TABLE_STAKES });
  });
  app.post("/api/cards/tables", requireUser, (req: Request, res: Response) => {
    const mode = req.body?.mode, stake = Number(req.body?.stake);
    if ((mode !== "house" && mode !== "banker") || !TABLE_STAKES.includes(stake)) return res.status(400).json({ message: "Pick a game and a stake" });
    const u = me(res);
    const existing = seatedAt.get(u.id);
    if (existing && tables.has(existing)) return res.status(409).json({ message: "You're already at a table", code: existing });
    let code = newCode();
    while (tables.has(code)) code = newCode();
    const t: Table = {
      code, mode, stake, host: u.username, seats: Array(TABLE_SEATS).fill(null), clients: new Set(), phase: "waiting", round: 0,
      hands: new Map(), banker: null, nextBanker: 0, dealer: [], shoe: [], turn: null, deadline: null, nextRoundAt: null,
      message: null, emptySince: null, busy: false,
    };
    tables.set(code, t);
    sit(t, u.id, u.username);
    res.json({ code });
  });
  // Sitting down and leaving also work over the socket; these are for tests and simple clients
  app.post("/api/cards/tables/:code/sit", requireUser, (req: Request, res: Response) => {
    const t = tables.get(String(req.params.code).toUpperCase());
    if (!t) return res.status(404).json({ message: "Table not found" });
    const err = sit(t, me(res).id, me(res).username);
    if (err) return res.status(409).json({ message: err });
    broadcast(t);
    res.json({ ok: true });
  });
  app.post("/api/cards/tables/:code/act", requireUser, async (req: Request, res: Response) => {
    const t = tables.get(String(req.params.code).toUpperCase());
    if (!t) return res.status(404).json({ message: "Table not found" });
    const seat = t.seats.findIndex((s) => s?.userId === me(res).id);
    if (seat < 0) return res.status(403).json({ message: "Sit down first" });
    if (t.busy) return res.status(409).json({ message: "Just a moment" });
    t.busy = true;
    try {
      const err = await act(t, seat, String(req.body?.action));
      if (err) return res.status(400).json({ message: err });
      broadcast(t);
      res.json({ state: view(t, me(res).id) });
    } finally { t.busy = false; }
  });
  app.get("/api/cards/tables/:code", requireUser, (req: Request, res: Response) => {
    const t = tables.get(String(req.params.code).toUpperCase());
    if (!t) return res.status(404).json({ message: "Table not found" });
    res.json({ state: view(t, me(res).id) });
  });
}

export function attachCardTableSockets(httpServer: Server, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const timer = setInterval(() => { void tick(); }, 500);
  timer.unref?.();
  httpServer.on("close", () => clearInterval(timer));

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/ws/cards") return;
    sessionMiddleware(req as Request, {} as Response, (async () => {
      const userId = (req as Request).session?.userId;
      const t = tables.get((url.searchParams.get("code") ?? "").toUpperCase());
      const [u] = userId ? await db.select({ username: users.username, banned: users.banned }).from(users).where(eq(users.id, userId)) : [];
      if (!userId || !t || !u || u.banned) {
        socket.write(`HTTP/1.1 ${userId ? "404 Not Found" : "401 Unauthorized"}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws, t, userId, u.username));
    }) as unknown as NextFunction);
  });

  function onConnect(ws: WebSocket, t: Table, userId: string, name: string) {
    const client: Client = { ws, userId, lastEmote: 0 };
    t.clients.add(client);
    const seat = t.seats.find((s) => s?.userId === userId);
    if (seat) seat.lastSeen = Date.now();
    ws.send(JSON.stringify({ t: "state", s: view(t, userId) }));
    broadcast(t);
    ws.on("message", async (raw) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      const s = t.seats.find((x) => x?.userId === userId);
      if (s) s.lastSeen = Date.now();
      if (msg?.t === "sit") {
        const err = sit(t, userId, name);
        if (err) ws.send(JSON.stringify({ t: "error", message: err }));
        broadcast(t);
      } else if (msg?.t === "leave") {
        leave(t, userId);
        broadcast(t);
      } else if (msg?.t === "act" && typeof msg.a === "string") {
        const i = t.seats.findIndex((x) => x?.userId === userId);
        if (i < 0 || t.busy) return;
        t.busy = true;
        try {
          const err = await act(t, i, msg.a);
          if (err) ws.send(JSON.stringify({ t: "error", message: err }));
          broadcast(t);
        } catch (e) { console.error("[cards]", e); } finally { t.busy = false; }
      } else if (msg?.t === "emote" && typeof msg.e === "string" && msg.e.length <= 8 && Date.now() - client.lastEmote > 1200) {
        client.lastEmote = Date.now();
        const from = t.seats.findIndex((x) => x?.userId === userId);
        sendAll(t, { t: "emote", from, e: msg.e });
      }
    });
    ws.on("close", () => {
      t.clients.delete(client);
      const st = t.seats.find((x) => x?.userId === userId);
      if (st) st.lastSeen = Date.now();
      broadcast(t);
    });
  }
}
