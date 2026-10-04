import { Link, useLocation } from "wouter";
import { useLang } from "@/lib/lang-context";

const GAMES = [
  { href: "/", icon: "🐉", key: "gameSlot" },
  { href: "/bau-cua", icon: "🦀", key: "gameBauCua" },
  { href: "/roulette", icon: "🎡", key: "gameRoulette" },
  { href: "/blackjack", icon: "🃏", key: "gameBlackjack" },
] as const;

/** Switch between the games; the coin balance is shared by all of them */
export function GameTabs() {
  const { t } = useLang();
  const [location] = useLocation();
  return (
    <nav className="w-full max-w-md grid grid-cols-4 gap-1 p-1.5 rounded-2xl bg-black/40 border border-yellow-500/20" data-testid="game-tabs">
      {GAMES.map((g) => {
        const active = location === g.href;
        return (
          <Link
            key={g.href}
            href={g.href}
            data-testid={`tab-${g.key}`}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-xl py-1.5 sm:py-2 text-[10px] sm:text-xs font-black uppercase tracking-wide transition-colors ${
              active
                ? "bg-gradient-to-b from-yellow-400 to-orange-500 text-black shadow-[0_0_16px_rgba(251,191,36,0.45)]"
                : "text-yellow-100/70 hover:bg-white/10"
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
