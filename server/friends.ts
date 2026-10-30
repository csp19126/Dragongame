/**
 * Social 2.0: friends and friend requests, presence ("now playing"), the notification bell,
 * the activity feed, levels, social profiles and privacy settings, the friends leaderboard,
 * and the daily friend Lì Xì (coins made by the game, never moved between players).
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql, count } from "drizzle-orm";
import { db } from "./db";
import {
  users, deposits, friendships, friendRequests, notifications, messageReactions, feedItems, friendGifts, userSocial,
  userBlocks, achievements, chatMessages, directMessages, profileReports, datingLikes, type User,
} from "@shared/schema";
import {
  MAX_FRIENDS, MAX_PENDING_SENT, FRIEND_GIFT_AMOUNT, FRIEND_GIFT_MIN_GAMES, FRIEND_GIFT_MAX_RECEIVED, FRIEND_GIFT_CLAIM_MS,
  BIO_MAX, SHOWCASE_MAX, DEFAULT_PRIVACY, PLAYABLE_BY_ID, NOTIF_KEEP, NOTIF_DAYS, NOTIF_PAGE, FEED_PAGE, TYPING_EVERY_MS,
  giftBlock, xpOf, levelOf, levelProgress, feedKindOfPlay, vnWeekStart, quote,
  type PrivacySettings, type Relation, type NotifKind, type NotificationView, type FeedItem, type FeedKind,
  type FriendView, type FriendRequestView, type FriendsView,
} from "@shared/friends";
import { checkChat } from "@shared/chat";
import { vnDay } from "@shared/league";
import { SOCIAL_MIN_GAMES } from "@shared/social";
import { COUNTRY_BY_CODE, PROFILE_LANGUAGES, PLAY_STYLES, type PlayerFacts } from "@shared/social3";
import { speakerRefusal, paceLimiter } from "./speech";
import { push, pushAll, isConnected, playingNow, connectedUsers, setHubHandlers, disconnect, type HubClient } from "./hub";
import { isOnline, unreadTotal } from "./social";
import { cardSeatOf } from "./cardtables";
import { poolRoomOf } from "./pool";
import { clubProfileOf, clubTagOf } from "./clubs";
import { questEvent } from "./quests";
import { dartsRoomOf } from "./darts";
import { footballRoomOf } from "./football";

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

// ---------------- Lookups ----------------

export async function findPlayer(name: unknown) {
  if (typeof name !== "string" || !name.trim() || name.length > 40) return undefined;
  const [u] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${name.trim()})`);
  return u && !u.banned ? u : undefined;
}

export async function blockedEither(a: string, b: string, q: Db = db) {
  const [r] = await q.select({ n: count() }).from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)), and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a))));
  return r.n > 0;
}

/** Everyone a player has blocked or been blocked by */
async function blockSet(userId: string): Promise<Set<string>> {
  const rows = await db.select({ a: userBlocks.blockerId, b: userBlocks.blockedId }).from(userBlocks)
    .where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export async function friendshipOf(a: string, b: string, q: Db = db) {
  const [x, y] = pair(a, b);
  const [f] = await q.select().from(friendships).where(and(eq(friendships.userA, x), eq(friendships.userB, y)));
  return f ?? null;
}
export const areFriends = async (a: string, b: string) => !!(await friendshipOf(a, b));

export async function friendIdsOf(userId: string, q: Db = db): Promise<string[]> {
  const rows = await q.select({ a: friendships.userA, b: friendships.userB }).from(friendships)
    .where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)));
  return rows.map((r) => (r.a === userId ? r.b : r.a));
}
const friendIdsSql = (userId: string) => sql`(select case when user_a = ${userId} then user_b else user_a end from ${friendships} where user_a = ${userId} or user_b = ${userId})`;

export async function relationOf(me: string, other: string): Promise<Relation> {
  if (await areFriends(me, other)) return "friends";
  const rows = await db.select({ from: friendRequests.fromId }).from(friendRequests)
    .where(or(and(eq(friendRequests.fromId, me), eq(friendRequests.toId, other)), and(eq(friendRequests.fromId, other), eq(friendRequests.toId, me))));
  if (rows.some((r) => r.from === me)) return "sent";
  if (rows.length) return "received";
  return "none";
}

// ---------------- Social profile and privacy ----------------

/** Players who hide their presence: kept in memory, read on every presence check */
const hiddenPresence = new Set<string>();

export const presenceHidden = (userId: string) => hiddenPresence.has(userId);
/** Online as others may see it */
export const visibleOnline = (userId: string, lastSeenAt: Date | string | null | undefined) =>
  !hiddenPresence.has(userId) && (isConnected(userId) || isOnline(userId, lastSeenAt));

type SocialRow = typeof userSocial.$inferSelect;
export async function socialOf(userId: string, q: Db = db): Promise<SocialRow | null> {
  const [r] = await q.select().from(userSocial).where(eq(userSocial.userId, userId));
  return r ?? null;
}
export function privacyFrom(r: SocialRow | null): PrivacySettings {
  if (!r) return { ...DEFAULT_PRIVACY };
  return { dmFrom: r.dmFrom === "friends" ? "friends" : "everyone", requestsFrom: r.requestsFrom === "nobody" ? "nobody" : "everyone", showPresence: r.showPresence, showInFeed: r.showInFeed, hideCountry: r.hideCountry, showPhotos: r.showPhotos };
}

/** The "find people to play with" facts of a profile (country left out if they hide it) */
export function factsOf(r: SocialRow | null | undefined): PlayerFacts {
  return {
    country: r && !r.hideCountry && r.country && COUNTRY_BY_CODE.has(r.country) ? r.country : null,
    languages: (r?.languages ?? []).filter((l) => (PROFILE_LANGUAGES as readonly string[]).includes(l)),
    playStyle: r?.playStyle && (PLAY_STYLES as readonly string[]).includes(r.playStyle) ? r.playStyle : null,
    favGames: (r?.favGames ?? []).filter((g) => PLAYABLE_BY_ID.has(g)),
  };
}
/** Facts for many players at once (lists) */
export async function factsFor(ids: string[]): Promise<Map<string, PlayerFacts>> {
  const rows = ids.length ? await db.select().from(userSocial).where(inArray(userSocial.userId, ids)) : [];
  const by = new Map(rows.map((r) => [r.userId, r]));
  return new Map(ids.map((id) => [id, factsOf(by.get(id))]));
}
async function ensureSocial(userId: string, q: Db = db) {
  await q.insert(userSocial).values({ userId }).onConflictDoNothing();
}

