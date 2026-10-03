import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "en" | "vi";

const en = {
  login: "Enter Realm",
  register: "Join Dynasty",
  username: "Username",
  password: "Password",
  spin: "SPIN",
  bet: "Bet",
  balance: "Treasury",
  logout: "Log out",
  leaderboard: "Hall of Legends",
  loading: "Summoning luck...",
  streak: "Win Streak",
  topUp: "Free Coins",
  autoSpin: "Auto",
  totalWins: "Total Wins",
  maxWin: "Biggest Win",
  gamesPlayed: "Games Played",
  deposit: "Free Coins",
  about: "About",
  terms: "Terms",
  support: "Support",
  beginQuest: "Play Free",
  subtitle: "888 Dragon Fortune",
  description: "A free-to-play Vietnamese-style slot. Spin the reels, line up the",
  descriptionDragon: "Dragon",
  descriptionEnd: " and climb the Hall of Legends. Play money only — no real money in, no real money out.",
  maxWinStat: "TOP PAYOUT",
  freeSpins: "FREE SPINS",
  dailyCoins: "DAILY COINS",
  feature1: "5 PAYLINES",
  feature1Desc: "3 rows and 2 diagonals on a 3×3 grid",
  feature2: "DRAGON ORACLE",
  feature2Desc: "Once an hour the Oracle doubles your next spin's winnings",
  feature3: "FAIR & OPEN",
  feature3Desc: "96% return-to-player, published paytable, no rigged near-misses",
  achievements: "Achievements",
  topPlayers: "Top Players",
  won: "won",
  noPlayersYet: "No players yet",
  noWinsYet: "No big wins yet — be the first!",
  games: "Games",
  wins: "Wins",
  profile: "Profile",
  insufficientBalance: "Not enough coins",
  insufficientBalanceDesc: "Lower your bet or grab your free daily coins.",
  bigWin: "BIG WIN!",
  megaWin: "DRAGON FORTUNE!",
  youWon: "You won",
  returned: "Stake returned",
  noWin: "No win this time",
  freeSpinsLeft: "free spins",
  freeSpinsWon: "free spins won!",
  oracle: "Oracle",
  oracleBlessed: "The Oracle blesses your next spin: winnings ×2",
  oracleCooldown: "The Oracle is resting. Back at",
  blessedBadge: "×2 NEXT SPIN",
  paytable: "Paytable",
  paytableIntro: "Three matching symbols on any of the 5 lines pays the multiple below, times your bet. All lines add up.",
  paytableFree: "Any spin paying 10× your bet or more also awards 3 free spins at the same bet.",
  rtpNote: "Return to player: 96.0% (exact). Every symbol is drawn independently by a cryptographic RNG.",
  error: "Error",
  copyright: "© VnSlot 888 · Free-to-play entertainment · 18+",
  live: "BIG WINS",
  firstName: "First Name",
  lastName: "Last Name",
  saveChanges: "Save Changes",
  memberSince: "Member Since",
  editProfile: "Edit Profile",
  profileUpdated: "Profile updated",
  changePassword: "Change Password",
  currentPassword: "Current password",
  newPassword: "New password",
  passwordChanged: "Password changed",
  playMoneyNote: "Coins are play money. They can't be bought for cash or exchanged for money or prizes.",
  sound: "Sound",
};

export type Translations = typeof en;

