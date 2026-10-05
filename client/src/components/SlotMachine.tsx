import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RotateCw, Volume2, VolumeX, Wand2, Gift, Info, Crown, Lock } from "lucide-react";
import {
  BET_OPTIONS, PAYLINES, SLOT_SYMBOLS, SCATTER_PAYS, WILD_ID, SCATTER_ID, REPEATER_MULTIPLIERS, REPEATER_PEARLS,
  JACKPOT_FULL_BET, jackpotShare, REELS, ROWS, FREE_SPIN_OPTIONS,
} from "@shared/schema";
import { GAMBLE_PAYS } from "@shared/gamble";
import { XocDia } from "@/components/slot/XocDia";
import { FreeSpinPicker, type PickResult } from "@/components/slot/FreeSpinPicker";
import { Oracle } from "@/components/slot/Oracle";
import { useGameState, useSpin, useSetBalance, useJackpot, JACKPOT_KEY, type SpinResponse, type JackpotResponse } from "@/hooks/use-game";
import { useLang } from "@/lib/lang-context";
import { soundManager } from "@/lib/sound";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { coinBurst, fireworks, luckyRain, cannons, stopCelebrations, winTier, type WinTier } from "@/lib/celebrate";
import { ShareButton } from "@/components/ShareCard";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const EMOJI: Record<string, string> = {
  pearl: "🔮", dragon: "🐉", drum: "🥁", lotus: "🌸", lantern: "🏮", koi: "🐟", coin: "🪙", envelope: "🧧",
};
const GLOW: Record<string, string> = {
  pearl: "drop-shadow(0 0 14px #c4b5fd)",
  dragon: "drop-shadow(0 0 18px #fbbf24)",
  drum: "drop-shadow(0 0 12px #a855f7)",
  lotus: "drop-shadow(0 0 12px #ec4899)",
  lantern: "drop-shadow(0 0 10px #f97316)",
  koi: "drop-shadow(0 0 10px #38bdf8)",
  coin: "drop-shadow(0 0 8px #facc15)",
  envelope: "drop-shadow(0 0 12px #ef4444)",
};
/** One colour per payline, spread round the colour wheel */
const LINE_COLORS = PAYLINES.map((_, i) => `hsl(${(i * 137.5 + 45) % 360} 95% 62%)`);
const REEL_IDX = Array.from({ length: REELS }, (_, i) => i);
const ROW_IDX = Array.from({ length: ROWS }, (_, i) => i);
const emptyCells = () => REEL_IDX.map(() => ROW_IDX.map(() => false));
const BULB_COLORS = ["#facc15", "#ef4444", "#f472b6", "#22d3ee"];
const IDS = SLOT_SYMBOLS.map((s) => s.id);
const randomSymbol = () => IDS[Math.floor(Math.random() * IDS.length)];

const REEL_STOP_MS = [420, 620, 820, 1020, 1220];
/** Each Repeater step: cells spin for RESPIN_MS, then the result shows until the next step */
const STEP_MS = 1500;
const RESPIN_MS = 750;
const OVERLAY_MS: Record<WinTier, number> = { none: 0, small: 0, win: 0, big: 2600, mega: 3800, epic: 5200, jackpot: 7000 };

function fmtBet(a: number) {
  return a >= 1_000_000 ? `${a / 1_000_000}M` : `${a / 1000}K`;
}

/** True when the phone/browser asks for less motion (Android "Remove animations", some battery savers) */
function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const onChange = () => setReduced(m.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

/** A number that rolls smoothly from its previous value to the new one */
function RollingNumber({ value, ms = 900 }: { value: number; ms?: number }) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const v = Math.round(a + (value - a) * (1 - (1 - p) ** 3));
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, ms]);
  return <>{display.toLocaleString()}</>;
}

/**
 * A cell whose symbol flickers through random symbols. Driven by JavaScript so it works even
 * where the browser has switched CSS animations off.
 */
function FlickerSymbol({ fast = true }: { fast?: boolean }) {
  const [s, setS] = useState(randomSymbol);
  const [jitter, setJitter] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => { setS(randomSymbol()); setJitter((j) => (j ? 0 : 1)); }, fast ? 70 : 120);
    return () => window.clearInterval(id);
  }, [fast]);
  return (
    <span
      className="text-[2.1rem] sm:text-5xl select-none"
      style={{ filter: fast ? "blur(2px) brightness(1.15)" : "brightness(1.1)", transform: fast ? `translateY(${jitter ? 6 : -6}px)` : undefined }}
    >
      {EMOJI[s]}
    </span>
  );
}

