/** Meeting people (Làm quen / Meet / 交友): opt-in profiles, 💛, and a private chat once both tap 💛 */

export const DATING_MIN_GAMES = 20;
export const DATING_MIN_ACCOUNT_DAYS = 3;
export const DATING_LIKES_PER_DAY = 50;
export const DATING_MIN_AGE = 18;
export const DATING_MAX_AGE = 99;

export const LOOKING_FOR = ["friends", "chat", "dating"] as const;
export type LookingFor = (typeof LOOKING_FOR)[number];
export const GENDERS = ["man", "woman", "other"] as const;
export type Gender = (typeof GENDERS)[number];

export const LOOKING_FOR_TEXT: Record<LookingFor, { vi: string; en: string; zh: string; icon: string }> = {
  friends: { icon: "🤝", vi: "Kết bạn", en: "Friends", zh: "交朋友" },
  chat: { icon: "💬", vi: "Trò chuyện", en: "A chat", zh: "聊天" },
  dating: { icon: "💛", vi: "Hẹn hò", en: "Dating", zh: "約會" },
};
export const GENDER_TEXT: Record<Gender, { vi: string; en: string; zh: string }> = {
  man: { vi: "Nam", en: "Man", zh: "男" },
  woman: { vi: "Nữ", en: "Woman", zh: "女" },
  other: { vi: "Khác", en: "Other", zh: "其他" },
};

export function ageFrom(birthYear: number | null | undefined, now = new Date()): number | null {
  if (!birthYear) return null;
  return now.getUTCFullYear() - birthYear;
}

/** Whether two people's settings fit each other (gender wanted, both ways; ages inside both ranges) */
export function compatible(
  a: { gender: string | null; seeking: string[]; ageMin: number; ageMax: number; age: number | null },
  b: { gender: string | null; seeking: string[]; ageMin: number; ageMax: number; age: number | null },
): boolean {
  const wants = (x: typeof a, y: typeof b) => !x.seeking.length || (!!y.gender && x.seeking.includes(y.gender));
  const inRange = (x: typeof a, y: typeof b) => y.age === null || (y.age >= x.ageMin && y.age <= x.ageMax);
  return wants(a, b) && wants(b, a) && inRange(a, b) && inRange(b, a);
}

export interface DatingMe {
  open: boolean; lookingFor: LookingFor; birthYear: number | null; gender: Gender | null; seeking: Gender[]; ageMin: number; ageMax: number;
  eligible: boolean; needs: { games: number; days: number; photo: boolean };
}
export interface DatingPerson {
  username: string; avatarUrl: string | null; age: number | null; gender: Gender | null; lookingFor: LookingFor;
  bio: string | null; country: string | null; languages: string[]; favGames: string[]; online: boolean; liked: boolean; matched: boolean;
}
