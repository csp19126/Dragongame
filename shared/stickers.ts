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
  zh: string;
  rarity: Rarity;
}

export interface StickerSet {
  id: string;
  vi: string;
  en: string;
  zh: string;
  reward: number;
  colors: [string, string];
}

export const STICKER_SETS: StickerSet[] = [
  { id: "tet", vi: "Tết Nguyên Đán", en: "Lunar New Year", zh: "農曆新年", reward: 200_000, colors: ["#e11d48", "#f59e0b"] },
  { id: "street", vi: "Phố Phường", en: "Street Life", zh: "街頭風情", reward: 200_000, colors: ["#0ea5e9", "#22c55e"] },
  { id: "home", vi: "Quê Hương", en: "Homeland", zh: "故鄉風光", reward: 300_000, colors: ["#16a34a", "#84cc16"] },
  { id: "legend", vi: "Huyền Thoại", en: "Legends", zh: "傳說神獸", reward: 1_000_000, colors: ["#7c3aed", "#f59e0b"] },
];

/** Paid once when every sticker in the album has been collected */
export const ALBUM_REWARD = 5_000_000;

export const STICKERS: Sticker[] = [
  { id: "tet_lixi", set: "tet", emoji: "🧧", vi: "Lì xì", en: "Lucky money", zh: "紅包", rarity: "common" },
  { id: "tet_hoadao", set: "tet", emoji: "🌸", vi: "Hoa đào", en: "Peach blossom", zh: "桃花", rarity: "common" },
  { id: "tet_duahau", set: "tet", emoji: "🍉", vi: "Dưa hấu", en: "Watermelon", zh: "西瓜", rarity: "common" },
  { id: "tet_denlong", set: "tet", emoji: "🏮", vi: "Đèn lồng", en: "Lantern", zh: "燈籠", rarity: "rare" },
  { id: "tet_phaohoa", set: "tet", emoji: "🎆", vi: "Pháo hoa", en: "Fireworks", zh: "煙火", rarity: "rare" },
  { id: "tet_mualan", set: "tet", emoji: "🦁", vi: "Múa lân", en: "Lion dance", zh: "舞獅", rarity: "epic" },

  { id: "street_pho", set: "street", emoji: "🍜", vi: "Phở", en: "Phở", zh: "越南河粉", rarity: "common" },
  { id: "street_banhmi", set: "street", emoji: "🥖", vi: "Bánh mì", en: "Bánh mì", zh: "越南麵包", rarity: "common" },
  { id: "street_caphe", set: "street", emoji: "☕", vi: "Cà phê sữa đá", en: "Iced coffee", zh: "越南冰咖啡", rarity: "common" },
  { id: "street_xemay", set: "street", emoji: "🛵", vi: "Xe máy", en: "Motorbike", zh: "機車", rarity: "rare" },
  { id: "street_nonla", set: "street", emoji: "👒", vi: "Nón lá", en: "Conical hat", zh: "斗笠", rarity: "rare" },
  { id: "street_aodai", set: "street", emoji: "👘", vi: "Áo dài", en: "Áo dài", zh: "奧黛", rarity: "epic" },

  { id: "home_lua", set: "home", emoji: "🌾", vi: "Ruộng lúa", en: "Rice field", zh: "稻田", rarity: "common" },
  { id: "home_sen", set: "home", emoji: "🪷", vi: "Hoa sen", en: "Lotus", zh: "蓮花", rarity: "common" },
  { id: "home_tre", set: "home", emoji: "🎋", vi: "Cây tre", en: "Bamboo", zh: "竹子", rarity: "common" },
  { id: "home_trau", set: "home", emoji: "🐃", vi: "Con trâu", en: "Water buffalo", zh: "水牛", rarity: "rare" },
  { id: "home_thuyen", set: "home", emoji: "🛶", vi: "Thuyền Hạ Long", en: "Hạ Long boat", zh: "下龍灣遊船", rarity: "epic" },
  { id: "home_halong", set: "home", emoji: "🏞️", vi: "Vịnh Hạ Long", en: "Hạ Long Bay", zh: "下龍灣", rarity: "epic" },

  { id: "legend_cachep", set: "legend", emoji: "🐟", vi: "Cá chép hóa rồng", en: "Koi to dragon", zh: "鯉躍龍門", rarity: "rare" },
  { id: "legend_ho", set: "legend", emoji: "🐯", vi: "Hổ", en: "Tiger", zh: "老虎", rarity: "rare" },
  { id: "legend_rua", set: "legend", emoji: "🐢", vi: "Rùa thần", en: "Golden turtle", zh: "神龜", rarity: "epic" },
  { id: "legend_phuong", set: "legend", emoji: "🦚", vi: "Phượng hoàng", en: "Phoenix", zh: "鳳凰", rarity: "epic" },
  { id: "legend_kylan", set: "legend", emoji: "🦄", vi: "Kỳ lân", en: "Kỳ lân", zh: "麒麟", rarity: "legendary" },
  { id: "legend_rong", set: "legend", emoji: "🐉", vi: "Rồng vàng", en: "Golden dragon", zh: "金龍", rarity: "legendary" },
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