/** Both tapped 💛 on Meet: they may always message each other */
async function likedBothWays(a: string, b: string) {
  const rows = await db.select({ f: datingLikes.fromId }).from(datingLikes)
    .where(or(and(eq(datingLikes.fromId, a), eq(datingLikes.toId, b)), and(eq(datingLikes.fromId, b), eq(datingLikes.toId, a))));
  return rows.length === 2;
}

/** Why `me` may not send a private message to `them` (or null if they may) */
export async function dmRefusal(me: User, them: User): Promise<string | null> {
  if (await blockedEither(me.id, them.id)) return "Can't message this player";
  if (me.isAdmin) return null;
  const p = privacyFrom(await socialOf(them.id));
  if (p.dmFrom === "friends" && !(await areFriends(me.id, them.id)) && !(await likedBothWays(me.id, them.id))) return "This player only accepts messages from friends";
  return null;
}

/** The games a player's earned badges, for the showcase */
async function earnedBadges(userId: string): Promise<string[]> {
  const rows = await db.select({ id: achievements.badgeId }).from(achievements).where(eq(achievements.userId, userId));
  return [...new Set(rows.map((r) => r.id))];
}

/** Exact XP from every coin staked */
export async function xpFor(userId: string) {
  const [r] = (await db.execute(sql`select coalesce(sum(bet), 0)::bigint as s from game_plays where user_id = ${userId}`)).rows as { s: string }[];
  return xpOf(Number(r?.s ?? 0));
}

/** The social part of a player's public profile */
export async function socialProfile(u: User, viewer: User) {
  const row = await socialOf(u.id);
  const p = privacyFrom(row);
  const xp = await xpFor(u.id);
  const badges = new Set(await earnedBadges(u.id));
  const [{ n: friendsCount }] = await db.select({ n: count() }).from(friendships).where(or(eq(friendships.userA, u.id), eq(friendships.userB, u.id)));
  const you = u.id === viewer.id;
  const relation: Relation = you ? "none" : await relationOf(viewer.id, u.id);
  const showPlaying = (you || relation === "friends") && !hiddenPresence.has(u.id);
  return {
    bio: row?.bio ?? null,
    favGame: row?.favGame && PLAYABLE_BY_ID.has(row.favGame) ? row.favGame : null,
    showcase: (row?.showcase ?? []).filter((b) => badges.has(b)).slice(0, SHOWCASE_MAX),
    level: levelProgress(xp),
    friendsCount,
    relation,
    acceptsRequests: p.requestsFrom === "everyone",
    friendsOnlyDm: p.dmFrom === "friends",
    playing: showPlaying ? playingNow(u.id) : null,
    club: clubProfileOf(u.id),
    ...factsOf(row),
  };
}

const bioChanges = new Map<string, { day: string; n: number }>();
const BIO_CHANGES_PER_DAY = 20;

// ---------------- Notifications ----------------

async function notifViews(rows: (typeof notifications.$inferSelect)[]): Promise<NotificationView[]> {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.actorId) ids.add(r.actorId);
    for (const a of (r.data as any)?.actorIds ?? []) ids.add(a);
  }
  const people = ids.size ? await db.select({ id: users.id, username: users.username, avatar: users.profileImageUrl }).from(users).where(inArray(users.id, [...ids])) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => {
    const a = r.actorId ? byId.get(r.actorId) : undefined;
    const { actorIds, ...data } = (r.data ?? {}) as Record<string, any>;
    if (Array.isArray(actorIds)) data.actors = actorIds.map((x: string) => byId.get(x)?.username).filter(Boolean);
    return { id: r.id, kind: r.kind as NotifKind, actor: a ? { username: a.username, avatarUrl: a.avatar } : null, data, read: !!r.readAt, at: r.createdAt.toISOString() };
  });
}

export async function notifUnread(userId: string) {
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return n;
}

/** Both badges' numbers, to every open tab of a player */
export async function pushUnread(userId: string) {
  if (!isConnected(userId)) return;
  push(userId, { t: "unread", dm: await unreadTotal(userId), notif: await notifUnread(userId) });
}

async function prune(userId: string) {
  await db.execute(sql`delete from ${notifications} where user_id = ${userId} and id < (
    select coalesce(min(id), 0) from (select id from ${notifications} where user_id = ${userId} order by id desc limit ${NOTIF_KEEP}) k)`);
}

/** Adds a notification (or updates the one with the same `ref`) and tells the player straight away */
export async function notify(userId: string, kind: NotifKind, actorId: string | null, data: Record<string, unknown>, ref?: string) {
  let row: typeof notifications.$inferSelect | undefined;
  if (ref) {
    [row] = await db.update(notifications).set({ actorId, data, readAt: null, createdAt: new Date() })
      .where(and(eq(notifications.userId, userId), eq(notifications.ref, ref))).returning();
  }
  if (!row) {
    [row] = await db.insert(notifications).values({ userId, kind, actorId, data, ref: ref ?? null }).returning();
    void prune(userId).catch(() => {});
  }
  if (isConnected(userId)) {
    const [view] = await notifViews([row]);
    push(userId, { t: "notif", n: view });
    await pushUnread(userId);
  }
  return row;
}

/** Reactions to one message are grouped in one notification that counts them */
export async function notifyReaction(ownerId: string, actorId: string, scope: "chat" | "dm", messageId: number, snippet: string | null, emoji: string) {
  const ref = `react:${scope}:${messageId}`;
  const [old] = await db.select().from(notifications).where(and(eq(notifications.userId, ownerId), eq(notifications.ref, ref)));
  const d = (old && !old.readAt ? old.data : {}) as { counts?: Record<string, number>; actorIds?: string[]; total?: number };
  const counts = { ...(d.counts ?? {}) };
  counts[emoji] = (counts[emoji] ?? 0) + 1;
  const actorIds = [actorId, ...(d.actorIds ?? []).filter((a) => a !== actorId)].slice(0, 3);
  await notify(ownerId, "reaction", actorId, { scope, messageId, snippet, counts, actorIds, total: (d.total ?? 0) + 1 }, ref);
}

