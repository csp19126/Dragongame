/**
 * Social 3, the pure part shared by the server, the browser and the tests: game invites and
 * challenges, clubs, daily quests and Moments. No database code here.
 */

type Text = { vi: string; en: string; zh: string };

// ---------------- Invites and challenges ----------------

/** Games a player can invite a friend to, and the page each one lives on */
export const INVITE_GAMES = {
  pool: { route: "/pool", icon: "🎱", vi: "Bi-a", en: "Pool", zh: "撞球" },
  darts: { route: "/phi-tieu", icon: "🎯", vi: "Phi Tiêu", en: "Darts", zh: "飛鏢" },
  football: { route: "/da-bong", icon: "⚽", vi: "Sút Phạt Đền", en: "Penalty shootout", zh: "點球大戰" },
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

/** A club name: 3–20 letters, digits, spaces and - _ ' . (no content filter: owner policy) */
export function checkClubName(raw: unknown): { ok: true; name: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "Club name must be 3–20 characters" };
  const name = raw.replace(/\s+/g, " ").trim();
  if (Array.from(name).length < CLUB_NAME_MIN || Array.from(name).length > CLUB_NAME_MAX) return { ok: false, reason: "Club name must be 3–20 characters" };
  if (!/^[\p{L}\p{M}\p{N} _'.-]+$/u.test(name)) return { ok: false, reason: "Club name can only use letters, numbers and spaces" };
  return { ok: true, name };
}

/** The short tag shown next to members' names: 2–5 letters or digits, upper-cased */
export function checkClubTag(raw: unknown): { ok: true; tag: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "Club tag must be 2–5 letters or numbers" };
  const tag = raw.trim().toLocaleUpperCase();
  const n = Array.from(tag).length;
  if (n < CLUB_TAG_MIN || n > CLUB_TAG_MAX || !/^[\p{L}\p{M}\p{N}]+$/u.test(tag)) return { ok: false, reason: "Club tag must be 2–5 letters or numbers" };
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
export type QuestKind = "spins" | "plays" | "games" | "wins" | "horse_win" | "friend_match" | "chat" | "react" | "gift" | "talk";
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
  q("talk1", "talk", 1, 15_000, true, "🗣️", { vi: "Viết hoặc trả lời một chủ đề ở mục Trò chuyện", en: "Start or reply to a Talk thread", zh: "在「聊天」發文或回覆" }),
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

// ---------------- Talk: topic boards ----------------

export const TALK_BOARDS = [
  { id: "intro", icon: "👋", vi: "Giới thiệu bản thân", en: "Introduce yourself", zh: "自我介紹" },
  { id: "lfg", icon: "🤝", vi: "Tìm người chơi", en: "Looking for a game", zh: "找人一起玩" },
  { id: "pool", icon: "🎱", vi: "Bi-a", en: "Pool", zh: "撞球" },
  { id: "darts", icon: "🎯", vi: "Phi tiêu & Đá phạt", en: "Darts & penalties", zh: "飛鏢與 PK" },
  { id: "cards", icon: "🃏", vi: "Bài & Slot", en: "Cards & slots", zh: "牌類與老虎機" },
  { id: "abroad", icon: "✈️", vi: "Người Việt xa quê", en: "Vietnamese abroad", zh: "海外越南人" },
  { id: "zh", icon: "🀄", vi: "中文", en: "中文", zh: "中文" },
  { id: "misc", icon: "☕", vi: "Chuyện phiếm", en: "Anything goes", zh: "閒聊" },
] as const;
export type TalkBoard = (typeof TALK_BOARDS)[number]["id"];
export const isTalkBoard = (b: unknown): b is TalkBoard => TALK_BOARDS.some((x) => x.id === b);
export const TALK_TITLE_MAX = 100;
export const TALK_BODY_MAX = 2000;
export const TALK_REPLY_MAX = 1000;
export const TALK_PAGE = 20;
export const TALK_REPLY_PAGE = 30;
/** Seconds between two new threads, and between two replies, from one player */
export const TALK_THREAD_COOLDOWN_MS = 30_000;
export const TALK_REPLY_COOLDOWN_MS = 4_000;
export const TALK_THREADS_PER_DAY = 20;

export interface TalkAuthor { username: string; avatarUrl: string | null; level: number; club: ClubTag | null }
export interface TalkThreadView {
  id: number; board: TalkBoard; title: string; body: string; photo: number | null; author: TalkAuthor;
  replies: number; thumbs: number; thumbed: boolean; lastAt: string; at: string; mine: boolean; friend: boolean;
}
export interface TalkReplyView { id: number; text: string | null; photo: number | null; author: TalkAuthor; at: string; mine: boolean; friend: boolean }

// ---------------- Lounge rooms (the public chat) ----------------

export const LOUNGE_ROOMS = [
  { id: "main", icon: "🏮", vi: "Sảnh chung", en: "Main lounge", zh: "大廳" },
  { id: "eu", icon: "🇪🇺", vi: "UK & Châu Âu", en: "UK & Europe", zh: "英國與歐洲" },
  { id: "us", icon: "🇺🇸", vi: "Mỹ & Canada", en: "USA & Canada", zh: "美國與加拿大" },
  { id: "au", icon: "🇦🇺", vi: "Úc", en: "Australia", zh: "澳洲" },
  { id: "zh", icon: "🀄", vi: "中文", en: "中文", zh: "中文" },
] as const;
export type LoungeRoom = (typeof LOUNGE_ROOMS)[number]["id"];
export const loungeRoom = (r: unknown): LoungeRoom => (LOUNGE_ROOMS.some((x) => x.id === r) ? (r as LoungeRoom) : "main");

// ---------------- Find a match ----------------

export const MATCH_MINUTES = [15, 30, 60] as const;
export const MATCH_STAKES = [0, 1_000, 10_000, 50_000, 100_000, 500_000] as const;
export const MATCH_NOTE_MAX = 80;
export interface MatchPostView {
  id: number; game: InviteGame; stake: number; note: string | null; expiresAt: string; at: string; mine: boolean;
  author: TalkAuthor & { online: boolean; languages: string[]; country: string | null; playStyle: string | null };
}

// ---------------- Richer profiles ----------------

export const PROFILE_LANGUAGES = ["vi", "en", "zh", "other"] as const;
export const PLAY_STYLES = ["casual", "competitive"] as const;
/** Countries Vietnamese players commonly live in, first; any ISO code from the list is accepted */
export const COUNTRIES: { code: string; flag: string; vi: string; en: string; zh: string }[] = [
  { code: "VN", flag: "🇻🇳", vi: "Việt Nam", en: "Vietnam", zh: "越南" },
  { code: "GB", flag: "🇬🇧", vi: "Anh", en: "United Kingdom", zh: "英國" },
  { code: "US", flag: "🇺🇸", vi: "Mỹ", en: "United States", zh: "美國" },
  { code: "CA", flag: "🇨🇦", vi: "Canada", en: "Canada", zh: "加拿大" },
  { code: "AU", flag: "🇦🇺", vi: "Úc", en: "Australia", zh: "澳洲" },
  { code: "DE", flag: "🇩🇪", vi: "Đức", en: "Germany", zh: "德國" },
  { code: "FR", flag: "🇫🇷", vi: "Pháp", en: "France", zh: "法國" },
  { code: "CZ", flag: "🇨🇿", vi: "Séc", en: "Czechia", zh: "捷克" },
  { code: "PL", flag: "🇵🇱", vi: "Ba Lan", en: "Poland", zh: "波蘭" },
  { code: "NL", flag: "🇳🇱", vi: "Hà Lan", en: "Netherlands", zh: "荷蘭" },
  { code: "JP", flag: "🇯🇵", vi: "Nhật Bản", en: "Japan", zh: "日本" },
  { code: "KR", flag: "🇰🇷", vi: "Hàn Quốc", en: "South Korea", zh: "韓國" },
  { code: "TW", flag: "🇹🇼", vi: "Đài Loan", en: "Taiwan", zh: "台灣" },
  { code: "HK", flag: "🇭🇰", vi: "Hồng Kông", en: "Hong Kong", zh: "香港" },
  { code: "CN", flag: "🇨🇳", vi: "Trung Quốc", en: "China", zh: "中國" },
  { code: "SG", flag: "🇸🇬", vi: "Singapore", en: "Singapore", zh: "新加坡" },
  { code: "MY", flag: "🇲🇾", vi: "Malaysia", en: "Malaysia", zh: "馬來西亞" },
  { code: "TH", flag: "🇹🇭", vi: "Thái Lan", en: "Thailand", zh: "泰國" },
  { code: "NZ", flag: "🇳🇿", vi: "New Zealand", en: "New Zealand", zh: "紐西蘭" },
  { code: "OTHER", flag: "🌏", vi: "Nơi khác", en: "Somewhere else", zh: "其他地區" },
];
export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** The "find people to play with" facts shown in lists (Online now, friends, match posts) */
export interface PlayerFacts { country: string | null; languages: string[]; playStyle: string | null; favGames: string[] }

// ---------------- Photos in messages ----------------

/** After the phone shrinks it: the most a photo may weigh, how many a player may send an hour and keep */
export const PHOTO_MAX_BYTES = 600_000;
export const PHOTOS_PER_HOUR = 20;
export const PHOTOS_KEPT = 300;
export type PhotoScope = "dm" | "club" | "lounge" | "talk";
