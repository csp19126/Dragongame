/** What the admin's Overview and player pages are given */

export const GAME_NAMES: Record<string, { label: string; icon: string }> = {
  slot: { label: "Dragon slot", icon: "🐉" },
  xocdia: { label: "Xóc Đĩa double-up", icon: "🥣" },
  blackjack: { label: "Blackjack", icon: "🃏" },
  roulette: { label: "Roulette", icon: "🎡" },
  baucua: { label: "Bầu Cua", icon: "🦀" },
  pool: { label: "8-ball pool", icon: "🎱" },
  loto: { label: "Lô Tô", icon: "🎱" },
  tienlen: { label: "Tiến Lên", icon: "🂡" },
  banca: { label: "Bắn Cá", icon: "🐟" },
};

export const BONUS_NAMES: Record<string, string> = {
  daily_bonus: "Daily gift",
  admin_gift: "Gifts from admin",
  promo_code: "Promo codes",
  league_prize: "Pool league prizes",
  tournament_prize: "Tournament prizes",
  pool_daily_win: "Pool first-win bonus",
  referral: "Invite rewards",
  referral_welcome: "Invite welcome bonus",
  sticker_set: "Sticker set rewards",
  sticker_album: "Sticker album reward",
};

export interface AdminAnalytics {
  days: number;
  hideAdmins: boolean;
  today: string;
  /** When game-by-game tracking started (older plays weren't recorded) */
  trackingSince: string | null;
  kpis: {
    totalUsers: number; newToday: number; new7: number; new30: number;
    dau: number; wau: number; mau: number; onlineNow: number;
    playsToday: number; wageredToday: number; paidToday: number;
    coinsHeld: number; givenAway: number; chatToday: number;
  };
  daily: { day: string; signups: number; active: number; plays: number; players: number; wagered: number; paid: number }[];
  games: { game: string; plays: number; players: number; wagered: number; paid: number; biggest: number }[];
  topPlayers: { id: string; username: string; balance: number; lastSeenAt: string | null; plays: number; wagered: number; paid: number; daysPlayed: number }[];
  biggestWins: { username: string; game: string; bet: number; payout: number; at: string }[];
  /** Plays in each hour of the day, Vietnam time */
  hours: number[];
  bonuses: { method: string; times: number; amount: number }[];
  retention: {
    d1: { joined: number; returned: number };
    d7: { joined: number; returned: number };
    cohorts: { day: string; joined: number; d1: number; d7: number }[];
  };
  recentSignups: { id: string; username: string; createdAt: string | null; balance: number; gamesPlayed: number; lastSeenAt: string | null; invitedBy: string | null }[];
}

export interface AdminPlayer {
  id: string; username: string; balance: number;
  createdAt: string | null; lastSeenAt: string | null;
  isAdmin: boolean; banned: boolean; mutedUntil: string | null;
  gamesPlayed: number; totalWins: number; maxWin: number;
  invitedBy: string | null; invited: number;
  daysActive: number; chatMessages: number;
  pool: { won: number; lost: number };
  /** Days active in the last 30 (YYYY-MM-DD, Vietnam time) */
  activeDays: string[];
  games: { game: string; plays: number; wagered: number; paid: number; biggest: number; lastAt: string | null }[];
  plays: { game: string; bet: number; payout: number; at: string }[];
  bonuses: { method: string; amount: number; at: string }[];
  chat: { text: string | null; sticker: string | null; at: string; deleted: boolean }[];
}