/** Mentions and replies in the public chat: only real players, never yourself, never across a block */
export async function notifyChat(author: User, messageId: number, text: string | null, mentions: string[], replyToAuthor: string | null) {
  const told = new Set<string>([author.id]);
  const snippet = quote(text);
  if (replyToAuthor && !told.has(replyToAuthor) && !(await blockedEither(author.id, replyToAuthor))) {
    told.add(replyToAuthor);
    await notify(replyToAuthor, "reply", author.id, { scope: "chat", messageId, snippet });
  }
  if (!mentions.length) return;
  const found = await db.select({ id: users.id }).from(users)
    .where(and(inArray(sql`lower(${users.username})`, mentions), eq(users.banned, false)));
  for (const u of found) {
    if (told.has(u.id) || (await blockedEither(author.id, u.id))) continue;
    told.add(u.id);
    await notify(u.id, "mention", author.id, { scope: "chat", messageId, snippet });
  }
}

// ---------------- Presence ----------------

export function joinOf(userId: string): FriendView["join"] {
  const card = cardSeatOf(userId);
  if (card?.free) return { kind: "cards", href: `/ban-bai?table=${card.code}` };
  const room = poolRoomOf(userId);
  if (room?.open) return { kind: "pool", href: `/pool?table=${room.code}` };
  const darts = dartsRoomOf(userId);
  if (darts?.open) return { kind: "darts", href: `/phi-tieu?table=${darts.code}` };
  const kick = footballRoomOf(userId);
  if (kick?.open) return { kind: "football", href: `/da-bong?table=${kick.code}` };
  return null;
}

async function onPresenceChange(userId: string) {
  if (hiddenPresence.has(userId)) return;
  const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  if (!u) return;
  const online = isConnected(userId);
  const msg = { t: "presence", username: u.username, online, playing: online ? playingNow(userId) : null, join: online ? joinOf(userId) : null };
  for (const f of await friendIdsOf(userId)) if (isConnected(f)) push(f, msg);
}

const lastTyping = new WeakMap<HubClient, number>();
async function onHubMessage(c: HubClient, msg: any) {
  if (msg.t === "hello") return pushUnread(c.userId);
  if (msg.t === "typing" && typeof msg.to === "string") {
    const now = Date.now();
    if (now - (lastTyping.get(c) ?? 0) < TYPING_EVERY_MS / 2) return;
    lastTyping.set(c, now);
    const [me] = await db.select().from(users).where(eq(users.id, c.userId));
    const them = await findPlayer(msg.to);
    if (!me || !them || them.id === me.id || !isConnected(them.id)) return;
    if (await dmRefusal(me, them)) return;
    push(them.id, { t: "typing", from: me.username });
  }
}

// ---------------- Activity feed ----------------

/** Records an event once (its ref is unique); the tick pushes new events to everyone */
export async function addFeed(item: { kind: FeedKind; userId: string; otherId?: string | null; game?: string | null; amount?: number | null; bet?: number | null; level?: number | null; ref: string; at?: Date }, q: Db = db) {
  const { at, ...rest } = item;
  await q.insert(feedItems).values({ ...rest, ...(at ? { createdAt: at } : {}) }).onConflictDoNothing();
}

const feedSelect = (where: ReturnType<typeof sql>, limit: number) => sql`
  select f.id, f.kind, f.user_id, f.other_id, f.game, f.amount, f.bet, f.level, f.created_at,
    u.username, u.profile_image_url as avatar, coalesce(us.level, 1) as ulevel,
    o.username as o_username, o.profile_image_url as o_avatar, coalesce(os.level, 1) as olevel
  from ${feedItems} f
  join ${users} u on u.id = f.user_id
  left join ${userSocial} us on us.user_id = f.user_id
  left join ${users} o on o.id = f.other_id
  left join ${userSocial} os on os.user_id = f.other_id
  where not u.banned and coalesce(us.show_in_feed, true)
    and (f.other_id is null or (o.id is not null and not o.banned and coalesce(os.show_in_feed, true)))
    and ${where}
  order by f.id desc limit ${limit}`;

function toFeed(r: Record<string, any>): FeedItem {
  return {
    id: r.id, kind: r.kind, game: r.game ?? null, amount: r.amount === null ? null : Number(r.amount), bet: r.bet === null ? null : Number(r.bet),
    level: r.level ?? null, at: new Date(r.created_at).toISOString(),
    user: { username: r.username, avatarUrl: r.avatar ?? null, level: Number(r.ulevel) },
    other: r.o_username ? { username: r.o_username, avatarUrl: r.o_avatar ?? null, level: Number(r.olevel) } : null,
  };
}

export async function feedFor(me: string, opts: { friends?: boolean; before?: number; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? FEED_PAGE, 1), 50);
  const blocked = sql`(select blocked_id from ${userBlocks} where blocker_id = ${me} union select blocker_id from ${userBlocks} where blocked_id = ${me})`;
  const conds = [
    sql`f.user_id not in ${blocked}`,
    sql`(f.other_id is null or f.other_id not in ${blocked})`,
  ];
  if (opts.friends) conds.push(sql`(f.user_id = ${me} or f.user_id in ${friendIdsSql(me)} or f.other_id = ${me} or f.other_id in ${friendIdsSql(me)})`);
  if (opts.before && Number.isInteger(opts.before)) conds.push(sql`f.id < ${opts.before}`);
  const rows = (await db.execute(feedSelect(sql.join(conds, sql` and `), limit + 1))).rows as Record<string, any>[];
  return { items: rows.slice(0, limit).map(toFeed), more: rows.length > limit };
}

// ---------------- The tick: big wins, level-ups, pushing the feed, tidying up ----------------

let lastTickAt = 0;
let pushedUpTo = 0;
const pushedRecently = new Set<number>();
let lastPrune = 0;

