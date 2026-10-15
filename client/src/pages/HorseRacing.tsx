import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { useAuth } from "@/hooks/use-auth";
import { useSetBalance } from "@/hooks/use-game";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import { AppFooter } from "@/pages/Home";
import {
  HORSES, HORSE_CHIPS, HORSE_MAX_PER_RACE, HORSE_RUN_ON, HORSE_RTP_MIN, HORSE_RTP_MAX, HORSE_BET_MS, HORSE_RACE_MS, HORSE_RESULT_MS,
  HORSE_CLOSE_EARLY_MS, HORSE_CHANCES, PHOTO_FINISH_MS,
  simulateRace, raceCall, horsePayout,
  type HorseView, type RaceSim, type RaceCall, type HorseBetView,
} from "@shared/horse";

const fmt = fmtCoins;
const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${+(n / 1000).toFixed(1)}K`);
const LANE = 28;
const RAIL = 10;
const SPAN = 0.32; // how much of the track the camera shows
const TRACK_M = 1200;

/** A horse's number on its saddle cloth colour */
function Badge({ horse, size = 22 }: { horse: number; size?: number }) {
  const h = HORSES[horse];
  return (
    <span className="inline-flex items-center justify-center rounded-md font-black shrink-0 border border-white/40 shadow"
      style={{ width: size, height: size, background: h.color, color: h.ink, fontSize: size * 0.55 }}>{horse + 1}</span>
  );
}

/** The track, seen by a camera that follows the pack */
function Track({ sim, t, mine, width }: { sim: RaceSim | null; t: number; mine: Set<number>; width: number }) {
  const n = HORSES.length;
  const prog = (h: number) => (sim && t > 0 ? sim.progress(h, t) : 0);
  let center = 0.12;
  if (sim && t > 0) {
    const ps = HORSES.map((_, h) => prog(h));
    center = Math.min(Math.max((Math.max(...ps) + Math.min(...ps)) / 2 + 0.02, 0.12), 1 + HORSE_RUN_ON + 0.02 - SPAN / 2);
  }
  const left = center - SPAN / 2;
  const xOf = (p: number) => (p - left) / SPAN; // 0..1 across the screen
  const trackPx = width / SPAN;
  const running = sim && t > 0 && t < HORSE_RACE_MS;
  const posts = Array.from({ length: 13 }, (_, i) => i / 12).filter((p) => xOf(p) > -0.05 && xOf(p) < 1.05);
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border-2 border-white/20 select-none"
      style={{ height: n * LANE + RAIL * 2 }} data-testid="horse-track">
      {/* Turf: lanes, mowing stripes that scroll with the camera */}
      <div className="absolute inset-0" style={{
        background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 40px, rgba(0,0,0,0.05) 40px 80px), linear-gradient(#2f7d32, #1f5e24)`,
        backgroundPosition: `${-left * trackPx}px 0, 0 0`,
      }} />
      {HORSES.map((_, i) => (
        <div key={i} className="absolute left-0 right-0 border-b border-white/10" style={{ top: RAIL + i * LANE, height: LANE, background: i % 2 ? "rgba(0,0,0,0.08)" : "transparent" }} />
      ))}
      {/* Rails */}
      <div className="absolute left-0 right-0 top-0 bg-white/90 shadow" style={{ height: 4, top: RAIL - 5 }} />
      <div className="absolute left-0 right-0 bg-white/90 shadow" style={{ height: 4, bottom: RAIL - 5 }} />
      {/* Distance posts */}
      {posts.map((p) => p > 0 && p < 1 && (
        <div key={p} className="absolute top-0 bottom-0" style={{ left: `${xOf(p) * 100}%` }}>
          <div className="absolute top-0 bottom-0 w-px bg-white/25" />
          <div className="absolute -translate-x-1/2 top-0 text-[8px] font-black text-white bg-red-600 rounded px-1 leading-[10px]">{Math.round(TRACK_M * (1 - p))}m</div>
        </div>
      ))}
      {/* Start gate */}
      {xOf(0) > -0.05 && (
        <div className="absolute top-0 bottom-0 w-1.5 bg-white/70" style={{ left: `${xOf(0) * 100}%` }} />
      )}
      {/* Finish line */}
      {xOf(1) < 1.1 && (
        <div className="absolute top-0 bottom-0 w-3" style={{
          left: `${xOf(1) * 100}%`,
          background: "repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 6px 6px",
        }}>
          <div className="absolute -top-0 left-1/2 -translate-x-1/2 text-[11px]">🏁</div>
        </div>
      )}
      {/* Horses */}
      {HORSES.map((h, i) => {
        const p = prog(i);
        const x = xOf(p);
        const behind = x < 0.1;
        const gallop = running && p < 1 + HORSE_RUN_ON * 0.8 ? Math.sin(t / 70 + i * 1.3) : 0;
        return (
          <div key={i} className="absolute flex items-center" style={{
            top: RAIL + i * LANE, height: LANE,
            left: `${Math.max(x, 0.1) * 100}%`,
            transform: `translateX(-100%) translateY(${gallop * 1.6}px)`,
            opacity: behind ? 0.75 : 1,
          }} data-testid={`horse-${i + 1}`}>
            {running && p > 0.02 && p < 1 && (
              <span className="mr-[-6px] h-2 w-5 rounded-full bg-amber-100/40 blur-[2px]" style={{ opacity: 0.4 + 0.3 * Math.abs(gallop) }} />
            )}
            <span className="relative leading-none" style={{ fontSize: 24, filter: `drop-shadow(0 0 3px ${h.color}) drop-shadow(0 0 1px ${h.color})` }}>
              <span className="inline-block" style={{ transform: `scaleX(-1) rotate(${gallop * 4}deg)` }}>🏇</span>
              <span className="absolute left-[38%] top-[40%] flex items-center justify-center rounded-[3px] font-black"
                style={{ width: 13, height: 11, fontSize: 9, background: h.color, color: h.ink, boxShadow: "0 0 0 1px rgba(255,255,255,0.7)" }}>{i + 1}</span>
            </span>
            {mine.has(i) && <span className="absolute -top-1 -right-1 text-[10px]">⭐</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function HorseRacing() {
  const { user, isLoading } = useAuth();
  const { tr, loc, srv, locale } = useLang();
  const { toast } = useToast();
  const setBalance = useSetBalance();
  const q = useQuery<HorseView>({ queryKey: ["/api/horse"], refetchInterval: 1000, enabled: !!user });
  const v = q.data;
  const [chip, setChip] = useState(HORSE_CHIPS[1]);
  const [slip, setSlip] = useState<Record<number, number>>({});
  const [clock, setClock] = useState(Date.now());
  const [width, setWidth] = useState(360);
  const trackBox = useRef<HTMLDivElement>(null);
  const raceBox = useRef<HTMLElement>(null);
  const offset = useRef<number | null>(null);
  const racing = useRef(false);

  // Server time: the response can only be late, never early, so the largest offset seen is the best
  useEffect(() => {
    if (!v) return;
    const o = v.serverNow - q.dataUpdatedAt;
    if (offset.current === null || o > offset.current || o < offset.current - 3000) offset.current = o;
  }, [v, q.dataUpdatedAt]);
  // Smooth frames while the horses run, a few ticks a second otherwise
  useEffect(() => {
    let id = 0, last = 0;
    const loop = () => {
      const n = Date.now();
      if (racing.current || n - last > 250) { last = n; setClock(n); }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const el = trackBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 360));
    ro.observe(el);
    return () => ro.disconnect();
  }, [v != null]);

  const now = clock + (offset.current ?? 0);
  const phase = !v ? "loading" : now < v.raceStart ? "betting" : now < v.raceEnd ? "race" : "results";
  const sim = useMemo(() => (v?.race ? simulateRace(v.race.seed, v.race.order) : null), [v?.race?.seed, v?.round]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = v && phase !== "betting" ? Math.min(now - v.raceStart, HORSE_RACE_MS) : 0;
  racing.current = phase === "race";
  const call: RaceCall | null = sim && phase !== "betting" ? raceCall(sim, t) : null;
  const winner = sim?.order[0];
  const winnerIn = sim != null && winner != null && t >= sim.finish[winner];
  const standings = sim && t > 0 ? sim.standings(t) : HORSES.map((_, i) => i);
  const mine = v?.mine ?? [];
  const mineHorses = useMemo(() => new Set(mine.map((b) => b.horse)), [mine]);
  const staked = mine.reduce((a, b) => a + b.amount, 0);
  const myWin = winnerIn ? mine.filter((b) => b.horse === winner).reduce((a, b) => a + horsePayout(b.amount, b.odds10), 0) : 0;

  // The gates open late? Ask for the race straight away
  useEffect(() => {
    if (phase === "race" && v && !v.race && !q.isFetching) void q.refetch();
  }, [phase, v, q]);

  // Sounds and celebrations, once per race
  const done = useRef({ bell: -1, cheer: -1, win: -1, balance: null as number | null });
  useEffect(() => {
    if (!v) return;
    if (done.current.balance !== v.balance) { done.current.balance = v.balance; setBalance(v.balance); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setBalance is a new function every render
  }, [v?.balance]);
  useEffect(() => {
    if (!v || !sim) return;
    if (phase === "race" && done.current.bell !== v.round) {
      done.current.bell = v.round;
      if (t < 1500) soundManager.raceBell();
      // Bring the track into view if the player scrolled down to bet
      const top = raceBox.current?.getBoundingClientRect().top;
      if (top !== undefined && (top < 0 || top > window.innerHeight * 0.4)) {
        window.scrollTo({ top: Math.max(0, top + window.scrollY - 72), behavior: "smooth" });
      }
    }
    if (winnerIn && done.current.cheer !== v.round) {
      done.current.cheer = v.round;
      if (phase === "race") soundManager.cheer();
      if (myWin > 0 && done.current.win !== v.round) {
        done.current.win = v.round;
        soundManager.win(myWin >= staked * 5);
        coinBurst();
        if (myWin >= staked * 5) fireworks(2500, 1);
        navigator.vibrate?.([60, 40, 60, 40, 200]);
      }
    }
  }, [phase, sim, winnerIn, v, t, myWin, staked]);
  // Hooves while the field is running
  useEffect(() => {
    if (phase !== "race" || !sim) return;
    const last = Math.max(...sim.finish);
    const id = window.setInterval(() => {
      const tt = Date.now() + (offset.current ?? 0) - (v?.raceStart ?? 0);
      if (tt > 0 && tt < last) soundManager.hooves();
    }, 400);
    return () => clearInterval(id);
  }, [phase, sim, v?.raceStart]);
  // A new race: a fresh bet slip
  useEffect(() => { setSlip({}); }, [v?.round]);

  const place = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/horse/bet", {
      bets: Object.entries(slip).filter(([, a]) => a > 0).map(([h, amount]) => ({ horse: Number(h), amount })),
    })).json(),
    onSuccess: (r) => {
      setBalance(r.balance);
      soundManager.coinShower();
      setSlip({});
      queryClient.invalidateQueries({ queryKey: ["/api/horse"] });
      toast({ title: tr("🏇 Đã đặt cược. Chúc may mắn!", "🏇 Bet placed. Good luck!", "🏇 下注成功，祝你好運！") });
    },
    onError: (e) => toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" }),
  });

  if (isLoading) return null;
  if (!user) return <Redirect to="/auth" />;

  const secs = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
  const odds = (o: number) => `×${(o / 10).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  const pct = (x: number) => (x * 100).toLocaleString(locale, { maximumFractionDigits: 1 });
  const name = (h: number) => loc(HORSES[h].name);
  const slipTotal = Object.values(slip).reduce((a, b) => a + b, 0);
  const room = HORSE_MAX_PER_RACE - staked;
  const open = phase === "betting" && v != null && now < v.raceStart - HORSE_CLOSE_EARLY_MS;
  const addChip = (h: number) => {
    if (!open || !v) return;
    const add = Math.min(chip, room - slipTotal, v.balance - slipTotal);
    if (add < 1000) {
      toast({ title: room - slipTotal < 1000 ? srv("At most 5,000,000 coins on one race") : srv("Not enough coins"), variant: "destructive" });
      return;
    }
    soundManager.betChange();
    setSlip((s) => ({ ...s, [h]: (s[h] ?? 0) + Math.floor(add / 1000) * 1000 }));
  };
  const board = v ? HORSES.map((_, h) => h).sort((a, b) => v.odds10[a] - v.odds10[b] || a - b) : [];

  const callText = (c: RaceCall | null): string => {
    if (!c) return tr("Các chiến mã đang vào cổng xuất phát…", "The horses are heading to the starting gate…", "駿馬們正走向起跑閘門……");
    switch (c.kind) {
      case "off": return tr("Xuất phát! Các chiến mã lao ra khỏi cổng!", "And they're off!", "起跑了！駿馬們衝出閘門！");
      case "lead": return tr(`Số ${c.horse + 1} ${name(c.horse)} vươn lên dẫn đầu!`, `No. ${c.horse + 1} ${name(c.horse)} takes the lead!`, `${c.horse + 1} 號「${name(c.horse)}」衝上領先！`);
      case "surge": return tr(`Số ${c.horse + 1} đang vươn lên!`, `No. ${c.horse + 1} is flying up the field!`, `${c.horse + 1} 號正在急起直追！`);
      case "holds": return tr(`Số ${c.horse + 1} ${name(c.horse)} vẫn đang dẫn đầu`, `No. ${c.horse + 1} ${name(c.horse)} still in front`, `${c.horse + 1} 號「${name(c.horse)}」仍然領先`);
      case "chase": return tr(`Số ${c.horse + 1} ${name(c.horse)} bám đuổi sát nút!`, `No. ${c.horse + 1} ${name(c.horse)} right on their heels!`, `${c.horse + 1} 號「${name(c.horse)}」緊追不捨！`);
      case "sprint": return c.close ? tr("Nước rút! Sát nút quá!", "Final stretch, neck and neck!", "最後衝刺！難分難解！") : tr("Nước rút cuối cùng!", "Here comes the final sprint!", "最後衝刺！");
      case "won": return `${c.photo ? "📸 " : "🏆 "}${tr(`Số ${c.horse + 1} ${name(c.horse)} về nhất!`, `No. ${c.horse + 1} ${name(c.horse)} wins it!`, `${c.horse + 1} 號「${name(c.horse)}」奪冠！`)}`;
    }
  };
  const photo = sim && winner != null && sim.finish[sim.order[1]] - sim.finish[winner] < PHOTO_FINISH_MS && winnerIn && t < sim.finish[winner] + 2500;
  const showPodium = sim != null && (phase === "results" || t >= sim.finish[sim.order[2]] + 600);

  const statusPill = (b: HorseBetView) => b.status === "pending"
    ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black text-white/70">{tr("Chờ", "Pending", "等待中")}</span>
    : b.status === "won"
      ? <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black text-black">+{fmt(b.payout ?? 0)}</span>
      : <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-300">{tr("Thua", "Lost", "未中")}</span>;

  return (
    <div className="min-h-screen bg-[#0b0716] app-aurora flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-3 pb-6 flex flex-col gap-3" data-testid="horse-page">
        <GameTabs />

        {/* The race */}
        <section ref={raceBox} className="relative overflow-hidden rounded-[28px] p-3 bg-gradient-to-br from-green-700 via-emerald-900 to-[#071a10] border border-yellow-300/40 shadow-[0_14px_40px_rgba(34,197,94,0.25)]">
          <div className="flex items-start justify-between gap-2 px-1">
            <div className="min-w-0">
              <div className="font-display text-3xl text-yellow-300 leading-none">🏇 {tr("Đua Ngựa", "Horse Racing", "賽馬")}</div>
              <div className="text-[11px] text-white/70 mt-0.5">{tr(`Cuộc đua #${v?.round ?? "…"} · ${v?.players ?? 0} người cược`, `Race #${v?.round ?? "…"} · ${v?.players ?? 0} players`, `第 ${v?.round ?? "…"} 場 · ${v?.players ?? 0} 位玩家下注`)}</div>
            </div>
            {v && (
              <div className={`shrink-0 rounded-2xl px-3 py-1 text-center ${phase === "betting" ? "bg-black/35" : phase === "race" ? "bg-red-600" : "bg-yellow-400 text-black"}`} data-testid="horse-countdown">
                <div className={`text-[9px] font-black uppercase tracking-wider ${phase === "results" ? "text-black/70" : "text-white/70"}`}>
                  {phase === "betting" ? tr("Xuất phát sau", "Off in", "距離起跑") : phase === "race" ? tr("Đang đua", "Racing", "比賽中") : tr("Cuộc mới sau", "Next race", "下一場")}
                </div>
                <div className={`font-mono font-black text-2xl leading-none ${phase === "results" ? "text-black" : "text-white"}`}>
                  {phase === "betting" ? `${secs(v.raceStart - now)}s` : phase === "race" ? "LIVE" : `${secs(v.end - now)}s`}
                </div>
              </div>
            )}
          </div>

          <div ref={trackBox} className="relative mt-2">
            {!v ? <div className="h-[244px] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-yellow-300" /></div> : (
              <>
                <Track sim={sim} t={t} mine={mineHorses} width={width} />
                <AnimatePresence>
                  {photo && (
                    <motion.div key="photo" initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-x-10 top-3 rounded-xl bg-white text-black text-center font-black py-1.5 shadow-[0_0_40px_rgba(255,255,255,0.9)]" data-testid="horse-photo">
                      📸 {tr("ẢNH ĐÍCH! Sát nút!", "PHOTO FINISH!", "終點攝影！")}
                    </motion.div>
                  )}
                  {showPodium && sim && (
                    <motion.div key="podium" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 rounded-2xl bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-end pb-3" data-testid="horse-podium">
                      {myWin > 0 ? (
                        <motion.div initial={{ scale: 0.4 }} animate={{ scale: [0.4, 1.15, 1] }} transition={{ duration: 0.6 }}
                          className="mb-auto mt-3 text-center" data-testid="horse-my-win">
                          <div className="text-xs font-black uppercase tracking-widest text-yellow-200">{tr("Bạn thắng", "You won", "你贏了")}</div>
                          <div className="font-mono font-black text-4xl text-yellow-300 drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">🪙 +{fmt(myWin)}</div>
                        </motion.div>
                      ) : staked > 0 ? (
                        <div className="mb-auto mt-4 text-sm font-bold text-white/80">{tr("Lần này chưa trúng. Cuộc sau nhé!", "Not this time. Next race!", "這次沒中，下一場加油！")}</div>
                      ) : <div className="mb-auto" />}
                      <div className="flex items-end gap-2">
                        {[1, 0, 2].map((place) => {
                          const h = sim.order[place];
                          return (
                            <div key={place} className="flex flex-col items-center w-[6.2rem]">
                              <div className="text-2xl leading-none">{["🥇", "🥈", "🥉"][place]}</div>
                              <div className="flex items-center gap-1 mt-0.5 max-w-full"><Badge horse={h} size={18} /><span className="truncate text-[11px] font-black text-white">{name(h)}</span></div>
                              <div className={`mt-1 w-full rounded-t-lg flex items-start justify-center pt-1 font-black ${place === 0 ? "h-14 bg-gradient-to-b from-yellow-300 to-amber-500 text-black" : place === 1 ? "h-10 bg-gradient-to-b from-slate-200 to-slate-400 text-black" : "h-7 bg-gradient-to-b from-orange-300 to-orange-600 text-black"}`}>
                                {v.odds10[h] ? odds(v.odds10[h]) : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>

          {/* Who's where, and the commentator */}
          {v && (
            <>
              <div className="mt-2 flex items-center gap-1" data-testid="horse-ticker">
                {standings.map((h, place) => (
                  <motion.div key={h} layout transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    className={`flex-1 flex flex-col items-center rounded-lg py-0.5 ${mineHorses.has(h) ? "bg-yellow-400/20 ring-1 ring-yellow-300" : "bg-black/25"}`}>
                    <span className="text-[8px] font-black text-white/50 leading-none">{place + 1}</span>
                    <Badge horse={h} size={20} />
                  </motion.div>
                ))}
              </div>
              <div className="mt-2 rounded-xl bg-black/35 px-3 py-2 min-h-[2.25rem] overflow-hidden" data-testid="horse-commentary">
                <motion.div key={callText(call)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="text-sm font-bold text-yellow-100 text-center">
                  🎙️ {callText(call)}
                </motion.div>
              </div>
            </>
          )}
        </section>

        {/* Odds board and betting */}
        {v && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10 flex flex-col gap-2" data-testid="horse-board">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-yellow-300">{tr("Bảng tỷ lệ", "Odds board", "賠率表")}</div>
              <div className="text-[10px] text-white/50">{tr("Cửa trên → cửa dưới", "Favourite → long shot", "熱門 → 冷門")}</div>
            </div>
            {open && (
              <div className="grid grid-cols-7 gap-1" data-testid="horse-chips">
                {HORSE_CHIPS.map((c) => (
                  <button key={c} type="button" onClick={() => setChip(c)} data-testid={`horse-chip-${c}`}
                    className={`h-10 rounded-full text-[11px] font-black border-2 ${chip === c ? "bg-yellow-400 text-black border-yellow-100 scale-105" : "bg-white/5 text-white/80 border-white/15"} transition-transform`}>
                    {short(c)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1">
              {board.map((h) => {
                const pool = v.pool[h];
                const onIt = mine.filter((b) => b.horse === h).reduce((a, b) => a + b.amount, 0);
                const won = phase !== "betting" && winnerIn && h === winner;
                return (
                  <button key={h} type="button" disabled={!open} onClick={() => addChip(h)} data-testid={`horse-pick-${h + 1}`}
                    className={`w-full min-h-[48px] flex items-center gap-2 rounded-2xl px-2 py-1.5 text-left border transition-colors ${won ? "bg-yellow-400/25 border-yellow-300" : slip[h] ? "bg-yellow-400/10 border-yellow-400/60" : "bg-black/25 border-white/10"} ${open ? "active:scale-[0.99] hover:bg-white/10" : ""}`}>
                    <Badge horse={h} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-white truncate">{name(h)} {won && "🏆"}</div>
                      <div className="text-[10px] text-white/50 truncate">👥 {pool.players} · {fmt(pool.amount)} {tr("xu", "coins", "金幣")}</div>
                    </div>
                    {(slip[h] || onIt) ? (
                      <div className="text-right leading-tight">
                        {onIt > 0 && <div className="text-[10px] font-black text-emerald-300">✓ {short(onIt)}</div>}
                        {slip[h] > 0 && <div className="text-[11px] font-black text-yellow-300">+{short(slip[h])}</div>}
                      </div>
                    ) : null}
                    <div className="w-14 text-right font-mono font-black text-lg text-yellow-300">{odds(v.odds10[h])}</div>
                  </button>
                );
              })}
            </div>
            {open ? (
              <div className="flex items-center gap-2 mt-1">
                <button type="button" onClick={() => setSlip({})} disabled={slipTotal === 0} aria-label={tr("Xoá", "Clear", "清除")}
                  className="h-12 w-12 shrink-0 rounded-2xl bg-white/5 text-white/70 flex items-center justify-center disabled:opacity-40" data-testid="horse-clear">
                  <Trash2 className="w-5 h-5" />
                </button>
                <button type="button" disabled={slipTotal === 0 || place.isPending} onClick={() => place.mutate()}
                  className="flex-1 h-12 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-base disabled:opacity-50" data-testid="horse-place">
                  {place.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    : slipTotal > 0 ? tr(`Đặt cược · ${fmt(slipTotal)} xu`, `Place bet · ${fmt(slipTotal)} coins`, `下注 · ${fmt(slipTotal)} 金幣`)
                      : tr("Chạm vào ngựa để đặt phỉnh", "Tap a horse to add a chip", "點選馬匹放上籌碼")}
                </button>
              </div>
            ) : (
              <div className="text-center text-xs text-white/60 py-1">
                {phase === "betting" ? tr("Đã khoá cược, sắp xuất phát!", "Betting closed, they're about to go!", "已停止下注，即將起跑！")
                  : tr("Cược cho cuộc đua sau sẽ mở ngay khi cuộc này kết thúc.", "Betting on the next race opens when this one ends.", "本場結束後即開放下一場下注。")}
              </div>
            )}
            <div className="text-[10px] text-white/45 text-center">
              {tr(`Đã cược ${fmt(staked)} / ${fmt(HORSE_MAX_PER_RACE)} xu cuộc này`, `Bet ${fmt(staked)} of ${fmt(HORSE_MAX_PER_RACE)} coins this race`, `本場已下注 ${fmt(staked)} / ${fmt(HORSE_MAX_PER_RACE)} 金幣`)}
            </div>
          </section>
        )}

        {/* Your bets */}
        {v && (mine.length > 0 || v.history.length > 0) && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10" data-testid="horse-mybets">
            <div className="text-[11px] font-black uppercase text-white/50 mb-1">{tr("Cược của bạn", "Your bets", "我的下注")}</div>
            {[...mine].reverse().concat(v.history).slice(0, 12).map((b) => (
              <div key={b.id} className="flex items-center gap-2 text-xs py-1.5 border-t border-white/5 first:border-0">
                <span className="text-white/40 w-12 shrink-0">#{b.round}</span>
                <Badge horse={b.horse} size={18} />
                <span className="flex-1 truncate font-bold text-white">{name(b.horse)} <span className="text-white/40 font-normal">{odds(b.odds10)}</span></span>
                <span className="text-white/70">{fmt(b.amount)}</span>
                {statusPill(b)}
              </div>
            ))}
          </section>
        )}

        {/* Last winners */}
        {v && v.winners.length > 0 && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10" data-testid="horse-winners">
            <div className="text-[11px] font-black uppercase text-white/50 mb-2">{tr("10 cuộc gần nhất", "Last 10 winners", "最近 10 場冠軍")}</div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {v.winners.map((w, i) => (
                <div key={w.round} className={`shrink-0 flex flex-col items-center rounded-xl px-1.5 py-1 ${i === 0 ? "bg-yellow-400/15 ring-1 ring-yellow-400/50" : "bg-black/25"}`}>
                  <Badge horse={w.horse} size={24} />
                  <span className="text-[9px] font-black text-yellow-200 mt-0.5">{odds(w.odds10)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* How it works */}
        <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10">
          <div className="text-sm font-black text-yellow-300">{tr("Cách chơi", "How it works", "玩法說明")}</div>
          <p className="text-[11px] text-white/60 mt-1 leading-relaxed">
            {tr(`Mỗi phút một cuộc đua: ${HORSE_BET_MS / 1000} giây đặt cược, ${HORSE_RACE_MS / 1000} giây đua, ${HORSE_RESULT_MS / 1000} giây trao giải. Đặt cửa thắng cho một hay nhiều ngựa, tối đa ${fmt(HORSE_MAX_PER_RACE)} xu mỗi cuộc. Ngựa về nhất trả tiền cược × tỷ lệ (đã gồm tiền gốc). Mỗi cuộc, ${HORSES.length} ngựa được chia ngẫu nhiên các cơ hội thắng ${HORSE_CHANCES.map((c) => `${pct(c / 10000)}%`).join(", ")}; tỷ lệ = 0,95 ÷ cơ hội, làm tròn xuống. Kết quả do máy chủ bốc thăm trước khi xuất phát và mọi người xem cùng một cuộc đua. Hoàn trả mỗi ngựa từ ${pct(HORSE_RTP_MIN)}% đến ${pct(HORSE_RTP_MAX)}%, tính chính xác.`,
              `A race every minute: ${HORSE_BET_MS / 1000}s to bet, a ${HORSE_RACE_MS / 1000}s race, ${HORSE_RESULT_MS / 1000}s of results. Back one or more horses to win, up to ${fmt(HORSE_MAX_PER_RACE)} coins a race. The winner pays your bet × its odds (stake included). Each race the ${HORSES.length} horses are randomly given win chances of ${HORSE_CHANCES.map((c) => `${pct(c / 10000)}%`).join(", ")}; odds = 0.95 ÷ chance, rounded down. The server draws the result before the off, and everyone watches the same race. Every horse returns between ${pct(HORSE_RTP_MIN)}% and ${pct(HORSE_RTP_MAX)}%, worked out exactly.`,
              `每分鐘一場比賽：${HORSE_BET_MS / 1000} 秒下注、${HORSE_RACE_MS / 1000} 秒比賽、${HORSE_RESULT_MS / 1000} 秒頒獎。可押一匹或多匹馬獨贏，每場最多 ${fmt(HORSE_MAX_PER_RACE)} 金幣。冠軍馬派彩 = 押注 × 賠率（含本金）。每場 ${HORSES.length} 匹馬會隨機分配 ${HORSE_CHANCES.map((c) => `${pct(c / 10000)}%`).join("、")} 的勝率；賠率 = 0.95 ÷ 勝率，無條件捨去。結果由伺服器在起跑前抽出，所有人看到的是同一場比賽。每匹馬的返還率介於 ${pct(HORSE_RTP_MIN)}% 至 ${pct(HORSE_RTP_MAX)}%，經過精確計算。`)}
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
