/**
 * Social 2.0, the pure part shared by the server, the browser and the tests: friends, levels,
 * reactions, @mentions, the activity feed, notifications and the daily friend Lì Xì.
 * No database code here.
 */

// ---------------- Friends ----------------

/** Most friends (and pending requests sent) one player can have */
export const MAX_FRIENDS = 300;
export const MAX_PENDING_SENT = 50;

export type Relation = "none" | "friends" | "sent" | "received";

// ---------------- Daily friend Lì Xì ----------------

/**
 * Once a (Vietnam) day a player may send each friend one free Lì Xì. The coins are made by the
 * game, like the daily gift: the sender pays nothing and loses nothing, so it can never be used
 * to move coins from one account to another.
 */
export const FRIEND_GIFT_AMOUNT = 5_000;
/** Both players must have played this many games */
export const FRIEND_GIFT_MIN_GAMES = 10;
/** And been friends this long */
export const FRIEND_GIFT_MIN_FRIEND_MS = 24 * 3600_000;
/** Most Lì Xì one player can receive in a day (more are politely refused) */
export const FRIEND_GIFT_MAX_RECEIVED = 10;
/** An unclaimed Lì Xì can be opened for this long */
export const FRIEND_GIFT_CLAIM_MS = 7 * 86_400_000;

export type GiftBlock = "games_you" | "games_them" | "too_new" | "sent_today" | "not_friends";

/** Why a gift can't be sent yet (or null if it can), from what the server knows */
export function giftBlock(o: { friends: boolean; friendsSince: number | null; myGames: number; theirGames: number; sentToday: boolean; now: number }): GiftBlock | null {
  if (!o.friends || o.friendsSince === null) return "not_friends";
  if (o.sentToday) return "sent_today";
  if (o.myGames < FRIEND_GIFT_MIN_GAMES) return "games_you";
  if (o.theirGames < FRIEND_GIFT_MIN_GAMES) return "games_them";
  if (o.now - o.friendsSince < FRIEND_GIFT_MIN_FRIEND_MS) return "too_new";
  return null;
}

// ---------------- Levels ----------------

/**
 * Level from experience. One XP for every 1,000 coins staked (game_plays.bet), so playing at
 * any size counts and bigger stakes count more. Level n needs 50·(n−1)² XP: level 2 after
 * 50,000 coins staked, level 10 after 4.05M, level 50 after 120M. Capped at MAX_LEVEL.
 */
export const COINS_PER_XP = 1_000;
export const XP_STEP = 50;
export const MAX_LEVEL = 99;

export const xpOf = (coinsWagered: number) => Math.floor(Math.max(0, coinsWagered) / COINS_PER_XP);
/** XP needed to reach a level */
export const xpForLevel = (level: number) => XP_STEP * (Math.max(1, level) - 1) ** 2;
export function levelOf(xp: number): number {
  let l = Math.floor(Math.sqrt(Math.max(0, xp) / XP_STEP)) + 1;
  // Guard against floating point at the boundaries
  while (l > 1 && xpForLevel(l) > xp) l--;
  while (l < MAX_LEVEL && xpForLevel(l + 1) <= xp) l++;
  return Math.min(MAX_LEVEL, l);
}
/** Progress through the current level, 0..1 */
export function levelProgress(xp: number) {
  const l = levelOf(xp);
  if (l >= MAX_LEVEL) return { level: l, xp, from: xpForLevel(l), to: xpForLevel(l), progress: 1 };
  const from = xpForLevel(l), to = xpForLevel(l + 1);
  return { level: l, xp, from, to, progress: (xp - from) / (to - from) };
}

// ---------------- Profiles ----------------

export const BIO_MAX = 80;
export const SHOWCASE_MAX = 3;

export type DmFrom = "everyone" | "friends";
export type RequestsFrom = "everyone" | "nobody";

export interface PrivacySettings {
  /** Who can send me private messages */
  dmFrom: DmFrom;
  /** Who can send me friend requests */
  requestsFrom: RequestsFrom;
  /** Show whether I'm online and what I'm playing */
  showPresence: boolean;
  /** Show my wins, level-ups and friendships in the activity feed */
  showInFeed: boolean;
}
export const DEFAULT_PRIVACY: PrivacySettings = { dmFrom: "everyone", requestsFrom: "everyone", showPresence: true, showInFeed: true };

