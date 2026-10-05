/**
 * Pool league: one season per calendar month (Vietnam time). Every counted online game
 * (casual or tournament) gives the winner LEAGUE_WIN points and the loser LEAGUE_LOSS points,
 * so turning up is always worth something. To stop two friends swapping wins, a game only
 * counts if both players were there and it lasted MIN_SHOTS shots, and at most
 * MAX_PER_PAIR_PER_DAY games a day between the same two players count.
 * At the end of the month the top of the table and everyone who played enough are paid.
 */
export const LEAGUE_WIN = 3;
export const LEAGUE_LOSS = 1;
export const MIN_SHOTS = 6;
export const MAX_PER_PAIR_PER_DAY = 3;

/** Coins for 1st, 2nd, 3rd... (play coins, paid by the house) */
export const LEAGUE_PRIZES = [10_000_000, 5_000_000, 3_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000];
/** Everyone outside the prizes who played at least PARTICIPATION_GAMES counted games */
export const PARTICIPATION_GAMES = 10;
export const PARTICIPATION_PRIZE = 100_000;
/** The first counted pool win of each day (Vietnam time) */
export const DAILY_WIN_BONUS = 20_000;

export const TIERS = [
  { id: "diamond", min: 150, icon: "💎", vi: "Kim Cương", en: "Diamond" },
  { id: "gold", min: 80, icon: "🥇", vi: "Vàng", en: "Gold" },
  { id: "silver", min: 30, icon: "🥈", vi: "Bạc", en: "Silver" },
  { id: "bronze", min: 0, icon: "🥉", vi: "Đồng", en: "Bronze" },
] as const;

export function tierOf(points: number) {
  return TIERS.find((t) => points >= t.min)!;
}

/** The next tier up and the points still needed (null at the top) */
export function nextTier(points: number) {
  const up = [...TIERS].reverse().find((t) => t.min > points);
  return up ? { tier: up, need: up.min - points } : null;
}

const VN_OFFSET_MS = 7 * 3600_000;

/** Season key, e.g. "2026-10", for a moment in time (Vietnam time) */
export function seasonOf(at: Date): string {
  const d = new Date(at.getTime() + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Vietnam calendar day, e.g. "2026-10-05" */
export function vnDay(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** When a season ends: midnight Vietnam time at the start of the next month */
export function seasonEnd(season: string): Date {
  const [y, m] = season.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1) - VN_OFFSET_MS);
}

/** The season before this one */
export function previousSeason(season: string): string {
  const [y, m] = season.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface LeagueRow {
  rank: number;
  username: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  /** Last results, newest first: "W" or "L" */
  form: string[];
}

export interface LeagueView {
  season: string;
  endsAt: string;
  prizes: number[];
  participation: { games: number; prize: number };
  table: LeagueRow[];
  me: LeagueRow | null;
  todayBonusTaken: boolean;
  past: { season: string; champion: string; points: number }[];
  serverNow: string;
}
