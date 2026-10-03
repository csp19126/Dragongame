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
  lastOracleAt: string | null;
  lastDailyBonusAt: string | null;
}

export interface SpinResponse {
  grid: string[][];
  winLines: number[];
  winAmount: number;
  freeSpinsAwarded: number;
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
    mutationFn: async (betAmount: number) =>
      (await apiRequest("POST", "/api/game/spin", { betAmount })).json() as Promise<SpinResponse>,
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
