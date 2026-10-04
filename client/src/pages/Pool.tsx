import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Copy, Eye, Flag, Loader2, Plus, Share2, Users, Wifi, WifiOff, X } from "lucide-react";
import { newGame, playShot, ballsLeft, groupOf, type GameState, type Shot, type Side, type Group } from "@shared/pool/engine";
import { chooseAiShot } from "@shared/pool/ai";
import { POOL_EMOTES, POOL_TURN_MS, type PoolServerMsg, type PoolTable } from "@shared/pool/protocol";
import { Header } from "@/components/Header";
import { GameTabs } from "@/components/GameTabs";
import { PoolGame, type Playback } from "@/components/pool/PoolGame";
import { useAuth } from "@/hooks/use-auth";
import { useGameState, STATE_KEY } from "@/hooks/use-game";
import { usePoolSocket } from "@/hooks/use-pool-socket";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { colorOf, type Aim } from "@/lib/poolDraw";
import { soundManager } from "@/lib/sound";
import { coinBurst, fireworks } from "@/lib/celebrate";
import { ME_KEY } from "@/hooks/use-auth";
import { TournamentPromo } from "@/components/TournamentBits";
import { ShareButton } from "@/components/ShareCard";
import { roundName } from "@shared/tournament";

const TXT = {
  vi: {
    title: "Bi-a 8 bóng", subtitle: "Chơi trực tuyến với bạn bè", practice: "Chơi với máy", practiceSub: "Luyện tập miễn phí",
    create: "Tạo bàn", stake: "Mức cược", free: "Miễn phí", open: "Bàn đang chờ", live: "Đang thi đấu", none: "Chưa có bàn nào. Hãy tạo bàn và mời bạn bè!",
    join: "Vào chơi", watch: "Xem", back: "Quay lại bàn của bạn", waiting: "Đang chờ đối thủ…", invite: "Mời bạn bè", copy: "Sao chép link", copied: "Đã sao chép!",
    cancel: "Huỷ bàn", resign: "Đầu hàng", resignAsk: "Đầu hàng và thua ván này?", you: "Bạn", computer: "Máy", yourTurn: "Lượt của bạn", theirTurn: "Lượt đối thủ",
    solids: "Bi trơn", stripes: "Bi sọc", open8: "Bàn mở", ballInHand: "Bi trong tay", break: "Phá bi",
    foul: { scratch: "Phạm lỗi: bi trắng rơi lỗ", no_hit: "Phạm lỗi: không chạm bi", wrong_ball: "Phạm lỗi: chạm sai bi", no_rail: "Phạm lỗi: không bi nào chạm băng", timeout: "Hết giờ" } as Record<string, string>,
    won: "BẠN THẮNG!", lost: "BẠN THUA", winnerIs: "thắng", again: "Chơi lại", lobby: "Sảnh", reason: { win: "", resign: "(đầu hàng)", left: "(đối thủ rời bàn)", timeouts: "(hết giờ 3 lần)", no_show: "(vắng mặt)" } as Record<string, string>,
    waitOpp: "Đang chờ đối thủ vào bàn", bracket: "Bảng đấu", wonPool: "THẮNG BI-A!",
    spectators: "người xem", offline: "mất kết nối", power: "Kéo để đánh", spin: "Xoáy", top: "Trên", centre: "Giữa", backSpin: "Dưới",
    dragToAim: "Kéo trên bàn để ngắm, kéo thanh lực rồi thả để đánh", placeCue: "Kéo bi trắng để đặt, rồi ngắm và đánh",
    rules: "Luật 8 bóng: phá bi, rồi người đầu tiên đưa bi vào lỗ hợp lệ nhận nhóm (trơn 1-7 hoặc sọc 9-15). Đưa hết bi nhóm mình rồi đưa bi 8 vào lỗ để thắng. Bi 8 vào lỗ sớm là thua. Phạm lỗi (bi trắng rơi, chạm sai bi, không chạm bi, không bi nào chạm băng) thì đối thủ được bi trong tay. Mỗi lượt 45 giây. Bàn có cược: người thắng nhận cả hai phần cược.",
  },
  en: {
    title: "8-Ball Pool", subtitle: "Play your mates online", practice: "Play the computer", practiceSub: "Free practice",
    create: "Create table", stake: "Stake", free: "Free", open: "Open tables", live: "Playing now", none: "No tables yet. Create one and invite your mates!",
    join: "Join", watch: "Watch", back: "Back to your table", waiting: "Waiting for an opponent…", invite: "Invite a friend", copy: "Copy link", copied: "Copied!",
    cancel: "Close table", resign: "Resign", resignAsk: "Resign and lose this game?", you: "You", computer: "Computer", yourTurn: "Your turn", theirTurn: "Their turn",
    solids: "Solids", stripes: "Stripes", open8: "Open table", ballInHand: "Ball in hand", break: "Break",
    foul: { scratch: "Foul: cue ball potted", no_hit: "Foul: missed everything", wrong_ball: "Foul: wrong ball first", no_rail: "Foul: no ball hit a cushion", timeout: "Out of time" } as Record<string, string>,
    won: "YOU WIN!", lost: "YOU LOSE", winnerIs: "wins", again: "Play again", lobby: "Lobby", reason: { win: "", resign: "(resigned)", left: "(opponent left)", timeouts: "(out of time 3 times)", no_show: "(no-show)" } as Record<string, string>,
    waitOpp: "Waiting for your opponent to sit down", bracket: "Bracket", wonPool: "POOL WIN!",
    spectators: "watching", offline: "offline", power: "Pull to shoot", spin: "Spin", top: "Top", centre: "Centre", backSpin: "Back",
    dragToAim: "Drag on the table to aim, pull the power bar and let go to shoot", placeCue: "Drag the cue ball to place it, then aim and shoot",
    rules: "8-ball: break, then the first player to legally pot a ball takes that group (solids 1-7 or stripes 9-15). Clear your group, then pot the 8 to win. Potting the 8 early loses. A foul (cue ball potted, wrong ball first, nothing hit, no cushion after contact) gives the other player ball in hand. 45 seconds a shot. On a staked table the winner takes both stakes.",
  },
};

