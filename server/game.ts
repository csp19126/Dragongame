import { randomInt } from "crypto";
import {
  SLOT_SYMBOLS,
  PAYLINES,
  SCATTER_PAYS,
  WILD_ID,
  SCATTER_ID,
  ORACLE_WIN_MULTIPLIER,
  REPEATER_MULTIPLIERS,
  JACKPOT_LINE,
} from "../shared/schema";

export interface LineWin {
  /** Index into PAYLINES */
  line: number;
  /** The symbol that paid (the wild's id when the line is all wilds) */
  symbol: string;
  /** Coins paid for this line, after the step multiplier (before any oracle blessing) */
  amount: number;
  /** True if at least one wild helped make the line */
  withWild: boolean;
}

/** The first spin (multiplier 1) or one repeat of the Repeater */
export interface SpinStep {
  /** grid[col][row] of symbol ids after this step */
  grid: string[][];
  /** Cells that stayed locked during this step, as "col-row" (empty for the first spin) */
  held: string[];
  /** Lines that paid for the first time in this step */
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
  /** Total paid by the game, including the oracle blessing (the jackpot is paid separately) */
  winAmount: number;
  freeSpinsAwarded: number;
  dragonLine: boolean;
  jackpotHit: boolean;
}

export type Rng = (maxExclusive: number) => number;

const cryptoRng: Rng = (max) => randomInt(max);

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);
const PAYS = new Map(SLOT_SYMBOLS.map((s) => [s.id, s.pays]));

export function pickSymbol(rng: Rng): string {
  let r = rng(TOTAL_WEIGHT);
  for (const s of SLOT_SYMBOLS) {
    if (r < s.weight) return s.id;
    r -= s.weight;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].id;
}

/** What a payline pays: the symbol it forms (wilds substitute), or null. Scatters never form lines. */
function lineSymbol(cells: string[]): { symbol: string; withWild: boolean } | null {
  let symbol: string | null = null;
  let withWild = false;
  for (const c of cells) {
    if (c === SCATTER_ID) return null;
    if (c === WILD_ID) { withWild = true; continue; }
    if (symbol === null) symbol = c;
    else if (symbol !== c) return null;
  }
  return { symbol: symbol ?? WILD_ID, withWild: withWild && symbol !== null };
}

/** Lines that pay on a grid, skipping lines already paid */
export function lineWinsFor(grid: string[][], bet: number, multiplier = 1, skip: ReadonlySet<number> = new Set()): LineWin[] {
  const wins: LineWin[] = [];
  PAYLINES.forEach((line, idx) => {
    if (skip.has(idx)) return;
    const hit = lineSymbol(line.map((row, col) => grid[col][row]));
    if (!hit) return;
    wins.push({ line: idx, symbol: hit.symbol, amount: Math.floor(PAYS.get(hit.symbol)! * bet) * multiplier, withWild: hit.withWild });
  });
  return wins;
}

export function scatterFor(grid: string[][], bet: number) {
  const count = grid.flat().filter((s) => s === SCATTER_ID).length;
  const tier = SCATTER_PAYS.find((s) => count >= s.count);
  return { count, win: tier ? Math.floor(tier.pays * bet) : 0, freeSpins: tier?.freeSpins ?? 0 };
}

const isJackpotLine = (w: LineWin) => w.line === JACKPOT_LINE && w.symbol === WILD_ID;

/**
 * Plays one spin, Repeater included. Every symbol is drawn independently from the
 * weighted table: no near-miss forcing, no outcome steering, no per-player adjustment.
 * `startGrid` is for tests only (it replaces the first draw).
 */
export function spin(bet: number, opts: { blessed?: boolean; rng?: Rng; startGrid?: string[][] } = {}): SpinOutcome {
  const rng = opts.rng ?? cryptoRng;
  let grid = opts.startGrid ?? [0, 1, 2].map(() => [0, 1, 2].map(() => pickSymbol(rng)));

  const first = lineWinsFor(grid, bet);
  const scatter = scatterFor(grid, bet);
  const steps: SpinStep[] = [{ grid, held: [], lineWins: first, multiplier: 1, win: first.reduce((a, w) => a + w.amount, 0) }];
  const paid = new Set(first.map((w) => w.line));
  const held = new Set<string>();
  const hold = (wins: LineWin[]) => wins.forEach((w) => PAYLINES[w.line].forEach((row, col) => held.add(`${col}-${row}`)));
  hold(first);

  // Repeater: re-spin the unlocked cells while each repeat forms a new winning line
  if (first.length > 0) {
    for (const multiplier of REPEATER_MULTIPLIERS) {
      const lockedBefore = [...held];
      grid = grid.map((col, c) => col.map((s, r) => (held.has(`${c}-${r}`) ? s : pickSymbol(rng))));
      const wins = lineWinsFor(grid, bet, multiplier, paid);
      steps.push({ grid, held: lockedBefore, lineWins: wins, multiplier, win: wins.reduce((a, w) => a + w.amount, 0) });
      if (wins.length === 0) break;
      wins.forEach((w) => paid.add(w.line));
      hold(wins);
    }
  }

  const blessing = opts.blessed ? ORACLE_WIN_MULTIPLIER : 1;
  const lineWins = steps.flatMap((s) => s.lineWins);
  const lineTotal = steps.reduce((a, s) => a + s.win, 0);
  return {
    steps,
    grid,
    winLines: lineWins.map((w) => w.line),
    lineWins,
    repeats: steps.filter((s, i) => i > 0 && s.lineWins.length > 0).length,
    scatterCount: scatter.count,
    scatterWin: scatter.win * blessing,
    winAmount: (lineTotal + scatter.win) * blessing,
    freeSpinsAwarded: scatter.freeSpins,
    dragonLine: lineWins.some((w) => w.symbol === "dragon"),
    jackpotHit: lineWins.some(isJackpotLine),
  };
}
