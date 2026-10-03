import { randomInt } from "crypto";
import {
  SLOT_SYMBOLS,
  PAYLINES,
  SCATTER_PAYS,
  WILD_ID,
  SCATTER_ID,
  ORACLE_WIN_MULTIPLIER,
} from "../shared/schema";

export interface LineWin {
  /** Index into PAYLINES */
  line: number;
  /** The symbol that paid (the wild's id when the line is all wilds) */
  symbol: string;
  amount: number;
  /** True if at least one wild helped make the line */
  withWild: boolean;
}

export interface SpinOutcome {
  /** grid[col][row] of symbol ids */
  grid: string[][];
  winLines: number[];
  lineWins: LineWin[];
  scatterCount: number;
  scatterWin: number;
  /** Total paid, including the oracle blessing multiplier */
  winAmount: number;
  freeSpinsAwarded: number;
  dragonLine: boolean;
}

export type Rng = (maxExclusive: number) => number;

const cryptoRng: Rng = (max) => randomInt(max);

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);
const PAYS = new Map(SLOT_SYMBOLS.map((s) => [s.id, s.pays]));

function pickSymbol(rng: Rng): string {
  let r = rng(TOTAL_WEIGHT);
  for (const s of SLOT_SYMBOLS) {
    if (r < s.weight) return s.id;
    r -= s.weight;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].id;
}

/**
 * Every symbol is drawn independently from the weighted table. There is no
 * near-miss forcing, no outcome steering and no per-player adjustment: what
 * the player sees is exactly what was drawn.
 */
export function spin(bet: number, opts: { blessed?: boolean; rng?: Rng } = {}): SpinOutcome {
  const rng = opts.rng ?? cryptoRng;
  const grid = [0, 1, 2].map(() => [0, 1, 2].map(() => pickSymbol(rng)));
  return evaluate(grid, bet, opts.blessed ? ORACLE_WIN_MULTIPLIER : 1);
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

export function evaluate(grid: string[][], bet: number, multiplier = 1): SpinOutcome {
  const lineWins: LineWin[] = [];
  PAYLINES.forEach((line, idx) => {
    const hit = lineSymbol(line.map((row, col) => grid[col][row]));
    if (!hit) return;
    lineWins.push({ line: idx, symbol: hit.symbol, amount: Math.floor(PAYS.get(hit.symbol)! * bet) * multiplier, withWild: hit.withWild });
  });

  const scatterCount = grid.flat().filter((s) => s === SCATTER_ID).length;
  const scatter = SCATTER_PAYS.find((s) => scatterCount >= s.count);
  const scatterWin = scatter ? Math.floor(scatter.pays * bet) * multiplier : 0;

  return {
    grid,
    winLines: lineWins.map((w) => w.line),
    lineWins,
    scatterCount,
    scatterWin,
    winAmount: lineWins.reduce((a, w) => a + w.amount, 0) + scatterWin,
    freeSpinsAwarded: scatter?.freeSpins ?? 0,
    dragonLine: lineWins.some((w) => w.symbol === "dragon"),
  };
}

/**
 * Exact return-to-player, computed analytically. Each payline uses three distinct,
 * independently drawn cells, so expected line pay adds up line by line; the scatter
 * count is binomial over the 9 cells. A free spin pays like a normal spin and can
 * retrigger, so every paid spin is worth R / (1 - expected free spins awarded).
 */
export function exactRtp() {
  const p = new Map(SLOT_SYMBOLS.map((s) => [s.id, s.weight / TOTAL_WEIGHT]));
  const pw = p.get(WILD_ID)!;
  const px = p.get(SCATTER_ID)!;
  let perLine = PAYS.get(WILD_ID)! * pw ** 3;
  for (const s of SLOT_SYMBOLS) {
    if (s.kind === "regular") perLine += s.pays * ((p.get(s.id)! + pw) ** 3 - pw ** 3);
  }
  const choose = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
  let scatterReturn = 0, freeSpinsPerSpin = 0, triggerChance = 0;
  for (let k = 0; k <= 9; k++) {
    const pk = choose(9, k) * px ** k * (1 - px) ** (9 - k);
    const tier = SCATTER_PAYS.find((s) => k >= s.count);
    if (!tier) continue;
    scatterReturn += pk * tier.pays;
    freeSpinsPerSpin += pk * tier.freeSpins;
    triggerChance += pk;
  }
  const baseReturn = PAYLINES.length * perLine + scatterReturn;
  return { baseReturn, freeSpinsPerSpin, triggerChance, rtp: baseReturn / (1 - freeSpinsPerSpin) };
}