const fmt = (n: number) => n.toLocaleString();
const fmtStake = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}K` : String(n));

/** A player's card: name, group and balls left, whose turn */
function PlayerCard({ name, group, left, active, online, side, game, msLeft }: {
  name: string; group: Group | null; left: number; active: boolean; online?: boolean; side: "left" | "right"; game: GameState; msLeft?: number | null;
}) {
  const balls = group ? game.balls.filter((b) => groupOf(b.n) === group).sort((a, b) => a.n - b.n) : [];
  return (
    <div className={`flex-1 min-w-0 rounded-xl px-2.5 py-1.5 border transition-all ${active ? "bg-yellow-400/15 border-yellow-300 shadow-[0_0_18px_rgba(250,204,21,0.35)]" : "bg-black/30 border-white/10"} ${side === "right" ? "text-right" : ""}`}>
      <div className={`flex items-center gap-1.5 ${side === "right" ? "justify-end" : ""}`}>
        {online !== undefined && (online ? <Wifi className="w-3 h-3 text-green-400 shrink-0" /> : <WifiOff className="w-3 h-3 text-red-400 shrink-0" />)}
        <span className="font-black text-sm text-white truncate">{name}</span>
      </div>
      <div className={`flex gap-0.5 mt-1 h-3 ${side === "right" ? "justify-end" : ""}`}>
        {group ? balls.map((b) => (
          <span key={b.n} className={`w-3 h-3 rounded-full border ${b.potted ? "opacity-20" : ""} ${b.n > 8 ? "border-white/80" : "border-black/30"}`} style={{ background: b.n > 8 ? `linear-gradient(#fff 25%, ${colorOf(b.n)} 25% 75%, #fff 75%)` : colorOf(b.n) }} />
        )) : <span className="text-[10px] text-white/40">—</span>}
        {group && left === 0 && <span className="w-3 h-3 rounded-full bg-black border border-white/60" title="8" />}
      </div>
      {active && msLeft != null && (
        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className={`h-full ${msLeft < 10000 ? "bg-red-500" : "bg-yellow-400"}`} style={{ width: `${(msLeft / POOL_TURN_MS) * 100}%`, transition: "width 1s linear" }} />
        </div>
      )}
    </div>
  );
}

