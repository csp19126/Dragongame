/**
 * Lô Tô: Vietnamese bingo, called live for everyone at once.
 *
 * A ticket (tờ dò) is the real thing: 9 rows by 9 columns, 5 numbers in every row and every
 * column, numbers 1-90 with column c holding c*10..c*10+9 (column 0 is 1-9, column 8 is 80-90).
 * A round sells tickets, then calls 50 numbers. A ticket's prize depends on how early its
 * first row is complete ("Kinh!"): the sooner, the bigger. Every ticket is paid on its own
 * against the same calls, so playing alone is as good as playing in a crowd.
 */

export const LOTO_PRICES = [1000, 5000, 10000, 50000, 100000];
export const LOTO_MAX_TICKETS = 6; // per player per round
export const LOTO_BUY_AT_ONCE = 3;
export const LOTO_CALLS = 50;
export const LOTO_BUY_MS = 40_000;
export const LOTO_CALL_MS = 2_000;
export const LOTO_END_MS = 8_000;
export const LOTO_ROUND_MS = LOTO_BUY_MS + LOTO_CALLS * LOTO_CALL_MS + LOTO_END_MS;
const LOTO_EPOCH = Date.UTC(2026, 0, 1);

/** Prize by the call that completes the first row: a row by call 20 pays 50 times the ticket */
export const LOTO_TIERS: { upTo: number; mult: number }[] = [
  { upTo: 20, mult: 50 },
  { upTo: 25, mult: 15 },
  { upTo: 30, mult: 8 },
  { upTo: 35, mult: 4 },
  { upTo: 40, mult: 2.5 },
  { upTo: 45, mult: 1.5 },
  { upTo: 50, mult: 0.5 },
];

export type LotoGrid = (number | null)[][];

export function lotoMultiplier(kinhAt: number | null): number {
  if (kinhAt == null) return 0;
  return LOTO_TIERS.find((t) => kinhAt <= t.upTo)?.mult ?? 0;
}

/** Round number and its timings for a moment in time. Rounds run back to back, all day. */
export function lotoRoundAt(now: number) {
  const round = Math.floor((now - LOTO_EPOCH) / LOTO_ROUND_MS);
  const start = LOTO_EPOCH + round * LOTO_ROUND_MS;
  const drawStart = start + LOTO_BUY_MS;
  return { round, start, drawStart, callsEnd: drawStart + LOTO_CALLS * LOTO_CALL_MS, end: start + LOTO_ROUND_MS };
}
export function lotoRoundTimes(round: number) {
  return lotoRoundAt(LOTO_EPOCH + round * LOTO_ROUND_MS);
}

/** How many numbers of a round have been called at a moment (the first is called as buying closes) */
export function lotoCallsMade(round: number, now: number): number {
  const { drawStart } = lotoRoundTimes(round);
  if (now < drawStart) return 0;
  return Math.min(LOTO_CALLS, Math.floor((now - drawStart) / LOTO_CALL_MS) + 1);
}

/** When the call that makes `calls` numbers happens */
export function lotoCallTime(round: number, calls: number): number {
  return lotoRoundTimes(round).drawStart + (calls - 1) * LOTO_CALL_MS;
}

export const colRange = (c: number): [number, number] => (c === 0 ? [1, 9] : c === 8 ? [80, 90] : [c * 10, c * 10 + 9]);

/** A real ticket: 5 numbers in every row and column */
export function isValidLotoGrid(grid: unknown): grid is LotoGrid {
  if (!Array.isArray(grid) || grid.length !== 9) return false;
  const seen = new Set<number>();
  const colCount = Array(9).fill(0);
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== 9) return false;
    let n = 0;
    for (let c = 0; c < 9; c++) {
      const v = row[c];
      if (v === null) continue;
      if (typeof v !== "number" || !Number.isInteger(v)) return false;
      const [lo, hi] = colRange(c);
      if (v < lo || v > hi || seen.has(v)) return false;
      seen.add(v);
      n++;
      colCount[c]++;
    }
    if (n !== 5) return false;
  }
  return colCount.every((n) => n === 5);
}

