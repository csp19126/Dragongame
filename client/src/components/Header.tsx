import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { LogOut, Globe, Trophy, User } from "lucide-react";
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
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-2xl shadow-lg group-hover:rotate-12 transition-transform duration-300">
            🐲
          </div>
          <span className="font-display text-2xl text-primary hidden md:inline-block">VnSlot</span>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Language Toggle */}
          <Button variant="ghost" size="icon" onClick={toggleLang} className="rounded-full hover:bg-secondary/20">
            <span className="font-bold text-xs">{lang === 'en' ? '🇺🇸' : '🇻🇳'}</span>
          </Button>

          {user ? (
            <>
              {/* Balance Display */}
              <div className="hidden md:flex items-center gap-2 bg-secondary/10 px-4 py-1.5 rounded-full border border-secondary/20">
                <span className="text-xs font-bold text-muted-foreground uppercase">{t.balance}</span>
                <span className="font-mono font-bold text-primary">{user.balance.toLocaleString()} 🪙</span>
              </div>

              {/* Leaderboard Link */}
              <Link href="/leaderboard">
                <Button variant="ghost" size="icon" className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50">
                  <Trophy className="w-5 h-5" />
                </Button>
              </Link>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full bg-primary/10 text-primary hover:bg-primary/20">
                    <User className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="p-2 border-b mb-1 md:hidden">
                     <p className="text-xs text-muted-foreground">{t.balance}</p>
                     <p className="font-bold">{user.balance.toLocaleString()}</p>
                  </div>
                  <DropdownMenuItem onClick={() => logout.mutate()} className="text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    {t.logout}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link href="/auth">
              <Button className="font-bold bg-primary hover:bg-primary/90 rounded-full px-6">
                {t.login}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
