import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Gift, Ticket, Loader2, Lock, Clock, History } from "lucide-react";
import { DAILY_BONUS_AMOUNT, DAILY_BONUS_COOLDOWN_MS, type Deposit } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useGameState, useSetBalance } from "@/hooks/use-game";
import { Header } from "@/components/Header";
import { useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";

const HISTORY_KEY = ["/api/coins/history"];

export default function Coins() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: state } = useGameState(!!user);
  const { t, tr, srv } = useLang();
  const { toast } = useToast();
  const setBalance = useSetBalance();
  const [code, setCode] = useState("");

  const { data: history = [] } = useQuery<Deposit[]>({ queryKey: HISTORY_KEY, enabled: !!user });

  const nextDaily = state?.lastDailyBonusAt ? new Date(state.lastDailyBonusAt).getTime() + DAILY_BONUS_COOLDOWN_MS : 0;
  const dailyReady = nextDaily <= Date.now();
  const fmtTime = (ms: number) => new Date(ms).toLocaleString(tr("vi-VN", "en-GB", "zh-TW"), { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

  const daily = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/bonus/daily")).json(),
    onSuccess: (r) => {
      setBalance(r.balance, { lastDailyBonusAt: new Date().toISOString() });
      soundManager.coinShower();
      toast({ title: `+${r.amount.toLocaleString()} 🪙` });
      queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/game/state"] });
      toast({ title: t.error, description: srv(e.message), variant: "destructive" });
    },
  });

  const redeem = useMutation({
    mutationFn: async (c: string) => (await apiRequest("POST", "/api/promo/redeem", { code: c })).json(),
    onSuccess: (r) => {
      setBalance(r.newBalance);
      soundManager.coinShower();
      toast({ title: `+${r.amount.toLocaleString()} 🪙` });
      setCode("");
      queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
    },
    onError: (e: Error) => toast({ title: t.error, description: srv(e.message), variant: "destructive" }),
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="bg-purple-950/60 border-yellow-500/20 p-8 text-center max-w-md">
            <Lock className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-display text-yellow-400 mb-6">{t.topUp}</h2>
            <Link href="/auth"><Button className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold">{t.login}</Button></Link>
          </Card>
        </div>
      </div>
    );
  }

  const methodLabel = (m: string) =>
    m === "daily_bonus" ? tr("Thưởng hằng ngày", "Daily bonus", "每日獎勵")
      : m === "promo_code" || m === "gift_card" ? tr("Mã khuyến mãi", "Promo code", "優惠碼")
      : m;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
            <h1 className="text-4xl md:text-5xl font-display gold-gradient-text" data-testid="text-coins-title">{t.topUp}</h1>
            <p className="text-yellow-100/60">{t.playMoneyNote}</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-purple-950/60 border-yellow-500/20 p-6 space-y-4 text-center" data-testid="card-daily">
              <Gift className="w-12 h-12 text-yellow-400 mx-auto" />
              <h2 className="text-xl font-display text-yellow-400">{tr("Quà Hằng Ngày", "Daily Gift", "每日禮物")}</h2>
              <div className="text-3xl font-black text-yellow-300 font-mono">+{DAILY_BONUS_AMOUNT.toLocaleString()} 🪙</div>
              <Button
                onClick={() => daily.mutate()}
                disabled={!dailyReady || daily.isPending || !state}
                className="w-full h-12 bg-gradient-to-r from-yellow-500 to-orange-500 text-purple-950 font-black text-lg"
                data-testid="button-claim-daily"
              >
                {daily.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : dailyReady ? tr("NHẬN NGAY", "CLAIM", "領取") : (
                  <span className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4" />{fmtTime(nextDaily)}</span>
                )}
              </Button>
            </Card>

            <Card className="bg-purple-950/60 border-yellow-500/20 p-6 space-y-4" data-testid="card-promo">
              <div className="text-center">
                <Ticket className="w-12 h-12 text-yellow-400 mx-auto" />
                <h2 className="text-xl font-display text-yellow-400 mt-4">{tr("Mã Khuyến Mãi", "Promo Code", "優惠碼")}</h2>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) redeem.mutate(code.trim()); }} className="space-y-3">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={tr("NHẬP MÃ", "ENTER CODE", "輸入代碼")}
                  className="bg-purple-900/40 border-yellow-500/20 text-yellow-100 placeholder:text-yellow-100/30 h-12 text-center font-mono tracking-widest"
                  data-testid="input-promo-code"
                />
                <Button type="submit" disabled={!code.trim() || redeem.isPending} className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-black" data-testid="button-redeem">
                  {redeem.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : tr("ĐỔI MÃ", "REDEEM", "兌換")}
                </Button>
              </form>
            </Card>
          </div>

          <Card className="bg-purple-950/60 border-yellow-500/20 p-6" data-testid="card-history">
            <h3 className="text-lg font-display text-yellow-400 mb-4 flex items-center gap-2"><History className="w-4 h-4" />{tr("Lịch Sử", "History", "紀錄")}</h3>
            {history.length === 0 ? (
              <p className="text-yellow-100/40 text-sm">{tr("Chưa có gì", "Nothing yet", "目前還沒有紀錄")}</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-purple-900/30 border border-yellow-500/10">
                    <div>
                      <div className="text-sm font-bold text-yellow-100">{methodLabel(d.method)}{d.cardCode ? ` · ${d.cardCode}` : ""}</div>
                      <div className="text-xs text-yellow-100/40">{d.createdAt ? fmtTime(new Date(d.createdAt).getTime()) : ""}</div>
                    </div>
                    <div className="font-mono font-black text-green-400">+{d.amount.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
