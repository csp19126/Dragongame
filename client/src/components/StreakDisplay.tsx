import { motion } from "framer-motion";

interface StreakDisplayProps {
  streak: number;
  maxStreak: number;
}

export function StreakDisplay({ streak, maxStreak }: StreakDisplayProps) {
  return (
    <motion.div
      animate={streak > 0 ? { scale: [1, 1.1, 1] } : {}}
      transition={{ duration: 0.3, repeat: Infinity }}
      className="bg-gradient-to-r from-orange-600 to-red-600 rounded-2xl px-6 py-4 border-2 border-orange-300 shadow-[0_0_20px_rgba(234,88,12,0.4)]"
    >
      <div className="text-center">
        <div className="text-xs font-black uppercase tracking-wider text-white/80">🔥 Streak</div>
        <div className="text-4xl font-display font-black text-yellow-300">{streak}</div>
        <div className="text-xs text-orange-100/60 mt-1">Max: {maxStreak}</div>
      </div>

      {streak > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 space-y-1"
        >
          {streak > 2 && <div className="text-center text-sm font-bold text-yellow-200">🎯 On Fire!</div>}
          {streak > 5 && <div className="text-center text-sm font-bold text-red-200">⚡ Unstoppable!</div>}
          {streak > 10 && <div className="text-center text-sm font-bold text-white">👑 Dragon Mode!</div>}
        </motion.div>
      )}
    </motion.div>
  );
}
