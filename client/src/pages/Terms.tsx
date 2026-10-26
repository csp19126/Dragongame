import { Header } from "@/components/Header";
import { useLang } from "@/lib/lang-context";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

export default function Terms() {
  const { tr } = useLang();

  const sections = tr([
    { title: "1. Giới thiệu", content: "VnSlot 888 là trò chơi slot giải trí miễn phí. Khi sử dụng trò chơi, bạn đồng ý với các điều khoản dưới đây." },
    { title: "2. Độ tuổi", content: "Bạn phải từ 18 tuổi trở lên. Mỗi người chỉ được có một tài khoản." },
    { title: "3. Xu ảo", content: "Xu trong trò chơi chỉ là điểm giải trí. Xu không thể mua bằng tiền thật, không thể đổi ra tiền, hàng hoá hay bất kỳ giá trị nào, và không thể chuyển nhượng. Bất kỳ ai đề nghị bán hoặc mua xu đều không liên quan đến chúng tôi." },
    { title: "4. Cách trò chơi hoạt động", content: "Mọi kết quả (slot, Bầu Cua, roulette, Xì Dách) được máy chủ chọn bằng bộ sinh số ngẫu nhiên mật mã. Luật chơi và tỷ lệ hoàn trả được công bố trong từng trò chơi: slot 97,6% khi giữ cuộn tối ưu (88,7% nếu không bao giờ giữ), Bầu Cua 92,13%, roulette 97,30%, Xì Dách khoảng 99,6% với chiến thuật cơ bản. Kết quả không bị điều chỉnh theo người chơi. Bi-a là trò chơi kỹ năng giữa hai người chơi: mỗi bên đặt cùng mức cược bằng xu, người thắng nhận cả hai, nhà cái không thu phí. Giải đấu bi-a miễn phí tham gia; giải thưởng là xu ảo." },
    { title: "5. Mã khuyến mãi", content: "Mã khuyến mãi cho thêm xu ảo miễn phí, mỗi mã dùng một lần. Mã không có giá trị bằng tiền." },
    { title: "6. Cộng đồng: điều không được phép", content: "Đây là nơi người lớn gặp nhau, trò chuyện và chơi với nhau. Chúng tôi không lọc từ ngữ và không theo dõi tin nhắn. Chỉ cấm: nội dung bất hợp pháp; mua hoặc bán xu (hay sticker) bằng tiền thật; tiếp tục quấy rối người đã chặn bạn. Sticker và thưởng mời bạn bè chỉ là vật phẩm ảo, không có giá trị bằng tiền." },
    { title: "7. Ảnh, tin nhắn, chặn và báo cáo", content: "Bạn có thể gửi ảnh trong tin nhắn riêng, hội, phòng chat và mục Trò chuyện. Ảnh được thu nhỏ và xoá toàn bộ thông tin vị trí/EXIF. Ảnh từ người không phải bạn bè được làm mờ cho tới khi bạn chạm để xem (có thể tắt trong cài đặt). Bạn có thể chặn bất kỳ ai và báo cáo người chơi, tin nhắn, ảnh, chủ đề, hội hay bài tìm trận. Báo cáo được gửi tới hàng chờ của quản trị viên: quản trị viên chỉ xem nội dung bị báo cáo (với tin nhắn riêng bị báo cáo, kèm vài tin trước đó), rồi có thể xoá tin nhắn, bài viết hay ảnh và khoá tài khoản vi phạm. Đừng bao giờ chia sẻ mật khẩu." },
    { title: "8. Quyền riêng tư", content: "Chúng tôi lưu tên đăng nhập, mật khẩu đã mã hoá, thống kê chơi game, tin nhắn bạn gửi trong phòng trò chuyện, ảnh đại diện và tin nhắn riêng của bạn. Bạn có thể tự xoá tài khoản bất cứ lúc nào. Xem Chính sách quyền riêng tư tại vnslot888.online/privacy." },
    { title: "9. Giới hạn trách nhiệm", content: "Trò chơi được cung cấp \"nguyên trạng\". Chúng tôi có thể đặt lại số dư xu hoặc tạm dừng tài khoản vi phạm điều khoản." },
  ], [
    { title: "1. Introduction", content: "VnSlot 888 is a free-to-play slot game for entertainment. By using it you agree to these terms." },
    { title: "2. Eligibility", content: "You must be 18 or older. One account per person." },
    { title: "3. Play money", content: "Coins are entertainment points only. They cannot be bought with real money, cannot be exchanged for money, goods or anything of value, and cannot be transferred. Anyone offering to buy or sell coins has nothing to do with us." },
    { title: "4. How the games work", content: "Every result (slot, Bầu Cua, roulette, blackjack) is drawn on the server by a cryptographic random number generator. The rules and return to player are published in each game: slot 97.6% with the best holds (88.7% if you never hold), Bầu Cua 92.13%, roulette 97.30%, blackjack about 99.6% with basic strategy. Results are never adjusted per player. Pool is a game of skill between two players: each puts up the same stake in coins, the winner takes both, and the house takes nothing. Pool tournaments are free to enter and their prizes are play coins." },
    { title: "5. Promo codes", content: "Promo codes add free play coins and can be used once. They have no cash value." },
    { title: "6. Community: what's not allowed", content: "This is a place for grown-ups to meet, talk and play each other. We don't filter words and we don't monitor messages. Only these are not allowed: illegal content; buying or selling coins (or stickers) for real money; carrying on harassing someone after they've blocked you. Stickers and invite rewards are virtual items only, with no cash value." },
    { title: "7. Photos, messages, blocking and reporting", content: "You can send photos in private messages, clubs, lounge rooms and Talk. Photos are shrunk and all location/EXIF data is removed. Photos from people who aren't your friends are blurred until you tap them (you can turn this off in settings). You can block anyone, and report players, messages, photos, threads, clubs and match posts. Reports go to the admins' queue: admins see only what was reported (for a reported private message, also the few messages before it), and can delete messages, posts or photos and ban accounts that break the rules. Never share your password." },
    { title: "8. Privacy", content: "We store your username, a hashed password, your game statistics, the messages you post in the chat room, and your profile photo and private messages. You can delete your account yourself at any time. See the Privacy Policy at vnslot888.online/privacy." },
    { title: "9. Liability", content: "The game is provided \"as is\". We may reset coin balances or suspend accounts that break these terms." },
  ], [
    { title: "1. 簡介", content: "VnSlot 888 是一款免費的娛樂老虎機遊戲。使用本遊戲即表示你同意以下條款。" },
    { title: "2. 資格", content: "你必須年滿 18 歲。每人限一個帳號。" },
    { title: "3. 遊戲金幣", content: "金幣僅為娛樂點數。金幣無法用真錢購買，無法兌換成金錢、商品或任何有價物品，也無法轉讓。任何提出買賣金幣的人都與我們無關。" },
    { title: "4. 遊戲運作方式", content: "每一個結果（老虎機、魚蝦蟹、輪盤、21點）都由伺服器以加密等級的亂數產生器抽出。各遊戲中都公布了規則與返還率：老虎機在最佳保留轉輪下為 97.6%（從不保留則為 88.7%），魚蝦蟹 92.13%，輪盤 97.30%，21點採用基本策略約為 99.6%。結果絕不會針對個別玩家調整。撞球是兩位玩家之間的技巧遊戲：雙方各押上相同的金幣底注，贏家拿走全部，莊家不抽成。撞球錦標賽免費參加，獎品為遊戲金幣。" },
    { title: "5. 優惠碼", content: "優惠碼可增加免費遊戲金幣，每個代碼只能使用一次。優惠碼不具現金價值。" },
    { title: "6. 社群：禁止事項", content: "這裡是成年人相識、聊天和互相對戰的地方。我們不過濾用語，也不監看訊息。只禁止：違法內容；以真錢買賣金幣（或貼圖）；在對方封鎖你之後繼續騷擾。貼圖和邀請獎勵僅為虛擬物品，不具現金價值。" },
    { title: "7. 照片、訊息、封鎖與檢舉", content: "你可以在私訊、公會、交誼廳和「聊天」中傳送照片。照片會被縮小，並移除所有位置與 EXIF 資訊。非好友傳來的照片會先模糊顯示，點一下才會顯示（可在設定中關閉）。你可以封鎖任何人，也可以檢舉玩家、訊息、照片、話題、公會和找對手貼文。檢舉會送到管理員的待處理清單：管理員只會看到被檢舉的內容（被檢舉的私訊會附上前幾則訊息），並可刪除訊息、貼文或照片，以及停權違規帳號。絕不要分享你的密碼。" },
    { title: "8. 隱私權", content: "我們會儲存你的帳號、經雜湊處理的密碼、你的遊戲統計資料、你在聊天室發布的訊息，以及你的大頭貼和私訊。你可以隨時自行刪除帳號。請參閱隱私權政策：vnslot888.online/privacy。" },
    { title: "9. 責任限制", content: "本遊戲按「現狀」提供。對於違反這些條款的帳號，我們可能會重設金幣餘額或停權。" },
  ]);

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
              {tr("Điều Khoản Sử Dụng", "Terms of Service", "服務條款")}
            </h1>
            <p className="text-sm text-yellow-100/40">
              {tr("Cập nhật: Tháng 10, 2026", "Last updated: October 2026", "最後更新：2026 年 10 月")}
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
            <p className="text-xs text-yellow-100/30">© VnSlot 888</p>
          </div>
        </div>
      </main>
    </div>
  );
}