async function scanPlays(since: Date) {
  const rows = (await db.execute(sql`
    select id, user_id, game, bet, payout, created_at from game_plays
    where created_at > ${since} and payout > bet and (
      payout - bet >= 1000000 or (bet > 0 and payout >= 50 * bet) or (game = 'horse' and bet > 0 and payout >= 10 * bet))
    order by id desc limit 500`)).rows as Record<string, any>[];
  // Oldest first, so the feed's order follows the plays'
  for (const r of rows.reverse()) {
    const kind = feedKindOfPlay(r.game, Number(r.bet), Number(r.payout));
    if (!kind) continue;
    await addFeed({ kind, userId: r.user_id, game: r.game, amount: Number(r.payout), bet: Number(r.bet), ref: `play:${r.id}`, at: new Date(r.created_at) });
  }
}

/** Brings stored XP and levels up to date for players who played since `since` (all players when null) */
async function syncLevels(since: Date | null, announce: boolean) {
  const sums = (await db.execute(since
    ? sql`select user_id, sum(bet)::bigint as s from game_plays where user_id in (select distinct user_id from game_plays where created_at > ${since}) group by user_id`
    : sql`select user_id, sum(bet)::bigint as s from game_plays group by user_id`)).rows as { user_id: string; s: string }[];
  if (!sums.length) return;
  const stored = new Map((await db.select({ id: userSocial.userId, xp: userSocial.xp, level: userSocial.level }).from(userSocial)
    .where(inArray(userSocial.userId, sums.map((s) => s.user_id)))).map((r) => [r.id, r]));
  for (const s of sums) {
    const xp = xpOf(Number(s.s));
    const level = levelOf(xp);
    const old = stored.get(s.user_id);
    if (old && old.xp === xp && old.level === level) continue;
    if (!old) {
      await db.insert(userSocial).values({ userId: s.user_id, xp, level }).onConflictDoUpdate({ target: userSocial.userId, set: { xp, level } });
      continue;
    }
    // Only ever announce going up, once per level (the ref is unique)
    const up = level > old.level;
    await db.update(userSocial).set({ xp, level: Math.max(level, old.level) }).where(eq(userSocial.userId, s.user_id));
    if (up && announce) {
      await addFeed({ kind: "level_up", userId: s.user_id, level, ref: `lvl:${s.user_id}:${level}` });
      push(s.user_id, { t: "levelup", level });
    }
  }
}

/** Sends new feed items to everyone who may see them, and friends' big wins to the bell */
async function pushFeed() {
  const rows = (await db.execute(feedSelect(sql`f.id > ${Math.max(0, pushedUpTo - 50)}`, 100))).rows as Record<string, any>[];
  const fresh = rows.filter((r) => !pushedRecently.has(r.id)).reverse();
  for (const r of fresh) {
    pushedRecently.add(r.id);
    pushedUpTo = Math.max(pushedUpTo, r.id);
    const item = toFeed(r);
    const hide = await blockSet(r.user_id);
    if (r.other_id) for (const x of await blockSet(r.other_id)) hide.add(x);
    pushAll({ t: "feed", item }, (uid) => !hide.has(uid));
    if (r.kind === "big_win" || r.kind === "jackpot" || r.kind === "horse") {
      // Only events from the last hour reach friends' bells (not a backlog after a restart)
      if (Date.now() - new Date(r.created_at).getTime() < 3600_000) {
        for (const f of await friendIdsOf(r.user_id)) {
          await notify(f, "big_win", r.user_id, { kind: r.kind, game: r.game, amount: Number(r.amount), bet: Number(r.bet) }, `feed:${r.id}`);
        }
      }
    }
  }
  if (pushedRecently.size > 2000) {
    const keep = [...pushedRecently].sort((a, b) => b - a).slice(0, 500);
    pushedRecently.clear();
    for (const k of keep) pushedRecently.add(k);
  }
}

let running: Promise<void> | null = null;
/** Runs every few seconds (and directly from the tests: a call waits for one already running, then runs) */
export async function socialTick() {
  while (running) await running.catch(() => {});
  running = tickOnce().finally(() => { running = null; });
  return running;
}

async function tickOnce() {
  const now = Date.now();
  const since = new Date(lastTickAt ? lastTickAt - 30_000 : now - 7 * 86_400_000);
  lastTickAt = now;
  await scanPlays(since);
  await syncLevels(new Date(Math.max(since.getTime(), now - 3600_000)), true);
  await pushFeed();
  if (now - lastPrune > 10 * 60_000) {
    lastPrune = now;
    const cutoff = new Date(now - NOTIF_DAYS * 86_400_000);
    await db.delete(notifications).where(lt(notifications.createdAt, cutoff));
    await db.delete(feedItems).where(lt(feedItems.createdAt, cutoff));
  }
}

/** Loads the privacy sets, backfills levels and starts the tick */
export async function startSocial(httpServer: { on: (e: "close", f: () => void) => unknown }) {
  setHubHandlers({ message: onHubMessage, presence: (id) => onPresenceChange(id) });
  hiddenPresence.clear();
  for (const r of await db.select({ id: userSocial.userId }).from(userSocial).where(eq(userSocial.showPresence, false))) hiddenPresence.add(r.id);
  // Every player gets a social row now, so the first level-up of anyone is announced
  await db.execute(sql`insert into ${userSocial} (user_id) select id from ${users} on conflict do nothing`);
  await syncLevels(null, false);
  const [m] = await db.select({ id: sql<number>`coalesce(max(${feedItems.id}), 0)` }).from(feedItems);
  pushedUpTo = Number(m?.id ?? 0);
  const timer = setInterval(() => { socialTick().catch((e) => console.error("[social tick]", e)); }, 4000);
  timer.unref?.();
  httpServer.on("close", () => clearInterval(timer));
}

/** A new player: they get a social row (so their first level-up is announced) and a "joined" item */
export async function onJoined(userId: string) {
  await ensureSocial(userId);
  await addFeed({ kind: "joined", userId, ref: `join:${userId}` });
}

// ---------------- Friends ----------------

/** Removes a friendship and any requests between two players (used by unfriend and by block) */
export async function unfriend(a: string, b: string) {
  const [x, y] = pair(a, b);
  await db.delete(friendships).where(and(eq(friendships.userA, x), eq(friendships.userB, y)));
  await db.delete(friendRequests).where(or(and(eq(friendRequests.fromId, a), eq(friendRequests.toId, b)), and(eq(friendRequests.fromId, b), eq(friendRequests.toId, a))));
  await db.delete(notifications).where(or(
    and(eq(notifications.userId, a), eq(notifications.actorId, b), eq(notifications.kind, "friend_request")),
    and(eq(notifications.userId, b), eq(notifications.actorId, a), eq(notifications.kind, "friend_request"))));
  push(a, { t: "friends" }); push(b, { t: "friends" });
  void pushUnread(a); void pushUnread(b);
}

