import { Header } from "@/components/Header";
import { useLang } from "@/lib/lang-context";
import { motion } from "framer-motion";
import { Shield, Dice5, Globe, Gift, HeartHandshake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MAX_WIN_MULTIPLE } from "@shared/schema";

export default function About() {
  const { tr } = useLang();

  const stats = [
    { value: tr("97,6%", "97.6%", "97.6%"), label: tr("Tỷ lệ hoàn trả", "Return to player", "返還率") },
    { value: "9", label: tr("Hàng thưởng", "Paylines", "連線") },
    { value: `${MAX_WIN_MULTIPLE.toLocaleString()}×`, label: tr("Thưởng tối đa", "Max payout", "最高派彩") },
    { value: "0đ", label: tr("Chi phí", "Cost to play", "遊玩費用") },
  ];

  const features = tr([
    { icon: Dice5, title: "Kết quả ngẫu nhiên thật", desc: "Mỗi ô được chọn độc lập bằng bộ sinh số ngẫu nhiên mật mã của máy chủ. Không có \"suýt trúng\" giả, không điều chỉnh theo người chơi." },
    { icon: Gift, title: "Hoàn toàn miễn phí", desc: "Bạn nhận 100.000 xu khi đăng ký và 50.000 xu mỗi ngày. Xu không thể mua bằng tiền và không đổi ra tiền." },
    { icon: Shield, title: "Bảo mật", desc: "Mật khẩu được mã hoá bằng bcrypt, phiên đăng nhập chỉ dùng cookie httpOnly." },
    { icon: Globe, title: "Song ngữ", desc: "Tiếng Việt và tiếng Anh." },
  ], [
    { icon: Dice5, title: "Genuinely random", desc: "Every cell is drawn independently by the server's cryptographic RNG. No fake near-misses, no per-player tuning." },
    { icon: Gift, title: "Completely free", desc: "You get 100,000 coins when you sign up and 50,000 more every day. Coins can't be bought and can't be cashed out." },
    { icon: Shield, title: "Secure", desc: "Passwords are hashed with bcrypt and sessions use httpOnly cookies." },
    { icon: Globe, title: "Bilingual", desc: "Vietnamese and English." },
  ], [
    { icon: Dice5, title: "真正隨機", desc: "每一格都由伺服器的加密等級亂數產生器獨立抽出。沒有假的「差一點就中」，也不會針對個別玩家調整。" },
    { icon: Gift, title: "完全免費", desc: "註冊即可獲得 100,000 金幣，每天再送 50,000 金幣。金幣無法購買，也無法兌換成現金。" },
    { icon: Shield, title: "安全", desc: "密碼以 bcrypt 雜湊加密，登入工作階段僅使用 httpOnly Cookie。" },
    { icon: Globe, title: "多語言", desc: "越南文、英文和繁體中文。" },
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 p-4 md:p-8 relative z-10">
        <div className="max-w-4xl mx-auto space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
            <h1 className="text-4xl md:text-6xl font-display gold-gradient-text" data-testid="text-about-title">
              {tr("Về VnSlot 888", "About VnSlot 888", "關於 VnSlot 888")}
            </h1>
            <p className="text-lg text-yellow-100/60">
              {tr("Trò chơi slot phong cách Việt, miễn phí, chơi cho vui.", "A free Vietnamese-style slot game, played for fun.", "免費的越南風格老虎機遊戲，純屬娛樂。")}
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <Card key={i} className="bg-purple-950/60 border-yellow-500/20 p-5 text-center" data-testid={`stat-about-${i}`}>
                <div className="text-2xl md:text-3xl font-display font-black text-yellow-400">{s.value}</div>
                <div className="text-xs text-yellow-100/50 uppercase font-bold tracking-wider mt-1">{s.label}</div>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {features.map((f, i) => (
              <Card key={i} className="bg-purple-950/60 border-yellow-500/20 p-6">
                <f.icon className="w-8 h-8 text-yellow-500 mb-3" />
                <h3 className="text-lg font-bold text-yellow-400 mb-2">{f.title}</h3>
                <p className="text-yellow-100/60 text-sm leading-relaxed">{f.desc}</p>
              </Card>
            ))}
          </div>

          <Card className="bg-purple-950/60 border-yellow-500/20 p-6">
            <HeartHandshake className="w-8 h-8 text-yellow-500 mb-3" />
            <h2 className="text-xl font-display text-yellow-400 mb-3">{tr("Chơi có trách nhiệm", "Play responsibly", "理性遊戲")}</h2>
            <p className="text-yellow-100/60 text-sm leading-relaxed">
              {tr(
                "Đây là trò chơi giải trí dành cho người từ 18 tuổi. Nếu bạn hoặc người thân gặp vấn đề với cờ bạc, hãy tìm sự hỗ trợ từ chuyên gia y tế hoặc tư vấn tâm lý.",
                "This is an entertainment game for adults (18+). If gambling is causing problems for you or someone you know, talk to a doctor or a gambling support service such as GamCare (UK) or Gambling Help Online (AU).",
                "這是一款僅供 18 歲以上成人娛樂的遊戲。如果賭博對你或你認識的人造成困擾，請向醫師或賭博輔導機構尋求協助，例如 GamCare（英國）或 Gambling Help Online（澳洲）。",
              )}
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
