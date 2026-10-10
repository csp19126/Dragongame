import { useEffect, useRef, useState } from "react";
import { Redirect } from "wouter";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import {
  ROULETTE_WHEEL, TABLE_MAX_SPOT, TABLE_MAX_TOTAL, rouletteBetWins, rouletteColor, rouletteSpot,
  type RouletteBet,
} from "@shared/tablegames";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { ChipRack, ChipBadge } from "@/components/ChipRack";
import { useAuth } from "@/hooks/use-auth";
import { useGameState, useSetBalance } from "@/hooks/use-game";
import { useRoulette, type RouletteResponse } from "@/hooks/use-tables";
import { useLang } from "@/lib/lang-context";
import { achievementToast } from "@/components/slot/achievements";
import { useToast } from "@/hooks/use-toast";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks, stopCelebrations } from "@/lib/celebrate";
import { ApiError } from "@/lib/queryClient";
import { AppFooter } from "@/pages/Home";
import { showInView } from "@/lib/scroll";

type Spot = Omit<RouletteBet, "amount">;
type Bets = Record<string, RouletteBet>;

const SEG = 360 / ROULETTE_WHEEL.length;
const COLORS = { red: "#b91c1c", black: "#111827", green: "#047857" };
const SPIN_MS = 4600;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3.2);

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** The wheel, rotated by JS (requestAnimationFrame) so it spins even where CSS animations are switched off */
function Wheel({ rotation, ball }: { rotation: number; ball: { angle: number; radius: number } | null }) {
  const R = 150;
  return (
    <svg viewBox="-170 -170 340 340" className="w-full h-full drop-shadow-[0_10px_30px_rgba(0,0,0,0.7)]" data-testid="roulette-wheel">
      <defs>
        <radialGradient id="rim" cx="50%" cy="45%" r="60%"><stop offset="0.8" stopColor="#92400e" /><stop offset="1" stopColor="#451a03" /></radialGradient>
        <radialGradient id="hub" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#fde68a" /><stop offset="0.6" stopColor="#d97706" /><stop offset="1" stopColor="#78350f" /></radialGradient>
      </defs>
      <circle r="168" fill="url(#rim)" stroke="#fbbf24" strokeWidth="3" />
      <g transform={`rotate(${rotation})`}>
        {ROULETTE_WHEEL.map((n, i) => {
          const a0 = ((i - 0.5) * SEG - 90) * (Math.PI / 180);
          const a1 = ((i + 0.5) * SEG - 90) * (Math.PI / 180);
          const r0 = 92;
          const d = `M ${r0 * Math.cos(a0)} ${r0 * Math.sin(a0)} L ${R * Math.cos(a0)} ${R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} L ${r0 * Math.cos(a1)} ${r0 * Math.sin(a1)} A ${r0} ${r0} 0 0 0 ${r0 * Math.cos(a0)} ${r0 * Math.sin(a0)} Z`;
          return (
            <g key={n}>
              <path d={d} fill={COLORS[rouletteColor(n)]} stroke="#fbbf24" strokeWidth="0.8" />
              <text transform={`rotate(${i * SEG}) translate(0 -132)`} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="12" fontWeight="800" fontFamily="system-ui, sans-serif">{n}</text>
            </g>
          );
        })}
        <circle r="92" fill="#3f1d0b" stroke="#fbbf24" strokeWidth="2" />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1="0" y1="0" x2={70 * Math.cos((i * Math.PI) / 4)} y2={70 * Math.sin((i * Math.PI) / 4)} stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" />
        ))}
        <circle r="30" fill="url(#hub)" stroke="#fde68a" strokeWidth="2" />
      </g>
      {ball && (
        <circle
          cx={ball.radius * Math.cos((ball.angle - 90) * (Math.PI / 180))}
          cy={ball.radius * Math.sin((ball.angle - 90) * (Math.PI / 180))}
          r="7" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"
        />
      )}
      <path d="M 0 -150 L -9 -168 L 9 -168 Z" fill="#fde047" stroke="#78350f" strokeWidth="1.5" />
    </svg>
  );
}

interface CellCtx { bets: Bets; result: RouletteResponse | null; busy: boolean; place: (s: Spot) => void }

