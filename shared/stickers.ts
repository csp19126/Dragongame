/**
 * The sticker album: four Vietnamese sets of six. Stickers come in packs of three:
 * one free pack a day, one for every PLAY_PACK_EVERY games played, and bonus packs
 * (inviting a friend). Completing a set pays coins once; completing the whole album
 * pays a big bonus. Stickers have no cash value and can only be gifted, never sold.
 */

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface Sticker {
  id: string;
  set: string;
  emoji: string;
  vi: string;
  en: string;
  rarity: Rarity;
}

export interface StickerSet {
  id: string;
  vi: string;
  en: string;
  reward: number;
  colors: [string, string];
}

export const STICKER_SETS: StickerSet[] = [
  { id: "tet", vi: "Tết Nguyên Đán", en: "Lunar New Year", reward: 200_000, colors: ["#e11d48", "#f59e0b"] },
  { id: "street", vi: "Phố Phường", en: "Street Life", reward: 200_000, colors: ["#0ea5e9", "#22c55e"] },
  { id: "home", vi: "Quê Hương", en: "Homeland", reward: 300_000, colors: ["#16a34a", "#84cc16"] },
  { id: "legend", vi: "Huyền Thoại", en: "Legends", reward: 1_000_000, colors: ["#7c3aed", "#f59e0b"] },
];

/** Paid once when every sticker in the album has been collected */
export const ALBUM_REWARD = 5_000_000;

export const STICKERS: Sticker[] = [
  { id: "tet_lixi", set: "tet", emoji: "🧧", vi: "Lì xì", en: "Lucky money", rarity: "common" },
  { id: "tet_hoadao", set: "tet", emoji: "🌸", vi: "Hoa đào", en: "Peach blossom", rarity: "common" },
  { id: "tet_duahau", set: "tet", emoji: "🍉", vi: "Dưa hấu", en: "Watermelon", rarity: "common" },
  { id: "tet_denlong", set: "tet", emoji: "🏮", vi: "Đèn lồng", en: "Lantern", rarity: "rare" },
  { id: "tet_phaohoa", set: "tet", emoji: "🎆", vi: "Pháo hoa", en: "Fireworks", rarity: "rare" },
  { id: "tet_mualan", set: "tet", emoji: "🦁", vi: "Múa lân", en: "Lion dance", rarity: "epic" },

  { id: "street_pho", set: "street", emoji: "🍜", vi: "Phở", en: "Phở", rarity: "common" },
  { id: "street_banhmi", set: "street", emoji: "🥖", vi: "Bánh mì", en: "Bánh mì", rarity: "common" },
  { id: "street_caphe", set: "street", emoji: "☕", vi: "Cà phê sữa đá", en: "Iced coffee", rarity: "common" },
  { id: "street_xemay", set: "street", emoji: "🛵", vi: "Xe máy", en: "Motorbike", rarity: "rare" },
  { id: "street_nonla", set: "street", emoji: "👒", vi: "Nón lá", en: "Conical hat", rarity: "rare" },
  { id: "street_aodai", set: "street", emoji: "👘", vi: "Áo dài", en: "Áo dài", rarity: "epic" },

  { id: "home_lua", set: "home", emoji: "🌾", vi: "Ruộng lúa", en: "Rice field", rarity: "common" },
  { id: "home_sen", set: "home", emoji: "🪷", vi: "Hoa sen", en: "Lotus", rarity: "common" },
  { id: "home_tre", set: "home", emoji: "🎋", vi: "Cây tre", en: "Bamboo", rarity: "common" },
  { id: "home_trau", set: "home", emoji: "🐃", vi: "Con trâu", en: "Water buffalo", rarity: "rare" },
  { id: "home_thuyen", set: "home", emoji: "🛶", vi: "Thuyền Hạ Long", en: "Hạ Long boat", rarity: "epic" },
  { id: "home_halong", set: "home", emoji: "🏞️", vi: "Vịnh Hạ Long", en: "Hạ Long Bay", rarity: "epic" },

  { id: "legend_cachep", set: "legend", emoji: "🐟", vi: "Cá chép hóa rồng", en: "Koi to dragon", rarity: "rare" },
  { id: "legend_ho", set: "legend", emoji: "🐯", vi: "Hổ", en: "Tiger", rarity: "rare" },
  { id: "legend_rua", set: "legend", emoji: "🐢", vi: "Rùa thần", en: "Golden turtle", rarity: "epic" },
  { id: "legend_phuong", set: "legend", emoji: "🦚", vi: "Phượng hoàng", en: "Phoenix", rarity: "epic" },
  { id: "legend_kylan", set: "legend", emoji: "🦄", vi: "Kỳ lân", en: "Kỳ lân", rarity: "legendary" },
  { id: "legend_rong", set: "legend", emoji: "🐉", vi: "Rồng vàng", en: "Golden dragon", rarity: "legendary" },
];

export const STICKER_BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

/** Draw weights per sticker: a common is about 17x as likely as a legendary */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 100, rare: 35, epic: 12, legendary: 6 };

export const PACK_SIZE = 3;
/** A free pack every this often */
export const FREE_PACK_COOLDOWN_MS = 20 * 60 * 60 * 1000;
/** One pack for every this many games played (any game) */
export const PLAY_PACK_EVERY = 25;
/** Spare (duplicate) stickers swapped for one new pack */
export const TRADE_IN = 5;
/** Stickers a player may gift each day */
export const GIFTS_PER_DAY = 10;

/** Invite a friend: the friend gets a welcome bonus; the inviter is paid once the friend has played a bit */
export const REFERRAL_WELCOME = 50_000;
export const REFERRAL_REWARD = 100_000;
export const REFERRAL_GAMES_NEEDED = 20;
export const REFERRAL_MAX_PAID = 50;

export interface AlbumView {
  owned: Record<string, number>;
  claimedSets: string[];
  packs: { free: boolean; freeAt: string | null; play: number; bonus: number; nextPlayIn: number };
  giftsLeft: number;
}
