import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { LogOut, Globe, Trophy, User } from "lucide-react";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const { user, logout } = useAuth();
  const { t, toggleLang, lang } = useLang();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40">
      <div className="container mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <motion.div 
            whileHover={{ rotate: 360, scale: 1.1 }}
            className="w-12 h-12 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-500"
          >
            🐲
          </motion.div>
          <span className="font-display text-3xl gold-gradient-text hidden md:inline-block tracking-tighter">VnSlot</span>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-3 md:gap-6">
          {/* Language Toggle */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleLang} 
            className="rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/10 h-11 w-11 transition-all"
          >
            <span className="text-xl filter drop-shadow-sm">{lang === 'en' ? '🇺🇸' : '🇻🇳'}</span>
          </Button>

          {user ? (
            <>
              {/* Balance Display */}
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="hidden md:flex items-center gap-3 bg-black/40 px-5 py-2 rounded-2xl border border-yellow-500/20 shadow-inner"
              >
                <span className="text-[10px] font-black text-yellow-500/60 uppercase tracking-[0.2em]">{t.balance}</span>
                <span className="font-mono font-black text-yellow-400 text-lg tracking-tight">{user.balance.toLocaleString()}</span>
                <span className="text-lg">🪙</span>
              </motion.div>

              {/* Leaderboard Link */}
              <Link href="/leaderboard">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-yellow-400 hover:text-yellow-300 hover:bg-white/5 h-11 w-11 rounded-2xl transition-all"
                >
                  <Trophy className="w-6 h-6" />
                </Button>
              </Link>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-2xl bg-primary/10 text-primary hover:bg-primary/20 h-11 w-11 border border-primary/20 transition-all"
                  >
                    <User className="w-6 h-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-xl border-white/10 rounded-2xl shadow-2xl p-2">
                  <div className="p-3 border-b border-white/5 mb-1 md:hidden">
                     <p className="text-[10px] font-black text-yellow-500/60 uppercase tracking-[0.2em] mb-1">{t.balance}</p>
                     <p className="font-mono font-black text-yellow-400 text-xl">{user.balance.toLocaleString()} 🪙</p>
                  </div>
                  <DropdownMenuItem 
                    onClick={() => logout.mutate()} 
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-xl p-3 cursor-pointer transition-colors"
                  >
                    <LogOut className="w-5 h-5 mr-3" />
                    <span className="font-bold">{t.logout}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/api/login">
              <Button className="font-black bg-gradient-to-r from-primary to-purple-600 hover:scale-105 rounded-2xl px-8 h-12 shadow-lg shadow-primary/25 transition-all">
                {t.login}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
  );
}
