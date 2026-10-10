import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, Crown, Eye, Loader2, Play, Trophy, Users } from "lucide-react";
import { Header } from "@/components/Header";
import { ShareButton } from "@/components/ShareCard";
import { useAuth } from "@/hooks/use-auth";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { roundName, tournamentName, type TournamentView } from "@shared/tournament";

import { TOURNAMENT_KEY } from "@/components/TournamentBits";
const fmt = fmtCoins;

const TXT = {
  vi: {
    title: "Giải Đấu Bi-a", subtitle: "Miễn phí tham gia · thưởng xu lớn",
    status: { open: "Đang mở đăng ký", live: "Đang diễn ra", finished: "Đã kết thúc", cancelled: "Đã huỷ" } as Record<string, string>,
    startsIn: "Bắt đầu sau", started: "Bắt đầu lúc", players: "Cơ thủ", free: "Miễn phí tham gia",
    join: "Đăng ký tham gia", leave: "Huỷ đăng ký", joined: "Bạn đã đăng ký ✓", full: "Đã đủ người",
    yourMatch: "Trận của bạn đã sẵn sàng!", vs: "gặp", play: "Vào bàn ngay", fiveMin: "Bạn có 5 phút để vào bàn, nếu không sẽ bị xử thua.",
    bracket: "Bảng đấu", bye: "miễn đấu", watch: "Xem", noShow: "vắng mặt", tbd: "Chờ…",
    champion: "Nhà vô địch", runnerUp: "Á quân", semi: "Đồng hạng 3", shareChamp: "Khoe danh hiệu",
    next: "Giải tiếp theo", hall: "Bảng vàng", noChamps: "Chưa có nhà vô địch nào. Bạn sẽ là người đầu tiên?",
    rules: "Luật giải", rulesText: [
      "Tham gia miễn phí. Giải thưởng là xu ảo do nhà cái trả, không đổi ra tiền.",
      "Đấu loại trực tiếp, 8 bóng, mỗi cú đánh 45 giây.",
      "Khi trận của bạn sẵn sàng, bạn có 5 phút để vào bàn; không vào sẽ bị xử thua.",
      "Bốc thăm ngẫu nhiên lúc giải bắt đầu. Thiếu người thì có lượt miễn đấu.",
    ],
    none: "Chưa có giải nào được lên lịch.", weekly: "Giải diễn ra mỗi tối thứ Bảy lúc 20:00 (giờ Việt Nam).",
  },
  en: {
    title: "Pool Tournament", subtitle: "Free entry · big coin prizes",
    status: { open: "Registration open", live: "In progress", finished: "Finished", cancelled: "Cancelled" } as Record<string, string>,
    startsIn: "Starts in", started: "Started", players: "Players", free: "Free entry",
    join: "Join the tournament", leave: "Leave", joined: "You're in ✓", full: "Full",
    yourMatch: "Your match is ready!", vs: "vs", play: "Play now", fiveMin: "You have 5 minutes to sit down or you lose the match.",
    bracket: "Bracket", bye: "bye", watch: "Watch", noShow: "no-show", tbd: "TBD",
    champion: "Champion", runnerUp: "Runner-up", semi: "Joint 3rd", shareChamp: "Share my title",
    next: "Next tournament", hall: "Hall of fame", noChamps: "No champions yet. Will you be the first?",
    rules: "Rules", rulesText: [
      "Free to enter. Prizes are play coins paid by the house, with no cash value.",
      "Single elimination, 8-ball, 45 seconds a shot.",
      "When your match is ready you have 5 minutes to sit down, or you lose it.",
      "The draw is random when the tournament starts. Byes fill any gaps.",
    ],
    none: "No tournament is scheduled yet.", weekly: "Every Saturday at 20:00 Vietnam time.",
  },
  zh: {
    title: "撞球錦標賽", subtitle: "免費參加 · 豐厚金幣獎勵",
    status: { open: "開放報名中", live: "進行中", finished: "已結束", cancelled: "已取消" } as Record<string, string>,
    startsIn: "距離開始", started: "開始時間", players: "球手", free: "免費參加",
    join: "報名參加", leave: "取消報名", joined: "你已報名 ✓", full: "名額已滿",
    yourMatch: "你的比賽準備好了！", vs: "對手", play: "立即入座", fiveMin: "你有 5 分鐘入座，否則判定落敗。",
    bracket: "賽程表", bye: "輪空", watch: "觀戰", noShow: "未到場", tbd: "待定…",
    champion: "冠軍", runnerUp: "亞軍", semi: "並列季軍", shareChamp: "分享我的頭銜",
    next: "下一場錦標賽", hall: "名人堂", noChamps: "還沒有冠軍。你會是第一位嗎？",
    rules: "比賽規則", rulesText: [
      "免費參加。獎勵為主辦方發放的遊戲金幣，沒有現金價值。",
      "單淘汰賽，8號球，每次擊球限時 45 秒。",
      "比賽準備好後，你有 5 分鐘入座，否則判定落敗。",
      "錦標賽開始時隨機抽籤。人數不足時以輪空補位。",
    ],
    none: "目前還沒有排定的錦標賽。", weekly: "每週六晚上 20:00（越南時間）舉行。",
  },
};

