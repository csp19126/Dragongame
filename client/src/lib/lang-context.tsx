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
}

const translations: Record<Language, Translations> = {
  en: {
    welcome: "Welcome to VnSlot",
    login: "Login",
    register: "Register",
    username: "Username",
    password: "Password",
    spin: "SPIN",
    bet: "Bet Amount",
    balance: "Balance",
    win: "YOU WON!",
    jackpot: "JACKPOT!!!",
    logout: "Logout",
    leaderboard: "Top Players",
    playNow: "Play Now",
    loading: "Loading...",
    aiPredict: "Ask AI Luck",
    aiAdviceTitle: "Oracle Says",
  },
  vi: {
    welcome: "Chào mừng đến VnSlot",
    login: "Đăng nhập",
    register: "Đăng ký",
    username: "Tên đăng nhập",
    password: "Mật khẩu",
    spin: "QUAY",
    bet: "Tiền cược",
    balance: "Số dư",
    win: "THẮNG LỚN!",
    jackpot: "NỔ HŨ!!!",
    logout: "Đăng xuất",
    leaderboard: "Bảng Xếp Hạng",
    playNow: "Chơi Ngay",
    loading: "Đang tải...",
    aiPredict: "Hỏi Thần Tài",
    aiAdviceTitle: "Lời Khuyên",
  },
};

const LanguageContext = createContext<{
  lang: Language;
  toggleLang: () => void;
  t: Translations;
} | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>("vi"); // Default to Vietnamese

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
