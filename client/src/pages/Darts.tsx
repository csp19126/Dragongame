import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Eye, Flag, Loader2, Plus, RotateCcw, Share2, Trophy, UserPlus, Users, Wind, X } from "lucide-react";
import {
  applyDart, botTarget, targetPoint, hitLabel, BOTS, DARTS_STAKES, DARTS_EMOTES, DARTS_DART_MS, DAILY_DARTS, DAILY_PRIZES,
  PRACTICE_WIN_BONUS, isBotLevel,
  type BotLevel, type DailyView, type DartEvent, type DartsServerMsg, type DartsTable, type Hit, type Seat, type Visit, type X01State,
} from "@shared/darts";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { Avatar } from "@/components/Avatar";
import { Stage, type StageHandle, type ThrowRequest } from "@/components/darts/Stage";
import { Scoreboard } from "@/components/darts/Scoreboard";
import { InviteSheet } from "@/components/darts/InviteSheet";
import { SEAT_COLORS, callerLine, dartCallout, visitCallout } from "@/components/darts/callouts";
import type { Ghost } from "@/components/darts/Dartboard";
import { useAuth, ME_KEY } from "@/hooks/use-auth";
import { useGameState, STATE_KEY } from "@/hooks/use-game";
import { useDartsSocket } from "@/hooks/use-darts-socket";
import { useLang, fmtCoins, type Language } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const fmtStake = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}K` : String(n));
const refreshCoins = () => { queryClient.invalidateQueries({ queryKey: STATE_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); };

/** Callouts, sounds and the caller after one dart; resolves when it's time for the next */
async function dartShow(stage: StageHandle | null, hit: Hit, event: DartEvent, visit: Visit | undefined, lang: Language) {
  if (!stage) return;
  const dc = dartCallout(hit, lang);
  if (event === "scored" || !visit) {
    if (dc) stage.callout(dc);
    return;
  }
  const vc = visitCallout(visit.total, visit.bust, visit.checkout, lang);
  if (visit.bust) soundManager.dartBust();
  if (visit.checkout) soundManager.win(event === "match");
  if (visit.total === 180 && !visit.bust) { soundManager.cheer(); fireworks(2200); }
  else if (visit.total >= 100 && !visit.bust) soundManager.cheer();
  const line = callerLine(visit.total, visit.bust, visit.checkout);
  if (line) soundManager.caller(line);
  stage.callout(vc ?? dc ?? null);
  await sleep(vc?.tone === "max" ? 2300 : vc ? 1200 : 700);
}

function useTr() {
  const { tr } = useLang();
  return tr;
}

export default function Darts() {
  const { user, isLoading } = useAuth();
  const tr = useTr();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const tableCode = params.get("table")?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || null;
  const practice = params.get("practice");
  const daily = params.get("daily");
  const tab = params.get("tab") === "daily" ? "daily" : "play";
  const [rev, setRev] = useState(0);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0515]"><Loader2 className="w-12 h-12 animate-spin text-yellow-400" /></div>;
  if (!user) return <Redirect to={`/auth${tableCode ? `?next=${encodeURIComponent(`/phi-tieu?table=${tableCode}`)}` : ""}`} />;

  const inGame = !!(tableCode || (practice && isBotLevel(practice)) || daily);
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1d0a35] to-[#0a0515] flex flex-col">
      <Header />
      <main className={`flex-1 w-full flex flex-col items-center relative z-10 ${inGame ? "gap-1.5 px-2 py-2" : "gap-3 px-3 py-3"}`}>
        {!inGame && (
          <div className="text-center">
            <h1 className="font-display text-4xl sm:text-5xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="text-darts-title">{tr("Phi Tiêu", "Darts", "飛鏢")}</h1>
            <p className="text-[11px] sm:text-xs font-black tracking-[0.3em] text-yellow-500/80 uppercase mt-1">🎯 {tr("501 · Đấu online · Thử thách mỗi ngày", "501 · Online · Daily challenge", "501 · 線上對戰 · 每日挑戰")} 🎯</p>
          </div>
        )}
        {!inGame && <GameTabs />}
        {tableCode ? (
          <OnlineTable key={`${tableCode}-${rev}`} code={tableCode} onExit={() => setLocation("/phi-tieu")} onJoined={() => setRev((r) => r + 1)} onGo={(c) => setLocation(`/phi-tieu?table=${c}`)} />
        ) : practice && isBotLevel(practice) ? (
          <PracticeGame level={practice} legs={params.get("legs") === "1" ? 1 : 3} name={user.username} onExit={() => setLocation("/phi-tieu")} />
        ) : daily ? (
          <DailyGame ranked={daily === "ranked"} onExit={() => setLocation("/phi-tieu?tab=daily")} />
        ) : (
          <DartsLobby tab={tab} />
        )}
      </main>
    </div>
  );
}

// =====================================================================================
// Lobby
// =====================================================================================

function DartsLobby({ tab }: { tab: "play" | "daily" }) {
  const { tr, srv, t } = useLang();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: state } = useGameState(true);
  const [stake, setStake] = useState(0);
  const [legs, setLegs] = useState<1 | 3>(3);
  const [practiceLegs, setPracticeLegs] = useState<1 | 3>(3);
  const tables = useQuery<{ open: DartsTable[]; live: DartsTable[]; mine: string | null; stakes: number[] }>({ queryKey: ["/api/darts/tables"], refetchInterval: 3000, enabled: tab === "play" });
  const practiceInfo = useQuery<{ rewardTaken: boolean; reward: number }>({ queryKey: ["/api/darts/practice"], enabled: tab === "play" });
  const balance = state?.balance ?? 0;
  const mine = tables.data?.mine;
  const stakes = tables.data?.stakes ?? DARTS_STAKES;
  const fail = (e: Error) => toast({ title: /balance/i.test(e.message) ? t.insufficientBalanceDesc : srv(e.message), variant: "destructive" });
  const open = (code: string) => setLocation(`/phi-tieu?table=${code}`);

  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/darts/tables", { stake, legs })).json() as Promise<{ code: string }>,
    onSuccess: (r) => { refreshCoins(); open(r.code); },
    onError: fail,
  });
  const join = useMutation({
    mutationFn: async (code: string) => (await apiRequest("POST", `/api/darts/tables/${code}/join`)).json() as Promise<{ code: string }>,
    onSuccess: (r) => { refreshCoins(); open(r.code); },
    onError: (e: Error) => { fail(e); tables.refetch(); },
  });

  const tabs = (
    <div className="w-full grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/40 border border-white/10">
      {(["play", "daily"] as const).map((k) => (
        <button key={k} type="button" onClick={() => setLocation(k === "daily" ? "/phi-tieu?tab=daily" : "/phi-tieu")}
          className={`py-2 rounded-xl text-sm font-black transition ${tab === k ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black" : "text-white/70"}`} data-testid={`darts-tab-${k}`}>
          {k === "play" ? `🎯 ${tr("Chơi", "Play", "對戰")}` : `🏆 ${tr("Thử thách 9 phi tiêu", "9-Dart Challenge", "9 鏢挑戰")}`}
        </button>
      ))}
    </div>
  );

  if (tab === "daily") return <div className="w-full max-w-md flex flex-col gap-3">{tabs}<DailyPanel /></div>;

  const legsToggle = (v: 1 | 3, set: (v: 1 | 3) => void, id: string) => (
    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-black/30">
      {([1, 3] as const).map((n) => (
        <button key={n} type="button" onClick={() => set(n)} className={`py-1.5 rounded-lg text-xs font-black ${v === n ? "bg-white/15 text-white" : "text-white/50"}`} data-testid={`darts-${id}-legs-${n}`}>
          {n === 1 ? tr("1 ván", "1 leg", "1 局") : tr("Thắng 2/3 ván", "Best of 3", "三局兩勝")}
        </button>
      ))}
    </div>
  );

  return (
    <div className="w-full max-w-md flex flex-col gap-3" data-testid="darts-lobby">
      {tabs}
      {mine && (
        <button type="button" onClick={() => open(mine)} className="w-full rounded-2xl py-3 font-black text-black bg-gradient-to-r from-yellow-300 to-orange-500" data-testid="button-darts-back">
          {tr("Quay lại bàn của bạn", "Back to your table", "回到你的牌桌")} ({mine})
        </button>
      )}

      {/* Against the computer */}
      <div className="rounded-3xl p-3.5 bg-gradient-to-br from-emerald-800/80 to-emerald-950 border border-emerald-400/30 space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-black text-white text-lg">🤖 {tr("Chơi với máy", "Play the computer", "與電腦對戰")}</p>
          <p className="text-[11px] text-emerald-100/70 font-bold">{tr("501 · miễn phí", "501 · free", "501 · 免費")}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(BOTS) as BotLevel[]).map((lv) => (
            <button key={lv} type="button" onClick={() => setLocation(`/phi-tieu?practice=${lv}&legs=${practiceLegs}`)}
              className="rounded-2xl p-2 bg-black/30 border border-white/10 active:scale-95 transition text-center" data-testid={`darts-bot-${lv}`}>
              <div className="text-3xl leading-none">{BOTS[lv].icon}</div>
              <div className="text-[13px] font-black text-white mt-1 truncate">{BOTS[lv].name}</div>
              <div className={`text-[10px] font-black ${lv === "easy" ? "text-emerald-300" : lv === "medium" ? "text-yellow-300" : "text-red-300"}`}>
                {lv === "easy" ? tr("Dễ", "Easy", "簡單") : lv === "medium" ? tr("Vừa", "Medium", "中等") : tr("Khó", "Hard", "困難")}
              </div>
              <div className="text-[10px] text-white/50">{tr("TB", "Avg", "平均")} ~{BOTS[lv].avg}</div>
            </button>
          ))}
        </div>
        {legsToggle(practiceLegs, setPracticeLegs, "practice")}
        <p className="text-[11px] text-emerald-100/75 leading-snug">
          {practiceInfo.data?.rewardTaken
            ? `✅ ${tr("Đã nhận thưởng thắng đầu ngày hôm nay", "Today's first-win reward claimed", "今日首勝獎勵已領取")}`
            : `🎁 ${tr(`Thắng Anh Tư hoặc Big Jock lần đầu trong ngày: +${fmtCoins(PRACTICE_WIN_BONUS)} xu`, `First win of the day vs Anh Tư or Big Jock: +${fmtCoins(PRACTICE_WIN_BONUS)} coins`, `每日首次擊敗 Anh Tư 或 Big Jock：+${fmtCoins(PRACTICE_WIN_BONUS)} 金幣`)}`}
        </p>
      </div>

      {/* Online */}
      <div className="rounded-3xl p-3.5 bg-purple-950/60 border border-yellow-500/25 space-y-2.5">
        <div className="flex items-baseline justify-between">
          <p className="font-black text-white text-lg">🌐 {tr("Đấu online 1v1", "Online 1v1", "線上 1 對 1")}</p>
          <p className="text-[11px] text-yellow-100/60 font-bold">{tr("Người thắng ăn cả", "Winner takes the pot", "贏家通吃")}</p>
        </div>
        <p className="text-[11px] font-black uppercase tracking-widest text-yellow-400/80">{tr("Mức cược", "Stake", "底注")}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {stakes.map((s) => (
            <button key={s} type="button" disabled={s > balance} onClick={() => setStake(s)} className={`py-2 rounded-xl text-sm font-black disabled:opacity-25 ${stake === s ? "bg-yellow-400 text-black" : "bg-white/5 text-white/80"}`} data-testid={`darts-stake-${s}`}>
              {s === 0 ? tr("Miễn phí", "Free", "免費") : fmtStake(s)}
            </button>
          ))}
        </div>
        {legsToggle(legs, setLegs, "online")}
        <button type="button" onClick={() => create.mutate()} disabled={create.isPending || !!mine} className="w-full rounded-xl py-3 font-display font-black text-xl text-white bg-gradient-to-b from-yellow-400 via-orange-500 to-red-600 border-b-4 border-red-900 disabled:opacity-50 flex items-center justify-center gap-2" data-testid="button-darts-create">
          {create.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Plus className="w-5 h-5" />{tr("Tạo bàn", "Create table", "開桌")}</>}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-yellow-400/80 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{tr("Bàn đang chờ", "Open tables", "等待中的牌桌")}</p>
        {tables.data?.open.length ? tables.data.open.map((tb) => (
          <div key={tb.code} className="flex items-center gap-3 rounded-2xl p-3 bg-black/30 border border-white/10" data-testid={`darts-open-${tb.code}`}>
            <span className="text-2xl">🎯</span>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white truncate">{tb.host}</p>
              <p className="text-xs text-yellow-300">{tb.stake ? `${fmtCoins(tb.stake)} 🪙` : tr("Miễn phí", "Free", "免費")} · {tb.legs === 3 ? tr("2/3 ván", "Bo3", "三局兩勝") : tr("1 ván", "1 leg", "1 局")}</p>
            </div>
            <button type="button" onClick={() => join.mutate(tb.code)} disabled={join.isPending || tb.stake > balance || !!mine} className="px-4 py-2 rounded-xl font-black text-sm text-black bg-yellow-400 disabled:opacity-30" data-testid={`button-darts-join-${tb.code}`}>{tr("Vào chơi", "Join", "加入")}</button>
          </div>
        )) : <p className="text-sm text-white/40 text-center py-3">{tr("Chưa có bàn nào. Tạo bàn và mời bạn bè!", "No tables yet. Create one and invite a friend!", "目前沒有牌桌。開一桌並邀請好友吧！")}</p>}
      </div>

      {!!tables.data?.live.length && (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-yellow-400/80">{tr("Đang thi đấu", "Playing now", "比賽中")}</p>
          {tables.data.live.map((tb) => (
            <div key={tb.code} className="flex items-center gap-3 rounded-2xl p-3 bg-black/20 border border-white/5">
              <span className="text-xl">🔴</span>
              <div className="flex-1 min-w-0"><p className="font-bold text-white/90 truncate text-sm">{tb.host} vs {tb.guest}</p><p className="text-xs text-yellow-300/80">{tb.stake ? `${fmtCoins(tb.stake * 2)} 🪙` : tr("Miễn phí", "Free", "免費")}</p></div>
              <button type="button" onClick={() => open(tb.code)} className="px-3 py-2 rounded-xl font-black text-xs text-white bg-white/10 flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{tr("Xem", "Watch", "觀戰")}</button>
            </div>
          ))}
        </div>
      )}

      <details className="rounded-2xl bg-purple-950/60 border border-yellow-500/20 p-4 text-sm text-yellow-100/75">
        <summary className="font-black text-yellow-400 cursor-pointer">{tr("Cách chơi", "How to play", "玩法說明")}</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>{tr(
            "Kéo trên bảng để ngắm. Giữ nút ném để tay vững lại (khoảng 1 giây là chuẩn nhất, giữ lâu quá tay sẽ mỏi), rồi vuốt lên để ném. Vuốt nhẹ quá phi tiêu rơi thấp, mạnh quá bay cao; vuốt lệch sang bên phi tiêu sẽ lệch theo.",
            "Drag on the board to aim. Hold the throw pad to steady your arm (about a second is best; hold too long and it tires), then flick up to throw. Too soft drops low, too hard flies high; a sideways flick pulls the dart sideways.",
            "在鏢靶上拖曳瞄準。按住擲鏢區讓手臂穩定（約 1 秒最佳，按太久手會累），再向上滑動擲出。太輕會偏低、太重會偏高；斜著滑會讓飛鏢偏向一側。")}</p>
          <p>{tr(
            "501: mỗi lượt 3 phi tiêu, trừ dần từ 501 về đúng 0, phi tiêu cuối phải vào vòng đôi (hoặc hồng tâm). Trừ quá (xuống dưới 0, còn 1, hoặc về 0 không bằng vòng đôi) là quá điểm: điểm trở lại như đầu lượt. Bàn có cược: người thắng nhận cả hai phần cược, máy chủ quyết định nơi phi tiêu cắm.",
            "501: three darts a visit, count down from 501 to exactly 0, finishing on a double (or the bull). Going below 0, leaving 1, or reaching 0 without a double is a bust: the score goes back to the start of the visit. On a staked table the winner takes both stakes; the server decides where every dart lands.",
            "501：每輪 3 鏢，從 501 倒數到剛好 0，最後一鏢必須射中雙倍區（或紅心）。低於 0、剩 1 分，或不是以雙倍歸零都算爆分：分數回到本輪開始。有底注的牌桌由贏家拿走雙方底注；飛鏢落點由伺服器決定。")}</p>
        </div>
      </details>
    </div>
  );
}

