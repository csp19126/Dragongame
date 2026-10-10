import { useEffect, useRef, useState } from "react";
import { Link, Redirect } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { Achievement } from "@shared/schema";
import { achievementToast } from "@/components/slot/achievements";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { ChipRack, ChipBadge } from "@/components/ChipRack";
import { useAuth } from "@/hooks/use-auth";
import { useGameState, useSetBalance } from "@/hooks/use-game";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks, stopCelebrations } from "@/lib/celebrate";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { showInView } from "@/lib/scroll";
import { AppFooter } from "@/pages/Home";

type Outcome = "blackjack" | "win" | "push" | "lose" | "bust";
interface HandView { cards: string[]; bet: number; doubled: boolean; done: boolean; outcome?: Outcome; payout?: number; total: number; soft: boolean }
interface TableView {
  hands: HandView[];
  dealer: { cards: (string | null)[]; total: number };
  active: number;
  finished: boolean;
  totalBet: number;
  payout: number;
  actions: ("hit" | "stand" | "double" | "split")[];
}
interface PlayResponse { hand: TableView; newBalance: number; gamesPlayed?: number; totalWins?: number; maxWin?: number; newAchievements?: Achievement[] }

const KEY = ["/api/games/blackjack"];
const MAX_BET = 1_000_000;
const STEP_MS = 420;

const TXT = {
  vi: {
    title: "Xì Dách", subtitle: "Blackjack trả 3 ăn 2", felt: "XÌ DÁCH TRẢ 3 ĂN 2 · NHÀ CÁI DỪNG Ở 17",
    deal: "CHIA BÀI", hit: "Rút", stand: "Dừng", double: "Gấp đôi", split: "Tách", rebet: "Cược lại", newHand: "Ván mới",
    dealer: "Nhà cái", you: "Bạn", hand: "Tay",
    outcome: { blackjack: "XÌ DÁCH!", win: "THẮNG", push: "HOÀ", lose: "THUA", bust: "QUẮC" },
    rules: "Đạt tổng điểm gần 21 nhất mà không vượt quá. J, Q, K tính 10; A tính 1 hoặc 11. Xì Dách (A + 10 ngay từ đầu) trả 3 ăn 2, thắng thường trả 1 ăn 1. Nhà cái rút đến 16 và dừng ở mọi 17. Gấp đôi với hai lá đầu (kể cả sau khi tách), tách một lần, tách A chỉ được một lá mỗi tay. 6 bộ bài, xào lại mỗi ván. Tỷ lệ hoàn trả khoảng 99,6% nếu chơi theo chiến thuật cơ bản (đo trên 4 triệu ván).",
  },
  en: {
    title: "Blackjack", subtitle: "Blackjack pays 3 to 2", felt: "BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON ALL 17s",
    deal: "DEAL", hit: "Hit", stand: "Stand", double: "Double", split: "Split", rebet: "Rebet", newHand: "New hand",
    dealer: "Dealer", you: "You", hand: "Hand",
    outcome: { blackjack: "BLACKJACK!", win: "WIN", push: "PUSH", lose: "LOSE", bust: "BUST" },
    rules: "Get closer to 21 than the dealer without going over. J, Q, K count 10; aces count 1 or 11. A blackjack (ace + ten-card on the deal) pays 3 to 2, other wins pay 1 to 1. The dealer draws to 16 and stands on all 17s. Double on your first two cards (also after a split); split once; split aces get one card each. Six decks, shuffled fresh every hand. Return to player is about 99.6% with basic strategy (measured over 4 million hands).",
  },
  zh: {
    title: "21點", subtitle: "21點（Xì Dách）賠 3 比 2", felt: "黑傑克賠 3 比 2 · 莊家 17 點一律停牌",
    deal: "發牌", hit: "要牌", stand: "停牌", double: "加倍", split: "分牌", rebet: "再押", newHand: "新一局",
    dealer: "莊家", you: "你", hand: "手牌",
    outcome: { blackjack: "黑傑克！", win: "贏", push: "平手", lose: "輸", bust: "爆牌" },
    rules: "點數比莊家更接近 21 且不超過即可獲勝。J、Q、K 算 10 點；A 算 1 或 11 點。黑傑克（開局 A 加 10 點牌）賠 3 比 2，一般獲勝賠 1 比 1。莊家 16 點以下要牌，17 點一律停牌。前兩張牌可加倍（分牌後也可以）；只能分牌一次；分開的 A 每手只發一張牌。使用 6 副牌，每局重新洗牌。按基本策略遊玩，返還率約 99.6%（以 400 萬局測得）。",
  },
};