// ---------------- What a player is playing ----------------

/** The games a player can be "playing", by the page they're on (also the favourite-game choices) */
export const PLAYABLE: { id: string; route: string; icon: string; vi: string; en: string; zh: string }[] = [
  { id: "slot", route: "/slot", icon: "🐉", vi: "Slot Rồng Vàng", en: "Dragon slot", zh: "神龍老虎機" },
  { id: "slot777", route: "/slot-777", icon: "7️⃣", vi: "Slot 777", en: "Classic 777", zh: "經典777" },
  { id: "pool", route: "/pool", icon: "🎱", vi: "Bi-a", en: "Pool", zh: "撞球" },
  { id: "cards", route: "/ban-bai", icon: "🀄", vi: "Xì Dách Online", en: "Live Xì Dách", zh: "線上 21點" },
  { id: "blackjack", route: "/blackjack", icon: "🃏", vi: "Xì Dách", en: "Blackjack", zh: "21點" },
  { id: "loto", route: "/loto", icon: "🎟️", vi: "Lô Tô", en: "Lô Tô", zh: "賓果" },
  { id: "horse", route: "/dua-ngua", icon: "🏇", vi: "Đua Ngựa", en: "Horse racing", zh: "賽馬" },
  { id: "tienlen", route: "/tien-len", icon: "🂡", vi: "Tiến Lên", en: "Tiến Lên", zh: "大老二" },
  { id: "banca", route: "/ban-ca", icon: "🐟", vi: "Bắn Cá", en: "Fish hunter", zh: "捕魚" },
  { id: "roulette", route: "/roulette", icon: "🎡", vi: "Roulette", en: "Roulette", zh: "輪盤" },
  { id: "baucua", route: "/bau-cua", icon: "🦀", vi: "Bầu Cua", en: "Bầu Cua", zh: "魚蝦蟹" },
];
export const PLAYABLE_BY_ID = new Map(PLAYABLE.map((g) => [g.id, g]));

/** The game a page belongs to (only known pages; anything else is "not playing") */
export function gameOfRoute(route: unknown): string | null {
  if (typeof route !== "string") return null;
  const path = route.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path === "/tournament") return "pool";
  return PLAYABLE.find((g) => path === g.route || path.startsWith(g.route + "/"))?.id ?? null;
}

/** The game names in the admin's numbers (game_plays.game) mapped to what players see */
export const PLAY_GAME_TO_PLAYABLE: Record<string, string> = {
  slot: "slot", xocdia: "slot", slot777: "slot777", pool: "pool", bj_table: "cards", xidach: "cards", blackjack: "blackjack",
  loto: "loto", horse: "horse", tienlen: "tienlen", banca: "banca", roulette: "roulette", baucua: "baucua",
};

// ---------------- Reactions ----------------

