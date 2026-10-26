import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useLang } from "@/lib/lang-context";

const GAMES = [
  { href: "/slot", icon: "🐉", key: "gameSlot" },
  { href: "/slot-777", icon: "7️⃣", key: "gameSlot777" },
  { href: "/bau-cua", icon: "🦀", key: "gameBauCua" },
  { href: "/roulette", icon: "🎡", key: "gameRoulette" },
  { href: "/blackjack", icon: "🃏", key: "gameBlackjack" },
  { href: "/ban-bai", icon: "🀄", key: "gameCardTables" },
  { href: "/pool", icon: "🎱", key: "gamePool" },
  { href: "/da-bong", icon: "⚽", key: "gameFootball" },
  { href: "/loto", icon: "🎟️", key: "gameLoto" },
  { href: "/dua-ngua", icon: "🏇", key: "gameHorse" },
  { href: "/tien-len", icon: "🂡", key: "gameTienLen" },
  { href: "/ban-ca", icon: "🐟", key: "gameBanca" },
] as const;

/** Switch between the games; the coin balance is shared by all of them */
export function GameTabs() {
  const { t } = useLang();
  const [location] = useLocation();
  const nav = useRef<HTMLElement>(null);
  // Scroll the strip so the game you're on is showing
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>("[data-active='true']");
    const n = nav.current;
    if (!el || !n) return;
    const left = el.getBoundingClientRect().left - n.getBoundingClientRect().left + n.scrollLeft;
    n.scrollLeft = left - (n.clientWidth - el.clientWidth) / 2;
  }, [location]);
  return (
    <nav ref={nav} className="w-full max-w-md flex gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur overflow-x-auto scrollbar-hide" data-testid="game-tabs">
      {GAMES.map((g) => {
        const active = location === g.href || location.startsWith(g.href + "/");
        return (
          <Link
            key={g.href}
            href={g.href}
            data-testid={`tab-${g.key}`}
            data-active={active}
            className={`shrink-0 min-w-[4.25rem] flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-xl px-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-black uppercase tracking-wide transition-colors ${
              active
                ? "bg-gradient-to-b from-yellow-300 to-orange-500 text-black shadow-[0_4px_16px_rgba(251,191,36,0.35)]"
                : "text-white/60 hover:bg-white/10"
            }`}
          >
            <span className="text-base sm:text-lg leading-none">{g.icon}</span>
            <span className="truncate">{t[g.key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
