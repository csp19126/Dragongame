/**
 * The rules every player message goes through, for the public chat and private messages:
 * who may talk (played a few games, not muted), how fast (a cooldown and no repeats), and
 * what (links, phone numbers and coin trading blocked, swearing masked: shared/chat.ts).
 */
import { and, eq, gt } from "drizzle-orm";
import { db } from "./db";
import { userStickers, type User } from "@shared/schema";
import { checkChat, CHAT_MIN_GAMES } from "@shared/chat";

export type Refusal = { status: number; message: string; until?: Date };

/** Muted players and brand-new accounts can't post (admins always can) */
export function speakerRefusal(u: User): Refusal | null {
  if (u.mutedUntil && u.mutedUntil.getTime() > Date.now()) return { status: 403, message: "muted", until: u.mutedUntil };
  if (u.gamesPlayed < CHAT_MIN_GAMES && !u.isAdmin) return { status: 403, message: "play_first" };
  return null;
}

/** Per-player pace limit, held in memory (one server; it resets on a redeploy, which is harmless) */
export function paceLimiter(cooldownMs: number) {
  const last = new Map<string, { at: number; text: string }>();
  return {
    /** "slow_down" if too soon, "repeat" if the same text again within a minute */
    check(u: User, text: string | null, now = Date.now()): Refusal | null {
      if (u.isAdmin) return null;
      const l = last.get(u.id);
      if (l && now - l.at < cooldownMs) return { status: 429, message: "slow_down" };
      if (l && text && l.text === text && now - l.at < 60_000) return { status: 429, message: "repeat" };
      return null;
    },
    record(u: User, text: string | null, now = Date.now()) {
      last.set(u.id, { at: now, text: text ?? "" });
      if (last.size > 5000) last.clear();
    },
  };
}

export async function ownsSticker(userId: string, stickerId: string) {
  const [own] = await db.select({ n: userStickers.count }).from(userStickers)
    .where(and(eq(userStickers.userId, userId), eq(userStickers.stickerId, stickerId), gt(userStickers.count, 0)));
  return !!own;
}

/**
 * Reads { text } or { sticker } from a request body and checks it.
 * Returns the cleaned message or why it was refused.
 */
export async function readMessage(u: User, body: unknown, maxLen?: number): Promise<{ text: string | null; sticker: string | null } | Refusal> {
  const b = (body ?? {}) as { text?: unknown; sticker?: unknown };
  if (typeof b.sticker === "string") {
    if (!(await ownsSticker(u.id, b.sticker))) return { status: 400, message: "not_owned" };
    return { text: null, sticker: b.sticker };
  }
  const c = checkChat(String(b.text ?? ""), maxLen);
  if (!c.ok) return { status: 400, message: c.reason };
  return { text: c.text, sticker: null };
}
