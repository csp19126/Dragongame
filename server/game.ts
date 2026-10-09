import { randomInt } from "crypto";
import {
  SLOT_SYMBOLS,
  PAYLINES,
  SCATTER_PAYS,
  WILD_ID,
  SCATTER_ID,
  repeaterLadder,
  HOLD_MAX_REELS,
  JACKPOT_ROW,
  REELS,
  ROWS,
  payOf,
} from "../shared/schema";

export interface LineWin {
  /** Index into PAYLINES */
  line: number;
  /** The symbol that paid (the wild's id when the line is a run of wilds) */
  symbol: string;
  /** How many in a row from the left (3-5) */
  count: number;
  /** Coins paid for this line in this step, after the step multiplier (before blessing and free-spin multiplier) */
  amount: number;
  /** True if at least one wild helped make the line */
  withWild: boolean;
  /** True when a line paid earlier in this spin got longer: `amount` is only the extra */
  upgrade: boolean;
}

/** The first spin (multiplier 1) or one repeat of the Repeater */
export interface SpinStep {
  /** grid[reel][row] of symbol ids after this step */
  grid: string[][];
  /** Cells that stayed locked during this step, as "reel-row" (empty for the first spin) */
  held: string[];
  /** Lines that paid (or grew) in this step */
  lineWins: LineWin[];
  multiplier: number;
  /** Coins won in this step (lines only; the scatter is paid on the first spin) */
  win: number;
}

export interface SpinOutcome {
  steps: SpinStep[];
  /** Final grid after all repeats */
  grid: string[][];
  /** Every line paid during the spin */
  winLines: number[];
  lineWins: LineWin[];
  repeats: number;
  scatterCount: number;
  scatterWin: number;
  /** Total paid by the game, blessing and free-spin multiplier included (the jackpot is paid separately) */
  winAmount: number;
  /** Free-spin units awarded (the player chooses how to take them) */
  freeSpinUnits: number;
  dragonLine: boolean;
  jackpotHit: boolean;
  /** The oracle blessing applied to this spin (1 when none) */
  blessing: number;
  /** The free-spin multiplier applied to this spin (1 outside free spins) */
  freeSpinMult: number;
}

export type Rng = (maxExclusive: number) => number;

/** Reels the player chose to hold, and the grid they're held from */
export interface Hold { grid: string[][]; reels: boolean[] }

const cryptoRng: Rng = (max) => randomInt(max);

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);

export function pickSymbol(rng: Rng): string {
  let r = rng(TOTAL_WEIGHT);
  for (const s of SLOT_SYMBOLS) {
    if (r < s.weight) return s.id;
    r -= s.weight;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].id;
}

export function randomGrid(rng: Rng): string[][] {
  return Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => pickSymbol(rng)));
}

/**
 * What one payline is worth, reading from the leftmost reel: the best of a run of a symbol
 * (wilds standing in) and a run of wilds on their own. Scatters break a line.
 */
export function evalLine(cells: string[]): { symbol: string; count: number; value: number; withWild: boolean } | null {
  let wilds = 0;
  while (wilds < cells.length && cells[wilds] === WILD_ID) wilds++;
  const wildValue = payOf(WILD_ID, wilds);
  let best: { symbol: string; count: number; value: number; withWild: boolean } | null =
    wildValue > 0 ? { symbol: WILD_ID, count: wilds, value: wildValue, withWild: false } : null;
  if (wilds < cells.length && cells[wilds] !== SCATTER_ID) {
    const symbol = cells[wilds];
    let count = wilds;
    while (count < cells.length && (cells[count] === symbol || cells[count] === WILD_ID)) count++;
    const value = payOf(symbol, count);
    if (value > 0 && (!best || value > best.value)) {
      best = { symbol, count, value, withWild: cells.slice(0, count).includes(WILD_ID) };
    }
  }
  return best;
}

/**
 * Lines that pay on a grid. `paid` maps line -> coins already paid for it (at x1) this spin:
 * a line pays only what it's worth beyond that, times `multiplier`. `paid` is updated.
 */
