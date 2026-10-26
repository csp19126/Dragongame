/**
 * Game invites and challenges (POST /api/invites), and the "Online now" list.
 *
 * An invite is a bell notification with a Join button plus a challenge card in the private
 * conversation. It follows the private-message rules: never across a block, and a player who
 * takes messages from friends only gets invites from friends only (turning off friend requests
 * does not stop invites from friends). Rate limited per sender.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { directMessages, users, userSocial, userBlocks, type User } from "@shared/schema";
import {
  INVITE_GAME_IDS, INVITE_COOLDOWN_MS, INVITES_PER_HOUR, INVITE_SAME_PLAYER_MS, validInvitePath, type InviteGame,
} from "@shared/social3";
import { speakerRefusal } from "./speech";
import { push, connectedUsers, playingNow } from "./hub";
import { findPlayer, blockedEither, areFriends, privacyFrom, socialOf, notify, pushUnread, presenceHidden, friendIdsOf, relationOf, joinOf } from "./friends";
import { clubTagOf } from "./clubs";
import { toDm } from "./social";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;

// Per-sender limits, in memory (one server; a redeploy resetting them is harmless)
const sent = new Map<string, number[]>();
const lastTo = new Map<string, number>();

export function inviteLimit(u: User, toId: string, now = Date.now()): string | null {
  if (u.isAdmin) return null;
  const times = (sent.get(u.id) ?? []).filter((t) => now - t < 3600_000);
  if (times.length && now - times[times.length - 1] < INVITE_COOLDOWN_MS) return "slow_down";
  if (times.length >= INVITES_PER_HOUR) return "Too many invites, try again later";
  if (now - (lastTo.get(`${u.id}:${toId}`) ?? 0) < INVITE_SAME_PLAYER_MS) return "You just invited this player";
  return null;
}
function recordInvite(u: User, toId: string, now = Date.now()) {
  const times = (sent.get(u.id) ?? []).filter((t) => now - t < 3600_000);
  times.push(now);
  sent.set(u.id, times);
  lastTo.set(`${u.id}:${toId}`, now);
  if (sent.size > 20000) sent.clear();
  if (lastTo.size > 50000) lastTo.clear();
}

/** Why `me` may not invite `them` (or null when they may) */
export async function inviteRefusal(me: User, them: User): Promise<{ status: number; message: string } | null> {
  if (await blockedEither(me.id, them.id)) return { status: 403, message: "Can't invite this player" };
  if (me.isAdmin) return null;
  const p = privacyFrom(await socialOf(them.id));
  if (p.dmFrom === "friends" && !(await areFriends(me.id, them.id))) return { status: 403, message: "This player only takes invites from friends" };
  return null;
}

const inviteSchema = z.object({ to: z.string().trim().min(1).max(40), game: z.enum(INVITE_GAME_IDS as [InviteGame, ...InviteGame[]]), path: z.string().max(200) });

export function registerInviteRoutes(app: Express, requireUser: Mw) {
  app.post("/api/invites", requireUser, async (req, res) => {
    const me: User = res.locals.user;
    const parsed = inviteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const { game, path } = parsed.data;
    if (!validInvitePath(game, path)) return res.status(400).json({ message: "Bad invite link" });
    const no = speakerRefusal(me);
    if (no) return res.status(no.status).json({ message: no.message });
    const to = await findPlayer(parsed.data.to);
    if (!to) return res.status(404).json({ message: "Player not found" });
    if (to.id === me.id) return res.status(400).json({ message: "You can't invite yourself" });
    const refusal = await inviteRefusal(me, to);
    if (refusal) return res.status(refusal.status).json({ message: refusal.message });
    const limited = inviteLimit(me, to.id);
    if (limited) return res.status(429).json({ message: limited });
    recordInvite(me, to.id);
    const card = { kind: "invite" as const, game, path };
    const [m] = await db.insert(directMessages).values({ fromId: me.id, toId: to.id, text: null, sticker: null, card }).returning();
    push(to.id, { t: "dm", with: me.username, m: toDm(m, to.id) });
    push(me.id, { t: "dm", with: to.username, m: toDm(m, me.id) });
    // One bell entry per sender and game: a newer invite replaces the older one
    await notify(to.id, "invite", me.id, { game, path, messageId: m.id }, `invite:${me.id}:${game}`);
    void pushUnread(to.id).catch(() => {});
    res.json({ ok: true });
  });

  // ---- Online now: friends first, then everyone else who shares their presence ----
  app.get("/api/online", requireUser, async (_req, res) => {
    const me: User = res.locals.user;
    const ids = connectedUsers().filter((id) => id !== me.id && !presenceHidden(id));
    if (!ids.length) return res.json({ friends: [], others: [], total: 0 });
    const friendSet = new Set(await friendIdsOf(me.id));
    const blocked = new Set((await db.execute(sql`select blocked_id as id from ${userBlocks} where blocker_id = ${me.id} union select blocker_id from ${userBlocks} where blocked_id = ${me.id}`)).rows.map((r: any) => r.id as string));
    const rows = await db.select({ id: users.id, username: users.username, avatar: users.profileImageUrl, banned: users.banned, level: userSocial.level })
      .from(users).leftJoin(userSocial, sql`${userSocial.userId} = ${users.id}`).where(inArray(users.id, ids.slice(0, 500)));
    const list = rows.filter((r) => !r.banned && !blocked.has(r.id)).map((r) => ({
      username: r.username, avatarUrl: r.avatar ?? null, level: r.level ?? 1, playing: playingNow(r.id), join: joinOf(r.id),
      club: clubTagOf(r.id), friend: friendSet.has(r.id),
    }));
    // Playing something first, then by name
    const sort = (a: typeof list[number], b: typeof list[number]) => Number(!!b.playing) - Number(!!a.playing) || a.username.localeCompare(b.username);
    const friends = list.filter((x) => x.friend).sort(sort);
    const others = list.filter((x) => !x.friend).sort(sort).slice(0, 60);
    const withRel = [];
    for (const o of others) withRel.push({ ...o, relation: await relationOf(me.id, (rows.find((r) => r.username === o.username)!).id) });
    res.json({ friends: friends.map((f) => ({ ...f, relation: "friends" })), others: withRel, total: list.length });
  });
}
