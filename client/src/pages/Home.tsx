import { useAuth } from "@/hooks/use-auth";
import { useGameState } from "@/hooks/use-game";
import { SlotMachine } from "@/components/SlotMachine";
import { Header } from "@/components/Header";
import { useLang } from "@/lib/lang-context";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { data: gameState, isLoading: isGameLoading } = useGameState();
  const { t } = useLang();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // LANDING PAGE - Epic and immersive
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col selection:bg-yellow-500 selection:text-purple-900 relative overflow-hidden">
        {/* Animated background orbs */}
        <motion.div
          animate={{ 
            x: [0, 100, -100, 0],
            y: [0, -50, 50, 0],
            scale: [1, 1.2, 0.9, 1]
          }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute top-10 left-10 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"
        />
        <motion.div
          animate={{ 
            x: [0, -100, 100, 0],
            y: [0, 50, -50, 0],
            scale: [1, 0.9, 1.2, 1]
          }}
          transition={{ duration: 25, repeat: Infinity, delay: 2 }}
          className="absolute bottom-10 right-10 w-96 h-96 bg-yellow-500/15 rounded-full blur-3xl pointer-events-none"
        />

        <Header />
        
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="text-center space-y-8 max-w-4xl"
          >
            {/* Main Title */}
            <motion.div 
              animate={{ 
                textShadow: ["0 0 20px rgba(234,179,8,0.3)", "0 0 60px rgba(234,179,8,0.6)", "0 0 20px rgba(234,179,8,0.3)"]
              }}
              transition={{ duration: 3, repeat: Infinity }}
              className="relative"
            >
              <h1 className="text-8xl md:text-9xl font-display font-black bg-gradient-to-r from-yellow-300 via-yellow-500 to-orange-500 bg-clip-text text-transparent leading-tight">
                VnSlot
              </h1>
              <p className="text-2xl md:text-4xl text-yellow-500/80 font-bold tracking-[0.3em] uppercase mt-4">888 Dragon Fortune</p>
            </motion.div>

            {/* Tagline */}
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="text-xl md:text-2xl text-yellow-100/70 max-w-2xl mx-auto leading-relaxed font-light"
            >
              Experience the legendary power of the <span className="text-yellow-400 font-bold">Dragon</span>. Win massive rewards, unlock bonus rounds, and claim your fortune in the ultimate Oriental slot experience.
            </motion.p>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 md:gap-8 mt-12 mb-8">
              {[
                { label: "MAX WIN", value: "$1M+", icon: "💰" },
                { label: "FREE SPINS", value: "∞", icon: "✨" },
                { label: "BONUS ROUNDS", value: "5+", icon: "🎁" }
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-yellow-500/30 rounded-2xl p-4 md:p-6 backdrop-blur-xl"
                >
                  <div className="text-3xl md:text-4xl mb-2">{stat.icon}</div>
                  <div className="text-yellow-500/70 text-xs uppercase tracking-widest font-black">{stat.label}</div>
                  <div className="text-yellow-400 text-2xl md:text-3xl font-display font-black mt-1">{stat.value}</div>
                </motion.div>
              ))}
            </div>

            {/* CTA Button */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link href="/auth">
                <Button size="lg" className="text-2xl px-20 py-12 rounded-[3rem] font-display font-black uppercase tracking-[0.2em] bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white border-4 border-yellow-300 shadow-[0_0_50px_rgba(234,179,8,0.6)] hover:shadow-[0_0_80px_rgba(234,179,8,0.8)] transition-all duration-300">
                  💎 Begin Your Quest 💎
                </Button>
              </Link>
            </motion.div>

            {/* Feature Row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 pt-8 border-t border-yellow-500/20"
            >
              {[
                { title: "REPEATER WINS", desc: "Chain matching symbols for exponential rewards" },
                { title: "WILD MULTIPLIERS", desc: "Unlock 2x, 5x, 10x bonus multipliers" },
                { title: "DRAGON JACKPOT", desc: "Hit the legendary jackpot for ultimate glory" }
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -5 }}
                  className="text-center"
                >
                  <h3 className="text-lg md:text-xl font-black text-yellow-400 uppercase tracking-widest mb-2">{feature.title}</h3>
                  <p className="text-yellow-100/60 text-sm md:text-base">{feature.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </main>
      </div>
    );
  }

  // GAME PAGE
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col selection:bg-primary selection:text-white">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative z-10">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full max-w-4xl mx-auto space-y-8 py-8"
        >
          {isGameLoading ? (
            <div className="flex justify-center p-20">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
            </div>
          ) : (
            <SlotMachine balance={gameState?.balance ?? user.balance} />
          )}
        </motion.div>
      </main>
    </div>
  );
}
