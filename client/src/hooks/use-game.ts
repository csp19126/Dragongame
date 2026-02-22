import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface GameStateResponse {
  balance: number;
  gameStates: any[]; 
}

export interface SpinResponse {
  result: string[]; 
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
        };
      });
      // Also update auth user balance if possible, but state is main
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