async function makeFriends(me: User, other: User) {
  const [x, y] = pair(me.id, other.id);
  const made = await db.transaction(async (tx) => {
    await tx.delete(friendRequests).where(or(and(eq(friendRequests.fromId, me.id), eq(friendRequests.toId, other.id)), and(eq(friendRequests.fromId, other.id), eq(friendRequests.toId, me.id))));
    const [f] = await tx.insert(friendships).values({ userA: x, userB: y }).onConflictDoNothing().returning();
    return f;
  });
  // The request in my bell is answered now
  await db.update(notifications).set({ readAt: new Date(), data: sql`${notifications.data} || '{"state":"accepted"}'::jsonb` })
    .where(and(eq(notifications.userId, me.id), eq(notifications.actorId, other.id), eq(notifications.kind, "friend_request")));
  if (made) {
    await notify(other.id, "friend_accepted", me.id, {});
    await addFeed({ kind: "friends", userId: me.id, otherId: other.id, ref: `fr:${x}:${y}:${made.createdAt.getTime()}` });
  }
  push(me.id, { t: "friends" }); push(other.id, { t: "friends" });
  void pushUnread(me.id);
}

async function friendsView(me: User): Promise<FriendsView> {
  const rows = (await db.execute(sql`
    select u.id, u.username, u.profile_image_url, u.last_seen_at, u.games_played, coalesce(s.level, 1) as level, f.created_at as since,
      exists (select 1 from ${friendGifts} g where g.from_id = ${me.id} and g.to_id = u.id and g.day = ${vnDay(new Date())}) as sent
    from ${friendships} f join ${users} u on u.id = case when f.user_a = ${me.id} then f.user_b else f.user_a end
    left join ${userSocial} s on s.user_id = u.id
    where (f.user_a = ${me.id} or f.user_b = ${me.id}) and not u.banned
    order by u.username`)).rows as Record<string, any>[];
  const now = Date.now();
  const facts = await factsFor(rows.map((r) => r.id as string));
  const friends: FriendView[] = rows.map((r) => {
    const online = visibleOnline(r.id, r.last_seen_at);
    const shown = online && !hiddenPresence.has(r.id);
    return {
      username: r.username, avatarUrl: r.profile_image_url ?? null, level: Number(r.level), online, club: clubTagOf(r.id), facts: facts.get(r.id),
      playing: shown ? playingNow(r.id) : null, join: shown ? joinOf(r.id) : null,
      since: new Date(r.since).toISOString(),
      gift: giftBlock({ friends: true, friendsSince: new Date(r.since).getTime(), myGames: me.gamesPlayed, theirGames: r.games_played, sentToday: r.sent, now }),
    };
  });
  // Online first, then by name
  friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  const reqs = async (dir: "in" | "out"): Promise<FriendRequestView[]> => {
    const r = (await db.execute(sql`
      select u.username, u.profile_image_url, coalesce(s.level, 1) as level, q.created_at
      from ${friendRequests} q join ${users} u on u.id = ${dir === "in" ? sql`q.from_id` : sql`q.to_id`}
      left join ${userSocial} s on s.user_id = u.id
      where ${dir === "in" ? sql`q.to_id` : sql`q.from_id`} = ${me.id} and not u.banned
      order by q.created_at desc limit 100`)).rows as Record<string, any>[];
    return r.map((x) => ({ username: x.username, avatarUrl: x.profile_image_url ?? null, level: Number(x.level), at: new Date(x.created_at).toISOString() }));
  };
  return { friends, incoming: await reqs("in"), outgoing: await reqs("out"), gift: { amount: FRIEND_GIFT_AMOUNT, minGames: FRIEND_GIFT_MIN_GAMES, maxReceived: FRIEND_GIFT_MAX_RECEIVED } };
}

const requestPace = paceLimiter(800);

// ---------------- Friend Lì Xì ----------------

export async function sendGift(me: User, to: User): Promise<{ ok: true; id: number } | { status: number; message: string }> {
  const f = await friendshipOf(me.id, to.id);
  const day = vnDay(new Date());
  const block = giftBlock({ friends: !!f, friendsSince: f ? f.createdAt.getTime() : null, myGames: me.gamesPlayed, theirGames: to.gamesPlayed, sentToday: false, now: Date.now() });
  if (block === "not_friends") return { status: 403, message: "You can only send Lì Xì to friends" };
  if (block === "games_you") return { status: 403, message: "Play 10 games before sending Lì Xì" };
  if (block === "games_them") return { status: 403, message: "Your friend needs to play 10 games first" };
  if (block === "too_new") return { status: 403, message: "You can send Lì Xì after being friends for a day" };
  const r = await db.transaction(async (tx) => {
    // Lock the receiver so two friends sending at once can't both squeeze past the daily limit
    await tx.execute(sql`select id from ${users} where id = ${to.id} for update`);
    const [{ n }] = await tx.select({ n: count() }).from(friendGifts).where(and(eq(friendGifts.toId, to.id), eq(friendGifts.day, day)));
    if (n >= FRIEND_GIFT_MAX_RECEIVED) return { status: 409, message: "Your friend has received all the Lì Xì they can today" } as const;
    const [g] = await tx.insert(friendGifts).values({ fromId: me.id, toId: to.id, day, amount: FRIEND_GIFT_AMOUNT }).onConflictDoNothing().returning();
    if (!g) return { status: 409, message: "You already sent Lì Xì to this friend today" } as const;
    return { ok: true, id: g.id } as const;
  });
  if ("ok" in r) {
    await notify(to.id, "gift", me.id, { giftId: r.id, amount: FRIEND_GIFT_AMOUNT, claimed: false }, `gift:${r.id}`);
    await questEvent(me.id, "gift", `gift:${r.id}`);
    push(me.id, { t: "friends" });
  }
  return r;
}

