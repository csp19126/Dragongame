import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface GameStateResponse {
  balance: number;
  gameStates: any[]; // Typed loosely for MVP
}

export interface SpinResponse {
  result: string[]; // Array of symbols like ["Dragon", "Coin", "Lotus"]
  winAmount: number;
  newBalance: number;
  freeSpinsAwarded: number;
  totalFreeSpins: number;
  isJackpot: boolean;
}

export interface LeaderboardEntry {
  username: string;
  balance: number;
}

export function useGameState() {
  return useQuery<GameStateResponse>({
    queryKey: ["/api/game/state"],
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
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Spin failed");
      }
      return res.json() as Promise<SpinResponse>;
    },
    onSuccess: (data) => {
      // Optimistically update balance if needed, but the response has new balance
      queryClient.setQueryData(["/api/game/state"], (old: GameStateResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          balance: data.newBalance,
        };
      });
    },
  });
}

export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/game/leaderboard"],
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useAiPredict() {
  return useQuery<{ advice: string }>({
    queryKey: ["/api/ai/predict"],
    enabled: false, // Only run when manually triggered
  });
}