function statusLine(L: typeof TXT.vi, g: GameState, mine: boolean) {
  const parts: string[] = [];
  if (g.last?.foul) parts.push(L.foul[g.last.foul] ?? g.last.foul);
  parts.push(mine ? L.yourTurn : L.theirTurn);
  if (g.breakShot) parts.push(L.break);
  else if (g.ballInHand) parts.push(L.ballInHand);
  return parts.join(" · ");
}

/** Short how-to under the status line, on the player's own turn */
const hint = (L: typeof TXT.vi, g: GameState) => (g.ballInHand ? L.placeCue : L.dragToAim);

export default function Pool() {
  const { user, isLoading } = useAuth();
  const { lang, t } = useLang();
  const L = TXT[lang];
  const { toast } = useToast();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const tableCode = params.get("table")?.toUpperCase() ?? null;
  const practice = params.get("practice") === "1";

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <Redirect to={`/auth${tableCode ? `?next=${encodeURIComponent(`/pool?table=${tableCode}`)}` : ""}`} />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#062a1d] to-[#0a0515] flex flex-col">
      <Header />
      <main className={`flex-1 flex flex-col items-center relative z-10 ${tableCode || practice ? "gap-1.5 px-2 py-2" : "gap-3 px-3 py-3"}`}>
        {!tableCode && !practice && (
          <div className="text-center">
            <h1 className="font-display text-3xl sm:text-5xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent" data-testid="text-pool-title">{L.title}</h1>
            <p className="text-[11px] sm:text-xs font-black tracking-[0.3em] text-yellow-500/80 uppercase mt-1">🎱 {L.subtitle} 🎱</p>
          </div>
        )}
        {!tableCode && !practice && <GameTabs />}
        {practice ? (
          <PracticeTable L={L} name={user.username} onExit={() => setLocation("/pool")} />
        ) : tableCode ? (
          <OnlineTable L={L} code={tableCode} userId={user.id} onExit={() => setLocation("/pool")} toast={toast} />
        ) : (
          <Lobby L={L} onOpen={(code) => setLocation(`/pool?table=${code}`)} onPractice={() => setLocation("/pool?practice=1")} toast={toast} insufficient={t.insufficientBalanceDesc} />
        )}
      </main>
    </div>
  );
}

// ---------------- Lobby ----------------

