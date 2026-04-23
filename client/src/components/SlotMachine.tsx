import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpin } from "@/hooks/use-game";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";
import { soundManager } from "@/lib/sound";
import confetti from "canvas-confetti";
import { Loader2, RotateCw, Crown, Volume2, VolumeX, Languages } from "lucide-react";

const SYMBOL_MAP: Record<string, string> = {
  dragon: "🐉", drum: "🥁", lotus: "🌸", lantern: "🏮", coin: "🪙"
};

const GLOWS: Record<string, string> = {
  dragon: "0 0 50px #fbbf24", drum: "0 0 30px #a855f7", lotus: "0 0 30px #ec4899", coin: "0 0 20px #facc15"
};

export function SlotMachine({ balance }: { balance: number }) {
  const { t, lang, setLang } = useLang() as any;
  const spinMutation = useSpin() as any;
  const [grid, setGrid] = useState([["dragon","coin","dragon"],["drum","lotus","drum"],["dragon","coin","dragon"]]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [bet, setBet] = useState(1000000);
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
      const res = await spinMutation.mutateAsync({ betAmount: bet });
      setTimeout(() => {
        setGrid(res.grid ?? grid);
        setIsSpinning(false);
        setWinLines(res.winLines ?? []);
        setLastWin(res.winAmount ?? 0);
        if ((res.winAmount ?? 0) > 0) {
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
          soundManager.win((res.winAmount ?? 0) >= bet * 5);
        }
        if (autoSpin) setTimeout(handleSpin, 1200);
      }, 1000);
    } catch (e) { setIsSpinning(false); setAutoSpin(false); }
  }, [balance, bet, isSpinning, autoSpin]);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto py-8">
      <div className="w-full flex justify-between items-center bg-indigo-950/80 p-4 rounded-2xl border border-yellow-500/30">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setMuted(!muted)} className="text-yellow-400">
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Button variant="ghost" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="text-yellow-400">
            <Languages />
          </Button>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-yellow-500/60 font-black uppercase">{t.balance}</p>
          <p className="text-3xl font-black text-yellow-400">{balance.toLocaleString()}đ</p>
        </div>
      </div>

      <div className="relative w-full aspect-square bg-[#0a051a] rounded-[3rem] p-6 border-8 border-yellow-700/50 shadow-2xl">
        <div className="h-full grid grid-cols-3 gap-3 bg-black/60 rounded-3xl p-4 overflow-hidden">
          {grid.map((col, c) => (
            <div key={c} className="flex flex-col gap-3">
              {col.map((s, r) => (
                <div key={r} className="flex items-center justify-center aspect-square bg-white/5 rounded-xl border border-white/10">
                  <motion.span animate={isSpinning ? { y: [0, 100], opacity: [1, 0] } : { scale: 1, opacity: 1 }}
                    transition={isSpinning ? { repeat: Infinity, duration: 0.1 } : {}}
                    className="text-6xl sm:text-7xl" style={{ filter: `drop-shadow(${GLOWS[s] || "none"})` }}>
                    {isSpinning ? "🎰" : SYMBOL_MAP[s]}
                  </motion.span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <AnimatePresence>
          {lastWin > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/60 backdrop-blur-md rounded-[2.5rem]">
              <Crown className="w-16 h-16 text-yellow-400 mb-2" />
              <h2 className="text-yellow-400 text-4xl font-black italic">BIG WIN!</h2>
              <div className="text-6xl font-black text-white">{lastWin.toLocaleString()}đ</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full bg-black/80 p-6 rounded-[2.5rem] border border-white/10">
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-6">
          {[1000, 5000, 10000, 50000, 100000, 500000, 1000000].map(a => (
            <button key={a} onClick={() => setBet(a)} className={`py-2 rounded-lg font-black text-xs ${bet === a ? "bg-yellow-500 text-black" : "bg-white/5 text-white/50"}`}>
              {a >= 1000000 ? `${a/1000000}M` : `${a/1000}K`}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <Button onClick={handleSpin} disabled={isSpinning} className="flex-1 h-20 rounded-3xl bg-gradient-to-b from-yellow-400 to-orange-600 text-white font-black text-4xl shadow-[0_8px_0_#9a3412] active:translate-y-1 active:shadow-none">
            {isSpinning ? <Loader2 className="animate-spin" /> : "STRIKE!"}
          </Button>
          <Button onClick={() => setAutoSpin(!autoSpin)} className={`h-20 w-20 rounded-3xl ${autoSpin ? "bg-green-600" : "bg-white/5"}`}>
            <RotateCw className={autoSpin ? "animate-spin" : "text-yellow-500"} />
          </Button>
        </div>
      </div>
    </div>
  );
}