/** Deals a random ticket. `rand(n)` returns a whole number from 0 to n-1. */
export function makeLotoGrid(rand: (n: number) => number = (n) => Math.floor(Math.random() * n)): LotoGrid {
  // Start from a pattern with 5 per row and column, then shuffle it without changing those counts
  const on: boolean[][] = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => (c - r + 9) % 9 < 5));
  for (let i = 0; i < 300; i++) {
    const r1 = rand(9), r2 = rand(9), c1 = rand(9), c2 = rand(9);
    // Swap a 2x2 "checkerboard" (on/off/off/on): every row and column keeps its count
    if (on[r1][c1] && on[r2][c2] && !on[r1][c2] && !on[r2][c1]) {
      on[r1][c1] = on[r2][c2] = false;
      on[r1][c2] = on[r2][c1] = true;
    }
  }
  const grid: LotoGrid = Array.from({ length: 9 }, () => Array(9).fill(null));
  for (let c = 0; c < 9; c++) {
    const [lo, hi] = colRange(c);
    const pool = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const picks: number[] = [];
    for (let k = 0; k < 5; k++) picks.push(pool.splice(rand(pool.length), 1)[0]);
    picks.sort((a, b) => a - b);
    let k = 0;
    for (let r = 0; r < 9; r++) if (on[r][c]) grid[r][c] = picks[k++];
  }
  return grid;
}

/** The call (1-based) that completes the ticket's first row within the round's calls, or null */
export function lotoKinhAt(grid: LotoGrid, draws: number[], calls = LOTO_CALLS): number | null {
  const at = new Map<number, number>();
  draws.slice(0, calls).forEach((n, i) => at.set(n, i + 1));
  let best: number | null = null;
  for (const row of grid) {
    let last = 0;
    for (const v of row) {
      if (v === null) continue;
      const t = at.get(v);
      if (t === undefined) { last = Infinity; break; }
      last = Math.max(last, t);
    }
    if (last !== Infinity && (best === null || last < best)) best = last;
  }
  return best;
}

const choose = (n: number, k: number) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
/** Chance a ticket has a full row within the first k calls (exact, by inclusion-exclusion over its 9 rows) */
export function lotoRowBy(k: number): number {
  let p = 0;
  for (let r = 1; r <= 9; r++) p += (r % 2 ? 1 : -1) * choose(9, r) * choose(90 - 5 * r, k - 5 * r);
  return p / choose(90, k);
}
/** The share of ticket money paid back, worked out exactly from the prize table */
export function lotoRtp(): number {
  let e = 0, lo = 0;
  for (const t of LOTO_TIERS) { e += (lotoRowBy(t.upTo) - lotoRowBy(lo)) * t.mult; lo = t.upTo; }
  return e;
}

// The caller's patter. Lô tô callers sing a line before each number; these are short, friendly ones.
const INTROS = [
  "Cờ ra con mấy, con mấy gì ra…",
  "Lô tô lô tô, ra con số…",
  "Bà con cô bác dò cho kỹ…",
  "Con gì đây, con gì ra đây…",
  "Ai chờ con này, ra rồi đây…",
  "Tay lắc thùng, số nhảy ra…",
  "Nghe cho rõ, dò cho kỹ…",
  "Ra rồi, ra rồi…",
];
const ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
/** A number in Vietnamese words, e.g. 25 → "hai mươi lăm" */
export function vnNumber(n: number): string {
  if (n < 10) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  const tens = t === 1 ? "mười" : `${ONES[t]} mươi`;
  if (o === 0) return tens;
  if (o === 5) return `${tens} lăm`;
  if (o === 1 && t > 1) return `${tens} mốt`;
  if (o === 4 && t > 1) return `${tens} tư`;
  return `${tens} ${ONES[o]}`;
}
export function lotoCallLine(n: number, seed: number): string {
  return INTROS[(n * 7 + seed) % INTROS.length];
}

export interface LotoTicketView {
  id: number;
  grid: LotoGrid;
  price: number;
  /** Set once the round's calls reach the ticket's first full row */
  kinhAt: number | null;
  payout: number | null;
  settled: boolean;
}

export interface LotoView {
  serverNow: number;
  round: number;
  start: number;
  drawStart: number;
  callsEnd: number;
  end: number;
  /** Numbers called so far this round, in order */
  calls: number[];
  mine: LotoTicketView[];
  /** Your tickets from the round that just finished */
  lastRound: { round: number; calls: number[]; tickets: LotoTicketView[] } | null;
  players: number;
  tickets: number;
  winners: { username: string; price: number; payout: number; kinhAt: number; round: number }[];
  balance: number;
}
