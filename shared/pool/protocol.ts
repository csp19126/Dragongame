import type { Ball, GameState, Shot, Side } from "./engine";

/** Stakes a pool table can be played for (0 = friendly) */
export const POOL_STAKES = [0, 1000, 10000, 50000, 100000, 500000, 1000000];
/** Quick reactions players can send each other */
export const POOL_EMOTES = ["👍", "🔥", "😂", "😮", "😡", "😭", "👏", "🎱"];
/** Time to take a shot in an online game */
export const POOL_TURN_MS = 45_000;

export interface PoolTable { code: string; stake: number; host: string; guest?: string; status: "waiting" | "playing" }

export type PoolServerMsg =
  | {
      t: "state";
      code: string;
      stake: number;
      /** Your seat, or null when watching */
      seat: Side | null;
      names: [string, string | null];
      status: "waiting" | "playing" | "finished";
      game: GameState | null;
      turnMsLeft: number | null;
      online: [boolean, boolean];
      spectators: number;
      result: { winner: Side; reason: string; payout: number } | null;
    }
  | { t: "shot"; by: Side; start: Ball[]; shot: Shot; state: GameState }
  | { t: "aim"; dx: number; dy: number; power: number; cue: { x: number; y: number } | null }
  | { t: "emote"; from: Side | null; e: string }
  | { t: "error"; message: string }
  | { t: "closed"; reason: string };
