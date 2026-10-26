import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Copy, Crown, Loader2, Send, Share2, X } from "lucide-react";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/Avatar";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { FRIENDS_KEY } from "@/hooks/use-social";
import { useToast } from "@/hooks/use-toast";
import { KITS, kitOf, tally, REGULATION, inSuddenDeath, LADDER_MIN_KICKS, LADDER_MAX_PER_PAIR_PER_DAY, type LadderView, type LadderRow, type Shootout, type Side } from "@shared/football";
import type { FriendsView } from "@shared/friends";

const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}K` : String(n));

/** A team's shirt as a little badge: the flag on a kit-coloured disc */
export function KitBadge({ kit, size = 40 }: { kit: string; size?: number }) {
  const k = kitOf(kit);
  return (
    <span className="relative inline-flex items-center justify-center rounded-full shrink-0 shadow-md"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${k.shirt} 0 55%, ${k.trim} 55% 62%, ${k.shorts} 62%)`, border: "2px solid rgba(255,255,255,0.35)" }}>
      <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{k.flag}</span>
    </span>
  );
}

/** Pick the team you play as (shirt colours and flag) */
export function KitPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { tr, loc } = useLang();
  const k = kitOf(value);
  return (
    <div className="rounded-3xl p-3 bg-gradient-to-b from-emerald-900/60 to-purple-950/60 border border-emerald-400/25" data-testid="football-kits">
      <div className="flex items-center gap-3 mb-2.5">
        <KitBadge kit={value} size={46} />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300/80">{tr("Đội của bạn", "Your team", "你的球隊")}</p>
          <p className="font-display text-2xl text-white leading-tight truncate">{loc(k)}</p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {KITS.map((kit) => (
          <button key={kit.id} type="button" onClick={() => onChange(kit.id)} aria-label={loc(kit)}
            className={`aspect-square rounded-xl flex items-center justify-center transition active:scale-90 ${kit.id === value ? "bg-yellow-400/25 ring-2 ring-yellow-300" : "bg-black/25"}`} data-testid={`kit-${kit.id}`}>
            <KitBadge kit={kit.id} size={34} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** The big scoreboard: both teams, a ✅/❌ per kick, the score, and whose kick it is */
export function Scoreboard({ names, kits, shootout, active, you }: { names: [string, string]; kits: [string, string]; shootout: Shootout | null; active: Side | null; you?: Side | null }) {
  const { tr } = useLang();
  const s = shootout ?? { first: 0 as Side, kicks: [] };
  const { goals } = tally(s);
  const sd = inSuddenDeath(s) || s.kicks.length > REGULATION * 2;
  const order: Side[] = [s.first, (1 - s.first) as Side];
  return (
    <div className="w-full rounded-2xl bg-gradient-to-b from-[#120a2a] to-[#0a0618] border border-yellow-500/30 shadow-[0_6px_24px_rgba(0,0,0,0.45)] overflow-hidden" data-testid="football-scoreboard">
      {order.map((side) => {
        const mine = s.kicks.filter((k) => k.side === side);
        const reg = mine.slice(0, REGULATION);
        const extra = mine.slice(REGULATION);
        const on = active === side;
        return (
          <div key={side} className={`flex items-center gap-2 px-2.5 py-1.5 ${on ? "bg-yellow-400/10" : ""} ${side === order[0] ? "border-b border-white/5" : ""}`}>
            <KitBadge kit={kits[side]} size={26} />
            <span className={`min-w-0 flex-1 truncate text-sm font-black ${on ? "text-yellow-200" : "text-white/85"}`}>
              {names[side]}{you === side ? <span className="text-[10px] text-emerald-300"> ({tr("bạn", "you", "你")})</span> : null}
            </span>
            <span className="flex items-center gap-[3px]">
              {Array.from({ length: REGULATION }, (_, i) => {
                const k = reg[i];
                return (
                  <motion.span key={i} initial={k ? { scale: 0.2 } : false} animate={{ scale: 1 }}
                    className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] leading-none ${k ? (k.scored ? "bg-emerald-500" : "bg-rose-600") : "bg-white/10 border border-white/15"}`}>
                    {k ? (k.scored ? "✓" : "✕") : ""}
                  </motion.span>
                );
              })}
              {sd && (
                <>
                  <span className="w-px h-4 bg-yellow-400/50 mx-0.5" />
                  {extra.slice(-3).map((k, i) => (
                    <span key={i} className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] ${k.scored ? "bg-emerald-500" : "bg-rose-600"}`}>{k.scored ? "✓" : "✕"}</span>
                  ))}
                </>
              )}
            </span>
            <span className="w-8 text-right font-display text-3xl leading-none text-yellow-300 tabular-nums">{goals[side]}</span>
          </div>
        );
      })}
      {sd && <div className="text-center text-[10px] font-black tracking-[0.25em] text-rose-300 bg-rose-900/30 py-0.5">{tr("LUÂN LƯU ĐỘT TỬ", "SUDDEN DEATH", "驟死賽")}</div>}
    </div>
  );
}

/** Invite a friend to a table: friends list with a button each, plus the plain share link */
export function InviteSheet({ path, onClose }: { path: string; onClose: () => void }) {
  const { tr, srv } = useLang();
  const { toast } = useToast();
  const friends = useQuery<FriendsView>({ queryKey: FRIENDS_KEY });
  const [sent, setSent] = useState<Set<string>>(new Set());
  const url = `${location.origin}${path}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast({ title: tr("Đã sao chép!", "Copied!", "已複製！") }); } catch { /* ignore */ }
  };
  const share = async () => {
    const text = tr("⚽ Vào sút phạt đền với mình trên VnSlot 888!", "⚽ Come take penalties with me on VnSlot 888!", "⚽ 來 VnSlot 888 和我踢點球大戰！");
    try {
      if (navigator.share) { await navigator.share({ title: "VnSlot 888", text, url }); return; }
      await copy();
    } catch { /* cancelled */ }
  };
  const invite = useMutation({
    mutationFn: async (to: string) => { await apiRequest("POST", "/api/invites", { to, game: "football", path }); return to; },
    onSuccess: (to) => { setSent((s) => new Set(s).add(to)); toast({ title: tr(`Đã mời ${to}`, `Invited ${to}`, `已邀請 ${to}`) }); },
    onError: async (e: Error, to) => {
      // The invites service isn't there: fall back to sharing the link
      if (e instanceof ApiError && e.status === 404) { await share(); setSent((s) => new Set(s).add(to)); return; }
      toast({ title: srv(e.message), variant: "destructive" });
    },
  });
  const list = [...(friends.data?.friends ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose} data-testid="football-invite-sheet">
      <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-gradient-to-b from-[#24123f] to-[#120822] border-t-2 sm:border-2 border-yellow-400/40 p-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display text-2xl text-yellow-300">{tr("Mời bạn bè", "Invite a friend", "邀請好友")}</p>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" aria-label="close"><X className="w-5 h-5 text-white/80" /></button>
        </div>
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5 min-h-[6rem]">
          {friends.isLoading ? <Loader2 className="w-6 h-6 animate-spin text-yellow-400 mx-auto mt-6" />
            : list.length ? list.map((f) => (
              <div key={f.username} className="flex items-center gap-3 rounded-2xl p-2.5 bg-white/5 border border-white/5" data-testid={`invite-row-${f.username}`}>
                <Avatar user={f} size={38} online={f.online} />
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white truncate">{f.username}</p>
                  <p className="text-[11px] text-white/45">{f.online ? tr("Đang online", "Online", "在線上") : tr("Ngoại tuyến", "Offline", "離線")}</p>
                </div>
                <button type="button" disabled={sent.has(f.username) || invite.isPending} onClick={() => invite.mutate(f.username)}
                  className={`h-9 px-3.5 rounded-xl text-sm font-black flex items-center gap-1.5 ${sent.has(f.username) ? "bg-emerald-600/40 text-emerald-200" : "bg-gradient-to-b from-yellow-300 to-orange-500 text-black"}`} data-testid={`button-invite-${f.username}`}>
                  {sent.has(f.username) ? <><Check className="w-4 h-4" />{tr("Đã mời", "Sent", "已邀請")}</> : <><Send className="w-4 h-4" />{tr("Mời", "Invite", "邀請")}</>}
                </button>
              </div>
            )) : <p className="text-sm text-white/50 text-center py-6">{tr("Bạn chưa có bạn bè. Gửi link bên dưới nhé!", "No friends yet. Send the link below!", "你還沒有好友。傳送下面的連結吧！")}</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={share} className="flex-1 rounded-2xl py-3 font-black text-black bg-gradient-to-r from-yellow-300 to-orange-500 flex items-center justify-center gap-2" data-testid="button-football-share"><Share2 className="w-5 h-5" />{tr("Chia sẻ link", "Share link", "分享連結")}</button>
          <button type="button" onClick={copy} className="rounded-2xl px-4 font-bold text-white/85 bg-white/10 border border-white/10 flex items-center gap-1.5"><Copy className="w-4 h-4" />{tr("Sao chép", "Copy", "複製")}</button>
        </div>
        <p className="mt-2 text-center font-mono text-[11px] text-white/40 truncate">{url}</p>
      </motion.div>
    </div>
  );
}

function Countdown({ to, serverNow }: { to: string; serverNow: string }) {
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now - offset) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return <span className="font-mono">{d > 0 ? `${d}d ${h}h ${m}m` : `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`}</span>;
}

/** Vua Phạt Đền: this week's top 10, your rating, the prizes and last week's kings */
export function Ladder() {
  const { tr } = useLang();
  const { user } = useAuth();
  const q = useQuery<LadderView & { todayBonusTaken: boolean; dailyWin: number }>({ queryKey: ["/api/football/ladder"], refetchInterval: 20_000 });
  if (!q.data) return <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto mt-8" />;
  const v = q.data;
  const medals = ["🥇", "🥈", "🥉"];
  const row = (r: LadderRow, highlight = false) => (
    <div key={r.username + (highlight ? "-me" : "")} className={`flex items-center gap-2.5 px-3 py-2 ${highlight ? "bg-yellow-400/15 border-y border-yellow-400/40" : "border-b border-white/5"}`} data-testid={`ladder-row-${r.rank}`}>
      <span className={`w-7 text-center font-black ${r.rank <= 3 ? "text-xl" : "text-white/50 text-sm"}`}>{r.rank <= 3 ? medals[r.rank - 1] : r.rank}</span>
      <Avatar user={r} size={34} ring={r.rank === 1} />
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-white truncate">{r.username}{r.username === user?.username ? <span className="text-emerald-300 text-xs"> ({tr("bạn", "you", "你")})</span> : null}</span>
        <span className="block text-[10px] text-white/45">{tr(`${r.played} trận · thắng ${r.won}`, `${r.played} played · ${r.won} won`, `${r.played} 場 · 贏 ${r.won}`)}{r.rank <= 3 && v.prizes[r.rank - 1] ? <span className="text-yellow-300/90"> · +{short(v.prizes[r.rank - 1])}</span> : null}</span>
      </span>
      <span className="font-display text-2xl text-yellow-300 tabular-nums">{r.rating}</span>
    </div>
  );
  const inTop = v.me && v.table.some((r) => r.username === v.me!.username);
  return (
    <div className="w-full flex flex-col gap-3" data-testid="football-ladder">
      <div className="rounded-3xl p-4 bg-gradient-to-br from-yellow-500/30 via-emerald-800/60 to-[#0b0716] border border-yellow-300/40 shadow-[0_10px_40px_rgba(250,204,21,0.2)]">
        <div className="flex items-center gap-3">
          <Crown className="w-10 h-10 text-yellow-300 drop-shadow-[0_0_12px_rgba(250,204,21,0.7)]" />
          <div className="min-w-0">
            <p className="font-display text-2xl text-yellow-200 leading-tight">{tr("Vua Phạt Đền", "Penalty King", "點球之王")}</p>
            <p className="text-[11px] text-white/70">{tr("Kết thúc sau", "Ends in", "結束倒數")} <Countdown to={v.endsAt} serverNow={v.serverNow} /> · {tr("Thứ Hai 00:00 giờ VN", "Monday 00:00 Vietnam time", "越南時間週一 00:00")}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {v.prizes.map((p, i) => (
            <div key={i} className="rounded-2xl bg-black/30 border border-yellow-400/20 py-2 text-center">
              <p className="text-2xl leading-none">{medals[i]}</p>
              <p className="font-black text-yellow-300 text-sm mt-1">+{fmtCoins(p)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-white/60 leading-snug">
          {tr(
            `Điểm Elo chỉ tính từ trận online (tối thiểu ${LADDER_MIN_KICKS} quả, tối đa ${LADDER_MAX_PER_PAIR_PER_DAY} trận/ngày với cùng một đối thủ). Mỗi tuần ai cũng bắt đầu từ 1000. Cần ít nhất ${v.minGames} trận để nhận thưởng.`,
            `Elo rating from online matches only (at least ${LADDER_MIN_KICKS} kicks, at most ${LADDER_MAX_PER_PAIR_PER_DAY} a day against the same opponent). Everyone starts the week at 1000. Play at least ${v.minGames} matches to win a prize.`,
            `Elo 積分只計算線上對戰（至少 ${LADDER_MIN_KICKS} 球，同一對手每天最多 ${LADDER_MAX_PER_PAIR_PER_DAY} 場）。每週所有人從 1000 分開始。至少要踢 ${v.minGames} 場才能領獎。`,
          )}
        </p>
      </div>

      <div className="rounded-3xl bg-black/30 border border-white/10 overflow-hidden">
        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-yellow-400/80 bg-white/5">{tr("Top 10 tuần này", "This week's top 10", "本週前 10 名")}</div>
        {v.table.length ? v.table.map((r) => row(r, r.username === user?.username)) : (
          <p className="text-sm text-white/45 text-center py-6 px-4">{tr("Chưa có ai lên bảng tuần này. Đá online để giành ngôi vua!", "Nobody on the board yet this week. Play online to take the crown!", "本週還沒有人上榜。快去線上對戰奪下王座！")}</p>
        )}
        {v.me && !inTop && row(v.me, true)}
      </div>

      {v.last && v.last.winners.length > 0 && (
        <div className="rounded-3xl p-3 bg-purple-950/60 border border-yellow-500/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400/80 mb-1.5">{tr("Tuần trước", "Last week", "上週")} · {v.last.week}</p>
          {v.last.winners.map((w, i) => (
            <p key={w.username} className="text-sm text-white/85 flex items-center gap-2">{medals[i]} <span className="font-bold truncate flex-1">{w.username}</span><span className="text-white/50 text-xs">{w.rating}</span><span className="text-yellow-300 text-xs font-black">+{short(w.prize)}</span></p>
          ))}
        </div>
      )}
    </div>
  );
}
