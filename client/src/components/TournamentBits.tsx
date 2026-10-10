import { createPortal } from "react-dom";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { tournamentName, type TournamentView } from "@shared/tournament";

export const TOURNAMENT_KEY = ["/api/tournaments/current"];
const fmt = fmtCoins;

export function useTournament(refetchMs = 15_000) {
  const { user } = useAuth();
  return useQuery<TournamentView>({ queryKey: TOURNAMENT_KEY, refetchInterval: refetchMs, enabled: !!user });
}

/** Pops up on any page when the player's tournament match is waiting for them */
export function TournamentAlert() {
  const { tr } = useLang();
  const [location] = useLocation();
  const search = useSearch();
  const q = useTournament();
  const m = q.data?.myMatch;
  if (!m) return null;
  if (location === "/pool" && new URLSearchParams(search).get("table")?.toUpperCase() === m.code) return null;
  if (location === "/tournament") return null;
  // Into <body>: the header's blur would otherwise pin a fixed element to the header
  return createPortal(
    <Link href={`/pool?table=${m.code}`}
      className="fixed bottom-4 above-nav inset-x-3 z-50 mx-auto max-w-md rounded-2xl bg-gradient-to-r from-emerald-600 to-green-700 border-2 border-yellow-300 shadow-[0_8px_30px_rgba(0,0,0,0.6)] px-4 py-3 flex items-center gap-3"
      data-testid="tournament-alert">
      <span className="text-3xl animate-bounce">🎱</span>
      <span className="flex-1 leading-tight">
        <span className="block font-black text-yellow-100">{tr("Trận đấu của bạn đã sẵn sàng!", "Your tournament match is ready!", "你的錦標賽比賽準備好了！")}</span>
        <span className="block text-xs text-white/90">{tr(`Gặp ${m.opponent} · vào trong 5 phút`, `vs ${m.opponent} · sit down within 5 minutes`, `對手 ${m.opponent} · 請在 5 分鐘內入座`)}</span>
      </span>
      <span className="px-3 py-1.5 rounded-xl bg-yellow-300 text-black font-black text-sm">{tr("Chơi", "Play", "開打")}</span>
    </Link>,
    document.body,
  );
}

/** The tournament on the home page and pool lobby: sign up, or follow it while it's on */
export function TournamentPromo() {
  const { tr, loc } = useLang();
  const tname = (name: string) => tournamentName(name, loc);
  const q = useTournament(30_000);
  const v = q.data;
  const t = v?.tournament;
  const upcoming = t?.status === "open" ? { ...t, joined: v!.joined, count: v!.players.length } : v?.next ? { ...v.next, prizes: t?.prizes, status: "open" } : null;
  if (!v || (!upcoming && t?.status !== "live")) return null;
  const live = t?.status === "live";
  const when = (iso: string) => new Date(iso).toLocaleString(tr("vi-VN", "en-GB", "zh-TW"), { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <Link href="/tournament" className="w-full max-w-md rounded-2xl bg-gradient-to-r from-emerald-800 to-[#2a0f4f] border border-yellow-400/50 px-3 py-2.5 flex items-center gap-3 active:scale-[0.98] transition" data-testid="tournament-promo">
      <Trophy className="w-8 h-8 text-yellow-300 shrink-0" />
      <span className="flex-1 leading-tight min-w-0">
        <span className="block font-black text-yellow-200 text-sm truncate">{live ? `🔴 ${tname(t!.name)}` : tname(upcoming!.name)}</span>
        <span className="block text-[11px] text-white/80 truncate">
          {live
            ? tr("Đang diễn ra · xem bảng đấu", "Live now · see the bracket", "進行中 · 查看賽程表")
            : `${when(upcoming!.startsAt)} · ${tr("giải nhất", "1st prize", "冠軍獎金")} ${fmt((t?.prizes ?? [0])[0])} 🪙`}
        </span>
      </span>
      <span className={`px-2.5 py-1.5 rounded-xl text-xs font-black shrink-0 ${!live && upcoming?.joined ? "bg-emerald-500/30 text-emerald-200" : "bg-yellow-300 text-black"}`}>
        {live ? tr("Xem", "View", "查看") : upcoming?.joined ? tr("Đã đăng ký", "Joined", "已報名") : tr("Đăng ký", "Join", "報名")}
      </span>
    </Link>
  );
}
