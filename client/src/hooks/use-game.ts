import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface GameStateResponse {
  balance: number;
  gameStates: any[];
  streak: number;
  maxStreak: number;
  totalWins: number;
  maxWin: number;
  gamesPlayed: number;
  upstreamErrors?: string;
}

export interface SpinResponse {
  grid: string[][];
  winLines: number[];
  winAmount: number;
  newBalance: number;
  freeSpinsAwarded: number;
  totalFreeSpins: number;
  isJackpot: boolean;
  isBonusRound?: boolean;
  isRepeater?: boolean;
  isFakeRepeater?: boolean;
  isNearMiss?: boolean;
  multiplier?: number;
  streak: number;
  totalWins: number;
  maxWin: number;
  gamesPlayed: number;
  newAchievements?: any[];
  upstreamErrors: string;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  balance: number;
  totalWins: number;
  maxWin: number;
  maxStreak: number;
}

export interface AchievementEntry {
  id: number;
  userId: string;
  badgeId: string;
  badgeName: string;
  description: string;
  icon: string;
  unlockedAt: string;
}

export function useGameState() {
  return useQuery<GameStateResponse>({
    queryKey: ["/api/game/state"],
    queryFn: async () => {
      const res = await fetch("/api/game/state");
      if (!res.ok) throw new Error("Failed to fetch game state");
      return res.json();
    }
  });
}

export function useSpin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slotId, betAmount }: { slotId: string; betAmount: number }) => {
      const res = await fetch("/api/game/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, betAmount }),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Spin failed");
      }
      return res.json() as Promise<SpinResponse>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/game/state"], (old: GameStateResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          balance: data.newBalance,
          streak: data.streak,
          totalWins: data.totalWins,
          maxWin: data.maxWin,
          gamesPlayed: data.gamesPlayed,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });
}

export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/game/leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/game/leaderboard");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    refetchInterval: 30000,
  });
}

export function useAchievements(userId: string | undefined) {
  return useQuery<AchievementEntry[]>({
    queryKey: ["/api/achievements", userId],
    queryFn: async () => {
      const res = await fetch(`/api/achievements/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch achievements");
      return res.json();
    },
    enabled: !!userId,
  });
}

export function useAiPredict() {
  return useQuery<{ advice: string }>({
    queryKey: ["/api/ai/predict"],
    queryFn: async () => {
      const res = await fetch("/api/ai/predict");
      if (!res.ok) throw new Error("Failed to fetch advice");
      return res.json();
    },
    enabled: false,
  });
}
