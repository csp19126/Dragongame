/**
 * Social 3, the pure part shared by the server, the browser and the tests: game invites and
 * challenges, clubs, daily quests and Moments. No database code here.
 */
import { checkChat } from "./chat";

type Text = { vi: string; en: string; zh: string };

// ---------------- Invites and challenges ----------------

/** Games a player can invite a friend to, and the page each one lives on */
export const INVITE_GAMES = {
  pool: { route: "/pool", icon: "🎱", vi: "Bi-a", en: "Pool", zh: "撞球" },
  darts: { route: "/phi-tieu", icon: "🎯", vi: "Phi Tiêu", en: "Darts", zh: "飛鏢" },
  football: { route: "/da-bong", icon: "⚽", vi: "Sút Penalty", en: "Penalty shootout", zh: "PK 大戰" },
  cards: { route: "/ban-bai", icon: "🀄", vi: "Bàn Bài", en: "Card table", zh: "牌桌" },
} as const;
export type InviteGame = keyof typeof INVITE_GAMES;
export const INVITE_GAME_IDS = Object.keys(INVITE_GAMES) as InviteGame[];
export const isInviteGame = (g: unknown): g is InviteGame => typeof g === "string" && Object.prototype.hasOwnProperty.call(INVITE_GAMES, g);

/** Seconds between two invites from one player, invites an hour, and how soon the same player can be invited again */
export const INVITE_COOLDOWN_MS = 3_000;
export const INVITES_PER_HOUR = 30;
export const INVITE_SAME_PLAYER_MS = 15_000;
/** After this an invite is shown as old (the table has probably gone) */
export const INVITE_FRESH_MS = 30 * 60_000;

/**
 * An invite link must be a page of that game on this site: "/pool?table=AB12", "/phi-tieu", …
 * Nothing that could leave the site ("//evil", "/\\evil", "http:") and only plain URL characters.
 */
export function validInvitePath(game: InviteGame, path: unknown): path is string {
  if (typeof path !== "string" || path.length > 200 || !path.startsWith("/") || path.startsWith("//")) return false;
  if (!/^\/[A-Za-z0-9\-_/?=&%.]*$/.test(path) || path.includes("..")) return false;
  const route = INVITE_GAMES[game].route;
  const rest = path.slice(route.length);
  return path.startsWith(route) && (rest === "" || rest[0] === "?" || rest[0] === "/");
}

export interface InviteCard { kind: "invite"; game: InviteGame; path: string }

// ---------------- Clubs ----------------

export const CLUB_NAME_MIN = 3;
export const CLUB_NAME_MAX = 20;
export const CLUB_TAG_MIN = 2;
export const CLUB_TAG_MAX = 5;
export const CLUB_DESC_MAX = 120;
export const CLUB_MAX_MEMBERS = 30;
/** What starting a club costs: the coins leave the game (a sink), they go to nobody */
export const CLUB_FEE = 50_000;
/** Each member of the week's top three clubs (who played for the club that week) gets this */
export const CLUB_WEEKLY_REWARDS = [100_000, 50_000, 25_000] as const;
/** Join requests a club keeps waiting at once */
export const CLUB_MAX_REQUESTS = 50;

export const CLUB_EMBLEMS = ["🐉", "🐯", "🦁", "🦅", "🐺", "🦊", "🐼", "🐲", "🔥", "⚡", "🌙", "⭐", "🌸", "🍀", "💎", "👑", "🎱", "🎯", "⚽", "🃏", "🧧", "🏮", "🌊", "🚀"] as const;
export const CLUB_COLORS = ["#f59e0b", "#ef4444", "#ec4899", "#a855f7", "#3b82f6", "#06b6d4", "#10b981", "#84cc16"] as const;

export type ClubRole = "owner" | "officer" | "member";
export const ROLE_RANK: Record<ClubRole, number> = { owner: 3, officer: 2, member: 1 };

export interface ClubTag { id: number; tag: string; emblem: string; color: string }

