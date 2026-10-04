/** Pool tournaments: shared rules and defaults */

/** Weekly tournament: Saturday 20:00 Vietnam time (UTC+7) = 13:00 UTC */
export const WEEKLY_DAY_UTC = 6; // Saturday
export const WEEKLY_HOUR_UTC = 13;
export const WEEKLY_NAME = "Giải Bi-a Cuối Tuần";
export const DEFAULT_SIZE = 16;
/** Coins for the winner, the runner-up and each losing semi-finalist. Paid by the house; entry is free. */
export const DEFAULT_PRIZES = [5_000_000, 2_000_000, 500_000];
export const TOURNAMENT_SIZES = [4, 8, 16, 32];
export const MIN_PLAYERS = 2;

/** "Final", "Semi-final"... counted back from the last round */
export function roundName(round: number, rounds: number, lang: "vi" | "en") {
  const fromEnd = rounds - round;
  if (lang === "vi") return fromEnd === 0 ? "Chung kết" : fromEnd === 1 ? "Bán kết" : fromEnd === 2 ? "Tứ kết" : `Vòng ${round}`;
  return fromEnd === 0 ? "Final" : fromEnd === 1 ? "Semi-finals" : fromEnd === 2 ? "Quarter-finals" : `Round ${round}`;
}

export interface TournamentView {
  tournament: {
    id: number; name: string; startsAt: string; size: number; prizes: number[];
    status: "open" | "live" | "finished" | "cancelled"; rounds: number | null; winnerName: string | null;
  } | null;
  players: { username: string; place: number | null; prize: number | null }[];
  joined: boolean;
  matches: { id: number; round: number; slot: number; name1: string | null; name2: string | null; status: string; code: string | null; winner: 1 | 2 | null; reason: string | null }[];
  myMatch: { code: string; opponent: string; round: number } | null;
  champions: { name: string; tournament: string; date: string; prize: number }[];
  /** The next tournament to sign up for, when the one shown is a different one */
  next: { id: number; name: string; startsAt: string; size: number; count: number; joined: boolean } | null;
  serverNow: string;
}