/** One betting spot on the table */
function Cell({ ctx, spot, label, className = "" }: { ctx: CellCtx; spot: Spot; label: React.ReactNode; className?: string }) {
  const b = ctx.bets[rouletteSpot(spot)];
  const hit = ctx.result && rouletteBetWins(spot, ctx.result.number);
  return (
    <button
      type="button"
      onClick={() => ctx.place(spot)}
      disabled={ctx.busy}
      data-testid={`spot-${rouletteSpot(spot).replace(":", "-")}`}
      className={`relative flex items-center justify-center font-black text-white border border-yellow-200/30 transition-all active:brightness-125 ${className} ${
        hit ? "ring-2 ring-yellow-300 ring-inset brightness-125 shadow-[inset_0_0_14px_rgba(250,204,21,0.8)]" : ""
      }`}
    >
      {label}
      {b && <ChipBadge amount={b.amount} className="absolute -top-1 -right-1 z-10 scale-90" />}
    </button>
  );
}

const fmtSpotLabel = (n: number) => String(n);

export default function Roulette() {
  const { user, isLoading } = useAuth();
  const { data: state } = useGameState(!!user);
  const { t, loc, srv } = useLang();
  const { toast } = useToast();
  const setBalance = useSetBalance();
  const play = useRoulette();

  const [chip, setChip] = useState(1000);
  const [bets, setBets] = useState<Bets>({});
  const [history, setHistory] = useState<Bets[]>([]);
  const [rotation, setRotation] = useState(0);
  const [ball, setBall] = useState<{ angle: number; radius: number } | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<RouletteResponse | null>(null);
  const [last, setLast] = useState<number[]>([]);
  const raf = useRef(0);
  const rotRef = useRef(0);
  const wheelRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => { cancelAnimationFrame(raf.current); stopCelebrations(); }, []);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <Redirect to="/auth" />;

  const balance = state?.balance ?? user.balance;
  const total = Object.values(bets).reduce((a, b) => a + b.amount, 0);
  const busy = spinning || play.isPending;

  const place = (spot: Spot) => {
    if (busy) return;
    const key = rouletteSpot(spot);
    const next = (bets[key]?.amount ?? 0) + chip;
    if (next > TABLE_MAX_SPOT || total + chip > TABLE_MAX_TOTAL || total + chip > balance) {
      soundManager.nearMiss();
      return;
    }
    setResult(null);
    setHistory((h) => [...h, bets]);
    setBets({ ...bets, [key]: { ...spot, amount: next } as RouletteBet });
    soundManager.buttonClick();
  };
  const undo = () => { if (!busy && history.length) { setBets(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); setResult(null); } };
  const clear = () => { if (!busy) { setHistory((h) => [...h, bets]); setBets({}); setResult(null); } };

  /** Spin the wheel so `n` ends under the pointer, with the ball rolling the other way and dropping in */
  const animateTo = (n: number, done: () => void) => {
    const duration = reducedMotion() ? 900 : SPIN_MS;
    const idx = ROULETTE_WHEEL.indexOf(n);
    const from = rotRef.current;
    const landing = ((-idx * SEG) % 360 + 360) % 360;
    const base = from - (from % 360);
    const to = base + 360 * 5 + landing + (landing <= from % 360 ? 360 : 0);
    const start = performance.now();
    const step = (now: number) => {
      const x = Math.min(1, (now - start) / duration);
      const e = easeOut(x);
      const rot = from + (to - from) * e;
      rotRef.current = rot;
      setRotation(rot);
      // The ball runs the outer track the other way, then drops onto the number under the pointer
      const ballAngle = -(1 - easeOut(Math.min(1, x * 1.15))) * 360 * 7;
      const radius = x < 0.72 ? 160 : 160 - ((x - 0.72) / 0.28) * 28;
      setBall({ angle: ballAngle, radius: Math.max(132, radius) });
      if (x < 1) raf.current = requestAnimationFrame(step);
      else done();
    };
    raf.current = requestAnimationFrame(step);
  };

  const spin = () => {
    if (busy) return;
    if (total === 0) return toast({ title: t.placeBetFirst });
    if (total > balance) return toast({ title: t.insufficientBalance, description: t.insufficientBalanceDesc, variant: "destructive" });
    stopCelebrations();
    setResult(null);
    setSpinning(true);
    showInView(wheelRef.current);
    soundManager.spinStart();
    play.mutate(Object.values(bets), {
      onSuccess: (r) => {
        animateTo(r.number, () => {
          setSpinning(false);
          setResult(r);
          setLast((l) => [r.number, ...l].slice(0, 14));
          setBalance(r.newBalance, { gamesPlayed: r.gamesPlayed, totalWins: r.totalWins, maxWin: r.maxWin });
          soundManager.reelStop();
          if (r.winAmount > r.totalBet) {
            soundManager.win(r.bets.some((b) => b.type === "straight" && b.returned > 0));
            coinBurst({ x: 0.5, y: 0.3 });
            if (r.winAmount >= r.totalBet * 10) fireworks(3000);
          } else if (r.winAmount === 0) {
            soundManager.lossComfort();
          }
          r.newAchievements.forEach((a) => toast(achievementToast(a, loc)));
        });
      },
      onError: (e) => {
        setSpinning(false);
        const msg = e instanceof ApiError && e.status === 400 ? t.insufficientBalanceDesc : srv((e as Error).message);
        toast({ title: t.error, description: msg, variant: "destructive" });
      },
    });
  };

  const net = result ? result.winAmount - result.totalBet : 0;

  const ctx: CellCtx = { bets, result, busy, place };
  const numBg = (n: number) => (n === 0 ? "bg-emerald-700" : rouletteColor(n) === "red" ? "bg-red-700" : "bg-gray-900");

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#062a1d] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 px-3 py-4 relative z-10">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <div className="text-center">
            <h1 className="font-display text-4xl sm:text-5xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="text-roulette-title">{t.rlTitle}</h1>
            <p className="text-[11px] sm:text-xs font-black tracking-[0.3em] text-yellow-500/80 uppercase mt-1">🎡 {t.rlSubtitle} 🎡</p>
          </div>
          <GameTabs />

          <div className="w-full grid lg:grid-cols-2 gap-5 items-start">
            {/* Wheel and result */}
            <div className="flex flex-col items-center gap-3 w-full max-w-md mx-auto">
              <div className="w-full flex items-center justify-between rounded-2xl bg-[#052e1f]/80 border border-emerald-400/20 px-4 py-2.5">
                <div>
                  <p className="text-[10px] text-yellow-500/60 font-black uppercase tracking-widest">{t.onTable}</p>
                  <p className="font-mono font-black text-lg text-white" data-testid="text-total-bet">{total.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-yellow-500/60 font-black uppercase tracking-widest">{t.balance}</p>
                  <p className="font-mono font-black text-xl sm:text-2xl text-yellow-400" data-testid="text-table-balance">{balance.toLocaleString()} 🪙</p>
                </div>
              </div>
              <div ref={wheelRef} className="relative w-[min(88vw,22rem)] aspect-square">
                <Wheel rotation={rotation} ball={ball} />
                {result && !spinning && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center font-display text-4xl text-white border-4 border-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.8)] ${numBg(result.number)}`} data-testid="text-roulette-number">
                      {result.number}
                    </div>
                  </div>
                )}
              </div>
              <div className="h-7 text-center" aria-live="polite">
                {result && (
                  <p className={`font-black text-lg ${net > 0 ? "text-white" : "text-yellow-100/80"}`} data-testid="text-roulette-result">
                    {result.winAmount > 0 ? `${t.tableWin} ${result.winAmount.toLocaleString()} (${net >= 0 ? "+" : ""}${net.toLocaleString()})` : t.tableLose}
                  </p>
                )}
              </div>
              {last.length > 0 && (
                <div className="w-full">
                  <p className="text-[10px] text-yellow-500/60 font-black uppercase tracking-widest mb-1">{t.lastNumbers}</p>
                  <div className="flex gap-1 overflow-hidden" data-testid="roulette-history">
                    {last.map((n, i) => (
                      <span key={i} className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ${numBg(n)} ${i === 0 ? "ring-2 ring-yellow-300" : "opacity-80"}`}>{n}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Betting table, laid out upright so it fits a phone */}
            <div className="w-full max-w-md mx-auto flex flex-col gap-3">
              <div className="rounded-2xl p-2 bg-gradient-to-b from-emerald-800 to-emerald-950 border-4 border-amber-700 shadow-[0_0_30px_rgba(0,0,0,0.6)]" data-testid="roulette-board">
                <div className="grid grid-cols-[1fr_1fr_1fr_3.2rem] gap-[3px]">
                  <Cell ctx={ctx} spot={{ type: "straight", value: 0 }} label="0" className="col-span-3 h-10 rounded-t-xl bg-emerald-600" />
                  <div />
                  {Array.from({ length: 12 }, (_, row) => (
                    <div key={row} className="contents">
                      {[1, 2, 3].map((c) => {
                        const n = row * 3 + c;
                        return <Cell ctx={ctx} key={n} spot={{ type: "straight", value: n }} label={fmtSpotLabel(n)} className={`h-9 rounded ${numBg(n)}`} />;
                      })}
                      {row % 4 === 0 ? (
                        <Cell ctx={ctx} spot={{ type: "dozen", value: row / 4 + 1 }} label={<span className="[writing-mode:vertical-rl] rotate-180 text-xs tracking-wider">{`${row * 3 + 1}-${row * 3 + 12}`}</span>} className="row-span-4 rounded bg-emerald-700/80" />
                      ) : null}
                    </div>
                  ))}
                  {[1, 2, 3].map((c) => (
                    <Cell ctx={ctx} key={c} spot={{ type: "column", value: c }} label="2:1" className="h-9 rounded-b-lg bg-emerald-700/80 text-xs" />
                  ))}
                  <div />
                </div>
                <div className="grid grid-cols-3 gap-[3px] mt-[3px]">
                  <Cell ctx={ctx} spot={{ type: "low" }} label="1-18" className="h-10 rounded bg-emerald-700/80 text-sm" />
                  <Cell ctx={ctx} spot={{ type: "even" }} label={t.even} className="h-10 rounded bg-emerald-700/80 text-sm" />
                  <Cell ctx={ctx} spot={{ type: "red" }} label={<span className="w-6 h-6 rotate-45 bg-red-600 border border-white/60" aria-label={t.red} />} className="h-10 rounded bg-emerald-700/80" />
                  <Cell ctx={ctx} spot={{ type: "black" }} label={<span className="w-6 h-6 rotate-45 bg-gray-950 border border-white/60" aria-label={t.black} />} className="h-10 rounded bg-emerald-700/80" />
                  <Cell ctx={ctx} spot={{ type: "odd" }} label={t.odd} className="h-10 rounded bg-emerald-700/80 text-sm" />
                  <Cell ctx={ctx} spot={{ type: "high" }} label="19-36" className="h-10 rounded bg-emerald-700/80 text-sm" />
                </div>
              </div>

              <p className="text-xs text-yellow-100/50 text-center">{t.pickChip}</p>
              <ChipRack value={chip} onChange={(v) => { setChip(v); soundManager.betChange(); }} balance={balance} disabled={busy} />

              <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
                <button type="button" onClick={undo} disabled={busy || !history.length} className="rounded-xl bg-white/5 border border-white/15 text-yellow-100/80 font-black text-xs py-3 flex flex-col items-center gap-1 disabled:opacity-30" data-testid="button-undo">
                  <RotateCcw className="w-4 h-4" />{t.undo}
                </button>
                <button type="button" onClick={clear} disabled={busy || total === 0} className="rounded-xl bg-white/5 border border-white/15 text-yellow-100/80 font-black text-xs py-3 flex flex-col items-center gap-1 disabled:opacity-30" data-testid="button-clear">
                  <Trash2 className="w-4 h-4" />{t.clearBets}
                </button>
                <button
                  type="button"
                  onClick={spin}
                  disabled={busy}
                  data-testid="button-spin-roulette"
                  className="rounded-xl font-display font-black text-3xl text-white bg-gradient-to-b from-yellow-400 via-orange-500 to-red-600 border-b-4 border-red-900 shadow-[0_0_24px_rgba(249,115,22,0.6)] active:translate-y-0.5 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-7 h-7 animate-spin mx-auto" /> : t.spinWheel}
                </button>
              </div>

              <details className="rounded-2xl bg-purple-950/60 border border-yellow-500/20 p-4 text-sm text-yellow-100/70">
                <summary className="font-black text-yellow-400 cursor-pointer">{t.rules}</summary>
                <p className="mt-2 leading-relaxed">{t.rlRules}</p>
                <p className="mt-2 text-xs text-yellow-100/40">{t.playMoneyNote}</p>
              </details>
            </div>
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
