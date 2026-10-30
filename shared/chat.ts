/**
 * Community chat rules, shared so the browser and the server agree. The owner's policy is no
 * content filtering and no monitoring: a message is only tidied (spaces) and length-checked.
 * Spam is handled by rate limits (server/speech.ts), abuse by block, report and the admin queue.
 */

export const CHAT_MAX_LEN = 200;
/** Seconds between two messages from the same player */
export const CHAT_COOLDOWN_MS = 3000;
/** Games a new account must play before it can chat (keeps spam bots out) */
export const CHAT_MIN_GAMES = 3;
/** Reports from different players that hide a message until an admin looks */
export const CHAT_AUTO_HIDE_REPORTS = 3;

export type ChatCheck = { ok: true; text: string } | { ok: false; reason: "empty" | "long" };

/** Tidies a message (runs of spaces, ends) and checks it isn't empty or too long. Nothing else. */
export function checkChat(raw: string, maxLen = CHAT_MAX_LEN): ChatCheck {
  const text = raw.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (Array.from(text).length > maxLen) return { ok: false, reason: "long" };
  return { ok: true, text };
}
