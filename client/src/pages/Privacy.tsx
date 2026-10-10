import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { DeleteAccountCard } from "@/components/DeleteAccount";
import { useAuth } from "@/hooks/use-auth";
import { useLang, type Language } from "@/lib/lang-context";
import { CONTACT_EMAIL } from "@shared/schema";

const UPDATED: Record<Language, string> = { vi: "Cập nhật: Tháng 10, 2026", en: "Last updated: October 2026", zh: "最後更新：2026 年 10 月" };

function sections(lang: Language) {
  if (lang === "zh") return [
    { title: "我們儲存哪些資料", content: "你選擇的帳號；以 bcrypt 單向雜湊處理的密碼，我們無法讀取；你的遊戲金幣餘額、遊戲統計、成就、貼圖和免費金幣領取紀錄；你在聊天室發布的訊息（所有玩家都看得到）；誰邀請你加入；以及你上次開啟遊戲的時間。我們絕不會要求你的真實姓名、電子郵件、電話號碼、位置或聯絡人。" },
    { title: "Cookie", content: "一個登入 Cookie（httpOnly），用來讓你保持登入。沒有廣告、沒有廣告 Cookie，也沒有任何追蹤或分析工具。" },
    { title: "我們如何使用資料", content: "僅用於運作遊戲：登入、保存你的餘額，以及顯示排行榜（僅顯示帳號和金幣）。我們不會出售或分享你的資料，也不會將其用於廣告。" },
    { title: "第三方", content: "伺服器和資料庫由 Railway（railway.com）託管。字型從 Google Fonts 載入，因此 Google 在載入字型時可能會看到你的 IP 位址。除此之外沒有其他人會收到你的資料。" },
    { title: "安全性", content: "連線一律加密（HTTPS）。密碼以 bcrypt 雜湊處理。多次登入失敗會受到次數限制。" },
    { title: "資料保存與刪除", content: "你的資料會保存到你刪除帳號為止。刪除後，帳號、餘額、統計資料、成就和金幣紀錄會立即永久移除。你可以在個人檔案頁面或下方自行刪除。" },
    { title: "年齡", content: "本遊戲僅供 18 歲以上成人使用。我們不會在知情的情況下收集兒童的資料。" },
  ];
  return lang === "vi" ? [
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
  const { lang, tr } = useLang();
  const { user } = useAuth();
  const [location] = useLocation();
  useEffect(() => {
    if (location === "/delete-account") document.getElementById("delete-account")?.scrollIntoView();
  }, [location]);
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] flex flex-col">
      <Header />
      <main className="flex-1 p-4 md:p-8 relative z-10">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="text-center space-y-2">
            <h1 className="text-4xl md:text-5xl font-display gold-gradient-text" data-testid="text-privacy-title">{tr("Chính Sách Quyền Riêng Tư", "Privacy Policy", "隱私權政策")}</h1>
            <p className="text-sm text-yellow-100/40">{UPDATED[lang]}</p>
          </div>
          {sections(lang).map((s, i) => (
            <Card key={i} className="bg-purple-950/60 border-yellow-500/10 p-6">
              <h2 className="text-lg font-bold text-yellow-400 mb-2">{s.title}</h2>
              <p className="text-yellow-100/60 text-sm leading-relaxed">{s.content}</p>
            </Card>
          ))}
          <Card className="bg-purple-950/60 border-yellow-500/10 p-6">
            <h2 className="text-lg font-bold text-yellow-400 mb-2">{tr("Liên hệ", "Contact", "聯絡我們")}</h2>
            <p className="text-yellow-100/60 text-sm">
              {tr("Câu hỏi về quyền riêng tư: ", "Privacy questions: ", "隱私權相關問題：")}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-yellow-300 underline">{CONTACT_EMAIL}</a>
            </p>
          </Card>

          <div id="delete-account" className="scroll-mt-24 space-y-3">
            <h2 className="text-2xl font-display text-yellow-400 text-center">{tr("Xoá tài khoản", "Delete your account", "刪除你的帳號")}</h2>
            {user ? (
              <DeleteAccountCard />
            ) : (
              <Card className="bg-red-950/30 border-red-500/30 p-6 text-sm text-yellow-100/70 space-y-2">
                <p>{tr("Để xoá tài khoản VnSlot 888 và toàn bộ dữ liệu:", "To delete your VnSlot 888 account and all its data:", "刪除你的 VnSlot 888 帳號及其所有資料：")}</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li><Link href="/auth" className="text-yellow-300 underline">{tr("Đăng nhập", "Log in", "登入")}</Link>{tr(" vào tài khoản của bạn.", " to your account.", "你的帳號。")}</li>
                  <li>{tr("Quay lại trang này (hoặc mở Hồ sơ) và nhập mật khẩu ở mục Xoá tài khoản.", "Come back to this page (or open your Profile) and enter your password under Delete account.", "回到本頁（或開啟個人檔案），在「刪除帳號」中輸入你的密碼。")}</li>
                </ol>
                <p>{tr(`Quên mật khẩu? Gửi tên đăng nhập của bạn tới ${CONTACT_EMAIL} và chúng tôi sẽ xoá giúp.`, `Forgotten your password? Email your username to ${CONTACT_EMAIL} and we'll delete it for you.`, `忘記密碼了？請將你的帳號寄到 ${CONTACT_EMAIL}，我們會幫你刪除。`)}</p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