const SUIT: Record<string, { sym: string; red: boolean }> = { S: { sym: "♠", red: false }, H: { sym: "♥", red: true }, D: { sym: "♦", red: true }, C: { sym: "♣", red: false } };

/** A playing card. Position changes use a CSS transition, so if transitions are off the card simply appears. */
function PlayingCard({ card, index, show }: { card: string | null; index: number; show: boolean }) {
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!show) { setLanded(false); return; }
    const id = requestAnimationFrame(() => setLanded(true));
    return () => cancelAnimationFrame(id);
  }, [show]);
  if (!show) return null;
  const base = "absolute top-0 w-[3.9rem] h-[5.5rem] sm:w-[4.6rem] sm:h-[6.5rem] rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-[transform,opacity] duration-300 ease-out";
  const style = { left: `${index * 1.55}rem`, transform: landed ? "translate(0,0) rotate(0deg)" : "translate(140px,-120px) rotate(25deg)", opacity: landed ? 1 : 0 };
  if (!card) {
    return (
      <div className={`${base} border-2 border-yellow-200/80 bg-[repeating-linear-gradient(45deg,#7f1d1d_0_6px,#991b1b_6px_12px)]`} style={style} data-testid="card-back">
        <div className="absolute inset-1.5 rounded-lg border border-yellow-300/60 flex items-center justify-center text-yellow-300 text-xl">🐉</div>
      </div>
    );
  }
  const r = card.slice(0, -1), s = SUIT[card.slice(-1)];
  const color = s.red ? "text-red-600" : "text-gray-900";
  return (
    <div className={`${base} bg-gradient-to-br from-white to-gray-100 border border-gray-300 ${color}`} style={style} data-testid="card-face">
      <div className="absolute top-1 left-1.5 leading-none text-center font-black">
        <div className="text-base sm:text-lg">{r}</div>
        <div className="text-sm sm:text-base -mt-0.5">{s.sym}</div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-3xl sm:text-4xl">{s.sym}</div>
      <div className="absolute bottom-1 right-1.5 leading-none text-center font-black rotate-180">
        <div className="text-base sm:text-lg">{r}</div>
        <div className="text-sm sm:text-base -mt-0.5">{s.sym}</div>
      </div>
    </div>
  );
}

function CardRow({ cards, visible }: { cards: (string | null)[]; visible: number }) {
  const width = `calc(${Math.max(1, cards.length - 1) * 1.55}rem + 4.6rem)`;
  return (
    <div className="relative h-[5.5rem] sm:h-[6.5rem]" style={{ width }}>
      {cards.map((c, i) => <PlayingCard key={i} card={c} index={i} show={i < visible} />)}
    </div>
  );
}

const outcomeStyle: Record<Outcome, string> = {
  blackjack: "bg-gradient-to-r from-yellow-300 to-orange-500 text-black",
  win: "bg-green-500 text-white",
  push: "bg-sky-500 text-white",
  lose: "bg-gray-700 text-white/80",
  bust: "bg-red-700 text-white",
};

/** How many cards of each row to show, revealed one by one */
interface Shown { dealer: number; hands: number[]; hole: boolean }

