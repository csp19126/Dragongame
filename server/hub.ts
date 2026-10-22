/**
 * The social WebSocket (/ws/social): one connection per open tab, signed in with the same
 * session cookie as the rest of the site (like /ws/cards and /ws/pool). The server pushes
 * new private messages, unread counts, typing, notifications, friends' presence, public chat
 * and the activity feed. Everything it pushes can also be fetched over HTTP, so the browser
 * falls back to polling while the socket is down.
 */
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";
import { gameOfRoute } from "@shared/friends";

export interface HubClient { ws: WebSocket; userId: string; username: string; route: string | null; lastMsg: number; burst: number }

const clients = new Map<string, Set<HubClient>>();

/** What each connected player is doing: the game of the page they last reported */
const playing = new Map<string, { game: string | null; at: number }>();

type MessageHandler = (c: HubClient, msg: any) => void | Promise<void>;
type PresenceHandler = (userId: string, change: "online" | "offline" | "game") => void | Promise<void>;
let onMessage: MessageHandler = () => {};
let onPresence: PresenceHandler = () => {};
function presence(userId: string, change: "online" | "offline" | "game") {
  Promise.resolve().then(() => onPresence(userId, change)).catch((e) => console.error("[social presence]", e));
}

export function setHubHandlers(h: { message: MessageHandler; presence: PresenceHandler }) {
  onMessage = h.message;
  onPresence = h.presence;
}

/** Sends to every open tab of a player */
export function push(userId: string, msg: object) {
  const set = clients.get(userId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const c of set) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
}

/** Sends to everyone connected (optionally only to those `keep` says yes to) */
export function pushAll(msg: object, keep?: (userId: string) => boolean) {
  const data = JSON.stringify(msg);
  for (const [userId, set] of clients) {
    if (keep && !keep(userId)) continue;
    for (const c of set) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }
}

export const isConnected = (userId: string) => (clients.get(userId)?.size ?? 0) > 0;
export const connectedUsers = () => [...clients.keys()];

/** The game a connected player is on now (null when not in a game or not connected) */
export function playingNow(userId: string): string | null {
  if (!isConnected(userId)) return null;
  return playing.get(userId)?.game ?? null;
}

/** Closes every socket of a player (account deleted or banned) */
export function disconnect(userId: string) {
  const set = clients.get(userId);
  if (!set) return;
  for (const c of set) c.ws.close(4001, "gone");
  clients.delete(userId);
  playing.delete(userId);
}

export function attachSocialSockets(httpServer: Server, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  // Keep connections alive through proxies, and drop dead ones
  const alive = new WeakSet<WebSocket>();
  const timer = setInterval(() => {
    for (const set of clients.values()) for (const c of set) {
      if (!alive.has(c.ws)) { c.ws.terminate(); continue; }
      alive.delete(c.ws);
      try { c.ws.ping(); } catch { /* closing */ }
    }
  }, 30_000);
  timer.unref?.();
  httpServer.on("close", () => clearInterval(timer));

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/ws/social") return;
    sessionMiddleware(req as Request, {} as Response, (async () => {
      const userId = (req as Request).session?.userId;
      const [u] = userId ? await db.select({ username: users.username, banned: users.banned }).from(users).where(eq(users.id, userId)) : [];
      if (!userId || !u || u.banned) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => connect(ws, userId, u.username));
    }) as unknown as NextFunction);
  });

  function connect(ws: WebSocket, userId: string, username: string) {
    const c: HubClient = { ws, userId, username, route: null, lastMsg: 0, burst: 0 };
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    let set = clients.get(userId);
    const first = !set || set.size === 0;
    if (!set) clients.set(userId, (set = new Set()));
    set.add(c);
    if (first) presence(userId, "online");
    Promise.resolve().then(() => onMessage(c, { t: "hello" })).catch((e) => console.error("[social ws]", e));

    ws.on("message", (raw) => {
      alive.add(ws);
      // A small allowance of messages per second, so a tab can't flood the server
      const now = Date.now();
      c.burst = now - c.lastMsg > 1000 ? 1 : c.burst + 1;
      c.lastMsg = now;
      if (c.burst > 8) return;
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!msg || typeof msg !== "object") return;
      if (msg.t === "presence") {
        c.route = typeof msg.route === "string" ? msg.route.slice(0, 100) : null;
        const game = gameOfRoute(c.route);
        const before = playing.get(userId)?.game ?? null;
        playing.set(userId, { game, at: now });
        if (game !== before) presence(userId, "game");
        return;
      }
      if (msg.t === "ping") { ws.send(JSON.stringify({ t: "pong" })); return; }
      Promise.resolve().then(() => onMessage(c, msg)).catch((e) => console.error("[social ws]", e));
    });
    ws.on("close", () => {
      const s = clients.get(userId);
      if (!s) return;
      s.delete(c);
      if (s.size === 0) {
        clients.delete(userId);
        playing.delete(userId);
        presence(userId, "offline");
      } else {
        // Another tab is still open: it decides the game (the most recent route among them)
        const other = [...s].find((x) => x.route);
        const game = gameOfRoute(other?.route ?? null);
        if ((playing.get(userId)?.game ?? null) !== game) { playing.set(userId, { game, at: Date.now() }); presence(userId, "game"); }
      }
    });
  }
}