/** Opens a Lì Xì: the game credits the coins to the receiver (logged as a bonus, method friend_gift) */
export async function claimGift(me: User, giftId: number): Promise<{ amount: number; balance: number } | { status: number; message: string }> {
  const r = await db.transaction(async (tx) => {
    const [g] = await tx.update(friendGifts).set({ claimedAt: new Date() })
      .where(and(eq(friendGifts.id, giftId), eq(friendGifts.toId, me.id), isNull(friendGifts.claimedAt), gt(friendGifts.createdAt, new Date(Date.now() - FRIEND_GIFT_CLAIM_MS))))
      .returning();
    if (!g) return null;
    const [u] = await tx.update(users).set({ balance: sql`${users.balance} + ${g.amount}` }).where(eq(users.id, me.id)).returning({ balance: users.balance });
    await tx.insert(deposits).values({ userId: me.id, amount: g.amount, method: "friend_gift" });
    return { amount: g.amount, balance: u.balance };
  });
  if (!r) return { status: 409, message: "This Lì Xì can't be opened" };
  await db.update(notifications).set({ readAt: new Date(), data: sql`${notifications.data} || '{"claimed":true}'::jsonb` })
    .where(and(eq(notifications.userId, me.id), eq(notifications.ref, `gift:${giftId}`)));
  void pushUnread(me.id);
  return r;
}

// ---------------- Routes ----------------

const nameBody = z.object({ username: z.string().trim().min(1).max(40) });
const privacySchema = z.object({
  dmFrom: z.enum(["everyone", "friends"]).optional(),
  requestsFrom: z.enum(["everyone", "nobody"]).optional(),
  showPresence: z.boolean().optional(),
  showInFeed: z.boolean().optional(),
  hideCountry: z.boolean().optional(),
  showPhotos: z.boolean().optional(),
});
const profileSchema = z.object({
  bio: z.string().max(400).nullable().optional(),
  favGame: z.string().max(20).nullable().optional(),
  showcase: z.array(z.string().max(40)).max(SHOWCASE_MAX).optional(),
  country: z.string().max(8).nullable().optional(),
  favGames: z.array(z.string().max(20)).max(12).optional(),
  languages: z.array(z.string().max(8)).max(4).optional(),
  playStyle: z.enum(PLAY_STYLES).nullable().optional(),
});

function escapeLike(s: string) { return s.replace(/[\\%_]/g, (c) => `\\${c}`); }

