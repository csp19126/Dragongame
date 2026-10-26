import { useLeaderboard } from "@/hooks/use-game";
import { Header } from "@/components/Header";
import { useLang } from "@/lib/lang-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Medal } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { FriendsBoard } from "@/components/FriendsBoard";
import { ClubTagChip } from "@/components/Social3Bits";
import type { ClubTag } from "@shared/social3";

export default function Leaderboard() {
  const { data: leaderboard, isLoading } = useLeaderboard();
  const { t, tr } = useLang();
  const { user } = useAuth();
  const [tab, setTab] = useState<"rich" | "friends">(() => (new URLSearchParams(window.location.search).get("tab") === "friends" ? "friends" : "rich"));
  const showPlayer = usePlayerSheet();

  const getRankIcon = (index: number) => {
    if (index === 0) return <Medal className="w-6 h-6 text-yellow-500" />; // Gold
    if (index === 1) return <Medal className="w-6 h-6 text-gray-400" />;   // Silver
    if (index === 2) return <Medal className="w-6 h-6 text-amber-700" />;  // Bronze
    return <span className="font-mono font-bold text-muted-foreground">#{index + 1}</span>;
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[60%] h-[60%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-yellow-500/5 blur-[100px] rounded-full pointer-events-none" />

      <Header />
      <div className="container mx-auto px-3 sm:px-6 py-6 sm:py-12 max-w-4xl relative z-10">
        <Card className="border-0 shadow-2xl bg-black/40 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="text-center pt-10 pb-6 border-b border-white/5">
            <CardTitle className="text-5xl font-display gold-gradient-text tracking-tight uppercase">{t.leaderboard}</CardTitle>
            <p className="text-white/40 font-black text-xs tracking-[0.4em] mt-2 uppercase">{t.legendsTagline}</p>
          </CardHeader>
          {user && (
            <div className="grid grid-cols-2 gap-1 p-1 mx-4 mt-4 rounded-2xl bg-white/5 border border-white/10" data-testid="leaderboard-tabs">
              <button type="button" onClick={() => setTab("rich")} className={`h-10 rounded-xl text-sm font-black ${tab === "rich" ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black" : "text-white/60"}`} data-testid="tab-rich">💰 {tr("Đại gia", "Rich list", "富豪榜")}</button>
              <button type="button" onClick={() => setTab("friends")} className={`h-10 rounded-xl text-sm font-black ${tab === "friends" ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black" : "text-white/60"}`} data-testid="tab-friends">🤝 {tr("Bạn bè", "Friends", "好友")}</button>
            </div>
          )}
          <CardContent className="p-0">
            {tab === "friends" && user ? <FriendsBoard /> : isLoading ? (
              <div className="flex justify-center p-20">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-white/5">
                  <TableRow className="hover:bg-transparent border-white/5 h-16">
                    <TableHead className="w-[56px] sm:w-[120px] text-center font-black uppercase text-[10px] tracking-widest text-primary/70">{t.rank}</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest text-primary/70">{t.username}</TableHead>
                    <TableHead className="text-right pr-4 sm:pr-10 font-black uppercase text-[10px] tracking-widest text-primary/70">{t.balance}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard?.map((entry, index) => (
                    <TableRow key={entry.username} className="hover:bg-white/5 border-white/5 h-20 transition-colors">
                      <TableCell className="text-center font-medium">
                        <div className="flex justify-center scale-125">{getRankIcon(index)}</div>
                      </TableCell>
                      <TableCell className="font-black text-lg text-white/80 tracking-tight">
                        {user ? (
                          <button type="button" onClick={() => showPlayer(entry.username)} className="flex items-center gap-2.5 min-w-0 text-left" data-testid={`leader-${entry.username}`}>
                            <Avatar user={entry} size={36} />
                            <span className="truncate">{entry.username}</span>
                            <ClubTagChip club={(entry as { club?: ClubTag | null }).club} />
                          </button>
                        ) : (
                          <span className="flex items-center gap-2.5 min-w-0"><Avatar user={entry} size={36} /><span className="truncate">{entry.username}</span><ClubTagChip club={(entry as { club?: ClubTag | null }).club} /></span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-4 sm:pr-10 font-mono font-black text-lg sm:text-2xl whitespace-nowrap text-yellow-400 drop-shadow-sm">
                        {entry.balance.toLocaleString()} <span className="text-lg">🪙</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {leaderboard?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-20 text-white/30 font-bold italic">
                        {t.emptyLeaderboard}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
