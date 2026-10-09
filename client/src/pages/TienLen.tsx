import { useEffect, useRef, useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Lightbulb, Flag } from "lucide-react";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { useAuth } from "@/hooks/use-auth";
import { useSetBalance } from "@/hooks/use-game";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import { AppFooter } from "@/pages/Home";
import {
  TIENLEN_STAKES, TIENLEN_PAYS, TIENLEN_EVEN_RTP, BOT_NAMES, RANKS, SUITS, rankOf, suitOf, classify, beats, hint,
  type Card, type ComboType, type TienLenView, type TienLenEvent, type TienLenState,
} from "@shared/tienlen";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}K`);
const STEP_MS = 650;
const BOT_FACES = ["👵", "👨‍🦳", "🧑"];
const COMBO_VI: Record<ComboType, string> = { single: "Rác", pair: "Đôi", triple: "Sám cô", quad: "Tứ quý", straight: "Sảnh", pairs: "Đôi thông" };
const COMBO_EN: Record<ComboType, string> = { single: "Single", pair: "Pair", triple: "Triple", quad: "Four of a kind", straight: "Straight", pairs: "Consecutive pairs" };
const PLACE_VI = ["Về nhất", "Về nhì", "Về ba", "Về bét"];
const PLACE_EN = ["1st", "2nd", "3rd", "4th"];

function CardFace({ c, small = false, selected = false, onClick, dim = false }: { c: Card; small?: boolean; selected?: boolean; onClick?: () => void; dim?: boolean }) {
  const red = suitOf(c) >= 2;
  return (
    <motion.button type="button" onClick={onClick} disabled={!onClick} layout
      animate={{ y: selected ? -14 : 0 }}
      className={`relative shrink-0 rounded-lg bg-white border ${selected ? "border-yellow-400 ring-2 ring-yellow-300" : "border-slate-300"} shadow-md flex flex-col items-start justify-start ${small ? "w-9 h-12 p-0.5" : "w-11 h-16 p-1"} ${red ? "text-red-600" : "text-slate-900"} ${dim ? "opacity-60" : ""}`}
      data-testid={`card-${c}`}>
      <span className={`font-black leading-none ${small ? "text-xs" : "text-sm"}`}>{RANKS[rankOf(c)]}</span>
      <span className={`leading-none ${small ? "text-xs" : "text-base"}`}>{SUITS[suitOf(c)]}</span>
      {!small && <span className="absolute bottom-0.5 right-1 text-xl leading-none opacity-80">{SUITS[suitOf(c)]}</span>}
    </motion.button>
  );
}

function Opponent({ seat, count, passed, place, turn, vi }: { seat: number; count: number; passed: boolean; place: number | null; turn: boolean; vi: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 ${turn ? "bg-yellow-400/20 ring-2 ring-yellow-300" : "bg-black/25"}`} data-testid={`seat-${seat}`}>
      <div className="text-2xl leading-none">{BOT_FACES[seat - 1]}</div>
      <div className="text-[11px] font-black text-white whitespace-nowrap">{BOT_NAMES[seat - 1]}</div>
      {place ? (
        <div className="text-[10px] font-black text-yellow-300">{vi ? PLACE_VI[place - 1] : PLACE_EN[place - 1]}</div>
      ) : (
        <div className="flex items-center gap-1">
          <div className="w-4 h-5 rounded-sm bg-gradient-to-br from-red-600 to-red-900 border border-yellow-300/60" />
          <span className="text-xs font-black text-white">{count}</span>
        </div>
      )}
      {passed && !place && <div className="text-[9px] font-black text-white/60 uppercase">{vi ? "Bỏ lượt" : "Passed"}</div>}
    </div>
  );
}

/** What's on screen, which lags the server while the computer players' moves play through */
interface Shown { table: { cards: Card[]; by: number } | null; counts: number[]; passed: boolean[]; turn: number }