export function registerFriendRoutes(app: Express, requireUser: Mw, requireAdmin: Mw) {
  const me = (res: Response) => res.locals.user as User;

  // ---- Friends ----
  app.get("/api/friends", requireUser, async (_req, res) => {
    res.json(await friendsView(me(res)));
  });

  app.get("/api/friends/search", requireUser, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2 || q.length > 24) return res.json({ players: [] });
    const u = me(res);
    const rows = (await db.execute(sql`
      select u.id, u.username, u.profile_image_url, u.last_seen_at, coalesce(s.level, 1) as level
      from ${users} u left join ${userSocial} s on s.user_id = u.id
      where lower(u.username) like ${escapeLike(q.toLowerCase()) + "%"} and not u.banned and u.id <> ${u.id}
        and u.id not in (select blocked_id from ${userBlocks} where blocker_id = ${u.id} union select blocker_id from ${userBlocks} where blocked_id = ${u.id})
      order by length(u.username), u.username limit 10`)).rows as Record<string, any>[];
    const players = [];
    for (const r of rows) {
      players.push({ username: r.username, avatarUrl: r.profile_image_url ?? null, level: Number(r.level), online: visibleOnline(r.id, r.last_seen_at), relation: await relationOf(u.id, r.id) });
    }
    res.json({ players });
  });

  app.post("/api/friends/request", requireUser, async (req, res) => {
    const parsed = nameBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const u = me(res);
    if (u.gamesPlayed < SOCIAL_MIN_GAMES && !u.isAdmin) return res.status(403).json({ message: "play_first" });
    const other = await findPlayer(parsed.data.username);
    if (!other) return res.status(404).json({ message: "Player not found" });
    if (other.id === u.id) return res.status(400).json({ message: "Not on yourself" });
    if (await blockedEither(u.id, other.id)) return res.status(403).json({ message: "Can't add this player" });
    const rel = await relationOf(u.id, other.id);
    if (rel === "friends") return res.json({ relation: "friends" });
    if (rel === "sent") return res.json({ relation: "sent" });
    if (rel === "received") { await makeFriends(u, other); return res.json({ relation: "friends" }); }
    if (privacyFrom(await socialOf(other.id)).requestsFrom === "nobody") return res.status(403).json({ message: "This player isn't taking friend requests" });
    const early = requestPace.check(u, null);
    if (early) return res.status(early.status).json({ message: early.message });
    requestPace.record(u, null);
    const [{ n: mine }] = await db.select({ n: count() }).from(friendships).where(or(eq(friendships.userA, u.id), eq(friendships.userB, u.id)));
    if (mine >= MAX_FRIENDS) return res.status(409).json({ message: "Your friends list is full" });
    const [{ n: pending }] = await db.select({ n: count() }).from(friendRequests).where(eq(friendRequests.fromId, u.id));
    if (pending >= MAX_PENDING_SENT) return res.status(409).json({ message: "Too many requests waiting for an answer" });
    const [made] = await db.insert(friendRequests).values({ fromId: u.id, toId: other.id }).onConflictDoNothing().returning();
    if (made) {
      await db.delete(notifications).where(and(eq(notifications.userId, other.id), eq(notifications.actorId, u.id), eq(notifications.kind, "friend_request")));
      await notify(other.id, "friend_request", u.id, {});
      push(other.id, { t: "friends" });
    }
    res.json({ relation: "sent" });
  });

  app.post("/api/friends/accept", requireUser, async (req, res) => {
    const parsed = nameBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const u = me(res);
    const other = await findPlayer(parsed.data.username);
    if (!other) return res.status(404).json({ message: "Player not found" });
    const [reqRow] = await db.select().from(friendRequests).where(and(eq(friendRequests.fromId, other.id), eq(friendRequests.toId, u.id)));
    if (!reqRow) return res.status(404).json({ message: "No friend request from this player" });
    if (await blockedEither(u.id, other.id)) { await unfriend(u.id, other.id); return res.status(403).json({ message: "Can't add this player" }); }
    await makeFriends(u, other);
    res.json({ relation: "friends" });
  });

  const dropRequest = (dir: "decline" | "cancel") => async (req: Request, res: Response) => {
    const parsed = nameBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const u = me(res);
    const other = await findPlayer(parsed.data.username);
    if (!other) return res.status(404).json({ message: "Player not found" });
    const [from, to] = dir === "decline" ? [other.id, u.id] : [u.id, other.id];
    await db.delete(friendRequests).where(and(eq(friendRequests.fromId, from), eq(friendRequests.toId, to)));
    if (dir === "cancel") await db.delete(notifications).where(and(eq(notifications.userId, to), eq(notifications.actorId, from), eq(notifications.kind, "friend_request")));
    else await db.update(notifications).set({ readAt: new Date(), data: sql`${notifications.data} || '{"state":"declined"}'::jsonb` })
      .where(and(eq(notifications.userId, to), eq(notifications.actorId, from), eq(notifications.kind, "friend_request")));
    push(other.id, { t: "friends" });
    void pushUnread(to);
    res.json({ relation: "none" });
  };
  app.post("/api/friends/decline", requireUser, dropRequest("decline"));
  app.post("/api/friends/cancel", requireUser, dropRequest("cancel"));

  app.post("/api/friends/remove", requireUser, async (req, res) => {
    const parsed = nameBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const other = await findPlayer(parsed.data.username);
    if (!other) return res.status(404).json({ message: "Player not found" });
    await unfriend(me(res).id, other.id);
    res.json({ relation: "none" });
  });

  // ---- Friend Lì Xì ----
  app.post("/api/friends/gift", requireUser, async (req, res) => {
    const parsed = nameBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const other = await findPlayer(parsed.data.username);
    if (!other || other.id === me(res).id) return res.status(404).json({ message: "Player not found" });
    const r = await sendGift(me(res), other);
    if ("status" in r) return res.status(r.status).json({ message: r.message });
    res.json({ ok: true, amount: FRIEND_GIFT_AMOUNT });
  });

  app.post("/api/friends/gift/:id/claim", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Bad id" });
    const r = await claimGift(me(res), id);
    if ("status" in r) return res.status(r.status).json({ message: r.message });
    res.json(r);
  });

  // ---- Notifications ----
  app.get("/api/notifications", requireUser, async (req, res) => {
    const u = me(res);
    const before = Number(req.query.before);
    const rows = await db.select().from(notifications)
      .where(Number.isInteger(before) && before > 0 ? and(eq(notifications.userId, u.id), lt(notifications.id, before)) : eq(notifications.userId, u.id))
      .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(NOTIF_PAGE + 1);
    res.json({ items: await notifViews(rows.slice(0, NOTIF_PAGE)), more: rows.length > NOTIF_PAGE, unread: await notifUnread(u.id) });
  });

  app.get("/api/notifications/unread", requireUser, async (_req, res) => {
    res.json({ total: await notifUnread(me(res).id) });
  });

  app.post("/api/notifications/read", requireUser, async (req, res) => {
    const u = me(res);
    const id = req.body?.id;
    if (req.body?.all === true) await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, u.id), isNull(notifications.readAt)));
    else if (Number.isInteger(id)) await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, u.id), eq(notifications.id, id)));
    else return res.status(400).json({ message: "Bad request" });
    void pushUnread(u.id);
    res.json({ unread: await notifUnread(u.id) });
  });

  // ---- Activity feed ----
  app.get("/api/feed", requireUser, async (req, res) => {
    res.json(await feedFor(me(res).id, { friends: req.query.scope === "friends", before: Number(req.query.before) || undefined, limit: Number(req.query.limit) || undefined }));
  });

  // ---- Friends leaderboard: this week's biggest win and coins won, me and my friends ----
  app.get("/api/leaderboard/friends", requireUser, async (_req, res) => {
    const u = me(res);
    const week = vnWeekStart(new Date());
    const rows = (await db.execute(sql`
      select u.username, u.profile_image_url, coalesce(s.level, 1) as level, u.id = ${u.id} as you,
        coalesce(max(p.payout) filter (where p.payout > p.bet), 0)::bigint as biggest,
        coalesce(sum(p.payout - p.bet) filter (where p.payout > p.bet), 0)::bigint as won
      from ${users} u
      left join ${userSocial} s on s.user_id = u.id
      left join game_plays p on p.user_id = u.id and p.created_at >= ${week}
      where (u.id = ${u.id} or u.id in ${friendIdsSql(u.id)}) and not u.banned
      group by u.id, u.username, u.profile_image_url, s.level
      order by biggest desc, won desc, u.username limit 301`)).rows as Record<string, any>[];
    res.json({
      since: week.toISOString(),
      rows: rows.map((r) => ({ username: r.username, avatarUrl: r.profile_image_url ?? null, level: Number(r.level), you: !!r.you, biggestWin: Number(r.biggest), coinsWon: Number(r.won) })),
    });
  });

  // ---- @mention autocomplete ----
  app.get("/api/players/suggest", requireUser, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q || q.length > 24) return res.json({ players: [] });
    const u = me(res);
    const rows = (await db.execute(sql`
      select u.username, u.profile_image_url
      from ${users} u
      where lower(u.username) like ${escapeLike(q.toLowerCase()) + "%"} and not u.banned and u.id <> ${u.id}
        and u.id not in (select blocked_id from ${userBlocks} where blocker_id = ${u.id} union select blocker_id from ${userBlocks} where blocked_id = ${u.id})
      order by (u.id in ${friendIdsSql(u.id)}) desc, u.last_seen_at desc nulls last limit 6`)).rows as Record<string, any>[];
    res.json({ players: rows.map((r) => ({ username: r.username, avatarUrl: r.profile_image_url ?? null })) });
  });

  // ---- My social profile and privacy ----
  app.get("/api/social/settings", requireUser, async (_req, res) => {
    const u = me(res);
    const row = await socialOf(u.id);
    res.json({
      bio: row?.bio ?? null, favGame: row?.favGame ?? null, showcase: row?.showcase ?? [],
      country: row?.country ?? null, favGames: row?.favGames ?? [], languages: row?.languages ?? [], playStyle: row?.playStyle ?? null,
      privacy: privacyFrom(row), badges: await earnedBadges(u.id), level: levelProgress(await xpFor(u.id)),
    });
  });

  app.put("/api/social/profile", requireUser, async (req, res) => {
    const u = me(res);
    const parsed = profileSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    const set: Partial<SocialRow> = {};
    if (parsed.data.bio !== undefined) {
      const no = speakerRefusal(u);
      if (no) return res.status(no.status).json({ message: no.message });
      const today = new Date().toISOString().slice(0, 10);
      const c = bioChanges.get(u.id);
      if (c && c.day === today && c.n >= BIO_CHANGES_PER_DAY && !u.isAdmin) return res.status(429).json({ message: "slow_down" });
      const raw = (parsed.data.bio ?? "").trim();
      if (!raw) set.bio = null;
      else {
        const chk = checkChat(raw, BIO_MAX);
        if (!chk.ok) return res.status(400).json({ message: chk.reason });
        set.bio = chk.text;
      }
      bioChanges.set(u.id, c && c.day === today ? { day: today, n: c.n + 1 } : { day: today, n: 1 });
      if (bioChanges.size > 20000) bioChanges.clear();
    }
    if (parsed.data.favGame !== undefined) {
      if (parsed.data.favGame !== null && !PLAYABLE_BY_ID.has(parsed.data.favGame)) return res.status(400).json({ message: "Bad request" });
      set.favGame = parsed.data.favGame;
    }
    if (parsed.data.country !== undefined) {
      if (parsed.data.country !== null && !COUNTRY_BY_CODE.has(parsed.data.country)) return res.status(400).json({ message: "Bad request" });
      set.country = parsed.data.country;
    }
    if (parsed.data.favGames !== undefined) {
      if (parsed.data.favGames.some((g) => !PLAYABLE_BY_ID.has(g))) return res.status(400).json({ message: "Bad request" });
      set.favGames = [...new Set(parsed.data.favGames)];
    }
    if (parsed.data.languages !== undefined) {
      if (parsed.data.languages.some((l) => !(PROFILE_LANGUAGES as readonly string[]).includes(l))) return res.status(400).json({ message: "Bad request" });
      set.languages = [...new Set(parsed.data.languages)];
    }
    if (parsed.data.playStyle !== undefined) set.playStyle = parsed.data.playStyle;
    if (parsed.data.showcase !== undefined) {
      const earned = new Set(await earnedBadges(u.id));
      const pick = [...new Set(parsed.data.showcase)];
      if (pick.some((b) => !earned.has(b))) return res.status(400).json({ message: "You haven't earned that badge" });
      set.showcase = pick;
    }
    await ensureSocial(u.id);
    const [row] = await db.update(userSocial).set({ ...set, updatedAt: new Date() }).where(eq(userSocial.userId, u.id)).returning();
    res.json({ bio: row.bio, favGame: row.favGame, showcase: row.showcase, country: row.country, favGames: row.favGames, languages: row.languages, playStyle: row.playStyle });
  });

  app.put("/api/social/privacy", requireUser, async (req, res) => {
    const u = me(res);
    const parsed = privacySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Bad request" });
    await ensureSocial(u.id);
    const [row] = await db.update(userSocial).set({ ...parsed.data, updatedAt: new Date() }).where(eq(userSocial.userId, u.id)).returning();
    const p = privacyFrom(row);
    const wasHidden = hiddenPresence.has(u.id);
    if (p.showPresence) hiddenPresence.delete(u.id); else hiddenPresence.add(u.id);
    // Friends see the change straight away (going hidden looks like going offline)
    if (wasHidden !== !p.showPresence) {
      const [n] = await db.select({ username: users.username }).from(users).where(eq(users.id, u.id));
      const online = !p.showPresence ? false : isConnected(u.id);
      for (const f of await friendIdsOf(u.id)) if (isConnected(f)) push(f, { t: "presence", username: n.username, online, playing: online ? playingNow(u.id) : null, join: online ? joinOf(u.id) : null });
    }
    res.json(p);
  });

  // ---- Admin: clear a reported bio ----
  app.post("/api/admin/social/bio/:userId/clear", requireAdmin, async (req, res) => {
    const id = String(req.params.userId);
    await db.update(userSocial).set({ bio: null, updatedAt: new Date() }).where(eq(userSocial.userId, id));
    await db.delete(profileReports).where(eq(profileReports.userId, id));
    res.json({ ok: true });
  });
}