const vi: Translations = {
  login: "Vào Cung",
  register: "Gia Nhập",
  username: "Tên đăng nhập",
  password: "Mật khẩu",
  spin: "QUAY",
  bet: "Mức Cược",
  balance: "Ngân Khố",
  logout: "Đăng xuất",
  leaderboard: "Bảng Phong Thần",
  loading: "Đang triệu hồi...",
  streak: "Chuỗi Thắng",
  topUp: "Xu Miễn Phí",
  autoSpin: "Tự động",
  totalWins: "Tổng Thắng",
  maxWin: "Thắng Lớn Nhất",
  gamesPlayed: "Lượt Chơi",
  deposit: "Xu Miễn Phí",
  about: "Giới Thiệu",
  terms: "Điều Khoản",
  support: "Hỗ Trợ",
  beginQuest: "Chơi Miễn Phí",
  subtitle: "888 Long Phát Tài",
  description: "Trò chơi slot phong cách Việt, hoàn toàn miễn phí. Quay, xếp hàng",
  descriptionDragon: "Rồng",
  descriptionEnd: " và leo Bảng Phong Thần. Chỉ dùng xu ảo — không nạp tiền thật, không rút tiền thật.",
  maxWinStat: "THƯỞNG CAO NHẤT",
  freeSpins: "LƯỢT QUAY MIỄN PHÍ",
  dailyCoins: "XU MỖI NGÀY",
  feature1: "5 HÀNG THƯỞNG",
  feature1Desc: "3 hàng ngang và 2 đường chéo trên lưới 3×3",
  feature2: "THẦN RỒNG",
  feature2Desc: "Mỗi giờ một lần, Thần Rồng nhân đôi tiền thắng lượt quay tiếp theo",
  feature3: "CÔNG BẰNG",
  feature3Desc: "Tỷ lệ hoàn trả 96%, bảng thưởng công khai, không gài \"suýt trúng\"",
  achievements: "Thành Tựu",
  topPlayers: "Người Chơi Hàng Đầu",
  won: "thắng",
  noPlayersYet: "Chưa có người chơi",
  noWinsYet: "Chưa có thắng lớn — hãy là người đầu tiên!",
  games: "Ván",
  wins: "Thắng",
  profile: "Hồ Sơ",
  insufficientBalance: "Không đủ xu",
  insufficientBalanceDesc: "Giảm mức cược hoặc nhận xu miễn phí hằng ngày.",
  bigWin: "THẮNG LỚN!",
  megaWin: "LONG PHÁT TÀI!",
  youWon: "Bạn thắng",
  returned: "Hoàn lại tiền cược",
  noWin: "Chưa trúng lần này",
  freeSpinsLeft: "lượt miễn phí",
  freeSpinsWon: "lượt quay miễn phí!",
  oracle: "Thần Rồng",
  oracleBlessed: "Thần Rồng ban phước: lượt quay tiếp theo thắng ×2",
  oracleCooldown: "Thần Rồng đang nghỉ. Quay lại lúc",
  blessedBadge: "×2 LƯỢT TỚI",
  paytable: "Bảng Thưởng",
  paytableIntro: "Ba biểu tượng giống nhau trên bất kỳ hàng nào trong 5 hàng sẽ trả bội số dưới đây nhân với mức cược. Các hàng được cộng dồn.",
  paytableFree: "Lượt quay thắng từ 10× mức cược trở lên được thêm 3 lượt quay miễn phí cùng mức cược.",
  rtpNote: "Tỷ lệ hoàn trả: 96,0% (chính xác). Mỗi biểu tượng được chọn độc lập bằng bộ sinh số ngẫu nhiên mật mã.",
  error: "Lỗi",
  copyright: "© VnSlot 888 · Giải trí miễn phí · 18+",
  live: "THẮNG LỚN",
  firstName: "Tên",
  lastName: "Họ",
  saveChanges: "Lưu Thay Đổi",
  memberSince: "Thành Viên Từ",
  editProfile: "Chỉnh Sửa Hồ Sơ",
  profileUpdated: "Đã cập nhật hồ sơ",
  changePassword: "Đổi Mật Khẩu",
  currentPassword: "Mật khẩu hiện tại",
  newPassword: "Mật khẩu mới",
  passwordChanged: "Đã đổi mật khẩu",
  playMoneyNote: "Xu chỉ dùng để chơi. Không thể mua bằng tiền thật hay đổi ra tiền hoặc giải thưởng.",
  sound: "Âm thanh",
};

const translations: Record<Language, Translations> = { en, vi };

const LanguageContext = createContext<{
  lang: Language;
  toggleLang: () => void;
  t: Translations;
} | null>(null);

function initialLang(): Language {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "vi") return saved;
  } catch {}
  return "vi";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(initialLang);

  const toggleLang = () => setLang((prev) => {
    const next = prev === "en" ? "vi" : "en";
    try { localStorage.setItem("lang", next); } catch {}
    document.documentElement.lang = next;
    return next;
  });

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLang must be used within LanguageProvider");
  return context;
}
