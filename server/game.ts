import { randomInt } from "crypto";
import {
  SLOT_SYMBOLS,
  PAYLINES,
  FREE_SPINS_AWARD,
  FREE_SPINS_TRIGGER_MULTIPLE,
  ORACLE_WIN_MULTIPLIER,
} from "../shared/schema";

export interface SpinOutcome {
  /** grid[col][row] of symbol ids */
  grid: string[][];
  winLines: number[];
  winAmount: number;
  freeSpinsAwarded: number;
  dragonLine: boolean;
}

export type Rng = (maxExclusive: number) => number;

const cryptoRng: Rng = (max) => randomInt(max);

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);

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

export function evaluate(grid: string[][], bet: number, multiplier = 1): SpinOutcome {
  let winAmount = 0;
  let dragonLine = false;
  const winLines: number[] = [];
  PAYLINES.forEach((line, idx) => {
    const a = grid[0][line[0]];
    if (a === grid[1][line[1]] && a === grid[2][line[2]]) {
      const def = SLOT_SYMBOLS.find((s) => s.id === a)!;
      winAmount += Math.floor(def.pays * bet);
      winLines.push(idx);
      if (a === "dragon") dragonLine = true;
    }
  });
  // Free spins trigger on the natural win, before any blessing multiplier
  const freeSpinsAwarded = winAmount >= bet * FREE_SPINS_TRIGGER_MULTIPLE ? FREE_SPINS_AWARD : 0;
  return { grid, winLines, winAmount: winAmount * multiplier, freeSpinsAwarded, dragonLine };
}
