import type { LocalText } from "@/lib/lang-context";

/**
 * The achievement badges, with their names and descriptions in every language.
 * The server stores English names; the client shows these instead (matched by badge id).
 */
export const ALL_ACHIEVEMENTS: { id: string; name: LocalText; description: LocalText; icon: string }[] = [
  { id: "first_win", name: { vi: "Thắng Đầu Tiên", en: "First Win", zh: "初次獲勝" }, description: { vi: "Thắng lượt quay đầu tiên", en: "Win your first spin", zh: "贏得第一次旋轉" }, icon: "star" },
  { id: "hot_streak_3", name: { vi: "Chuỗi Nóng", en: "Hot Streak", zh: "手氣正旺" }, description: { vi: "Thắng 3 lần liên tiếp", en: "3 wins in a row", zh: "連贏 3 次" }, icon: "flame" },
  { id: "hot_streak_5", name: { vi: "Bốc Lửa", en: "On Fire", zh: "火力全開" }, description: { vi: "Thắng 5 lần liên tiếp", en: "5 wins in a row", zh: "連贏 5 次" }, icon: "zap" },
  { id: "dragon_master", name: { vi: "Chúa Tể Rồng", en: "Dragon Master", zh: "神龍大師" }, description: { vi: "3 rồng trên một hàng", en: "3 dragons on a line", zh: "一條連線上 3 條龍" }, icon: "crown" },
  { id: "high_roller", name: { vi: "Tay Chơi Lớn", en: "High Roller", zh: "豪客" }, description: { vi: "Cược từ 100.000 trở lên", en: "Bet 100,000+", zh: "押注 100,000 以上" }, icon: "gem" },
  { id: "millionaire", name: { vi: "Triệu Phú", en: "Millionaire", zh: "百萬富翁" }, description: { vi: "Đạt 1 triệu xu", en: "Reach 1M balance", zh: "餘額達到 100 萬" }, icon: "trophy" },
  { id: "jackpot_hunter", name: { vi: "Thợ Săn Thưởng", en: "Jackpot Hunter", zh: "大獎獵人" }, description: { vi: "Thắng gấp 50 lần mức cược", en: "Win 50x your bet", zh: "贏得押注的 50 倍" }, icon: "target" },
  { id: "lucky_seven", name: { vi: "Thất Tinh May Mắn", en: "Lucky Seven", zh: "幸運七" }, description: { vi: "Thắng 7 lần", en: "Win 7 times", zh: "贏 7 次" }, icon: "gift" },
  { id: "lucky_envelope", name: { vi: "Lì Xì May Mắn", en: "Lucky Envelope", zh: "幸運紅包" }, description: { vi: "Ra 3 phong lì xì", en: "Land 3 red envelopes", zh: "轉出 3 個紅包" }, icon: "mail" },
  { id: "pearl_power", name: { vi: "Sức Mạnh Ngọc Rồng", en: "Pearl Power", zh: "龍珠之力" }, description: { vi: "Thắng một hàng nhờ Ngọc Rồng", en: "Win a line with a wild", zh: "靠龍珠贏得一條連線" }, icon: "sparkles" },
  { id: "chain_reaction", name: { vi: "Phản Ứng Dây Chuyền", en: "Chain Reaction", zh: "連鎖反應" }, description: { vi: "3 lần Rồng Lặp trong một lượt", en: "3 Repeaters in one spin", zh: "一次旋轉觸發 3 次神龍連轉" }, icon: "repeat" },
  { id: "no_hu", name: { vi: "Nổ Hũ!", en: "Nổ Hũ!", zh: "爆彩金！" }, description: { vi: "Trúng hũ Hũ Rồng", en: "Win the Hũ Rồng jackpot", zh: "贏得神龍彩金" }, icon: "crown" },
];

const BY_ID = new Map(ALL_ACHIEVEMENTS.map((a) => [a.id, a]));

/** The toast for a newly earned badge, in the player's language (falls back to the server's text) */
export function achievementToast(a: { badgeId: string; badgeName: string; description: string | null }, loc: (t: LocalText) => string) {
  const def = BY_ID.get(a.badgeId);
  return { title: `🏆 ${def ? loc(def.name) : a.badgeName}`, description: def ? loc(def.description) : a.description ?? undefined };
}
