import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLang, LANGUAGES } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { LogOut, Globe, User, Plus, Crown, Trophy, Coins, MessageCircle } from "lucide-react";
import { TournamentAlert } from "@/components/TournamentBits";
import { Avatar } from "@/components/Avatar";
import { useDmUnread } from "@/hooks/use-dm";
import { usePlayerSheet } from "@/components/PlayerSheet";
import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The balance, counting up or down when it changes */
function AnimatedBalance({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [bouncing, setBouncing] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value === prevValue.current) return;
    setBouncing(true);
    const from = prevValue.current;
    prevValue.current = value;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setDisplayValue(Math.round(from + ((value - from) * step) / 20));
      if (step >= 20) {
        clearInterval(interval);
        setTimeout(() => setBouncing(false), 300);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [value]);

  return (
    <motion.span
      animate={bouncing ? { scale: [1, 1.12, 1] } : {}}
      transition={{ duration: 0.4 }}
      className={`font-mono font-black text-sm tracking-tight transition-colors duration-300 ${bouncing ? "text-emerald-300" : "text-yellow-300"}`}
      data-testid="text-balance-value"
    >
      {displayValue.toLocaleString()}
    </motion.span>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const { t, lang, setLang, tr } = useLang();
  const unread = useDmUnread();
  const showPlayer = usePlayerSheet();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-[#0b0716]/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-3 h-14 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 min-w-0" data-testid="link-home">
          <img src="/icons/icon-192.png" alt="" className="w-9 h-9 rounded-xl shadow-[0_0_18px_rgba(251,191,36,0.35)]" />
          <span className="font-display text-xl gold-gradient-text tracking-tight truncate" data-testid="text-brand">VnSlot 888</span>
        </Link>

        <div className="flex items-center gap-1.5">
          {user ? (
            <>
              <Link href="/coins" className="flex items-center gap-1.5 h-9 pl-1.5 pr-1 rounded-full bg-black/40 border border-yellow-400/30 shadow-inner" data-testid="display-balance">
                <Coins className="w-5 h-5 text-yellow-400" />
                <AnimatedBalance value={user.balance} />
                <span className="w-7 h-7 rounded-full bg-gradient-to-b from-yellow-300 to-orange-500 text-black flex items-center justify-center" data-testid="button-top-up"><Plus className="w-4 h-4" /></span>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="relative w-9 h-9 rounded-full" aria-label={user.username} data-testid="button-user-menu">
                    <Avatar user={user} size={36} ring />
                    {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center border border-[#0b0716]">{unread > 99 ? "99+" : unread}</span>}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-[#140b26]/95 backdrop-blur-xl border-white/10 rounded-2xl shadow-2xl p-2" data-testid="menu-user-dropdown">
                  <DropdownMenuItem onClick={() => showPlayer(user.username)} className="rounded-xl p-2 cursor-pointer gap-2.5" data-testid="menu-my-card">
                    <Avatar user={user} size={36} />
                    <span className="min-w-0"><span className="block font-black text-white truncate">{user.username}</span><span className="block text-[11px] text-white/50">{tr("Xem hồ sơ của bạn", "View your profile card", "查看你的個人檔案")}</span></span>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-xl p-3 cursor-pointer">
                    <Link href="/community?tab=dm" data-testid="link-messages"><MessageCircle className="w-5 h-5 mr-3 text-sky-300" /><span className="font-bold flex-1">{tr("Tin nhắn", "Messages", "私訊")}</span>{unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center">{unread}</span>}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-xl p-3 cursor-pointer">
                    <Link href="/profile" data-testid="link-profile"><User className="w-5 h-5 mr-3" /><span className="font-bold">{t.profile}</span></Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-xl p-3 cursor-pointer">
                    <Link href="/leaderboard" data-testid="button-leaderboard"><Trophy className="w-5 h-5 mr-3 text-yellow-400" /><span className="font-bold">{tr("Bảng đại gia", "Rich list", "富豪榜")}</span></Link>
                  </DropdownMenuItem>
                  <div className="flex items-center gap-1 px-2 py-1.5" data-testid="language-picker">
                    <Globe className="w-5 h-5 mx-1 text-white/60 shrink-0" />
                    {LANGUAGES.map((l) => (
                      <button key={l.id} onClick={() => setLang(l.id)} className={`flex-1 h-8 rounded-lg text-xs font-bold ${lang === l.id ? "bg-yellow-400 text-black" : "bg-white/5 text-white/70 hover:bg-white/10"}`} data-testid={`button-lang-${l.id}`}>{l.short}</button>
                    ))}
                  </div>
                  {user.isAdmin && (
                    <DropdownMenuItem asChild className="rounded-xl p-3 cursor-pointer" style={{ background: "rgba(251,191,36,0.08)" }}>
                      <Link href="/admin" data-testid="link-admin"><Crown className="w-5 h-5 mr-3 text-yellow-400" /><span className="font-bold text-yellow-300">Admin Panel</span></Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => logout.mutate()} className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-xl p-3 cursor-pointer" data-testid="button-logout">
                    <LogOut className="w-5 h-5 mr-3" /><span className="font-bold">{t.logout}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full hover:bg-white/10" aria-label="Language" data-testid="button-language-toggle"><Globe className="w-5 h-5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 bg-[#140b26]/95 backdrop-blur-xl border-white/10 rounded-2xl shadow-2xl p-2">
                  {LANGUAGES.map((l) => (
                    <DropdownMenuItem key={l.id} onClick={() => setLang(l.id)} className={`rounded-xl p-3 cursor-pointer font-bold ${lang === l.id ? "text-yellow-300" : ""}`} data-testid={`button-lang-${l.id}`}>{l.label}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Link href="/auth">
                <Button className="h-9 rounded-full font-black bg-gradient-to-b from-yellow-300 to-orange-500 text-black px-5" data-testid="button-login">{t.login}</Button>
              </Link>
            </>
          )}
        </div>
      </div>
      {user && <TournamentAlert />}
    </header>
  );
}