export default function TienLen() {
  const { user, isLoading } = useAuth();
  const { lang } = useLang();
  const vi = lang === "vi";
  const { toast } = useToast();
  const setBalance = useSetBalance();
  const q = useQuery<{ game: TienLenView | null }>({ queryKey: ["/api/tienlen"], enabled: !!user });
  const [game, setGame] = useState<TienLenView | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<Card[]>([]);
  const [stake, setStake] = useState(TIENLEN_STAKES[1]);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (q.data?.game && !game) { setGame(q.data.game); setShown(fromView(q.data.game)); }
  }, [q.data, game]);

  const fromView = (g: TienLenView): Shown => ({ table: g.table ? { cards: g.table.cards, by: g.table.by } : null, counts: g.counts, passed: g.passed, turn: g.turn });

  /** Plays the computer players' moves one at a time, then shows the final position */
  const playThrough = (g: TienLenView, start: Shown) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying(true);
    let cur = { ...start, counts: [...start.counts], passed: [...start.passed] };
    g.events.forEach((e: TienLenEvent, i) => {
      timers.current.push(window.setTimeout(() => {
        if ("play" in e) {
          cur = { ...cur, table: { cards: e.play, by: e.seat }, counts: cur.counts.map((n, k) => (k === e.seat ? n - e.play.length : n)), turn: e.seat };
          const c = classify(e.play);
          if (c && (c.type === "quad" || (c.type === "pairs" && c.len >= 6))) soundManager.bigWinFanfare();
          else soundManager.reelStop();
        } else if ("pass" in e) {
          cur = { ...cur, passed: cur.passed.map((p, k) => (k === e.seat ? true : p)), turn: e.seat };
          soundManager.buttonClick();
        } else {
          cur = { ...cur, table: null, passed: [false, false, false, false], turn: e.seat };
        }
        setShown(cur);
      }, i * STEP_MS));
    });
    timers.current.push(window.setTimeout(() => {
      setShown(fromView(g));
      setPlaying(false);
      setBalance(g.balance);
      if (g.over && g.place) {
        if (g.place === 1) { soundManager.win(true); coinBurst(); fireworks(2000, 1); }
        else if (g.place === 2) soundManager.win(false);
        else soundManager.gambleLose();
      }
    }, g.events.length * STEP_MS + 100));
  };

  const onResult = (r: { game: TienLenView }, before: Shown | null) => {
    const g = r.game;
    setGame(g);
    setSel([]);
    // Your own play shows straight away; the computer players' moves then play through
    playThrough(g, before ?? { table: null, counts: [13, 13, 13, 13], passed: [false, false, false, false], turn: -1 });
  };

  const start = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/tienlen/start", { stake })).json(),
    onSuccess: (r) => { soundManager.coinShower(); onResult(r, null); },
    onError: (e) => toast({ title: e instanceof ApiError ? e.message : String(e), variant: "destructive" }),
  });
  const move = useMutation({
    mutationFn: async (body: { cards: Card[] } | { pass: true }) => (await apiRequest("POST", "/api/tienlen/move", body)).json(),
    onSuccess: (r) => onResult(r, shown),
    onError: (e) => toast({ title: e instanceof ApiError ? e.message : String(e), variant: "destructive" }),
  });
  const resign = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/tienlen/resign")).json(),
    onSuccess: (r) => { setGame(r.game); setShown(fromView(r.game)); setBalance(r.game.balance); },
  });

  if (isLoading) return null;
  if (!user) return <Redirect to="/auth" />;

  const myTurn = !!game && !game.over && !playing && game.turn === 0;
  const selCombo = classify(sel);
  const tableCombo = shown?.table ? classify(shown.table.cards) : null;
  const selOk = !!selCombo && (!tableCombo || beats(selCombo, tableCombo)) && (!game?.opening || sel.includes(0));
  const hand = game ? (playing ? game.hand : game.hand) : [];
  const toggle = (c: Card) => { if (!myTurn) return; soundManager.buttonClick(); setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c])); };
  const doHint = () => {
    if (!game || !shown) return;
    const st: TienLenState = {
      hands: [game.hand, [], [], []], turn: 0, passed: shown.passed, finished: game.finished, opening: game.opening,
      table: shown.table && tableCombo ? { cards: shown.table.cards, by: shown.table.by, combo: tableCombo } : null,
    };
    const h = hint(st, 0);
    if (h) setSel(h);
    else toast({ title: vi ? "Không có bài chặn được, bỏ lượt nhé" : "Nothing beats that: pass" });
  };
  const placeOfSeat = (seat: number) => (game?.finished.includes(seat) ? game.finished.indexOf(seat) + 1 : null);

  return (
    <div className="min-h-screen bg-[#0b0716] app-aurora flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-3 pb-6 flex flex-col gap-3" data-testid="tienlen-page">
        <GameTabs />

        {!game || (game.over && !playing) ? (
          <section className="rounded-[28px] p-4 bg-gradient-to-br from-emerald-700 via-emerald-900 to-[#06251a] border border-yellow-300/40 flex flex-col gap-3">
            <div>
              <div className="font-display text-3xl text-yellow-300 leading-none">Tiến Lên Miền Nam</div>
              <div className="text-xs text-white/75 mt-1">{vi ? "Đấu với Bà Tư, Chú Sáu và Anh Ba. Hết bài trước là thắng!" : "Take on Bà Tư, Chú Sáu and Anh Ba. Empty your hand first to win!"}</div>
            </div>
            {game?.over && game.place && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className={`rounded-2xl p-3 text-center ${game.place === 1 ? "bg-yellow-300 text-red-800" : game.place === 2 ? "bg-emerald-300 text-emerald-950" : "bg-black/40 text-white"}`} data-testid="tienlen-result">
                <div className="font-display text-4xl leading-none">{vi ? PLACE_VI[game.place - 1] : `${PLACE_EN[game.place - 1]} place`}!</div>
                <div className="font-black">{(game.payout ?? 0) > 0 ? `+${fmt(game.payout ?? 0)} xu` : vi ? `Mất ${fmt(game.stake)} xu` : `Lost ${fmt(game.stake)} coins`}</div>
              </motion.div>
            )}
            <div>
              <div className="text-[11px] font-black uppercase text-white/60 mb-1">{vi ? "Tiền cược" : "Stake"}</div>
              <div className="grid grid-cols-6 gap-1">
                {TIENLEN_STAKES.map((s) => (
                  <button key={s} type="button" onClick={() => setStake(s)} className={`py-2 rounded-xl text-xs font-black ${stake === s ? "bg-yellow-400 text-black" : "bg-black/30 text-white/70"}`}>{short(s)}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center">
              {TIENLEN_PAYS.map((m, i) => (
                <div key={i} className="rounded-xl bg-black/30 py-1">
                  <div className="text-[10px] text-white/60">{vi ? PLACE_VI[i] : PLACE_EN[i]}</div>
                  <div className="font-black text-white text-sm">{m ? `${fmt(Math.round(stake * m))}` : "0"}</div>
                </div>
              ))}
            </div>
            <button type="button" disabled={start.isPending} onClick={() => start.mutate()} className="w-full py-3 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-lg disabled:opacity-50" data-testid="tienlen-deal">
              {start.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : vi ? `Chia bài · ${fmt(stake)} xu` : `Deal · ${fmt(stake)} coins`}
            </button>
            <details className="text-xs text-white/75">
              <summary className="font-black text-yellow-200 cursor-pointer">{vi ? "Luật chơi" : "How to play"}</summary>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>{vi ? "Bài nhỏ đến lớn: 3 4 5 … K A 2. Chất: ♠ < ♣ < ♦ < ♥." : "Low to high: 3 4 5 … K A 2. Suits: ♠ < ♣ < ♦ < ♥."}</li>
                <li>{vi ? "Ai có 3♠ đánh trước và phải đánh lá đó." : "Whoever has 3♠ starts, and must play it."}</li>
                <li>{vi ? "Đánh rác, đôi, sám cô, tứ quý, sảnh (3 lá liền trở lên, không có 2) hoặc đôi thông." : "Play a single, pair, triple, four of a kind, a straight (3+ in a row, no 2s) or consecutive pairs."}</li>
                <li>{vi ? "Chặn bằng bộ cùng loại, cùng số lá, lá cao nhất lớn hơn." : "Beat the table with the same kind and size, with a higher top card."}</li>
                <li>{vi ? "Chặt heo: 3 đôi thông hoặc tứ quý chặt được một con 2; 4 đôi thông chặt được đôi 2." : "Chop a 2: three consecutive pairs or four of a kind beat a single 2; four consecutive pairs beat a pair of 2s."}</li>
                <li>{vi ? "Bỏ lượt thì chờ vòng mới. Hết bài trước là thắng." : "Pass and you sit out until a new trick. First to empty their hand wins."}</li>
                <li>{vi ? `Giữa những người chơi ngang tài, mỗi người nhận lại trung bình ${Math.round(TIENLEN_EVEN_RTP * 100)}%. Chơi giỏi hơn máy thì được nhiều hơn.` : `Between equal players everyone averages ${Math.round(TIENLEN_EVEN_RTP * 100)}% back. Play better than the computer and you'll get more.`}</li>
              </ul>
            </details>
          </section>
        ) : null}

        {game && shown && !(game.over && !playing) && (
          <section className="relative rounded-[28px] p-3 bg-[radial-gradient(ellipse_at_center,#166534,#052e16)] border-4 border-amber-800 shadow-[inset_0_0_40px_rgba(0,0,0,0.5)] flex flex-col gap-2" data-testid="tienlen-table">
            <div className="flex justify-center">
              <Opponent seat={2} count={shown.counts[2]} passed={shown.passed[2]} place={placeOfSeat(2)} turn={shown.turn === 2 && playing} vi={vi} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Opponent seat={3} count={shown.counts[3]} passed={shown.passed[3]} place={placeOfSeat(3)} turn={shown.turn === 3 && playing} vi={vi} />
              <div className="flex-1 min-h-[6rem] flex flex-col items-center justify-center" data-testid="tienlen-pile">
                <AnimatePresence mode="popLayout">
                  {shown.table ? (
                    <motion.div key={shown.table.cards.join("-")} initial={{ scale: 0.6, opacity: 0, y: -20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-1">
                      <div className="flex -space-x-4">{shown.table.cards.map((c) => <CardFace key={c} c={c} small />)}</div>
                      <div className="text-[10px] font-black text-yellow-200">
                        {shown.table.by === 0 ? (vi ? "Bạn" : "You") : BOT_NAMES[shown.table.by - 1]} · {tableCombo ? (vi ? COMBO_VI[tableCombo.type] : COMBO_EN[tableCombo.type]) : ""}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-white/50 font-bold text-center">
                      {shown.turn === 0 && !playing ? (vi ? "Lượt bạn đánh trước" : "Your lead") : (vi ? "Vòng mới" : "New trick")}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Opponent seat={1} count={shown.counts[1]} passed={shown.passed[1]} place={placeOfSeat(1)} turn={shown.turn === 1 && playing} vi={vi} />
            </div>
            <div className="text-center text-xs font-black h-4 text-yellow-200">
              {playing ? (vi ? "Đối thủ đang đánh…" : "Opponents playing…") : myTurn ? (vi ? (game.opening ? "Lượt bạn: đánh có lá 3♠" : "Lượt bạn") : (game.opening ? "Your turn: include 3♠" : "Your turn")) : ""}
            </div>
          </section>
        )}

        {game && shown && !(game.over && !playing) && (
          <section className="flex flex-col gap-2">
            <div className="flex justify-center px-1 overflow-x-auto pt-4 pb-1">
              <div className="flex -space-x-5">
                {hand.map((c) => <CardFace key={c} c={c} selected={sel.includes(c)} onClick={myTurn ? () => toggle(c) : undefined} dim={!myTurn} />)}
              </div>
            </div>
            <div className="text-center text-xs h-4 font-bold text-white/70">
              {sel.length > 0 && (selCombo ? (selOk ? `✅ ${vi ? COMBO_VI[selCombo.type] : COMBO_EN[selCombo.type]}${selCombo.type === "straight" || selCombo.type === "pairs" ? ` ${sel.length}` : ""}` : `❌ ${vi ? "Chặn không được" : "Doesn't beat the table"}`) : `❌ ${vi ? "Không phải bộ hợp lệ" : "Not a valid play"}`)}
            </div>
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2">
              <button type="button" onClick={doHint} disabled={!myTurn} className="px-3 rounded-2xl bg-white/10 text-yellow-200 disabled:opacity-40" aria-label={vi ? "Gợi ý" : "Hint"} data-testid="tienlen-hint"><Lightbulb className="w-5 h-5" /></button>
              <button type="button" disabled={!myTurn || !shown.table || move.isPending} onClick={() => move.mutate({ pass: true })}
                className="py-3 rounded-2xl bg-white/10 text-white font-black disabled:opacity-40" data-testid="tienlen-pass">{vi ? "Bỏ lượt" : "Pass"}</button>
              <button type="button" disabled={!myTurn || !selOk || move.isPending} onClick={() => move.mutate({ cards: sel })}
                className="py-3 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black disabled:opacity-40" data-testid="tienlen-play">
                {move.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : vi ? "Đánh" : "Play"}
              </button>
              <button type="button" onClick={() => { if (confirm(vi ? "Bỏ cuộc? Bạn sẽ về bét." : "Give up? You'll finish last.")) resign.mutate(); }} className="px-3 rounded-2xl bg-white/5 text-white/50" aria-label={vi ? "Bỏ cuộc" : "Give up"}><Flag className="w-4 h-4" /></button>
            </div>
            <div className="text-center text-[11px] text-white/45">{vi ? `Cược ${fmt(game.stake)} xu · về nhất ${fmt(Math.round(game.stake * TIENLEN_PAYS[0]))}` : `Stake ${fmt(game.stake)} · 1st pays ${fmt(Math.round(game.stake * TIENLEN_PAYS[0]))}`}</div>
          </section>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
