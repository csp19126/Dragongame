import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpin } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import { Coins, Sparkles, Loader2, Brain } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const SYMBOLS = ["🐉", "🧧", "🏮", "💎", "🪙", "🎎"];

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
  const [freeSpins, setFreeSpins] = useState(0);

  const handleSpin = async () => {
    if (balance < bet && freeSpins === 0) {
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
      // Start independent spin animations for all reels
      const intervals = reels.map((_, i) => {
        return setInterval(() => {
          setReels(prev => {
            const next = [...prev];
            next[i] = getRandomSymbol();
            return next;
          });
        }, 80 + (i * 30)); // Staggered speeds for more realism
      });

      // Perform actual API call
      const result = await spinMutation.mutateAsync({ slotId: "main", betAmount: bet });

      // Stop animations with a staggered delay
      result.result.forEach((symbol, i) => {
        setTimeout(() => {
          clearInterval(intervals[i]);
          setReels(prev => {
            const next = [...prev];
            next[i] = symbol;
            return next;
          });
          
          // If it's the last reel, finish the spin
          if (i === result.result.length - 1) {
            setIsSpinning(false);
            setFreeSpins(result.totalFreeSpins);
            
            if (result.winAmount > 0) {
              setLastWin(result.winAmount);
              if (result.isJackpot || result.winAmount >= bet * 10) {
                triggerJackpotConfetti();
              }
              toast({
                title: result.isJackpot ? t.jackpot : (result.winAmount >= bet * 5 ? "🔥 BIG WIN! 🔥" : `${t.win} +${result.winAmount}`),
                className: result.winAmount >= bet * 5
                  ? "bg-yellow-500 text-purple-950 border-yellow-600 font-bold text-xl"
                  : "bg-purple-900 text-yellow-100 border-yellow-500/20",
              });
            }

            if (result.freeSpinsAwarded > 0) {
              toast({
                title: `✨ ${result.freeSpinsAwarded} Free Spins Awarded! ✨`,
                className: "bg-purple-900 text-yellow-100 border-yellow-500",
              });
            }
          }
        }, 1000 + (i * 600)); // Staggered stop times
      });
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
        className: "bg-purple-900 text-yellow-100 border-yellow-500/20",
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
    <div className="flex flex-col items-center gap-8 w-full max-w-lg mx-auto p-4 relative">
      {/* Big Win Overlay */}
      <AnimatePresence>
        {lastWin >= bet * 5 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <motion.div 
              animate={{ 
                rotate: [0, -5, 5, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="bg-yellow-500 text-purple-900 p-12 rounded-[3rem] text-center shadow-[0_0_100px_#eab308] border-8 border-white"
            >
              <div className="text-4xl font-black uppercase mb-2">💰 BIG WIN 💰</div>
              <div className="text-6xl font-display font-black">${lastWin.toLocaleString()}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slot Frame */}
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 15 }}
        className="slot-machine-frame p-10 rounded-[4rem] w-full relative bg-[#4c1d95] border-[12px] border-[#31106e] shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden"
      >
        {/* Animated Glow */}
        <motion.div
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-purple-500/20 pointer-events-none"
        />
        {/* Decorative Top */}
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-gradient-to-b from-yellow-300 to-yellow-500 text-red-900 px-8 py-2 rounded-full font-bold border-4 border-red-800 shadow-[0_5px_15px_rgba(0,0,0,0.3)] z-10 whitespace-nowrap text-lg uppercase tracking-widest">
           ✨ VnSlot 888 ✨
        </div>

        {/* Reels */}
        <div className="bg-[#1a0b3c] rounded-[2.5rem] border-[10px] border-[#3d1a8a] p-6 flex justify-between items-center h-80 reel-container overflow-hidden shadow-[inset_0_20px_50px_rgba(0,0,0,0.8)] gap-6">
          {reels.map((symbol, i) => {
            const isNearMiss = !isSpinning && lastWin === 0 && (
              (reels[0] === reels[1] && i < 2) || 
              (reels[1] === reels[2] && i > 0) || 
              (reels[0] === reels[2] && (i === 0 || i === 2))
            );
            
            return (
              <div key={i} className={`flex-1 h-full bg-[#2a1061] rounded-2xl border-[3px] flex items-center justify-center text-8xl shadow-2xl relative overflow-hidden transition-all duration-500 ${isNearMiss ? "border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)]" : "border-[#4a2b9d]"}`}>
                 <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                 <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] pointer-events-none" />
                 {isNearMiss && (
                   <motion.div 
                     animate={{ opacity: [0, 0.2, 0] }}
                     transition={{ duration: 1, repeat: Infinity }}
                     className="absolute inset-0 bg-red-500/10 pointer-events-none"
                   />
                 )}
                 <AnimatePresence mode="popLayout">
                   <motion.div
                     key={isSpinning ? `spinning-${i}-${Math.random()}` : symbol}
                     initial={{ y: isSpinning ? -150 : -20, opacity: 0 }}
                     animate={{ y: 0, opacity: 1 }}
                     exit={{ y: 150, opacity: 0 }}
                     transition={{ 
                       type: "spring", 
                       stiffness: isSpinning ? 400 : 150, 
                       damping: isSpinning ? 15 : 25,
                       delay: i * 0.05 
                     }}
                     className="absolute inset-0 flex items-center justify-center filter drop-shadow-md"
                   >
                     {symbol}
                   </motion.div>
                 </AnimatePresence>
              </div>
            );
          })}
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
      <div className="w-full bg-purple-950/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-yellow-500/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] space-y-8">
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
                    : "bg-purple-900/40 hover:bg-purple-800/60 text-yellow-100/70 border-yellow-500/10"
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
            className={`flex-1 h-20 text-3xl font-display uppercase tracking-[0.1em] purple-button border-yellow-500/50 rounded-2xl ${freeSpins > 0 ? "text-yellow-400 animate-pulse border-yellow-400" : "text-yellow-300"}`}
          >
            {isSpinning ? <Loader2 className="animate-spin w-10 h-10" /> : (freeSpins > 0 ? `Free (${freeSpins})` : t.spin)}
          </Button>
          
          <Button
            variant="outline"
            onClick={handleAiAdvice}
            className="h-20 w-20 rounded-2xl border-2 border-yellow-500/20 bg-purple-900/40 hover:bg-purple-800/60 text-yellow-400 group transition-all duration-500"
            title={t.aiPredict}
          >
            <Brain className="w-8 h-8 group-hover:scale-125 transition-transform" />
          </Button>
        </div>
      </div>
    </div>
  );
}
