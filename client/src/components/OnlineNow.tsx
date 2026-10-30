import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageCircle, Swords } from "lucide-react";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/hooks/use-auth";
import { useSocial } from "@/hooks/use-social";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { LevelBadge, useGameName } from "@/components/SocialBits";
import { ClubTagChip, FactsLine, Sheet } from "@/components/Social3Bits";
import { useSocial3 } from "@/components/Challenge";
import type { ClubTag, PlayerFacts } from "@shared/social3";

interface OnlineRow { username: string; avatarUrl: string | null; level: number; playing: string | null; join: { kind: string; href: string } | null; club: ClubTag | null; friend: boolean; facts?: PlayerFacts }
interface OnlineView { friends: OnlineRow[]; others: OnlineRow[]; total: number }
export const ONLINE_KEY = ["/api/online"];

/** A small "● 12 online" pill that opens the sheet */
export function OnlineNowButton({ className = "" }: { className?: string }) {
  const { tr } = useLang();
  const { user } = useAuth();
  const { openOnline } = useSocial3();
  const q = useQuery<OnlineView>({ queryKey: ONLINE_KEY, enabled: !!user, refetchInterval: 30_000, staleTime: 15_000 });
  const n = q.data?.total ?? 0;
  return (
    <button type="button" onClick={openOnline} className={`h-8 px-3 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-xs font-black flex items-center gap-1.5 active:scale-95 ${className}`} data-testid="button-online-now">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />{q.data ? tr(`${n} đang online`, `${n} online now`, `${n} 人在線`) : tr("Đang online", "Online now", "在線玩家")}
    </button>
  );
}

export function OnlineNowSheet({ onClose }: { onClose: () => void }) {
  const { tr } = useLang();
  const [, setLocation] = useLocation();
  const { connected } = useSocial();
  const showPlayer = usePlayerSheet();
  const { challenge } = useSocial3();
  const gameName = useGameName();
  const q = useQuery<OnlineView>({ queryKey: ONLINE_KEY, refetchInterval: connected ? 20_000 : 10_000, staleTime: 0 });
  const go = (href: string) => { onClose(); setLocation(href); };

  const row = (p: OnlineRow) => {
    const playing = gameName(p.playing);
    return (
      <div key={p.username} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/5" data-testid={`online-${p.username}`}>
        <Avatar user={p} size={42} online onClick={() => showPlayer(p.username)} />
        <button type="button" onClick={() => showPlayer(p.username)} className="flex-1 min-w-0 text-left">
          <span className="flex items-center gap-1.5 min-w-0"><span className="font-black text-white truncate">{p.username}</span><ClubTagChip club={p.club} /><LevelBadge level={p.level} /></span>
          <span className={`block text-[11px] truncate ${playing ? "text-yellow-200" : "text-emerald-300"}`}>{playing ? <>🎮 {playing}</> : tr("Đang online", "Online", "在線上")}</span>
          <FactsLine facts={p.facts} />
        </button>
        {p.join && <button type="button" onClick={() => go(p.join!.href)} className="h-9 px-2.5 rounded-xl bg-emerald-500 text-black text-xs font-black" data-testid={`online-join-${p.username}`}>{tr("Vào bàn", "Join", "加入")}</button>}
        <button type="button" onClick={() => challenge(p.username)} className="h-9 w-9 rounded-xl bg-gradient-to-b from-red-500 to-red-700 text-yellow-100 flex items-center justify-center" aria-label={tr("Thách đấu", "Challenge", "挑戰")} data-testid={`online-challenge-${p.username}`}><Swords className="w-4 h-4" /></button>
        <button type="button" onClick={() => go(`/community?tab=dm&dm=${encodeURIComponent(p.username)}`)} className="h-9 w-9 rounded-xl bg-white/10 text-white flex items-center justify-center" aria-label={tr("Nhắn tin", "Message", "傳訊息")}><MessageCircle className="w-4 h-4" /></button>
      </div>
    );
  };

  const v = q.data;
  return (
    <Sheet title={tr("Đang online", "Online now", "在線玩家")} icon={<span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />} onClose={onClose} testid="online-sheet">
      {!v ? <Loader2 className="w-8 h-8 animate-spin text-yellow-400 mx-auto my-12" /> : (
        <>
          <h3 className="px-4 pt-3 pb-1 text-[11px] font-black uppercase tracking-widest text-yellow-300/80">{tr("Bạn bè", "Friends", "好友")} ({v.friends.length})</h3>
          {v.friends.length ? v.friends.map(row) : <p className="px-4 py-3 text-xs text-white/45">{tr("Chưa có bạn bè nào đang online.", "No friends online right now.", "目前沒有好友在線。")}</p>}
          <h3 className="px-4 pt-4 pb-1 text-[11px] font-black uppercase tracking-widest text-white/50">{tr("Người chơi khác", "Other players", "其他玩家")} ({v.others.length})</h3>
          {v.others.length ? v.others.map(row) : <p className="px-4 py-3 text-xs text-white/45">{tr("Chưa có ai khác.", "Nobody else yet.", "目前沒有其他人。")}</p>}
          <p className="px-4 py-3 text-[10px] text-white/40 text-center">{tr("Chỉ hiện những người cho phép hiện trạng thái online.", "Only players who share their online status are shown.", "只顯示願意公開在線狀態的玩家。")}</p>
        </>
      )}
    </Sheet>
  );
}
