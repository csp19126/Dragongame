import { Header } from "@/components/Header";
import { useLang } from "@/lib/lang-context";
import { motion } from "framer-motion";
import { Shield, Users, Globe, Award, Zap, Lock, HeartHandshake, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function About() {
  const { lang } = useLang();

  const content = lang === "vi" ? {
    title: "Về VnSlot 888",
    subtitle: "Nền tảng giải trí trực tuyến hàng đầu Đông Nam Á",
    mission: "Sứ Mệnh",
    missionText: "VnSlot 888 Dragon Fortune được phát triển bởi đội ngũ chuyên gia công nghệ và giải trí, mang đến trải nghiệm slot machine đỉnh cao với phong cách Á Đông đặc sắc. Chúng tôi cam kết cung cấp nền tảng giải trí công bằng, minh bạch và an toàn cho tất cả người chơi.",
    stats: [
      { value: "50K+", label: "Người Chơi Hoạt Động", icon: Users },
      { value: "99.9%", label: "Thời Gian Hoạt Động", icon: Zap },
      { value: "24/7", label: "Hỗ Trợ Khách Hàng", icon: HeartHandshake },
      { value: "₫2B+", label: "Tổng Thưởng Đã Trả", icon: TrendingUp },
    ],
    features: [
      { icon: Shield, title: "Bảo Mật Cao Cấp", desc: "Hệ thống mã hóa SSL 256-bit và xác thực đa lớp bảo vệ tài khoản và giao dịch của bạn." },
      { icon: Award, title: "RTP Công Bằng", desc: "Thuật toán RNG được chứng nhận độc lập đảm bảo kết quả hoàn toàn ngẫu nhiên và công bằng." },
      { icon: Globe, title: "Đa Ngôn Ngữ", desc: "Hỗ trợ tiếng Việt và tiếng Anh, giao diện thân thiện cho người chơi toàn cầu." },
      { icon: Lock, title: "Thanh Toán An Toàn", desc: "Nhiều phương thức nạp tiền linh hoạt với xử lý giao dịch tức thì, bảo mật tuyệt đối." },
    ],
    team: "Đội Ngũ Phát Triển",
    teamText: "VnSlot 888 được vận hành bởi Dragon Fortune Entertainment Ltd., đội ngũ gồm các chuyên gia công nghệ, thiết kế game và bảo mật thông tin với hơn 10 năm kinh nghiệm trong ngành giải trí số.",
    license: "Giấy Phép & Tuân Thủ",
    licenseText: "Nền tảng hoạt động theo các tiêu chuẩn quốc tế về bảo mật thông tin và công bằng trong game. Hệ thống RNG (Random Number Generator) được kiểm định định kỳ để đảm bảo tính minh bạch.",
    contact: "Liên Hệ",
    contactEmail: "support@vnslot888.com",
    contactZalo: "0888-888-888",
  } : {
    title: "About VnSlot 888",
    subtitle: "Southeast Asia's Premier Online Entertainment Platform",
    mission: "Our Mission",
    missionText: "VnSlot 888 Dragon Fortune is developed by a team of technology and entertainment experts, delivering a premium slot machine experience with distinctive Oriental aesthetics. We are committed to providing a fair, transparent, and secure entertainment platform for all players.",
    stats: [
      { value: "50K+", label: "Active Players", icon: Users },
      { value: "99.9%", label: "Uptime", icon: Zap },
      { value: "24/7", label: "Customer Support", icon: HeartHandshake },
      { value: "₫2B+", label: "Total Prizes Paid", icon: TrendingUp },
    ],
    features: [
      { icon: Shield, title: "Enterprise Security", desc: "256-bit SSL encryption and multi-layer authentication protect your account and transactions." },
      { icon: Award, title: "Fair RTP", desc: "Independently certified RNG algorithms ensure completely random and fair results." },
      { icon: Globe, title: "Multilingual", desc: "Full Vietnamese and English support with a user-friendly interface for global players." },
      { icon: Lock, title: "Secure Payments", desc: "Flexible deposit methods with instant transaction processing and absolute security." },
    ],
    team: "Development Team",
    teamText: "VnSlot 888 is operated by Dragon Fortune Entertainment Ltd., a team of technology, game design, and information security specialists with over 10 years of experience in the digital entertainment industry.",
    license: "Licensing & Compliance",
    licenseText: "The platform operates according to international standards for information security and game fairness. Our RNG (Random Number Generator) system undergoes periodic audits to ensure transparency.",
    contact: "Contact",
    contactEmail: "support@vnslot888.com",
    contactZalo: "0888-888-888",
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
      <Header />

      <main className="flex-1 p-4 md:p-8 relative z-10">
        <div className="max-w-4xl mx-auto space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-3"
          >
            <h1 className="text-4xl md:text-6xl font-display gold-gradient-text" data-testid="text-about-title">
              {content.title}
            </h1>
            <p className="text-lg text-yellow-100/60">{content.subtitle}</p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {content.stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="bg-purple-950/60 border-yellow-500/20 p-5 text-center" data-testid={`stat-about-${i}`}>
                  <stat.icon className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                  <div className="text-2xl md:text-3xl font-display font-black text-yellow-400">{stat.value}</div>
                  <div className="text-xs text-yellow-100/50 uppercase font-bold tracking-wider mt-1">{stat.label}</div>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <Card className="bg-purple-950/60 border-yellow-500/20 p-8">
              <h2 className="text-2xl font-display text-yellow-400 mb-4">{content.mission}</h2>
              <p className="text-yellow-100/70 leading-relaxed text-lg">{content.missionText}</p>
            </Card>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {content.features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
              >
                <Card className="bg-purple-950/60 border-yellow-500/20 p-6 h-full" data-testid={`feature-about-${i}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/20 flex items-center justify-center">
                      <feature.icon className="w-5 h-5 text-yellow-500" />
                    </div>
                    <h3 className="text-lg font-bold text-yellow-300">{feature.title}</h3>
                  </div>
                  <p className="text-yellow-100/60 text-sm leading-relaxed">{feature.desc}</p>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-purple-950/60 border-yellow-500/20 p-6">
              <h2 className="text-xl font-display text-yellow-400 mb-3">{content.team}</h2>
              <p className="text-yellow-100/60 text-sm leading-relaxed">{content.teamText}</p>
            </Card>
            <Card className="bg-purple-950/60 border-yellow-500/20 p-6">
              <h2 className="text-xl font-display text-yellow-400 mb-3">{content.license}</h2>
              <p className="text-yellow-100/60 text-sm leading-relaxed">{content.licenseText}</p>
            </Card>
          </div>

          <Card className="bg-purple-950/60 border-yellow-500/20 p-6 text-center">
            <h2 className="text-xl font-display text-yellow-400 mb-3">{content.contact}</h2>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-yellow-100/70">
              <span>Email: {content.contactEmail}</span>
              <span className="hidden md:inline text-yellow-500/30">|</span>
              <span>Zalo: {content.contactZalo}</span>
              <span className="hidden md:inline text-yellow-500/30">|</span>
              <span>Telegram: @VnSlot888</span>
            </div>
            <p className="text-xs text-yellow-100/30 mt-4">© 2024 Dragon Fortune Entertainment Ltd. All rights reserved.</p>
          </Card>
        </div>
      </main>
    </div>
  );
}