/** A whole reel scrolling, animated frame by frame from JavaScript (not CSS) */
function ScrollingStrip({ spinId }: { spinId: number }) {
  const strip = useMemo(() => {
    const s = Array.from({ length: 6 }, randomSymbol);
    return [...s, ...s];
  }, [spinId]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let pos = 0; // 0..1 across half the strip
    const tick = (now: number) => {
      pos = (pos + (now - last) / 320) % 1;
      last = now;
      if (ref.current) ref.current.style.transform = `translate3d(0, ${-50 + pos * 50}%, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl sm:rounded-2xl bg-white/5 border border-white/10">
      <div ref={ref} className="absolute inset-x-0 top-0 will-change-transform" style={{ height: "400%", filter: "blur(2px) brightness(1.15)" }}>
        {strip.map((s, i) => (
          <div key={i} className="flex items-center justify-center" style={{ height: `${100 / strip.length}%` }}>
            <span className="text-[2.1rem] sm:text-5xl select-none">{EMOJI[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Reel({ col, symbols, spinning, cellSpinning, spinId, lineCells, scatterRows, heldRows, reducedMotion }: {
  col: number;
  symbols: string[];
  spinning: boolean;
  cellSpinning: boolean[];
  spinId: number;
  lineCells: Set<number>;
  scatterRows: Set<number>;
  heldRows: Set<number>;
  reducedMotion: boolean;
}) {
  return (
    <div className="relative" data-testid="reel">
      <div className={`flex flex-col gap-1.5 sm:gap-2 ${spinning && !reducedMotion ? "opacity-0" : spinning ? "" : "reel-land"}`} key={`land-${spinId}-${spinning}`}>
        {symbols.map((s, r) => {
          const onLine = lineCells.has(r);
          const scatter = scatterRows.has(r);
          const held = heldRows.has(r);
          const respinning = cellSpinning[r] || (spinning && reducedMotion);
          return (
            <div
              key={r}
              className={`relative flex items-center justify-center aspect-square rounded-xl sm:rounded-2xl border transition-colors duration-300 overflow-hidden ${
                respinning ? "bg-white/10 border-white/20"
                  : held ? "bg-purple-500/25 border-purple-300 shadow-[0_0_22px_rgba(192,132,252,0.7)]"
                  : scatter ? "bg-red-500/25 border-red-400 shadow-[0_0_24px_rgba(239,68,68,0.6)]"
                  : onLine ? "bg-yellow-500/20 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]"
                  : "bg-white/5 border-white/10"
              }`}
              data-testid={`cell-${col}-${r}`}
            >
              {respinning ? (
                <FlickerSymbol fast={!reducedMotion} />
              ) : (
                <span
                  className={`text-[2.1rem] sm:text-5xl select-none ${scatter ? "scatter-hit" : onLine ? "symbol-winning" : ""} ${s === WILD_ID ? "wild-glow" : ""}`}
                  style={{ filter: GLOW[s] }}
                >
                  {EMOJI[s]}
                </span>
              )}
              {held && !respinning && <Lock className="absolute top-0.5 right-0.5 w-3 h-3 text-purple-200" aria-hidden />}
            </div>
          );
        })}
      </div>
      {spinning && !reducedMotion && <ScrollingStrip spinId={spinId} />}
    </div>
  );
}

function Bulbs({ mode }: { mode: "idle" | "spin" | "win" }) {
  return (
    <div className={`flex justify-between px-3 bulbs-${mode}`} aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="bulb" style={{ color: BULB_COLORS[i % BULB_COLORS.length], animationDelay: `${(i % 4) * 0.11}s` }} />
      ))}
    </div>
  );
}

function JackpotMeter({ bet }: { bet: number }) {
  const { t } = useLang();
  const { data } = useJackpot();
  if (!data) return null;
  return (
    <div className="w-full rounded-2xl border-2 border-yellow-400/70 bg-gradient-to-r from-red-900 via-red-700 to-red-900 px-3 py-1.5 text-center shadow-[0_0_24px_rgba(250,204,21,0.35)]" data-testid="jackpot-meter">
      <div className="flex items-center justify-center gap-2">
        <span className="text-xl">🏺</span>
        <span className="text-[11px] font-black tracking-[0.2em] text-yellow-200">{t.jackpotName}</span>
        <span className="font-mono font-black text-xl sm:text-2xl text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" data-testid="text-jackpot">
          <RollingNumber value={data.amount} />
        </span>
      </div>
      <div className="text-[10px] sm:text-[11px] font-bold text-yellow-100/80" data-testid="text-jackpot-share">
        {t.jackpotYourBet} {fmtBet(bet)}: <span className="font-mono text-yellow-300">{jackpotShare(data.amount, bet).toLocaleString()}</span>
      </div>
      {data.lastWinner && data.lastAmount ? (
        <div className="text-[10px] text-yellow-100/70">{t.jackpotLast}: {data.lastWinner} · {data.lastAmount.toLocaleString()}</div>
      ) : null}
    </div>
  );
}

interface Chip { key: string; label: string; amount: number; color: string; mult: number }

export function SlotMachine() {
  const { t, lang, toggleLang } = useLang();
  const { toast } = useToast();
  const { data: state } = useGameState();
  const spinMutation = useSpin();
  const setBalance = useSetBalance();
  const reducedMotion = useReducedMotion();

  const balance = state?.balance ?? 0;
  const freeSpins = state?.freeSpins ?? 0;

  const [grid, setGrid] = useState<string[][]>([
    ["dragon", "lotus", "coin"], ["envelope", "dragon", "lantern"], ["lotus", "pearl", "dragon"], ["koi", "dragon", "drum"], ["dragon", "lantern", "envelope"],
  ]);
  const [colSpinning, setColSpinning] = useState(REEL_IDX.map(() => false));
  const [cellSpinning, setCellSpinning] = useState<boolean[][]>(emptyCells);
  const [spinId, setSpinId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bet, setBet] = useState(BET_OPTIONS[0]);
  const [result, setResult] = useState<SpinResponse | null>(null);
  // What is lit up while a spin plays out, step by step
  const [shownLines, setShownLines] = useState<number[]>([]);
  /** How many cells of each shown line are part of the win (from the left) */
  const [lineCounts, setLineCounts] = useState<Record<number, number>>({});
  const [showPicker, setShowPicker] = useState(false);
  const [showGamble, setShowGamble] = useState(false);
  const [showOracle, setShowOracle] = useState(false);
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [chips, setChips] = useState<Chip[]>([]);
  const [showScatter, setShowScatter] = useState(false);
  const [repeaterBanner, setRepeaterBanner] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<{ res: SpinResponse; tier: WinTier } | null>(null);
  // The last big win stays shareable until the next one (or the player closes it)
  const [brag, setBrag] = useState<{ amount: number; multiple: number; jackpot: boolean; tier: WinTier } | null>(null);
  const [scatterBanner, setScatterBanner] = useState<SpinResponse | null>(null);
  const scatterBannerRef = useRef(false);
  scatterBannerRef.current = !!scatterBanner;
  const [shaking, setShaking] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);
  const [muted, setMuted] = useState(soundManager.isMuted());
  const [showPaytable, setShowPaytable] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); stopCelebrations(); }, []);

  // Keep the bet affordable after a loss
  useEffect(() => {
    if (!state || freeSpins > 0 || busy || bet <= balance) return;
    const affordable = [...BET_OPTIONS].reverse().find((b) => b <= balance);
    if (affordable) setBet(affordable);
  }, [balance, bet, busy, freeSpins, state]);

  const pendingUnits = state?.pendingFreeSpinUnits ?? 0;
  // GIỮ CUỘN: reels the player has chosen to hold for the next spin
  const holdOffer = !!state?.holdOffer && freeSpins === 0 && !!state?.holdBet;
  const [holdPicks, setHoldPicks] = useState<number[]>([]);
  useEffect(() => { if (!holdOffer) setHoldPicks([]); }, [holdOffer]);
  const holding = holdOffer && holdPicks.length > 0;
  const spinBet = holding ? state!.holdBet! : bet;
  const gambleAmount = state?.gambleAmount ?? 0;
  const canSpin = !busy && !!state && pendingUnits === 0 && (freeSpins > 0 || balance >= spinBet);

  // Free spins won earlier (or before a reload) and still waiting for the pick
  useEffect(() => {
    if (pendingUnits > 0 && !busy && !scatterBannerRef.current) setShowPicker(true);
  }, [pendingUnits, busy]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /** End of the spin: balance, celebration by total size, free spins, achievements */
  const finish = useCallback((res: SpinResponse) => {
    setResult(res);
    setRepeaterBanner(null);
    setHeld(new Set());
    setBalance(res.newBalance, {
      freeSpins: res.totalFreeSpins,
      freeSpinBet: res.isFreeSpin || res.freeSpinUnits ? res.bet : state?.freeSpinBet ?? 0,
      ...(res.isFreeSpin ? {} : { freeSpinMult: 1 }),
      pendingFreeSpinUnits: res.pendingFreeSpinUnits,
      gambleAmount: res.gambleAmount,
      gambleRounds: 0,
      streak: res.streak,
      totalWins: res.totalWins,
      maxWin: res.maxWin,
      gamesPlayed: res.gamesPlayed,
      blessed: false,
      blessing: 1,
      oracleStick: null,
      holdOffer: res.holdOffer,
      holdBet: res.holdBet,
    });
    if (res.holdOffer) { setAutoSpin(false); soundManager.bonus(); }
    if (res.jackpotPool != null) {
      queryClient.setQueryData<JackpotResponse>(JACKPOT_KEY, (old) => (old ? { ...old, amount: res.jackpotPool! } : old));
    }
    if (res.jackpotWin > 0) queryClient.invalidateQueries({ queryKey: JACKPOT_KEY });
    setBusy(false);

    // Celebrations scale with the win. Spins that pay back less than the bet are not celebrated.
    const tier: WinTier = res.jackpotWin > 0 ? "jackpot" : winTier(res.winAmount, res.bet);
    if (tier === "win") {
      coinBurst();
      soundManager.win(false);
    } else if (tier !== "none" && tier !== "small") {
      setOverlay({ res, tier });
      setBrag({ amount: res.winAmount, multiple: +(res.winAmount / res.bet).toFixed(1), jackpot: tier === "jackpot", tier });
      setShaking(true);
      later(() => setShaking(false), 1300);
      soundManager.bigWinFanfare();
      soundManager.coinShower();
      if (tier === "big") fireworks(2200);
      if (tier === "mega") { fireworks(3400, 1.4); luckyRain(3200); }
      if (tier === "epic") { fireworks(4800, 1.8); cannons(2600); luckyRain(4600); }
      if (tier === "jackpot") { fireworks(6500, 2); cannons(4500); luckyRain(6500); later(() => soundManager.bigWinFanfare(), 1800); }
      later(() => setOverlay(null), OVERLAY_MS[tier]);
    } else if (tier === "none" && res.scatterCount < 3) {
      soundManager.lossComfort();
    }

    if (res.freeSpinUnits) {
      later(() => {
        setScatterBanner(res);
        soundManager.freeSpin();
        soundManager.bonus();
        if (tier === "none" || tier === "small" || tier === "win") luckyRain(2400);
      }, OVERLAY_MS[tier] ? OVERLAY_MS[tier] - 400 : 150);
      later(() => {
        setScatterBanner(null);
        // Won in the base game: the player picks how to take them
        if (res.pendingFreeSpinUnits > 0) { setAutoSpin(false); setShowPicker(true); }
      }, (OVERLAY_MS[tier] || 0) + 2600);
    }
    res.newAchievements.forEach((a) => toast({ title: `🏆 ${a.badgeName}`, description: a.description }));
  }, [setBalance, state?.freeSpinBet, toast]);

  /** Light up the lines (and chips) a step paid */
  const showStep = useCallback((res: SpinResponse, i: number) => {
    const step = res.steps[i];
    setGrid(step.grid);
    if (step.lineWins.length) {
      setShownLines((l) => [...l.filter((x) => !step.lineWins.some((w) => w.line === x)), ...step.lineWins.map((w) => w.line)]);
      setLineCounts((m) => ({ ...m, ...Object.fromEntries(step.lineWins.map((w) => [w.line, w.count])) }));
      setChips((c) => [
        ...c,
        ...step.lineWins.map((w) => ({
          key: `${i}-${w.line}`,
          label: `${w.upgrade ? "⬆ " : ""}${EMOJI[w.symbol]}×${w.count}${w.withWild ? " 🔮" : ""}`,
          amount: Math.floor(w.amount * (res.blessing || 1)) * (res.freeSpinMult || 1),
          color: LINE_COLORS[w.line],
          mult: step.multiplier,
        })),
      ]);
      if (i > 0) soundManager.multiplierHit(step.multiplier);
    }
    // What stays locked for the next repeat (winning cells and sticky pearls)
    const next = res.steps[i + 1];
    if (next) setHeld(new Set(next.held));
    if (i === 0 && res.scatterCount >= 3) {
      setShowScatter(true);
      setChips((c) => [...c, { key: "scatter", label: `🧧×${res.scatterCount}`, amount: res.scatterWin, color: "#f87171", mult: 1 }]);
    }
  }, []);

  const handleSpin = useCallback(async () => {
    if (!canSpin) {
      if (state && freeSpins === 0 && balance < bet) {
        toast({ title: t.insufficientBalance, description: t.insufficientBalanceDesc, variant: "destructive" });
        setAutoSpin(false);
      }
      return;
    }
    stopCelebrations();
    setBusy(true);
    setResult(null);
    setOverlay(null);
    setScatterBanner(null);
    setRepeaterBanner(null);
    setShownLines([]);
    setLineCounts({});
    setHeld(new Set());
    setChips([]);
    setShowScatter(false);
    setShowGamble(false);
    setSpinId((n) => n + 1);
    const heldNow = holding ? [...holdPicks] : [];
    setColSpinning(REEL_IDX.map((c) => !heldNow.includes(c)));
    setHoldPicks([]);
    soundManager.spinStart();
    if (freeSpins === 0) setBalance(balance - spinBet, { holdOffer: false }); // show the stake leaving straight away

    const started = Date.now();
    try {
      const res = await spinMutation.mutateAsync({ betAmount: spinBet, hold: heldNow });
      const first = res.steps[0];
      const wait = Math.max(0, 300 - (Date.now() - started));
      REEL_STOP_MS.forEach((ms, col) => later(() => {
        setGrid((g) => g.map((c, i) => (i === col ? first.grid[col] : c)));
        setColSpinning((r) => r.map((v, i) => (i === col ? false : v)));
        soundManager.reelStop();
      }, wait + ms));

      const t0 = wait + REEL_STOP_MS[REELS - 1] + 380;
      later(() => showStep(res, 0), t0);

      // Repeater: each step locks the winners, re-spins the rest, then shows what it paid
      res.steps.slice(1).forEach((step, k) => {
        const i = k + 1;
        const at = t0 + 700 + k * STEP_MS;
        later(() => {
          setRepeaterBanner(step.multiplier);
          const heldSet = new Set(step.held);
          setCellSpinning(REEL_IDX.map((c) => ROW_IDX.map((r) => !heldSet.has(`${c}-${r}`))));
          soundManager.spinStart();
        }, at);
        later(() => {
          setCellSpinning(emptyCells());
          soundManager.reelStop();
          showStep(res, i);
        }, at + RESPIN_MS);
      });
      const end = res.steps.length > 1 ? t0 + 700 + (res.steps.length - 1) * STEP_MS - 300 : t0 + 150;
      later(() => finish(res), end);
    } catch (e) {
      setColSpinning(REEL_IDX.map(() => false));
      setBusy(false);
      setAutoSpin(false);
      queryClient.invalidateQueries({ queryKey: ["/api/game/state"] });
      if (e instanceof ApiError && e.status === 409) { setShowPicker(true); return; }
      const msg = e instanceof ApiError && e.status === 400 ? t.insufficientBalanceDesc : (e as Error).message;
      toast({ title: t.error, description: msg, variant: "destructive" });
    }
  }, [balance, bet, spinBet, holding, holdPicks, canSpin, finish, freeSpins, setBalance, showStep, spinMutation, state, t, toast]);

  // Auto-spin: queue the next spin once the machine is idle and any celebration has played
  useEffect(() => {
    if (!autoSpin || busy) return;
    if (!canSpin) { setAutoSpin(false); return; }
    const id = window.setTimeout(handleSpin, overlay ? OVERLAY_MS[overlay.tier] + 200 : scatterBanner ? 2600 : 900);
    return () => clearTimeout(id);
  }, [autoSpin, busy, canSpin, handleSpin, overlay, scatterBanner]);

  // Space bar spins
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        handleSpin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSpin]);

  const consultOracle = () => {
    soundManager.buttonClick();
    setAutoSpin(false);
    setShowOracle(true);
  };

  const onPicked = (r: PickResult) => {
    setShowPicker(false);
    queryClient.setQueryData(["/api/game/state"], (old: any) => (old ? { ...old, freeSpins: r.freeSpins, freeSpinBet: r.freeSpinBet || old.freeSpinBet, freeSpinMult: r.mult, pendingFreeSpinUnits: 0 } : old));
    toast({ title: `🧧 ${r.spins} ${t.freeSpinsLeft} ×${r.mult}` });
  };

  const toggleMute = () => {
    soundManager.setMuted(!muted);
    setMuted(!muted);
  };

  // Which cells to light up, per column
  const lineCellsByCol = REEL_IDX.map(() => new Set<number>());
  shownLines.forEach((l) => PAYLINES[l].slice(0, lineCounts[l] ?? REELS).forEach((row, col) => lineCellsByCol[col].add(row)));
  const scatterRowsByCol = REEL_IDX.map(() => new Set<number>());
  if (showScatter) grid.forEach((col, c) => col.forEach((s, r) => { if (s === SCATTER_ID) scatterRowsByCol[c].add(r); }));
  const heldByCol = REEL_IDX.map(() => new Set<number>());
  if (repeaterBanner !== null) held.forEach((k) => { const [c, r] = k.split("-").map(Number); heldByCol[c].add(r); });
  if (holdOffer && !busy) holdPicks.forEach((c) => ROW_IDX.forEach((r) => heldByCol[c].add(r)));

  const lockedBet = freeSpins > 0 ? state?.freeSpinBet || bet : holding ? state!.holdBet! : bet;
  const bulbMode = busy && !shownLines.length ? "spin" : overlay || scatterBanner || repeaterBanner || (result && result.winAmount > result.bet) ? "win" : busy ? "spin" : "idle";
  const tierTitle = (tier: WinTier) => (tier === "jackpot" ? t.jackpotWin : tier === "epic" ? t.megaWin : tier === "mega" ? t.hugeWin : t.bigWin);
  const runningTotal = chips.reduce((a, c) => a + c.amount, 0);

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-md mx-auto" data-testid="slot-machine">
      {/* Top bar */}
      <div className="w-full flex justify-between items-center bg-indigo-950/80 px-3 py-2 sm:px-5 sm:py-3 rounded-2xl border border-yellow-500/20 backdrop-blur-xl">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleMute} className="text-yellow-400" aria-label={t.sound} data-testid="button-mute">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleLang} className="text-yellow-400 font-bold" data-testid="button-lang">
            {lang === "en" ? "EN" : "VI"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { stopCelebrations(); setShowPaytable(true); }} className="text-yellow-400" aria-label={t.paytable} data-testid="button-paytable">
            <Info className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {state?.blessed && (
            <span className="text-[10px] sm:text-xs bg-purple-600 px-2 py-1 rounded-full text-white font-black animate-pulse" data-testid="badge-blessed">
              ✨ ×{state.blessing ?? 2} {t.blessedBadge}
            </span>
          )}
          <div className="text-right">
            <p className="text-[10px] text-yellow-500/50 font-black uppercase tracking-widest">{t.balance}</p>
            <p className="text-xl sm:text-3xl font-mono font-black text-yellow-400 tracking-tight" data-testid="text-machine-balance">
              {balance.toLocaleString()} 🪙
            </p>
          </div>
        </div>
      </div>

      <JackpotMeter bet={lockedBet} />

      {/* Cabinet */}
      <div
        className={`relative w-full bg-gradient-to-b from-[#2a0f4f] via-[#140726] to-[#0a051a] rounded-[2rem] pt-2 pb-2 px-2 sm:px-3 border-4 shadow-[0_0_60px_rgba(0,0,0,0.9)] ${
          freeSpins > 0 ? "border-purple-400 free-spins-frame" : "border-yellow-700/60"
        } ${shaking ? "cabinet-shake" : ""}`}
        data-testid="cabinet"
      >
        <Bulbs mode={bulbMode} />

        {freeSpins > 0 && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-4 z-10 flex items-center gap-1 bg-gradient-to-r from-purple-600 to-fuchsia-500 px-4 py-1 rounded-full text-white text-xs font-black shadow-lg border-2 border-yellow-300" data-testid="badge-free-spins">
            <Gift className="w-3.5 h-3.5" /> {t.freeSpinsMode} · {freeSpins}{(state?.freeSpinMult ?? 1) > 1 ? ` · ×${state?.freeSpinMult}` : ""}
          </div>
        )}

        <div className="relative grid grid-cols-5 gap-1.5 sm:gap-2 bg-black/60 rounded-[1.5rem] p-1.5 sm:p-3 my-2 border border-white/5 overflow-hidden">
          {grid.map((col, c) => (
            <Reel
              key={c}
              col={c}
              symbols={col}
              spinning={colSpinning[c]}
              cellSpinning={cellSpinning[c]}
              spinId={spinId}
              lineCells={lineCellsByCol[c]}
              scatterRows={scatterRowsByCol[c]}
              heldRows={heldByCol[c]}
              reducedMotion={reducedMotion}
            />
          ))}

          {/* Payline overlay: each winning line drawn as it pays */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 500 300" preserveAspectRatio="none">
            {shownLines.map((l, i) => (
              <motion.polyline
                key={`${spinId}-${l}-${lineCounts[l]}`}
                points={PAYLINES[l].slice(0, lineCounts[l] ?? REELS).map((row, col) => `${50 + col * 100},${50 + row * 100}`).join(" ")}
                fill="none"
                stroke={LINE_COLORS[l]}
                strokeWidth={l === 0 ? 7 : 5}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 6px ${LINE_COLORS[l]})` }}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.9 }}
                transition={{ duration: 0.35, delay: (i % 4) * 0.15 }}
              />
            ))}
          </svg>

          {/* Repeater banner */}
          <AnimatePresence>
            {repeaterBanner !== null && (
              <motion.div
                key={`rep-${repeaterBanner}`}
                initial={{ opacity: 0, scale: 0.4, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 1.6 }}
                transition={{ type: "spring", stiffness: 380, damping: 16 }}
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 flex justify-center pointer-events-none"
                data-testid="banner-repeater"
              >
                <div className="px-5 py-2 rounded-2xl bg-gradient-to-r from-purple-700/95 via-fuchsia-600/95 to-purple-700/95 border-2 border-yellow-300 shadow-[0_0_30px_rgba(217,70,239,0.8)] text-center">
                  <div className="text-[11px] font-black tracking-[0.3em] text-yellow-200">🔁 {t.repeaterGo}</div>
                  <div className="text-4xl font-black text-white leading-none drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]">×{repeaterBanner}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {holdOffer && !busy && (
          <div className="px-1.5 sm:px-3 -mt-1 mb-1" data-testid="hold-row">
            <div className="text-center text-[11px] font-black text-yellow-200 mb-1 tracking-wide">
              🔒 {lang === "vi" ? `GIỮ CUỘN! Chọn tối đa 2 cuộn để giữ (cược ${fmtBet(state!.holdBet!)})` : `HOLD! Pick up to 2 reels to keep (bet ${fmtBet(state!.holdBet!)})`}
            </div>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {REEL_IDX.map((c) => {
                const on = holdPicks.includes(c);
                return (
                  <button key={c} type="button"
                    onClick={() => { soundManager.buttonClick(); setHoldPicks((h) => (h.includes(c) ? h.filter((x) => x !== c) : h.length >= 2 ? h : [...h, c])); }}
                    className={`py-1.5 rounded-lg text-[11px] font-black border-2 transition active:scale-95 ${on ? "bg-yellow-400 text-black border-white shadow-[0_0_14px_rgba(250,204,21,0.8)]" : "bg-black/50 text-yellow-300 border-yellow-500/50 animate-pulse"}`}
                    data-testid={`hold-${c}`}>
                    {on ? (lang === "vi" ? "ĐÃ GIỮ" : "HELD") : (lang === "vi" ? "GIỮ" : "HOLD")}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Bulbs mode={bulbMode} />

        {/* Big / mega / epic / jackpot win overlay */}
        <AnimatePresence>
          {overlay && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.4 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className={`absolute inset-0 flex flex-col items-center justify-center z-20 backdrop-blur-sm rounded-[2rem] cursor-pointer ${overlay.tier === "jackpot" ? "bg-red-950/85" : "bg-black/70"}`}
              onClick={() => setOverlay(null)}
              data-testid="overlay-big-win"
            >
              <motion.div animate={{ y: [-8, 8], rotate: [-6, 6] }} transition={{ repeat: Infinity, duration: 0.5, repeatType: "mirror" }}>
                {overlay.tier === "jackpot" ? <span className="text-7xl">🏺</span>
                  : overlay.tier === "epic" ? <span className="text-7xl">🐉</span>
                  : <Crown className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]" />}
              </motion.div>
              <motion.h2
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="text-4xl sm:text-6xl font-black italic tracking-tighter my-2 bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]"
              >
                {tierTitle(overlay.tier)}
              </motion.h2>
              <div className="text-4xl sm:text-6xl font-black text-white font-mono drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]">
                <RollingNumber value={overlay.res.winAmount} ms={OVERLAY_MS[overlay.tier] * 0.55} />
              </div>
              {overlay.tier === "jackpot" ? (
                <div className="text-yellow-200/90 font-bold mt-1">🏺 {t.jackpotName} +{overlay.res.jackpotWin.toLocaleString()}</div>
              ) : (
                <div className="text-yellow-200/80 font-bold mt-1">×{+(overlay.res.winAmount / overlay.res.bet).toFixed(1)}{overlay.res.repeats > 0 ? ` · 🔁×${overlay.res.repeats}` : ""}</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lucky envelopes banner */}
        <AnimatePresence>
          {scatterBanner && !overlay && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 1.3 }}
              className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-20 rounded-3xl bg-gradient-to-b from-red-600 to-red-800 border-4 border-yellow-300 shadow-[0_0_40px_rgba(239,68,68,0.8)] text-center py-4 px-3"
              data-testid="banner-scatter"
            >
              <div className="text-4xl">🧧🧧🧧</div>
              <div className="text-2xl sm:text-3xl font-black text-yellow-300 tracking-tight">{t.scatterWin}</div>
              <div className="text-white font-black text-lg">
                {scatterBanner.isFreeSpin
                  ? `+${Math.floor(scatterBanner.freeSpinUnits / Math.max(1, scatterBanner.freeSpinMult))} ${t.freeSpinsLeft} ×${scatterBanner.freeSpinMult}`
                  : lang === "vi" ? "🧧 Chọn lì xì của bạn!" : "🧧 Pick your envelope!"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Result line + what paid */}
      <div className="min-h-[3.25rem] flex flex-col items-center justify-start text-center gap-1" aria-live="polite" data-testid="text-result">
        {result && !busy ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-black text-lg">
            {result.winAmount > result.bet ? (
              <span className="text-green-400">{t.youWon} {result.winAmount.toLocaleString()} 🪙{result.blessing > 1 ? ` (✨×${result.blessing})` : ""}{result.freeSpinMult > 1 ? ` (🧧×${result.freeSpinMult})` : ""}</span>
            ) : result.winAmount > 0 ? (
              <span className="text-yellow-200/70">{t.smallWin} +{result.winAmount.toLocaleString()} · {t.bet} {result.bet.toLocaleString()}</span>
            ) : (
              <span className="text-white/40">{t.noWin}</span>
            )}
          </motion.div>
        ) : busy && runningTotal > 0 ? (
          <div className="font-black text-lg text-yellow-300 font-mono" data-testid="text-running-total">+<RollingNumber value={runningTotal} ms={400} /></div>
        ) : null}
        {chips.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5" data-testid="win-breakdown">
            {chips.slice(-6).map((c) => (
              <motion.span
                key={c.key}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs font-bold px-2 py-0.5 rounded-full border bg-black/40"
                style={{ borderColor: c.color, color: c.color }}
              >
                {c.label}{c.mult > 1 ? ` ×${c.mult}` : ""} +{c.amount.toLocaleString()}
              </motion.span>
            ))}
            {chips.length > 6 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/40 text-yellow-200/70">+{chips.length - 6}</span>}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="w-full bg-black/70 p-4 rounded-[2rem] border border-white/10 backdrop-blur-2xl">
        <div className="text-[10px] text-yellow-500/50 font-black uppercase tracking-widest mb-2 text-center">
          {t.bet}: {lockedBet.toLocaleString()}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-4">
          {BET_OPTIONS.map((a) => (
            <button
              key={a}
              disabled={busy || freeSpins > 0 || a > balance}
              onClick={() => { setBet(a); soundManager.betChange(); }}
              className={`py-2.5 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed ${
                lockedBet === a ? "bg-yellow-500 text-black shadow-[0_0_16px_rgba(251,191,36,0.5)]" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
              data-testid={`button-bet-${a}`}
            >
              {fmtBet(a)}
            </button>
          ))}
        </div>
        {gambleAmount > 0 && !busy && freeSpins === 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { setAutoSpin(false); setShowGamble(true); soundManager.buttonClick(); }}
            className="w-full mb-3 py-2.5 rounded-2xl bg-gradient-to-r from-red-700 via-red-600 to-red-700 border-2 border-yellow-300 text-white font-black shadow-[0_0_20px_rgba(239,68,68,0.5)] flex items-center justify-center gap-2"
            data-testid="button-gamble"
          >
            <span className="text-xl">🥣</span>
            {lang === "vi" ? `Xóc Đĩa: nhân đôi ${gambleAmount.toLocaleString()}?` : `Xóc Đĩa: double ${gambleAmount.toLocaleString()}?`}
            <span className="text-xs bg-yellow-300 text-black rounded-full px-2 py-0.5">×{GAMBLE_PAYS.chan} / ×{GAMBLE_PAYS.tu_do}</span>
          </motion.button>
        )}
        <div className="flex gap-3">
          <Button
            onClick={handleSpin}
            disabled={!canSpin}
            className={`relative overflow-hidden spin-shine flex-1 h-16 rounded-2xl text-white font-black text-2xl sm:text-4xl shadow-[0_8px_0_#9a3412] hover:brightness-110 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60 ${
              freeSpins > 0 ? "bg-gradient-to-b from-fuchsia-400 via-purple-600 to-indigo-800" : "bg-gradient-to-b from-yellow-400 via-orange-500 to-red-700"
            }`}
            data-testid="button-spin"
          >
            {busy ? <Loader2 className="animate-spin w-10 h-10" /> : freeSpins > 0 ? `${t.spin} 🎁` : t.spin}
          </Button>
          <Button
            onClick={() => { setAutoSpin(!autoSpin); soundManager.autoSpinToggle(); }}
            aria-pressed={autoSpin}
            aria-label={t.autoSpin}
            className={`h-16 w-16 sm:w-20 rounded-2xl border-2 flex-col gap-0 ${autoSpin ? "bg-green-600 border-green-400 text-white" : "bg-white/5 border-white/10 text-yellow-500 hover:bg-white/10"}`}
            data-testid="button-autospin"
          >
            <RotateCw className={autoSpin ? "animate-spin w-6 h-6" : "w-6 h-6"} />
            <span className="text-[10px] font-black uppercase">{t.autoSpin}</span>
          </Button>
          <Button
            onClick={consultOracle}
            aria-label={t.oracle}
            className="h-16 w-16 sm:w-20 rounded-2xl bg-purple-900/40 border-2 border-purple-500/50 text-purple-300 hover:bg-purple-800/50 flex-col gap-0"
            data-testid="button-oracle"
          >
            <Wand2 className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase">{t.oracle}</span>
          </Button>
        </div>
      </div>

      {brag && (
        <div className="flex items-center justify-center gap-2 mt-3" data-testid="brag-chip">
          <ShareButton
            what={{
              emoji: brag.jackpot ? "🏺" : brag.tier === "epic" ? "🐉" : "💰",
              title: brag.jackpot ? (lang === "vi" ? "NỔ HŨ RỒNG!" : "JACKPOT!") : tierTitle(brag.tier),
              amount: brag.amount,
              detail: `Slot Rồng Vàng · ×${brag.multiple}`,
            }}
            label={lang === "vi" ? `Khoe thắng +${brag.amount.toLocaleString("vi-VN")}` : `Share +${brag.amount.toLocaleString()}`}
          />
          <button type="button" onClick={() => setBrag(null)} className="w-8 h-8 rounded-full bg-white/10 text-white/60 text-sm" aria-label="Dismiss">✕</button>
        </div>
      )}

      {showPicker && pendingUnits > 0 && (
        <FreeSpinPicker units={pendingUnits} bet={state?.freeSpinBet || bet} onPicked={onPicked} />
      )}
      {showGamble && gambleAmount > 0 && (
        <XocDia
          amount={gambleAmount}
          rounds={state?.gambleRounds ?? 0}
          onBalance={(b, amount, rounds) => setBalance(b, { gambleAmount: amount, gambleRounds: rounds })}
          onClose={() => { setShowGamble(false); queryClient.setQueryData(["/api/game/state"], (old: any) => (old ? { ...old, gambleAmount: 0 } : old)); }}
        />
      )}
      {showOracle && (
        <Oracle
          lastOracleAt={state?.lastOracleAt ?? null}
          waitingStick={state?.blessed ? state?.oracleStick ?? null : null}
          onBlessed={(stick, blessing) => queryClient.setQueryData(["/api/game/state"], (old: any) => (old ? { ...old, blessed: true, blessing, oracleStick: stick, lastOracleAt: new Date().toISOString() } : old))}
          onClose={() => setShowOracle(false)}
        />
      )}

      <Dialog open={showPaytable} onOpenChange={setShowPaytable}>
        <DialogContent className="bg-[#140a2e] border-yellow-500/30 text-yellow-50 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-yellow-400 font-black">{t.paytable}</DialogTitle>
            <DialogDescription className="text-yellow-100/70">{t.paytableIntro}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_repeat(3,minmax(0,4.5rem))] gap-x-2 text-[10px] font-black text-yellow-100/50 uppercase px-3">
              <span>{t.bet} {fmtBet(lockedBet)}</span><span className="text-right">×3</span><span className="text-right">×4</span><span className="text-right">×5</span>
            </div>
            {SLOT_SYMBOLS.filter((s) => s.kind !== "scatter").map((s) => (
              <div key={s.id} className={`grid grid-cols-[1fr_repeat(3,minmax(0,4.5rem))] gap-x-2 items-center rounded-xl px-3 py-2 ${s.kind === "wild" ? "bg-purple-500/20 border border-purple-400/40" : "bg-white/5"}`}>
                <span className="text-2xl">
                  {EMOJI[s.id]}
                  {s.kind === "wild" && <span className="ml-1.5 text-[10px] font-black text-purple-200 align-middle">{t.wild}</span>}
                </span>
                {s.pays.map((m, k) => (
                  <span key={k} className="text-right leading-tight">
                    <span className="block font-mono font-black text-yellow-400 text-sm">{Math.floor(m * lockedBet).toLocaleString()}</span>
                    <span className="block text-[9px] text-yellow-100/40">×{m}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="text-sm text-purple-200/90">{t.paytableWild}</p>

          <p className="text-sm text-fuchsia-200/90 mt-1">{t.paytableRepeater}</p>
          <div className="text-center text-xl tracking-widest">{"🔮".repeat(REPEATER_PEARLS)} → 🐉</div>
          <div className="flex justify-center gap-1.5">
            {REPEATER_MULTIPLIERS.map((m) => (
              <span key={m} className="px-2.5 py-1 rounded-lg bg-fuchsia-600/30 border border-fuchsia-400/50 font-black text-yellow-200 text-sm">×{m}</span>
            ))}
          </div>

          <p className="text-sm text-yellow-200/90 mt-1">{t.paytableJackpot}</p>
          <div className="flex items-center justify-center gap-2 rounded-xl bg-red-800/40 border border-yellow-400/40 py-1.5">
            <span className="text-xs text-yellow-100/70">{t.jackpotName}</span>
            <span className="text-xl tracking-widest">🔮🔮🔮⬜⬜</span>
            <span className="text-[10px] text-yellow-100/60">{fmtBet(JACKPOT_FULL_BET)} = 100%</span>
          </div>

          <p className="text-sm text-red-200/90 mt-1">{t.paytableScatter}</p>
          <div className="space-y-1.5">
            {[...SCATTER_PAYS].reverse().map((tier) => (
              <div key={tier.count} className="flex items-center justify-between bg-red-500/15 border border-red-400/30 rounded-xl px-4 py-1.5">
                <span className="text-xl">{"🧧".repeat(tier.count)}<span className="text-[10px] text-red-200 ml-1">{tier.count === 5 ? "5+" : ""}</span></span>
                <span className="font-mono font-black text-yellow-400 text-sm">×{tier.pays} + 🎁 {FREE_SPIN_OPTIONS.map((o) => `${tier.units / o.mult}×${o.mult}`).join(" / ")}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2 my-2">
            {PAYLINES.map((line, l) => (
              <svg key={l} viewBox="0 0 50 30" className="w-full bg-white/5 rounded">
                {REEL_IDX.flatMap((c) => ROW_IDX.map((r) => <rect key={`${c}${r}`} x={c * 10 + 1} y={r * 10 + 1} width={8} height={8} rx={1.5} fill={line[c] === r ? LINE_COLORS[l] : "rgba(255,255,255,0.1)"} />))}
              </svg>
            ))}
          </div>
          <p className="text-sm text-yellow-100/70">{t.paytableFree}</p>
          <p className="text-sm text-yellow-100/70">🔒 {lang === "vi" ? "Giữ Cuộn: sau một lượt thua, đôi khi bạn được giữ tối đa 2 cuộn cho lượt quay tiếp theo (cùng mức cược). Chọn khéo thì lợi hơn: tỷ lệ hoàn trả 96,6% khi giữ đúng cuộn, chỉ 87,7% nếu không bao giờ giữ." : "Hold: after a losing spin you're sometimes offered a hold: keep up to 2 reels for your next spin (same bet). Choosing well pays: 96.6% return with the best holds, only 87.7% if you never hold."}</p>
          <p className="text-sm text-yellow-100/70">🎋 {t.oracleBlessed}.</p>
          <p className="text-sm text-yellow-100/70">🥣 {lang === "vi" ? `Xóc Đĩa nhân đôi: sau mỗi lượt thắng, bạn có thể đặt tiền thắng (hoặc một nửa) vào bốn đồng xu: Chẵn/Lẻ ×${GAMBLE_PAYS.chan}, Tứ Đỏ/Tứ Trắng ×${GAMBLE_PAYS.tu_do}, tối đa 5 lần. Tỷ lệ công bằng tuyệt đối.` : `Xóc Đĩa double-up: after a win you can stake it (or half) on four coins: even/odd ×${GAMBLE_PAYS.chan}, four of a colour ×${GAMBLE_PAYS.tu_do}, up to 5 times. Exactly fair odds.`}</p>
          <p className="text-xs text-yellow-100/50">{t.rtpNote}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
