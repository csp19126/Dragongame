import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useSpin } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { soundManager } from "@/lib/sound";
import confetti from "canvas-confetti";
import { 
  Loader2, Brain, Flame, Zap, Crown, RotateCw, Gift, Sparkles, 
  Share2, AlertTriangle, Wand2, Volume2, VolumeX, Languages, Dice5 
} from "lucide-react";

const SYMBOLS = ["🐉", "🧧", "🏮", "💎", "🪙", "🎎", "🌸", "🏯", "⚔️", "📜"];
const BET_AMOUNTS = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];

const SYMBOL_GLOW: Record<string, { color: string; shadow: string; bg: string }> = {
  "🐉": { color: "#fbbf24", shadow: "0 0 25px #fbbf24, 0 0 50px #f59e0b", bg: "rgba(251,191,36,0.15)" },
  "🧧": { color: "#ef4444", shadow: "0 0 25px #ef4444, 0 0 50px #dc2626", bg: "rgba(239,68,68,0.15)" },
  "🏮": { color: "#f97316", shadow: "0 0 25px #f97316, 0 0 50px #ea580c", bg: "rgba(249,115,22,0.15)" },
  "💎": { color: "#38bdf8", shadow: "0 0 25px #38bdf8, 0 0 50px #0ea5e9", bg: "rgba(56,189,248,0.15)" },
  "🪙": { color: "#facc15", shadow: "0 0 25px #facc15, 0 0 50px #eab308", bg: "rgba(250,204,21,0.15)" },
  "🎎": { color: "#c084fc", shadow: "0 0 25px #c084fc, 0 0 50px #a855f7", bg: "rgba(192,132,252,0.15)" },
  "🌸": { color: "#f472b6", shadow: "0 0 25px #f472b6, 0 0 50px #ec4899", bg: "rgba(244,114,182,0.15)" },
  "🏯": { color: "#a78bfa", shadow: "0 0 25px #a78bfa, 0 0 50px #8b5cf6", bg: "rgba(167,139,250,0.15)" },
  "⚔️": { color: "#94a3b8", shadow: "0 0 25px #94a3b8, 0 0 50px #64748b", bg: "rgba(148,163,184,0.15)" },
  "📜": { color: "#fcd34d", shadow: "0 0 25px #fcd34d, 0 0 50px #fbbf24", bg: "rgba(252,211,77,0.15)" },
};

const PAYLINE_COORDS: [number, number][][] = [
  [[0,0],[1,0],[2,0]], [[0,1],[1,1],[2,1]], [[0,2],[1,2],[2,2]],
  [[0,0],[1,1],[2,2]], [[0,2],[1,1],[2,0]],
];
const PAYLINE_COLORS = ['#fbbf24', '#a855f7', '#ef4444', '#22d3ee', '#4ade80'];
const PAYLINE_LABELS = ['TOP', 'MID', 'BOT', '↘', '↗'];

const getRandomSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
const makeGrid = (): string[][] => [
  [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
  [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
  [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
];

function AnimatedWinCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 1200;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(Math.round(value * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);
  return <span>{display.toLocaleString()}</span>;
}

function WinLineOverlay({ winLines }: { winLines: number[] }) {
  if (winLines.length === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {winLines.map((idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="absolute w-full h-1 bg-white/50 shadow-[0_0_15px_white]"
          style={{ top: idx === 0 ? '16%' : idx === 1 ? '50%' : '84%', display: idx > 2 ? 'none' : 'block' }}
        />
      ))}
    </div>
  );
}

function GridCell({ symbol, isSpinning, isWinning }: any) {
  const [spinSymbol, setSpinSymbol] = useState(getRandomSymbol());
  const glow = SYMBOL_GLOW[isSpinning ? spinSymbol : symbol] || SYMBOL_GLOW["📜"];

  useEffect(() => {
    if (isSpinning) {
      const interval = setInterval(() => setSpinSymbol(getRandomSymbol()), 50);
      return () => clearInterval(interval);
    }
  }, [isSpinning]);

  return (
    <div className="relative flex items-center justify-center aspect-square border border-white/5 overflow-hidden">
      <motion.div
        animate={isWinning ? { scale: [1, 1.2, 1], filter: [`drop-shadow(${glow.shadow})`, `drop-shadow(0 0 30px white)`] } : {}}
        transition={{ duration: 0.5, repeat: Infinity }}
        className="text-5xl sm:text-6xl select-none z-10"
      >
        {isSpinning ? spinSymbol : symbol}
      </motion.div>
    </div>
  );
}

export function SlotMachine({ balance }: { balance: number }) {
  const { t, lang, setLang } = useLang() as any;
  const { toast } = useToast();
  const spinMutation = useSpin();
  const shakeControls = useAnimation();

  const [grid, setGrid] = useState<string[][]>(makeGrid);
  const [isSpinning, setIsSpinning] = useState(false);
  const [bet, setBet] = useState(1000);
  const [lastWin, setLastWin] = useState(0);
  const [winLines, setWinLines] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const [autoSpin, setAutoSpin] = useState(false);
  const [muted, setMuted] = useState(false);
  const [screenFlash, setScreenFlash] = useState<string | null>(null);
  const [oracleActive, setOracleActive] = useState(false);
  const [showBonus, setShowBonus] = useState(false);

  const triggerJackpotEffects = () => {
    setScreenFlash("rgba(251, 191, 36, 0.4)");
    setTimeout(() => setScreenFlash(null), 500);
    confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 } });
    shakeControls.start({ x: [0, -10, 10, -10, 10, 0], transition: { duration: 0.4 } });
  };

  const handleSpin = useCallback(async () => {
    if (isSpinning || balance < bet) {
      if (balance < bet) setAutoSpin(false);
      return;
    }
    setIsSpinning(true);
    setWinLines([]);
    setLastWin(0);
    soundManager.spinStart();
    if (window.navigator.vibrate) window.navigator.vibrate(30);

    try {
      const result = await (spinMutation as any).mutateAsync({ slotId: "main", betAmount: bet });
      
      setTimeout(() => {
        setGrid(result.grid);
        setIsSpinning(false);
        setWinLines(result.winLines);
        setLastWin(result.winAmount);
        setStreak(result.streak || 0);

        if (result.winAmount > 0) {
          if (result.winAmount >= bet * 10) triggerJackpotEffects();
          else soundManager.win(false);

          if (result.winAmount >= bet * 5) {
            setShowBonus(true);
            setTimeout(() => setShowBonus(false), 3000);
          }
        }
        if (autoSpin) setTimeout(handleSpin, 1200);
      }, 800);
    } catch (err: any) {
      setIsSpinning(false);
      setAutoSpin(false);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [balance, bet, isSpinning, autoSpin, spinMutation]);

  return (
    <motion.div animate={shakeControls} className="flex flex-col items-center gap-4 w-full max-w-2xl mx-auto px-2">
      <AnimatePresence>
        {screenFlash && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] pointer-events-none" style={{ background: screenFlash }} />
        )}
      </AnimatePresence>

      <div className="w-full flex justify-between items-center bg-black/40 p-3 rounded-2xl border border-white/10 backdrop-blur-md">
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={() => setMuted(!muted)} className="text-yellow-500">
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="text-yellow-500">
            <Languages />
          </Button>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-white/40 font-black">{t.balance}</div>
          <div className="text-2xl font-mono font-black text-yellow-500">{balance.toLocaleString()}đ</div>
        </div>
      </div>

      <div className="relative w-full aspect-square bg-gradient-to-b from-indigo-950 to-black rounded-[2.5rem] p-4 border-4 border-yellow-600/50 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        <div className="relative h-full grid grid-cols-3 gap-2 bg-black/40 rounded-2xl p-2 overflow-hidden">
          <WinLineOverlay winLines={winLines} />
          {[0, 1, 2].map(col => (
            <div key={col} className="flex flex-col gap-2">
              {[0, 1, 2].map(row => (
                <GridCell 
                  key={`${col}-${row}`} 
                  symbol={grid[col][row]} 
                  isSpinning={isSpinning} 
                  isWinning={winLines.some(l => PAYLINE_COORDS[l].some(([c, r]) => c === col && r === row))} 
                />
              ))}
            </div>
          ))}
        </div>

        <AnimatePresence>
          {lastWin > 0 && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-50 pointer-events-none bg-black/40 backdrop-blur-sm rounded-[2rem]">
              <div className="text-yellow-400 text-3xl font-black italic tracking-tighter animate-bounce">WIN!</div>
              <div className="text-6xl font-black text-white drop-shadow-[0_0_30px_#f59e0b]">
                <AnimatedWinCounter value={lastWin} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full bg-black/60 p-5 rounded-[2rem] border border-white/10 backdrop-blur-xl">
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mb-5">
          {BET_AMOUNTS.map(amount => (
            <Button key={amount} variant={bet === amount ? "default" : "outline"}
              onClick={() => { setBet(amount); soundManager.betChange(); }}
              className={`h-11 text-[11px] font-black rounded-xl ${bet === amount ? "bg-yellow-600 text-black" : "bg-white/5 border-white/10 text-white/60"}`}>
              {amount >= 1000000 ? `${amount/1000000}M` : `${amount/1000}K`}
            </Button>
          ))}
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSpin} disabled={isSpinning} 
            className="flex-1 h-20 rounded-2xl bg-gradient-to-b from-yellow-400 to-orange-700 text-white font-black text-3xl shadow-[0_10px_0_#9a3412] active:translate-y-1 active:shadow-none transition-all">
            {isSpinning ? <Loader2 className="animate-spin w-8 h-8" /> : "STRIKE!"}
          </Button>
          
          <Button onClick={() => setAutoSpin(!autoSpin)} variant={autoSpin ? "default" : "outline"}
            className={`h-20 w-20 rounded-2xl ${autoSpin ? "bg-green-600" : "bg-white/5 border-white/10 text-yellow-500"}`}>
            <RotateCw className={autoSpin ? "animate-spin" : ""} size={32} />
          </Button>

          <Button onClick={() => setOracleActive(!oracleActive)}
            className="h-20 w-20 rounded-2xl bg-purple-950 border border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
            <Wand2 size={32} />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showBonus && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[200] bg-red-700 border-2 border-yellow-400 p-5 rounded-3xl shadow-[0_0_50px_rgba(234,179,8,0.5)] flex items-center gap-6">
            <div className="text-white font-black text-lg leading-tight">DRAGON LUCK:<br/>DOUBLE WIN?</div>
            <Button className="bg-yellow-400 text-black font-black px-8 h-12 rounded-xl text-xl hover:scale-105 transition-transform">
              YES <Dice5 className="ml-2" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}