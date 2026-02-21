import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpin } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import { Coins, Sparkles, Loader2, Brain } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const SYMBOLS = ["🐉", "🐯", "🐢", "🌺", "🪙", "🏮"];

// Helper to get random symbol for initial state
const getRandomSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

export function SlotMachine({ balance }: { balance: number }) {
  const { t } = useLang();
  const { toast } = useToast();
  const spinMutation = useSpin();
  const queryClient = useQueryClient();
  
  const [reels, setReels] = useState([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [bet, setBet] = useState(10);
  const [lastWin, setLastWin] = useState(0);

  const handleSpin = async () => {
    if (balance < bet) {
      toast({
        title: "Insufficient Balance",
        description: "Please top up to continue playing!",
        variant: "destructive",
      });
      return;
    }

    setIsSpinning(true);
    setLastWin(0);

    try {
      // Start spin animation (visual only)
      const interval = setInterval(() => {
        setReels([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);
      }, 100);

      // Perform actual API call
      const result = await spinMutation.mutateAsync({ slotId: "main", betAmount: bet });

      // Stop animation after a delay and show result
      setTimeout(() => {
        clearInterval(interval);
        setReels(result.result);
        setIsSpinning(false);
        
        if (result.winAmount > 0) {
          setLastWin(result.winAmount);
          if (result.isJackpot) {
            triggerJackpotConfetti();
            toast({
              title: t.jackpot,
              className: "bg-yellow-500 text-black border-yellow-600 font-bold text-xl",
            });
          } else {
            toast({
              title: `${t.win} +${result.winAmount}`,
              className: "bg-green-600 text-white border-green-700",
            });
          }
        }
      }, 1500); // 1.5s spin duration
    } catch (error) {
      setIsSpinning(false);
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleAiAdvice = async () => {
    // Manually fetch prediction
    try {
      const res = await fetch("/api/ai/predict");
      const data = await res.json();
      toast({
        title: t.aiAdviceTitle,
        description: data.advice,
        className: "bg-purple-600 text-white border-purple-700",
      });
    } catch (e) {
        // ignore
    }
  };

  const triggerJackpotConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#fcd34d', '#ef4444'] // Gold and Red
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#fcd34d', '#ef4444']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-lg mx-auto p-4">
      {/* Slot Frame */}
      <div className="slot-machine-frame p-6 rounded-3xl w-full relative">
        {/* Decorative Top */}
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-red-900 px-6 py-1 rounded-full font-bold border-4 border-red-800 shadow-lg z-10 whitespace-nowrap">
           VnSlot 888 
        </div>

        {/* Reels */}
        <div className="bg-white rounded-xl border-4 border-gray-800 p-4 flex justify-between items-center h-48 reel-container overflow-hidden shadow-inner gap-2">
          {reels.map((symbol, i) => (
            <div key={i} className="flex-1 h-full bg-gray-100 rounded-lg border-2 border-gray-300 flex items-center justify-center text-6xl shadow-inner relative overflow-hidden">
               <AnimatePresence mode="popLayout">
                 <motion.div
                   key={isSpinning ? Math.random() : symbol}
                   initial={{ y: isSpinning ? -100 : 0, opacity: 0.5 }}
                   animate={{ y: 0, opacity: 1 }}
                   exit={{ y: 100, opacity: 0.5 }}
                   transition={{ duration: 0.1 }}
                   className="absolute inset-0 flex items-center justify-center"
                 >
                   {symbol}
                 </motion.div>
               </AnimatePresence>
            </div>
          ))}
        </div>
        
        {/* Machine details */}
        <div className="mt-4 flex justify-between items-center text-yellow-100 px-2">
           <div className="flex items-center gap-2">
             <span className="text-sm uppercase tracking-wider opacity-80">{t.win}:</span>
             <span className="font-mono text-xl text-yellow-400 font-bold">{lastWin}</span>
           </div>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full bg-card/80 backdrop-blur-md p-6 rounded-2xl border border-border shadow-xl space-y-6">
        {/* Bet Selector */}
        <div className="flex justify-between items-center">
          <span className="font-bold text-lg text-primary">{t.bet}</span>
          <div className="flex gap-2">
            {[10, 50, 100].map((amount) => (
              <button
                key={amount}
                onClick={() => setBet(amount)}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${
                  bet === amount 
                    ? "bg-primary text-primary-foreground shadow-lg scale-105" 
                    : "bg-secondary/20 hover:bg-secondary/40 text-foreground"
                }`}
              >
                {amount}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button 
            onClick={handleSpin} 
            disabled={isSpinning}
            className="flex-1 h-16 text-2xl font-display uppercase tracking-widest bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 border-b-4 border-red-800 active:border-b-0 active:translate-y-1 transition-all shadow-xl hover:shadow-red-500/25"
          >
            {isSpinning ? <Loader2 className="animate-spin w-8 h-8" /> : t.spin}
          </Button>
          
          <Button
            variant="outline"
            onClick={handleAiAdvice}
            className="h-16 w-16 rounded-xl border-2 border-purple-200 hover:bg-purple-50 hover:border-purple-300 text-purple-600"
            title={t.aiPredict}
          >
            <Brain className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}
