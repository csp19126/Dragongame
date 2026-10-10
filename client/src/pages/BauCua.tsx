import { useEffect, useRef, useState } from "react";
import { Redirect } from "wouter";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { BAU_CUA_SYMBOLS, TABLE_MAX_SPOT, TABLE_MAX_TOTAL, type BauCuaSymbol } from "@shared/tablegames";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { ChipRack, ChipBadge, fmtChip } from "@/components/ChipRack";
import { useAuth } from "@/hooks/use-auth";
import { useGameState, useSetBalance } from "@/hooks/use-game";
import { useBauCua, type BauCuaResponse } from "@/hooks/use-tables";
import { useLang } from "@/lib/lang-context";
import { achievementToast } from "@/components/slot/achievements";
import { useToast } from "@/hooks/use-toast";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks, stopCelebrations } from "@/lib/celebrate";
import { ApiError } from "@/lib/queryClient";
import { AppFooter } from "@/pages/Home";
import { showInView } from "@/lib/scroll";

const EMOJI: Record<Exclude<BauCuaSymbol, "bau">, string> = { cua: "🦀", tom: "🦐", ca: "🐟", ga: "🐓", nai: "🦌" };
const TILE_BG: Record<BauCuaSymbol, string> = {
  bau: "from-emerald-700/70 to-emerald-950/80", cua: "from-red-700/70 to-red-950/80", tom: "from-orange-600/70 to-orange-950/80",
  ca: "from-sky-700/70 to-sky-950/80", ga: "from-amber-600/70 to-amber-950/80", nai: "from-yellow-700/70 to-yellow-950/80",
};
/** When each die stops after the roll starts, and the least time the dice shake */
const DIE_STOP_MS = [900, 1250, 1600];

