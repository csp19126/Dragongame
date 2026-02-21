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

  if (isAuthLoading || (user && isGameLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
        {!user ? (
          // Landing Hero for non-logged in users
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-8 max-w-2xl"
          >
            <div className="relative inline-block">
              <h1 className="text-6xl md:text-8xl font-display gold-gradient-text drop-shadow-xl p-4">
                VnSlot
              </h1>
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute -top-12 -right-12 text-6xl opacity-20 pointer-events-none"
              >
                🏮
              </motion.div>
            </div>
            
            <p className="text-xl md:text-2xl text-muted-foreground">
              Experience the luck of the Dragon in the most exciting Vietnamese-style slot game.
            </p>

            <Link href="/auth">
              <Button size="lg" className="text-xl px-12 py-8 rounded-full shadow-2xl shadow-primary/30 animate-pulse bg-gradient-to-r from-primary to-orange-600 hover:scale-105 transition-transform">
                {t.playNow}
              </Button>
            </Link>

            <div className="grid grid-cols-3 gap-4 mt-12 opacity-80">
              <div className="flex flex-col items-center">
                <span className="text-4xl mb-2">💰</span>
                <span className="font-bold text-sm">Big Wins</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-4xl mb-2">🧧</span>
                <span className="font-bold text-sm">Lucky Money</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-4xl mb-2">⚡</span>
                <span className="font-bold text-sm">Fast Payouts</span>
              </div>
            </div>
          </motion.div>
        ) : (
          // Game UI for logged in users
          <div className="w-full max-w-4xl mx-auto space-y-8">
            <SlotMachine balance={gameState?.balance ?? user.balance} />
            
            {/* VIP Status Badge (Static MVP) */}
            <div className="flex justify-center">
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-yellow-500 px-6 py-2 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-lg">
                <span className="text-xl">👑</span>
                <span className="font-display tracking-widest text-sm">VIP LEVEL 1</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Decorative footer elements */}
      <div className="fixed bottom-0 left-0 w-full h-32 bg-gradient-to-t from-background to-transparent pointer-events-none z-0" />
      <div className="fixed bottom-4 left-4 text-4xl opacity-10 pointer-events-none">🎍</div>
      <div className="fixed bottom-4 right-4 text-4xl opacity-10 pointer-events-none">🌸</div>
    </div>
  );
}
