import { lazy, Suspense, Component, type ComponentType, type ReactNode } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { InstallBanner } from "@/components/InstallApp";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/lang-context";
import { AuthProvider } from "@/hooks/use-auth";
import Home, { SlotPage } from "@/pages/Home";
import { BottomNav } from "@/components/BottomNav";

const RELOAD_FLAG = "chunk-reload-at";

/**
 * Loads a page on demand. If its file can't be fetched (a dropped connection, or the
 * game was redeployed while the tab was open so the old file is gone), reload once to
 * pick up the current version; if that also fails, the ErrorBoundary below takes over.
 * (Retrying the import in place is pointless: browsers cache a failed module import.)
 */
function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load();
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch {}
      return mod;
    } catch (err) {
      let last = 0;
      try { last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0); } catch {}
      if (Date.now() - last > 30_000) {
        try { sessionStorage.setItem(RELOAD_FLAG, String(Date.now())); } catch {}
        window.location.reload();
        await new Promise(() => {}); // keep showing the loader until the reload happens
      }
      throw err;
    }
  });
}

// Everything except the game itself loads on demand, so the first screen is fast
const Auth = lazyPage(() => import("@/pages/Auth"));
const Leaderboard = lazyPage(() => import("@/pages/Leaderboard"));
const Coins = lazyPage(() => import("@/pages/Coins"));
const About = lazyPage(() => import("@/pages/About"));
const Terms = lazyPage(() => import("@/pages/Terms"));
const Profile = lazyPage(() => import("@/pages/Profile"));
const Admin = lazyPage(() => import("@/pages/Admin"));
const BauCua = lazyPage(() => import("@/pages/BauCua"));
const Roulette = lazyPage(() => import("@/pages/Roulette"));
const Privacy = lazyPage(() => import("@/pages/Privacy"));
const Blackjack = lazyPage(() => import("@/pages/Blackjack"));
const Pool = lazyPage(() => import("@/pages/Pool"));
const Community = lazyPage(() => import("@/pages/Community"));
const Tournament = lazyPage(() => import("@/pages/Tournament"));
const NotFound = lazyPage(() => import("@/pages/not-found"));

/** Last line of defence: never leave the player on a blank screen */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("[app] crashed:", err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-[#0a0515] text-yellow-100">
        <div className="text-6xl">🐉</div>
        <p className="text-lg font-bold">Có lỗi xảy ra · Something went wrong</p>
        <p className="text-sm text-yellow-100/60">Kiểm tra kết nối mạng rồi tải lại · Check your connection and reload</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 text-purple-950 font-black"
        >
          Tải lại · Reload
        </button>
      </div>
    );
  }
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0515]">
      <Loader2 className="w-10 h-10 animate-spin text-yellow-400" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/slot" component={SlotPage} />
        <Route path="/auth" component={Auth} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/coins" component={Coins} />
        <Route path="/deposit" component={Coins} />
        <Route path="/about" component={About} />
        <Route path="/terms" component={Terms} />
        <Route path="/profile" component={Profile} />
        <Route path="/admin" component={Admin} />
        <Route path="/bau-cua" component={BauCua} />
        <Route path="/roulette" component={Roulette} />
        <Route path="/blackjack" component={Blackjack} />
        <Route path="/pool" component={Pool} />
        <Route path="/community" component={Community} />
        <Route path="/tournament" component={Tournament} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/delete-account" component={Privacy} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <ErrorBoundary>
              <Router />
              <BottomNav />
            </ErrorBoundary>
            <InstallBanner />
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
