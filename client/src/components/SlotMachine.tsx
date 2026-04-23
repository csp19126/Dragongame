import { useState, useCallback, useEffect } from "react";
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
  dragon: "0 0 50px #fbbf24", drum: "0 0 30px #a855f7", lotus: "0 0 30px #ec4899", lantern: "0 0 25px #fb923c", coin: "0 0 20px #facc15"
};

const BET_AMOUNTS = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
const PAYLINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];

function AnimatedWinCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value <= 0) {
      setDisplay(0);
      return;
    }
    let current = 0;
    const step = Math.max(1, Math.ceil(value / 24));
    const timer = setInterval(() => {
      current += step;
      if (current >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(current);
      }
    }, 30);
    return () => clearInterval(timer);
  }, [value]);

  return <span>{display.toLocaleString()}đ</span>;
}

export function SlotMachine({ balance }: { balance: number }) {
  const { t, lang, setLang } = useLang() as any;
  const spinMutation = useSpin() as any;
  const [grid, setGrid] = useState([["dragon","coin","dragon"],["drum","lotus","drum"],["dragon","coin","dragon"]]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [bet, setBet] = useState(1000);
  const [lastWin, setLastWin] = useState(0);
  const [winLines, setWinLines] = useState<number[]>([]);
  const [autoSpin, setAutoSpin] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showWinOverlay, setShowWinOverlay] = useState(false);

  useEffect(() => {
    if (balance >= bet) return;
    const affordable = [...BET_AMOUNTS].reverse().find((amount) => amount <= balance) ?? BET_AMOUNTS[0];
    setBet(affordable);
  }, [balance, bet]);

  const playSound = useCallback((fn: () => void) => {
    if (!muted) fn();
  }, [muted]);

  const isWinningCell = useCallback((col: number, row: number) => {
    return winLines.some((lineIdx) => PAYLINES[lineIdx]?.[col] === row);
  }, [winLines]);

  const handleSpin = useCallback(async () => {
    if (isSpinning || balance < bet) return;
    setIsSpinning(true);
    setShowWinOverlay(false);
    setWinLines([]);
    setLastWin(0);
    playSound(() => soundManager.spinStart());

    try {
      const res = await spinMutation.mutateAsync({ slotId: "default", betAmount: bet });
      setTimeout(() => {
        setGrid(res.grid ?? grid);
        setIsSpinning(false);
        setWinLines(res.winLines ?? []);
        setLastWin(res.winAmount ?? 0);
        if ((res.winAmount ?? 0) > 0) {
          setShowWinOverlay(true);
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
          playSound(() => soundManager.win((res.winAmount ?? 0) >= bet * 5));
          setTimeout(() => setShowWinOverlay(false), 1600);
        }
        if (autoSpin) setTimeout(handleSpin, 1200);
      }, 1000);
    } catch (e) { setIsSpinning(false); setAutoSpin(false); }
  }, [autoSpin, balance, bet, grid, isSpinning, playSound, spinMutation]);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto py-8">
      <div className="w-full flex justify-between items-center bg-gradient-to-r from-indigo-950 to-purple-900 p-4 rounded-2xl border border-yellow-500/30 shadow-[0_12px_30px_rgba(0,0,0,0.4)]">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setMuted((m) => !m);
              if (!muted) return;
              soundManager.buttonClick();
            }}
            className="text-yellow-400 hover:bg-white/10"
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Button variant="ghost" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="text-yellow-400 hover:bg-white/10">
            <Languages />
          </Button>
        </div>
        <div className="text-right space-y-1">
          <p className="text-[10px] text-yellow-500/60 font-black uppercase">{t.balance}</p>
          <p className="text-3xl font-black text-yellow-400">{balance.toLocaleString()}đ</p>
          <p className="text-[10px] text-yellow-200/60 uppercase tracking-wider">Bet: {bet.toLocaleString()}đ</p>
        </div>
      </div>

      <div className="relative w-full aspect-square bg-[#0a051a] rounded-[3rem] p-6 border-8 border-yellow-700/50 shadow-[0_0_80px_rgba(251,191,36,0.16)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.12)_0%,transparent_60%)] pointer-events-none rounded-[2.5rem]" />
        <div className="h-full grid grid-cols-3 gap-3 bg-black/60 rounded-3xl p-4 overflow-hidden">
          {grid.map((col, c) => (
            <div key={c} className="flex flex-col gap-3">
              {col.map((s, r) => (
                <div
                  key={r}
                  className={`flex items-center justify-center aspect-square rounded-xl border transition-all ${
                    isWinningCell(c, r)
                      ? "bg-yellow-400/20 border-yellow-400/70 shadow-[0_0_24px_rgba(250,204,21,0.5)]"
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <motion.span
                    animate={
                      isSpinning
                        ? { y: [0, 96], opacity: [1, 0.3], rotateX: [0, 180] }
                        : { scale: isWinningCell(c, r) ? [1, 1.08, 1] : 1, opacity: 1 }
                    }
                    transition={
                      isSpinning
                        ? { repeat: Infinity, duration: 0.12, delay: (c + r) * 0.03 }
                        : { duration: 0.35 }
                    }
                    className="text-6xl sm:text-7xl" style={{ filter: `drop-shadow(${GLOWS[s] || "none"})` }}>
                    {isSpinning ? "🎰" : SYMBOL_MAP[s]}
                  </motion.span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <AnimatePresence>
          {showWinOverlay && lastWin > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/60 backdrop-blur-md rounded-[2.5rem]">
              <motion.div animate={{ y: [-4, 4, -4] }} transition={{ duration: 0.8, repeat: Infinity }}>
                <Crown className="w-16 h-16 text-yellow-400 mb-2 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]" />
              </motion.div>
              <h2 className="text-yellow-400 text-4xl font-black italic tracking-wide">BIG WIN!</h2>
              <div className="text-6xl font-black text-white">
                <AnimatedWinCounter value={lastWin} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full bg-black/80 p-6 rounded-[2.5rem] border border-white/10 shadow-[0_10px_32px_rgba(0,0,0,0.35)]">
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-6">
          {BET_AMOUNTS.map(a => (
            <button
              key={a}
              onClick={() => {
                setBet(a);
                playSound(() => soundManager.betChange());
              }}
              disabled={a > balance}
              className={`py-2 rounded-lg font-black text-xs transition ${
                bet === a ? "bg-yellow-500 text-black scale-105 shadow-[0_0_18px_rgba(234,179,8,0.6)]" : "bg-white/5 text-white/50"
              } ${a > balance ? "opacity-35 cursor-not-allowed" : "hover:bg-white/10"}`}
            >
              {a >= 1000000 ? `${a/1000000}M` : `${a/1000}K`}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <Button
            onClick={handleSpin}
            disabled={isSpinning || balance < bet}
            className="flex-1 h-20 rounded-3xl bg-gradient-to-b from-yellow-400 to-orange-600 text-white font-black text-4xl shadow-[0_8px_0_#9a3412] active:translate-y-1 active:shadow-none disabled:opacity-60"
          >
            {isSpinning ? <Loader2 className="animate-spin" /> : "STRIKE!"}
          </Button>
          <Button
            onClick={() => {
              setAutoSpin(!autoSpin);
              playSound(() => soundManager.autoSpinToggle());
            }}
            className={`h-20 w-20 rounded-3xl border ${autoSpin ? "bg-green-600 border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.6)]" : "bg-white/5 border-white/10"}`}
          >
            <RotateCw className={autoSpin ? "animate-spin text-white" : "text-yellow-500"} />
          </Button>
        </div>
        <div className="mt-3 text-center text-xs text-yellow-100/45">
          {autoSpin ? "Auto spin enabled" : "Manual spin mode"}
        </div>
      </div>
    </div>
  );
}