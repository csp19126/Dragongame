/**
 * Social features shared by the server and the browser: profile photos, player profiles
 * and private messages. Pure code only (no database), so the tests can import it.
 */
import { CHAT_MIN_GAMES } from "./chat";

/** Same gate as the public chat: new accounts must play a few games first (keeps spam bots out) */
export const SOCIAL_MIN_GAMES = CHAT_MIN_GAMES;

/** Profile photos: the browser crops to a square and resizes to this many pixels before upload */
export const AVATAR_PX = 256;
/** Largest photo the server keeps, in bytes */
export const AVATAR_MAX_BYTES = 150 * 1024;
/** Photo uploads and removals a player can make in a day */
export const AVATAR_CHANGES_PER_DAY = 10;

/** Private messages */
export const DM_MAX_LEN = 500;
/** Seconds between two private messages from the same player */
export const DM_COOLDOWN_MS = 1500;
/** Shown in the conversation list and thread, newest last */
export const DM_PAGE = 50;

/** A player counts as online when seen this recently */
export const ONLINE_MS = 2 * 60_000;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

/** Works out what an image really is from its first bytes (never trusts a name or a header) */
export function sniffImage(b: Uint8Array): ImageMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Only our own avatar URLs are ever put in an <img> */
export function safeAvatarUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && /^\/api\/avatar\/[0-9a-f]{32}$/.test(url) ? url : null;
}

/** A stable colour for a player without a photo, from their name */
export function nameHue(name: string): number {
  let h = 7;
  for (const c of name) h = (h * 31 + c.codePointAt(0)!) % 360;
  return h;
}

/** The letter shown in a player's circle when they have no photo */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0] ?? "?";
  return first.toLocaleUpperCase();
}

export interface PlayerProfile {
  username: string;
  avatarUrl: string | null;
  online: boolean;
  memberSince: string | null;
  gamesPlayed: number;
  biggestWin: number;
  /** This month's pool league tier, when they have played league games */
  league: { tier: string; icon: string; vi: string; en: string; zh: string; points: number } | null;
  stickers: number;
  admin: boolean;
  /** It's the viewer's own profile */
  you: boolean;
  /** The viewer has blocked this player */
  blockedByYou: boolean;
}

export interface DmPeer { username: string; avatarUrl: string | null; online: boolean }

export interface DmConversation extends DmPeer {
  last: { text: string | null; sticker: string | null; mine: boolean; at: string };
  unread: number;
}

export interface DmMessage {
  id: number;
  mine: boolean;
  text: string | null;
  sticker: string | null;
  createdAt: string;
  read: boolean;
}

export interface DmThread {
  peer: DmPeer;
  messages: DmMessage[];
  /** Older messages exist (load with ?before=<first id>) */
  more: boolean;
  /** Either player has blocked the other: nothing can be sent */
  cantMessage: boolean;
  blockedByYou: boolean;
}
