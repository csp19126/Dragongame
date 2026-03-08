import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/Header";
import { useLang } from "@/lib/lang-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { motion } from "framer-motion";
import {
  Gift, CreditCard, Shield, Clock, CheckCircle2,
  Sparkles, Crown, Zap, ArrowRight, Lock, BadgeCheck, Gem,
  Loader2, Star
} from "lucide-react";
import { Link } from "wouter";

const DEPOSIT_TIERS = [
  { amount: 50000, label: "50K", bonus: 0, color: "from-slate-600 to-slate-700" },
  { amount: 100000, label: "100K", bonus: 5, color: "from-blue-600 to-blue-700" },
  { amount: 500000, label: "500K", bonus: 10, color: "from-purple-600 to-purple-700", popular: true },
  { amount: 1000000, label: "1M", bonus: 15, color: "from-yellow-600 to-orange-600" },
  { amount: 5000000, label: "5M", bonus: 20, color: "from-red-600 to-pink-600" },
  { amount: 10000000, label: "10M", bonus: 25, color: "from-yellow-400 to-yellow-600", vip: true },
];

export default function Deposit() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [cardCode, setCardCode] = useState("");
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  const { data: history = [], isLoading: historyLoading } = useQuery<any[]>({
    queryKey: ["/api/deposits/history"],
    queryFn: async () => {
      const res = await fetch("/api/deposits/history");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const redeemMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/deposits/gift-card", { code });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: lang === "vi" ? "Nạp Thành Công!" : "Deposit Successful!",
        description: `+${data.amount.toLocaleString()}đ`,
        className: "bg-gradient-to-r from-green-600 to-emerald-600 text-white border-green-300 font-black text-lg shadow-[0_0_30px_rgba(34,197,94,0.4)]",
      });
      setCardCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/deposits/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/game/state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
    },
    onError: (error: any) => {
      toast({
        title: lang === "vi" ? "Lỗi" : "Error",
        description: error.message || "Invalid or already redeemed code",
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="bg-purple-950/60 border-yellow-500/20 p-8 text-center max-w-md">
            <Lock className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-display text-yellow-400 mb-2">
              {lang === "vi" ? "Đăng Nhập Để Nạp Tiền" : "Login to Deposit"}
            </h2>
            <p className="text-yellow-100/60 mb-6">
              {lang === "vi" ? "Vui lòng đăng nhập để sử dụng dịch vụ nạp tiền" : "Please log in to access the deposit service"}
            </p>
            <Link href="/auth">
              <Button className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold" data-testid="button-login-deposit">
                {t.login}
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
      <Header />

      <main className="flex-1 relative z-10 p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-2"
          >
            <h1 className="text-4xl md:text-5xl font-display gold-gradient-text" data-testid="text-deposit-title">
              {lang === "vi" ? "Nạp Tiền" : "Deposit Funds"}
            </h1>
            <p className="text-yellow-100/60 text-lg">
              {lang === "vi" ? "Nạp nhanh - An toàn - Bảo mật tuyệt đối" : "Fast deposit - Secure - Fully encrypted"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {[
              { icon: Shield, label: lang === "vi" ? "Bảo Mật SSL" : "SSL Secured", sub: "256-bit" },
              { icon: Zap, label: lang === "vi" ? "Xử Lý Tức Thì" : "Instant Processing", sub: "<1s" },
              { icon: BadgeCheck, label: lang === "vi" ? "Được Cấp Phép" : "Licensed Platform", sub: "VN-GL-2024" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-3 bg-purple-950/40 border border-yellow-500/10 rounded-xl px-4 py-3"
              >
                <item.icon className="w-5 h-5 text-yellow-500 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-yellow-100">{item.label}</div>
                  <div className="text-xs text-yellow-100/40">{item.sub}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="bg-purple-950/60 border-yellow-500/20 p-6 space-y-6" data-testid="card-gift-card">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display text-yellow-400">
                      {lang === "vi" ? "Thẻ Quà Tặng" : "Gift Card"}
                    </h2>
                    <p className="text-xs text-yellow-100/50">
                      {lang === "vi" ? "Nhập mã thẻ để nạp ngay" : "Enter your card code to deposit instantly"}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <Input
                      value={cardCode}
                      onChange={(e) => setCardCode(e.target.value.toUpperCase())}
                      placeholder={lang === "vi" ? "NHẬP MÃ THẺ (VD: DRAGON-50K-2024)" : "ENTER CARD CODE (e.g. DRAGON-50K-2024)"}
                      className="bg-purple-900/40 border-yellow-500/20 text-yellow-100 placeholder:text-yellow-100/30 h-14 text-lg font-mono tracking-wider uppercase"
                      data-testid="input-gift-card-code"
                    />
                    <CreditCard className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-yellow-500/40" />
                  </div>

                  <Button
                    onClick={() => redeemMutation.mutate(cardCode)}
                    disabled={!cardCode.trim() || redeemMutation.isPending}
                    className="w-full h-12 bg-gradient-to-r from-yellow-500 to-orange-500 text-purple-950 font-black text-lg uppercase tracking-wider rounded-xl"
                    data-testid="button-redeem-card"
                  >
                    {redeemMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5" />
                        {lang === "vi" ? "NẠP NGAY" : "REDEEM NOW"}
                        <ArrowRight className="w-5 h-5" />
                      </span>
                    )}
                  </Button>
                </div>

                <div className="border-t border-yellow-500/10 pt-4">
                  <p className="text-xs text-yellow-100/40 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {lang === "vi"
                      ? "Giao dịch được bảo mật bằng mã hóa AES-256. Thẻ chỉ sử dụng 1 lần."
                      : "Transactions secured with AES-256 encryption. Cards are single-use."}
                  </p>
                </div>
              </Card>

              <Card className="bg-purple-950/60 border-yellow-500/20 p-6 mt-6" data-testid="card-how-to">
                <h3 className="text-lg font-display text-yellow-400 mb-4 flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  {lang === "vi" ? "Cách Mua Thẻ" : "How to Buy Cards"}
                </h3>
                <div className="space-y-3">
                  {[
                    { step: 1, text: lang === "vi" ? "Liên hệ đại lý ủy quyền qua Zalo/Telegram" : "Contact authorized agents via Zalo/Telegram" },
                    { step: 2, text: lang === "vi" ? "Chọn mệnh giá thẻ phù hợp" : "Select your preferred card denomination" },
                    { step: 3, text: lang === "vi" ? "Thanh toán & nhận mã thẻ ngay lập tức" : "Pay & receive your card code instantly" },
                    { step: 4, text: lang === "vi" ? "Nhập mã vào ô bên trên để nạp" : "Enter the code above to deposit" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-xs font-black text-yellow-400 shrink-0">
                        {item.step}
                      </div>
                      <p className="text-sm text-yellow-100/70">{item.text}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-6"
            >
              <Card className="bg-purple-950/60 border-yellow-500/20 p-6" data-testid="card-tiers">
                <h3 className="text-lg font-display text-yellow-400 mb-4 flex items-center gap-2">
                  <Gem className="w-4 h-4" />
                  {lang === "vi" ? "Gói Nạp" : "Deposit Packages"}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {DEPOSIT_TIERS.map((tier) => (
                    <motion.button
                      key={tier.amount}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedTier(tier.amount)}
                      data-testid={`button-tier-${tier.label}`}
                      className={`relative p-4 rounded-xl text-center transition-all border ${
                        selectedTier === tier.amount
                          ? "border-yellow-400 shadow-[0_0_20px_rgba(251,191,36,0.3)]"
                          : "border-yellow-500/10 hover:border-yellow-500/30"
                      } bg-gradient-to-b ${tier.color}`}
                    >
                      {tier.popular && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase bg-red-500 text-white px-2 py-0.5 rounded-full">
                          {lang === "vi" ? "PHỔ BIẾN" : "POPULAR"}
                        </span>
                      )}
                      {tier.vip && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase bg-gradient-to-r from-yellow-400 to-orange-500 text-purple-950 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Crown className="w-3 h-3" /> VIP
                        </span>
                      )}
                      <div className="text-2xl font-display font-black text-white mb-1">{tier.label}đ</div>
                      {tier.bonus > 0 && (
                        <div className="text-xs font-bold text-yellow-300">+{tier.bonus}% bonus</div>
                      )}
                    </motion.button>
                  ))}
                </div>

                {selectedTier && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-center"
                  >
                    <p className="text-sm text-yellow-100/70 mb-2">
                      {lang === "vi"
                        ? "Liên hệ đại lý để mua thẻ nạp mệnh giá này"
                        : "Contact an agent to purchase this denomination card"}
                    </p>
                    <div className="flex items-center justify-center gap-2 text-yellow-400 font-bold">
                      <span>Zalo: 0888-888-888</span>
                      <span className="text-yellow-500/30">|</span>
                      <span>Telegram: @VnSlot888</span>
                    </div>
                  </motion.div>
                )}
              </Card>

              <Card className="bg-purple-950/60 border-yellow-500/20 p-6" data-testid="card-history">
                <h3 className="text-lg font-display text-yellow-400 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {lang === "vi" ? "Lịch Sử Nạp" : "Deposit History"}
                </h3>
                {historyLoading ? (
                  <div className="text-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-yellow-500 mx-auto" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-6 text-yellow-100/40 text-sm">
                    {lang === "vi" ? "Chưa có giao dịch nào" : "No transactions yet"}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {history.map((d: any) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-purple-900/30 border border-yellow-500/5"
                        data-testid={`deposit-entry-${d.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-yellow-100">
                              {d.method === "gift_card" ? (lang === "vi" ? "Thẻ Quà Tặng" : "Gift Card") : d.method}
                            </div>
                            <div className="text-xs text-yellow-100/40">
                              {new Date(d.createdAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US", {
                                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-green-400">+{d.amount.toLocaleString()}đ</div>
                          <div className="text-xs text-yellow-100/30">{d.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
