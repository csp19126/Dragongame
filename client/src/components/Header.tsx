import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { LogOut, Globe, Trophy, User, Bell, Plus, Coins } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function AnimatedBalance({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [bouncing, setBouncing] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setBouncing(true);
      const diff = value - prevValue.current;
      const steps = 20;
      const stepValue = diff / steps;
      let current = prevValue.current;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        current += stepValue;
        if (step >= steps) {
          current = value;
          clearInterval(interval);
          setTimeout(() => setBouncing(false), 300);
        }
        setDisplayValue(Math.round(current));
      }, 30);

      prevValue.current = value;
      return () => clearInterval(interval);
    }
  }, [value]);

  return (
    <motion.span
      animate={bouncing ? { scale: [1, 1.15, 1], y: [0, -3, 0] } : {}}
      transition={{ duration: 0.4 }}
      className={`font-mono font-black text-yellow-400 text-lg tracking-tight transition-colors duration-300 ${bouncing ? "text-green-400" : ""}`}
      data-testid="text-balance-value"
    >
      {displayValue.toLocaleString()}
    </motion.span>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const { t, toggleLang, lang } = useLang();
  const [hasNewAchievement, setHasNewAchievement] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-yellow-500/10 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40">
      <div className="container mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 md:gap-3 group" data-testid="link-home">
          <motion.div 
            whileHover={{ rotate: 360, scale: 1.1 }}
            className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center text-2xl md:text-3xl shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-500"
          >
            <Coins className="w-5 h-5 md:w-6 md:h-6 text-yellow-300" />
          </motion.div>
          <span className="font-display text-2xl md:text-3xl gold-gradient-text hidden md:inline-block tracking-tighter">VnSlot</span>
        </Link>

        <div className="flex items-center gap-2 md:gap-4 flex-wrap">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleLang} 
            data-testid="button-language-toggle"
          >
            <Globe className="w-5 h-5" />
          </Button>

          {user ? (
            <>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="hidden md:flex items-center gap-3 bg-purple-950/40 px-4 py-1.5 rounded-md border border-yellow-500/20 shadow-inner"
                data-testid="display-balance"
              >
                <span className="text-[10px] font-black text-yellow-500/60 uppercase tracking-[0.2em]">{t.balance}</span>
                <AnimatedBalance value={user.balance} />
                <Coins className="w-4 h-4 text-yellow-500" />
              </motion.div>

              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="hidden lg:flex items-center gap-2 bg-emerald-950/30 px-4 py-1.5 rounded-md border border-emerald-500/20 shadow-inner"
                data-testid="display-tokens"
              >
                <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-[0.2em]">{t.tokens}</span>
                <span className="font-mono font-black text-emerald-400 text-lg tracking-tight" data-testid="text-tokens-value">0</span>
                <Coins className="w-4 h-4 text-emerald-400" />
              </motion.div>

              <Link href="/deposit">
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden md:flex items-center gap-1 border-yellow-500/30 text-yellow-400"
                  data-testid="button-top-up"
                >
                  <Plus className="w-4 h-4" />
                  <span className="font-bold text-xs">{t.topUp}</span>
                </Button>
              </Link>

              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-notifications"
                >
                  <Bell className="w-5 h-5" />
                </Button>
                {hasNewAchievement && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" data-testid="indicator-new-achievement" />
                )}
              </div>

              <Link href="/leaderboard">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  data-testid="button-leaderboard"
                >
                  <Trophy className="w-5 h-5 text-yellow-400" />
                </Button>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="bg-primary/10 text-primary border border-primary/20"
                    data-testid="button-user-menu"
                  >
                    <User className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  className="w-56 bg-background/95 backdrop-blur-xl border-yellow-500/10 rounded-md shadow-2xl p-2"
                  data-testid="menu-user-dropdown"
                >
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="p-3 border-b border-yellow-500/5 mb-1 md:hidden">
                        <p className="text-[10px] font-black text-yellow-500/60 uppercase tracking-[0.2em] mb-1">{t.balance}</p>
                        <div className="flex items-center gap-2">
                          <p className="font-mono font-black text-yellow-400 text-xl" data-testid="text-mobile-balance">{user.balance.toLocaleString()}</p>
                          <Coins className="w-4 h-4 text-yellow-500" />
                        </div>
                      </div>
                      <div className="p-3 border-b border-yellow-500/5 mb-1 md:hidden">
                        <Link href="/deposit">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border-yellow-500/30 text-yellow-400"
                            data-testid="button-mobile-top-up"
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            <span className="font-bold text-xs">{t.topUp}</span>
                          </Button>
                        </Link>
                      </div>
                      <DropdownMenuItem 
                        onClick={() => logout.mutate()} 
                        className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-md p-3 cursor-pointer transition-colors"
                        data-testid="button-logout"
                      >
                        <LogOut className="w-5 h-5 mr-3" />
                        <span className="font-bold">{t.logout}</span>
                      </DropdownMenuItem>
                    </motion.div>
                  </AnimatePresence>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/auth">
              <Button 
                className="font-black bg-gradient-to-r from-primary to-purple-600 rounded-md px-6 shadow-lg shadow-primary/25 transition-all"
                data-testid="button-login"
              >
                {t.login}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
