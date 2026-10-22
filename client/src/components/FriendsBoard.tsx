import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { LevelBadge } from "@/components/SocialBits";

interface Row { username: string; avatarUrl: string | null; level: number; you: boolean; biggestWin: number; coinsWon: number }

/** Rich list › Friends: you and your friends, by this week's biggest win or coins won */
export function FriendsBoard() {
  const { tr, locale } = useLang();
  const showPlayer = usePlayerSheet();
  const [by, setBy] = useState<"win" | "won">("win");
  const q = useQuery<{ since: string; rows: Row[] }>({ queryKey: ["/api/leaderboard/friends"], refetchInterval: 60_000 });
  if (!q.data) return <div className="flex justify-center p-16"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  const rows = [...q.data.rows].sort((a, b) => (by === "win" ? b.biggestWin - a.biggestWin || b.coinsWon - a.coinsWon : b.coinsWon - a.coinsWon || b.biggestWin - a.biggestWin));
  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`);
  return (
    <div className="p-3 sm:p-6 space-y-3" data-testid="friends-board">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-white/50">{tr("Tuần này, từ", "This week, since", "本週，自")} {new Date(q.data.since).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Ho_Chi_Minh" })}</p>
        <div className="flex rounded-xl bg-black/40 p-0.5">
          <button type="button" onClick={() => setBy("win")} className={`h-8 px-2.5 rounded-lg text-[11px] font-black ${by === "win" ? "bg-yellow-400 text-black" : "text-white/60"}`} data-testid="board-by-win">{tr("Thắng lớn nhất", "Biggest win", "最大贏額")}</button>
          <button type="button" onClick={() => setBy("won")} className={`h-8 px-2.5 rounded-lg text-[11px] font-black ${by === "won" ? "bg-yellow-400 text-black" : "text-white/60"}`} data-testid="board-by-won">{tr("Tổng xu thắng", "Coins won", "總贏金幣")}</button>
        </div>
      </div>
      {rows.length <= 1 && (
        <Link href="/community?tab=friends" className="block rounded-2xl bg-white/5 border border-white/10 p-4 text-center text-sm text-white/70">
          🤝 {tr("Kết bạn để so tài mỗi tuần!", "Add friends to compete every week!", "加好友，每週一起比拚！")} <span className="text-yellow-300 font-black">{tr("Tìm bạn", "Find friends", "找好友")} →</span>
        </Link>
      )}
      {rows.map((r, i) => (
        <button key={r.username} type="button" onClick={() => showPlayer(r.username)}
          className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left border ${r.you ? "bg-yellow-400/10 border-yellow-400/40" : "bg-white/[0.04] border-white/5"}`} data-testid={`board-${r.username}`}>
          <span className="w-8 text-center font-black text-white/70">{medal(i)}</span>
          <Avatar user={r} size={38} />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5"><span className="font-black text-white truncate">{r.username}</span><LevelBadge level={r.level} />{r.you && <span className="text-[10px] text-yellow-300 font-bold">{tr("(bạn)", "(you)", "（你）")}</span>}</span>
            <span className="block text-[10px] text-white/45">{by === "win" ? `${tr("Tổng thắng", "Won", "總贏")} ${fmtCoins(r.coinsWon)}` : `${tr("Lớn nhất", "Best", "最大")} ${fmtCoins(r.biggestWin)}`}</span>
          </span>
          <span className="font-mono font-black text-yellow-300 text-base whitespace-nowrap">{fmtCoins(by === "win" ? r.biggestWin : r.coinsWon)} 🪙</span>
        </button>
      ))}
    </div>
  );
}
