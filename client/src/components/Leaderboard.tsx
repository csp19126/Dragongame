import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Crown, Flame } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  username: string;
  balance: number;
  totalWins: number;
  maxWin: number;
  maxStreak: number;
}

export function Leaderboard() {
  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/game/leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/game/leaderboard");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-400" />;
    if (rank === 2) return <Crown className="w-5 h-5 text-gray-300" />;
    if (rank === 3) return <Crown className="w-5 h-5 text-orange-400" />;
    return <span className="text-sm font-black text-yellow-100/60">#{rank}</span>;
  };

  return (
    <div data-testid="leaderboard" className="bg-gradient-to-b from-purple-950 to-purple-900 rounded-[2rem] border-2 border-yellow-500/30 p-6 max-w-2xl w-full">
      <h2 data-testid="leaderboard-title" className="text-2xl font-display font-black uppercase tracking-widest text-yellow-400 mb-6 text-center flex items-center justify-center gap-2">
        <Trophy className="w-6 h-6" /> Dragon Leaderboard
      </h2>

      {isLoading ? (
        <div className="text-center text-yellow-100/60">Loading rankings...</div>
      ) : entries.length === 0 ? (
        <div className="text-center text-yellow-100/60">No players yet. Be the first!</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <motion.div
              key={entry.rank}
              data-testid={`leaderboard-entry-${entry.rank}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                entry.rank === 1
                  ? 'bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border-yellow-400/50'
                  : 'bg-purple-800/30 border-yellow-500/20 hover:border-yellow-500/40'
              } transition-all`}
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="min-w-10 flex items-center justify-center">{getRankIcon(entry.rank)}</div>
                <div>
                  <div data-testid={`leaderboard-username-${entry.rank}`} className="font-bold text-yellow-100">{entry.username}</div>
                  <div className="text-xs text-yellow-100/50">Wins: {entry.totalWins} | Best: {entry.maxWin.toLocaleString()}</div>
                </div>
              </div>
              <div className="text-right">
                <div data-testid={`leaderboard-balance-${entry.rank}`} className="text-2xl font-display font-black text-yellow-400">{entry.balance.toLocaleString()}</div>
                <div className="text-xs text-yellow-100/50 flex items-center justify-end gap-1">
                  <Flame className="w-3 h-3" /> {entry.maxStreak}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