export function lineWinsFor(grid: string[][], bet: number, multiplier = 1, paid: Map<number, number> = new Map()): LineWin[] {
  const wins: LineWin[] = [];
  PAYLINES.forEach((line, idx) => {
    const hit = evalLine(line.map((row, reel) => grid[reel][row]));
    if (!hit) return;
    const worth = Math.floor(hit.value * bet);
    const before = paid.get(idx) ?? 0;
    if (worth <= before) return;
    paid.set(idx, worth);
    wins.push({ line: idx, symbol: hit.symbol, count: hit.count, amount: (worth - before) * multiplier, withWild: hit.withWild, upgrade: before > 0 });
  });
  return wins;
}

export function scatterFor(grid: string[][], bet: number) {
  const count = grid.flat().filter((s) => s === SCATTER_ID).length;
  const tier = SCATTER_PAYS.find((s) => count >= s.count);
  return { count, win: tier ? Math.floor(tier.pays * bet) : 0, units: tier?.units ?? 0 };
}

/** Three Dragon Pearls on the middle row, reels 1-3 */
export const pearlCount = (grid: string[][]) => grid.flat().filter((s) => s === WILD_ID).length;

export const isJackpotGrid = (grid: string[][]) => [0, 1, 2].every((reel) => grid[reel][JACKPOT_ROW] === WILD_ID);

/**
 * Plays one spin, Repeater included. Every symbol is drawn independently from the
 * weighted table: no near-miss forcing, no outcome steering, no per-player adjustment.
 * `startGrid` is for tests only (it replaces the first draw).
 */
export function spin(bet: number, opts: { blessing?: number; freeSpinMult?: number; rng?: Rng; startGrid?: string[][]; hold?: Hold } = {}): SpinOutcome {
  const rng = opts.rng ?? cryptoRng;
  let grid = opts.startGrid ?? randomGrid(rng);
  // HOLD: the reels the player held keep last spin's symbols
  if (opts.hold && !opts.startGrid) grid = grid.map((col, reel) => (opts.hold!.reels[reel] ? [...opts.hold!.grid[reel]] : col));
  const paid = new Map<number, number>();

  const first = lineWinsFor(grid, bet, 1, paid);
  const scatter = scatterFor(grid, bet);
  const steps: SpinStep[] = [{ grid, held: [], lineWins: first, multiplier: 1, win: first.reduce((a, w) => a + w.amount, 0) }];
  let jackpotHit = isJackpotGrid(grid);
  const held = new Set<string>();
  const hold = (wins: LineWin[]) => wins.forEach((w) => PAYLINES[w.line].slice(0, w.count).forEach((row, reel) => held.add(`${reel}-${row}`)));
  const holdPearls = (g: string[][]) => g.forEach((col, c) => col.forEach((s, r) => { if (s === WILD_ID) held.add(`${c}-${r}`); }));
  hold(first);
  holdPearls(grid);

  // Rồng Lặp (Repeater): 2 Dragon Pearls anywhere wake a short repeater, 3+ the full ladder. Pearls and winning cells
  // lock; every other cell re-spins, while each repeat adds a new or longer winning line.
  // Pearls that land during repeats lock too.
  const ladder = repeaterLadder(pearlCount(grid));
  if (ladder.length) {
    for (const multiplier of ladder) {
      const lockedBefore = [...held];
      grid = grid.map((col, c) => col.map((s, r) => (held.has(`${c}-${r}`) ? s : pickSymbol(rng))));
      const wins = lineWinsFor(grid, bet, multiplier, paid);
      jackpotHit ||= isJackpotGrid(grid);
      steps.push({ grid, held: lockedBefore, lineWins: wins, multiplier, win: wins.reduce((a, w) => a + w.amount, 0) });
      if (wins.length === 0) break;
      hold(wins);
      holdPearls(grid);
    }
  }

  const blessing = opts.blessing && opts.blessing > 1 ? opts.blessing : 1;
  const freeSpinMult = opts.freeSpinMult && opts.freeSpinMult > 1 ? opts.freeSpinMult : 1;
  const boost = (n: number) => Math.floor(n * blessing) * freeSpinMult;
  const lineWins = steps.flatMap((s) => s.lineWins);
  const lineTotal = steps.reduce((a, s) => a + s.win, 0);
  return {
    steps,
    grid,
    winLines: [...new Set(lineWins.map((w) => w.line))],
    lineWins,
    repeats: steps.filter((s, i) => i > 0 && s.lineWins.length > 0).length,
    scatterCount: scatter.count,
    scatterWin: boost(scatter.win),
    winAmount: boost(lineTotal + scatter.win),
    freeSpinUnits: scatter.units,
    dragonLine: lineWins.some((w) => w.symbol === "dragon"),
    jackpotHit,
    blessing,
    freeSpinMult,
  };
}

