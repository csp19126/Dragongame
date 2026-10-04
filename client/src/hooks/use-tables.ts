import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Achievement } from "@shared/schema";
import type { BauCuaSymbol, RouletteBet } from "@shared/tablegames";
import { apiRequest } from "@/lib/queryClient";

interface TableStats {
  totalBet: number;
  winAmount: number;
  newBalance: number;
  totalWins: number;
  maxWin: number;
  gamesPlayed: number;
  newAchievements: Achievement[];
}

export interface BauCuaResponse extends TableStats {
  dice: BauCuaSymbol[];
  returns: Partial<Record<BauCuaSymbol, number>>;
}

export interface RouletteResponse extends TableStats {
  number: number;
  bets: (RouletteBet & { returned: number })[];
}

function useTableGame<B, R extends TableStats>(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bets: B) => (await apiRequest("POST", path, { bets })).json() as Promise<R>,
    onSuccess: (data) => {
      // The balance is applied by the page once the animation ends
      if (data.newAchievements.length) qc.invalidateQueries({ queryKey: ["/api/achievements"] });
    },
  });
}

export const useBauCua = () => useTableGame<Partial<Record<BauCuaSymbol, number>>, BauCuaResponse>("/api/games/baucua");
export const useRoulette = () => useTableGame<RouletteBet[], RouletteResponse>("/api/games/roulette");
