import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Redirect, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Eye, Flag, Loader2, Plus, RotateCcw, UserPlus, Users, Wifi, WifiOff, X } from "lucide-react";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { Pitch, type PitchPlay } from "@/components/football/Pitch";
import { KitPicker, Scoreboard, InviteSheet, Ladder, KitBadge } from "@/components/football/Bits";
import { useAuth, ME_KEY } from "@/hooks/use-auth";
import { useGameState, STATE_KEY } from "@/hooks/use-game";
import { useFootballSocket } from "@/hooks/use-football-socket";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import {
  CHOOSE_MS, FOOTBALL_EMOTES, FOOTBALL_STAKES, FOOTBALL_DAILY_WIN, KITS, kitOf, shooterOf, shootoutWinner, inSuddenDeath, tally,
  type FootballServerMsg, type FootballTable, type KickResult, type Level, type Outcome, type ShotChoice, type Shootout, type Side, type Zone,
} from "@shared/football";

const fmtStake = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}K` : String(n));
const KIT_KEY = "football.kit";
const KEEP_MS = 7_000; // practice: time to pick a dive

function loadKit() {
  try { const k = localStorage.getItem(KIT_KEY); if (k && KITS.some((x) => x.id === k)) return k; } catch { /* ignore */ }
  return "vn";
}

function useLabels() {
  const { tr } = useLang();
  return {
    goal: tr("VÀOOOO!", "GOOOOAL!", "進球啦！"),
    save: tr("CẢN PHÁ!", "SAVED!", "撲出！"),
    post: tr("DỘI CỘT!", "POST!", "中柱！"),
    bar: tr("DỘI XÀ!", "CROSSBAR!", "中橫樑！"),
    wide: tr("RA NGOÀI!", "WIDE!", "偏出！"),
    over: tr("VỌT XÀ!", "OVER!", "高出！"),
    replay: tr("QUAY CHẬM", "SLOW-MO REPLAY", "慢動作重播"),
    swipe: tr("Vuốt quả bóng về phía khung thành", "Flick the ball towards the goal", "朝球門滑動足球"),
    tapZone: tr("Chạm một ô để đổ người", "Tap a zone to dive", "點一個區域撲救"),
  } satisfies Record<Outcome, string> & { replay: string; swipe: string; tapZone: string };
}

export default function Football() {
  const { user, isLoading } = useAuth();
  const { tr } = useLang();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const tableCode = params.get("table")?.toUpperCase() ?? null;
  const practice = params.get("practice");
  const [kit, setKitState] = useState(loadKit);
  const setKit = (k: string) => { setKitState(k); try { localStorage.setItem(KIT_KEY, k); } catch { /* ignore */ } };
  const [rev, setRev] = useState(0);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <Redirect to={`/auth${tableCode ? `?next=${encodeURIComponent(`/da-bong?table=${tableCode}`)}` : ""}`} />;
  const inGame = !!tableCode || !!practice;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#0b2a17] to-[#0a0515] flex flex-col">
      <Header />
      <main className={`flex-1 flex flex-col items-center relative z-10 ${inGame ? "gap-1.5 px-2 py-2" : "gap-3 px-3 py-3"}`}>
        {!inGame && (
          <div className="text-center">
            <h1 className="font-display text-3xl sm:text-5xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="text-football-title">{tr("Sút Phạt Đền", "Penalty Kings", "點球大戰")}</h1>
            <p className="text-[11px] sm:text-xs font-black tracking-[0.3em] text-yellow-500/80 uppercase mt-1">⚽ {tr("Vuốt để sút · đổ người để cản", "Flick to shoot · dive to save", "滑動射門 · 撲救守門")} ⚽</p>
          </div>
        )}
        {!inGame && <GameTabs />}
        {practice ? (
          <PracticeMatch key={practice + rev} level={(["easy", "medium", "hard"].includes(practice) ? practice : "medium") as Level} kit={kit} name={user.username} onExit={() => setLocation("/da-bong")} onAgain={() => setRev((r) => r + 1)} />
        ) : tableCode ? (
          <OnlineMatch key={`${tableCode}-${rev}`} code={tableCode} kit={kit} userId={user.id} onExit={() => setLocation("/da-bong")} onJoined={() => setRev((r) => r + 1)} onGo={(c) => setLocation(`/da-bong?table=${c}`)} />
        ) : (
          <FootballLobby kit={kit} setKit={setKit} onOpen={(c) => setLocation(`/da-bong?table=${c}`)} onPractice={(l) => setLocation(`/da-bong?practice=${l}`)} />
        )}
      </main>
    </div>
  );
}

// ---------------- Lobby ----------------

function FootballLobby({ kit, setKit, onOpen, onPractice }: { kit: string; setKit: (k: string) => void; onOpen: (c: string) => void; onPractice: (l: Level) => void }) {
  const { tr, srv, t } = useLang();
  const { toast } = useToast();
  const { data: state } = useGameState(true);
  const search = useSearch();
  const [, setLocation] = useLocation();
  const tab = new URLSearchParams(search).get("tab") === "ladder" ? "ladder" : "play";
  const [stake, setStake] = useState(0);
  const [level, setLevel] = useState<Level>("medium");
  const tables = useQuery<{ open: FootballTable[]; live: FootballTable[]; mine: string | null; stakes: number[] }>({ queryKey: ["/api/football/tables"], refetchInterval: 3000, enabled: tab === "play" });
  const ladder = useQuery<{ todayBonusTaken: boolean }>({ queryKey: ["/api/football/ladder"] });
  const after = () => { queryClient.invalidateQueries({ queryKey: STATE_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); };
  const insufficient = (e: Error) => toast({ title: /balance/i.test(e.message) ? t.insufficientBalanceDesc : srv(e.message), variant: "destructive" });
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/football/tables", { stake, kit })).json() as Promise<{ code: string }>,
    onSuccess: (r) => { after(); onOpen(r.code); },
    onError: insufficient,
  });
  const join = useMutation({
    mutationFn: async (code: string) => (await apiRequest("POST", `/api/football/tables/${code}/join`, { kit })).json() as Promise<{ code: string }>,
    onSuccess: (r) => { after(); onOpen(r.code); },
    onError: (e: Error) => { insufficient(e); tables.refetch(); },
  });
  const stakes = tables.data?.stakes ?? FOOTBALL_STAKES;
  const balance = state?.balance ?? 0;
  const mine = tables.data?.mine;
  const levels: { id: Level; label: string; icon: string }[] = [
    { id: "easy", label: tr("Dễ", "Easy", "簡單"), icon: "🙂" },
    { id: "medium", label: tr("Vừa", "Medium", "普通"), icon: "😤" },
    { id: "hard", label: tr("Khó", "Hard", "困難"), icon: "🔥" },
  ];

  const tabs = (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/40 border border-white/10">
      {(["play", "ladder"] as const).map((x) => (
        <button key={x} type="button" onClick={() => setLocation(x === "ladder" ? "/da-bong?tab=ladder" : "/da-bong")}
          className={`py-2 rounded-xl text-sm font-black transition ${tab === x ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black" : "text-white/70"}`} data-testid={`football-tab-${x}`}>
          {x === "play" ? `⚽ ${tr("Chơi", "Play", "對戰")}` : `👑 ${tr("Vua Phạt Đền", "Penalty King", "點球之王")}`}
        </button>
      ))}
    </div>
  );
  if (tab === "ladder") return <div className="w-full max-w-md flex flex-col gap-3">{tabs}<Ladder /></div>;

  return (
    <div className="w-full max-w-md flex flex-col gap-3" data-testid="football-lobby">
      {tabs}
      <KitPicker value={kit} onChange={setKit} />
      {mine && (
        <button type="button" onClick={() => onOpen(mine)} className="w-full rounded-2xl py-3 font-black text-black bg-gradient-to-r from-yellow-300 to-orange-500" data-testid="button-football-back">{tr("Quay lại bàn của bạn", "Back to your table", "回到你的球桌")} ({mine})</button>
      )}

      {/* Practice against the computer */}
      <div className="rounded-3xl p-3.5 bg-gradient-to-r from-emerald-700/90 to-emerald-950 border border-emerald-400/40">
        <div className="flex items-center gap-3">
          <Bot className="w-9 h-9 text-emerald-200 shrink-0" />
          <div className="min-w-0">
            <p className="font-black text-white text-lg leading-tight">{tr("Đá với máy", "Play the computer", "與電腦對戰")}</p>
            <p className="text-[11px] text-emerald-100/75 leading-snug">
              {tr("Luyện tập miễn phí", "Free practice", "免費練習")} · {ladder.data?.todayBonusTaken
                ? tr("Đã nhận thưởng thắng hôm nay ✓", "Today's win bonus taken ✓", "今日首勝獎勵已領取 ✓")
                : tr(`🎁 Thắng đầu ngày (Vừa/Khó) +${fmtCoins(FOOTBALL_DAILY_WIN)}`, `🎁 First win today (Medium/Hard) +${fmtCoins(FOOTBALL_DAILY_WIN)}`, `🎁 今日首勝（普通/困難）+${fmtCoins(FOOTBALL_DAILY_WIN)}`)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {levels.map((l) => (
            <button key={l.id} type="button" onClick={() => setLevel(l.id)} className={`py-2 rounded-xl text-sm font-black ${level === l.id ? "bg-yellow-400 text-black" : "bg-black/25 text-white/85"}`} data-testid={`football-level-${l.id}`}>{l.icon} {l.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => onPractice(level)} className="mt-2 w-full rounded-xl py-3 font-display text-xl text-black bg-gradient-to-b from-lime-300 to-emerald-500 border-b-4 border-emerald-800" data-testid="button-football-practice">⚽ {tr("Đá ngay", "Kick off", "開球")}</button>
      </div>

      {/* Online with stakes */}
      <div className="rounded-3xl p-3.5 bg-purple-950/60 border border-yellow-500/25 space-y-3">
        <div>
          <p className="font-black text-white text-lg leading-tight flex items-center gap-2"><Users className="w-5 h-5 text-yellow-300" />{tr("Đấu online 1 vs 1", "Online 1 vs 1", "線上 1 對 1")}</p>
          <p className="text-[11px] text-white/55">{tr("Người thắng nhận cả hai phần cược · tính điểm Vua Phạt Đền", "Winner takes both stakes · counts for Penalty King", "贏家拿走雙方底注 · 計入點球之王積分")}</p>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {stakes.map((s) => (
            <button key={s} type="button" disabled={s > balance} onClick={() => setStake(s)} className={`py-2 rounded-xl text-sm font-black disabled:opacity-25 ${stake === s ? "bg-yellow-400 text-black" : "bg-white/5 text-white/80"}`} data-testid={`football-stake-${s}`}>
              {s === 0 ? tr("Miễn phí", "Free", "免費") : fmtStake(s)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => create.mutate()} disabled={create.isPending || !!mine} className="w-full rounded-xl py-3 font-display font-black text-xl text-white bg-gradient-to-b from-yellow-400 via-orange-500 to-red-600 border-b-4 border-red-900 disabled:opacity-50 flex items-center justify-center gap-2" data-testid="button-football-create">
          {create.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Plus className="w-5 h-5" />{tr("Tạo bàn", "Create table", "開桌")}</>}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-yellow-400/80">{tr("Bàn đang chờ", "Open tables", "等待中的球桌")}</p>
        {tables.data?.open.length ? tables.data.open.map((tb) => (
          <div key={tb.code} className="flex items-center gap-3 rounded-2xl p-3 bg-black/30 border border-white/10" data-testid={`football-open-${tb.code}`}>
            <KitBadge kit={tb.hostKit} size={34} />
            <div className="flex-1 min-w-0"><p className="font-black text-white truncate">{tb.host}</p><p className="text-xs text-yellow-300">{tb.stake ? `${fmtCoins(tb.stake)} 🪙` : tr("Miễn phí", "Free", "免費")}</p></div>
            <button type="button" onClick={() => join.mutate(tb.code)} disabled={join.isPending || tb.stake > balance || !!mine} className="px-4 py-2 rounded-xl font-black text-sm text-black bg-yellow-400 disabled:opacity-30" data-testid={`button-football-join-${tb.code}`}>{tr("Vào đá", "Join", "加入")}</button>
          </div>
        )) : <p className="text-sm text-white/40 text-center py-3">{tr("Chưa có bàn nào. Tạo bàn và mời bạn bè nhé!", "No tables yet. Create one and invite your mates!", "目前還沒有球桌。開一桌並邀請好友吧！")}</p>}
      </div>

      {!!tables.data?.live.length && (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-yellow-400/80">{tr("Đang thi đấu", "Playing now", "比賽中")}</p>
          {tables.data.live.map((tb) => (
            <div key={tb.code} className="flex items-center gap-2.5 rounded-2xl p-3 bg-black/20 border border-white/5">
              <span className="flex -space-x-2"><KitBadge kit={tb.hostKit} size={26} /><KitBadge kit={tb.guestKit ?? "th"} size={26} /></span>
              <div className="flex-1 min-w-0"><p className="font-bold text-white/90 truncate text-sm">{tb.host} vs {tb.guest}</p><p className="text-xs text-yellow-300/80">{tb.stake ? `${fmtCoins(tb.stake)} 🪙` : tr("Miễn phí", "Free", "免費")}</p></div>
              <button type="button" onClick={() => onOpen(tb.code)} className="px-3 py-2 rounded-xl font-black text-xs text-white bg-white/10 flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{tr("Xem", "Watch", "觀戰")}</button>
            </div>
          ))}
        </div>
      )}

      <details className="rounded-2xl bg-purple-950/60 border border-yellow-500/20 p-4 text-sm text-yellow-100/75">
        <summary className="font-black text-yellow-400 cursor-pointer">{tr("Luật chơi", "How to play", "遊戲規則")}</summary>
        <p className="mt-2 leading-relaxed">{tr(
          "Khi sút: vuốt quả bóng về phía khung thành. Hướng vuốt là hướng sút, vuốt nhanh là sút mạnh (mạnh quá sẽ vọt xà, nhẹ quá thủ môn dễ bắt), vuốt dài là sút cao, vuốt cong để bóng xoáy. Sút càng mạnh và càng sát góc thì càng khó bắt nhưng càng dễ chệch. Khi bắt bóng: chạm một trong 6 ô (hoặc vuốt theo hướng) để chọn hướng đổ người. Hai bên chọn cùng lúc và bí mật — máy chủ chỉ công bố khi cả hai đã chọn, rồi mới quyết định kết quả. Mỗi đội 5 quả, luân phiên; hết sớm nếu đội kia không thể gỡ; hoà thì đá luân lưu đột tử. Online: mỗi lựa chọn có 12 giây, hết giờ sẽ chọn ngẫu nhiên. Người thắng nhận cả hai phần cược. Rời trận quá 60 giây là thua; cả hai bỏ đi thì hoàn tiền.",
          "Shooting: flick the ball towards the goal. The direction is your aim, a fast flick is a hard shot (too hard flies over the bar, too soft is an easy save), a long flick goes higher, and a curved flick bends the ball. Harder and closer to the corners is harder to save but easier to miss. Keeping: tap one of the 6 zones (or swipe a direction) to dive. Both sides choose at the same time in secret — the server reveals nothing until both have chosen, then it decides the kick. Five kicks each, alternating; it ends early when one side can't catch up, then sudden death. Online: 12 seconds per choice, a random choice when time runs out. The winner takes both stakes. Away for over 60 seconds loses; if both leave, stakes are refunded.",
          "射門：朝球門滑動足球。滑動方向就是射門方向，滑得快就踢得大力（太大力會高出橫樑，太輕守門員很好撲），滑得長球會飛得高，弧線滑動能踢出香蕉球。越大力、越貼近死角越難撲，但也越容易射偏。守門：點 6 個區域之一（或朝方向滑動）來撲救。雙方同時秘密選擇——伺服器在雙方都選好之前不會公開任何資訊，然後才判定結果。每隊 5 球輪流踢；一方已無法追上就提前結束，平手則進入驟死賽。線上對戰：每次選擇限時 12 秒，超時會隨機選擇。贏家拿走雙方底注。離開超過 60 秒判輸；雙方都離開則退還底注。",
        )}</p>
      </details>
    </div>
  );
}

// ---------------- Shared match bits ----------------

function TimerBar({ ms, total }: { ms: number | null; total: number }) {
  if (ms == null) return <div className="h-1.5" />;
  const pct = Math.max(0, Math.min(100, (ms / total) * 100));
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden" data-testid="football-timer">
      <div className={`h-full ${ms < 4000 ? "bg-red-500" : "bg-yellow-400"}`} style={{ width: `${pct}%`, transition: "width 0.25s linear" }} />
    </div>
  );
}

function EndBanner({ title, sub, won, actions, children }: { title: string; sub?: string; won: boolean; actions: { label: string; onClick: () => void; testid?: string; disabled?: boolean }[]; children?: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" data-testid="football-end">
      <div className="w-full max-w-xs rounded-3xl p-6 text-center bg-gradient-to-b from-[#2a0f4f] to-[#140726] border-2 border-yellow-400/60 shadow-[0_0_50px_rgba(250,204,21,0.35)]">
        <p className="text-5xl mb-2">{won ? "🏆" : "🧤"}</p>
        <p className="font-display text-4xl text-yellow-300 leading-tight">{title}</p>
        {sub && <p className="mt-2 text-white/80 font-bold whitespace-pre-line">{sub}</p>}
        {children}
        <div className="mt-5 flex gap-2">
          {actions.map((a) => <button key={a.label} type="button" disabled={a.disabled} onClick={a.onClick} className="flex-1 py-2.5 rounded-xl font-black text-black bg-gradient-to-b from-yellow-300 to-orange-500 disabled:opacity-50" data-testid={a.testid}>{a.label}</button>)}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Plays kicks one after another; the decisive one is shown again in slow motion */
function useKickQueue(onShown: (k: { kick: KickResult; shootout: Shootout; decisive: boolean }) => void) {
  const [play, setPlay] = useState<PitchPlay | null>(null);
  const queue = useRef<{ kick: KickResult; shootout: Shootout; decisive: boolean }[]>([]);
  const busy = useRef(false);
  const id = useRef(0);
  const shown = useRef(onShown);
  shown.current = onShown;
  const next = useCallback(() => {
    const item = queue.current.shift();
    if (!item) { busy.current = false; setPlay(null); return; }
    busy.current = true;
    setPlay({
      id: ++id.current, kick: item.kick,
      onDone: () => {
        shown.current(item);
        if (item.decisive) {
          // Slow-motion replay of the kick that won it
          window.setTimeout(() => setPlay({ id: ++id.current, kick: item.kick, slow: true, onDone: () => { busy.current = false; setPlay(null); shown.current({ ...item, decisive: false }); next(); } }), 350);
        } else next();
      },
    });
  }, []);
  const push = useCallback((item: { kick: KickResult; shootout: Shootout; decisive: boolean }) => {
    queue.current.push(item);
    if (!busy.current) next();
  }, [next]);
  return { play, push, busy };
}

// ---------------- Practice against the computer ----------------

interface PracticeView { level: Level; kit: string; shootout: Shootout; winner: Side | null; bonus: number }

function PracticeMatch({ level, kit, name, onExit, onAgain }: { level: Level; kit: string; name: string; onExit: () => void; onAgain: () => void }) {
  const { tr, srv } = useLang();
  const { toast } = useToast();
  const labels = useLabels();
  const cpuKit = kit === "br" ? "ar" : "br";
  const [view, setView] = useState<PracticeView | null>(null);
  const [shown, setShown] = useState<Shootout | null>(null);
  const [over, setOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [keepLeft, setKeepLeft] = useState<number | null>(null);
  const kicks = useKickQueue(({ shootout, decisive }) => {
    setShown(shootout);
    if (decisive) return; // the replay comes next
    if (shootoutWinner(shootout) !== null) setOver(true);
  });

  useEffect(() => {
    apiRequest("POST", "/api/football/practice", { level, kit }).then((r) => r.json()).then((r: { practice: PracticeView }) => {
      setView(r.practice); setShown(r.practice.shootout); soundManager.whistle();
    }).catch((e: Error) => toast({ title: srv(e.message), variant: "destructive" }));
  }, []);

  const s = shown;
  const playing = !!view && !!s && shootoutWinner(s) === null && !kicks.play && !sending;
  const myKick = s ? shooterOf(s) === 0 : false;
  const mode: "shoot" | "keep" | "watch" = !playing ? "watch" : myKick ? "shoot" : "keep";

  const send = async (body: { shot?: ShotChoice; dive?: Zone | null }) => {
    if (sending) return;
    setSending(true);
    setKeepLeft(null);
    try {
      const r = await (await apiRequest("POST", "/api/football/practice/kick", body)).json() as { kick: KickResult; practice: PracticeView; decisive: boolean };
      setView(r.practice);
      kicks.push({ kick: r.kick, shootout: r.practice.shootout, decisive: r.decisive });
    } catch (e) {
      toast({ title: srv((e as Error).message), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Keeping: a short clock, then a random dive
  useEffect(() => {
    if (mode !== "keep") { setKeepLeft(null); return; }
    const end = Date.now() + KEEP_MS;
    setKeepLeft(KEEP_MS);
    const t = window.setInterval(() => {
      const left = end - Date.now();
      setKeepLeft(Math.max(0, left));
      if (left <= 0) { clearInterval(t); void send({ dive: null }); }
    }, 200);
    return () => clearInterval(t);
  }, [mode, s?.kicks.length]);

  useEffect(() => {
    if (!over || !view) return;
    if (view.winner === 0) { soundManager.whistle(true); window.setTimeout(() => soundManager.win(true), 400); fireworks(2500); if (view.bonus) coinBurst(); }
    else { soundManager.whistle(true); soundManager.lossComfort(); }
    if (view.bonus) { queryClient.invalidateQueries({ queryKey: STATE_KEY }); queryClient.invalidateQueries({ queryKey: ["/api/football/ladder"] }); }
  }, [over]);

  // A little chant now and then while the shootout is on
  useEffect(() => {
    if (!s || s.kicks.length === 0 || s.kicks.length % 3 !== 0) return;
    soundManager.chant();
  }, [s?.kicks.length]);

  if (!view || !s) return <div className="py-20"><Loader2 className="w-10 h-10 animate-spin text-yellow-400" /></div>;
  const lvl = { easy: tr("Dễ", "Easy", "簡單"), medium: tr("Vừa", "Medium", "普通"), hard: tr("Khó", "Hard", "困難") }[level];
  const t = tally(s);
  const status = !playing
    ? " "
    : myKick ? `⚽ ${tr("Lượt sút của bạn!", "Your kick!", "輪到你射門！")}` : `🧤 ${tr("Bạn bắt bóng — chọn hướng đổ người", "You're in goal — pick your dive", "你守門——選擇撲救方向")}`;
  return (
    <div className="w-full max-w-md flex flex-col gap-1.5" data-testid="football-practice">
      <Scoreboard names={[name, `🤖 ${tr("Máy", "Computer", "電腦")} · ${lvl}`]} kits={[kit, cpuKit]} shootout={s} active={shootoutWinner(s) === null ? shooterOf(s) : null} you={0} />
      <p className="text-center text-sm font-black text-yellow-100 min-h-[1.25rem]" data-testid="football-status">{status}{inSuddenDeath(s) && playing ? ` · ${tr("Đột tử!", "Sudden death!", "驟死！")}` : ""}</p>
      <Pitch mode={mode} shooterKit={myKick ? kit : cpuKit} keeperKit={myKick ? cpuKit : kit} locked={sending} play={kicks.play} labels={labels}
        onShoot={(shot) => void send({ shot })} onDive={(z) => void send({ dive: z })}
        hint={mode === "shoot" ? labels.swipe : mode === "keep" ? labels.tapZone : null} />
      <TimerBar ms={mode === "keep" ? keepLeft : null} total={KEEP_MS} />
      <div className="flex gap-2">
        <button type="button" onClick={onExit} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-black text-sm">{tr("Sảnh", "Lobby", "大廳")}</button>
        <button type="button" onClick={onAgain} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-black text-sm flex items-center justify-center gap-1.5"><RotateCcw className="w-4 h-4" />{tr("Đá lại", "Restart", "重新開始")}</button>
      </div>
      {over && (
        <EndBanner won={view.winner === 0} title={view.winner === 0 ? tr("BẠN THẮNG!", "YOU WIN!", "你贏了！") : tr("BẠN THUA", "YOU LOSE", "你輸了")}
          sub={`${t.goals[0]} – ${t.goals[1]}${view.bonus ? `\n🎁 ${tr("Thắng đầu ngày", "First win today", "今日首勝")} +${fmtCoins(view.bonus)} 🪙` : ""}`}
          actions={[{ label: tr("Đá lại", "Play again", "再玩一局"), onClick: onAgain, testid: "button-football-again" }, { label: tr("Sảnh", "Lobby", "大廳"), onClick: onExit }]} />
      )}
    </div>
  );
}

// ---------------- Online ----------------

type StateMsg = Extract<FootballServerMsg, { t: "state" }>;

function OnlineMatch({ code, kit, userId, onExit, onJoined, onGo }: { code: string; kit: string; userId: string; onExit: () => void; onJoined: () => void; onGo: (c: string) => void }) {
  const { tr, srv } = useLang();
  const { toast } = useToast();
  const labels = useLabels();
  const [table, setTable] = useState<StateMsg | null>(null);
  const [shown, setShown] = useState<Shootout | null>(null);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const [inviting, setInviting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [emotes, setEmotes] = useState<{ id: number; e: string; side: Side | null }[]>([]);
  const [myPick, setMyPick] = useState(false);
  const kicks = useKickQueue(({ shootout, decisive }) => {
    setShown(shootout);
    if (!decisive && shootoutWinner(shootout) !== null) setEnded(true);
  });
  const latest = useRef<StateMsg | null>(null);

  const joinSeat = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/football/tables/${code}/join`, { kit })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: STATE_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); onJoined(); },
    onError: (e: Error) => toast({ title: srv(e.message), variant: "destructive" }),
  });
  const cancel = useMutation({
    mutationFn: () => apiRequest("POST", `/api/football/tables/${code}/cancel`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: STATE_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); onExit(); },
  });

  const { connected, failed, send } = useFootballSocket(code, (m) => {
    if (m.t === "state") {
      const first = !latest.current;
      latest.current = m;
      setTable(m);
      setMsLeft(m.msLeft);
      if (!kicks.busy.current) setShown(m.shootout);
      if (first && m.status === "playing" && (m.shootout?.kicks.length ?? 0) === 0) soundManager.whistle();
      if (m.result) {
        queryClient.invalidateQueries({ queryKey: STATE_KEY });
        queryClient.invalidateQueries({ queryKey: ME_KEY });
        if (!kicks.busy.current && first) setEnded(true);
        else if (!kicks.busy.current && m.result.reason !== "win") setEnded(true);
      }
      if (m.seat !== null && !m.committed[m.seat]) setMyPick(false);
    } else if (m.t === "kick") {
      setMyPick(false);
      kicks.push({ kick: m.kick, shootout: m.shootout, decisive: m.decisive });
      if (m.shootout.kicks.length % 4 === 0) window.setTimeout(() => soundManager.chant(), 2600);
    } else if (m.t === "emote") {
      const e = { id: Date.now() + Math.random(), e: m.e, side: m.from };
      setEmotes((l) => [...l, e]);
      window.setTimeout(() => setEmotes((l) => l.filter((x) => x.id !== e.id)), 2600);
    } else if (m.t === "rematch") {
      queryClient.invalidateQueries({ queryKey: STATE_KEY });
      onGo(m.code);
    } else if (m.t === "error") {
      toast({ title: srv(m.message), variant: "destructive" });
    } else if (m.t === "closed") {
      toast({ title: "⏱", description: m.reason === "expired" ? tr("Hết thời gian chờ, bàn đã đóng", "Nobody came, the table closed", "等待逾時，球桌已關閉") : tr("Bàn đã đóng, tiền cược đã được hoàn lại", "Table closed, stakes refunded", "球桌已關閉，底注已退還") });
      queryClient.invalidateQueries({ queryKey: STATE_KEY });
      onExit();
    }
  });

  // Count the clock down between server updates
  useEffect(() => {
    if (msLeft == null) return;
    const t = window.setInterval(() => setMsLeft((v) => (v == null ? v : Math.max(0, v - 250))), 250);
    return () => clearInterval(t);
  }, [msLeft != null, table?.shootout?.kicks.length, table?.phase]);

  // The result banner after the decisive kick's replay; celebrate
  const result = table?.result;
  useEffect(() => {
    if (!ended || !result || table?.seat == null) return;
    soundManager.whistle(true);
    if (result.winner === table.seat) { window.setTimeout(() => soundManager.win(true), 400); fireworks(3000); if (result.payout) coinBurst(); }
    else soundManager.lossComfort();
  }, [ended]);

  if (!table && failed) {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-4 py-12 text-center" data-testid="football-gone">
        <div className="text-6xl">🥅</div>
        <p className="font-display text-2xl text-yellow-300">{tr("Không tìm thấy bàn này", "Table not found", "找不到這張球桌")}</p>
        <p className="text-sm text-white/60">{tr("Có thể trận đã kết thúc hoặc bàn đã đóng.", "The match may be over or the table was closed.", "比賽可能已結束或球桌已關閉。")}</p>
        <button type="button" onClick={onExit} className="w-full rounded-2xl py-3 font-black text-black bg-gradient-to-r from-yellow-300 to-orange-500">{tr("Về sảnh", "Back to the lobby", "回到大廳")}</button>
      </div>
    );
  }
  if (!table) return <div className="py-20"><Loader2 className="w-10 h-10 animate-spin text-yellow-400" /></div>;
  const seat = table.seat;
  const path = `/da-bong?table=${code}`;

  if (table.status === "waiting") {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-4 py-5 text-center" data-testid="football-waiting">
        <div className="text-6xl animate-bounce">⚽</div>
        <p className="font-display text-2xl text-yellow-300">{tr("Đang chờ đối thủ…", "Waiting for an opponent…", "等待對手中…")}</p>
        <div className="flex items-center gap-2 text-white/75"><KitBadge kit={table.kits[0]} size={28} /><span className="font-bold">{table.names[0]}</span></div>
        <p className="text-white/70">{table.stake ? `${tr("Mức cược", "Stake", "底注")}: ${fmtCoins(table.stake)} 🪙` : tr("Miễn phí", "Free", "免費")} · <span className="font-mono">{code}</span></p>
        {seat === 0 && (
          <button type="button" onClick={() => setInviting(true)} className="w-full rounded-2xl py-3.5 font-black text-black text-lg bg-gradient-to-r from-yellow-300 to-orange-500 flex items-center justify-center gap-2" data-testid="button-football-invite"><UserPlus className="w-5 h-5" />{tr("Mời bạn bè", "Invite a friend", "邀請好友")}</button>
        )}
        {seat === 0 && <button type="button" onClick={() => cancel.mutate()} className="text-sm text-red-300/80 underline flex items-center gap-1" data-testid="button-football-cancel"><X className="w-4 h-4" />{tr("Huỷ bàn", "Close table", "關閉球桌")}</button>}
        {seat === null && (
          <button type="button" disabled={joinSeat.isPending} onClick={() => joinSeat.mutate()} className="w-full rounded-2xl py-3.5 font-black text-black bg-gradient-to-r from-emerald-300 to-emerald-500 flex items-center justify-center gap-2 text-lg" data-testid="button-football-take-seat">
            {joinSeat.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : `⚽ ${tr("Vào đá", "Join", "加入")}${table.stake ? ` · ${fmtCoins(table.stake)} 🪙` : ""}`}
          </button>
        )}
        {seat === null && <button type="button" onClick={onExit} className="text-sm text-white/60 underline">{tr("Sảnh", "Lobby", "大廳")}</button>}
        {inviting && <InviteSheet path={path} onClose={() => setInviting(false)} />}
      </div>
    );
  }

  const s = shown ?? table.shootout;
  const names: [string, string] = [table.names[0], table.names[1] ?? "…"];
  const animating = !!kicks.play;
  const live = table.status === "playing" && !animating && table.phase === "choose" && s && shootoutWinner(s) === null;
  const shooter = s ? shooterOf(s) : 0;
  const myKick = seat !== null && shooter === seat;
  const committed = seat !== null && (table.committed[seat] || myPick);
  const mode: "shoot" | "keep" | "watch" = seat === null || !live ? "watch" : myKick ? "shoot" : "keep";
  const other = seat === null ? null : ((1 - seat) as Side);
  const status = !live ? " "
    : seat === null ? `⚽ ${names[shooter]} ${tr("sút", "shoots", "射門")} · 🧤 ${names[(1 - shooter) as Side]} ${tr("bắt", "keeps", "守門")}`
    : committed ? (table.committed[other!] ? "…" : `✅ ${tr("Đã chọn — chờ đối thủ", "Locked in — waiting for your opponent", "已鎖定——等待對手")}`)
    : myKick ? `⚽ ${tr("Lượt sút của bạn!", "Your kick!", "輪到你射門！")}` : `🧤 ${tr("Bạn bắt bóng — chọn hướng đổ người", "You're in goal — pick your dive", "你守門——選擇撲救方向")}`;
  const opponentReady = live && other !== null && table.committed[other];
  const t = s ? tally(s) : { goals: [0, 0] };
  const r = table.result;
  const iWon = r && seat !== null && r.winner === seat;
  const reason: Record<string, string> = {
    win: "", resign: tr("(đối thủ bỏ cuộc)", "(resigned)", "（認輸）"), left: tr("(rời trận)", "(left the match)", "（離開比賽）"), timeouts: tr("(hết giờ quá nhiều lần)", "(ran out of time too often)", "（多次超時）"),
  };

  return (
    <div className="w-full max-w-md flex flex-col gap-1.5 relative" data-testid="football-online">
      <Scoreboard names={names} kits={table.kits} shootout={s} active={live ? shooter : null} you={seat} />
      <div className="flex items-center justify-between text-[11px] text-white/55 px-1">
        <span>{table.stake ? `🏆 ${fmtCoins(table.stake * 2)} 🪙` : tr("Miễn phí", "Free", "免費")}</span>
        <span className="flex items-center gap-2">
          {([0, 1] as Side[]).map((x) => <span key={x} className="flex items-center gap-0.5">{table.online[x] ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}{names[x].slice(0, 8)}</span>)}
          <span className={connected ? "" : "text-red-300"}>{connected ? `👁 ${table.spectators}` : tr("mất kết nối", "offline", "已離線")}</span>
        </span>
      </div>
      <p className="text-center text-sm font-black text-yellow-100 min-h-[1.25rem]" data-testid="football-status">
        {status}{opponentReady && !committed ? <span className="ml-1 text-emerald-300 text-xs">· {tr("đối thủ đã chọn", "opponent is ready", "對手已選好")}</span> : null}
      </p>
      <div className="relative">
        <Pitch mode={mode} shooterKit={table.kits[shooter]} keeperKit={table.kits[(1 - shooter) as Side]} locked={committed} play={kicks.play} labels={labels}
          onShoot={(shot) => { setMyPick(true); soundManager.buttonClick(); send({ t: "shoot", shot }); }}
          onDive={(zone) => { setMyPick(true); send({ t: "dive", zone }); }}
          hint={mode === "shoot" && !committed ? labels.swipe : mode === "keep" && !committed ? labels.tapZone : null} />
        {emotes.map((e) => (
          <div key={e.id} className={`absolute top-6 ${e.side === (seat ?? 0) ? "left-5" : "right-5"} text-5xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)] pointer-events-none animate-bounce`}>{e.e}</div>
        ))}
      </div>
      <TimerBar ms={live ? msLeft : null} total={CHOOSE_MS} />

      {seat !== null && table.status === "playing" && (
        <div className="flex items-center gap-1.5 justify-center flex-wrap">
          {FOOTBALL_EMOTES.map((e) => (
            <button key={e} type="button" onClick={() => send({ t: "emote", e })} className="w-9 h-9 rounded-full bg-white/10 text-lg active:scale-90" data-testid={`football-emote-${e}`}>{e}</button>
          ))}
          <button type="button" onClick={() => { if (confirm(tr("Bỏ cuộc và thua trận này?", "Give up and lose this match?", "確定認輸並輸掉這場比賽嗎？"))) send({ t: "resign" }); }} className="ml-1 px-3 h-9 rounded-full bg-red-900/60 text-red-200 text-xs font-black flex items-center gap-1" data-testid="button-football-resign"><Flag className="w-3.5 h-3.5" />{tr("Bỏ cuộc", "Resign", "認輸")}</button>
        </div>
      )}
      {seat === null && <button type="button" onClick={onExit} className="py-2 rounded-xl bg-white/5 text-white/70 font-black text-sm">{tr("Sảnh", "Lobby", "大廳")}</button>}

      {ended && r && !animating && (
        <EndBanner
          won={seat === null || !!iWon}
          title={seat === null ? `${names[r.winner]} ${tr("thắng", "wins", "獲勝")}` : iWon ? tr("BẠN THẮNG!", "YOU WIN!", "你贏了！") : tr("BẠN THUA", "YOU LOSE", "你輸了")}
          sub={`${t.goals[0]} – ${t.goals[1]} ${reason[r.reason] ?? ""}${r.payout ? `\n${iWon ? "+" : ""}${fmtCoins(r.payout)} 🪙` : ""}${seat !== null && r.ladder ? `\n👑 ${r.ladder.counted ? `${iWon ? "+" : "−"}${r.ladder.delta} Elo` : tr("Trận này không tính Elo", "This match doesn't count for Elo", "本場不計入 Elo")}` : ""}`}
          actions={seat !== null ? [
            { label: table.rematch[seat] ? tr("Đang chờ…", "Waiting…", "等待中…") : tr("Đá lại", "Rematch", "再戰"), onClick: () => send({ t: "rematch" }), disabled: table.rematch[seat], testid: "button-football-rematch" },
            { label: tr("Sảnh", "Lobby", "大廳"), onClick: onExit },
          ] : [{ label: tr("Sảnh", "Lobby", "大廳"), onClick: onExit }]}
        >
          {seat !== null && other !== null && table.rematch[other] && !table.rematch[seat] && (
            <p className="mt-3 text-sm font-black text-emerald-300 animate-pulse">🔁 {tr(`${names[other]} muốn đá lại!`, `${names[other]} wants a rematch!`, `${names[other]} 想再戰一場！`)}</p>
          )}
        </EndBanner>
      )}
    </div>
  );
}

// Re-exported for the lobby tile's "NEW" badge colours
export { kitOf };
