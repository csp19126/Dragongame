import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2, Repeat, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { Avatar } from "@/components/Avatar";
import { ShareButton } from "@/components/ShareCard";
import { RaceTrack, type TrackApi } from "@/components/horse/RaceTrack";
import { useAuth } from "@/hooks/use-auth";
import { useSetBalance } from "@/hooks/use-game";
import { useLang, fmtCoins, type Language } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import { AppFooter } from "@/pages/Home";
import {
  HORSES, HORSE_CHIPS, HORSE_MAX_PER_RACE, HORSE_MAX_LINES, HORSE_RTP_MIN, HORSE_RTP_MAX, HORSE_BET_MS, HORSE_RACE_MS, HORSE_RESULT_MS,
  HORSE_CLOSE_EARLY_MS, HORSE_CHANCES, HORSE_CHEERS, HORSE_REPLAY_AT,
  simulateRace, raceCall, raceShot, raceFinish, horsePayout, horseBetWins, horseBetOdds,
  type HorseView, type RaceCall, type HorseBetView, type HorseBetType, type RunStyle,
} from "@shared/horse";

const fmt = fmtCoins;
const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${+(n / 1000).toFixed(1)}K`);
const VOICE_KEY = "horse-voice";
const VOICE_LANG: Record<Language, string> = { vi: "vi-VN", en: "en-US", zh: "zh-TW" };

interface SlipLine { type: HorseBetType; horse: number; horse2: number | null; amount: number }
const slipKey = (type: HorseBetType, horse: number, horse2: number | null) => `${type}:${horse}:${horse2 ?? ""}`;

/** A voice for the language, if the phone has one */
function findVoice(lang: Language): SpeechSynthesisVoice | null {
  try {
    const vs = window.speechSynthesis?.getVoices() ?? [];
    const want = VOICE_LANG[lang].toLowerCase();
    const prefix = want.slice(0, 2);
    return vs.find((v) => v.lang.toLowerCase().replace("_", "-") === want)
      ?? (lang === "zh" ? vs.find((v) => /zh[-_](hk|hant)/i.test(v.lang)) : undefined)
      ?? vs.find((v) => v.lang.toLowerCase().startsWith(prefix)) ?? null;
  } catch { return null; }
}
function readVoicePref(): boolean | null {
  try { const v = localStorage.getItem(VOICE_KEY); return v === "on" ? true : v === "off" ? false : null; } catch { return null; }
}

/** A horse's number on its saddle cloth colour */
function Badge({ horse, size = 22 }: { horse: number; size?: number }) {
  const h = HORSES[horse];
  return (
    <span className="inline-flex items-center justify-center rounded-md font-black shrink-0 border border-white/40 shadow"
      style={{ width: size, height: size, background: h.color, color: h.ink, fontSize: size * 0.55 }}>{horse + 1}</span>
  );
}

/** Last finishing places as small squares: gold, silver, bronze, grey */
function FormChips({ places }: { places: number[] }) {
  if (!places.length) return <span className="text-[9px] text-white/35">—</span>;
  return (
    <span className="inline-flex gap-[2px]">
      {places.map((p, i) => (
        <span key={i} className={`inline-flex items-center justify-center w-[13px] h-[13px] rounded-[3px] text-[8px] font-black leading-none ${p === 1 ? "bg-yellow-400 text-black" : p === 2 ? "bg-slate-300 text-black" : p === 3 ? "bg-orange-400 text-black" : "bg-white/10 text-white/60"}`}>{p}</span>
      ))}
    </span>
  );
}

export default function HorseRacing() {
  const { user, isLoading } = useAuth();
  const { tr, loc, srv, locale, lang } = useLang();
  const { toast } = useToast();
  const setBalance = useSetBalance();
  const q = useQuery<HorseView>({ queryKey: ["/api/horse"], refetchInterval: 1000, enabled: !!user });
  const v = q.data;
  const [chip, setChip] = useState(HORSE_CHIPS[1]);
  const [tab, setTab] = useState<HorseBetType>("win");
  const [fcFirst, setFcFirst] = useState<number | null>(null);
  const [slip, setSlip] = useState<Record<string, SlipLine>>({});
  const [clock, setClock] = useState(Date.now());
  const [stableOpen, setStableOpen] = useState(false);
  const [voicePref, setVoicePref] = useState<boolean | null>(readVoicePref);
  const [hasVoice, setHasVoice] = useState(() => !!findVoice(lang));
  const [floats, setFloats] = useState<{ id: number; emoji: string; x: number; y: number }[]>([]);
  const raceBox = useRef<HTMLElement>(null);
  const trackApi = useRef<TrackApi | null>(null);
  const offset = useRef<number | null>(null);
  const vRef = useRef<HorseView | undefined>(undefined);
  vRef.current = v;

  // Server time: the response can only be late, never early, so the largest offset seen is the best
  useEffect(() => {
    if (!v) return;
    const o = v.serverNow - q.dataUpdatedAt;
    if (offset.current === null || o > offset.current || o < offset.current - 3000) offset.current = o;
  }, [v, q.dataUpdatedAt]);
  const serverNow = () => Date.now() + (offset.current ?? 0);
  // The track animates itself; the rest of the page ticks a few times a second (10 during the race)
  const getT = useCallback(() => {
    const cur = vRef.current;
    return cur ? Date.now() + (offset.current ?? 0) - cur.raceStart : null;
  }, []);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const cur = vRef.current;
      const n = Date.now() + (offset.current ?? 0);
      const live = cur && n >= cur.raceStart && n < cur.end;
      setClock(Date.now());
      id = window.setTimeout(tick, live ? 100 : 250);
    };
    tick();
    return () => clearTimeout(id);
  }, []);
  // Voices load late on some phones
  useEffect(() => {
    const s = window.speechSynthesis;
    const upd = () => setHasVoice(!!findVoice(lang));
    upd();
    s?.addEventListener?.("voiceschanged", upd);
    return () => s?.removeEventListener?.("voiceschanged", upd);
  }, [lang]);
  const voiceOn = voicePref ?? hasVoice;

  const now = clock + (offset.current ?? 0);
  const phase = !v ? "loading" : now < v.raceStart ? "betting" : now < v.raceEnd ? "race" : "results";
  const sim = useMemo(() => (v?.race ? simulateRace(v.race.seed, v.race.order) : null), [v?.race?.seed, v?.round]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = v ? now - v.raceStart : -1;
  const shot = raceShot(sim, t);
  const fin = sim ? raceFinish(sim) : null;
  const favourite = v ? HORSES.map((_, i) => i).sort((a, b) => v.odds.win[a] - v.odds.win[b])[0] : undefined;
  const call: RaceCall | null = sim && shot.mode !== "gate" ? raceCall(sim, shot.mode === "live" ? shot.d : HORSE_RACE_MS, favourite) : null;
  const winner = sim?.order[0];
  const winnerIn = !!fin && (shot.mode !== "live" || shot.d >= fin.at) && shot.mode !== "gate";
  const standings = sim && shot.mode !== "gate" ? sim.standings(shot.mode === "live" ? shot.d : HORSE_RACE_MS) : HORSES.map((_, i) => i);
  const mine = v?.mine ?? [];
  const mineHorses = useMemo(() => [...new Set(mine.flatMap((b) => (b.horse2 != null ? [b.horse, b.horse2] : [b.horse])))].sort().join(","), [mine]);
  const staked = mine.reduce((a, b) => a + b.amount, 0);
  const myWin = winnerIn && sim ? mine.filter((b) => horseBetWins(b.type, b.horse, b.horse2, sim.order)).reduce((a, b) => a + horsePayout(b.amount, b.odds100), 0) : 0;
  const myCheerHorse = mine[0]?.horse ?? null;

  // The gates open late? Ask for the race straight away
  useEffect(() => {
    if (phase === "race" && v && !v.race && !q.isFetching) void q.refetch();
  }, [phase, v, q]);

  const name = (h: number) => loc(HORSES[h].name);
  const odds = (o: number) => `×${(o / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (x: number, d = 1) => (x * 100).toLocaleString(locale, { maximumFractionDigits: d });
  const typeLabel = (type: HorseBetType) => type === "win" ? tr("Về nhất", "WIN", "獨贏") : type === "top2" ? "TOP 2" : type === "top3" ? "TOP 3" : tr("Nhất–Nhì", "1→2", "二重彩");
  const typeChip = (type: HorseBetType) => type === "forecast" ? "1→2" : type === "win" ? tr("NHẤT", "WIN", "獨贏") : type === "top2" ? "TOP 2" : "TOP 3";
  const styleLabel = (s: RunStyle) => s === "front" ? tr("Chạy đầu", "Front-runner", "領跑型") : s === "stalker" ? tr("Bám đuổi", "Stalker", "跟跑型") : tr("Nước rút", "Closer", "後追型");
  const styleClass = (s: RunStyle) => s === "front" ? "bg-red-500/25 text-red-200" : s === "stalker" ? "bg-sky-500/25 text-sky-200" : "bg-violet-500/25 text-violet-200";
  const hot = (h: number) => (v?.form.last[h] ?? []).filter((p) => p === 1).length >= 2;
  const no = (h: number) => tr(`Số ${h + 1}`, `No. ${h + 1}`, `${h + 1} 號`);

  const callText = (c: RaceCall | null): string => {
    if (!c) return tr("Các chiến mã đang vào cổng xuất phát…", "The horses are heading to the starting gate…", "駿馬們正走向起跑閘門……");
    switch (c.kind) {
      case "off": return tr("Xuất phát! Các chiến mã lao ra khỏi cổng!", "And they're off!", "起跑了！駿馬們衝出閘門！");
      case "lead": return tr(`${no(c.horse)} ${name(c.horse)} vươn lên dẫn đầu!`, `${no(c.horse)} ${name(c.horse)} takes the lead!`, `${no(c.horse)}「${name(c.horse)}」衝上領先！`);
      case "neck": return tr(`${name(c.horse)} và ${name(c.other)} sát cánh nhau, không ai chịu ai!`, `${name(c.horse)} and ${name(c.other)}, neck and neck!`, `「${name(c.horse)}」和「${name(c.other)}」並駕齊驅，互不相讓！`);
      case "closer": return tr(`${name(c.horse)} đang tăng tốc từ phía sau!`, `${name(c.horse)} is charging from the back!`, `「${name(c.horse)}」從後方強勢追上來了！`);
      case "fade": return tr(`Ứng viên số một ${name(c.horse)} đang hụt hơi!`, `The favourite ${name(c.horse)} is fading!`, `大熱門「${name(c.horse)}」開始後繼無力！`);
      case "surge": return tr(`${no(c.horse)} ${name(c.horse)} đang vươn lên!`, `${no(c.horse)} ${name(c.horse)} is flying up the field!`, `${no(c.horse)}「${name(c.horse)}」正在急起直追！`);
      case "holds": return tr(`${no(c.horse)} ${name(c.horse)} vẫn đang dẫn đầu`, `${no(c.horse)} ${name(c.horse)} still in front`, `${no(c.horse)}「${name(c.horse)}」仍然領先`);
      case "chase": return tr(`${no(c.horse)} ${name(c.horse)} bám đuổi sát nút!`, `${no(c.horse)} ${name(c.horse)} right on their heels!`, `${no(c.horse)}「${name(c.horse)}」緊追不捨！`);
      case "sprint": return c.close
        ? tr("Nước rút! Sát nút quá!", "Final furlong, neck and neck!", "最後衝刺！難分難解！")
        : tr(`Nước rút! ${name(c.horse)} đang dẫn!`, `Into the final stretch, ${name(c.horse)} leads!`, `進入最後直線，「${name(c.horse)}」領先！`);
      case "won": {
        const o = v ? odds(v.odds.win[c.horse]) : "";
        return c.photo
          ? tr(`📸 Ảnh đích! ${no(c.horse)} ${name(c.horse)} thắng sát nút, tỷ lệ ${o}!`, `📸 Photo finish! ${no(c.horse)} ${name(c.horse)} gets up at ${o}!`, `📸 終點攝影！${no(c.horse)}「${name(c.horse)}」險勝，賠率 ${o}！`)
          : tr(`🏆 ${no(c.horse)} ${name(c.horse)} về nhất, tỷ lệ ${o}!`, `🏆 ${no(c.horse)} ${name(c.horse)} wins it at ${o}!`, `🏆 ${no(c.horse)}「${name(c.horse)}」奪冠，賠率 ${o}！`);
      }
    }
  };
  const callLine = callText(call);

  // Spoken commentary: each new line once, the important ones cut in
  const spoken = useRef("");
  useEffect(() => {
    if (!v || !call || shot.mode !== "live" || !voiceOn) return;
    const key = `${v.round}:${JSON.stringify(call)}`;
    if (spoken.current === key) return;
    spoken.current = key;
    try {
      const s = window.speechSynthesis;
      if (!s) return;
      const important = call.kind === "won" || call.kind === "off" || call.kind === "lead" || call.kind === "sprint";
      if (s.speaking && !important) return;
      s.cancel();
      const u = new SpeechSynthesisUtterance(callLine.replace(/[📸🏆]/gu, "").replace(/×/g, lang === "vi" ? "ăn " : lang === "zh" ? "" : "at "));
      u.lang = VOICE_LANG[lang];
      const voice = findVoice(lang);
      if (voice) u.voice = voice;
      u.rate = lang === "zh" ? 1.1 : 1.15;
      u.pitch = 1.05;
      s.speak(u);
    } catch { /* no voice: the line is on screen */ }
  }, [callLine, shot.mode, voiceOn, v, call, lang]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* */ } }, []);
  const toggleVoice = () => {
    const nv = !voiceOn;
    setVoicePref(nv);
    try { localStorage.setItem(VOICE_KEY, nv ? "on" : "off"); } catch { /* */ }
    if (!nv) try { window.speechSynthesis?.cancel(); } catch { /* */ }
  };

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
      if (shot.mode === "live") soundManager.cheer();
      if (myWin > 0 && done.current.win !== v.round) {
        done.current.win = v.round;
        soundManager.win(myWin >= staked * 5);
        coinBurst();
        if (myWin >= staked * 5) fireworks(2500, 1);
        navigator.vibrate?.([60, 40, 60, 40, 200]);
      }
    }
  }, [phase, sim, winnerIn, v, t, myWin, staked, shot.mode]);
  // Hooves while the field is running
  useEffect(() => {
    if (phase !== "race" || !sim) return;
    const last = Math.max(...sim.finish);
    const id = window.setInterval(() => {
      const tt = Date.now() + (offset.current ?? 0) - (vRef.current?.raceStart ?? 0);
      const s = raceShot(sim, tt);
      if (s.mode === "live" && s.d > 0 && s.d < last && !s.freeze) soundManager.hooves();
    }, 400);
    return () => clearInterval(id);
  }, [phase, sim]);
  // A new race: a fresh bet slip
  useEffect(() => { setSlip({}); setFcFirst(null); }, [v?.round]);

  // Cheers from everyone float up over the track
  const seenCheers = useRef(new Set<number>());
  const addFloat = useCallback((id: number, emoji: string, horse: number | null) => {
    if (seenCheers.current.has(id)) return;
    seenCheers.current.add(id);
    if (seenCheers.current.size > 500) seenCheers.current = new Set([...seenCheers.current].slice(-200));
    const at = horse != null ? trackApi.current?.horseAt(horse) : null;
    const x = at ? at.x + 6 : 30 + ((id * 97) % 300);
    const y = at ? at.y : 120 + ((id * 53) % 80);
    setFloats((f) => [...f.slice(-24), { id, emoji, x, y }]);
    window.setTimeout(() => setFloats((f) => f.filter((e) => e.id !== id)), 2300);
  }, []);
  useEffect(() => {
    if (!v) return;
    const n = serverNow();
    for (const c of v.cheers) if (c.at > n - 2500) addFloat(c.id, c.emoji, c.horse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.cheers, addFloat]);
  const cheer = useMutation({
    mutationFn: async (emoji: string) => (await apiRequest("POST", "/api/horse/cheer", { emoji, horse: myCheerHorse })).json(),
    onSuccess: (r: { cheer: { id: number; emoji: string; horse: number | null } }) => {
      addFloat(r.cheer.id, r.cheer.emoji, r.cheer.horse);
      navigator.vibrate?.(15);
    },
    onError: (e) => { if (!(e instanceof ApiError && e.status === 429)) toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" }); },
  });

  const place = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/horse/bet", {
      bets: Object.values(slip).filter((l) => l.amount > 0).map((l) => ({ type: l.type, horse: l.horse, ...(l.horse2 != null ? { horse2: l.horse2 } : {}), amount: l.amount })),
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
  const lines = Object.values(slip);
  const slipTotal = lines.reduce((a, b) => a + b.amount, 0);
  const room = HORSE_MAX_PER_RACE - staked;
  const open = phase === "betting" && v != null && now < v.raceStart - HORSE_CLOSE_EARLY_MS;
  const tooMuch = () => toast({ title: srv("At most 5,000,000 coins on one race"), variant: "destructive" });
  const tooPoor = () => toast({ title: srv("Not enough coins"), variant: "destructive" });
  const addChip = (type: HorseBetType, h: number, h2: number | null = null) => {
    if (!open || !v) return;
    const add = Math.floor(Math.min(chip, room - slipTotal, v.balance - slipTotal) / 1000) * 1000;
    if (add < 1000) return room - slipTotal < 1000 ? tooMuch() : tooPoor();
    const key = slipKey(type, h, h2);
    if (!slip[key] && lines.length >= HORSE_MAX_LINES) return toast({ title: srv("Too many bets"), variant: "destructive" });
    soundManager.betChange();
    setSlip((s) => ({ ...s, [key]: { type, horse: h, horse2: h2, amount: (s[key]?.amount ?? 0) + add } }));
  };
  const lastRoundBets = (() => {
    const r = v?.history[0]?.round;
    return r == null ? [] : v!.history.filter((b) => b.round === r);
  })();
  const repeatLast = () => {
    if (!v || !open || !lastRoundBets.length) return;
    const add = lastRoundBets.reduce((a, b) => a + b.amount, 0);
    if (slipTotal + add > room) return tooMuch();
    if (slipTotal + add > v.balance) return tooPoor();
    soundManager.betChange();
    setSlip((s) => {
      const next = { ...s };
      for (const b of lastRoundBets) {
        const key = slipKey(b.type, b.horse, b.horse2);
        next[key] = { type: b.type, horse: b.horse, horse2: b.horse2, amount: (next[key]?.amount ?? 0) + b.amount };
      }
      return next;
    });
  };
  const double = () => {
    if (!v || !open || !slipTotal) return;
    if (slipTotal * 2 > room) return tooMuch();
    if (slipTotal * 2 > v.balance) return tooPoor();
    soundManager.betChange();
    setSlip((s) => Object.fromEntries(Object.entries(s).map(([k, l]) => [k, { ...l, amount: l.amount * 2 }])));
  };
  const board = v ? HORSES.map((_, h) => h).sort((a, b) => v.odds.win[a] - v.odds.win[b] || a - b) : [];
  const placeOf = (h: number) => (winnerIn && sim ? sim.order.indexOf(h) : -1);
  const showPodium = sim != null && shot.mode === "after";
  const photoBanner = shot.freeze || (shot.mode === "live" && fin?.photo && shot.d >= fin.at && t < HORSE_REPLAY_AT);
  const prevRound = v ? v.history.filter((b) => b.round === v.round - 1) : [];
  const prevWin = prevRound.filter((b) => b.status === "won").reduce((a, b) => a + (b.payout ?? 0), 0);
  const bestPrev = prevRound.filter((b) => b.status === "won").sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0))[0];
  const betName = (b: { type: HorseBetType; horse: number; horse2: number | null }) => b.type === "forecast" && b.horse2 != null
    ? `${name(b.horse)} → ${name(b.horse2)}` : name(b.horse);
  const shareWhat = (amount: number, b?: { type: HorseBetType; horse: number; horse2: number | null; odds100: number }) => ({
    emoji: "🏇",
    title: tr("Thắng lớn Đua Ngựa", "Won at the horse races", "賽馬贏錢了"),
    amount,
    detail: b ? `${typeLabel(b.type)} · ${b.type === "forecast" && b.horse2 != null ? `${b.horse + 1}→${b.horse2 + 1}` : `#${b.horse + 1}`} ${betName(b)} · ${odds(b.odds100)}` : tr("Đua Ngựa", "Horse Racing", "賽馬"),
  });
  const bestNow = winnerIn && sim ? mine.filter((b) => horseBetWins(b.type, b.horse, b.horse2, sim.order)).sort((a, b) => horsePayout(b.amount, b.odds100) - horsePayout(a.amount, a.odds100))[0] : undefined;

  const statusPill = (b: HorseBetView) => b.status === "pending"
    ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black text-white/70">{tr("Chờ", "Pending", "等待中")}</span>
    : b.status === "won"
      ? <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black text-black">+{fmt(b.payout ?? 0)}</span>
      : <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-300">{tr("Thua", "Lost", "未中")}</span>;
  const typeTag = (type: HorseBetType) => (
    <span className={`shrink-0 rounded px-1 py-[1px] text-[9px] font-black leading-none ${type === "win" ? "bg-yellow-400 text-black" : type === "top2" ? "bg-sky-400 text-black" : type === "top3" ? "bg-emerald-400 text-black" : "bg-fuchsia-500 text-white"}`}>{typeChip(type)}</span>
  );

  const tabs: { id: HorseBetType; hint: string }[] = [
    { id: "win", hint: tr("Ngựa của bạn phải về nhất.", "Your horse has to win.", "你的馬必須跑第一。") },
    { id: "top2", hint: tr("Ngựa của bạn về nhất hoặc nhì.", "Your horse finishes 1st or 2nd.", "你的馬跑進前兩名。") },
    { id: "top3", hint: tr("Ngựa của bạn về trong top 3.", "Your horse finishes in the top 3.", "你的馬跑進前三名。") },
    { id: "forecast", hint: tr("Đoán đúng ngựa về nhất VÀ về nhì, đúng thứ tự. Tỷ lệ rất cao!", "Pick the 1st AND the 2nd, in that order. Big odds!", "猜中第一名和第二名，順序也要對。賠率超高！") },
  ];

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
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={toggleVoice} className="w-10 h-10 rounded-full bg-black/30 text-yellow-200 flex items-center justify-center"
                aria-label={voiceOn ? tr("Tắt bình luận viên", "Mute the commentator", "關閉賽事旁白") : tr("Nghe bình luận viên", "Hear the commentator", "開啟賽事旁白")} data-testid="horse-voice">
                {voiceOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              {v && (
                <div className={`rounded-2xl px-3 py-1 text-center min-w-[4.5rem] ${phase === "betting" ? "bg-black/35" : phase === "race" ? "bg-red-600" : "bg-yellow-400 text-black"}`} data-testid="horse-countdown">
                  <div className={`text-[9px] font-black uppercase tracking-wider ${phase === "results" ? "text-black/70" : "text-white/70"}`}>
                    {phase === "betting" ? tr("Xuất phát sau", "Off in", "距離起跑") : phase === "race" ? tr("Đang đua", "Racing", "比賽中") : tr("Cuộc mới sau", "Next race", "下一場")}
                  </div>
                  <div className={`font-mono font-black text-2xl leading-none ${phase === "results" ? "text-black" : "text-white"}`}>
                    {phase === "betting" ? `${secs(v.raceStart - now)}s` : phase === "race" ? "LIVE" : `${secs(v.end - now)}s`}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative mt-2">
            {!v ? <div className="h-[244px] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-yellow-300" /></div> : (
              <>
                <RaceTrack sim={sim} getT={getT} mine={mineHorses} apiRef={trackApi} />
                {/* Cheers */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" data-testid="horse-cheers">
                  <AnimatePresence>
                    {floats.map((f) => (
                      <motion.div key={f.id} initial={{ opacity: 0, x: f.x, y: f.y, scale: 0.4 }} animate={{ opacity: [0, 1, 1, 0], y: f.y - 90, scale: [0.4, 1.3, 1.1, 1] }}
                        transition={{ duration: 2.2, ease: "easeOut" }} exit={{ opacity: 0 }}
                        className="absolute left-0 top-0 text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">{f.emoji}</motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <AnimatePresence>
                  {phase === "betting" && v && (
                    <motion.div key="gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute left-1/2 -translate-x-1/2 bottom-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-black text-yellow-200 whitespace-nowrap">
                      🚩 {tr(`Vào cổng · xuất phát sau ${secs(v.raceStart - now)} giây`, `At the gate · off in ${secs(v.raceStart - now)}s`, `進入閘門 · ${secs(v.raceStart - now)} 秒後起跑`)}
                    </motion.div>
                  )}
                  {shot.mode === "live" && shot.zoom > 0.5 && !photoBanner && (
                    <motion.div key="slow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute left-2 top-14 rounded-md bg-red-600/90 px-2 py-0.5 text-[10px] font-black text-white tracking-wider">
                      ● {tr("CHẬM", "SLOW-MO", "慢動作")}
                    </motion.div>
                  )}
                  {photoBanner && (
                    <motion.div key="photo" initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-x-10 bottom-3 rounded-xl bg-white text-black text-center font-black py-1.5 shadow-[0_0_40px_rgba(255,255,255,0.9)]" data-testid="horse-photo">
                      📸 {tr("ẢNH ĐÍCH! Sát nút!", "PHOTO FINISH!", "終點攝影！")}
                    </motion.div>
                  )}
                  {shot.mode === "replay" && (
                    <motion.div key="replay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute left-2 top-14 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-black text-white tracking-wider" data-testid="horse-replay">
                      ⟲ {tr("XEM LẠI", "REPLAY", "重播")}
                    </motion.div>
                  )}
                  {showPodium && sim && (
                    <motion.div key="podium" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 rounded-2xl bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-end pb-3" data-testid="horse-podium">
                      {myWin > 0 ? (
                        <motion.div initial={{ scale: 0.4 }} animate={{ scale: [0.4, 1.15, 1] }} transition={{ duration: 0.6 }}
                          className="mb-auto mt-2 text-center flex flex-col items-center" data-testid="horse-my-win">
                          <div className="text-xs font-black uppercase tracking-widest text-yellow-200">{tr("Bạn thắng", "You won", "你贏了")}</div>
                          <div className="font-mono font-black text-3xl text-yellow-300 drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">🪙 +{fmt(myWin)}</div>
                          <ShareButton what={shareWhat(myWin, bestNow)} className="mt-1 px-3 py-1 text-xs pointer-events-auto" />
                        </motion.div>
                      ) : staked > 0 ? (
                        <div className="mb-auto mt-4 text-sm font-bold text-white/80">{tr("Lần này chưa trúng. Cuộc sau nhé!", "Not this time. Next race!", "這次沒中，下一場加油！")}</div>
                      ) : <div className="mb-auto" />}
                      <div className="flex items-end gap-2">
                        {[1, 0, 2].map((pl) => {
                          const h = sim.order[pl];
                          return (
                            <div key={pl} className="flex flex-col items-center w-[6.2rem]">
                              <div className="text-2xl leading-none">{["🥇", "🥈", "🥉"][pl]}</div>
                              <div className="flex items-center gap-1 mt-0.5 max-w-full"><Badge horse={h} size={18} /><span className="truncate text-[11px] font-black text-white">{name(h)}</span></div>
                              <div className={`mt-1 w-full rounded-t-lg flex items-start justify-center pt-1 font-black text-sm ${pl === 0 ? "h-12 bg-gradient-to-b from-yellow-300 to-amber-500 text-black" : pl === 1 ? "h-9 bg-gradient-to-b from-slate-200 to-slate-400 text-black" : "h-6 bg-gradient-to-b from-orange-300 to-orange-600 text-black"}`}>
                                {pl === 0 ? odds(v.odds.win[h]) : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1 text-[10px] font-bold text-white/70">
                        {tr("Nhất–Nhì", "Forecast", "二重彩")} {sim.order[0] + 1}→{sim.order[1] + 1} · {odds(v.odds.forecast[sim.order[0]][sim.order[1]])}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>

          {/* Who's where, the commentator, and the cheers */}
          {v && (
            <>
              <div className="mt-2 flex items-center gap-1" data-testid="horse-ticker">
                {standings.map((h, pl) => (
                  <motion.div key={h} layout transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    className={`flex-1 flex flex-col items-center rounded-lg py-0.5 ${mine.some((b) => b.horse === h || b.horse2 === h) ? "bg-yellow-400/20 ring-1 ring-yellow-300" : "bg-black/25"}`}>
                    <span className="text-[8px] font-black text-white/50 leading-none">{pl + 1}</span>
                    <Badge horse={h} size={20} />
                  </motion.div>
                ))}
              </div>
              <div className="mt-2 rounded-xl bg-black/35 px-3 py-2 min-h-[2.75rem] flex items-center justify-center overflow-hidden" data-testid="horse-commentary">
                <motion.div key={callLine} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="text-sm font-bold text-yellow-100 text-center">
                  🎙️ {callLine}
                </motion.div>
              </div>
              {phase !== "betting" && (
                <div className="mt-2 flex items-center gap-2" data-testid="horse-cheer-bar">
                  <span className="text-[10px] font-black text-white/60 shrink-0 w-14 leading-tight">{tr("Cổ vũ", "Cheer", "加油")}{myCheerHorse != null ? <><br />{no(myCheerHorse)}</> : null}</span>
                  {HORSE_CHEERS.map((e) => (
                    <button key={e} type="button" onClick={() => cheer.mutate(e)} data-testid={`horse-cheer-${e}`}
                      className="flex-1 h-11 rounded-2xl bg-white/10 border border-white/15 text-2xl active:scale-90 transition-transform">{e}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Today's biggest wins */}
        {v && v.bigWins.length > 0 && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10" data-testid="horse-bigwins">
            <div className="text-[11px] font-black uppercase text-white/50 mb-2">🏆 {tr("Thắng lớn hôm nay", "Today's biggest wins", "今日最大獎")}</div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {v.bigWins.map((w, i) => (
                <div key={i} className={`shrink-0 flex items-center gap-2 rounded-2xl pl-1.5 pr-3 py-1.5 ${i === 0 ? "bg-yellow-400/15 ring-1 ring-yellow-400/50" : "bg-black/25"}`}>
                  <Avatar user={w} size={30} />
                  <div className="leading-tight">
                    <div className="text-[11px] font-black text-white max-w-[6.5rem] truncate">{w.username}</div>
                    <div className="text-[12px] font-black text-yellow-300">+{fmt(w.payout)}</div>
                    <div className="flex items-center gap-1 text-[9px] text-white/60">{typeTag(w.type)}{w.type === "forecast" && w.horse2 != null ? `${w.horse + 1}→${w.horse2 + 1}` : `#${w.horse + 1}`} {odds(w.odds100)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Odds board and betting */}
        {v && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10 flex flex-col gap-2" data-testid="horse-board">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-yellow-300">{tr("Bảng tỷ lệ", "Odds board", "賠率表")}</div>
              <div className="text-[10px] text-white/50">{tr("Cửa trên → cửa dưới", "Favourite → long shot", "熱門 → 冷門")}</div>
            </div>
            <div className="grid grid-cols-4 gap-1 rounded-2xl bg-black/30 p-1" role="tablist" data-testid="horse-tabs">
              {tabs.map((x) => (
                <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => { setTab(x.id); setFcFirst(null); }} data-testid={`horse-tab-${x.id}`}
                  className={`h-10 rounded-xl text-[12px] font-black transition-colors ${tab === x.id ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow" : "text-white/70"}`}>
                  {typeLabel(x.id)}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-white/65 px-1 -mt-0.5">{tabs.find((x) => x.id === tab)!.hint}</div>
            {tab === "forecast" && (
              <div className={`rounded-xl px-3 py-2 text-xs font-black flex items-center gap-2 ${fcFirst == null ? "bg-fuchsia-500/15 text-fuchsia-100" : "bg-yellow-400/15 text-yellow-100"}`} data-testid="horse-forecast-hint">
                {fcFirst == null ? <>① {tr("Chạm chọn ngựa về NHẤT", "Tap the horse to finish 1st", "點選第 1 名的馬")}</> : (
                  <>
                    <span>🥇</span><Badge horse={fcFirst} size={20} /><span className="truncate">{name(fcFirst)}</span>
                    <span className="ml-auto shrink-0">② {tr("chọn ngựa về NHÌ", "now tap 2nd", "再選第 2 名")}</span>
                    <button type="button" onClick={() => setFcFirst(null)} className="shrink-0 w-6 h-6 rounded-full bg-black/30 flex items-center justify-center" aria-label={tr("Bỏ chọn", "Clear", "取消")}><X className="w-3.5 h-3.5" /></button>
                  </>
                )}
              </div>
            )}
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
                const isFirst = tab === "forecast" && fcFirst === h;
                const pairOdds = tab === "forecast" && fcFirst != null && !isFirst ? v.odds.forecast[fcFirst][h] : 0;
                const o = tab === "forecast" ? pairOdds : horseBetOdds(v.odds, tab, h);
                const key = tab === "forecast" ? (fcFirst != null && !isFirst ? slipKey("forecast", fcFirst, h) : "") : slipKey(tab, h, null);
                const onSlip = key ? slip[key]?.amount ?? 0 : 0;
                const onIt = mine.filter((b) => b.type === tab && (tab === "forecast" ? b.horse === fcFirst && b.horse2 === h : b.horse === h)).reduce((a, b) => a + b.amount, 0);
                const pl = placeOf(h);
                const backers = v.backers[h] ?? [];
                const tap = () => {
                  if (!open) return;
                  if (tab !== "forecast") return addChip(tab, h);
                  if (fcFirst == null || isFirst) { soundManager.betChange(); setFcFirst(isFirst ? null : h); return; }
                  addChip("forecast", fcFirst, h);
                };
                return (
                  <button key={h} type="button" disabled={!open} onClick={tap} data-testid={`horse-pick-${h + 1}`}
                    className={`w-full min-h-[56px] flex items-center gap-2 rounded-2xl px-2 py-1.5 text-left border transition-colors ${pl === 0 ? "bg-yellow-400/25 border-yellow-300" : isFirst ? "bg-fuchsia-500/20 border-fuchsia-300" : onSlip ? "bg-yellow-400/10 border-yellow-400/60" : "bg-black/25 border-white/10"} ${open ? "active:scale-[0.99] hover:bg-white/10" : ""}`}>
                    <div className="relative shrink-0">
                      <Badge horse={h} size={30} />
                      {pl >= 0 && pl < 3 && <span className="absolute -top-2 -right-2 text-sm">{["🥇", "🥈", "🥉"][pl]}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-sm font-black text-white truncate">{name(h)}</span>
                        <span className={`shrink-0 rounded px-1 text-[9px] font-black leading-[14px] ${styleClass(HORSES[h].style)}`}>{styleLabel(HORSES[h].style)}</span>
                        {hot(h) && <span className="shrink-0 rounded bg-orange-500/30 px-1 text-[9px] font-black leading-[14px] text-orange-200" data-testid={`horse-hot-${h + 1}`}>🔥 {tr("Hot", "Hot", "火熱")}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        <FormChips places={v.form.last[h] ?? []} />
                        {backers.length > 0 && (
                          <span className="inline-flex items-center shrink-0" data-testid={`horse-backers-${h + 1}`}>
                            {backers.map((u, i) => <span key={u.username} className={i ? "-ml-1.5" : ""}><Avatar user={u} size={16} /></span>)}
                            {pool.players > backers.length && <span className="ml-0.5 text-[9px] font-black text-white/60">+{pool.players - backers.length}</span>}
                          </span>
                        )}
                        {pool.amount > 0 && <span className="text-[9px] text-white/45 truncate">{short(pool.amount)}</span>}
                      </div>
                    </div>
                    {(onSlip || onIt) ? (
                      <div className="text-right leading-tight shrink-0">
                        {onIt > 0 && <div className="text-[10px] font-black text-emerald-300">✓ {short(onIt)}</div>}
                        {onSlip > 0 && <div className="text-[11px] font-black text-yellow-300">+{short(onSlip)}</div>}
                      </div>
                    ) : null}
                    <div className="w-[4.4rem] shrink-0 text-right">
                      {tab === "forecast" && (fcFirst == null || isFirst) ? (
                        <span className={`inline-block rounded-lg px-1.5 py-1 text-[10px] font-black ${isFirst ? "bg-fuchsia-400 text-black" : "bg-white/10 text-white/70"}`}>{isFirst ? tr("🥇 NHẤT", "🥇 1st", "🥇 第一") : tr("Chọn nhất", "Pick 1st", "選第一")}</span>
                      ) : (
                        <span className={`font-mono font-black text-yellow-300 ${o >= 10000 ? "text-sm" : "text-base"}`} data-testid={`horse-odds-${h + 1}`}>{odds(o)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* The slip */}
            {lines.length > 0 && (
              <div className="rounded-2xl bg-black/30 border border-yellow-400/30 p-2 flex flex-col gap-1" data-testid="horse-slip">
                {lines.map((l) => {
                  const k = slipKey(l.type, l.horse, l.horse2);
                  const o = horseBetOdds(v.odds, l.type, l.horse, l.horse2);
                  return (
                    <div key={k} className="flex items-center gap-1.5 text-xs">
                      {typeTag(l.type)}
                      <Badge horse={l.horse} size={18} />
                      {l.horse2 != null && <><span className="text-white/50">→</span><Badge horse={l.horse2} size={18} /></>}
                      <span className="font-mono font-black text-yellow-300">{odds(o)}</span>
                      <span className="ml-auto font-black text-white">{fmt(l.amount)}</span>
                      <span className="text-[10px] text-emerald-300 w-[4.6rem] text-right truncate">→ {short(horsePayout(l.amount, o))}</span>
                      <button type="button" onClick={() => setSlip((s) => { const n = { ...s }; delete n[k]; return n; })} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0" aria-label={tr("Xoá", "Remove", "移除")}><X className="w-3 h-3" /></button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Running total vs the cap */}
            <div data-testid="horse-cap">
              <div className="flex justify-between text-[10px] font-bold text-white/60 mb-0.5">
                <span>{tr(`Cuộc này: ${fmt(staked)} đã cược${slipTotal ? ` + ${fmt(slipTotal)}` : ""}`, `This race: ${fmt(staked)} placed${slipTotal ? ` + ${fmt(slipTotal)}` : ""}`, `本場：已下注 ${fmt(staked)}${slipTotal ? ` + ${fmt(slipTotal)}` : ""}`)}</span>
                <span>{tr("tối đa", "max", "上限")} {short(HORSE_MAX_PER_RACE)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden flex">
                <div className="h-full bg-emerald-400" style={{ width: `${(staked / HORSE_MAX_PER_RACE) * 100}%` }} />
                <div className="h-full bg-yellow-400" style={{ width: `${(slipTotal / HORSE_MAX_PER_RACE) * 100}%` }} />
              </div>
            </div>

            {open ? (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={repeatLast} disabled={!lastRoundBets.length} data-testid="horse-repeat"
                    className="h-10 rounded-xl bg-white/10 text-white text-[11px] font-black flex items-center justify-center gap-1 disabled:opacity-35">
                    <Repeat className="w-3.5 h-3.5" />{tr("Cược lại", "Repeat last", "重複上次")}
                  </button>
                  <button type="button" onClick={double} disabled={!slipTotal} data-testid="horse-double"
                    className="h-10 rounded-xl bg-white/10 text-white text-[13px] font-black disabled:opacity-35">×2</button>
                  <button type="button" onClick={() => setSlip({})} disabled={slipTotal === 0} data-testid="horse-clear"
                    className="h-10 rounded-xl bg-white/10 text-white/80 text-[11px] font-black flex items-center justify-center gap-1 disabled:opacity-35">
                    <Trash2 className="w-3.5 h-3.5" />{tr("Xoá", "Clear", "清除")}
                  </button>
                </div>
                <button type="button" disabled={slipTotal === 0 || place.isPending} onClick={() => place.mutate()}
                  className="w-full h-12 rounded-2xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-base disabled:opacity-50" data-testid="horse-place">
                  {place.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    : slipTotal > 0 ? tr(`Đặt ${lines.length} cược · ${fmt(slipTotal)} xu`, `Place ${lines.length} bet${lines.length > 1 ? "s" : ""} · ${fmt(slipTotal)} coins`, `下注 ${lines.length} 注 · ${fmt(slipTotal)} 金幣`)
                      : tab === "forecast" ? tr("Chọn nhất rồi chọn nhì", "Pick 1st, then 2nd", "先選第一，再選第二")
                        : tr("Chạm vào ngựa để đặt phỉnh", "Tap a horse to add a chip", "點選馬匹放上籌碼")}
                </button>
              </>
            ) : (
              <div className="text-center text-xs text-white/60 py-1">
                {phase === "betting" ? tr("Đã khoá cược, sắp xuất phát!", "Betting closed, they're about to go!", "已停止下注，即將起跑！")
                  : tr("Cược cho cuộc đua sau sẽ mở ngay khi cuộc này kết thúc.", "Betting on the next race opens when this one ends.", "本場結束後即開放下一場下注。")}
              </div>
            )}
          </section>
        )}

        {/* Your bets */}
        {v && (mine.length > 0 || v.history.length > 0) && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10" data-testid="horse-mybets">
            {prevWin > 0 && phase === "betting" && (
              <div className="mb-2 rounded-2xl bg-gradient-to-r from-yellow-400/25 to-orange-500/20 border border-yellow-300/50 p-2 flex items-center gap-2" data-testid="horse-last-win">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black uppercase text-yellow-200">{tr(`Cuộc #${v.round - 1}`, `Race #${v.round - 1}`, `第 ${v.round - 1} 場`)}</div>
                  <div className="font-black text-yellow-300 text-lg leading-none">🏆 +{fmt(prevWin)}</div>
                </div>
                <ShareButton what={shareWhat(prevWin, bestPrev)} className="px-3 py-2 text-xs" />
              </div>
            )}
            <div className="text-[11px] font-black uppercase text-white/50 mb-1">{tr("Cược của bạn", "Your bets", "我的下注")}</div>
            {[...mine].reverse().concat(v.history).slice(0, 14).map((b) => (
              <div key={b.id} className="flex items-center gap-1.5 text-xs py-1.5 border-t border-white/5 first:border-0">
                <span className="text-white/40 w-11 shrink-0">#{b.round}</span>
                {typeTag(b.type)}
                <Badge horse={b.horse} size={18} />
                {b.horse2 != null && <><span className="text-white/40">→</span><Badge horse={b.horse2} size={18} /></>}
                <span className="flex-1 min-w-0 truncate font-bold text-white">{b.horse2 == null && name(b.horse)} <span className="text-white/40 font-normal">{odds(b.odds100)}</span></span>
                <span className="text-white/70">{short(b.amount)}</span>
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
                  <span className="text-[9px] font-black text-yellow-200 mt-0.5">{odds(w.odds100)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* The stable: style, bio and form */}
        {v && (
          <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10" data-testid="horse-stable">
            <button type="button" onClick={() => setStableOpen((o) => !o)} className="w-full flex items-center justify-between" data-testid="horse-stable-toggle">
              <span className="text-sm font-black text-yellow-300">🐎 {tr("Hồ sơ chiến mã", "Meet the horses", "馬匹檔案")}</span>
              <ChevronDown className={`w-5 h-5 text-white/60 transition-transform ${stableOpen ? "rotate-180" : ""}`} />
            </button>
            {stableOpen && (
              <div className="mt-2 flex flex-col gap-1.5">
                {HORSES.map((info, h) => (
                  <div key={h} className="rounded-2xl bg-black/25 p-2 flex gap-2">
                    <Badge horse={h} size={30} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-sm font-black text-white">{name(h)}</span>
                        <span className={`rounded px-1 text-[9px] font-black leading-[14px] ${styleClass(info.style)}`}>{styleLabel(info.style)}</span>
                        {hot(h) && <span className="rounded bg-orange-500/30 px-1 text-[9px] font-black leading-[14px] text-orange-200">🔥 {tr("Hot", "Hot", "火熱")}</span>}
                      </div>
                      <div className="text-[11px] text-white/65 leading-snug mt-0.5">{loc(info.bio)}</div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-white/55">
                        <span>{tr("5 cuộc gần nhất", "Last 5", "近 5 場")}</span><FormChips places={v.form.last[h] ?? []} />
                        <span className="ml-auto">🏆 {tr(`${v.form.winsToday[h]} lần nhất hôm nay`, `${v.form.winsToday[h]} win${v.form.winsToday[h] === 1 ? "" : "s"} today`, `今日 ${v.form.winsToday[h]} 勝`)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-white/45 mt-2 leading-relaxed">
              {tr("Mỗi cuộc đua là độc lập. Phong độ chỉ để xem cho vui, không giúp đoán kết quả: cơ hội thật của mỗi ngựa nằm ở tỷ lệ cược của cuộc đó.",
                "Every race is independent. Form is just for fun and doesn't predict anything: each horse's true chance is in that race's odds.",
                "每場比賽都是獨立的。近期戰績僅供娛樂，無法預測結果：每匹馬真正的機率就反映在該場的賠率上。")}
            </p>
          </section>
        )}

        {/* How it works */}
        <section className="rounded-3xl p-3 bg-white/[0.04] border border-white/10" data-testid="horse-rules">
          <div className="text-sm font-black text-yellow-300">{tr("Cách chơi", "How it works", "玩法說明")}</div>
          <p className="text-[11px] text-white/60 mt-1 leading-relaxed">
            {tr(`Mỗi phút một cuộc đua: ${HORSE_BET_MS / 1000} giây đặt cược, ${HORSE_RACE_MS / 1000} giây đua (có xem lại đoạn về đích), ${HORSE_RESULT_MS / 1000} giây trao giải. Tối đa ${fmt(HORSE_MAX_PER_RACE)} xu mỗi cuộc. Tiền thắng = tiền cược × tỷ lệ (đã gồm tiền gốc), tỷ lệ được chốt lúc bạn đặt.`,
              `A race every minute: ${HORSE_BET_MS / 1000}s to bet, a ${HORSE_RACE_MS / 1000}s race (with a replay of the finish), ${HORSE_RESULT_MS / 1000}s of results. Up to ${fmt(HORSE_MAX_PER_RACE)} coins a race. A winning bet pays your bet × its odds (stake included), locked in when you bet.`,
              `每分鐘一場比賽：${HORSE_BET_MS / 1000} 秒下注、${HORSE_RACE_MS / 1000} 秒比賽（含終點重播）、${HORSE_RESULT_MS / 1000} 秒頒獎。每場最多 ${fmt(HORSE_MAX_PER_RACE)} 金幣。中獎派彩 = 押注 × 賠率（含本金），賠率在下注時鎖定。`)}
          </p>
          <ul className="text-[11px] text-white/60 mt-1.5 leading-relaxed flex flex-col gap-1">
            <li>{typeTag("win")} {tr("Ngựa bạn chọn về nhất.", "Your horse wins.", "你選的馬跑第一。")}</li>
            <li>{typeTag("top2")} {tr("Ngựa bạn chọn về nhất hoặc nhì.", "Your horse finishes 1st or 2nd.", "你選的馬跑進前兩名。")}</li>
            <li>{typeTag("top3")} {tr("Ngựa bạn chọn về trong ba ngựa đầu.", "Your horse finishes in the first three.", "你選的馬跑進前三名。")}</li>
            <li>{typeTag("forecast")} {tr("Đoán đúng cả ngựa về nhất và ngựa về nhì, đúng thứ tự.", "Name the 1st and the 2nd, in the right order.", "同時猜中第一名和第二名，且順序正確。")}</li>
          </ul>
          <p className="text-[11px] text-white/60 mt-1.5 leading-relaxed">
            {tr(`Mỗi cuộc, ${HORSES.length} ngựa được chia ngẫu nhiên các cơ hội về nhất ${HORSE_CHANCES.map((c) => `${pct(c / 10000)}%`).join(", ")}. Máy chủ bốc thứ tự về đích trước khi xuất phát: ngựa về nhất theo đúng các cơ hội đó, rồi ngựa về nhì bốc từ các ngựa còn lại theo cơ hội của chúng, cứ thế tiếp. Từ đó tính chính xác cơ hội của từng cửa cược, và tỷ lệ = 0,95 ÷ cơ hội, làm tròn xuống 2 chữ số. Vì vậy mọi cửa cược đều hoàn trả từ ${pct(HORSE_RTP_MIN, 2)}% đến ${pct(HORSE_RTP_MAX, 2)}%, tính chính xác. Ai cũng xem cùng một cuộc đua.`,
              `Each race the ${HORSES.length} horses are randomly given win chances of ${HORSE_CHANCES.map((c) => `${pct(c / 10000)}%`).join(", ")}. The server draws the finishing order before the off: the winner by those chances, then second from the rest by their chances, and so on. That gives the exact chance of every bet, and odds = 0.95 ÷ chance, rounded down to two decimals. So every bet returns between ${pct(HORSE_RTP_MIN, 2)}% and ${pct(HORSE_RTP_MAX, 2)}%, worked out exactly. Everyone watches the same race.`,
              `每場 ${HORSES.length} 匹馬會隨機分配 ${HORSE_CHANCES.map((c) => `${pct(c / 10000)}%`).join("、")} 的勝率。伺服器在起跑前抽出名次：冠軍依這些勝率抽出，亞軍再從其餘馬匹依各自勝率抽出，依此類推。由此可精確算出每種押注的機率，賠率 = 0.95 ÷ 機率，無條件捨去到小數第二位。因此每一注的返還率都介於 ${pct(HORSE_RTP_MIN, 2)}% 至 ${pct(HORSE_RTP_MAX, 2)}%，經過精確計算。所有人看到的是同一場比賽。`)}
          </p>
          <p className="text-[11px] text-white/60 mt-1.5 leading-relaxed">
            {tr("Mỗi cuộc đua độc lập với các cuộc trước. Kiểu chạy (chạy đầu, bám đuổi, nước rút) chỉ thay đổi dáng chạy trên màn hình, không thay đổi cơ hội thắng. Phong độ và 🔥 chỉ để xem cho vui.",
              "Each race is independent of the ones before. A horse's running style (front-runner, stalker, closer) only changes how it runs on screen, not its chance. Form and 🔥 are just for fun.",
              "每場比賽都與之前的比賽無關。跑法（領跑型、跟跑型、後追型）只會改變牠在畫面上的跑姿，不會改變勝率。近期戰績和 🔥 僅供娛樂。")}
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