/** The calabash gourd (there's no emoji for it) */
function Gourd({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id="gourd" cx="38%" cy="35%" r="70%">
          <stop offset="0" stopColor="#d9f99d" /><stop offset="0.55" stopColor="#65a30d" /><stop offset="1" stopColor="#365314" />
        </radialGradient>
      </defs>
      <path d="M33 4c4 0 6 3 4 6" stroke="#78350f" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 9c1-2 5-2 6 0l-1 4h-4z" fill="#a16207" />
      <circle cx="33" cy="22" r="10" fill="url(#gourd)" />
      <rect x="29" y="29" width="8" height="5" fill="#65a30d" />
      <circle cx="33" cy="45" r="16" fill="url(#gourd)" />
      <ellipse cx="27" cy="40" rx="4" ry="6" fill="#ecfccb" opacity="0.35" />
      <path d="M22 31c6 4 16 4 22 0" stroke="#facc15" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function BauCuaFace({ sym, className = "" }: { sym: BauCuaSymbol; className?: string }) {
  if (sym === "bau") return <Gourd className={className} />;
  return <span className={`flex items-center justify-center leading-none ${className}`}>{EMOJI[sym]}</span>;
}

const randomSym = () => BAU_CUA_SYMBOLS[Math.floor(Math.random() * BAU_CUA_SYMBOLS.length)];

/** One die. While shaking it flickers through faces and jiggles, driven by timers so it works even where CSS animations are off. */
function Die({ sym, shaking, index }: { sym: BauCuaSymbol; shaking: boolean; index: number }) {
  const [face, setFace] = useState(sym);
  const [wobble, setWobble] = useState({ x: 0, y: 0, r: 0 });
  useEffect(() => {
    if (!shaking) { setFace(sym); setWobble({ x: 0, y: 0, r: 0 }); return; }
    const id = window.setInterval(() => {
      setFace(randomSym());
      setWobble({ x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 14, r: (Math.random() - 0.5) * 50 });
    }, 75 + index * 7);
    return () => window.clearInterval(id);
  }, [shaking, sym, index]);
  return (
    <div
      className="w-[4.2rem] h-[4.2rem] sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-white to-amber-100 border-2 border-amber-300 shadow-[0_6px_0_#b45309,0_10px_20px_rgba(0,0,0,0.5)] flex items-center justify-center"
      style={{ transform: `translate(${wobble.x}px, ${wobble.y}px) rotate(${wobble.r}deg)`, transition: shaking ? "transform 70ms linear" : "transform 200ms ease-out" }}
      data-testid={`die-${index}`}
    >
      <BauCuaFace sym={face} className="w-11 h-11 sm:w-16 sm:h-16 text-[2.4rem] sm:text-[3.4rem]" />
    </div>
  );
}

type Bets = Partial<Record<BauCuaSymbol, number>>;
const sum = (b: Bets) => Object.values(b).reduce((a, n) => a + (n ?? 0), 0);

export default function BauCua() {
  const { user, isLoading } = useAuth();
  const { data: state } = useGameState(!!user);
  const { t, loc, srv } = useLang();
  const { toast } = useToast();
  const setBalance = useSetBalance();
  const play = useBauCua();

  const [chip, setChip] = useState(1000);
  const [bets, setBets] = useState<Bets>({});
  const [history, setHistory] = useState<Bets[]>([]);
  const [dice, setDice] = useState<BauCuaSymbol[]>(["bau", "cua", "ca"]);
  const [shaking, setShaking] = useState([false, false, false]);
  const [result, setResult] = useState<BauCuaResponse | null>(null);
  const timers = useRef<number[]>([]);
  const plateRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => { timers.current.forEach(clearTimeout); stopCelebrations(); }, []);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <Redirect to="/auth" />;

  const balance = state?.balance ?? user.balance;
  const total = sum(bets);
  const busy = shaking.some(Boolean) || play.isPending;

  const place = (sym: BauCuaSymbol) => {
    if (busy) return;
    const next = (bets[sym] ?? 0) + chip;
    if (next > TABLE_MAX_SPOT || total + chip > TABLE_MAX_TOTAL || total + chip > balance) {
      soundManager.nearMiss();
      return;
    }
    setResult(null);
    setHistory((h) => [...h, bets]);
    setBets({ ...bets, [sym]: next });
    soundManager.buttonClick();
  };
  const undo = () => { if (!busy && history.length) { setBets(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); setResult(null); } };
  const clear = () => { if (!busy) { setHistory((h) => [...h, bets]); setBets({}); setResult(null); } };

  const roll = () => {
    if (busy) return;
    if (total === 0) return toast({ title: t.placeBetFirst });
    if (total > balance) return toast({ title: t.insufficientBalance, description: t.insufficientBalanceDesc, variant: "destructive" });
    stopCelebrations();
    setResult(null);
    setShaking([true, true, true]);
    showInView(plateRef.current);
    soundManager.spinStart();
    const started = Date.now();
    play.mutate(bets, {
      onSuccess: (r) => {
        const wait = (ms: number) => Math.max(0, ms - (Date.now() - started));
        r.dice.forEach((d, i) => {
          timers.current.push(window.setTimeout(() => {
            setDice((prev) => prev.map((p, j) => (j === i ? d : p)));
            setShaking((prev) => prev.map((s, j) => (j === i ? false : s)));
            soundManager.reelStop();
          }, wait(DIE_STOP_MS[i])));
        });
        timers.current.push(window.setTimeout(() => {
          setResult(r);
          setBalance(r.newBalance, { gamesPlayed: r.gamesPlayed, totalWins: r.totalWins, maxWin: r.maxWin });
          if (r.winAmount > r.totalBet) {
            soundManager.win();
            coinBurst({ x: 0.5, y: 0.35 });
            if (BAU_CUA_SYMBOLS.some((s) => bets[s] && r.dice.filter((d) => d === s).length === 3)) fireworks(2500);
          } else if (r.winAmount === 0) {
            soundManager.lossComfort();
          }
          r.newAchievements.forEach((a) => toast(achievementToast(a, loc)));
        }, wait(DIE_STOP_MS[2] + 250)));
      },
      onError: (e) => {
        setShaking([false, false, false]);
        const msg = e instanceof ApiError && e.status === 400 ? t.insufficientBalanceDesc : srv((e as Error).message);
        toast({ title: t.error, description: msg, variant: "destructive" });
      },
    });
  };

  const hits = (s: BauCuaSymbol) => (result ? result.dice.filter((d) => d === s).length : 0);
  const net = result ? result.winAmount - result.totalBet : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#2a0a1a] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center gap-3 px-3 py-3 relative z-10">
        <div className="text-center">
          <h1 className="font-display text-3xl sm:text-5xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="text-baucua-title">{t.bcTitle}</h1>
          <p className="text-[11px] sm:text-xs font-black tracking-[0.3em] text-yellow-500/80 uppercase mt-1">🧧 {t.bcSubtitle} 🧧</p>
        </div>
        <GameTabs />

        <div className="w-full max-w-md flex items-center justify-between rounded-2xl bg-[#1e1b4b]/80 border border-indigo-400/20 px-4 py-2.5">
          <div>
            <p className="text-[10px] text-yellow-500/60 font-black uppercase tracking-widest">{t.onTable}</p>
            <p className="font-mono font-black text-lg text-white" data-testid="text-total-bet">{total.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-yellow-500/60 font-black uppercase tracking-widest">{t.balance}</p>
            <p className="font-mono font-black text-xl sm:text-2xl text-yellow-400" data-testid="text-table-balance">{balance.toLocaleString()} 🪙</p>
          </div>
        </div>

        {/* The plate */}
        <div ref={plateRef} className="relative w-full max-w-md rounded-[2.5rem] p-3 sm:p-5 scroll-mt-24 bg-gradient-to-b from-yellow-500 via-amber-600 to-amber-800 shadow-[0_0_40px_rgba(251,191,36,0.35)]">
          <div className="rounded-[2rem] bg-[radial-gradient(circle_at_50%_40%,#7f1d1d,#450a0a)] border-4 border-yellow-300/60 py-4 sm:py-6 flex justify-center gap-3 sm:gap-5">
            {dice.map((d, i) => <Die key={i} index={i} sym={d} shaking={shaking[i]} />)}
          </div>
          <div className="h-7 mt-1 text-center" aria-live="polite">
            {result && (
              <p className={`font-black text-lg ${net > 0 ? "text-white" : "text-yellow-100/80"}`} data-testid="text-baucua-result">
                {result.winAmount > 0 ? `${t.tableWin} ${result.winAmount.toLocaleString()} (${net >= 0 ? "+" : ""}${net.toLocaleString()})` : t.tableLose}
              </p>
            )}
          </div>
        </div>

        {/* The board */}
        <div className="w-full max-w-md grid grid-cols-3 gap-2.5" data-testid="baucua-board">
          {BAU_CUA_SYMBOLS.map((s) => {
            const h = hits(s);
            const stake = bets[s];
            const won = result && stake && h > 0;
            return (
              <button
                key={s}
                type="button"
                onClick={() => place(s)}
                disabled={busy}
                data-testid={`spot-${s}`}
                className={`relative aspect-[5/4] sm:aspect-square rounded-2xl bg-gradient-to-b ${TILE_BG[s]} border-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                  h > 0 ? "border-yellow-300 shadow-[0_0_24px_rgba(250,204,21,0.7)]" : "border-yellow-600/40"
                } ${result && h === 0 && stake ? "opacity-60" : ""}`}
              >
                <BauCuaFace sym={s} className="w-11 h-11 sm:w-16 sm:h-16 text-[2.6rem] sm:text-6xl drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]" />
                <span className="text-xs font-black uppercase tracking-wider text-yellow-100">{t.bcNames[s]}</span>
                {h > 0 && <span className="absolute top-1.5 left-1.5 text-[10px] font-black bg-yellow-300 text-black rounded-full px-1.5">×{h}</span>}
                {stake ? <ChipBadge amount={stake} className="absolute top-1.5 right-1.5" /> : null}
                {won ? <span className="absolute bottom-1 inset-x-0 text-center text-[11px] font-black text-green-300">+{fmtChip(result!.returns[s]!)}</span> : null}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-yellow-100/50 text-center">{t.pickChip}</p>
        <ChipRack value={chip} onChange={(v) => { setChip(v); soundManager.betChange(); }} balance={balance} disabled={busy} />

        <div className="w-full max-w-md grid grid-cols-[1fr_1fr_2fr] gap-2">
          <button type="button" onClick={undo} disabled={busy || !history.length} className="rounded-xl bg-white/5 border border-white/15 text-yellow-100/80 font-black text-xs py-3 flex flex-col items-center gap-1 disabled:opacity-30" data-testid="button-undo">
            <RotateCcw className="w-4 h-4" />{t.undo}
          </button>
          <button type="button" onClick={clear} disabled={busy || total === 0} className="rounded-xl bg-white/5 border border-white/15 text-yellow-100/80 font-black text-xs py-3 flex flex-col items-center gap-1 disabled:opacity-30" data-testid="button-clear">
            <Trash2 className="w-4 h-4" />{t.clearBets}
          </button>
          <button
            type="button"
            onClick={roll}
            disabled={busy}
            data-testid="button-roll"
            className="rounded-xl font-display font-black text-3xl text-white bg-gradient-to-b from-yellow-400 via-orange-500 to-red-600 border-b-4 border-red-900 shadow-[0_0_24px_rgba(249,115,22,0.6)] active:translate-y-0.5 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-7 h-7 animate-spin mx-auto" /> : t.roll}
          </button>
        </div>

        <details className="w-full max-w-md rounded-2xl bg-purple-950/60 border border-yellow-500/20 p-4 text-sm text-yellow-100/70">
          <summary className="font-black text-yellow-400 cursor-pointer">{t.rules}</summary>
          <p className="mt-2 leading-relaxed">{t.bcRules}</p>
          <p className="mt-2 text-xs text-yellow-100/40">{t.playMoneyNote}</p>
        </details>
      </main>
      <AppFooter />
    </div>
  );
}
