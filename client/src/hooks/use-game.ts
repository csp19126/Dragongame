import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Achievement, PublicUser } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { ME_KEY } from "@/hooks/use-auth";

export const STATE_KEY = ["/api/game/state"];

export interface GameStateResponse {
  balance: number;
  streak: number;
  maxStreak: number;
  totalWins: number;
  maxWin: number;
  gamesPlayed: number;
  freeSpins: number;
  freeSpinBet: number;
  blessed: boolean;
  /** Multiplier the waiting blessing gives the next spin (1 when none) */
  blessing: number;
  oracleStick: number | null;
  freeSpinMult: number;
  /** Free-spin units won and waiting for the player's pick */
  pendingFreeSpinUnits: number;
  gambleAmount: number;
  gambleRounds: number;
  /** HOLD offered for the next spin, at this bet */
  holdOffer: boolean;
  holdBet: number | null;
  lastOracleAt: string | null;
  lastDailyBonusAt: string | null;
}

export interface LineWin {
  line: number;
  symbol: string;
  count: number;
  amount: number;
  withWild: boolean;
  upgrade: boolean;
}

export interface SpinStep {
  grid: string[][];
  held: string[];
  lineWins: LineWin[];
  multiplier: number;
  win: number;
}

export interface SpinResponse {
  steps: SpinStep[];
  grid: string[][];
  winLines: number[];
  lineWins: LineWin[];
  repeats: number;
  scatterCount: number;
  scatterWin: number;
  /** Everything credited: slot win plus any jackpot */
  winAmount: number;
  gameWin: number;
  jackpotHit: boolean;
  jackpotWin: number;
  jackpotPool: number | null;
  freeSpinUnits: number;
  pendingFreeSpinUnits: number;
  freeSpinMult: number;
  blessing: number;
  gambleAmount: number;
  holdOffer: boolean;
  holdBet: number | null;
  heldReels: number[];
  dragonLine: boolean;
  bet: number;
  isFreeSpin: boolean;
  blessed: boolean;
  newBalance: number;
  totalFreeSpins: number;
  streak: number;
  totalWins: number;
  maxWin: number;
  gamesPlayed: number;
  newAchievements: Achievement[];
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  balance: number;
  totalWins: number;
  maxWin: number;
  maxStreak: number;
}

export function useGameState(enabled = true) {
  return useQuery<GameStateResponse>({ queryKey: STATE_KEY, enabled });
}

/** Push a new balance into every cache that shows it */
export function useSetBalance() {
  const qc = useQueryClient();
  return (balance: number, extra: Partial<GameStateResponse> = {}) => {
    qc.setQueryData<GameStateResponse>(STATE_KEY, (old) => (old ? { ...old, balance, ...extra } : old));
    qc.setQueryData<PublicUser | null>(ME_KEY, (old) => (old ? { ...old, balance } : old));
  };
}

export function useSpin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ betAmount, hold }: { betAmount: number; hold?: number[] }) =>
      (await apiRequest("POST", "/api/game/spin", { betAmount, ...(hold?.length ? { hold } : {}) })).json() as Promise<SpinResponse>,
    onSuccess: (data) => {
      // Balance is applied by the slot machine once the reels stop, so the
      // header doesn't reveal the result before the animation does.
      if (data.newAchievements.length) qc.invalidateQueries({ queryKey: ["/api/achievements"] });
    },
  });
}

export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({ queryKey: ["/api/game/leaderboard"], refetchInterval: 30_000 });
}

export function useAchievements(userId: string | undefined) {
  return useQuery<Achievement[]>({ queryKey: ["/api/achievements", userId], enabled: !!userId });
}

export function useRecentWins() {
  return useQuery<{ user: string; amount: number; multiple: number; at: number }[]>({
    queryKey: ["/api/game/recent-wins"],
    refetchInterval: 15_000,
  });
}

export const JACKPOT_KEY = ["/api/game/jackpot"];

export interface JackpotResponse {
  amount: number;
  lastWinner: string | null;
  lastAmount: number | null;
  lastWonAt: string | null;
}

/** The shared Hũ Rồng pot, refreshed every 10 seconds so everyone sees it grow */
export function useJackpot() {
  return useQuery<JackpotResponse>({ queryKey: JACKPOT_KEY, refetchInterval: 10_000, staleTime: 5_000 });
}