export default function Blackjack() {
  const { user, isLoading } = useAuth();
  const { data: state } = useGameState(!!user);
  const { t, tr, srv, loc } = useLang();
  const L = tr(TXT.vi, TXT.en, TXT.zh);
  const { toast } = useToast();
  const setBalance = useSetBalance();
  const qc = useQueryClient();

  const [bet, setBet] = useState(0);
  const [lastBet, setLastBet] = useState(0);
  const [chip, setChip] = useState(10000);
  const [view, setView] = useState<TableView | null>(null);
  const [shown, setShown] = useState<Shown>({ dealer: 0, hands: [], hole: false });
  const [revealing, setRevealing] = useState(false);
  const [settled, setSettled] = useState(false);
  const timers = useRef<number[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);

  const current = useQuery<{ hand: TableView | null }>({ queryKey: KEY, enabled: !!user, staleTime: Infinity });
  // Resume a hand left open (refresh, app switch)
  useEffect(() => {
    const h = current.data?.hand;
    if (h && !view) {
      setView(h);
      setShown({ dealer: h.dealer.cards.length, hands: h.hands.map((x) => x.cards.length), hole: h.finished });
      setBet(h.hands[0].bet);
    }
  }, [current.data, view]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); stopCelebrations(); }, []);

  const finish = (r: PlayResponse) => {
    setSettled(true);
    setBalance(r.newBalance, r.gamesPlayed !== undefined ? { gamesPlayed: r.gamesPlayed, totalWins: r.totalWins, maxWin: r.maxWin } : {});
    const h = r.hand;
    if (h.payout > h.totalBet) {
      soundManager.win(h.hands.some((x) => x.outcome === "blackjack"));
      coinBurst({ x: 0.5, y: 0.4 });
      if (h.hands.some((x) => x.outcome === "blackjack")) fireworks(2500);
    } else if (h.payout === 0) {
      soundManager.lossComfort();
    }
    r.newAchievements?.forEach((a) => toast(achievementToast(a, loc)));
  };

  /** Reveal the cards that are new in `next`, one at a time, then settle */
  const reveal = (next: TableView, prevShown: Shown, r: PlayResponse) => {
    const steps: ((s: Shown) => Shown)[] = [];
    const fresh = prevShown.hands.length === 0;
    if (fresh) {
      // Deal order: player, dealer, player, dealer
      steps.push((s) => ({ ...s, hands: [1] }), (s) => ({ ...s, dealer: 1 }), (s) => ({ ...s, hands: [2] }), (s) => ({ ...s, dealer: 2 }));
    } else if (next.hands.length > prevShown.hands.length) {
      // A split: each hand keeps one card of the pair, then each gets its new second card
      steps.push((s) => ({ ...s, hands: [1, 1] }), (s) => ({ ...s, hands: [2, 1] }), (s) => ({ ...s, hands: [2, 2] }));
      next.hands.forEach((h, hi) => {
        for (let k = 3; k <= h.cards.length; k++) steps.push((s) => { const hs = [...s.hands]; hs[hi] = k; return { ...s, hands: hs }; });
      });
    } else {
      next.hands.forEach((h, hi) => {
        for (let k = (prevShown.hands[hi] ?? 0) + 1; k <= h.cards.length; k++) steps.push((s) => { const hs = [...s.hands]; hs[hi] = k; return { ...s, hands: hs }; });
      });
    }
    if (next.finished) {
      steps.push((s) => ({ ...s, hole: true }));
      for (let k = Math.max(prevShown.dealer, 2) + 1; k <= next.dealer.cards.length; k++) steps.push((s) => ({ ...s, dealer: k }));
    }
    setRevealing(true);
    steps.forEach((fn, i) => timers.current.push(window.setTimeout(() => { setShown(fn); soundManager.reelStop(); }, i * STEP_MS)));
    timers.current.push(window.setTimeout(() => {
      setRevealing(false);
      setShown({ dealer: next.dealer.cards.length, hands: next.hands.map((h) => h.cards.length), hole: next.finished });
      if (next.finished) finish(r);
      else setBalance(r.newBalance);
    }, steps.length * STEP_MS + 150));
  };

  const onError = (e: Error) => {
    const msg = e instanceof ApiError && e.status === 400 && /balance/i.test(e.message) ? t.insufficientBalanceDesc : srv(e.message);
    toast({ title: t.error, description: msg, variant: "destructive" });
    qc.invalidateQueries({ queryKey: KEY });
  };

  const dealM = useMutation({
    mutationFn: async (b: number) => (await apiRequest("POST", "/api/games/blackjack/deal", { bet: b })).json() as Promise<PlayResponse>,
    onSuccess: (r) => {
      const empty: Shown = { dealer: 0, hands: [], hole: false };
      setShown(empty);
      setSettled(false);
      setView(r.hand);
      reveal(r.hand, empty, r);
    },
    onError,
  });
  const actM = useMutation({
    mutationFn: async (action: string) => (await apiRequest("POST", "/api/games/blackjack/action", { action })).json() as Promise<PlayResponse>,
    onSuccess: (r) => {
      const prev = shown;
      setView(r.hand);
      reveal(r.hand, prev, r);
    },
    onError,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <Redirect to="/auth" />;

  const balance = state?.balance ?? user.balance;
  const inHand = !!view && !view.finished;
  const busy = revealing || dealM.isPending || actM.isPending;
  const betting = !inHand && !busy;

  const addChip = (c: number) => {
    if (!betting) return;
    if (view?.finished) { setView(null); setShown({ dealer: 0, hands: [], hole: false }); setSettled(false); }
    const next = (view?.finished ? 0 : bet) + c;
    if (next > MAX_BET || next > balance) { soundManager.nearMiss(); return; }
    setBet(next);
    soundManager.buttonClick();
  };
  const startDeal = (b: number) => {
    if (b <= 0) return toast({ title: t.placeBetFirst });
    if (b > balance) return toast({ title: t.insufficientBalance, description: t.insufficientBalanceDesc, variant: "destructive" });
    stopCelebrations();
    setLastBet(b);
    setBet(b);
    showInView(tableRef.current);
    soundManager.spinStart();
    dealM.mutate(b);
  };
  const doAction = (a: string) => { if (!busy) { soundManager.buttonClick(); actM.mutate(a); } };

  const active = view?.hands[view.active];
  const canAfford = (extra: number) => extra <= balance;
  const dealerCards = view ? view.dealer.cards.map((c, i) => (i === 1 && !shown.hole ? null : c)) : [];
  const dealerTotal = view && !revealing && shown.dealer >= 1 ? view.dealer.total : null;
  const net = view && settled ? view.payout - view.totalBet : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#062a1d] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center gap-3 px-3 py-3 relative z-10">
        <div className="text-center">
          <h1 className="font-display text-3xl sm:text-5xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="text-blackjack-title">{L.title}</h1>
          <p className="text-[11px] sm:text-xs font-black tracking-[0.3em] text-yellow-500/80 uppercase mt-1">🃏 {L.subtitle} 🃏</p>
        </div>
        <GameTabs />
        <Link href="/ban-bai" className="w-full max-w-md flex items-center gap-2 rounded-2xl px-3 py-2 bg-indigo-600/30 border border-indigo-300/40 text-white text-sm font-black" data-testid="link-card-tables">
          <span className="text-xl">🀄</span><span className="flex-1">{tr("Chơi với người thật: Xì Dách làm cái & Bàn Chung", "Play real people: Xì Dách banker & shared tables", "與真人對戰：21點坐莊與共享牌桌")}</span><span>→</span>
        </Link>

        <div className="w-full max-w-md flex items-center justify-between rounded-2xl bg-[#052e1f]/80 border border-emerald-400/20 px-4 py-2.5">
          <div>
            <p className="text-[10px] text-yellow-500/60 font-black uppercase tracking-widest">{t.onTable}</p>
            <p className="font-mono font-black text-lg text-white" data-testid="text-bj-bet">{(view && !view.finished ? view.totalBet : view?.finished ? view.totalBet : bet).toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-yellow-500/60 font-black uppercase tracking-widest">{t.balance}</p>
            <p className="font-mono font-black text-xl sm:text-2xl text-yellow-400" data-testid="text-table-balance">{balance.toLocaleString()} 🪙</p>
          </div>
        </div>

        {/* The table */}
        <div ref={tableRef} className="relative w-full max-w-md rounded-[2.5rem] p-2.5 bg-gradient-to-b from-amber-700 via-amber-800 to-amber-950 shadow-[0_0_40px_rgba(0,0,0,0.6)] scroll-mt-24">
          <div className="relative rounded-[2rem] bg-[radial-gradient(ellipse_at_50%_30%,#15803d,#064e3b_70%)] border-2 border-yellow-500/40 px-4 pt-4 pb-5 min-h-[22rem] flex flex-col justify-between overflow-hidden" data-testid="bj-table">
            {/* Dealer */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-100/80">
                {L.dealer}
                {dealerTotal !== null && <span className="px-2 py-0.5 rounded-full bg-black/40 text-white font-mono" data-testid="text-dealer-total">{dealerTotal}</span>}
              </div>
              {view ? <CardRow cards={dealerCards} visible={shown.dealer} /> : <div className="h-[5.5rem] sm:h-[6.5rem]" />}
            </div>

            <p className="text-center text-[9px] sm:text-[10px] font-black tracking-[0.18em] text-yellow-300/60 my-2">{L.felt}</p>

            {/* Player hands */}
            <div className={`flex justify-center gap-6 ${view && view.hands.length > 1 ? "items-start" : ""}`}>
              {view ? view.hands.map((h, hi) => {
                const isActive = inHand && hi === view.active && !revealing;
                const showResult = settled && h.outcome;
                return (
                  <div key={hi} className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 pt-1 pb-2 transition-colors ${isActive && view.hands.length > 1 ? "bg-yellow-300/10 ring-2 ring-yellow-300/60" : ""}`} data-testid={`bj-hand-${hi}`}>
                    <CardRow cards={h.cards} visible={shown.hands[hi] ?? 0} />
                    <div className="flex items-center gap-1.5">
                      {(shown.hands[hi] ?? 0) >= h.cards.length && !revealing && (
                        <span className="px-2 py-0.5 rounded-full bg-black/50 text-white text-xs font-mono font-black" data-testid={`text-hand-total-${hi}`}>{h.soft && h.total < 21 && !h.done ? `${h.total - 10}/${h.total}` : h.total}</span>
                      )}
                      <ChipBadge amount={h.bet} />
                    </div>
                    {showResult && (
                      <span className={`px-3 py-1 rounded-full text-xs font-black shadow ${outcomeStyle[h.outcome!]}`} data-testid={`bj-outcome-${hi}`}>
                        {L.outcome[h.outcome!]}{h.payout ? ` +${h.payout.toLocaleString()}` : ""}
                      </span>
                    )}
                  </div>
                );
              }) : (
                <div className="flex flex-col items-center gap-2 text-emerald-100/60 py-6">
                  {bet > 0 ? <ChipBadge amount={bet} className="scale-150" /> : <span className="text-sm font-bold">{t.pickChip}</span>}
                </div>
              )}
            </div>

            {settled && view && (
              <p className="text-center font-black text-lg mt-2 text-white" data-testid="text-bj-result">
                {view.payout > 0 ? `${t.tableWin} ${view.payout.toLocaleString()} (${net >= 0 ? "+" : ""}${net.toLocaleString()})` : t.tableLose}
              </p>
            )}
          </div>
        </div>

        {/* Controls */}
        {inHand && !busy && active ? (
          <div className="w-full max-w-md grid grid-cols-2 gap-2" data-testid="bj-actions">
            {(["hit", "stand", "double", "split"] as const).map((a) => {
              const allowed = view!.actions.includes(a);
              const extra = a === "double" || a === "split" ? active.bet : 0;
              return (
                <button
                  key={a}
                  type="button"
                  disabled={!allowed || !canAfford(extra)}
                  onClick={() => doAction(a)}
                  data-testid={`button-bj-${a}`}
                  className={`rounded-xl py-3.5 font-black text-lg disabled:opacity-25 active:translate-y-0.5 border-b-4 ${
                    a === "hit" ? "bg-gradient-to-b from-emerald-400 to-emerald-600 border-emerald-800 text-white"
                    : a === "stand" ? "bg-gradient-to-b from-red-500 to-red-700 border-red-900 text-white"
                    : a === "double" ? "bg-gradient-to-b from-yellow-300 to-amber-500 border-amber-700 text-black"
                    : "bg-gradient-to-b from-sky-400 to-blue-600 border-blue-800 text-white"
                  }`}
                >
                  {L[a]}{extra ? <span className="block text-[10px] font-bold opacity-80">+{extra.toLocaleString()}</span> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <ChipRack value={chip} onChange={(v) => { setChip(v); addChip(v); }} balance={balance} disabled={!betting} />
            <div className="w-full max-w-md grid grid-cols-[1fr_1fr_2fr] gap-2">
              <button type="button" onClick={() => startDeal(lastBet)} disabled={!betting || !lastBet || lastBet > balance} className="rounded-xl bg-white/5 border border-white/15 text-yellow-100/80 font-black text-xs py-3 flex flex-col items-center gap-1 disabled:opacity-30" data-testid="button-bj-rebet">
                <RotateCcw className="w-4 h-4" />{L.rebet}
              </button>
              <button type="button" onClick={() => { setBet(0); if (view?.finished) { setView(null); setSettled(false); setShown({ dealer: 0, hands: [], hole: false }); } }} disabled={!betting || (bet === 0 && !view)} className="rounded-xl bg-white/5 border border-white/15 text-yellow-100/80 font-black text-xs py-3 flex flex-col items-center gap-1 disabled:opacity-30" data-testid="button-bj-clear">
                <Trash2 className="w-4 h-4" />{t.clearBets}
              </button>
              <button
                type="button"
                onClick={() => startDeal(view?.finished ? lastBet : bet)}
                disabled={!betting}
                data-testid="button-bj-deal"
                className="rounded-xl font-display font-black text-2xl text-white bg-gradient-to-b from-yellow-400 via-orange-500 to-red-600 border-b-4 border-red-900 shadow-[0_0_24px_rgba(249,115,22,0.6)] active:translate-y-0.5 disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-7 h-7 animate-spin mx-auto" /> : view?.finished ? L.newHand : L.deal}
              </button>
            </div>
          </>
        )}

        <details className="w-full max-w-md rounded-2xl bg-purple-950/60 border border-yellow-500/20 p-4 text-sm text-yellow-100/70">
          <summary className="font-black text-yellow-400 cursor-pointer">{t.rules}</summary>
          <p className="mt-2 leading-relaxed">{L.rules}</p>
          <p className="mt-2 text-xs text-yellow-100/40">{t.playMoneyNote}</p>
        </details>
      </main>
      <AppFooter />
    </div>
  );
}
