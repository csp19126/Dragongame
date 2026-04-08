import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useSpin } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { soundManager } from "@/lib/sound";
import confetti from "canvas-confetti";
import { 
  Loader2, Flame, Zap, Crown, RotateCw, Gift, Sparkles, 
  Volume2, VolumeX, Languages, Dice5, Wand2 
} from "lucide-react";

// RESTORING THE SOUL: Actual Emojis and Premium Glows
const SYMBOLS: Record<string, string> = {
  "dragon": "🐉", "red_envelope": "🧧", "lantern": "🏮", 
  "diamond": "💎", "coin": "🪙", "palace": "🏯", "sword": "⚔️"
};

const SYMBOL_GLOW: Record<string, string> = {
  "dragon": "0 0 40px #fbbf24", "red_envelope": "0 0 30px #ef4444", 
  "diamond": "0 0 40px #38bdf8", "coin": "0 0 30px #facc15"
};

const BET_AMOUNTS = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];

function AnimatedWinCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) return;
    let timer = setInterval(() => {
      start += Math.ceil(end / 20);
      if (start >= end) { setDisplay(end); clearInterval(timer); }
      else { setDisplay(start); }
    }, 40);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display.toLocaleString()}</span>;
}

export function SlotMachine({ balance }: { balance: number }) {
  const { t, lang, setLang } = useLang() as any;
  const { toast } = useToast();
  const spinMutation = useSpin() as any;
  const shakeControls = useAnimation();

  const [grid, setGrid] = useState<string[][]>([["dragon","coin","dragon"],["red_envelope","diamond","red_envelope"],["dragon","coin","dragon"]]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [bet, setBet] = useState(1000000); // Default to 1M for The Boss
  const [lastWin, setLastWin] = useState(0);
  const [winLines, setWinLines] = useState<number[]>([]);
  const [autoSpin, setAutoSpin] = useState(false);
  const [muted, setMuted] = useState(false);

  const handleSpin = useCallback(async () => {
    if (isSpinning || balance < bet) return;
    setIsSpinning(true);
    setWinLines([]);
    setLastWin(0);
    soundManager.spinStart();

    try {
      const result = await spinMutation.mutateAsync({ slotId: "main", betAmount: bet });
      
      // Simulate High-End Reel Timing
      setTimeout(() => {
        setGrid(result.grid);
        setIsSpinning(false);
        setWinLines(result.winLines);
        setLastWin(result.winAmount);

        if (result.winAmount > 0) {
          if (result.winAmount >= bet * 5) {
            confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 }, colors: ['#fbbf24', '#ef4444'] });
            shakeControls.start({ x: [0, -10, 10, -5, 5, 0], transition: { duration: 0.3 } });
          }
          soundManager.win(result.winAmount >= bet * 5);
        }
        if (autoSpin) setTimeout(handleSpin, 1200);
      }, 1000);
    } catch (err: any) {
      setIsSpinning(false);
      setAutoSpin(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [balance, bet, isSpinning, autoSpin]);

  return (
    <motion.div animate={shakeControls} className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto py-8">
      
      {/* EXPENSIVE HEADER */}
      <div className="w-full flex justify-between items-center bg-gradient-to-r from-indigo-950 to-purple-900 p-4 rounded-2xl border-2 border-yellow-500/30 shadow-2xl">
        <div className="flex gap-4">
          <Button variant="ghost" size="icon" onClick={() => setMuted(!muted)} className="text-yellow-400">
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="text-yellow-400">
            <Languages />
          </Button>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-yellow-500/60 font-black">{t.balance}</p>
          <p className="text-3xl font-mono font-black text-yellow-400 drop-shadow-md">{balance.toLocaleString()}đ</p>
        </div>
      </div>

      {/* THE MACHINE FRAME */}
      <div className="relative w-full aspect-square bg-[#0a051a] rounded-[3rem] p-6 border-8 border-yellow-700/50 shadow-[0_0_100px_rgba(0,0,0,1)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.1)_0%,transparent_70%)] pointer-events-none" />
        
        <div className="relative h-full grid grid-cols-3 gap-3 bg-black/80 rounded-3xl p-4 border-4 border-white/5 overflow-hidden">
          {grid.map((col, cIdx) => (
            <div key={cIdx} className="flex flex-col gap-3">
              {col.map((symbolKey, rIdx) => (
                <div key={rIdx} className="relative flex items-center justify-center aspect-square rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                   <motion.span 
                    animate={isSpinning ? { y: [0, 100], opacity: [1, 0] } : { scale: [0.5, 1], opacity: 1 }}
                    transition={isSpinning ? { repeat: Infinity, duration: 0.1 } : { type: "spring" }}
                    className="text-6xl sm:text-7xl"
                    style={{ textShadow: SYMBOL_GLOW[symbolKey] || "none" }}
                   >
                    {isSpinning ? "🎰" : SYMBOLS[symbolKey] || "❓"}
                   </motion.span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* WIN OVERLAY */}
        <AnimatePresence>
          {lastWin > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/60 backdrop-blur-md rounded-[2.5rem]">
              <motion.div animate={{ y: [-10, 10] }} transition={{ repeat: Infinity, duration: 0.5, repeatType: "mirror" }}>
                <Crown className="w-16 h-16 text-yellow-400 drop-shadow-glow mb-2" />
              </motion.div>
              <h2 className="text-yellow-400 text-4xl font-black italic">BIG WIN!</h2>
              <div className="text-7xl font-black text-white"><AnimatedWinCounter value={lastWin} />đ</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* BET CONTROLS */}
      <div className="w-full bg-black/80 p-6 rounded-[2.5rem] border-2 border-white/10 backdrop-blur-xl">
        <div className="flex justify-between items-center mb-6 px-2">
           <span className="text-yellow-500 font-black tracking-tighter uppercase">Stake Select</span>
           <span className="text-white font-mono text-xl">{bet.toLocaleString()}đ</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-8">
          {BET_AMOUNTS.map(amount => (
            <button key={amount} onClick={() => setBet(amount)}
              className={`py-3 rounded-xl font-black text-xs transition-all ${bet === amount ? "bg-yellow-500 text-black scale-110 shadow-glow" : "bg-white/5 text-white/50 hover:bg-white/10"}`}>
              {amount >= 1000000 ? `${amount/1000000}M` : `${amount/1000}K`}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <Button onClick={handleSpin} disabled={isSpinning}
            className="flex-1 h-24 rounded-3xl bg-gradient-to-b from-yellow-400 to-orange-600 text-white font-black text-4xl shadow-[0_12px_0_#9a3412] active:translate-y-2 active:shadow-none transition-all">
            {isSpinning ? <Loader2 className="animate-spin w-12 h-12" /> : "STRIKE!"}
          </Button>
          <Button onClick={() => setAutoSpin(!autoSpin)} variant="outline"
            className={`h-24 w-24 rounded-3xl border-4 ${autoSpin ? "bg-green-600 border-green-400" : "bg-white/5 border-white/10"}`}>
            <RotateCw className={autoSpin ? "animate-spin text-white" : "text-yellow-500"} size={40} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}