/** A club name: 3–20 letters, digits, spaces and - _ ' . ; no links, numbers or swearing */
export function checkClubName(raw: unknown): { ok: true; name: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "Club name must be 3–20 characters" };
  const name = raw.replace(/\s+/g, " ").trim();
  if (Array.from(name).length < CLUB_NAME_MIN || Array.from(name).length > CLUB_NAME_MAX) return { ok: false, reason: "Club name must be 3–20 characters" };
  if (!/^[\p{L}\p{M}\p{N} _'.-]+$/u.test(name)) return { ok: false, reason: "Club name can only use letters, numbers and spaces" };
  const c = checkChat(name, CLUB_NAME_MAX);
  if (!c.ok || c.text !== name) return { ok: false, reason: "That club name isn't allowed" };
  return { ok: true, name };
}

/** The short tag shown next to members' names: 2–5 letters or digits, upper-cased */
export function checkClubTag(raw: unknown): { ok: true; tag: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "Club tag must be 2–5 letters or numbers" };
  const tag = raw.trim().toLocaleUpperCase();
  const n = Array.from(tag).length;
  if (n < CLUB_TAG_MIN || n > CLUB_TAG_MAX || !/^[\p{L}\p{M}\p{N}]+$/u.test(tag)) return { ok: false, reason: "Club tag must be 2–5 letters or numbers" };
  const c = checkChat(tag, CLUB_TAG_MAX);
  if (!c.ok || c.text !== tag) return { ok: false, reason: "That club tag isn't allowed" };
  return { ok: true, tag };
}

export type ClubAction = "kick" | "promote" | "demote" | "transfer" | "approve" | "edit" | "disband";

/**
 * Who may do what in a club. The owner does everything; officers approve join requests and
 * remove ordinary members; members can only leave. Nobody acts on themselves or on someone
 * of the same or a higher rank.
 */
export function clubAllowed(actor: ClubRole, action: ClubAction, target?: ClubRole): boolean {
  switch (action) {
    case "approve": return actor === "owner" || actor === "officer";
    case "edit":
    case "disband": return actor === "owner";
    case "kick": return !!target && ROLE_RANK[actor] > ROLE_RANK[target] && actor !== "member";
    case "promote": return actor === "owner" && target === "member";
    case "demote": return actor === "owner" && target === "officer";
    case "transfer": return actor === "owner" && !!target && target !== "owner";
  }
}

/** Weekly club score: one XP per 1,000 coins each member stakes while in the club, summed */
export const clubXp = (coinsStaked: number) => Math.floor(Math.max(0, coinsStaked) / 1_000);

// ---------------- Daily quests ----------------

/** "plays" quests are counted straight from game_plays; the others from social events */
export type QuestKind = "spins" | "plays" | "games" | "wins" | "horse_win" | "friend_match" | "chat" | "react" | "gift" | "moment" | "like";
export const PLAY_QUEST_KINDS: QuestKind[] = ["spins", "plays", "games", "wins", "horse_win"];
export type EventQuestKind = Exclude<QuestKind, "spins" | "plays" | "games" | "wins" | "horse_win">;

export interface QuestDef { id: string; kind: QuestKind; target: number; reward: number; social: boolean; icon: string; text: Text }

const q = (id: string, kind: QuestKind, target: number, reward: number, social: boolean, icon: string, text: Text): QuestDef => ({ id, kind, target, reward, social, icon, text });

