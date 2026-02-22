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

  // If auth is loading, show spinner
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, show landing page
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col selection:bg-primary selection:text-white">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center space-y-12 max-w-3xl"
          >
            <div className="relative inline-block group">
              <motion.div
                animate={{ 
                  filter: ["drop-shadow(0 0 20px rgba(139, 92, 246, 0.3))", "drop-shadow(0 0 40px rgba(139, 92, 246, 0.6))", "drop-shadow(0 0 20px rgba(139, 92, 246, 0.3))"]
                }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <h1 className="text-7xl md:text-9xl font-display gold-gradient-text drop-shadow-2xl py-8 px-4 leading-tight">
                  VnSlot
                </h1>
              </motion.div>
              <motion.div 
                animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute -top-16 -right-16 text-8xl opacity-30 pointer-events-none filter blur-[1px]"
              >
                🏮
              </motion.div>
            </div>
            
            <p className="text-2xl md:text-3xl font-light text-muted-foreground/80 tracking-wide max-w-xl mx-auto leading-relaxed">
              Unlock the secrets of the <span className="text-primary font-bold">Dragon</span> in our premium Vietnamese slot experience.
            </p>

            <Link href="/auth">
              <Button size="lg" className="text-2xl px-16 py-10 rounded-[2rem] shadow-[0_20px_40px_-10px_rgba(139,92,246,0.5)] bg-gradient-to-r from-primary via-purple-600 to-accent hover:scale-105 transition-all duration-500 font-display tracking-widest group">
                <span className="group-hover:tracking-[0.2em] transition-all duration-500">{t.playNow}</span>
              </Button>
            </Link>

            <div className="grid grid-cols-3 gap-8 mt-20">
              {[
                { icon: "💰", label: "Massive Wins" },
                { icon: "🧧", label: "Lucky Daily" },
                { icon: "✨", label: "Royal Perks" }
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 0.8, y: 0 }}
                  transition={{ delay: 0.5 + (i * 0.2) }}
                  className="flex flex-col items-center group cursor-default"
                >
                  <span className="text-5xl mb-4 group-hover:scale-125 transition-transform duration-300">{item.icon}</span>
                  <span className="font-black text-xs uppercase tracking-[0.3em] text-primary/60">{item.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </main>
        {/* Decorative background elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 z-0">
          <motion.div 
            animate={{ y: [0, -20, 0] }} 
            transition={{ duration: 6, repeat: Infinity }}
            className="absolute top-1/4 -left-12 text-9xl blur-sm"
          >
            🐉
          </motion.div>
          <motion.div 
            animate={{ y: [0, 20, 0] }} 
            transition={{ duration: 8, repeat: Infinity }}
            className="absolute bottom-1/4 -right-12 text-9xl blur-sm"
          >
            🐢
          </motion.div>
        </div>
        <div className="fixed bottom-0 left-0 w-full h-64 bg-gradient-to-t from-primary/10 to-transparent pointer-events-none z-0" />
      </div>
    );
  }

  // If logged in, show game UI
  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary selection:text-white">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative z-10">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full max-w-4xl mx-auto space-y-12 py-8"
        >
          {isGameLoading ? (
            <div className="flex justify-center p-20">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
            </div>
          ) : (
            <SlotMachine balance={gameState?.balance ?? user.balance} />
          )}
          
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="flex justify-center"
          >
            <div className="bg-gradient-to-r from-gray-950 to-gray-900 text-yellow-500 px-10 py-4 rounded-3xl border-2 border-yellow-500/40 flex items-center gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
              <span className="text-3xl animate-pulse">👑</span>
              <div className="flex flex-col">
                <span className="font-display tracking-[0.3em] text-sm text-yellow-400">ROYAL VIP</span>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Level 1 Privelege</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </main>

      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 z-0">
        <motion.div 
          animate={{ y: [0, -20, 0] }} 
          transition={{ duration: 6, repeat: Infinity }}
          className="absolute top-1/4 -left-12 text-9xl blur-sm"
        >
          🐉
        </motion.div>
        <motion.div 
          animate={{ y: [0, 20, 0] }} 
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute bottom-1/4 -right-12 text-9xl blur-sm"
        >
          🐢
        </motion.div>
      </div>
      
      <div className="fixed bottom-0 left-0 w-full h-64 bg-gradient-to-t from-primary/10 to-transparent pointer-events-none z-0" />
    </div>
  );
}