function useCountdown(target: string | undefined, serverNow: string | undefined) {
  const offset = useMemo(() => (serverNow ? new Date(serverNow).getTime() - Date.now() : 0), [serverNow]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!target) return null;
  const ms = Math.max(0, new Date(target).getTime() - (now + offset));
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function Tournament() {
  const { user, isLoading } = useAuth();
  const { lang, tr, srv, loc } = useLang();
  const tname = (name: string) => tournamentName(name, loc);
  const L = TXT[lang];
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const q = useQuery<TournamentView>({ queryKey: TOURNAMENT_KEY, refetchInterval: 5000, enabled: !!user });
  const act = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "join" | "leave" }) => (await apiRequest("POST", `/api/tournaments/${id}/${action}`)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TOURNAMENT_KEY }),
    onError: (e) => toast({ title: e instanceof ApiError ? srv(e.message) : String(e), variant: "destructive" }),
  });
  const v = q.data;
  const t = v?.tournament;
  const countdown = useCountdown(t?.status === "open" ? t.startsAt : undefined, v?.serverNow);
  const nextCountdown = useCountdown(v?.next?.startsAt, v?.serverNow);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  if (!user) return <Redirect to="/auth?next=%2Ftournament" />;

  const rounds = t?.rounds ?? 0;
  const byRound = Array.from({ length: rounds }, (_, i) => (v?.matches ?? []).filter((m) => m.round === i + 1));
  const me = v?.players.find((p) => p.username === user.username);
  const when = (iso: string) => new Date(iso).toLocaleString(tr("vi-VN", "en-GB", "zh-TW"), { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#062a1d] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center gap-3 px-3 py-3 w-full max-w-md mx-auto" data-testid="page-tournament">
        <div className="text-center">
          <h1 className="font-display text-3xl sm:text-4xl leading-none bg-gradient-to-b from-yellow-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent">{L.title}</h1>
          <p className="text-[11px] font-black tracking-[0.25em] text-yellow-500/80 uppercase mt-1">🏆 {L.subtitle} 🏆</p>
        </div>

        {!v ? <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mt-10" /> : (
          <>
            {v.myMatch && (
              <div className="w-full rounded-2xl p-4 bg-gradient-to-br from-emerald-600 to-green-800 border-2 border-yellow-300 shadow-[0_0_30px_rgba(16,185,129,0.5)] text-center" data-testid="my-match">
                <div className="text-3xl">🎱</div>
                <div className="font-display text-2xl text-yellow-100">{L.yourMatch}</div>
                <div className="text-white font-bold">{L.vs} <b className="text-yellow-200">{v.myMatch.opponent}</b> · {roundName(v.myMatch.round, rounds, lang)}</div>
                <button type="button" onClick={() => setLocation(`/pool?table=${v.myMatch!.code}`)} className="mt-3 w-full py-3 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-lg flex items-center justify-center gap-2" data-testid="button-play-match">
                  <Play className="w-5 h-5" />{L.play}
                </button>
                <p className="text-[11px] text-white/80 mt-2">{L.fiveMin}</p>
              </div>
            )}

            {t ? (
              <div className="w-full rounded-2xl bg-gradient-to-br from-[#2a0f4f] to-[#140726] border border-yellow-400/50 p-4 flex flex-col gap-3" data-testid="tournament-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-2xl text-yellow-300 leading-tight">{tname(t.name)}</div>
                    <div className="text-xs text-white/70 flex items-center gap-1 mt-0.5"><Calendar className="w-3.5 h-3.5" />{when(t.startsAt)}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase ${t.status === "live" ? "bg-red-600 text-white animate-pulse" : t.status === "open" ? "bg-emerald-500 text-black" : "bg-white/10 text-white/70"}`} data-testid="tournament-status">{L.status[t.status]}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["🥇", t.prizes[0]], ["🥈", t.prizes[1]], ["🥉", t.prizes[2]]].map(([icon, n]) => (
                    <div key={icon as string} className="rounded-xl bg-black/30 py-2">
                      <div className="text-xl">{icon}</div>
                      <div className="text-xs font-black text-yellow-200">{fmt(n as number)}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/80 flex items-center gap-1.5"><Users className="w-4 h-4" />{L.players}: <b className="text-white">{v.players.length}/{t.size}</b></span>
                  <span className="text-emerald-300 font-black text-xs">{L.free}</span>
                </div>
                {t.status === "open" && (
                  <>
                    <div className="text-center"><div className="text-[11px] uppercase font-black text-white/50">{L.startsIn}</div><div className="font-mono text-3xl font-black text-white" data-testid="countdown">{countdown}</div></div>
                    {v.joined ? (
                      <div className="flex gap-2">
                        <div className="flex-1 py-3 rounded-xl bg-emerald-600/30 border border-emerald-400/50 text-emerald-200 font-black text-center">{L.joined}</div>
                        <button type="button" onClick={() => act.mutate({ id: t.id, action: "leave" })} className="px-4 rounded-xl bg-white/5 text-white/60 text-sm font-bold" data-testid="button-leave">{L.leave}</button>
                      </div>
                    ) : (
                      <button type="button" disabled={v.players.length >= t.size || act.isPending} onClick={() => act.mutate({ id: t.id, action: "join" })}
                        className="w-full py-3 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-lg disabled:opacity-40" data-testid="button-join">
                        {v.players.length >= t.size ? L.full : L.join}
                      </button>
                    )}
                    {v.players.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {v.players.map((p) => <span key={p.username} className={`px-2 py-0.5 rounded-full text-xs font-bold ${p.username === user.username ? "bg-yellow-400 text-black" : "bg-white/10 text-white/80"}`}>{p.username}</span>)}
                      </div>
                    )}
                  </>
                )}
                {t.status === "finished" && t.winnerName && (
                  <div className="rounded-xl bg-gradient-to-r from-yellow-500/25 to-orange-600/25 border border-yellow-300/60 p-3 text-center" data-testid="champion">
                    <Crown className="w-8 h-8 text-yellow-300 mx-auto" />
                    <div className="text-xs uppercase font-black text-yellow-200/80">{L.champion}</div>
                    <div className="font-display text-3xl text-yellow-200">{t.winnerName}</div>
                    {me?.place && (
                      <div className="mt-2">
                        <ShareButton
                          label={L.shareChamp}
                          what={{
                            emoji: me.place === 1 ? "🏆" : me.place === 2 ? "🥈" : "🥉",
                            title: me.place === 1 ? tr("VÔ ĐỊCH BI-A!", "POOL CHAMPION!", "撞球冠軍！") : me.place === 2 ? tr("Á QUÂN BI-A!", "RUNNER-UP!", "撞球亞軍！") : tr("TOP 4 BI-A!", "TOP 4!", "撞球四強！"),
                            amount: me.prize ?? undefined,
                            detail: tname(t.name),
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full rounded-2xl bg-black/30 border border-white/10 p-5 text-center text-white/70 text-sm">{L.none}<br />{L.weekly}</div>
            )}

            {rounds > 0 && (
              <section className="w-full">
                <h2 className="text-sm font-black uppercase tracking-widest text-yellow-400 mb-2 flex items-center gap-2"><Trophy className="w-4 h-4" />{L.bracket}</h2>
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x" data-testid="bracket">
                  {byRound.map((ms, i) => (
                    <div key={i} className="min-w-[150px] snap-start flex flex-col gap-2 justify-around">
                      <div className="text-[11px] font-black uppercase text-white/60 text-center">{roundName(i + 1, rounds, lang)}</div>
                      {ms.map((m) => (
                        <div key={m.id} className={`rounded-xl border overflow-hidden text-xs ${m.status === "playing" ? "border-red-400 shadow-[0_0_12px_rgba(248,113,113,0.5)]" : "border-white/15"}`} data-testid={`match-${m.round}-${m.slot}`}>
                          {([1, 2] as const).map((side) => {
                            const name = side === 1 ? m.name1 : m.name2;
                            const won = m.winner === side;
                            return (
                              <div key={side} className={`px-2 py-1.5 flex items-center justify-between gap-1 ${side === 2 ? "border-t border-white/10" : ""} ${won ? "bg-yellow-400/20 text-yellow-200 font-black" : m.winner ? "bg-black/30 text-white/40 line-through" : "bg-black/30 text-white"}`}>
                                <span className="truncate">{name ?? (m.reason === "bye" && side === 2 ? `— ${L.bye}` : L.tbd)}</span>
                                {won && <span>✓</span>}
                              </div>
                            );
                          })}
                          {m.status === "playing" && m.code && (
                            <Link href={`/pool?table=${m.code}`} className="block text-center text-[11px] font-black bg-red-600 text-white py-1"><Eye className="w-3 h-3 inline mr-1" />{L.watch}</Link>
                          )}
                          {m.reason === "no_show" && <div className="text-center text-[10px] text-white/50 py-0.5">({L.noShow})</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {v.next && (
              <div className="w-full rounded-2xl bg-black/30 border border-emerald-400/40 p-3 flex items-center gap-3" data-testid="next-tournament">
                <div className="flex-1">
                  <div className="text-[11px] uppercase font-black text-emerald-300">{L.next}</div>
                  <div className="font-black text-white">{tname(v.next.name)}</div>
                  <div className="text-xs text-white/60">{when(v.next.startsAt)} · {nextCountdown} · {v.next.count}/{v.next.size}</div>
                </div>
                {v.next.joined ? <span className="text-emerald-300 text-xs font-black">{L.joined}</span> : (
                  <button type="button" onClick={() => act.mutate({ id: v.next!.id, action: "join" })} className="px-3 py-2 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black text-xs font-black" data-testid="button-join-next">{L.join}</button>
                )}
              </div>
            )}

            <section className="w-full rounded-2xl bg-black/30 border border-white/10 p-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-yellow-400 mb-2 flex items-center gap-2"><Crown className="w-4 h-4" />{L.hall}</h2>
              {v.champions.length === 0 ? <p className="text-xs text-white/50">{L.noChamps}</p> : v.champions.map((c, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-sm">
                  <span>{i === 0 ? "👑" : "🏆"}</span>
                  <span className="font-black text-yellow-200 flex-1 truncate">{tname(c.name)}</span>
                  <span className="text-[11px] text-white/50">{new Date(c.date).toLocaleDateString(tr("vi-VN", "en-GB", "zh-TW"))}</span>
                </div>
              ))}
            </section>

            <details className="w-full rounded-2xl bg-black/30 border border-white/10 p-3 text-sm text-white/80">
              <summary className="font-black text-yellow-300 cursor-pointer">{L.rules}</summary>
              <ul className="mt-2 list-disc pl-5 space-y-1">{L.rulesText.map((r) => <li key={r}>{r}</li>)}</ul>
              <p className="mt-2 text-xs text-white/50">{L.weekly}</p>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