/** Everything Social 2.0 keeps about a player, removed with their account (inside its transaction, before their messages go) */
export async function deleteFriendData(tx: Tx, userId: string) {
  const myChat = tx.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.userId, userId));
  const myDms = tx.select({ id: directMessages.id }).from(directMessages).where(or(eq(directMessages.fromId, userId), eq(directMessages.toId, userId)));
  await tx.delete(messageReactions).where(or(
    eq(messageReactions.userId, userId),
    and(eq(messageReactions.scope, "chat"), inArray(messageReactions.messageId, myChat)),
    and(eq(messageReactions.scope, "dm"), inArray(messageReactions.messageId, myDms))));
  await tx.delete(friendships).where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)));
  await tx.delete(friendRequests).where(or(eq(friendRequests.fromId, userId), eq(friendRequests.toId, userId)));
  await tx.delete(notifications).where(or(eq(notifications.userId, userId), eq(notifications.actorId, userId)));
  // Grouped reaction notifications that name them
  await tx.execute(sql`update ${notifications} set data = jsonb_set(data, '{actorIds}', coalesce((select jsonb_agg(x) from jsonb_array_elements(data->'actorIds') x where x <> to_jsonb(${userId}::text)), '[]'::jsonb))
    where data ? 'actorIds' and data->'actorIds' @> to_jsonb(array[${userId}::text])`);
  await tx.delete(feedItems).where(or(eq(feedItems.userId, userId), eq(feedItems.otherId, userId)));
  await tx.delete(friendGifts).where(or(eq(friendGifts.fromId, userId), eq(friendGifts.toId, userId)));
  await tx.delete(userSocial).where(eq(userSocial.userId, userId));
}

/** After an account is deleted or banned: drop its sockets and in-memory state */
export function forgetUser(userId: string) {
  disconnect(userId);
  hiddenPresence.delete(userId);
}

export { connectedUsers };
