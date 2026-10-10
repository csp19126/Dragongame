/**
 * The server answers in English. These are the messages players can see, in Vietnamese and
 * Chinese, keyed by the exact English text (anything not listed is shown as it came).
 */
export const SERVER_MESSAGES: Record<string, { vi: string; zh: string }> = {
  // General
  "Something went wrong": { vi: "Đã có lỗi xảy ra", zh: "發生錯誤" },
  "Bad request": { vi: "Yêu cầu không hợp lệ", zh: "請求無效" },
  "Invalid input": { vi: "Dữ liệu không hợp lệ", zh: "輸入無效" },
  "Not found": { vi: "Không tìm thấy", zh: "找不到" },
  "Bad id": { vi: "Mã không hợp lệ", zh: "編號無效" },
  "Just a moment": { vi: "Chờ một chút", zh: "請稍候" },
  "Slow down a little!": { vi: "Chậm lại một chút!", zh: "請放慢一點！" },
  "Not enough coins": { vi: "Không đủ xu", zh: "金幣不足" },
  "Insufficient balance": { vi: "Không đủ xu", zh: "餘額不足" },
  "Player not found": { vi: "Không tìm thấy người chơi", zh: "找不到玩家" },
  "No such player": { vi: "Không có người chơi này", zh: "沒有這位玩家" },

  // Account
  "Too many attempts, try again in a few minutes": { vi: "Thử quá nhiều lần, vui lòng thử lại sau vài phút", zh: "嘗試次數過多，請幾分鐘後再試" },
  "Not logged in": { vi: "Bạn chưa đăng nhập", zh: "尚未登入" },
  "This account has been suspended": { vi: "Tài khoản này đã bị khoá", zh: "此帳號已被停權" },
  "Could not start session": { vi: "Không thể bắt đầu phiên đăng nhập", zh: "無法建立登入工作階段" },
  "That username is taken": { vi: "Tên đăng nhập này đã có người dùng", zh: "此帳號名稱已被使用" },
  "Username and password required": { vi: "Vui lòng nhập tên đăng nhập và mật khẩu", zh: "請輸入帳號和密碼" },
  "Wrong username or password": { vi: "Sai tên đăng nhập hoặc mật khẩu", zh: "帳號或密碼錯誤" },
  "Username must be at least 3 characters": { vi: "Tên đăng nhập phải có ít nhất 3 ký tự", zh: "帳號至少需要 3 個字元" },
  "Username is too long": { vi: "Tên đăng nhập quá dài", zh: "帳號太長" },
  "Username has invalid characters": { vi: "Tên đăng nhập có ký tự không hợp lệ", zh: "帳號含有無效字元" },
  "Password must be at least 6 characters": { vi: "Mật khẩu phải có ít nhất 6 ký tự", zh: "密碼至少需要 6 個字元" },
  "Password is wrong": { vi: "Mật khẩu không đúng", zh: "密碼錯誤" },
  "Current password is wrong": { vi: "Mật khẩu hiện tại không đúng", zh: "目前密碼錯誤" },
  "Enter a code": { vi: "Hãy nhập mã", zh: "請輸入代碼" },
  "Invalid or already used code": { vi: "Mã không hợp lệ hoặc đã được sử dụng", zh: "代碼無效或已被使用" },

  // Dragon slot & Xóc Đĩa
  "Invalid bet": { vi: "Mức cược không hợp lệ", zh: "押注無效" },
  "Pick your free spins first": { vi: "Hãy chọn lượt quay miễn phí trước", zh: "請先選擇免費旋轉方式" },
  "No hold to use": { vi: "Không có lượt giữ cuộn để dùng", zh: "沒有可用的保留轉輪" },
  "Hold up to 2 reels, at the bet you lost on": { vi: "Giữ tối đa 2 cuộn, với đúng mức cược vừa thua", zh: "最多保留 2 個轉輪，且須使用剛才輸掉的押注" },
  "Invalid choice": { vi: "Lựa chọn không hợp lệ", zh: "選擇無效" },
  "No free spins to pick": { vi: "Không có lượt quay miễn phí để chọn", zh: "沒有可選擇的免費旋轉" },
  "Invalid pick": { vi: "Lựa chọn không hợp lệ", zh: "選擇無效" },
  "Nothing to double up": { vi: "Không có gì để nhân đôi", zh: "沒有可比倍的獎金" },
  "That's the last round": { vi: "Đây là ván cuối rồi", zh: "這已經是最後一輪" },
  "That's over the double-up limit": { vi: "Vượt quá giới hạn nhân đôi", zh: "已超過比倍上限" },

  // Bầu Cua & Roulette
  "Place a bet first": { vi: "Hãy đặt cược trước", zh: "請先下注" },
  "Too much on the table": { vi: "Tiền cược trên bàn quá nhiều", zh: "桌上押注過多" },
  "Too many bets": { vi: "Quá nhiều cược", zh: "押注數量過多" },
  "One stake per spot": { vi: "Mỗi ô chỉ được cược một lần", zh: "每個位置只能押注一次" },

  // Blackjack
  "Finish your hand first": { vi: "Hãy chơi xong ván bài hiện tại trước", zh: "請先完成這一手牌" },
  "Invalid action": { vi: "Thao tác không hợp lệ", zh: "操作無效" },
  "No hand in play": { vi: "Không có ván bài nào đang chơi", zh: "目前沒有進行中的牌局" },
  "You can't do that now": { vi: "Bây giờ bạn không thể làm vậy", zh: "現在無法這麼做" },

  // Card tables
  "Pick a game and a stake": { vi: "Hãy chọn trò chơi và mức cược", zh: "請選擇遊戲和底注" },
  "You're already at a table": { vi: "Bạn đang ở một bàn khác rồi", zh: "你已經在一張牌桌上了" },
  "Table not found": { vi: "Không tìm thấy bàn", zh: "找不到牌桌" },
  "Sit down first": { vi: "Hãy ngồi vào bàn trước", zh: "請先入座" },
  "It isn't your turn": { vi: "Chưa đến lượt bạn", zh: "還沒輪到你" },
  "You can only double on your first two cards": { vi: "Chỉ được gấp đôi với hai lá bài đầu tiên", zh: "只能在前兩張牌時加倍" },
  "Unknown move": { vi: "Nước đi không hợp lệ", zh: "未知的操作" },
  "Five cards is the most": { vi: "Tối đa năm lá bài", zh: "最多只能有五張牌" },
  "You need 16 or more to stand": { vi: "Bạn cần từ 16 điểm trở lên mới được dừng", zh: "需要 16 點以上才能停牌" },
  "You need 15 or more to stand": { vi: "Bạn cần từ 15 điểm trở lên mới được dừng", zh: "需要 15 點以上才能停牌" },
  "You're already sitting at another table": { vi: "Bạn đang ngồi ở bàn khác rồi", zh: "你已經坐在另一張牌桌" },
  "The table is full": { vi: "Bàn đã đủ người", zh: "牌桌已滿" },

  // Pool
  "Not your turn": { vi: "Chưa đến lượt bạn", zh: "還沒輪到你" },
  "Waiting for your opponent": { vi: "Đang chờ đối thủ", zh: "正在等待對手" },
  "Invalid stake": { vi: "Mức cược không hợp lệ", zh: "底注無效" },
  "You already have a table": { vi: "Bạn đã có bàn rồi", zh: "你已經有一張球桌" },
  "Someone already took that seat": { vi: "Đã có người ngồi vào chỗ đó", zh: "這個座位已經有人了" },
  "Finish your own table first": { vi: "Hãy chơi xong bàn của bạn trước", zh: "請先完成你自己的球桌" },
  "The game has started": { vi: "Ván đấu đã bắt đầu", zh: "比賽已經開始" },
  "Can't place the cue ball there": { vi: "Không thể đặt bi cái ở đó", zh: "母球不能放在那裡" },
  "Game over": { vi: "Ván đấu đã kết thúc", zh: "比賽結束" },
  "Bad aim": { vi: "Hướng ngắm không hợp lệ", zh: "瞄準無效" },
  "Bad shot": { vi: "Cú bắn không hợp lệ", zh: "射擊無效" },
  "No cue ball": { vi: "Không có bi cái", zh: "沒有母球" },

  // Tournament
  "Registration is closed": { vi: "Đã hết hạn đăng ký", zh: "報名已截止" },
  "The tournament is full": { vi: "Giải đấu đã đủ người", zh: "錦標賽已額滿" },
  "The tournament has started": { vi: "Giải đấu đã bắt đầu", zh: "錦標賽已經開始" },

  // Lô Tô
  "That isn't a valid ticket": { vi: "Vé này không hợp lệ", zh: "這張賓果卡無效" },
  "Sales have closed for this round. Wait for the next one!": { vi: "Đã hết giờ bán vé ván này. Hãy chờ ván sau nhé!", zh: "本輪已停止販售，請等下一輪！" },
  "At most 6 tickets a round": { vi: "Tối đa 6 vé mỗi ván", zh: "每輪最多 6 張賓果卡" },
  "Pick a ticket price": { vi: "Hãy chọn giá vé", zh: "請選擇賓果卡價格" },

  // Tiến Lên
  "Pick a stake": { vi: "Hãy chọn mức cược", zh: "請選擇底注" },
  "Finish the game you're playing first": { vi: "Hãy chơi xong ván hiện tại trước", zh: "請先完成目前的牌局" },
  "No game in progress": { vi: "Không có ván nào đang diễn ra", zh: "目前沒有進行中的牌局" },
  "Pick some cards, or pass": { vi: "Hãy chọn bài để đánh, hoặc bỏ lượt", zh: "請選牌出牌，或選擇過" },
  "The game is over": { vi: "Ván đã kết thúc", zh: "牌局已結束" },
  "You don't have those cards": { vi: "Bạn không có những lá bài đó", zh: "你沒有這些牌" },
  "That isn't a valid play": { vi: "Nước đánh không hợp lệ", zh: "這不是有效的出牌" },
  "The first play must include 3♠": { vi: "Lượt đánh đầu tiên phải có 3♠", zh: "第一手必須包含 3♠" },
  "That doesn't beat the table": { vi: "Bài này không chặn được bài trên bàn", zh: "這手牌壓不過桌上的牌" },
  "You lead this trick, so you have to play": { vi: "Bạn đi đầu vòng này nên phải đánh bài", zh: "這一輪由你先出，不能過" },

  // Stickers & chat
  "No such set": { vi: "Không có bộ sưu tập này", zh: "沒有這個套組" },
  "Set not complete yet": { vi: "Bộ sưu tập chưa đủ", zh: "套組尚未集齊" },
  "Already claimed": { vi: "Đã nhận rồi", zh: "已經領取過了" },
  "You need 5 spare stickers": { vi: "Bạn cần 5 nhãn dán thừa", zh: "你需要 5 張重複的貼圖" },
  "No such sticker": { vi: "Không có nhãn dán này", zh: "沒有這張貼圖" },
  "No gifts left today": { vi: "Hôm nay bạn đã hết lượt tặng", zh: "今天的贈送次數已用完" },
  "You can't gift yourself": { vi: "Bạn không thể tự tặng cho mình", zh: "不能送給自己" },
  "You need a spare one to gift": { vi: "Bạn cần có một nhãn dán thừa để tặng", zh: "需要有重複的貼圖才能贈送" },
  "Which pack?": { vi: "Gói nào?", zh: "哪一包？" },
  "No pack of that kind to open": { vi: "Không có gói loại này để mở", zh: "沒有這種卡包可以開啟" },
  "Who and which sticker?": { vi: "Tặng ai và nhãn dán nào?", zh: "要送給誰、哪張貼圖？" },
  "That's your own message": { vi: "Đó là tin nhắn của chính bạn", zh: "這是你自己的訊息" },
  "Not on yourself": { vi: "Không thể áp dụng cho chính bạn", zh: "不能對自己使用" },
};