export const REACTIONS = ["❤️", "😂", "😮", "👍", "🔥", "🧧"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const isReaction = (e: unknown): e is Reaction => typeof e === "string" && (REACTIONS as readonly string[]).includes(e);
export interface ReactionCount { e: string; n: number; mine: boolean }
/** Reactions a player can add or remove in a minute */
export const REACTIONS_PER_MINUTE = 40;

// ---------------- Mentions ----------------

/** @names a message mentions at most */
export const MAX_MENTIONS = 5;

/**
 * The names a message mentions: "@word" tokens, plus names the composer picked from the
 * autocomplete (they may contain spaces) that really appear as "@name" in the text.
 * Lower-cased and unique; the server then keeps only real players.
 */
export function findMentions(text: string, picked: unknown = []): string[] {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  if (Array.isArray(picked)) {
    for (const p of picked.slice(0, MAX_MENTIONS * 2)) {
      if (typeof p !== "string" || p.length < 3 || p.length > 24) continue;
      const at = lower.indexOf(`@${p.toLowerCase()}`);
      if (at < 0) continue;
      const after = lower[at + 1 + p.length];
      if (after === undefined || !/[\p{L}\p{N}_]/u.test(after)) out.add(p.toLowerCase());
    }
  }
  for (const m of text.matchAll(/(?:^|[^\p{L}\p{N}_@])@([\p{L}\p{N}_.-]{3,24})/gu)) out.add(m[1].replace(/[.-]+$/, "").toLowerCase());
  return [...out].filter((n) => n.length >= 3).slice(0, MAX_MENTIONS);
}

// ---------------- Replies ----------------

export interface ReplyRef { id: number; username: string | null; text: string | null; sticker: string | null; mine?: boolean }
/** How much of the quoted message is shown */
export const QUOTE_LEN = 80;
export const quote = (text: string | null) => (text && text.length > QUOTE_LEN ? `${text.slice(0, QUOTE_LEN - 1)}…` : text);

// ---------------- Activity feed ----------------

export type FeedKind = "big_win" | "jackpot" | "horse" | "joined" | "level_up" | "friends";
export const FEED_PAGE = 20;
/** A big win: at least ×50 the stake, or at least a million coins of profit */
export const BIG_WIN_MULTIPLE = 50;
export const BIG_WIN_PROFIT = 1_000_000;
/** Horse races are announced for smaller wins: ×10 or more, and at least 100,000 coins profit */
export const HORSE_WIN_MULTIPLE = 10;
export const HORSE_WIN_PROFIT = 100_000;

/** Whether a play is worth announcing in the feed, and how */
export function feedKindOfPlay(game: string, bet: number, payout: number): "big_win" | "horse" | null {
  const profit = payout - bet;
  if (profit <= 0) return null;
  if (game === "horse") return bet > 0 && payout >= HORSE_WIN_MULTIPLE * bet && profit >= HORSE_WIN_PROFIT ? "horse" : null;
  if (bet > 0 && payout >= BIG_WIN_MULTIPLE * bet) return "big_win";
  return profit >= BIG_WIN_PROFIT ? "big_win" : null;
}

export interface FeedPlayer { username: string; avatarUrl: string | null; level: number }
export interface FeedItem {
  id: number;
  kind: FeedKind;
  user: FeedPlayer;
  other: FeedPlayer | null;
  game: string | null;
  amount: number | null;
  bet: number | null;
  level: number | null;
  at: string;
}

// ---------------- Notifications ----------------

export type NotifKind = "friend_request" | "friend_accepted" | "mention" | "reply" | "reaction" | "gift" | "big_win"
  // Social 3: a game invite/challenge, a finished daily quest, club news, likes and comments on a Moment
  | "invite" | "quest" | "club" | "moment";
/** Kept per player, and for how long */
export const NOTIF_KEEP = 200;
export const NOTIF_DAYS = 30;
export const NOTIF_PAGE = 30;

export interface NotificationView {
  id: number;
  kind: NotifKind;
  actor: { username: string; avatarUrl: string | null } | null;
  data: Record<string, any>;
  read: boolean;
  at: string;
}

// ---------------- Friends ----------------

export interface FriendView {
  username: string;
  avatarUrl: string | null;
  level: number;
  online: boolean;
  /** The game they're on now (only if they share it) */
  playing: string | null;
  /** A table with a free seat they're sitting at */
  join: { kind: "cards" | "pool"; href: string } | null;
  since: string;
  /** Why a Lì Xì can't be sent today, or null when it can */
  gift: GiftBlock | null;
  /** Their club's tag (Social 3) */
  club?: { id: number; tag: string; emblem: string; color: string } | null;
}
export interface FriendRequestView { username: string; avatarUrl: string | null; level: number; at: string }
export interface FriendsView {
  friends: FriendView[];
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
  gift: { amount: number; minGames: number; maxReceived: number };
}

/** Typing indicator: how long "typing…" shows after the last key, and the fastest it's sent */
export const TYPING_SHOW_MS = 4_000;
export const TYPING_EVERY_MS = 2_000;

/** The Monday (Vietnam time) that starts the week of `at`, as a UTC Date */
export function vnWeekStart(at: Date): Date {
  const VN = 7 * 3600_000;
  const local = new Date(at.getTime() + VN);
  const day = (local.getUTCDay() + 6) % 7; // Monday = 0
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - day * 86_400_000;
  return new Date(midnight - VN);
}