// =====================================================================================
// Practice against the computer
// =====================================================================================

function PracticeGame({ level, legs, name, onExit }: { level: BotLevel; legs: 1 | 3; name: string; onExit: () => void }) {
  const { tr, lang, srv } = useLang();
  const { toast } = useToast();
  const stage = useRef<StageHandle>(null);
  const [game, setGame] = useState<X01State | null>(null);
  const [busy, setBusy] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [reward, setReward] = useState(0);
  const clearNext = useRef(false);
  const bot = BOTS[level];

  const start = useCallback(async () => {
    const r = await (await apiRequest("POST", "/api/darts/practice/start", { level, legs })).json();
    stage.current?.clear();
    clearNext.current = false;
    setReward(0);
    setGame(r.practice.game);
  }, [level, legs]);

  useEffect(() => {
    (async () => {
      try {
        const r = await (await apiRequest("GET", "/api/darts/practice")).json();
        const p = r.practice as { level: BotLevel; game: X01State } | null;
        if (p && p.level === level && p.game.winner === null && p.game.legsToWin === (legs === 3 ? 2 : 1)) {
          setGame(p.game);
          stage.current?.set(p.game.visit.map((h) => ({ hit: h, color: SEAT_COLORS[0] })));
        } else await start();
      } catch (e) { toast({ title: srv((e as Error).message), variant: "destructive" }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, legs]);

  const one = async (g: X01State, hit: Hit, seat: Seat): Promise<X01State> => {
    if (clearNext.current) { stage.current?.clear(); clearNext.current = false; }
    await stage.current?.land(hit, SEAT_COLORS[seat]);
    const r = applyDart(g, hit);
    setGame(r.state);
    if (r.event !== "scored") clearNext.current = true;
    await dartShow(stage.current, hit, r.event, r.visit, lang);
    return r.state;
  };

  const onThrow = async (t: ThrowRequest) => {
    if (!game || busy) return;
    setBusy(true);
    try {
      const r = await (await apiRequest("POST", "/api/darts/practice/throw", t)).json() as { hit: Hit; bot: { hit: Hit }[]; game: X01State; reward: number };
      let g = await one(game, r.hit, 0);
      for (const b of r.bot) {
        // The computer lines up its throw
        const tp = targetPoint(botTarget(g.scores[1], 3 - g.visit.length));
        setGhost({ x: tp.x, y: tp.y, hold: 400 });
        await sleep(g.visit.length === 0 ? 900 : 650);
        setGhost(null);
        g = await one(g, b.hit, 1);
      }
      setGame(r.game);
      if (r.reward) { setReward(r.reward); refreshCoins(); coinBurst(); }
      if (r.game.winner === 0) { soundManager.win(true); fireworks(2600); }
      else if (r.game.winner === 1) soundManager.lossComfort();
    } catch (e) {
      toast({ title: srv((e as Error).message), variant: "destructive" });
    } finally { setGhost(null); setBusy(false); }
  };

  if (!game) return <div className="py-20"><Loader2 className="w-10 h-10 animate-spin text-yellow-400" /></div>;
  const myTurn = game.turn === 0 && game.winner === null;
  return (
    <div className="w-full max-w-md flex flex-col gap-1.5" data-testid="darts-practice">
      <Scoreboard game={game} names={[name, `${bot.icon} ${bot.name}`]} me={0} />
      <Stage ref={stage} canThrow={myTurn && !busy} onThrow={onThrow} color={SEAT_COLORS[0]} ghost={ghost}
        dartsLeft={myTurn ? 3 - game.visit.length : undefined}
        idleText={game.winner === null && !myTurn ? tr(`${bot.name} đang ném…`, `${bot.name} is throwing…`, `${bot.name} 正在擲鏢…`) : undefined} />
      <div className="flex gap-2">
        <button type="button" onClick={onExit} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-black text-sm">{tr("Sảnh", "Lobby", "大廳")}</button>
        <button type="button" disabled={busy} onClick={() => start()} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-black text-sm flex items-center justify-center gap-1.5"><RotateCcw className="w-4 h-4" />{tr("Ván mới", "New game", "新遊戲")}</button>
      </div>
      {game.winner !== null && !busy && (
        <EndBanner
          title={game.winner === 0 ? tr("BẠN THẮNG!", "YOU WIN!", "你贏了！") : tr("BẠN THUA", "YOU LOSE", "你輸了")}
          sub={`${tr("Điểm TB", "Average", "平均")} ${(game.darts[0] ? (game.points[0] / game.darts[0]) * 3 : 0).toFixed(1)}${reward ? `\n🎁 +${fmtCoins(reward)} 🪙` : ""}`}
          actions={[{ label: tr("Chơi lại", "Play again", "再玩一局"), onClick: () => start() }, { label: tr("Sảnh", "Lobby", "大廳"), onClick: onExit }]}
        />
      )}
    </div>
  );
}

function EndBanner({ title, sub, actions, extra }: { title: string; sub: string; actions: { label: string; onClick: () => void; testid?: string }[]; extra?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" data-testid="darts-end">
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-xs rounded-3xl p-6 text-center bg-gradient-to-b from-[#2a0f4f] to-[#140726] border-2 border-yellow-400/60 shadow-[0_0_50px_rgba(250,204,21,0.35)]">
        <p className="text-5xl mb-2">🎯</p>
        <p className="font-display text-4xl text-yellow-300">{title}</p>
        {sub && <p className="mt-2 text-white/80 font-bold whitespace-pre-line">{sub}</p>}
        {extra && <div className="mt-4">{extra}</div>}
        <div className="mt-5 flex gap-2">
          {actions.map((a) => <button key={a.label} type="button" onClick={a.onClick} className="flex-1 py-2.5 rounded-xl font-black text-black bg-gradient-to-b from-yellow-300 to-orange-500" data-testid={a.testid}>{a.label}</button>)}
        </div>
      </motion.div>
    </div>
  );
}

// =====================================================================================
// Online table
// =====================================================================================

type StateMsg = Extract<DartsServerMsg, { t: "state" }>;
type DartMsg = Extract<DartsServerMsg, { t: "dart" }>;

function OnlineTable({ code, onExit, onJoined, onGo }: { code: string; onExit: () => void; onJoined: () => void; onGo: (code: string) => void }) {
  const { tr, lang, srv } = useLang();
  const { toast } = useToast();
  const stage = useRef<StageHandle>(null);
  const [table, setTable] = useState<StateMsg | null>(null);
  const [game, setGame] = useState<X01State | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [emotes, setEmotes] = useState<{ id: number; e: string; seat: Seat | null }[]>([]);
  const queue = useRef<DartMsg[]>([]);
  const busy = useRef(false);
  const lastState = useRef<StateMsg | null>(null);
  const clearNext = useRef(false);
  const restored = useRef(false);

  const playNext = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setAnimating(true);
    while (queue.current.length) {
      const m = queue.current.shift()!;
      setGhost(null);
      if (clearNext.current) { stage.current?.clear(); clearNext.current = false; }
      await stage.current?.land(m.hit, SEAT_COLORS[m.by]);
      setGame(m.game);
      if (m.by === lastState.current?.seat) setPending(false);
      if (m.event !== "scored") clearNext.current = true;
      await dartShow(stage.current, m.hit, m.event, m.visit, lang);
    }
    busy.current = false;
    setAnimating(false);
    if (lastState.current?.game) setGame(lastState.current.game);
  }, [lang]);

  const { connected, send } = useDartsSocket(code, (m) => {
    if (m.t === "state") {
      lastState.current = m;
      setTable(m);
      setMsLeft(m.msLeft);
      if (!busy.current) setGame(m.game);
      if (m.game && !restored.current) {
        restored.current = true;
        const g = m.game;
        const visitDarts = g.visit.length ? g.visit : g.board;
        const by = g.visit.length ? g.turn : g.lastVisit?.by ?? g.turn;
        stage.current?.set(visitDarts.map((h) => ({ hit: h, color: SEAT_COLORS[by] })));
        if (!g.visit.length) clearNext.current = true;
      }
      if (m.result) refreshCoins();
    } else if (m.t === "dart") {
      if (lastState.current) lastState.current = { ...lastState.current, game: m.game };
      setMsLeft(DARTS_DART_MS);
      queue.current.push(m);
      void playNext();
    } else if (m.t === "aim") {
      if (!busy.current) setGhost({ x: m.x, y: m.y, hold: m.hold });
    } else if (m.t === "emote") {
      const e = { id: Date.now() + Math.random(), e: m.e, seat: m.from };
      setEmotes((l) => [...l, e]);
      window.setTimeout(() => setEmotes((l) => l.filter((x) => x.id !== e.id)), 2600);
    } else if (m.t === "error") {
      setPending(false);
      toast({ title: srv(m.message), variant: "destructive" });
    } else if (m.t === "closed") {
      toast({ title: m.reason === "expired" ? tr("Hết thời gian chờ, bàn đã đóng", "Nobody joined in time; the table closed", "等待逾時，牌桌已關閉") : tr("Bàn đã đóng", "The table closed", "牌桌已關閉") });
      refreshCoins();
      onExit();
    }
  });

  useEffect(() => {
    if (msLeft == null) return;
    const t = window.setInterval(() => setMsLeft((v) => (v == null ? v : Math.max(0, v - 1000))), 1000);
    return () => clearInterval(t);
  }, [msLeft != null]);

  // A thrown dart that never came back (dropped line): let the player try again
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(false), 4000);
    return () => clearTimeout(t);
  }, [pending]);

  const lastAim = useRef(0);
  const onAimLive = useCallback((p: { x: number; y: number }, hold: number | null) => {
    const now = Date.now();
    if (now - lastAim.current < 100 && hold === null) return;
    lastAim.current = now;
    send({ t: "aim", x: p.x, y: p.y, hold: hold ?? 0 });
  }, [send]);

  const ended = table?.result;
  useEffect(() => {
    if (!ended || table?.seat == null || animating) return;
    if (ended.winner === table.seat) { soundManager.win(true); fireworks(3000); coinBurst(); } else soundManager.lossComfort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended?.winner, animating]);

  const joinSeat = useMutation({
    mutationFn: async (c: string) => (await apiRequest("POST", `/api/darts/tables/${c}/join`)).json() as Promise<{ code: string }>,
    onSuccess: (r) => { refreshCoins(); if (r.code === code) onJoined(); else onGo(r.code); },
    onError: (e: Error) => toast({ title: srv(e.message), variant: "destructive" }),
  });
  const cancel = useMutation({
    mutationFn: () => apiRequest("POST", `/api/darts/tables/${code}/cancel`),
    onSuccess: () => { refreshCoins(); onExit(); },
    onError: (e: Error) => toast({ title: srv(e.message), variant: "destructive" }),
  });

  if (!table) return <div className="py-20"><Loader2 className="w-10 h-10 animate-spin text-yellow-400" /></div>;
  const seat = table.seat;
  const path = `/phi-tieu?table=${code}`;
  const stakeText = table.stake ? `${fmtCoins(table.stake)} 🪙` : tr("Miễn phí", "Free", "免費");

  if (table.status === "waiting") {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-3 py-6 text-center" data-testid="darts-waiting">
        <motion.div className="text-7xl" animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 2.4 }}>🎯</motion.div>
        <p className="font-display text-2xl text-yellow-300">{seat === 0 ? tr("Đang chờ đối thủ…", "Waiting for an opponent…", "等待對手中…") : tr(`${table.names[0]} mời bạn ném phi tiêu`, `${table.names[0]} wants a game of darts`, `${table.names[0]} 邀你玩飛鏢`)}</p>
        <p className="text-white/70 text-sm">{tr("Mức cược", "Stake", "底注")}: <b className="text-yellow-300">{stakeText}</b> · {table.legs === 3 ? tr("Thắng 2/3 ván", "Best of 3", "三局兩勝") : tr("1 ván", "1 leg", "1 局")} · <span className="font-mono">{code}</span></p>
        {seat === 0 && (
          <>
            <button type="button" onClick={() => setInviteOpen(true)} className="w-full rounded-2xl py-3 font-black text-black bg-gradient-to-r from-yellow-300 to-orange-500 flex items-center justify-center gap-2" data-testid="button-darts-invite"><UserPlus className="w-5 h-5" />{tr("Mời bạn bè", "Invite a friend", "邀請好友")}</button>
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${path}`); toast({ title: tr("Đã sao chép link!", "Link copied!", "已複製連結！") }); } catch { /* ignore */ } }}
              className="w-full rounded-2xl py-2.5 font-bold text-white/80 bg-white/5 border border-white/10 flex items-center justify-center gap-2"><Share2 className="w-4 h-4" />{tr("Sao chép link bàn", "Copy table link", "複製牌桌連結")}</button>
            <button type="button" onClick={() => cancel.mutate()} className="text-sm text-red-300/80 underline flex items-center gap-1" data-testid="button-darts-cancel"><X className="w-4 h-4" />{tr("Huỷ bàn (hoàn cược)", "Close table (stake refunded)", "關閉牌桌（退還底注）")}</button>
          </>
        )}
        {seat === null && (
          <>
            <button type="button" disabled={joinSeat.isPending} onClick={() => joinSeat.mutate(code)} className="w-full rounded-2xl py-3.5 font-black text-black bg-gradient-to-r from-emerald-300 to-emerald-500 flex items-center justify-center gap-2 text-lg" data-testid="button-darts-take-seat">
              {joinSeat.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : `🎯 ${tr("Vào chơi", "Join", "加入")}${table.stake ? ` (${stakeText})` : ""}`}
            </button>
            <button type="button" onClick={onExit} className="text-sm text-white/60 underline">{tr("Sảnh", "Lobby", "大廳")}</button>
          </>
        )}
        <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} path={path} game="darts" />
      </div>
    );
  }

  const g = game ?? table.game;
  if (!g) return null;
  const names: [string, string] = [table.names[0], table.names[1] ?? "…"];
  const myTurn = seat !== null && g.turn === seat && table.status === "playing" && !animating && !pending;
  const turnName = names[g.turn];
  const rm = table.rematch;
  const opp = seat === null ? null : (1 - seat) as Seat;

  return (
    <div className="w-full max-w-md flex flex-col gap-1.5 relative" data-testid="darts-online">
      <Scoreboard game={g} names={names} me={seat} online={table.online} msLeft={table.status === "playing" && !animating ? msLeft : null} clockMs={DARTS_DART_MS} />
      <div className="flex items-center justify-between text-[11px] text-white/50 px-1">
        <span>{table.stake ? `🏆 ${fmtCoins(table.stake * 2)} 🪙` : tr("Bàn miễn phí", "Friendly table", "友誼賽")}</span>
        <span className={connected ? "" : "text-red-300"}>{connected ? `👁 ${table.spectators} ${tr("người xem", "watching", "人觀戰")}` : tr("mất kết nối", "offline", "已離線")}</span>
      </div>
      <div className="relative">
        <Stage ref={stage} canThrow={myTurn} watchOnly={seat === null} color={SEAT_COLORS[seat ?? 0]} ghost={myTurn ? null : ghost}
          onThrow={(t) => { setPending(true); send({ t: "throw", ...t }); }}
          onAimLive={seat !== null ? onAimLive : undefined}
          dartsLeft={table.status === "playing" ? 3 - g.visit.length : undefined}
          idleText={table.status === "playing" && !myTurn && !animating ? (seat === null ? tr(`${turnName} đang ngắm…`, `${turnName} is aiming…`, `${turnName} 正在瞄準…`) : tr("Lượt đối thủ", "Their turn", "對手回合")) : undefined} />
        {emotes.map((e) => (
          <motion.div key={e.id} initial={{ y: 10, opacity: 0, scale: 0.6 }} animate={{ y: -30, opacity: 1, scale: 1.2 }} transition={{ duration: 0.6 }}
            className={`absolute top-16 ${e.seat === (seat ?? 0) ? "left-6" : "right-6"} text-5xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)] pointer-events-none`}>{e.e}</motion.div>
        ))}
      </div>
      {seat !== null && table.status === "playing" && (
        <div className="flex items-center gap-1 justify-center flex-wrap">
          {DARTS_EMOTES.map((e) => (
            <button key={e} type="button" onClick={() => send({ t: "emote", e })} className="w-9 h-9 rounded-full bg-white/10 text-lg active:scale-90" data-testid={`darts-emote-${e}`}>{e}</button>
          ))}
          <button type="button" onClick={() => { if (confirm(tr("Đầu hàng và thua trận này?", "Resign and lose this match?", "確定認輸並輸掉這場比賽嗎？"))) send({ t: "resign" }); }} className="ml-1 px-3 h-9 rounded-full bg-red-900/60 text-red-200 text-xs font-black flex items-center gap-1" data-testid="button-darts-resign"><Flag className="w-3.5 h-3.5" />{tr("Đầu hàng", "Resign", "認輸")}</button>
        </div>
      )}
      {seat === null && <button type="button" onClick={onExit} className="py-2 rounded-xl bg-white/5 text-white/70 font-black text-sm">{tr("Sảnh", "Lobby", "大廳")}</button>}

      {ended && !animating && (
        <EndBanner
          title={seat === null ? `${names[ended.winner]} ${tr("thắng", "wins", "獲勝")}` : ended.winner === seat ? tr("BẠN THẮNG!", "YOU WIN!", "你贏了！") : tr("BẠN THUA", "YOU LOSE", "你輸了")}
          sub={`${ended.payout ? `${ended.winner === seat ? "+" : ""}${fmtCoins(ended.payout)} 🪙 ` : ""}${{
            resign: tr("(đầu hàng)", "(resigned)", "（認輸）"), left: tr("(đối thủ rời bàn)", "(opponent left)", "（對手離桌）"), timeouts: tr("(hết giờ quá nhiều lần)", "(ran out of time too often)", "（多次超時）"),
          }[ended.reason] ?? ""}`}
          extra={seat !== null && rm && rm.by === opp ? (
            <button type="button" onClick={() => joinSeat.mutate(rm.code)} disabled={joinSeat.isPending} className="w-full py-2.5 rounded-xl font-black text-black bg-gradient-to-r from-emerald-300 to-emerald-500" data-testid="button-darts-accept-rematch">
              {tr(`${names[opp]} muốn đấu lại — Vào!`, `${names[opp]} wants a rematch — Join!`, `${names[opp]} 想再戰 — 加入！`)}
            </button>
          ) : undefined}
          actions={[
            ...(seat !== null && !rm ? [{ label: tr("Đấu lại", "Rematch", "再戰"), onClick: () => send({ t: "rematch" }), testid: "button-darts-rematch" }] : []),
            ...(seat !== null && rm && rm.by === seat ? [{ label: tr("Tới bàn mới", "Go to new table", "前往新牌桌"), onClick: () => onGo(rm.code) }] : []),
            { label: tr("Sảnh", "Lobby", "大廳"), onClick: onExit },
          ]}
        />
      )}
    </div>
  );
}

// =====================================================================================
// Daily 9-Dart Challenge
// =====================================================================================

function useCountdown(to: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!to) return "";
  const ms = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** The draught: an arrow showing which way it pushes the darts */
function Draught({ c }: { c: DailyView["conditions"] }) {
  const tr = useTr();
  const strength = Math.hypot(c.driftX, c.driftY);
  const deg = (Math.atan2(c.driftY, c.driftX) * 180) / Math.PI;
  return (
    <div className="flex items-center gap-2 text-[11px] text-sky-100/80" data-testid="darts-conditions">
      <Wind className="w-4 h-4 text-sky-300 shrink-0" />
      <span className="inline-block text-sky-300 text-base leading-none" style={{ transform: `rotate(${deg}deg)` }}>➜</span>
      <span>{tr(`Gió lùa ${strength.toFixed(1)} mm`, `Draught ${strength.toFixed(1)} mm`, `微風 ${strength.toFixed(1)} 毫米`)} · {tr("Đám đông", "Crowd", "人群")} ×{c.spread.toFixed(2)}</span>
    </div>
  );
}

function DailyPanel() {
  const { tr } = useLang();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const view = useQuery<DailyView>({ queryKey: ["/api/darts/daily"], refetchInterval: 15000 });
  const left = useCountdown(view.data?.endsAt);
  if (!view.data) return <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-yellow-400" /></div>;
  const v = view.data;
  const ranked = v.me.ranked;
  const done = !!ranked?.done;
  return (
    <div className="w-full flex flex-col gap-3" data-testid="darts-daily">
      <div className="relative overflow-hidden rounded-3xl p-4 bg-gradient-to-br from-amber-500/30 via-red-700/40 to-purple-950 border border-yellow-300/40">
        <div className="absolute -right-4 -top-6 text-[7rem] opacity-20 select-none">🎯</div>
        <p className="text-[10px] font-black tracking-[0.25em] text-yellow-200/80 uppercase">{tr("Thử thách mỗi ngày", "Daily challenge", "每日挑戰")} · {v.day}</p>
        <p className="font-display text-3xl text-white leading-none mt-1">{tr("9 phi tiêu", "9 darts", "9 支飛鏢")}</p>
        <p className="text-xs text-white/80 mt-1 leading-snug">{tr("Ném 9 phi tiêu, tổng điểm cao nhất thắng. Mỗi ngày một lượt tính điểm (giờ Việt Nam).", "Throw 9 darts; the highest total wins. One ranked attempt a day (Vietnam time).", "擲 9 支飛鏢，總分最高者獲勝。每天一次排名挑戰（越南時間）。")}</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {v.prizes.map((p, i) => (
            <div key={i} className="rounded-xl bg-black/35 py-1.5 text-center">
              <div className="text-lg leading-none">{["🥇", "🥈", "🥉"][i]}</div>
              <div className="text-xs font-black text-yellow-300 font-mono">{fmtCoins(p)}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Draught c={v.conditions} />
          <span className="text-[11px] text-white/70 font-mono shrink-0">⏱ {left}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={done} onClick={() => setLocation("/phi-tieu?daily=ranked")}
            className="rounded-2xl py-3 font-black text-black bg-gradient-to-r from-yellow-300 to-orange-500 disabled:opacity-50 disabled:from-white/20 disabled:to-white/10 disabled:text-white/70" data-testid="button-darts-daily-ranked">
            {done ? `✅ ${ranked!.score} ${tr("điểm", "pts", "分")}${v.me.rank ? ` · #${v.me.rank}` : ""}` : ranked && ranked.darts.length ? tr("Ném tiếp lượt tính điểm", "Continue ranked", "繼續排名挑戰") : `🏆 ${tr("Lượt tính điểm", "Ranked attempt", "排名挑戰")}`}
          </button>
          <button type="button" onClick={() => setLocation("/phi-tieu?daily=practice")} className="rounded-2xl py-3 font-black text-white bg-white/10 border border-white/15" data-testid="button-darts-daily-practice">
            🎯 {tr("Ném thử", "Practice run", "練習")}
          </button>
        </div>
      </div>

      <div className="rounded-3xl p-3 bg-black/30 border border-white/10" data-testid="darts-daily-board">
        <p className="text-xs font-black uppercase tracking-widest text-yellow-400/80 mb-2 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" />{tr("Bảng xếp hạng hôm nay", "Today's leaderboard", "今日排行榜")}</p>
        {v.top.length ? (
          <div className="space-y-1">
            {v.top.map((e) => (
              <div key={e.username} className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 ${e.username === user?.username ? "bg-yellow-400/15 border border-yellow-300/40" : e.rank <= 3 ? "bg-white/[0.06]" : ""}`} data-testid={`darts-daily-row-${e.rank}`}>
                <span className="w-6 text-center font-black text-sm text-white/80">{e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : e.rank}</span>
                <Avatar user={e} size={30} />
                <span className="flex-1 min-w-0 font-bold text-white text-sm truncate">{e.username}</span>
                {e.darts < DAILY_DARTS && <span className="text-[10px] text-white/40">{e.darts}/{DAILY_DARTS}</span>}
                <span className="font-mono font-black text-yellow-300">{e.score}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-white/45 text-center py-4">{tr("Chưa ai ném hôm nay. Hãy là người đầu tiên!", "Nobody has thrown today. Be the first!", "今天還沒有人挑戰。搶先上榜吧！")}</p>}
        {v.me.rank && v.me.rank > v.top.length && ranked && (
          <p className="mt-2 text-center text-xs text-white/70">{tr(`Bạn: hạng ${v.me.rank} · ${ranked.score} điểm`, `You: #${v.me.rank} · ${ranked.score} pts`, `你：第 ${v.me.rank} 名 · ${ranked.score} 分`)}</p>
        )}
      </div>

      {v.yesterday && v.yesterday.winners.length > 0 && (
        <div className="rounded-2xl p-3 bg-white/[0.04] border border-white/10">
          <p className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-1">{tr("Hôm qua", "Yesterday", "昨天")} · {v.yesterday.day}</p>
          {v.yesterday.winners.map((w, i) => (
            <p key={w.username} className="text-sm text-white/85">{["🥇", "🥈", "🥉"][i]} <b>{w.username}</b> · {w.score} · <span className="text-yellow-300">+{fmtCoins(w.prize)}</span></p>
          ))}
        </div>
      )}
      <p className="text-[11px] text-white/45 text-center px-2">{tr(`Giải thưởng ${DAILY_PRIZES.map(fmtCoins).join(" / ")} xu trả lúc nửa đêm giờ Việt Nam.`, `Prizes of ${DAILY_PRIZES.map(fmtCoins).join(" / ")} coins are paid at Vietnam midnight.`, `${DAILY_PRIZES.map(fmtCoins).join(" / ")} 金幣獎金於越南時間午夜發放。`)}</p>
    </div>
  );
}

