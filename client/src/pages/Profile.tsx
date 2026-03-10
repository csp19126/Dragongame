import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Trophy, Gamepad2, TrendingUp, Flame, Crown, Save, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "wouter";

interface ProfileData {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  balance: number;
  totalWins: number;
  maxWin: number;
  streak: number;
  maxStreak: number;
  gamesPlayed: number;
  createdAt: string | null;
}

export default function Profile() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();

  const { data: profile, isLoading: isProfileLoading } = useQuery<ProfileData>({
    queryKey: ["/api/user/profile"],
    queryFn: async () => {
      const res = await fetch("/api/user/profile", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!user,
  });

  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    if (profile) {
      setUsername(profile.username || "");
      setFirstName(profile.firstName || "");
      setLastName(profile.lastName || "");
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: async (data: { username?: string; firstName?: string; lastName?: string }) => {
      const res = await apiRequest("PATCH", "/api/user/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: t.profileUpdated });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ username, firstName, lastName });
  };

  if (isAuthLoading || isProfileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary" data-testid="loading-profile" />
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-yellow-100/60" data-testid="text-login-required">{t.login}</p>
        </div>
      </div>
    );
  }

  const initials = (profile.firstName?.[0] || "") + (profile.lastName?.[0] || "") || profile.username.slice(0, 2).toUpperCase();
  const memberDate = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "N/A";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
      <Header />

      <main className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-2xl md:text-3xl font-display font-black text-yellow-400" data-testid="text-profile-title">
              {t.profile}
            </h1>
          </div>

          <Card className="bg-purple-950/60 border-yellow-500/20 p-6" data-testid="card-profile-info">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="w-16 h-16 border-2 border-yellow-500/30">
                <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-xl font-black" data-testid="avatar-profile">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-black text-yellow-100" data-testid="text-profile-username">{profile.username}</h2>
                <p className="text-sm text-yellow-100/50">{t.memberSince}: {memberDate}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-edit-profile">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-yellow-100/70 text-sm font-bold">{t.username}</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-purple-900/30 border-yellow-500/20 text-yellow-100"
                  data-testid="input-username"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-yellow-100/70 text-sm font-bold">{t.firstName}</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="bg-purple-900/30 border-yellow-500/20 text-yellow-100"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-yellow-100/70 text-sm font-bold">{t.lastName}</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="bg-purple-900/30 border-yellow-500/20 text-yellow-100"
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white font-black"
                data-testid="button-save-profile"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {t.saveChanges}
              </Button>
            </form>
          </Card>

          <Card className="bg-purple-950/60 border-yellow-500/20 p-6" data-testid="card-profile-stats">
            <h3 className="text-sm font-black uppercase tracking-widest text-yellow-400 mb-4">
              {t.statistics}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-purple-800/20 rounded-md border border-yellow-500/10">
                <Gamepad2 className="w-5 h-5 text-yellow-500/70 mx-auto mb-1" />
                <div className="text-xs text-yellow-100/50 uppercase font-bold">{t.gamesPlayed}</div>
                <div className="text-xl font-black text-yellow-400" data-testid="text-profile-games-played">
                  {profile.gamesPlayed.toLocaleString()}
                </div>
              </div>
              <div className="text-center p-3 bg-purple-800/20 rounded-md border border-yellow-500/10">
                <TrendingUp className="w-5 h-5 text-yellow-500/70 mx-auto mb-1" />
                <div className="text-xs text-yellow-100/50 uppercase font-bold">{t.totalWins}</div>
                <div className="text-xl font-black text-yellow-400" data-testid="text-profile-total-wins">
                  {profile.totalWins.toLocaleString()}
                </div>
              </div>
              <div className="text-center p-3 bg-purple-800/20 rounded-md border border-yellow-500/10">
                <Trophy className="w-5 h-5 text-yellow-500/70 mx-auto mb-1" />
                <div className="text-xs text-yellow-100/50 uppercase font-bold">{t.maxWin}</div>
                <div className="text-xl font-black text-yellow-400" data-testid="text-profile-max-win">
                  {profile.maxWin.toLocaleString()}d
                </div>
              </div>
              <div className="text-center p-3 bg-purple-800/20 rounded-md border border-yellow-500/10">
                <Flame className="w-5 h-5 text-yellow-500/70 mx-auto mb-1" />
                <div className="text-xs text-yellow-100/50 uppercase font-bold">{t.streak}</div>
                <div className="text-xl font-black text-yellow-400" data-testid="text-profile-streak">
                  {profile.streak}
                </div>
              </div>
              <div className="text-center p-3 bg-purple-800/20 rounded-md border border-yellow-500/10">
                <Crown className="w-5 h-5 text-yellow-500/70 mx-auto mb-1" />
                <div className="text-xs text-yellow-100/50 uppercase font-bold">Max {t.streak}</div>
                <div className="text-xl font-black text-yellow-400" data-testid="text-profile-max-streak">
                  {profile.maxStreak}
                </div>
              </div>
              <div className="text-center p-3 bg-purple-800/20 rounded-md border border-yellow-500/10">
                <Trophy className="w-5 h-5 text-yellow-500/70 mx-auto mb-1" />
                <div className="text-xs text-yellow-100/50 uppercase font-bold">{t.balance}</div>
                <div className="text-xl font-black text-yellow-400" data-testid="text-profile-balance">
                  {profile.balance.toLocaleString()}d
                </div>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
