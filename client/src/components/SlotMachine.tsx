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
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 15 }}
        className="slot-machine-frame p-8 rounded-[2rem] w-full relative"
      >
        {/* Decorative Top */}
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-gradient-to-b from-yellow-300 to-yellow-500 text-red-900 px-8 py-2 rounded-full font-bold border-4 border-red-800 shadow-[0_5px_15px_rgba(0,0,0,0.3)] z-10 whitespace-nowrap text-lg uppercase tracking-widest">
           ✨ VnSlot 888 ✨
        </div>

        {/* Reels */}
        <div className="bg-gradient-to-b from-gray-900 to-black rounded-2xl border-4 border-yellow-500/50 p-4 flex justify-between items-center h-56 reel-container overflow-hidden shadow-[inset_0_10px_30px_rgba(0,0,0,1)] gap-3">
          {reels.map((symbol, i) => (
            <div key={i} className="flex-1 h-full bg-gradient-to-b from-white to-gray-200 rounded-xl border-2 border-yellow-600/30 flex items-center justify-center text-7xl shadow-xl relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
               <AnimatePresence mode="popLayout">
                 <motion.div
                   key={isSpinning ? `spinning-${i}-${Math.random()}` : symbol}
                   initial={{ y: isSpinning ? -150 : -20, opacity: 0 }}
                   animate={{ y: 0, opacity: 1 }}
                   exit={{ y: 150, opacity: 0 }}
                   transition={{ 
                     type: "spring", 
                     stiffness: isSpinning ? 300 : 200, 
                     damping: 20,
                     delay: i * 0.1 
                   }}
                   className="absolute inset-0 flex items-center justify-center filter drop-shadow-md"
                 >
                   {symbol}
                 </motion.div>
               </AnimatePresence>
            </div>
          ))}
        </div>
        
        {/* Machine details */}
        <div className="mt-6 flex justify-between items-center text-yellow-100 px-4">
           <div className="flex flex-col">
             <span className="text-xs uppercase tracking-[0.2em] text-yellow-500/80 font-bold">{t.win}</span>
             <motion.span 
               key={lastWin}
               initial={{ scale: 1.5, color: "#fcd34d" }}
               animate={{ scale: 1, color: "#fbbf24" }}
               className="font-mono text-3xl font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
             >
               {lastWin.toLocaleString()}
             </motion.span>
           </div>
           <div className="h-12 w-12 rounded-full border-2 border-yellow-500/30 flex items-center justify-center bg-black/20">
              <Coins className="w-6 h-6 text-yellow-400 animate-bounce" />
           </div>
        </div>
      </motion.div>

      {/* Controls */}
      <div className="w-full bg-white/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] space-y-8">
        {/* Bet Selector */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <span className="font-black text-xl uppercase tracking-tighter gold-gradient-text">{t.bet}</span>
            <span className="font-mono text-2xl text-yellow-400/90 font-bold">{bet}</span>
          </div>
          <div className="flex gap-3">
            {[10, 50, 100, 500].map((amount) => (
              <button
                key={amount}
                onClick={() => setBet(amount)}
                className={`flex-1 py-3 rounded-2xl font-black transition-all duration-300 border-2 ${
                  bet === amount 
                    ? "bg-yellow-500 text-purple-900 border-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.4)] scale-105" 
                    : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
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
            className="flex-1 h-20 text-3xl font-display uppercase tracking-[0.1em] purple-button text-yellow-300 border-yellow-500/50 rounded-2xl"
          >
            {isSpinning ? <Loader2 className="animate-spin w-10 h-10" /> : t.spin}
          </Button>
          
          <Button
            variant="outline"
            onClick={handleAiAdvice}
            className="h-20 w-20 rounded-2xl border-2 border-white/10 bg-white/5 hover:bg-white/10 text-yellow-400 group transition-all duration-500"
            title={t.aiPredict}
          >
            <Brain className="w-8 h-8 group-hover:scale-125 transition-transform" />
          </Button>
        </div>
      </div>
    </div>
  );
}