function DailyGame({ ranked, onExit }: { ranked: boolean; onExit: () => void }) {
  const { tr, lang, srv } = useLang();
  const { toast } = useToast();
  const stage = useRef<StageHandle>(null);
  const view = useQuery<DailyView>({ queryKey: ["/api/darts/daily"] });
  const [darts, setDarts] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await (await apiRequest("POST", "/api/darts/daily/start", { ranked })).json() as { darts: Hit[] };
        setDarts(r.darts);
        const n = r.darts.length % 3;
        if (n) stage.current?.set(r.darts.slice(-n).map((h) => ({ hit: h, color: SEAT_COLORS[0] })));
      } catch (e) {
        toast({ title: srv((e as Error).message), variant: "destructive" });
        onExit();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked]);

  const onThrow = async (t: ThrowRequest) => {
    if (!darts || busy || darts.length >= DAILY_DARTS) return;
    setBusy(true);
    try {
      const r = await (await apiRequest("POST", "/api/darts/daily/throw", { ...t, ranked })).json() as { hit: Hit; darts: Hit[]; score: number; done: boolean };
      if (darts.length % 3 === 0) stage.current?.clear();
      await stage.current?.land(r.hit, SEAT_COLORS[0]);
      setDarts(r.darts);
      const n = r.darts.length;
      if (n % 3 === 0) {
        const visit = r.darts.slice(n - 3);
        const total = visit.reduce((a, h) => a + h.score, 0);
        await dartShow(stage.current, r.hit, "visit", { by: 0, darts: visit, total, bust: false, checkout: false }, lang);
      } else await dartShow(stage.current, r.hit, "scored", undefined, lang);
      if (r.done) {
        setFinished(true);
        queryClient.invalidateQueries({ queryKey: ["/api/darts/daily"] });
        soundManager.win(false);
        if (r.score >= 200) fireworks(2000);
      }
    } catch (e) {
      toast({ title: srv((e as Error).message), variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!darts) return <div className="py-20"><Loader2 className="w-10 h-10 animate-spin text-yellow-400" /></div>;
  const score = darts.reduce((a, h) => a + h.score, 0);
  const v = view.data;
  return (
    <div className="w-full max-w-md flex flex-col gap-1.5" data-testid="darts-daily-game">
      <div className="rounded-2xl px-3 py-2 bg-black/35 border border-yellow-400/30 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-yellow-300/80">{ranked ? `🏆 ${tr("Lượt tính điểm", "Ranked attempt", "排名挑戰")}` : `🎯 ${tr("Ném thử (không tính)", "Practice (not ranked)", "練習（不計分）")}`}</p>
          <div className="flex gap-1 mt-1">
            {Array.from({ length: DAILY_DARTS }, (_, i) => (
              <span key={i} className={`flex-1 h-5 rounded text-[9px] font-black flex items-center justify-center ${i < darts.length ? (darts[i].score ? "bg-yellow-400/80 text-black" : "bg-white/15 text-white/60") : "bg-white/5 text-white/20"} ${i % 3 === 2 ? "mr-1" : ""}`}>
                {i < darts.length ? hitLabel(darts[i]) : "·"}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-white/50">{tr("Tổng", "Total", "總分")}</p>
          <p className="font-mono font-black text-3xl text-yellow-200 leading-none" data-testid="darts-daily-score">{score}</p>
        </div>
      </div>
      {v && <div className="px-1"><Draught c={v.conditions} /></div>}
      <Stage ref={stage} canThrow={!busy && darts.length < DAILY_DARTS} onThrow={onThrow} color={SEAT_COLORS[0]} dartsLeft={darts.length < DAILY_DARTS ? 3 - (darts.length % 3) : 0} />
      <button type="button" onClick={onExit} className="py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-black text-sm">{tr("Quay lại", "Back", "返回")}</button>
      {finished && !busy && (
        <EndBanner
          title={`${score} ${tr("điểm", "pts", "分")}`}
          sub={ranked
            ? (v?.me.rank ? tr(`Hạng ${v.me.rank} hôm nay`, `#${v.me.rank} today`, `今日第 ${v.me.rank} 名`) : tr("Đã ghi vào bảng xếp hạng", "On the leaderboard", "已登上排行榜"))
            : tr("Chỉ là ném thử: lượt tính điểm mới lên bảng", "Practice only: the ranked attempt is what counts", "僅為練習：排名挑戰才計分")}
          actions={[
            ...(!ranked ? [{ label: tr("Ném thử lại", "Again", "再練一次"), onClick: () => { setFinished(false); stage.current?.clear(); apiRequest("POST", "/api/darts/daily/start", { ranked: false }).then(() => setDarts([])).catch(() => undefined); } }] : []),
            { label: tr("Bảng xếp hạng", "Leaderboard", "排行榜"), onClick: onExit },
          ]}
        />
      )}
    </div>
  );
}

