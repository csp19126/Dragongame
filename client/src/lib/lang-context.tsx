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
