import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpin } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";
import { soundManager } from "@/lib/sound";
import confetti from "canvas-confetti";
import { Loader2, RotateCw, Crown, Volume2, VolumeX, Wand2, Gift } from "lucide-react";

// 1. Data Definitions
const SYMBOLS: Record<string, string> = { 
  dragon: "🐉", drum: "🥁", lotus: "🌸", lantern: "🏮", coin: "🪙" 
};

const GLOWS: Record<string, string> = { 
  dragon: "0 0 60px #fbbf24", drum: "0 0 40px #a855f7", 
  lotus: "0 0 40px #ec4899", coin: "0 0 20px #facc15" 
};

// 2. Helper Components
function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = display;
    const end = value;
    if (start === end) return;
    const timer = setInterval(() => {
      start += Math.ceil((end - start) / 10);
      if (start >= end) { setDisplay(end); clearInterval(timer); }
      else setDisplay(start);
    }, 40);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display.toLocaleString()}</span>;
}

// 3. Main Component
export function SlotMachine({ balance }: { balance: number }) {
  const { t, lang, setLang } = useLang() as any;
  const spinMutation = useSpin() as any;
  
  const [grid, setGrid] = useState([["dragon","coin","dragon"],["drum","lotus","drum"],["dragon","coin","dragon"]]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [bet, setBet] = useState(1000000);
  const [lastWin, setLastWin] = useState(0);
  const [winLines, setWinLines] = useState<number[]>([]);
  const [freeSpins, setFreeSpins] = useState(0);
  const [autoSpin, setAutoSpin] = useState(false);
  const [muted, setMuted] = useState(false);

  const handleSpin = useCallback(async () => {
    if (isSpinning || (balance < bet && freeSpins === 0)) return;
    setIsSpinning(true); setWinLines([]); setLastWin(0);
    soundManager.spinStart();
    
    try {
      const res = await spinMutation.mutateAsync({ betAmount: bet });
      setTimeout(() => {
        setGrid(res.grid); 
        setIsSpinning(false); 
        setWinLines(res.winLines); 
        setLastWin(res.winAmount);
        setFreeSpins(res.totalFreeSpins);
        
        if (res.winAmount > 0) {
          confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } });
          soundManager.win(res.winAmount > bet * 5);
        }
        
        if (res.isRepeater) setTimeout(handleSpin, 1000);
        else if (autoSpin) setTimeout(handleSpin, 1400);
      }, 1000);
    } catch (e) { 
      setIsSpinning(false); 
      setAutoSpin(false); 
    }
  }, [balance, bet, isSpinning, autoSpin, freeSpins, spinMutation]);

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-4xl mx-auto py-10">
      {/* HEADER SECTION */}
      <div className="w-full flex justify-between items-center bg-indigo-950/80 p-6 rounded-[2rem] border-2 border-yellow-500/20 backdrop-blur-xl shadow-2xl">
        <div className="flex gap-4">
          <Button variant="ghost" size="icon" onClick={() => setMuted(!muted)} className="text-yellow-400">
            {muted ? <VolumeX size={32} /> : <Volume2 size={32} />}
          </Button>
          <Button variant="ghost" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="text-yellow-400 font-bold">
            {lang === 'en' ? 'EN' : '中'}
          </Button>
          {freeSpins > 0 && (
            <div className="flex items-center gap-2 bg-purple-600 px-4 py-2 rounded-full text-white font-black shadow-lg animate-pulse">
              <Gift size={20} /> {freeSpins} FREE
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-yellow-500/40 font-black uppercase tracking-widest mb-1">{t.balance}</p>
          <p className="text-5xl font-mono font-black text-yellow-400 tracking-tighter">
            {balance.toLocaleString()}đ
          </p>
        </div>
      </div>

      {/* THE MACHINE GRID */}
      <div className="relative w-full aspect-square bg-[#0a051a] rounded-[4rem] p-8 border-8 border-yellow-700/50 shadow-[0_0_100px_rgba(0,0,0,1)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.1)_0%,transparent_70%)] pointer-events-none" />
        
        <div className="relative h-full grid grid-cols-3 gap-4 bg-black/60 rounded-[3rem] p-6 border-4 border-white/5 overflow-hidden shadow-inner">
          {grid.map((col, c) => (
            <div key={c} className="flex flex-col gap-4">
              {col.map((s, r) => (
                <div key={r} className="flex items-center justify-center aspect-square bg-white/5 rounded-3xl border border-white/10 shadow-lg">
                  <motion.span 
                    animate={isSpinning ? { y: [0, 150], opacity: [1, 0] } : { scale: [0.5, 1], rotate: [0, 5, -5, 0] }}
                    transition={isSpinning ? { repeat: Infinity, duration: 0.1, ease: "linear" } : { type: "spring", stiffness: 300 }}
                    className="text-7xl sm:text-9xl select-none" 
                    style={{ filter: isSpinning ? "blur(4px)" : `drop-shadow(${GLOWS[s] || "none"})` }}
                  >
                    {isSpinning ? "🎰" : SYMBOLS[s]}
                  </motion.span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* BIG WIN OVERLAY */}
        <AnimatePresence>
          {lastWin > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 2 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/70 backdrop-blur-md rounded-[3.5rem]"
            >
              <motion.div animate={{ y: [-10, 10] }} transition={{ repeat: Infinity, duration: 0.5, repeatType: "mirror" }}>
                <Crown className="w-24 h-24 text-yellow-400 mb-4 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]" />
              </motion.div>
              <h2 className="text-yellow-400 text-6xl font-black italic tracking-tighter mb-2 shadow-text">BIG WIN!</h2>
              <div className="text-7xl font-black text-white">
                <AnimatedCounter value={lastWin} />đ
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FOOTER CONTROLS */}
      <div className="w-full bg-black/80 p-8 rounded-[3rem] border-2 border-white/10 backdrop-blur-2xl shadow-2xl">
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {[1000, 10000, 100000, 500000, 1000000].map(a => (
            <button 
              key={a} 
              onClick={() => { setBet(a); soundManager.betChange(); }} 
              className={`px-6 py-4 rounded-2xl font-black text-sm transition-all transform active:scale-95 ${bet === a ? "bg-yellow-500 text-black scale-110 shadow-[0_0_20px_rgba(251,191,36,0.4)]" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
            >
              {a >= 1000000 ? `${a/1000000}M` : `${a/1000}K`}
            </button>
          ))}
        </div>
        <div className="flex gap-6">
          <Button 
            onClick={handleSpin} 
            disabled={isSpinning} 
            className="flex-1 h-28 rounded-[2rem] bg-gradient-to-b from-yellow-400 via-orange-500 to-red-700 text-white font-black text-5xl shadow-[0_15px_0_#9a3412] hover:brightness-110 active:translate-y-2 active:shadow-none transition-all"
          >
            {isSpinning ? <Loader2 className="animate-spin w-16 h-16" /> : "STRIKE!"}
          </Button>
          <Button 
            onClick={() => setAutoSpin(!autoSpin)} 
            className={`h-28 w-28 rounded-[2rem] border-4 transition-all ${autoSpin ? "bg-green-600 border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.5)]" : "bg-white/5 border-white/10 text-yellow-500 hover:bg-white/10"}`}
          >
            <RotateCw className={autoSpin ? "animate-spin" : ""} size={48} />
          </Button>
          <Button 
            onClick={async () => { 
              const res = await fetch("/api/game/oracle", { method: "POST" }); 
              const data = await res.json();
              toast({ title: "ORACLE", description: data.message });
            }}
            className="h-28 w-28 rounded-[2rem] bg-purple-900/40 border-4 border-purple-500/50 text-purple-400 hover:bg-purple-800/50"
          >
            <Wand2 size={48} />
          </Button>
        </div>
      </div>
    </div>
  );
}