/**
 * Slot 777 Cổ Điển (Classic 777): a Vegas-style 3-reel fruit machine.
 *
 * Each reel is a fixed strip. A spin picks one stop per reel uniformly at random (server side,
 * crypto randomInt) and the player sees three consecutive stops of each strip. Five paylines:
 * middle, top, bottom and the two diagonals; the player plays 1, 3 or 5 of them.
 *
 * Because every visible cell of a reel is uniformly distributed over that reel's strip and
 * the reels are independent, every payline sees exactly the same symbol distribution, so
 * every payline has the same return. That return is computed exactly by enumerating every
 * combination of stops (see `exactRtp`), and SLOT777_RTP is that figure to 2 decimals.
 */

export type Sym777 = "cherry" | "lemon" | "orange" | "melon" | "bell" | "bar" | "seven" | "star";

export const SYMBOLS_777: Sym777[] = ["star", "seven", "bar", "bell", "melon", "orange", "lemon", "cherry"];

/** Reel strips, read top to bottom. Each reel has its own strip. */
export const STRIPS_777: Sym777[][] = [
  [
    "seven", "lemon", "cherry", "orange", "bar", "lemon", "melon", "cherry", "orange", "bell",
    "lemon", "bar", "orange", "cherry", "melon", "lemon", "star", "orange", "bell", "lemon",
    "bar", "cherry", "melon", "orange", "lemon", "bell", "bar", "melon", "orange", "lemon",
  ],
  [
    "lemon", "seven", "orange", "melon", "cherry", "lemon", "bell", "orange", "bar", "melon",
    "lemon", "orange", "star", "bell", "lemon", "melon", "cherry", "orange", "bar", "lemon",
    "bell", "melon", "orange", "lemon", "cherry", "bell", "bar", "orange", "lemon", "melon",
  ],
  [
    "orange", "lemon", "bar", "melon", "orange", "bell", "lemon", "cherry", "orange", "bar",
    "lemon", "melon", "bell", "orange", "star", "lemon", "bar", "melon", "orange", "seven",
    "lemon", "bell", "melon", "orange", "cherry", "lemon", "bar", "bell", "orange", "melon", "lemon",
  ],
];

export const REELS_777 = 3;
export const ROWS_777 = 3;

/** Paylines as the row (0 top, 1 middle, 2 bottom) on each reel. Playing n lines plays the first n. */
export const PAYLINES_777: number[][] = [
  [1, 1, 1], // 1: middle
  [0, 0, 0], // 2: top
  [2, 2, 2], // 3: bottom
  [0, 1, 2], // 4: diagonal down
  [2, 1, 0], // 5: diagonal up
];

export const LINE_OPTIONS_777 = [1, 3, 5] as const;
export const LINE_BETS_777 = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000];
export const MAX_TOTAL_BET_777 = 1_000_000;

/** Three of a kind, × line bet. ⭐⭐⭐ is the top prize and isn't multiplied. */
export const PAY3_777: Record<Sym777, number> = {
  star: 1500, seven: 200, bar: 20, bell: 12, melon: 10, cherry: 10, orange: 6, lemon: 4,
};
/** Any three of BAR and 7 mixed together, × line bet */
export const MIX_PAY_777 = 3;
/** Cherries from the left reel: one, or two in a row, × line bet */
export const CHERRY_PAYS_777: Record<1 | 2, number> = { 1: 1, 2: 3 };
/** Each ⭐ in a winning line doubles it (two stars ×4) */
export const WILD_MULT_777 = 2;

/** The exact return to player, in percent, to 2 decimals. Asserted by tests/engine.test.ts. */
export const SLOT777_RTP = 95.95;

export type LineKind777 = "three" | "mix" | "cherry" | "stars";
export interface LineEval777 { mult: number; kind: LineKind777 | null; symbol: Sym777 | null; stars: number; count: number }

/**
 * What one line pays, × line bet. ⭐ stands in for any symbol and doubles the win for each
 * star used. The line pays its single best win.
 */
export function evalLine777(cells: Sym777[]): LineEval777 {
  const stars = cells.filter((c) => c === "star").length;
  if (stars === 3) return { mult: PAY3_777.star, kind: "stars", symbol: "star", stars: 3, count: 3 };
  const rest = cells.filter((c) => c !== "star");
  const boost = WILD_MULT_777 ** stars;
  let best: LineEval777 = { mult: 0, kind: null, symbol: null, stars: 0, count: 0 };
  if (rest.every((c) => c === rest[0])) {
    best = { mult: PAY3_777[rest[0]] * boost, kind: "three", symbol: rest[0], stars, count: 3 };
  } else if (rest.every((c) => c === "bar" || c === "seven")) {
    best = { mult: MIX_PAY_777 * boost, kind: "mix", symbol: null, stars, count: 3 };
  }
  // Cherries count from the left reel; a star can stand in, but there must be a real cherry
  let run = 0, real = 0, used = 0;
  for (const c of cells) {
    if (c === "cherry") { run++; real++; } else if (c === "star") { run++; used++; } else break;
  }
  if (real > 0 && (run === 1 || run === 2)) {
    const mult = CHERRY_PAYS_777[run] * WILD_MULT_777 ** used;
    if (mult > best.mult) best = { mult, kind: "cherry", symbol: "cherry", stars: used, count: run };
  }
  return best;
}

/** The 3×3 window for the given stops, as grid[reel][row] */
export function windowAt777(stops: number[]): Sym777[][] {
  return STRIPS_777.map((strip, r) => Array.from({ length: ROWS_777 }, (_, row) => strip[(stops[r] + row) % strip.length]));
}

export interface LineWin777 { line: number; symbols: Sym777[]; mult: number; payout: number; kind: LineKind777 }
export interface Spin777Eval { lineWins: LineWin777[]; payout: number }

/** Pays a window for the first `lines` paylines at `lineBet` each */
export function evaluate777(grid: Sym777[][], lines: number, lineBet: number): Spin777Eval {
  const lineWins: LineWin777[] = [];
  for (let i = 0; i < lines; i++) {
    const symbols = PAYLINES_777[i].map((row, reel) => grid[reel][row]);
    const e = evalLine777(symbols);
    if (e.mult > 0 && e.kind) lineWins.push({ line: i + 1, symbols, mult: e.mult, payout: e.mult * lineBet, kind: e.kind });
  }
  return { lineWins, payout: lineWins.reduce((a, w) => a + w.payout, 0) };
}

export const isValidBet777 = (lines: number, lineBet: number) =>
  (LINE_OPTIONS_777 as readonly number[]).includes(lines) && LINE_BETS_777.includes(lineBet) && lines * lineBet <= MAX_TOTAL_BET_777;

/**
 * The exact return of one payline: the total of every stop combination's pay over the number
 * of combinations (an exact fraction; both fit easily in a double).
 */
export function exactRtp777(line = 0): { paid: number; combos: number; hits: number } {
  const [a, b, c] = STRIPS_777;
  const rows = PAYLINES_777[line];
  let paid = 0, hits = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) for (let k = 0; k < c.length; k++) {
    const g = windowAt777([i, j, k]);
    const m = evalLine777([g[0][rows[0]], g[1][rows[1]], g[2][rows[2]]]).mult;
    paid += m;
    if (m) hits++;
  }
  return { paid, combos: a.length * b.length * c.length, hits };
}
