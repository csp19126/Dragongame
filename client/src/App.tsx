import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/lang-context";
import { AuthProvider } from "@/hooks/use-auth";
import Home from "@/pages/Home";

// Everything except the game itself loads on demand, so the first screen is fast
const Auth = lazy(() => import("@/pages/Auth"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const Coins = lazy(() => import("@/pages/Coins"));
const About = lazy(() => import("@/pages/About"));
const Terms = lazy(() => import("@/pages/Terms"));
const Profile = lazy(() => import("@/pages/Profile"));
const Admin = lazy(() => import("@/pages/Admin"));
const NotFound = lazy(() => import("@/pages/not-found"));

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
        <Route path="/auth" component={Auth} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/coins" component={Coins} />
        <Route path="/deposit" component={Coins} />
        <Route path="/about" component={About} />
        <Route path="/terms" component={Terms} />
        <Route path="/profile" component={Profile} />
        <Route path="/admin" component={Admin} />
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
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