function Lobby({ L, onOpen, onPractice, toast, insufficient }: { L: typeof TXT.vi; onOpen: (c: string) => void; onPractice: () => void; toast: ReturnType<typeof useToast>["toast"]; insufficient: string }) {
  const { data: state } = useGameState(true);
  const [stake, setStake] = useState(0);
  const tables = useQuery<{ open: PoolTable[]; live: PoolTable[]; mine: string | null; stakes: number[] }>({ queryKey: ["/api/pool/tables"], refetchInterval: 3000 });
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/pool/tables", { stake })).json() as Promise<{ code: string }>,
    onSuccess: (r) => { queryClient.invalidateQueries({ queryKey: STATE_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); onOpen(r.code); },
    onError: (e: Error) => toast({ title: /balance/i.test(e.message) ? insufficient : e.message, variant: "destructive" }),
  });
  const join = useMutation({
    mutationFn: async (code: string) => (await apiRequest("POST", `/api/pool/tables/${code}/join`)).json() as Promise<{ code: string }>,
    onSuccess: (r) => { queryClient.invalidateQueries({ queryKey: STATE_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); onOpen(r.code); },
    onError: (e: Error) => { toast({ title: /balance/i.test(e.message) ? insufficient : e.message, variant: "destructive" }); tables.refetch(); },
  });
  const stakes = tables.data?.stakes ?? [0, 1000, 10000, 50000, 100000, 500000, 1000000];
  const balance = state?.balance ?? 0;
  const mine = tables.data?.mine;

  return (
    <div className="w-full max-w-md flex flex-col gap-3" data-testid="pool-lobby">
      <TournamentPromo />
      {mine && (
        <button type="button" onClick={() => onOpen(mine)} className="w-full rounded-2xl py-3 font-black text-black bg-gradient-to-r from-yellow-300 to-orange-500" data-testid="button-pool-back">{L.back} ({mine})</button>
      )}
      <button type="button" onClick={onPractice} className="w-full flex items-center gap-3 rounded-2xl p-4 bg-gradient-to-r from-emerald-700 to-emerald-900 border border-emerald-400/40 text-left" data-testid="button-pool-practice">
        <Bot className="w-9 h-9 text-emerald-200" />
        <div><p className="font-black text-white text-lg">{L.practice}</p><p className="text-xs text-emerald-100/70">{L.practiceSub}</p></div>
      </button>

      <div className="rounded-2xl p-4 bg-purple-950/60 border border-yellow-500/25 space-y-3">
        <p className="text-xs font-black uppercase tracking-widest text-yellow-400/80">{L.stake}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {stakes.map((s) => (
            <button key={s} type="button" disabled={s > balance} onClick={() => setStake(s)} className={`py-2 rounded-xl text-sm font-black disabled:opacity-25 ${stake === s ? "bg-yellow-400 text-black" : "bg-white/5 text-white/80"}`} data-testid={`pool-stake-${s}`}>
              {s === 0 ? L.free : fmtStake(s)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => create.mutate()} disabled={create.isPending || !!mine} className="w-full rounded-xl py-3 font-display font-black text-xl text-white bg-gradient-to-b from-yellow-400 via-orange-500 to-red-600 border-b-4 border-red-900 disabled:opacity-50 flex items-center justify-center gap-2" data-testid="button-pool-create">
          {create.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Plus className="w-5 h-5" />{L.create}</>}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-yellow-400/80 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{L.open}</p>
        {tables.data?.open.length ? tables.data.open.map((tb) => (
          <div key={tb.code} className="flex items-center gap-3 rounded-2xl p-3 bg-black/30 border border-white/10" data-testid={`pool-open-${tb.code}`}>
            <span className="text-2xl">🎱</span>
            <div className="flex-1 min-w-0"><p className="font-black text-white truncate">{tb.host}</p><p className="text-xs text-yellow-300">{tb.stake ? `${fmt(tb.stake)} 🪙` : L.free}</p></div>
            <button type="button" onClick={() => join.mutate(tb.code)} disabled={join.isPending || tb.stake > balance || !!mine} className="px-4 py-2 rounded-xl font-black text-sm text-black bg-yellow-400 disabled:opacity-30" data-testid={`button-pool-join-${tb.code}`}>{L.join}</button>
          </div>
        )) : <p className="text-sm text-white/40 text-center py-3">{L.none}</p>}
      </div>

      {!!tables.data?.live.length && (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-yellow-400/80">{L.live}</p>
          {tables.data.live.map((tb) => (
            <div key={tb.code} className="flex items-center gap-3 rounded-2xl p-3 bg-black/20 border border-white/5">
              <span className="text-xl">{tb.tournament ? "🏆" : "🔴"}</span>
              <div className="flex-1 min-w-0"><p className="font-bold text-white/90 truncate text-sm">{tb.host} vs {tb.guest}</p><p className="text-xs text-yellow-300/80 truncate">{tb.tournament ?? (tb.stake ? `${fmt(tb.stake)} 🪙` : L.free)}</p></div>
              <button type="button" onClick={() => onOpen(tb.code)} className="px-3 py-2 rounded-xl font-black text-xs text-white bg-white/10 flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{L.watch}</button>
            </div>
          ))}
        </div>
      )}

      <details className="rounded-2xl bg-purple-950/60 border border-yellow-500/20 p-4 text-sm text-yellow-100/70">
        <summary className="font-black text-yellow-400 cursor-pointer">Luật / Rules</summary>
        <p className="mt-2 leading-relaxed">{L.rules}</p>
      </details>
    </div>
  );
}

// ---------------- Practice against the computer ----------------

function PracticeTable({ L, name, onExit }: { L: typeof TXT.vi; name: string; onExit: () => void }) {
  const [game, setGame] = useState<GameState>(() => newGame(undefined, 0));
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [aiAim, setAiAim] = useState<{ aim: Aim; cue: { x: number; y: number } | null } | null>(null);
  const pending = useRef<GameState | null>(null);
  const id = useRef(0);
  const timers = useRef<number[]>([]);

  const run = useCallback((g: GameState, shot: Shot, cue?: { x: number; y: number }) => {
    const r = playShot(g, shot, cue, false);
    const start = g.ballInHand && cue ? g.balls.map((b) => (b.n === 0 ? { ...b, x: cue.x, y: cue.y, potted: false } : b)) : g.balls;
    pending.current = r.state;
    setPlayback({ id: ++id.current, start, shot, onDone: () => { setGame(pending.current!); setPlayback(null); } });
  }, []);

  // The computer's turn: think, show its aim for a moment, shoot
  useEffect(() => {
    if (playback || game.winner !== null || game.turn !== 1) return;
    const think = window.setTimeout(() => {
      const { shot, cue } = chooseAiShot(game);
      setAiAim({ aim: { dx: shot.dx, dy: shot.dy, power: shot.power }, cue: game.ballInHand ? cue ?? null : null });
      const fire = window.setTimeout(() => { setAiAim(null); run(game, shot, cue); }, 900);
      timers.current.push(fire);
    }, 600);
    timers.current.push(think);
  }, [game, playback, run]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (game.winner === 0) { soundManager.win(true); fireworks(2500); }
    else if (game.winner === 1) soundManager.lossComfort();
  }, [game.winner]);

  const groups = game.groups;
  const myTurn = game.turn === 0 && !playback && game.winner === null;
  return (
    <div className="w-full max-w-md flex flex-col gap-2" data-testid="pool-practice">
      <div className="flex gap-2">
        <PlayerCard name={`${name} (${L.you})`} group={groups[0]} left={groups[0] ? ballsLeft(game, groups[0]) : 7} active={game.turn === 0 && game.winner === null} side="left" game={game} />
        <PlayerCard name={`🤖 ${L.computer}`} group={groups[1]} left={groups[1] ? ballsLeft(game, groups[1]) : 7} active={game.turn === 1 && game.winner === null} side="right" game={game} />
      </div>
      <p className="text-center text-xs font-bold text-yellow-100/90 leading-tight min-h-[2rem]" data-testid="pool-status">
        {game.winner === null && !playback ? statusLine(L, game, game.turn === 0) : " "}
        {myTurn && <span className="block text-[10px] font-normal text-emerald-100/60">{hint(L, game)}</span>}
      </p>
      <PoolGame game={game} canShoot={myTurn} onShoot={(s, c) => run(game, s, c)} playback={playback} remoteAim={aiAim}
        labels={{ power: L.power, spin: L.spin, top: L.top, centre: L.centre, back: L.backSpin, dragToAim: L.dragToAim, placeCue: L.placeCue }} />
      <div className="flex gap-2">
        <button type="button" onClick={onExit} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-black text-sm">{L.lobby}</button>
        <button type="button" onClick={() => { setPlayback(null); setGame(newGame(undefined, 0)); }} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-black text-sm">{L.again}</button>
      </div>
      {game.winner !== null && (
        <EndBanner title={game.winner === 0 ? L.won : L.lost} sub="" actions={[{ label: L.again, onClick: () => setGame(newGame(undefined, 0)) }, { label: L.lobby, onClick: onExit }]} />
      )}
    </div>
  );
}

function EndBanner({ title, sub, actions, extra }: { title: string; sub: string; actions: { label: string; onClick: () => void }[]; extra?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" data-testid="pool-end">
      <div className="w-full max-w-xs rounded-3xl p-6 text-center bg-gradient-to-b from-[#2a0f4f] to-[#140726] border-2 border-yellow-400/60 shadow-[0_0_50px_rgba(250,204,21,0.35)]">
        <p className="text-5xl mb-2">🎱</p>
        <p className="font-display text-4xl text-yellow-300">{title}</p>
        {sub && <p className="mt-2 text-white/80 font-bold">{sub}</p>}
        {extra && <div className="mt-4">{extra}</div>}
        <div className="mt-5 flex gap-2">
          {actions.map((a) => <button key={a.label} type="button" onClick={a.onClick} className="flex-1 py-2.5 rounded-xl font-black text-black bg-gradient-to-b from-yellow-300 to-orange-500">{a.label}</button>)}
        </div>
      </div>
    </div>
  );
}

// ---------------- Online table ----------------

type StateMsg = Extract<PoolServerMsg, { t: "state" }>;

function OnlineTable({ L, code, userId, onExit, toast }: { L: typeof TXT.vi; code: string; userId: string; onExit: () => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const [table, setTable] = useState<StateMsg | null>(null);
  const [, nav] = useLocation();
  const [game, setGame] = useState<GameState | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [remoteAim, setRemoteAim] = useState<{ aim: Aim; cue: { x: number; y: number } | null } | null>(null);
  const [emotes, setEmotes] = useState<{ id: number; e: string; side: Side | null }[]>([]);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const queue = useRef<Extract<PoolServerMsg, { t: "shot" }>[]>([]);
  const animating = useRef(false);
  const id = useRef(0);
  const lastState = useRef<StateMsg | null>(null);

  const playNext = useCallback(() => {
    const next = queue.current.shift();
    if (!next) { animating.current = false; if (lastState.current?.game) setGame(lastState.current.game); return; }
    animating.current = true;
    setRemoteAim(null);
    setPlayback({ id: ++id.current, start: next.start, shot: next.shot, onDone: () => { setGame(next.state); setPlayback(null); playNext(); } });
  }, []);

  const { connected, send } = usePoolSocket(code, (m) => {
    if (m.t === "state") {
      lastState.current = m;
      setTable(m);
      setMsLeft(m.turnMsLeft);
      if (!animating.current) setGame(m.game);
      if (m.result) {
        queryClient.invalidateQueries({ queryKey: STATE_KEY });
        queryClient.invalidateQueries({ queryKey: ME_KEY });
      }
    } else if (m.t === "shot") {
      // The shot's outcome is newer than any table state we already hold
      if (lastState.current) lastState.current = { ...lastState.current, game: m.state };
      queue.current.push(m);
      if (!animating.current) playNext();
    } else if (m.t === "aim") {
      if (!animating.current) setRemoteAim({ aim: { dx: m.dx, dy: m.dy, power: m.power }, cue: m.cue });
    } else if (m.t === "emote") {
      const e = { id: Date.now() + Math.random(), e: m.e, side: m.from };
      setEmotes((list) => [...list, e]);
      setTimeout(() => setEmotes((list) => list.filter((x) => x.id !== e.id)), 2600);
    } else if (m.t === "error") {
      toast({ title: m.message, variant: "destructive" });
    } else if (m.t === "closed") {
      toast({ title: m.reason === "expired" ? "⏱" : "✖", description: m.reason });
      onExit();
    }
  });

  // Count the shot clock down locally between server updates
  useEffect(() => {
    if (msLeft == null) return;
    const t = window.setInterval(() => setMsLeft((v) => (v == null ? v : Math.max(0, v - 1000))), 1000);
    return () => clearInterval(t);
  }, [msLeft != null, table?.game?.shots, table?.game?.turn]);

  const lastAimSent = useRef(0);
  const onAim = useCallback((aim: Aim, cue: { x: number; y: number } | null) => {
    const now = Date.now();
    if (now - lastAimSent.current < 90) return;
    lastAimSent.current = now;
    send({ t: "aim", dx: aim.dx, dy: aim.dy, power: aim.power, cue });
  }, [send]);

  const ended = table?.result;
  useEffect(() => {
    if (!ended || table?.seat == null) return;
    if (ended.winner === table.seat) { soundManager.win(true); fireworks(3000); coinBurst(); }
    else soundManager.lossComfort();
  }, [ended?.winner]);

  const inviteUrl = `${location.origin}/pool?table=${code}`;
  const share = async () => {
    const text = `🎱 VnSlot 888 – ${L.invite}`;
    try {
      if (navigator.share) { await navigator.share({ title: "VnSlot 888", text, url: inviteUrl }); return; }
      await navigator.clipboard.writeText(inviteUrl);
      toast({ title: L.copied });
    } catch { /* cancelled */ }
  };
  const cancel = useMutation({
    mutationFn: () => apiRequest("POST", `/api/pool/tables/${code}/cancel`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: STATE_KEY }); queryClient.invalidateQueries({ queryKey: ME_KEY }); onExit(); },
  });

  if (!table) return <div className="py-20"><Loader2 className="w-10 h-10 animate-spin text-yellow-400" /></div>;

  const seat = table.seat;
  const names = table.names;
  const g = game ?? table.game;

  if (table.status === "waiting") {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-4 py-6 text-center" data-testid="pool-waiting">
        <div className="text-6xl animate-bounce">🎱</div>
        <p className="font-display text-2xl text-yellow-300">{L.waiting}</p>
        <p className="text-white/70">{table.stake ? `${L.stake}: ${fmt(table.stake)} 🪙` : L.free} · <span className="font-mono">{code}</span></p>
        <button type="button" onClick={share} className="w-full rounded-2xl py-3 font-black text-black bg-gradient-to-r from-yellow-300 to-orange-500 flex items-center justify-center gap-2" data-testid="button-pool-invite"><Share2 className="w-5 h-5" />{L.invite}</button>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(inviteUrl); toast({ title: L.copied }); } catch { /* ignore */ } }} className="w-full rounded-2xl py-2.5 font-bold text-white/80 bg-white/5 border border-white/10 flex items-center justify-center gap-2"><Copy className="w-4 h-4" />{L.copy}</button>
        {seat === 0 && <button type="button" onClick={() => cancel.mutate()} className="text-sm text-red-300/80 underline flex items-center gap-1"><X className="w-4 h-4" />{L.cancel}</button>}
        {seat === null && <button type="button" onClick={onExit} className="text-sm text-white/60 underline">{L.lobby}</button>}
      </div>
    );
  }

  if (!g) return null;
  const ready = table.ready !== false;
  const myTurn = seat !== null && g.turn === seat && table.status === "playing" && !playback && ready;
  const tour = table.tournament;
  const vi = L === TXT.vi;
  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  const left = (s: Side) => (g.groups[s] ? ballsLeft(g, g.groups[s]!) : 7);
  const order: Side[] = seat === 1 ? [1, 0] : [0, 1];
  const label = (s: Side) => `${names[s] ?? "…"}${seat === s ? ` (${L.you})` : ""}`;

  return (
    <div className="w-full max-w-md flex flex-col gap-2 relative" data-testid="pool-online">
      {tour && (
        <button type="button" onClick={() => nav("/tournament")} className="w-full rounded-xl bg-gradient-to-r from-yellow-500/25 to-emerald-600/25 border border-yellow-400/40 py-1 text-xs font-black text-yellow-200" data-testid="pool-tournament-badge">
          🏆 {tour.name} · {roundName(tour.round, tour.rounds, vi ? "vi" : "en")}
        </button>
      )}
      <div className="flex gap-2">
        {order.map((s, i) => (
          <PlayerCard key={s} name={label(s)} group={g.groups[s]} left={left(s)} active={g.turn === s && table.status === "playing"} online={table.online[s]} side={i === 0 ? "left" : "right"} game={g} msLeft={g.turn === s && ready ? msLeft : null} />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] text-white/50 px-1">
        <span>{table.stake ? `🪙 ${fmt(table.stake * 2)}` : L.free}</span>
        <span className={connected ? "" : "text-red-300"}>{connected ? `👁 ${table.spectators} ${L.spectators}` : L.offline}</span>
      </div>
      <p className="text-center text-xs font-bold text-yellow-100/90 leading-tight min-h-[2rem]" data-testid="pool-status">
        {table.status === "playing" && !playback ? (ready ? statusLine(L, g, myTurn) : `⏳ ${L.waitOpp}… ${msLeft != null ? mmss(msLeft) : ""}`) : " "}
        {myTurn && <span className="block text-[10px] font-normal text-emerald-100/60">{hint(L, g)}</span>}
      </p>

      <div className="relative">
        <PoolGame reserveBelow={seat !== null ? 92 : 0} game={g} canShoot={myTurn} onShoot={(shot, cue) => send({ t: "shoot", shot, cue })} playback={playback} remoteAim={myTurn ? null : remoteAim} onAim={seat !== null ? onAim : undefined}
          labels={{ power: L.power, spin: L.spin, top: L.top, centre: L.centre, back: L.backSpin, dragToAim: L.dragToAim, placeCue: L.placeCue }} />
        {emotes.map((e) => (
          <div key={e.id} className={`absolute top-6 ${e.side === (seat ?? 0) ? "left-6" : "right-6"} text-5xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)] pointer-events-none`} style={{ transition: "transform 2.5s ease-out, opacity 2.5s", transform: "translateY(-10px)" }}>{e.e}</div>
        ))}
      </div>

      {seat !== null && table.status === "playing" && (
        <div className="flex items-center gap-1.5 justify-center flex-wrap">
          {POOL_EMOTES.map((e) => (
            <button key={e} type="button" onClick={() => send({ t: "emote", e })} className="w-9 h-9 rounded-full bg-white/10 text-lg active:scale-90" data-testid={`pool-emote-${e}`}>{e}</button>
          ))}
          <button type="button" onClick={() => { if (confirm(L.resignAsk)) send({ t: "resign" }); }} className="ml-2 px-3 h-9 rounded-full bg-red-900/60 text-red-200 text-xs font-black flex items-center gap-1" data-testid="button-pool-resign"><Flag className="w-3.5 h-3.5" />{L.resign}</button>
        </div>
      )}
      {seat === null && <button type="button" onClick={onExit} className="py-2 rounded-xl bg-white/5 text-white/70 font-black text-sm">{L.lobby}</button>}

      {ended && !playback && (
        <EndBanner
          title={seat === null ? `${names[ended.winner]} ${L.winnerIs}` : ended.winner === seat ? L.won : L.lost}
          sub={`${ended.payout ? `${ended.winner === seat ? "+" : ""}${fmt(ended.payout)} 🪙 ` : ""}${L.reason[ended.reason] ?? ""}`}
          actions={tour ? [{ label: L.bracket, onClick: () => nav("/tournament") }] : [{ label: L.lobby, onClick: onExit }]}
          extra={seat !== null && ended.winner === seat ? (
            <ShareButton what={{
              emoji: "🎱",
              title: L.wonPool,
              amount: ended.payout || undefined,
              detail: tour ? `${tour.name} · ${roundName(tour.round, tour.rounds, vi ? "vi" : "en")}` : `${vi ? "Bi-a 8 bóng · thắng" : "8-ball pool · beat"} ${names[(1 - seat) as Side] ?? ""}`,
            }} />
          ) : undefined}
        />
      )}
    </div>
  );
}
