import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

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
    queryKey: ["/api/leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const getMedalEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  return (
    <div className="bg-gradient-to-b from-purple-950 to-purple-900 rounded-[2rem] border-2 border-yellow-500/30 p-6 max-w-2xl w-full">
      <h2 className="text-2xl font-display font-black uppercase tracking-widest text-yellow-400 mb-6 text-center">
        🏆 Dragon Leaderboard
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
                <div className="text-2xl font-black min-w-12">{getMedalEmoji(entry.rank)}</div>
                <div>
                  <div className="font-bold text-yellow-100">{entry.username}</div>
                  <div className="text-xs text-yellow-100/50">Wins: {entry.totalWins} | Best: ¥{entry.maxWin}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-display font-black text-yellow-400">¥{entry.balance.toLocaleString()}</div>
                <div className="text-xs text-yellow-100/50">🔥 {entry.maxStreak}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
