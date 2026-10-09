import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { useAuth } from "@/hooks/use-auth";
import { useSetBalance } from "@/hooks/use-game";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import { AppFooter } from "@/pages/Home";
import {
  LOTO_PRICES, LOTO_MAX_TICKETS, LOTO_BUY_AT_ONCE, LOTO_CALLS, LOTO_TIERS,
  makeLotoGrid, lotoMultiplier, lotoCallLine, vnNumber, lotoRtp,
  type LotoGrid, type LotoView, type LotoTicketView,
} from "@shared/loto";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}K`);
const VOICE_KEY = "loto-voice";
const RTP = (lotoRtp() * 100).toFixed(1);

function readVoice() {
  try { return localStorage.getItem(VOICE_KEY) !== "off"; } catch { return true; }
}

/** Says the number out loud in Vietnamese, if the phone has a voice for it */
function speak(n: number) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(`${vnNumber(n)}`);
    u.lang = "vi-VN";
    const vi = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("vi"));
    if (vi) u.voice = vi;
    u.rate = 1;
    synth.speak(u);
  } catch { /* no voice: the number is on screen anyway */ }
}

/** One ticket. Called numbers are marked; a row one short glows "CHỜ", a full row is "KINH" */
function Ticket({ grid, called, latest, price, kinhAt, compact = false, onReroll }: {
  grid: LotoGrid; called: Set<number>; latest?: number; price?: number; kinhAt?: number | null; compact?: boolean; onReroll?: () => void;
}) {
  const { lang } = useLang();
  const vi = lang === "vi";
  const rows = grid.map((row) => {
    const nums = row.filter((v): v is number => v !== null);
    const hit = nums.filter((v) => called.has(v)).length;
    return { hit, full: hit === 5, waiting: hit === 4 };
  });
  const won = kinhAt != null;
  return (
    <div className={`relative rounded-2xl p-2 ${won ? "bg-gradient-to-b from-yellow-200 to-amber-300 shadow-[0_0_30px_rgba(250,204,21,0.6)]" : "bg-[#fdf6e3]"} border-4 ${won ? "border-yellow-400" : "border-red-700"}`} data-testid="loto-ticket">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="font-display text-red-700 text-lg leading-none">Lô Tô</span>
        {price ? <span className="text-[11px] font-black text-red-800">{fmt(price)} xu</span> : null}
        {onReroll && (
          <button type="button" onClick={onReroll} className="flex items-center gap-1 rounded-full bg-red-700 text-white text-[11px] font-black px-2 py-0.5" data-testid="loto-reroll">
            <RefreshCw className="w-3 h-3" />{vi ? "Đổi vé" : "New ticket"}
          </button>
        )}
      </div>
      <div className="grid gap-[2px]">
        {grid.map((row, r) => (
          <div key={r} className={`relative grid grid-cols-9 gap-[2px] rounded-md ${rows[r].full ? "ring-2 ring-yellow-500 bg-yellow-300/60" : rows[r].waiting ? "ring-2 ring-red-500 animate-pulse" : ""}`}>
            {row.map((v, c) => {
              const hit = v !== null && called.has(v);
              return (
                <div key={c} className={`flex items-center justify-center rounded-[4px] font-black ${compact ? "h-6 text-[11px]" : "h-8 text-sm"} ${
                  v === null ? "bg-red-800/10" : hit ? `bg-red-600 text-white ${v === latest ? "scale-110 shadow-[0_0_10px_rgba(220,38,38,0.8)]" : ""}` : "bg-white text-slate-900 border border-red-200"} transition-transform`}>
                  {v ?? ""}
                </div>
              );
            })}
            {rows[r].waiting && <span className="absolute -right-1 -top-2 rounded-full bg-red-600 text-white text-[9px] font-black px-1.5">{vi ? "CHỜ" : "1 TO GO"}</span>}
          </div>
        ))}
      </div>
      {won && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div initial={{ scale: 3, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: -10 }} transition={{ type: "spring", stiffness: 300, damping: 16 }}
            className="rounded-2xl border-[5px] border-red-600 bg-yellow-300/95 px-4 py-1 text-center shadow-xl">
            <div className="font-display text-4xl text-red-600 leading-none">KINH!</div>
            {price ? <div className="font-black text-red-800 text-sm">×{lotoMultiplier(kinhAt)} = {fmt(Math.round(price * lotoMultiplier(kinhAt)))} xu</div> : null}
          </motion.div>
        </div>
      )}
    </div>
  );
}

/** The 1-90 board: what's been called */
function Board({ called, latest }: { called: Set<number>; latest?: number }) {
  return (
    <div className="grid grid-cols-10 gap-[3px]" data-testid="loto-board">
      {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => (
        <div key={n} className={`aspect-square rounded-full flex items-center justify-center text-[10px] font-black ${
          n === latest ? "bg-yellow-300 text-red-700 ring-2 ring-yellow-100" : called.has(n) ? "bg-red-600 text-white" : "bg-white/[0.06] text-white/35"}`}>{n}</div>
      ))}
    </div>
  );
}

export default function Loto() {
  const { user, isLoading } = useAuth();
  const { lang } = useLang();
  const vi = lang === "vi";
  const { toast } = useToast();
  const setBalance = useSetBalance();
  const q = useQuery<LotoView>({ queryKey: ["/api/loto"], refetchInterval: 1000, enabled: !!user });
  const [price, setPrice] = useState(LOTO_PRICES[1]);
  const [count, setCount] = useState(1);
  const [drafts, setDrafts] = useState<LotoGrid[]>(() => [makeLotoGrid(), makeLotoGrid(), makeLotoGrid()]);
  const [voice, setVoice] = useState(readVoice);
  const [clock, setClock] = useState(Date.now());
  const offset = useRef(0);
  const lastCalls = useRef(0);
  const celebrated = useRef(new Set<number>());

  useEffect(() => { const t = window.setInterval(() => setClock(Date.now()), 250); return () => clearInterval(t); }, []);
  const v = q.data;
  useEffect(() => { if (v) offset.current = v.serverNow - Date.now(); }, [v]);
  const now = clock + offset.current;

  const called = useMemo(() => new Set(v?.calls ?? []), [v?.calls]);
  const latest = v?.calls[v.calls.length - 1];
  const phase = !v ? "loading" : now < v.drawStart ? "buying" : now < v.callsEnd ? "calling" : "ending";

  // A new number: pop, and say it
  useEffect(() => {
    if (!v) return;
    if (v.calls.length > lastCalls.current && latest) {
      if (lastCalls.current > 0 || v.calls.length === 1) {
        soundManager.coinDrop();
        if (voice) speak(latest);
      }
    }
    lastCalls.current = v.calls.length;
  }, [v?.calls.length, latest, voice, v]);

  // KINH: celebrate once per ticket, and pick up the new balance when it changes
  const shownBalance = useRef<number | null>(null);
  useEffect(() => {
    if (!v) return;
    if (shownBalance.current !== v.balance) { shownBalance.current = v.balance; setBalance(v.balance); }
    for (const t of v.mine) {
      if (t.kinhAt != null && !celebrated.current.has(t.id)) {
        celebrated.current.add(t.id);
        const mult = lotoMultiplier(t.kinhAt);
        soundManager.win(mult >= 8);
        coinBurst();
        if (mult >= 8) fireworks(2500, 1);
        navigator.vibrate?.([60, 40, 60, 40, 200]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setBalance is a new function every render
  }, [v]);

  const buy = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/loto/buy", { price, grids: drafts.slice(0, count) })).json(),
    onSuccess: (r) => {
      setBalance(r.balance);
      soundManager.coinShower();
      setDrafts([makeLotoGrid(), makeLotoGrid(), makeLotoGrid()]);
      queryClient.invalidateQueries({ queryKey: ["/api/loto"] });
      toast({ title: vi ? `🎟️ Đã mua ${r.tickets.length} vé. Chúc may mắn!` : `🎟️ ${r.tickets.length} ticket${r.tickets.length > 1 ? "s" : ""} bought. Good luck!` });
    },
    onError: (e) => toast({ title: e instanceof ApiError ? e.message : String(e), variant: "destructive" }),
  });

  if (isLoading) return null;
  if (!user) return <Redirect to="/auth" />;

  const secs = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
  const mine = v?.mine ?? [];
  const canBuyMore = LOTO_MAX_TICKETS - mine.length;
  const won = mine.filter((t) => t.kinhAt != null);
  const roundWin = won.reduce((a, t) => a + Math.round(t.price * lotoMultiplier(t.kinhAt)), 0);
  const last = v?.lastRound;
  const lastWin = last ? last.tickets.reduce((a, t) => a + (t.payout ?? 0), 0) : 0;
  const lastSpent = last ? last.tickets.reduce((a, t) => a + t.price, 0) : 0;

  return (
    <div className="min-h-screen bg-[#0b0716] app-aurora flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-3 pb-6 flex flex-col gap-3" data-testid="loto-page">
        <GameTabs />

        {/* The caller */}
        <section className="relative overflow-hidden rounded-[28px] p-4 bg-gradient-to-br from-red-700 via-red-900 to-[#2a0712] border border-yellow-300/40 shadow-[0_14px_40px_rgba(220,38,38,0.35)]">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-display text-3xl text-yellow-300 leading-none">Lô Tô</div>
              <div className="text-[11px] text-white/70">{vi ? `Ván #${v?.round ?? "…"} · ${v?.players ?? 0} người chơi · ${v?.tickets ?? 0} vé` : `Round #${v?.round ?? "…"} · ${v?.players ?? 0} players · ${v?.tickets ?? 0} tickets`}</div>
            </div>
            <button type="button" onClick={() => { const nv = !voice; setVoice(nv); try { localStorage.setItem(VOICE_KEY, nv ? "on" : "off"); } catch {} }}
              className="p-2 rounded-full bg-black/30 text-yellow-200" aria-label={voice ? "Mute the caller" : "Hear the caller"} data-testid="loto-voice">
              {voice ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          </div>

          {phase === "loading" && <Loader2 className="w-8 h-8 animate-spin text-yellow-300 mx-auto my-8" />}
          {phase === "buying" && v && (
            <div className="text-center py-3">
              <div className="text-xs font-black uppercase tracking-widest text-yellow-100/80">{vi ? "Mua vé · bắt đầu gọi số sau" : "Buy tickets · calling starts in"}</div>
              <div className="font-mono font-black text-6xl text-white" data-testid="loto-countdown">{secs(v.drawStart - now)}s</div>
            </div>
          )}
          {(phase === "calling" || phase === "ending") && v && (
            <div className="flex items-center gap-4 py-2">
              <AnimatePresence mode="popLayout">
                <motion.div key={latest ?? "none"} initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 15 }}
                  className="w-24 h-24 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#fde68a_40%,#f59e0b)] border-4 border-yellow-200 shadow-[0_0_30px_rgba(250,204,21,0.6)] flex items-center justify-center" data-testid="loto-ball">
                  <span className="font-black text-5xl text-red-700">{latest ?? "–"}</span>
                </motion.div>
              </AnimatePresence>
              <div className="min-w-0">
                <div className="text-sm italic text-yellow-100/90">{latest ? lotoCallLine(latest, v.round) : ""}</div>
                <div className="text-xl font-black text-white capitalize">{latest ? vnNumber(latest) : ""}</div>
                <div className="text-xs text-white/70 mt-1">
                  {phase === "calling" ? (vi ? `Số thứ ${v.calls.length}/${LOTO_CALLS}` : `Call ${v.calls.length} of ${LOTO_CALLS}`) : (vi ? `Hết ván · ván mới sau ${secs(v.end - now)}s` : `Round over · next in ${secs(v.end - now)}s`)}
                </div>
                <div className="mt-1 h-1.5 w-40 rounded-full bg-black/30 overflow-hidden"><div className="h-full bg-yellow-300" style={{ width: `${(v.calls.length / LOTO_CALLS) * 100}%` }} /></div>
              </div>
            </div>
          )}
          {won.length > 0 && (
            <div className="mt-1 rounded-xl bg-yellow-300 text-red-800 font-black text-center py-1.5" data-testid="loto-round-win">
              {vi ? `🎉 Bạn đã KINH! +${fmt(roundWin)} xu` : `🎉 KINH! You won ${fmt(roundWin)} coins`}
            </div>
          )}
        </section>

        {/* Buying */}
        {phase === "buying" && v && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10 flex flex-col gap-3" data-testid="loto-buy">
            {canBuyMore > 0 ? (
              <>
                <div>
                  <div className="text-[11px] font-black uppercase text-white/50 mb-1">{vi ? "Giá mỗi vé" : "Price per ticket"}</div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {LOTO_PRICES.map((p) => (
                      <button key={p} type="button" onClick={() => setPrice(p)} className={`py-2 rounded-xl text-sm font-black ${price === p ? "bg-yellow-400 text-black" : "bg-white/5 text-white/70"}`} data-testid={`loto-price-${p}`}>{short(p)}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[11px] font-black uppercase text-white/50">{vi ? "Số vé" : "Tickets"}</div>
                  {Array.from({ length: Math.min(LOTO_BUY_AT_ONCE, canBuyMore) }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" onClick={() => setCount(n)} className={`w-9 h-9 rounded-xl font-black ${count === n ? "bg-yellow-400 text-black" : "bg-white/5 text-white/70"}`}>{n}</button>
                  ))}
                </div>
                {drafts.slice(0, Math.min(count, canBuyMore)).map((g, i) => (
                  <Ticket key={i} grid={g} called={new Set()} compact onReroll={() => setDrafts((d) => d.map((x, k) => (k === i ? makeLotoGrid() : x)))} />
                ))}
                <button type="button" disabled={buy.isPending || v.balance < price * Math.min(count, canBuyMore)} onClick={() => buy.mutate()}
                  className="w-full py-3 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-lg disabled:opacity-50" data-testid="loto-buy-button">
                  {buy.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : vi ? `Mua ${Math.min(count, canBuyMore)} vé · ${fmt(price * Math.min(count, canBuyMore))} xu` : `Buy ${Math.min(count, canBuyMore)} · ${fmt(price * Math.min(count, canBuyMore))} coins`}
                </button>
              </>
            ) : (
              <p className="text-sm text-white/70 text-center">{vi ? `Bạn đã có ${LOTO_MAX_TICKETS} vé, tối đa cho một ván.` : `You have ${LOTO_MAX_TICKETS} tickets, the most for one round.`}</p>
            )}
          </section>
        )}

        {/* My tickets this round */}
        {mine.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="text-xs font-black uppercase text-white/60 px-1">{vi ? `Vé của bạn (${mine.length})` : `Your tickets (${mine.length})`}</div>
            {mine.map((t: LotoTicketView) => (
              <Ticket key={t.id} grid={t.grid} called={called} latest={latest} price={t.price} kinhAt={t.kinhAt} compact={mine.length > 2} />
            ))}
          </section>
        )}
        {phase !== "buying" && mine.length === 0 && v && (
          <p className="text-sm text-white/60 text-center px-4">{vi ? "Ván này đang gọi số. Xem và mua vé cho ván sau!" : "This round is being called. Watch, and buy tickets for the next one!"}</p>
        )}

        {/* Last round, if you played it */}
        {last && last.tickets.length > 0 && phase === "buying" && (
          <section className={`rounded-2xl p-3 border ${lastWin > 0 ? "bg-yellow-400/10 border-yellow-400/40" : "bg-white/[0.04] border-white/10"}`} data-testid="loto-last">
            <div className="text-sm font-black text-white">{vi ? `Ván trước (#${last.round})` : `Last round (#${last.round})`}</div>
            <div className="text-xs text-white/70">
              {lastWin > 0 ? (vi ? `Thắng ${fmt(lastWin)} xu từ ${fmt(lastSpent)} xu vé 🎉` : `Won ${fmt(lastWin)} coins on ${fmt(lastSpent)} of tickets 🎉`)
                : (vi ? `Chưa kín hàng nào trong ${LOTO_CALLS} số. Ván này nhé!` : `No full row in ${LOTO_CALLS} calls. This round's yours!`)}
            </div>
          </section>
        )}

        {/* Called numbers */}
        {v && phase !== "buying" && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10">
            <div className="text-[11px] font-black uppercase text-white/50 mb-2">{vi ? "Bảng số đã gọi" : "Numbers called"}</div>
            <Board called={called} latest={latest} />
          </section>
        )}

        {/* Prizes */}
        <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10">
          <div className="text-sm font-black text-yellow-300">{vi ? "Giải thưởng: kín một hàng càng sớm càng lớn" : "Prizes: the sooner a row fills, the bigger"}</div>
          <div className="grid grid-cols-4 gap-1.5 mt-2 text-center">
            {LOTO_TIERS.map((t, i) => (
              <div key={t.upTo} className="rounded-xl bg-black/30 py-1.5">
                <div className="text-[10px] text-white/55">{vi ? `≤ ${t.upTo} số` : `by call ${t.upTo}`}</div>
                <div className={`font-black ${i === 0 ? "text-yellow-300 text-lg" : "text-white"}`}>×{t.mult}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/50 mt-2">
            {vi ? `Mỗi ván gọi ${LOTO_CALLS} số. Vé thật 9 hàng, mỗi hàng 5 số. Số được tự đánh dấu. Mỗi vé tính riêng nên chơi một mình cũng như đông người. Hoàn trả ${RTP}%, tính chính xác.`
              : `Each round calls ${LOTO_CALLS} numbers. A real 9-row ticket, 5 numbers a row, marked for you. Every ticket is paid on its own, so playing alone is as good as a crowd. Returns ${RTP}%, worked out exactly.`}
          </p>
        </section>

        {v && v.winners.length > 0 && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10">
            <div className="text-[11px] font-black uppercase text-white/50 mb-1">{vi ? "Người thắng gần đây" : "Recent winners"}</div>
            {v.winners.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1 border-t border-white/5 first:border-0">
                <span className="flex-1 truncate font-bold text-white">{w.username}</span>
                <span className="text-white/50">{vi ? `${w.kinhAt} số` : `${w.kinhAt} calls`}</span>
                <span className="font-black text-yellow-300">+{fmt(w.payout)}</span>
              </div>
            ))}
          </section>
        )}
      </main>
      <AppFooter />
    </div>
  );
}

