import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { DeleteAccountCard } from "@/components/DeleteAccount";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { CONTACT_EMAIL } from "@shared/schema";

const UPDATED = { vi: "Cập nhật: Tháng 10, 2026", en: "Last updated: October 2026" };

function sections(vi: boolean) {
  return vi ? [
    { title: "Chúng tôi lưu gì", content: "Tên đăng nhập bạn chọn; mật khẩu đã mã hoá một chiều (bcrypt, chúng tôi không thể đọc được); số dư xu ảo, thống kê chơi, thành tích, sticker và lịch sử nhận xu miễn phí; tin nhắn bạn gửi trong phòng trò chuyện (công khai với mọi người chơi); ai đã mời bạn tham gia; và lần cuối bạn mở trò chơi. Chúng tôi không hỏi tên thật, email, số điện thoại, vị trí hay danh bạ." },
    { title: "Cookie", content: "Một cookie đăng nhập (httpOnly) để giữ bạn đăng nhập. Ứng dụng không dùng cookie quảng cáo, không có quảng cáo và không có công cụ theo dõi hay phân tích." },
    { title: "Dữ liệu được dùng để làm gì", content: "Chỉ để chạy trò chơi: đăng nhập, giữ số dư và hiển thị bảng xếp hạng (chỉ tên đăng nhập và số xu). Chúng tôi không bán, không chia sẻ và không dùng dữ liệu của bạn cho quảng cáo." },
    { title: "Dịch vụ bên thứ ba", content: "Máy chủ và cơ sở dữ liệu được lưu trữ tại Railway (railway.com). Phông chữ được tải từ Google Fonts, nên Google có thể thấy địa chỉ IP của bạn khi tải phông chữ. Không có bên nào khác nhận dữ liệu của bạn." },
    { title: "Bảo mật", content: "Kết nối luôn được mã hoá (HTTPS). Mật khẩu được mã hoá bằng bcrypt. Số lần đăng nhập sai bị giới hạn." },
    { title: "Lưu trữ và xoá dữ liệu", content: "Dữ liệu được giữ cho đến khi bạn xoá tài khoản. Khi xoá, tài khoản, số dư, thống kê, thành tích và lịch sử xu bị xoá vĩnh viễn ngay lập tức. Bạn có thể tự xoá ở trang Hồ sơ hoặc ngay bên dưới." },
    { title: "Độ tuổi", content: "Trò chơi chỉ dành cho người từ 18 tuổi. Chúng tôi không cố ý thu thập dữ liệu của trẻ em." },
  ] : [
    { title: "What we store", content: "The username you choose; your password, one-way hashed with bcrypt so we can't read it; your play-coin balance, game statistics, achievements, stickers and free-coin history; the messages you post in the chat room (public to all players); who invited you; and when you last opened the game. We never ask for your real name, email, phone number, location or contacts." },
    { title: "Cookies", content: "One login cookie (httpOnly) to keep you signed in. There are no ads, no advertising cookies and no tracking or analytics tools." },
    { title: "How we use it", content: "Only to run the game: logging in, keeping your balance and showing the leaderboard (username and coins only). We don't sell or share your data or use it for advertising." },
    { title: "Third parties", content: "The server and database are hosted by Railway (railway.com). Fonts load from Google Fonts, so Google may see your IP address when they load. Nobody else receives your data." },
    { title: "Security", content: "Connections are always encrypted (HTTPS). Passwords are hashed with bcrypt. Repeated failed logins are rate limited." },
    { title: "Keeping and deleting data", content: "Your data is kept until you delete your account. Deleting removes the account, balance, statistics, achievements and coin history permanently, straight away. You can do it yourself on your Profile page or right below." },
    { title: "Age", content: "The game is for adults 18 and over. We don't knowingly collect data from children." },
  ];
}

/** Privacy policy, plus account deletion (Google Play needs a web page for both) */
export default function Privacy() {
  const { lang } = useLang();
  const { user } = useAuth();
  const [location] = useLocation();
  const vi = lang === "vi";
  useEffect(() => {
    if (location === "/delete-account") document.getElementById("delete-account")?.scrollIntoView();
  }, [location]);
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 p-4 md:p-8 relative z-10">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="text-center space-y-2">
            <h1 className="text-4xl md:text-5xl font-display gold-gradient-text" data-testid="text-privacy-title">{vi ? "Chính Sách Quyền Riêng Tư" : "Privacy Policy"}</h1>
            <p className="text-sm text-yellow-100/40">{UPDATED[lang]}</p>
          </div>
          {sections(vi).map((s, i) => (
            <Card key={i} className="bg-purple-950/60 border-yellow-500/10 p-6">
              <h2 className="text-lg font-bold text-yellow-400 mb-2">{s.title}</h2>
              <p className="text-yellow-100/60 text-sm leading-relaxed">{s.content}</p>
            </Card>
          ))}
          <Card className="bg-purple-950/60 border-yellow-500/10 p-6">
            <h2 className="text-lg font-bold text-yellow-400 mb-2">{vi ? "Liên hệ" : "Contact"}</h2>
            <p className="text-yellow-100/60 text-sm">
              {vi ? "Câu hỏi về quyền riêng tư: " : "Privacy questions: "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-yellow-300 underline">{CONTACT_EMAIL}</a>
            </p>
          </Card>

          <div id="delete-account" className="scroll-mt-24 space-y-3">
            <h2 className="text-2xl font-display text-yellow-400 text-center">{vi ? "Xoá tài khoản" : "Delete your account"}</h2>
            {user ? (
              <DeleteAccountCard />
            ) : (
              <Card className="bg-red-950/30 border-red-500/30 p-6 text-sm text-yellow-100/70 space-y-2">
                <p>{vi ? "Để xoá tài khoản VnSlot 888 và toàn bộ dữ liệu:" : "To delete your VnSlot 888 account and all its data:"}</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li><Link href="/auth" className="text-yellow-300 underline">{vi ? "Đăng nhập" : "Log in"}</Link>{vi ? " vào tài khoản của bạn." : " to your account."}</li>
                  <li>{vi ? "Quay lại trang này (hoặc mở Hồ sơ) và nhập mật khẩu ở mục Xoá tài khoản." : "Come back to this page (or open your Profile) and enter your password under Delete account."}</li>
                </ol>
                <p>{vi ? `Quên mật khẩu? Gửi tên đăng nhập của bạn tới ${CONTACT_EMAIL} và chúng tôi sẽ xoá giúp.` : `Forgotten your password? Email your username to ${CONTACT_EMAIL} and we'll delete it for you.`}</p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
