import { createContext, useContext, useState, ReactNode } from "react";

type Language = "en" | "vi";

interface Translations {
  welcome: string;
  login: string;
  register: string;
  username: string;
  password: string;
  spin: string;
  bet: string;
  balance: string;
  win: string;
  jackpot: string;
  logout: string;
  leaderboard: string;
  playNow: string;
  loading: string;
  aiPredict: string;
  aiAdviceTitle: string;
  streak: string;
  achievement: string;
  tokens: string;
  topUp: string;
  autoSpin: string;
  statistics: string;
  totalWins: string;
  maxWin: string;
  gamesPlayed: string;
  deposit: string;
  about: string;
  terms: string;
  privacy: string;
  support: string;
  beginQuest: string;
  subtitle: string;
  description: string;
  descriptionDragon: string;
  descriptionEnd: string;
  maxWinStat: string;
  freeSpins: string;
  bonusRounds: string;
  repeaterWins: string;
  repeaterWinsDesc: string;
  wildMultipliers: string;
  wildMultipliersDesc: string;
  dragonJackpot: string;
  dragonJackpotDesc: string;
  achievements: string;
  topPlayers: string;
  won: string;
  noPlayersYet: string;
  games: string;
  wins: string;
  withdraw: string;
  profile: string;
  contactAgent: string;
  insufficientBalance: string;
  insufficientBalanceDesc: string;
  soClose: string;
  repeater: string;
  reSpinning: string;
  shareWin: string;
  bigWin: string;
  lines: string;
  free: string;
  freeButton: string;
  paylines: string;
  grid3x3: string;
  diagonals: string;
  error: string;
  encouragement1: string;
  encouragement2: string;
  copyright: string;
  live: string;
  firstName: string;
  lastName: string;
  saveChanges: string;
  memberSince: string;
  editProfile: string;
  profileUpdated: string;
}

