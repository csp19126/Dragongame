import { useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Home, MessageCircle, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import type { AlbumView } from "@shared/stickers";

/** App-style tab bar along the bottom. Hidden on the sign-in page and at a pool table (it needs the room). */
export function BottomNav() {
  const { user } = useAuth();
  const { lang } = useLang();
  const vi = lang === "vi";
  const [location] = useLocation();
  const search = useSearch();
  const album = useQuery<AlbumView>({ queryKey: ["/api/stickers"], enabled: !!user, refetchInterval: 120_000 });
  const params = new URLSearchParams(search);
  const atTable = location === "/pool" && (params.has("table") || params.get("practice") === "1");
  const show = !!user && location !== "/auth" && !atTable;

  // Leave room at the bottom of every page for the bar
  useEffect(() => {
    document.body.classList.toggle("has-bottom-nav", show);
    return () => document.body.classList.remove("has-bottom-nav");
  }, [show]);
  if (!show) return null;

  const packs = album.data ? (album.data.packs.free ? 1 : 0) + album.data.packs.play + album.data.packs.bonus : 0;
  const items = [
    { href: "/", label: vi ? "Sảnh" : "Home", icon: <Home className="w-5 h-5" />, active: location === "/" },
    { href: "/slot", label: "Slot", icon: <span className="text-xl leading-none">🐉</span>, active: location === "/slot" },
    { href: "/pool", label: vi ? "Bi-a" : "Pool", icon: <span className="text-xl leading-none">🎱</span>, active: location.startsWith("/pool") || location === "/tournament" },
    { href: "/community", label: vi ? "Cộng đồng" : "Social", icon: <MessageCircle className="w-5 h-5" />, active: location.startsWith("/community"), badge: packs },
    { href: "/profile", label: vi ? "Tôi" : "Me", icon: <User className="w-5 h-5" />, active: location === "/profile" || location === "/coins" },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-[#0b0716]/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]" data-testid="bottom-nav">
      <div className="max-w-md mx-auto grid grid-cols-5 h-16">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-black transition ${it.active ? "text-yellow-300" : "text-white/55"}`} data-testid={`nav-${it.href === "/" ? "home" : it.href.slice(1)}`}>
            {it.active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gradient-to-r from-yellow-300 to-orange-500" />}
            <span className={`flex items-center justify-center w-10 h-8 rounded-2xl ${it.active ? "bg-yellow-400/15" : ""}`}>{it.icon}</span>
            <span>{it.label}</span>
            {!!it.badge && <span className="absolute top-1.5 right-[22%] min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center">{it.badge}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}
