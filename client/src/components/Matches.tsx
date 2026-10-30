import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Clock, Flag, Loader2, Swords, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { useSocialEvent } from "@/hooks/use-social";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { LevelBadge } from "@/components/SocialBits";
import { ClubTagChip, FactsLine, useInviteGameName, useSocialErr, safeInternalPath } from "@/components/Social3Bits";
import { INVITE_GAMES, MATCH_MINUTES, MATCH_STAKES, MATCH_NOTE_MAX, type InviteGame, type MatchPostView } from "@shared/social3";

const KEY = ["/api/matches"];
const short = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

/** Community › Find a match: short posts saying what you want to play, with Join */
export function MatchesTab() {
  const { tr } = useLang();
  const { toast } = useToast();
  const err = useSocialErr();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const showPlayer = usePlayerSheet();
  const gameName = useInviteGameName();
  const q = useQuery<{ posts: MatchPostView[] }>({ queryKey: KEY, refetchInterval: 20_000 });
  useSocialEvent((m) => { if (m.t === "matches") queryClient.invalidateQueries({ queryKey: KEY }); });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const [game, setGame] = useState<InviteGame>("pool");
  const [stake, setStake] = useState(0);
  const [minutes, setMinutes] = useState<number>(30);
  const [note, setNote] = useState("");
  const post = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/matches", { game, stake, minutes, note: note.trim() || null })).json(),
    onSuccess: () => { soundManager.pop(); setNote(""); queryClient.invalidateQueries({ queryKey: KEY }); toast({ title: tr("Đã đăng! Ai bấm Vào chơi sẽ mời bạn vào bàn.", "Posted! Anyone who taps Join will set up the table with you.", "已發布！有人點「加入」就會邀你入座。") }); },
    onError: (e) => toast({ title: err(e), variant: "destructive" }),
  });
  const join = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/matches/${id}/join`)).json() as Promise<{ href: string }>,
    onSuccess: (r) => { if (safeInternalPath(r.href)) setLocation(r.href); },
    onError: (e) => { toast({ title: err(e), variant: "destructive" }); queryClient.invalidateQueries({ queryKey: KEY }); },
  });
  const close = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/matches/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const report = async (id: number) => {
    if (!confirm(tr("Báo cáo bài này cho quản trị viên?", "Report this post to the admins?", "要向管理員檢舉這則貼文嗎？"))) return;
    try { await apiRequest("POST", `/api/matches/${id}/report`, {}); toast({ title: tr("Đã báo cáo. Cảm ơn bạn!", "Reported. Thank you!", "已檢舉，謝謝你！") }); } catch (e) { toast({ title: err(e), variant: "destructive" }); }
  };
  const posts = q.data?.posts ?? [];
  const mine = posts.find((p) => p.mine);
  const left = (iso: string) => Math.max(1, Math.round((new Date(iso).getTime() - now) / 60_000));

  return (
    <div className="w-full flex flex-col gap-3" data-testid="community-matches">
      <section className="rounded-3xl p-3 bg-gradient-to-br from-emerald-800/70 via-emerald-950/80 to-black/60 border border-emerald-400/40 flex flex-col gap-2.5" data-testid="match-composer">
        <div className="flex items-center gap-2"><Swords className="w-5 h-5 text-emerald-200" /><h2 className="font-display text-xl text-emerald-50 flex-1">{tr("Tìm trận", "Find a match", "找對手")}</h2></div>
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(INVITE_GAMES) as InviteGame[]).map((g) => (
            <button key={g} type="button" onClick={() => setGame(g)} className={`rounded-xl py-2 text-center border ${game === g ? "bg-emerald-300 text-black border-emerald-200" : "bg-black/30 text-white/80 border-white/10"}`} data-testid={`match-game-${g}`}>
              <span className="block text-xl leading-none">{INVITE_GAMES[g].icon}</span>
              <span className="block text-[10px] font-black mt-1 leading-tight">{gameName(g).replace(/^\S+\s/, "")}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MATCH_STAKES.map((s) => (
            <button key={s} type="button" disabled={s > (user?.balance ?? 0)} onClick={() => setStake(s)} className={`h-8 px-3 rounded-full text-xs font-black disabled:opacity-30 ${stake === s ? "bg-yellow-400 text-black" : "bg-black/30 text-white/75"}`} data-testid={`match-stake-${s}`}>{s ? `${short(s)} 🪙` : tr("Miễn phí", "Free", "免費")}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-white/50" />
          {MATCH_MINUTES.map((m) => (
            <button key={m} type="button" onClick={() => setMinutes(m)} className={`h-8 px-3 rounded-full text-xs font-black ${minutes === m ? "bg-white/20 text-white" : "bg-black/30 text-white/60"}`}>{tr(`${m} phút`, `${m} min`, `${m} 分鐘`)}</button>
          ))}
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MATCH_NOTE_MAX} placeholder={tr("Ghi chú (không bắt buộc): \"ván nhanh, ai cũng được\"", "Note (optional): \"quick game, anyone welcome\"", "備註（選填）：「快速一局，歡迎任何人」")}
          className="h-10 rounded-xl bg-black/40 border border-white/15 px-3 text-sm text-white placeholder:text-white/30" data-testid="input-match-note" />
        <button type="button" disabled={post.isPending} onClick={() => post.mutate()} className="h-11 rounded-2xl bg-gradient-to-b from-emerald-300 to-emerald-500 text-black font-black disabled:opacity-50" data-testid="button-match-post">
          {post.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : mine ? tr("Đăng lại (thay bài cũ)", "Post again (replaces yours)", "重新發布（取代舊的）") : tr("Đăng tìm trận", "Post", "發布")}
        </button>
      </section>

      <section className="flex flex-col gap-2" data-testid="match-list">
        {!q.data ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-6" /> : posts.length === 0 ? (
          <p className="rounded-2xl bg-black/30 border border-white/10 px-4 py-8 text-center text-sm text-white/55">{tr("Chưa có ai tìm trận. Đăng một bài, bạn bè và người chơi khác sẽ thấy ngay.", "Nobody's looking right now. Post one and others will see it at once.", "目前沒有人在找對手。發一則，大家馬上就看得到。")}</p>
        ) : posts.map((p) => (
          <motion.div key={p.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl p-3 border flex gap-3 ${p.mine ? "bg-emerald-900/30 border-emerald-400/40" : "bg-black/40 border-white/10"}`} data-testid={`match-${p.id}`}>
            <span className="text-4xl leading-none shrink-0">{INVITE_GAMES[p.game]?.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-black text-white">{gameName(p.game).replace(/^\S+\s/, "")}</span>
                <span className="px-2 h-5 rounded-full bg-yellow-400/20 text-yellow-200 text-[10px] font-black flex items-center">{p.stake ? `${fmtCoins(p.stake)} 🪙` : tr("Miễn phí", "Free", "免費")}</span>
                <span className="text-[10px] text-white/45 flex items-center gap-0.5"><Clock className="w-3 h-3" />{tr(`còn ${left(p.expiresAt)} phút`, `${left(p.expiresAt)} min left`, `剩 ${left(p.expiresAt)} 分鐘`)}</span>
              </div>
              {p.note && <p className="text-sm text-white/85 break-words mt-0.5">“{p.note}”</p>}
              <button type="button" onClick={() => showPlayer(p.author.username)} className="mt-1.5 flex items-center gap-2 min-w-0 text-left">
                <Avatar user={p.author} size={26} online={p.author.online} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1"><span className="text-xs font-black text-white/90 truncate">{p.author.username}</span><ClubTagChip club={p.author.club} /><LevelBadge level={p.author.level} /></span>
                  <FactsLine facts={{ country: p.author.country, languages: p.author.languages, playStyle: p.author.playStyle, favGames: [] }} />
                </span>
              </button>
            </div>
            <div className="flex flex-col items-end justify-between gap-1 shrink-0">
              {p.mine ? (
                <button type="button" onClick={() => close.mutate(p.id)} className="h-9 px-3 rounded-xl bg-white/10 text-white/80 text-xs font-black flex items-center gap-1" data-testid={`match-close-${p.id}`}><X className="w-3.5 h-3.5" />{tr("Đóng", "Close", "關閉")}</button>
              ) : (
                <>
                  <button type="button" disabled={join.isPending} onClick={() => join.mutate(p.id)} className="h-10 px-4 rounded-xl bg-gradient-to-b from-emerald-300 to-emerald-500 text-black text-sm font-black" data-testid={`match-join-${p.id}`}>{tr("Vào chơi", "Join", "加入")}</button>
                  <button type="button" onClick={() => report(p.id)} className="p-1.5 text-white/30" aria-label={tr("Báo cáo", "Report", "檢舉")}><Flag className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
          </motion.div>
        ))}
      </section>
      <p className="text-[10px] text-white/40 text-center">{tr("Mỗi người một bài, tự hết hạn. Vào chơi sẽ mở bàn và mời người đăng.", "One post each, it expires by itself. Join opens a table and invites the poster.", "每人一則，到期自動消失。點加入會開桌並邀請發文者。")}</p>
    </div>
  );
}
