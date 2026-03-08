import { Header } from "@/components/Header";
import { useLang } from "@/lib/lang-context";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

export default function Terms() {
  const { lang } = useLang();

  const sections = lang === "vi" ? [
    {
      title: "1. Giới Thiệu",
      content: "Chào mừng quý khách đến với VnSlot 888 Dragon Fortune (\"Nền tảng\"), được vận hành bởi Dragon Fortune Entertainment Ltd. Bằng việc truy cập và sử dụng Nền tảng, quý khách đồng ý tuân thủ các điều khoản và điều kiện dưới đây. Vui lòng đọc kỹ trước khi sử dụng dịch vụ."
    },
    {
      title: "2. Điều Kiện Sử Dụng",
      content: "Người dùng phải từ 18 tuổi trở lên để đăng ký và sử dụng dịch vụ. Mỗi người dùng chỉ được phép sở hữu một tài khoản. Việc tạo nhiều tài khoản có thể dẫn đến đình chỉ tất cả các tài khoản liên quan. Quý khách có trách nhiệm bảo mật thông tin đăng nhập của mình."
    },
    {
      title: "3. Tài Khoản & Số Dư",
      content: "Số dư tài khoản đại diện cho điểm giải trí trên nền tảng. Người dùng có thể nạp thêm điểm thông qua các phương thức nạp được hỗ trợ bao gồm thẻ quà tặng. Tất cả giao dịch nạp đều được xử lý tức thì và không thể hoàn lại sau khi hoàn tất."
    },
    {
      title: "4. Hệ Thống Game",
      content: "VnSlot 888 sử dụng hệ thống RNG (Random Number Generator) được chứng nhận để đảm bảo kết quả hoàn toàn ngẫu nhiên và công bằng. Tỷ lệ hoàn trả (RTP) được thiết lập minh bạch. Mọi kết quả quay đều độc lập và không bị ảnh hưởng bởi các lượt quay trước đó."
    },
    {
      title: "5. Thẻ Quà Tặng & Nạp Tiền",
      content: "Thẻ quà tặng VnSlot 888 là phương tiện nạp điểm chính thức. Mỗi thẻ chỉ sử dụng được một lần. Mã thẻ phải được giữ bảo mật - chúng tôi không chịu trách nhiệm nếu mã thẻ bị lộ do sơ suất của người dùng. Thẻ không có thời hạn sử dụng nhưng không thể hoàn tiền hoặc đổi sang tiền mặt."
    },
    {
      title: "6. Chương Trình Khuyến Mãi",
      content: "VnSlot 888 thường xuyên cung cấp các chương trình khuyến mãi bao gồm bonus nạp tiền, free spin và thưởng streak. Các điều khoản cụ thể của từng chương trình sẽ được thông báo riêng. Ban quản trị có quyền thay đổi hoặc hủy chương trình khuyến mãi bất kỳ lúc nào."
    },
    {
      title: "7. Bảo Mật Thông Tin",
      content: "Chúng tôi cam kết bảo vệ thông tin cá nhân của người dùng. Dữ liệu được mã hóa bằng công nghệ SSL 256-bit. Thông tin cá nhân không được chia sẻ với bên thứ ba trừ khi có yêu cầu pháp lý. Người dùng có quyền yêu cầu xóa dữ liệu cá nhân bất kỳ lúc nào."
    },
    {
      title: "8. Giới Hạn Trách Nhiệm",
      content: "VnSlot 888 cung cấp dịch vụ giải trí \"nguyên trạng\". Chúng tôi nỗ lực duy trì nền tảng hoạt động liên tục nhưng không đảm bảo không có gián đoạn. Trong trường hợp lỗi kỹ thuật, chúng tôi sẽ cố gắng khôi phục trạng thái tài khoản chính xác nhất có thể."
    },
    {
      title: "9. Liên Hệ",
      content: "Mọi thắc mắc vui lòng liên hệ: Email: support@vnslot888.com | Zalo: 0888-888-888 | Telegram: @VnSlot888. Đội ngũ hỗ trợ hoạt động 24/7 để phục vụ quý khách."
    }
  ] : [
    {
      title: "1. Introduction",
      content: "Welcome to VnSlot 888 Dragon Fortune (the \"Platform\"), operated by Dragon Fortune Entertainment Ltd. By accessing and using the Platform, you agree to comply with the following terms and conditions. Please read carefully before using our services."
    },
    {
      title: "2. Eligibility",
      content: "Users must be 18 years of age or older to register and use the service. Each user is permitted to own only one account. Creating multiple accounts may result in suspension of all related accounts. You are responsible for maintaining the confidentiality of your login information."
    },
    {
      title: "3. Account & Balance",
      content: "Account balance represents entertainment credits on the platform. Users can top up credits through supported deposit methods including gift cards. All deposit transactions are processed instantly and are non-refundable once completed."
    },
    {
      title: "4. Game System",
      content: "VnSlot 888 uses a certified RNG (Random Number Generator) system to ensure completely random and fair results. Return-to-Player (RTP) rates are transparently configured. All spin results are independent and unaffected by previous spins."
    },
    {
      title: "5. Gift Cards & Deposits",
      content: "VnSlot 888 gift cards are the official credit deposit method. Each card is single-use only. Card codes must be kept confidential — we are not responsible for code exposure due to user negligence. Cards have no expiration date but cannot be refunded or exchanged for cash."
    },
    {
      title: "6. Promotions",
      content: "VnSlot 888 regularly offers promotional programs including deposit bonuses, free spins, and streak rewards. Specific terms for each program will be communicated separately. Management reserves the right to modify or cancel any promotional program at any time."
    },
    {
      title: "7. Data Privacy",
      content: "We are committed to protecting user personal information. Data is encrypted using 256-bit SSL technology. Personal information is not shared with third parties unless legally required. Users may request deletion of their personal data at any time."
    },
    {
      title: "8. Limitation of Liability",
      content: "VnSlot 888 provides entertainment services \"as is\". We strive to maintain continuous platform operation but do not guarantee uninterrupted service. In case of technical errors, we will attempt to restore account status as accurately as possible."
    },
    {
      title: "9. Contact",
      content: "For any inquiries, please contact: Email: support@vnslot888.com | Zalo: 0888-888-888 | Telegram: @VnSlot888. Our support team operates 24/7 to serve you."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
      <Header />

      <main className="flex-1 p-4 md:p-8 relative z-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-2"
          >
            <h1 className="text-4xl md:text-5xl font-display gold-gradient-text" data-testid="text-terms-title">
              {lang === "vi" ? "Điều Khoản Sử Dụng" : "Terms of Service"}
            </h1>
            <p className="text-sm text-yellow-100/40">
              {lang === "vi" ? "Cập nhật lần cuối: Tháng 3, 2024" : "Last updated: March 2024"}
            </p>
          </motion.div>

          {sections.map((section, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="bg-purple-950/60 border-yellow-500/10 p-6" data-testid={`terms-section-${i}`}>
                <h2 className="text-lg font-bold text-yellow-400 mb-3">{section.title}</h2>
                <p className="text-yellow-100/60 text-sm leading-relaxed">{section.content}</p>
              </Card>
            </motion.div>
          ))}

          <div className="text-center pt-4 pb-8">
            <p className="text-xs text-yellow-100/30">© 2024 Dragon Fortune Entertainment Ltd. All rights reserved.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