/** The pool the three daily quests are drawn from ({n} is the target) */
export const QUESTS: QuestDef[] = [
  q("spins20", "spins", 20, 20_000, false, "🎰", { vi: "Quay {n} lượt slot bất kỳ", en: "Play {n} spins on any slot", zh: "在任一老虎機旋轉 {n} 次" }),
  q("plays30", "plays", 30, 15_000, false, "🎮", { vi: "Chơi {n} ván bất kỳ", en: "Play {n} rounds of anything", zh: "玩任意遊戲 {n} 局" }),
  q("games3", "games", 3, 25_000, false, "🧭", { vi: "Chơi {n} trò khác nhau", en: "Play {n} different games", zh: "玩 {n} 種不同的遊戲" }),
  q("wins5", "wins", 5, 20_000, false, "🏅", { vi: "Thắng {n} ván", en: "Win {n} rounds", zh: "贏 {n} 局" }),
  q("horse1", "horse_win", 1, 30_000, false, "🏇", { vi: "Thắng một vé cược đua ngựa", en: "Win a horse race bet", zh: "贏一次賽馬押注" }),
  q("friendmatch", "friend_match", 1, 50_000, true, "🤝", { vi: "Đấu một trận với bạn bè", en: "Play a match against a friend", zh: "和好友對戰一場" }),
  q("chat3", "chat", 3, 10_000, true, "💬", { vi: "Gửi {n} tin nhắn trò chuyện", en: "Send {n} chat messages", zh: "在聊天室發送 {n} 則訊息" }),
  q("react5", "react", 5, 10_000, true, "❤️", { vi: "Thả cảm xúc vào {n} tin nhắn", en: "React to {n} messages", zh: "對 {n} 則訊息按表情" }),
  q("gift1", "gift", 1, 20_000, true, "🧧", { vi: "Gửi Lì Xì cho một người bạn", en: "Send a friend a Lì Xì", zh: "送好友一個紅包" }),
  q("moment1", "moment", 1, 15_000, true, "📸", { vi: "Đăng một Khoảnh khắc", en: "Post a Moment", zh: "發布一則動態" }),
  q("like3", "like", 3, 10_000, true, "💖", { vi: "Thích {n} Khoảnh khắc", en: "Like {n} Moments", zh: "按讚 {n} 則動態" }),
];
export const QUEST_BY_ID = new Map(QUESTS.map((x) => [x.id, x]));
export const QUESTS_PER_DAY = 3;
/** The chest for finishing all three, and the bonus for doing it seven days in a row */
export const QUEST_CHEST = 50_000;
export const QUEST_STREAK_DAYS = 7;
export const QUEST_STREAK_BONUS = 250_000;

/** Fills in a quest's {n} */
export const questText = (d: QuestDef, t: Text): Text => ({ vi: t.vi.replace("{n}", String(d.target)), en: t.en.replace("{n}", String(d.target)), zh: t.zh.replace("{n}", String(d.target)) });

/** Three different quests, at least one of them social. `rand(n)` returns 0..n-1 (crypto on the server). */
export function drawQuests(rand: (n: number) => number): QuestDef[] {
  const social = QUESTS.filter((x) => x.social);
  const first = social[rand(social.length)];
  const rest = QUESTS.filter((x) => x !== first);
  const out = [first];
  while (out.length < QUESTS_PER_DAY) {
    const pick = rest.splice(rand(rest.length), 1)[0];
    // Never two quests of the same kind
    if (!out.some((o) => o.kind === pick.kind)) out.push(pick);
  }
  // A random order, so the social one isn't always first
  for (let i = out.length - 1; i > 0; i--) { const j = rand(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Days in a row ending today (YYYY-MM-DD strings, any order) */
export function streakOf(days: string[], today: string): number {
  const set = new Set(days);
  let n = 0;
  let d = new Date(`${today}T00:00:00Z`);
  while (set.has(d.toISOString().slice(0, 10))) { n++; d = new Date(d.getTime() - 86_400_000); }
  return n;
}

// ---------------- Moments ----------------

export const MOMENT_MAX_LEN = 200;
export const MOMENT_COMMENT_MAX = 200;
export const MOMENTS_PER_DAY = 10;
export const MOMENT_COOLDOWN_MS = 20_000;
export const MOMENT_COMMENT_COOLDOWN_MS = 4_000;
export const MOMENT_PAGE = 15;
/** A win can be attached to a Moment for this long after it happened */
export const WIN_CARD_DAYS = 7;

/** A play worth showing off: ×5 or more with at least 10,000 profit, or 200,000 profit at any multiple */
export function isBragWorthy(bet: number, payout: number): boolean {
  const profit = payout - bet;
  if (profit <= 0) return false;
  return (bet > 0 && payout >= 5 * bet && profit >= 10_000) || profit >= 200_000;
}

export interface WinCard { playId: number; game: string; bet: number; payout: number; at: string }
export interface MomentAuthor { username: string; avatarUrl: string | null; level: number; club: ClubTag | null }
export interface MomentView {
  id: number;
  author: MomentAuthor;
  text: string | null;
  sticker: string | null;
  win: WinCard | null;
  likes: number;
  liked: boolean;
  comments: number;
  mine: boolean;
  at: string;
}
export interface MomentComment { id: number; author: MomentAuthor; text: string; mine: boolean; at: string }