// ---------------- HOLD: what holding is worth ----------------

const WEIGHTS = SLOT_SYMBOLS.map((s) => [s.id, s.weight / TOTAL_WEIGHT] as const);

/**
 * Exact expected line pays (x bet) of one line when some cells are fixed (held) and the rest
 * are drawn at random. Walks the line from the left keeping the chance of every possible
 * run so far: (wild prefix, run symbol, run length, run ended).
 */
function lineEV(cells: (string | null)[]): number {
  type St = { wp: number; s: string | null; n: number; done: boolean };
  let states = new Map<string, { st: St; p: number }>([["0||0|0", { st: { wp: 0, s: null, n: 0, done: false }, p: 1 }]]);
  const step = (st: St, c: string): St => {
    if (st.done) return st;
    if (st.s === null) {
      if (c === WILD_ID) return { wp: st.wp + 1, s: null, n: st.n + 1, done: false };
      if (c === SCATTER_ID) return { ...st, done: true };
      return { wp: st.wp, s: c, n: st.n + 1, done: false };
    }
    return c === st.s || c === WILD_ID ? { ...st, n: st.n + 1 } : { ...st, done: true };
  };
  for (const cell of cells) {
    const next = new Map<string, { st: St; p: number }>();
    const add = (st: St, p: number) => {
      const k = `${st.wp}|${st.s}|${st.n}|${st.done ? 1 : 0}`;
      const e = next.get(k);
      if (e) e.p += p; else next.set(k, { st, p });
    };
    for (const { st, p } of states.values()) {
      if (st.done) { add(st, p); continue; }
      if (cell !== null) add(step(st, cell), p);
      else for (const [id, q] of WEIGHTS) add(step(st, id), p * q);
    }
    states = next;
  }
  let ev = 0;
  for (const { st, p } of states.values()) ev += p * Math.max(payOf(WILD_ID, st.wp), st.s ? payOf(st.s, st.n) : payOf(WILD_ID, st.n));
  return ev;
}

// The same few patterns of held cells come up again and again, so remember their values
const lineEVCache = new Map<string, number>();
function cachedLineEV(cells: (string | null)[]): number {
  const key = cells.join(",");
  let v = lineEVCache.get(key);
  if (v === undefined) { v = lineEV(cells); lineEVCache.set(key, v); }
  return v;
}

/** Expected line pays (x bet) of the next spin if these reels are held */
export function holdEV(grid: string[][], reels: boolean[]): number {
  return PAYLINES.reduce((a, line) => a + cachedLineEV(line.map((row, reel) => (reels[reel] ? grid[reel][row] : null))), 0);
}

/** The best reels to hold (at most `max` of them), by expected line pays */
export function bestHold(grid: string[][], max = HOLD_MAX_REELS): { reels: boolean[]; ev: number } {
  let best = { reels: [false, false, false, false, false], ev: holdEV(grid, [false, false, false, false, false]) };
  for (let mask = 1; mask < 31; mask++) {
    const reels = [0, 1, 2, 3, 4].map((b) => !!(mask & (1 << b)));
    if (reels.filter(Boolean).length > max) continue;
    const ev = holdEV(grid, reels);
    if (ev > best.ev + 1e-12) best = { reels, ev };
  }
  return best;
}
