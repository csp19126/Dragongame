import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Loader2, LogOut, Users } from "lucide-react";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { useAuth } from "@/hooks/use-auth";
import { useSetBalance } from "@/hooks/use-game";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst } from "@/lib/celebrate";
import { AppFooter } from "@/pages/Home";
import {
  TABLE_SEATS, PLAYER_STAND_MIN, BANKER_STAND_MIN, XI_BAN_PAYS, XI_DACH_PAYS, NGU_LINH_PAYS,
  type TableMode, type TableView, type TableSummary, type Card,
} from "@shared/cardtable";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}K`);
const EMOTES = ["👏", "😂", "😱", "🔥", "🙏", "😎"];
const SUIT: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/** Live connection to a card table, reconnecting by itself if the line drops */
function useTableSocket(code: string | null, onMessage: (m: any) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  useEffect(() => {
    if (!code) return;
    let closedByUs = false, retry: number | undefined, attempt = 0;
    const open = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/cards?code=${encodeURIComponent(code)}`);
      wsRef.current = ws;
      ws.onopen = () => { attempt = 0; setConnected(true); };
      ws.onmessage = (e) => { try { handler.current(JSON.parse(e.data)); } catch { /* ignore */ } };
      ws.onclose = () => { setConnected(false); if (!closedByUs) retry = window.setTimeout(open, Math.min(8000, 500 * 2 ** attempt++)); };
    };
    open();
    return () => { closedByUs = true; clearTimeout(retry); wsRef.current?.close(); wsRef.current = null; };
  }, [code]);
  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);
  return { connected, send };
}

function PlayingCard({ c, small = false, i = 0 }: { c: Card | null; small?: boolean; i?: number }) {
  const size = small ? "w-8 h-11 text-[11px]" : "w-12 h-[4.25rem] text-sm";
  if (!c) return <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} className={`${size} rounded-md bg-gradient-to-br from-red-600 to-red-900 border-2 border-yellow-300/70 shadow`} />;
  const rank = c.slice(0, -1), suit = c.slice(-1);
  const red = suit === "H" || suit === "D";
  return (
    <motion.div initial={{ y: -20, opacity: 0, rotateY: 90 }} animate={{ y: 0, opacity: 1, rotateY: 0 }} transition={{ delay: i * 0.08 }}
      className={`${size} rounded-md bg-white border border-slate-300 shadow flex flex-col items-start p-0.5 font-black leading-none ${red ? "text-red-600" : "text-slate-900"}`}>
      <span>{rank}</span><span>{SUIT[suit]}</span>
    </motion.div>
  );
}

