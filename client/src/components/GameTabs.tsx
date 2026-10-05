import { Link, useLocation } from "wouter";
import { useLang } from "@/lib/lang-context";

const GAMES = [
  { href: "/slot", icon: "🐉", key: "gameSlot" },
  { href: "/bau-cua", icon: "🦀", key: "gameBauCua" },
  { href: "/roulette", icon: "🎡", key: "gameRoulette" },
  { href: "/blackjack", icon: "🃏", key: "gameBlackjack" },
  { href: "/pool", icon: "🎱", key: "gamePool" },
] as const;

/** Switch between the games; the coin balance is shared by all of them */
export function GameTabs() {
  const { t } = useLang();
  const [location] = useLocation();
  return (
    <nav className="w-full max-w-md grid grid-cols-5 gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur" data-testid="game-tabs">
      {GAMES.map((g) => {
        const active = location.startsWith(g.href);
        return (
          <Link
            key={g.href}
            href={g.href}
            data-testid={`tab-${g.key}`}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-xl py-1.5 sm:py-2 text-[10px] sm:text-xs font-black uppercase tracking-wide transition-colors ${
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
