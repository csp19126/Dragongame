/**
 * Slot 777 Cổ Điển: the server's draw. The route (server/routes.ts) takes the stake and pays
 * the win in one transaction through storage.playTable, which also writes the play log.
 * No database imports here, so the maths tests can drive the real draw.
 */
import { randomInt } from "crypto";
import { z } from "zod";
import { STRIPS_777, windowAt777, evaluate777, isValidBet777, type Sym777, type LineWin777 } from "@shared/slot777";

export interface Spin777Outcome {
  totalBet: number;
  winAmount: number;
  lines: number;
  lineBet: number;
  stops: number[];
  /** grid[reel][row], row 0 at the top */
  reels: Sym777[][];
  lineWins: LineWin777[];
}

/** One spin's outcome: a uniform stop on every reel */
export function play777(lines: number, lineBet: number, roll: (n: number) => number = randomInt): Spin777Outcome {
  const stops = STRIPS_777.map((s) => roll(s.length));
  const reels = windowAt777(stops);
  const { lineWins, payout } = evaluate777(reels, lines, lineBet);
  return { totalBet: lines * lineBet, winAmount: payout, lines, lineBet, stops, reels, lineWins };
}

/** {lines, lineBet}: only the listed values, nothing else in the body */
export const spin777Schema = z.object({ lines: z.number().int(), lineBet: z.number().int() }).strict()
  .refine((b) => isValidBet777(b.lines, b.lineBet), { message: "Invalid bet" });