function Lobby({ onOpen }: { onOpen: (code: string) => void }) {
  const { lang } = useLang();
  const vi = lang === "vi";
  const { toast } = useToast();
  const [mode, setMode] = useState<TableMode>("banker");
  const [stake, setStake] = useState(5000);
  const list = useQuery<{ tables: TableSummary[]; mine: string | null; stakes: number[] }>({ queryKey: ["/api/cards/tables"], refetchInterval: 4000 });
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/cards/tables", { mode, stake })).json(),
    onSuccess: (r) => onOpen(r.code),
    onError: (e) => {
      if (e instanceof ApiError && e.body?.code) onOpen(e.body.code);
      else toast({ title: e instanceof ApiError ? e.message : String(e), variant: "destructive" });
    },
  });
  const modes: { id: TableMode; title: string; desc: string; icon: string }[] = [
    { id: "banker", icon: "🀄", title: vi ? "Xì Dách · Nhà cái" : "Xì Dách · Banker", desc: vi ? "Đấu với nhau: mỗi ván một người làm cái, xoay vòng. Không thu phí." : "Play each other: one player is the banker each round, taking turns. No house cut." },
    { id: "house", icon: "🃏", title: vi ? "Bàn Chung" : "Shared table", desc: vi ? "Cùng bàn, cùng xem bài nhau, mỗi người đấu với nhà cái máy." : "Sit together and see each other's cards; everyone plays the dealer." },
  ];
  return (
    <div className="flex flex-col gap-3">
      {list.data?.mine && (
        <button type="button" onClick={() => onOpen(list.data!.mine!)} className="rounded-2xl bg-yellow-400 text-black font-black py-3">{vi ? "Quay lại bàn của bạn" : "Back to your table"} · {list.data.mine}</button>
      )}
      <section className="rounded-[28px] p-4 bg-gradient-to-br from-indigo-700 via-indigo-900 to-[#0b0716] border border-yellow-300/30 flex flex-col gap-3">
        <div className="font-display text-3xl text-yellow-300 leading-none">{vi ? "Bàn Bài Online" : "Live card tables"}</div>
        <div className="grid gap-2">
          {modes.map((m) => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)} className={`text-left rounded-2xl p-3 border-2 ${mode === m.id ? "border-yellow-300 bg-yellow-300/10" : "border-white/10 bg-black/20"}`} data-testid={`mode-${m.id}`}>
              <div className="font-black text-white">{m.icon} {m.title}</div>
              <div className="text-xs text-white/70">{m.desc}</div>
            </button>
          ))}
        </div>
        <div>
          <div className="text-[11px] font-black uppercase text-white/55 mb-1">{vi ? "Tiền cược mỗi ván" : "Stake per round"}</div>
          <div className="grid grid-cols-5 gap-1">
            {(list.data?.stakes ?? [1000, 5000, 10000, 50000, 100000]).map((s) => (
              <button key={s} type="button" onClick={() => setStake(s)} className={`py-2 rounded-xl text-xs font-black ${stake === s ? "bg-yellow-400 text-black" : "bg-black/30 text-white/70"}`}>{short(s)}</button>
            ))}
          </div>
          <p className="text-[11px] text-white/55 mt-1">
            {mode === "banker"
              ? (vi ? `Cần tối thiểu ${fmt(stake * XI_BAN_PAYS)} xu để vào ván (Xì Bàn ăn ×${XI_BAN_PAYS}); nhà cái cần đủ trả cho cả bàn.` : `You need ${fmt(stake * XI_BAN_PAYS)} to play a round (Xì Bàn pays ×${XI_BAN_PAYS}); the banker needs enough to cover the table.`)
              : (vi ? `Cần ${fmt(stake * 2)} xu để vào ván (để có thể gấp đôi).` : `You need ${fmt(stake * 2)} to play a round (so you can double).`)}
          </p>
        </div>
        <button type="button" disabled={create.isPending} onClick={() => create.mutate()} className="w-full py-3 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-lg disabled:opacity-50" data-testid="create-table">
          {create.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : vi ? "Mở bàn mới" : "Open a table"}
        </button>
      </section>
      <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10">
        <div className="text-[11px] font-black uppercase text-white/55 mb-1">{vi ? "Bàn đang mở" : "Open tables"}</div>
        {!list.data?.tables.length ? <p className="text-sm text-white/55 py-2">{vi ? "Chưa có bàn nào. Mở một bàn và mời bạn bè!" : "No tables yet. Open one and invite your friends!"}</p> : (
          list.data.tables.map((t) => (
            <button key={t.code} type="button" onClick={() => onOpen(t.code)} className="w-full flex items-center gap-2 py-2 border-t border-white/5 first:border-0 text-left" data-testid={`table-${t.code}`}>
              <span className="text-xl">{t.mode === "banker" ? "🀄" : "🃏"}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-white text-sm truncate">{t.mode === "banker" ? "Xì Dách" : vi ? "Bàn Chung" : "Shared table"} · {t.host}</span>
                <span className="block text-[11px] text-white/50">{fmt(t.stake)} {vi ? "xu/ván" : "a round"} · #{t.code}</span>
              </span>
              <span className="flex items-center gap-1 text-xs text-white/70"><Users className="w-3.5 h-3.5" />{t.players}/{TABLE_SEATS}</span>
            </button>
          ))
        )}
      </section>
    </div>
  );
}

