import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { useLang } from "@/lib/lang-context";
import type { AlbumView } from "@shared/stickers";
import { REFERRAL_REWARD } from "@shared/stickers";

/** The admin's announcement, if there is one */
export function AnnouncementBar() {
  const a = useQuery<{ text: string | null }>({ queryKey: ["/api/announcement"], refetchInterval: 120_000 });
  if (!a.data?.text) return null;
  return (
    <div className="w-full max-w-md rounded-xl border border-yellow-400/50 bg-gradient-to-r from-red-900/70 to-purple-900/70 px-3 py-2 flex gap-2 items-start" data-testid="home-announcement">
      <Megaphone className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5" />
      <p className="text-xs text-yellow-100 font-semibold">{a.data.text}</p>
    </div>
  );
}

/** Shortcuts to chat, the sticker album and invites, with a nudge when a free pack is waiting */
export function CommunityStrip() {
  const { lang } = useLang();
  const vi = lang === "vi";
  const album = useQuery<AlbumView>({ queryKey: ["/api/stickers"], refetchInterval: 60_000 });
  const packs = album.data ? (album.data.packs.free ? 1 : 0) + album.data.packs.play + album.data.packs.bonus : 0;
  const tiles = [
    { href: "/community?tab=chat", icon: "💬", title: vi ? "Trò chuyện" : "Chat", sub: vi ? "Gặp người chơi" : "Meet players", badge: 0, id: "chat" },
    { href: "/community?tab=album", icon: "📒", title: vi ? "Sticker" : "Stickers", sub: packs ? (vi ? "Có gói mới!" : "Pack ready!") : (vi ? "Sưu tầm" : "Collect"), badge: packs, id: "album" },
    { href: "/community?tab=invite", icon: "🎁", title: vi ? "Mời bạn" : "Invite", sub: `+${(REFERRAL_REWARD / 1000).toLocaleString()}K`, badge: 0, id: "invite" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 w-full max-w-md" data-testid="community-strip">
      {tiles.map((t) => (
        <Link key={t.id} href={t.href} className="relative rounded-2xl bg-gradient-to-b from-purple-900/70 to-black/50 border border-yellow-500/25 px-2 py-2.5 text-center active:scale-95 transition" data-testid={`home-${t.id}`}>
          <div className="text-2xl leading-none">{t.icon}</div>
          <div className="text-xs font-black text-yellow-200 mt-1">{t.title}</div>
          <div className={`text-[10px] font-bold ${t.badge ? "text-yellow-300 animate-pulse" : "text-white/50"}`}>{t.sub}</div>
          {t.badge > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center">{t.badge}</span>}
        </Link>
      ))}
    </div>
  );
}
