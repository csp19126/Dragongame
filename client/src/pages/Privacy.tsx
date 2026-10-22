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
    { title: "我們儲存哪些資料", content: "你選擇的帳號；以 bcrypt 單向雜湊處理的密碼，我們無法讀取；你的遊戲金幣餘額、遊戲統計、成就、貼圖和免費金幣領取紀錄；你在聊天室發布的訊息（所有玩家都看得到）；你上傳的大頭貼；你傳送和收到的私訊（包括回覆和表情回應）；你的好友、好友邀請和好友紅包；你的通知；你的自我介紹、最愛遊戲、成就展示和隱私設定；你封鎖的玩家和你送出的檢舉；誰邀請你加入；以及你上次開啟遊戲的時間。我們絕不會要求你的真實姓名、電子郵件、電話號碼、位置或聯絡人。" },
    { title: "大頭貼與私訊", content: "大頭貼會先在你的手機上裁切並縮小，再儲存在我們的資料庫，所有已登入的玩家都看得到。私訊會儲存在我們的資料庫中以便傳送，只有你和對方能閱讀。管理員不會瀏覽私訊，唯一的例外是：當收件人檢舉某則訊息時，管理員可以閱讀那則訊息及其前 5 則訊息，以便處理。你可以隨時移除你的大頭貼。" },
    { title: "好友、在線狀態與動態", content: "你的好友可以看到你是否在線，以及你正在玩哪個遊戲（只記在伺服器記憶體中，不會儲存，你也可以在隱私設定中關閉）。你的等級是根據你的押注計算的。動態會顯示大獎、神龍彩金、升級、新玩家加入和新朋友；你可以在隱私設定中選擇不出現在動態中。你可以選擇只接受好友的私訊，或不接受任何好友邀請。你的餘額、電子郵件和真實姓名永遠不會顯示給其他人。" },
    { title: "通知", content: "通知（好友邀請、提及、回覆、表情回應、好友紅包、好友的大獎）會儲存在我們的資料庫中，每位玩家最多保留 200 則，30 天後自動刪除。好友紅包的金幣由遊戲贈送，不會從送出的人身上扣除。" },
    { title: "Cookie", content: "一個登入 Cookie（httpOnly），用來讓你保持登入。沒有廣告、沒有廣告 Cookie，也沒有任何追蹤或分析工具。" },
    { title: "我們如何使用資料", content: "僅用於運作遊戲：登入、保存你的餘額，以及顯示排行榜（僅顯示帳號和金幣）。我們不會出售或分享你的資料，也不會將其用於廣告。" },
    { title: "第三方", content: "伺服器和資料庫由 Railway（railway.com）託管。字型從 Google Fonts 載入，因此 Google 在載入字型時可能會看到你的 IP 位址。除此之外沒有其他人會收到你的資料。" },
    { title: "安全性", content: "連線一律加密（HTTPS）。密碼以 bcrypt 雜湊處理。多次登入失敗會受到次數限制。" },
    { title: "資料保存與刪除", content: "你的資料會保存到你刪除帳號為止。刪除後，帳號、餘額、統計資料、成就、金幣紀錄、大頭貼、私訊（你傳送和收到的）、好友和好友邀請、通知、表情回應、動態、好友紅包、個人檔案和隱私設定、封鎖和檢舉會立即永久移除。你可以在個人檔案頁面或下方自行刪除。" },
    { title: "年齡", content: "本遊戲僅供 18 歲以上成人使用。我們不會在知情的情況下收集兒童的資料。" },
  ];
  return lang === "vi" ? [
    { title: "Chúng tôi lưu gì", content: "Tên đăng nhập bạn chọn; mật khẩu đã mã hoá một chiều (bcrypt, chúng tôi không thể đọc được); số dư xu ảo, thống kê chơi, thành tích, sticker và lịch sử nhận xu miễn phí; tin nhắn bạn gửi trong phòng trò chuyện (công khai với mọi người chơi); ảnh đại diện bạn tải lên; tin nhắn riêng bạn gửi và nhận (kể cả trả lời và thả cảm xúc); bạn bè, lời mời kết bạn và Lì Xì bạn bè; thông báo của bạn; lời giới thiệu, trò chơi yêu thích, thành tích khoe và cài đặt quyền riêng tư; những người bạn đã chặn và các báo cáo bạn gửi; ai đã mời bạn tham gia; và lần cuối bạn mở trò chơi. Chúng tôi không hỏi tên thật, email, số điện thoại, vị trí hay danh bạ." },
    { title: "Ảnh đại diện và tin nhắn riêng", content: "Ảnh đại diện được cắt và thu nhỏ ngay trên điện thoại của bạn rồi lưu trong cơ sở dữ liệu của chúng tôi; mọi người chơi đã đăng nhập đều xem được. Tin nhắn riêng được lưu trong cơ sở dữ liệu để gửi đến người nhận, và chỉ bạn với người đó đọc được. Quản trị viên không xem tin nhắn riêng, trừ một trường hợp: khi người nhận báo cáo một tin nhắn, quản trị viên có thể đọc tin nhắn đó cùng 5 tin nhắn trước nó để xử lý. Bạn có thể xoá ảnh đại diện bất cứ lúc nào." },
    { title: "Bạn bè, trạng thái online và mục Hoạt động", content: "Bạn bè của bạn thấy bạn có đang online không và đang chơi trò gì (chỉ giữ trong bộ nhớ máy chủ, không lưu lại, và bạn có thể tắt trong cài đặt quyền riêng tư). Cấp độ của bạn được tính từ số xu bạn đã đặt cược. Mục Hoạt động hiện các lần thắng lớn, nổ Hũ Rồng, lên cấp, người chơi mới và bạn bè mới; bạn có thể chọn không xuất hiện ở đó. Bạn có thể chỉ nhận tin nhắn từ bạn bè, hoặc không nhận lời mời kết bạn nào. Số dư, email và tên thật của bạn không bao giờ được hiển thị cho người khác." },
    { title: "Thông báo", content: "Thông báo (lời mời kết bạn, nhắc tên, trả lời, thả cảm xúc, Lì Xì bạn bè, bạn bè thắng lớn) được lưu trong cơ sở dữ liệu, tối đa 200 thông báo cho mỗi người chơi và tự xoá sau 30 ngày. Xu trong Lì Xì bạn bè do trò chơi tặng, không bị trừ của người gửi." },
    { title: "Cookie", content: "Một cookie đăng nhập (httpOnly) để giữ bạn đăng nhập. Ứng dụng không dùng cookie quảng cáo, không có quảng cáo và không có công cụ theo dõi hay phân tích." },
    { title: "Dữ liệu được dùng để làm gì", content: "Chỉ để chạy trò chơi: đăng nhập, giữ số dư và hiển thị bảng xếp hạng (chỉ tên đăng nhập và số xu). Chúng tôi không bán, không chia sẻ và không dùng dữ liệu của bạn cho quảng cáo." },
    { title: "Dịch vụ bên thứ ba", content: "Máy chủ và cơ sở dữ liệu được lưu trữ tại Railway (railway.com). Phông chữ được tải từ Google Fonts, nên Google có thể thấy địa chỉ IP của bạn khi tải phông chữ. Không có bên nào khác nhận dữ liệu của bạn." },
    { title: "Bảo mật", content: "Kết nối luôn được mã hoá (HTTPS). Mật khẩu được mã hoá bằng bcrypt. Số lần đăng nhập sai bị giới hạn." },
    { title: "Lưu trữ và xoá dữ liệu", content: "Dữ liệu được giữ cho đến khi bạn xoá tài khoản. Khi xoá, tài khoản, số dư, thống kê, thành tích, lịch sử xu, ảnh đại diện, tin nhắn riêng (cả gửi và nhận), bạn bè và lời mời kết bạn, thông báo, cảm xúc đã thả, mục Hoạt động, Lì Xì bạn bè, hồ sơ và cài đặt quyền riêng tư, danh sách chặn và các báo cáo đều bị xoá vĩnh viễn ngay lập tức. Bạn có thể tự xoá ở trang Hồ sơ hoặc ngay bên dưới." },
    { title: "Độ tuổi", content: "Trò chơi chỉ dành cho người từ 18 tuổi. Chúng tôi không cố ý thu thập dữ liệu của trẻ em." },
  ] : [
    { title: "What we store", content: "The username you choose; your password, one-way hashed with bcrypt so we can't read it; your play-coin balance, game statistics, achievements, stickers and free-coin history; the messages you post in the chat room (public to all players); the profile photo you upload; the private messages you send and receive (including replies and reactions); your friends, friend requests and friend Lì Xì; your notifications; your bio, favourite game, badge showcase and privacy settings; the players you block and the reports you send; who invited you; and when you last opened the game. We never ask for your real name, email, phone number, location or contacts." },
    { title: "Profile photos and private messages", content: "Your profile photo is cropped and shrunk on your phone, then stored in our database; every signed-in player can see it. Private messages are stored in our database so they can be delivered, and only you and the other player can read them. Admins don't browse private messages, with one exception: when the player who received a message reports it, an admin can read that message and the 5 before it to deal with the report. You can remove your photo at any time." },
    { title: "Friends, online status and the activity feed", content: "Your friends can see whether you're online and which game you're playing (kept only in the server's memory, never stored, and you can turn it off in your privacy settings). Your level is worked out from the coins you've bet. The activity feed shows big wins, Hũ Rồng jackpots, level-ups, new players and new friendships; you can choose not to appear in it. You can take private messages from friends only, or no friend requests at all. Your balance, email and real name are never shown to anyone." },
    { title: "Notifications", content: "Notifications (friend requests, mentions, replies, reactions, friend Lì Xì, friends' big wins) are stored in our database, up to 200 per player, and deleted automatically after 30 days. The coins in a friend Lì Xì are given by the game; they are never taken from the sender." },
    { title: "Cookies", content: "One login cookie (httpOnly) to keep you signed in. There are no ads, no advertising cookies and no tracking or analytics tools." },
    { title: "How we use it", content: "Only to run the game: logging in, keeping your balance and showing the leaderboard (username and coins only). We don't sell or share your data or use it for advertising." },
    { title: "Third parties", content: "The server and database are hosted by Railway (railway.com). Fonts load from Google Fonts, so Google may see your IP address when they load. Nobody else receives your data." },
    { title: "Security", content: "Connections are always encrypted (HTTPS). Passwords are hashed with bcrypt. Repeated failed logins are rate limited." },
    { title: "Keeping and deleting data", content: "Your data is kept until you delete your account. Deleting removes the account, balance, statistics, achievements, coin history, profile photo, private messages (sent and received), friends and friend requests, notifications, reactions, activity feed items, friend Lì Xì, your profile and privacy settings, blocks and reports permanently, straight away. You can do it yourself on your Profile page or right below." },
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