function TableScreen({ code, onExit }: { code: string; onExit: () => void }) {
  const { lang } = useLang();
  const vi = lang === "vi";
  const { toast } = useToast();
  const setBalance = useSetBalance();
  const [s, setS] = useState<TableView | null>(null);
  const [emotes, setEmotes] = useState<{ id: number; from: number; e: string }[]>([]);
  const [clock, setClock] = useState(Date.now());
  const offset = useRef(0);
  const lastRound = useRef<string>("");
  useEffect(() => { const t = window.setInterval(() => setClock(Date.now()), 250); return () => clearInterval(t); }, []);

  const { connected, send } = useTableSocket(code, (m) => {
    if (m.t === "state") {
      offset.current = m.s.serverNow - Date.now();
      setS(m.s);
    } else if (m.t === "error") toast({ title: m.message, variant: "destructive" });
    else if (m.t === "emote") {
      const id = Math.random();
      setEmotes((x) => [...x, { id, from: m.from, e: m.e }]);
      window.setTimeout(() => setEmotes((x) => x.filter((y) => y.id !== id)), 2200);
    }
  });

  // Results: sound, coins, and the new balance
  useEffect(() => {
    if (!s || s.phase !== "settled" || s.you === null) return;
    const key = `${s.round}`;
    if (lastRound.current === key) return;
    lastRound.current = key;
    const me = s.seats[s.you];
    if (!me || me.net === null) return;
    if (me.net > 0) { soundManager.win(me.net >= s.stake * 2); coinBurst(); }
    else if (me.net < 0) soundManager.gambleLose();
    queryClient.invalidateQueries({ queryKey: ["/api/game/state"] });
    queryClient.invalidateQueries({ queryKey: ["/api/me"] });
  }, [s, setBalance]);

  const now = clock + offset.current;
  const me = s && s.you !== null ? s.seats[s.you] : null;
  const myTurn = !!s && s.you !== null && s.turn === s.you && (s.phase === "playing" || s.phase === "dealer");
  const left = s?.deadline ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : null;
  const min = s?.mode === "banker" ? (me?.banker ? BANKER_STAND_MIN : PLAYER_STAND_MIN) : 0;
  const canStand = !!me && (s?.mode === "house" || (me.total ?? 0) >= min);
  const order = useMemo(() => {
    // Seats shown with you at the bottom
    if (!s) return [] as number[];
    const start = s.you ?? 0;
    return Array.from({ length: TABLE_SEATS }, (_, k) => (start + k) % TABLE_SEATS);
  }, [s]);

  if (!s) return <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-yellow-400" /></div>;
  const others = order.slice(1);
  const inviteUrl = `${location.origin}/ban-bai?table=${s.code}`;

  const seatBox = (i: number) => {
    const p = s.seats[i];
    const emote = emotes.filter((e) => e.from === i).slice(-1)[0];
    if (!p) return (
      <div key={i} className="rounded-2xl border border-dashed border-white/15 p-2 min-h-[5.5rem] flex items-center justify-center text-[11px] text-white/35">{vi ? "Ghế trống" : "Empty seat"}</div>
    );
    const turn = s.turn === i && (s.phase === "playing" || s.phase === "dealer");
    return (
      <div key={i} className={`relative rounded-2xl p-2 min-h-[5.5rem] ${turn ? "bg-yellow-400/20 ring-2 ring-yellow-300" : "bg-black/30"} ${!p.online ? "opacity-60" : ""}`} data-testid={`seat-${i}`}>
        <div className="flex items-center gap-1 text-[11px] font-black text-white truncate">
          {p.banker && <Crown className="w-3.5 h-3.5 text-yellow-300 shrink-0" />}<span className="truncate">{p.username}</span>
        </div>
        <div className="flex -space-x-4 mt-1">
          {p.playing ? (p.cards ?? Array(p.count).fill(null)).map((c: Card | null, k: number) => <PlayingCard key={k} c={c} small i={k} />) : <span className="text-[10px] text-white/45">{vi ? "Chờ ván sau" : "Next round"}</span>}
        </div>
        <div className="text-[10px] mt-0.5 h-3.5 font-bold">
          {p.label ? <span className={p.net! > 0 ? "text-emerald-300" : p.net! < 0 ? "text-rose-300" : "text-white/70"}>{p.label} {p.net ? `${p.net > 0 ? "+" : "−"}${short(Math.abs(p.net))}` : ""}</span>
            : p.total !== null && p.playing ? <span className="text-white/70">{p.total}{p.doubled ? " ×2" : ""}</span> : null}
        </div>
        <AnimatePresence>{emote && <motion.span key={emote.id} initial={{ scale: 0, y: 0 }} animate={{ scale: 1.6, y: -16 }} exit={{ opacity: 0 }} className="absolute -top-2 right-1 text-xl">{emote.e}</motion.span>}</AnimatePresence>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3" data-testid="card-table">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-black text-white">{s.mode === "banker" ? "🀄 Xì Dách · Nhà cái" : vi ? "🃏 Bàn Chung" : "🃏 Shared table"} <span className="text-white/45 text-xs">#{s.code}</span></div>
          <div className="text-[11px] text-white/55">{fmt(s.stake)} {vi ? "xu mỗi ván" : "a round"} · {connected ? (vi ? "đã kết nối" : "connected") : (vi ? "đang kết nối…" : "connecting…")}</div>
        </div>
        <button type="button" onClick={() => { send({ t: "leave" }); onExit(); }} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-black" data-testid="leave-table"><LogOut className="w-4 h-4" />{vi ? "Rời bàn" : "Leave"}</button>
      </div>

      <section className="rounded-[28px] p-3 bg-[radial-gradient(ellipse_at_center,#14532d,#052e16)] border-4 border-amber-800 flex flex-col gap-2">
        {s.dealer && (
          <div className="flex flex-col items-center">
            <div className="text-[11px] font-black text-yellow-200">{vi ? "Nhà cái (máy)" : "Dealer"}{s.dealer.total !== null ? ` · ${s.dealer.total}` : ""}</div>
            <div className="flex -space-x-4 mt-1">{s.dealer.cards.map((c, k) => <PlayingCard key={k} c={c} i={k} />)}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">{others.map(seatBox)}</div>
        <div className="text-center text-xs font-black text-yellow-200 min-h-[1rem]">
          {s.phase === "waiting" || s.phase === "settled"
            ? (s.message ? s.message : s.nextRoundAt ? (vi ? `Ván mới sau ${Math.max(0, Math.ceil((s.nextRoundAt - now) / 1000))}s` : `Next round in ${Math.max(0, Math.ceil((s.nextRoundAt - now) / 1000))}s`) : (vi ? "Đang chờ người chơi" : "Waiting for players"))
            : s.turn !== null && s.seats[s.turn] ? `${s.turn === s.you ? (vi ? "Lượt bạn" : "Your turn") : s.seats[s.turn]!.username}${left !== null ? ` · ${left}s` : ""}`
              : (vi ? "Nhà cái đang rút…" : "Dealer playing…")}
        </div>
      </section>

      {/* You */}
      {me ? (
        <section className={`rounded-3xl p-3 ${myTurn ? "bg-yellow-400/15 ring-2 ring-yellow-300" : "bg-white/[0.04]"} border border-white/10`}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-black text-white flex items-center gap-1">{me.banker && <Crown className="w-4 h-4 text-yellow-300" />}{vi ? "Bạn" : "You"}{me.banker ? (vi ? " · nhà cái" : " · banker") : ""}</div>
            {me.total !== null && me.playing && <div className="font-black text-yellow-300 text-lg">{me.total}</div>}
          </div>
          <div className="flex justify-center -space-x-3 my-2 min-h-[4.25rem]">{me.playing ? (me.cards ?? []).map((c, k) => <PlayingCard key={k} c={c} i={k} />) : <span className="text-sm text-white/50 self-center">{vi ? "Bạn sẽ vào ván sau" : "You're in from the next round"}</span>}</div>
          {me.label && <div className={`text-center font-black ${me.net! > 0 ? "text-emerald-300" : me.net! < 0 ? "text-rose-300" : "text-white"}`} data-testid="my-result">{me.label} {me.net ? `${me.net > 0 ? "+" : "−"}${fmt(Math.abs(me.net))} xu` : ""}</div>}
          {myTurn && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <button type="button" onClick={() => { soundManager.buttonClick(); send({ t: "act", a: "hit" }); }} disabled={s.mode === "banker" && me.count >= 5}
                className="py-3 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-700 text-white font-black disabled:opacity-40" data-testid="act-hit">{vi ? "Rút" : "Hit"}</button>
              <button type="button" onClick={() => { soundManager.buttonClick(); send({ t: "act", a: "stand" }); }} disabled={!canStand}
                className="py-3 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black disabled:opacity-40" data-testid="act-stand">{vi ? "Dằn" : "Stand"}</button>
              {s.mode === "house" ? (
                <button type="button" onClick={() => { soundManager.buttonClick(); send({ t: "act", a: "double" }); }} disabled={me.count !== 2}
                  className="py-3 rounded-2xl bg-gradient-to-b from-sky-400 to-indigo-700 text-white font-black disabled:opacity-40" data-testid="act-double">{vi ? "Gấp đôi" : "Double"}</button>
              ) : <div className="text-[10px] text-white/55 self-center text-center">{canStand ? "" : (vi ? `Cần ${min} điểm để dằn` : `Need ${min} to stand`)}</div>}
            </div>
          )}
        </section>
      ) : (
        <button type="button" onClick={() => send({ t: "sit" })} className="w-full py-3 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black" data-testid="sit-down">{vi ? "Ngồi vào bàn" : "Take a seat"}</button>
      )}

      <div className="flex justify-center gap-2">
        {EMOTES.map((e) => <button key={e} type="button" onClick={() => send({ t: "emote", e })} className="w-10 h-10 rounded-full bg-white/5 text-xl">{e}</button>)}
      </div>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(inviteUrl); toast({ title: vi ? "Đã chép link mời bạn" : "Invite link copied" }); }}
        className="text-xs text-sky-300 underline">{vi ? "Chép link mời bạn vào bàn" : "Copy an invite link to this table"}</button>

      <details className="rounded-2xl p-3 bg-white/[0.04] border border-white/10 text-xs text-white/75">
        <summary className="font-black text-yellow-300 cursor-pointer">{vi ? "Luật chơi" : "Rules"}</summary>
        {s.mode === "banker" ? (
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            <li>{vi ? "Mỗi ván một người làm nhà cái, xoay vòng quanh bàn. Mọi người đấu với nhà cái; tiền chỉ chuyển giữa người chơi." : "One player is the banker each round, moving round the table. Everyone plays the banker; coins only move between players."}</li>
            <li>{vi ? `Xì Bàn (hai con A) ăn ×${XI_BAN_PAYS}; Xì Dách (A với 10/J/Q/K) ×${XI_DACH_PAYS}; Ngũ Linh (5 lá không quá 21) ×${NGU_LINH_PAYS}.` : `Xì Bàn (two aces) pays ×${XI_BAN_PAYS}; Xì Dách (an ace and a 10/J/Q/K) ×${XI_DACH_PAYS}; Ngũ Linh (five cards, 21 or under) ×${NGU_LINH_PAYS}.`}</li>
            <li>{vi ? `Người chơi cần ${PLAYER_STAND_MIN} điểm để dằn, nhà cái ${BANKER_STAND_MIN}. Quá 21 là quắc: thua kể cả khi nhà cái cũng quắc.` : `Players need ${PLAYER_STAND_MIN} to stand, the banker ${BANKER_STAND_MIN}. Over 21 is quắc and loses, even if the banker goes over too.`}</li>
            <li>{vi ? "Còn lại: điểm cao hơn thắng; bằng điểm hoà. Hai Ngũ Linh: ít điểm hơn thắng." : "Otherwise the higher total wins; a tie is a push. Two Ngũ Linh: the lower total wins."}</li>
            <li>{vi ? "Hết giờ thì máy đánh hộ (rút tới đủ điểm rồi dằn)." : "If your time runs out, your hand is played for you (draws to the minimum, then stands)."}</li>
          </ul>
        ) : (
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            <li>{vi ? "Mỗi người đấu với nhà cái máy, cùng bàn và thấy bài nhau." : "Everyone plays the computer dealer at one table and sees each other's cards."}</li>
            <li>{vi ? "Blackjack trả 3:2, nhà cái dừng ở 17, được gấp đôi với 2 lá đầu, không tách bài. Hoàn trả khoảng 99%." : "Blackjack pays 3:2, the dealer stands on 17, double on your first two cards, no split. Returns about 99%."}</li>
          </ul>
        )}
      </details>
    </div>
  );
}

export default function CardTables() {
  const { user, isLoading } = useAuth();
  const search = useSearch();
  const [, navigate] = useLocation();
  const code = new URLSearchParams(search).get("table");
  if (isLoading) return null;
  if (!user) return <Redirect to={`/auth?next=${encodeURIComponent(`/ban-bai${search ? `?${search}` : ""}`)}`} />;
  return (
    <div className="min-h-screen bg-[#0b0716] app-aurora flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-3 pb-6 flex flex-col gap-3" data-testid="card-tables-page">
        <GameTabs />
        {code ? <TableScreen key={code} code={code.toUpperCase()} onExit={() => navigate("/ban-bai")} /> : <Lobby onOpen={(c) => navigate(`/ban-bai?table=${c}`)} />}
      </main>
      <AppFooter />
    </div>
  );
}
