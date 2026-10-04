/**
 * Community chat rules, shared so the browser can warn before sending and the server
 * enforces the same thing. Coins are play money: any talk of buying or selling them,
 * links and phone numbers are blocked (that is how scams and real-money trading start).
 * Swear words are masked rather than blocked.
 */

export const CHAT_MAX_LEN = 200;
/** Seconds between two messages from the same player */
export const CHAT_COOLDOWN_MS = 3000;
/** Games a new account must play before it can chat (keeps spam bots out) */
export const CHAT_MIN_GAMES = 3;
/** Reports from different players that hide a message until an admin looks */
export const CHAT_AUTO_HIDE_REPORTS = 3;

/** Lower case, accents stripped, so "NẠP TIỀN" and "nap tien" both match */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

// Real-money trading and contact-swapping (accent-free, matched on word boundaries)
const BLOCKED = [
  "nap tien", "rut tien", "ban xu", "mua xu", "ban coin", "mua coin", "doi xu", "doi tien", "chuyen khoan",
  "so tai khoan", "stk", "momo", "zalopay", "zalo", "telegram", "tele", "viettelpay", "banking", "ngan hang",
  "the cao", "card dien thoai", "sell coins", "buy coins", "sell coin", "buy coin", "cash out", "cashout",
  "paypal", "venmo", "whatsapp", "real money", "tien that",
];

// Swearing, masked with stars. Compared with accents kept: folded, "lồn" would also hit
// "lớn" (big) and "cặc" would hit "các" (the), so only spellings that can't be innocent are listed.
const SWEARS = new Set([
  "địt", "đụ", "đéo", "lồn", "cặc", "buồi", "đĩ", "đm", "đmm", "đcm", "dm", "dmm", "dcm", "vcl", "vkl",
  "vl", "clm", "cmm", "fuck", "fucking", "fucker", "shit", "cunt", "bitch", "dick", "pussy", "bastard",
  "motherfucker", "wanker", "twat",
]);

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|vn|io|me|xyz|top|app|online|link|ly|gg|co)\b)/i;
const PHONE_RE = /(\d[\s.-]?){8,}/;

export type ChatCheck = { ok: true; text: string } | { ok: false; reason: "empty" | "long" | "link" | "phone" | "trade" };

/** Checks a message and returns it cleaned (whitespace tidied, swearing masked) */
export function checkChat(raw: string): ChatCheck {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > CHAT_MAX_LEN) return { ok: false, reason: "long" };
  if (URL_RE.test(text)) return { ok: false, reason: "link" };
  if (PHONE_RE.test(text)) return { ok: false, reason: "phone" };
  const f = ` ${fold(text).replace(/[^a-z0-9]+/g, " ")} `;
  if (BLOCKED.some((w) => f.includes(` ${w} `))) return { ok: false, reason: "trade" };
  // Mask swear words word by word, keeping the original spelling of everything else
  const masked = text.replace(/[\p{L}\p{N}]+/gu, (w) => (SWEARS.has(w.toLowerCase()) ? "*".repeat(w.length) : w));
  return { ok: true, text: masked };
}