const translations: Record<Language, Translations> = {
  en: {
    welcome: "Welcome to VnSlot",
    login: "Enter Realm",
    register: "Join Dynasty",
    username: "Imperial Name",
    password: "Secret Key",
    spin: "STRIKE",
    bet: "Tribute",
    balance: "Treasury",
    win: "GLORY!",
    jackpot: "DRAGON'S FORTUNE!!!",
    logout: "Depart",
    leaderboard: "Hall of Legends",
    playNow: "Claim Fortune",
    loading: "Summoning Luck...",
    aiPredict: "Seek Oracle",
    aiAdviceTitle: "The Oracle Speaks",
    streak: "Streak",
    achievement: "Achievement",
    tokens: "Tokens",
    topUp: "Top Up",
    autoSpin: "Auto Spin",
    statistics: "Statistics",
    totalWins: "Total Wins",
    maxWin: "Max Win",
    gamesPlayed: "Games Played",
    deposit: "Deposit",
    about: "About Us",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    support: "Support",
    beginQuest: "Begin Your Quest",
    subtitle: "888 Dragon Fortune",
    description: "Experience the legendary power of the",
    descriptionDragon: "Dragon",
    descriptionEnd: ". Win massive rewards, unlock bonus rounds, and claim your fortune in the ultimate Oriental slot experience.",
    maxWinStat: "MAX WIN",
    freeSpins: "FREE SPINS",
    bonusRounds: "BONUS ROUNDS",
    repeaterWins: "REPEATER WINS",
    repeaterWinsDesc: "Chain matching symbols for exponential rewards",
    wildMultipliers: "WILD MULTIPLIERS",
    wildMultipliersDesc: "Unlock 2x, 5x, 10x bonus multipliers",
    dragonJackpot: "DRAGON JACKPOT",
    dragonJackpotDesc: "Hit the legendary jackpot for ultimate glory",
    achievements: "Achievements",
    topPlayers: "Top Players",
    won: "won",
    noPlayersYet: "No players yet",
    games: "Games",
    wins: "Wins",
    withdraw: "Withdraw",
    profile: "Profile",
    contactAgent: "Contact agent to withdraw",
    insufficientBalance: "Insufficient Balance",
    insufficientBalanceDesc: "Please top up to continue playing!",
    soClose: "SO CLOSE!",
    repeater: "REPEATER!",
    reSpinning: "Re-spinning for bonus...",
    shareWin: "Share Win",
    bigWin: "BIG WIN",
    lines: "LINES!",
    free: "FREE",
    freeButton: "Free",
    paylines: "5 PAYLINES",
    grid3x3: "3×3 GRID",
    diagonals: "DIAGONALS",
    error: "Error",
    encouragement1: "The Dragon stirs... BIG WIN incoming!",
    encouragement2: "Almost there! Keep spinning!",
    copyright: "© 2024 Dragon Fortune Entertainment Ltd.",
    live: "LIVE",
    firstName: "First Name",
    lastName: "Last Name",
    saveChanges: "Save Changes",
    memberSince: "Member Since",
    editProfile: "Edit Profile",
    profileUpdated: "Profile updated successfully",
  },
  vi: {
    welcome: "Chào mừng đến VnSlot",
    login: "Vào Cung",
    register: "Gia Nhập",
    username: "Danh Tính",
    password: "Mật Mã",
    spin: "KHAI VẬN",
    bet: "Mức Cược",
    balance: "Ngân Khố",
    win: "ĐẠI CÁT!",
    jackpot: "LONG HŨ NỔ!!!",
    logout: "Rời Cung",
    leaderboard: "Bảng Phong Thần",
    playNow: "Chơi Ngay",
    loading: "Đang Triệu Hồi...",
    aiPredict: "Hỏi Thần Tài",
    aiAdviceTitle: "Lời Sấm Truyền",
    streak: "Chuỗi Thắng",
    achievement: "Thành Tựu",
    tokens: "Xu",
    topUp: "Nạp Thêm",
    autoSpin: "Tự Động Quay",
    statistics: "Thống Kê",
    totalWins: "Tổng Thắng",
    maxWin: "Thắng Lớn Nhất",
    gamesPlayed: "Lượt Chơi",
    deposit: "Nạp Tiền",
    about: "Về Chúng Tôi",
    terms: "Điều Khoản",
    privacy: "Bảo Mật",
    support: "Hỗ Trợ",
    beginQuest: "Bắt Đầu Hành Trình",
    subtitle: "888 Long Phát Tài",
    description: "Trải nghiệm sức mạnh huyền thoại của",
    descriptionDragon: "Rồng",
    descriptionEnd: ". Giành phần thưởng lớn, mở khóa vòng thưởng, và chinh phục vận may trong trò chơi slot Phương Đông đỉnh cao.",
    maxWinStat: "THẮNG TỐI ĐA",
    freeSpins: "LƯỢT QUAY MIỄN PHÍ",
    bonusRounds: "VÒNG THƯỞNG",
    repeaterWins: "THẮNG LIÊN TIẾP",
    repeaterWinsDesc: "Kết chuỗi biểu tượng để nhận thưởng cấp số nhân",
    wildMultipliers: "NHÂN BỘI HOANG DÃ",
    wildMultipliersDesc: "Mở khóa nhân bội 2x, 5x, 10x",
    dragonJackpot: "HŨ RỒNG",
    dragonJackpotDesc: "Trúng hũ huyền thoại để đạt vinh quang tối thượng",
    achievements: "Thành Tựu",
    topPlayers: "Người Chơi Hàng Đầu",
    won: "thắng",
    noPlayersYet: "Chưa có người chơi",
    games: "Ván",
    wins: "Thắng",
    withdraw: "Rút Tiền",
    profile: "Hồ Sơ",
    contactAgent: "Liên hệ đại lý để rút tiền",
    insufficientBalance: "Không Đủ Số Dư",
    insufficientBalanceDesc: "Vui lòng nạp thêm để tiếp tục chơi!",
    soClose: "SẮP TRÚNG!",
    repeater: "QUAY LẠI!",
    reSpinning: "Đang quay thưởng...",
    shareWin: "Chia Sẻ",
    bigWin: "THẮNG LỚN",
    lines: "HÀNG!",
    free: "MIỄN PHÍ",
    freeButton: "Miễn Phí",
    paylines: "5 HÀNG THƯỞNG",
    grid3x3: "LƯỚI 3×3",
    diagonals: "ĐƯỜNG CHÉO",
    error: "Lỗi",
    encouragement1: "Rồng thức giấc... THẮNG LỚN sắp đến!",
    encouragement2: "Sắp trúng rồi! Tiếp tục quay!",
    copyright: "© 2024 Dragon Fortune Entertainment Ltd.",
    live: "TRỰC TIẾP",
    firstName: "Tên",
    lastName: "Họ",
    saveChanges: "Lưu Thay Đổi",
    memberSince: "Thành Viên Từ",
    editProfile: "Chỉnh Sửa Hồ Sơ",
    profileUpdated: "Cập nhật hồ sơ thành công",
  },
};

const LanguageContext = createContext<{
  lang: Language;
  toggleLang: () => void;
  t: Translations;
} | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>("vi");

  const toggleLang = () => setLang((prev) => (prev === "en" ? "vi" : "en"));

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
