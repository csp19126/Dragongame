import { motion } from "framer-motion";
import { Flame, Zap, Crown, Target } from "lucide-react";

interface StreakDisplayProps {
  streak: number;
  maxStreak: number;
}

export function StreakDisplay({ streak, maxStreak }: StreakDisplayProps) {
  return (
    <motion.div
      data-testid="streak-display"
      animate={streak > 0 ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 0.5, repeat: streak > 0 ? Infinity : 0 }}
      className="bg-gradient-to-r from-orange-600 to-red-600 rounded-2xl px-6 py-4 border-2 border-orange-300 shadow-[0_0_20px_rgba(234,88,12,0.4)]"
    >
      <div className="text-center">
        <div className="text-xs font-black uppercase tracking-wider text-white/80 flex items-center justify-center gap-1">
          <Flame className="w-3 h-3" /> Streak
        </div>
        <div data-testid="streak-count" className="text-4xl font-display font-black text-yellow-300">{streak}</div>
        <div data-testid="streak-max" className="text-xs text-orange-100/60 mt-1">Max: {maxStreak}</div>
      </div>

      {streak > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 space-y-1"
        >
          {streak > 2 && (
            <div data-testid="streak-status-fire" className="text-center text-sm font-bold text-yellow-200 flex items-center justify-center gap-1">
              <Target className="w-4 h-4" /> On Fire!
            </div>
          )}
          {streak > 5 && (
            <div data-testid="streak-status-unstoppable" className="text-center text-sm font-bold text-red-200 flex items-center justify-center gap-1">
              <Zap className="w-4 h-4" /> Unstoppable!
            </div>
          )}
          {streak > 10 && (
            <div data-testid="streak-status-dragon" className="text-center text-sm font-bold text-white flex items-center justify-center gap-1">
              <Crown className="w-4 h-4" /> Dragon Mode!
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
