import { motion } from "framer-motion";

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

interface AchievementBadgeProps {
  badge: Badge;
  onUnlock?: () => void;
}

export function AchievementBadge({ badge, onUnlock }: AchievementBadgeProps) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.1 }}
      className="flex flex-col items-center gap-2"
    >
      <motion.div
        animate={
          badge.unlocked
            ? { 
                scale: [1, 1.2, 1],
                boxShadow: ['0 0 0px rgba(251,191,36,0)', '0 0 20px rgba(251,191,36,0.6)', '0 0 0px rgba(251,191,36,0)']
              }
            : {}
        }
        transition={{ duration: 0.6, repeat: badge.unlocked ? Infinity : 0 }}
        className={`w-16 h-16 rounded-full flex items-center justify-center text-4xl border-4 ${
          badge.unlocked
            ? 'bg-gradient-to-br from-yellow-500 to-orange-500 border-yellow-300 shadow-[0_0_15px_rgba(251,191,36,0.4)]'
            : 'bg-gray-700 border-gray-600 opacity-40'
        }`}
      >
        {badge.icon}
      </motion.div>
      <div className={`text-xs font-black uppercase text-center ${badge.unlocked ? 'text-yellow-400' : 'text-gray-400'}`}>
        {badge.name}
      </div>
    </motion.div>
  );
}
