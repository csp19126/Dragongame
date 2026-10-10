/**
 * Bắn Cá (fish shooting). Each bullet that hits a fish costs the cannon's level; the fish is
 * caught with chance BANCA_RTP / its prize, and a catch pays the level times the prize.
 * So every shot returns BANCA_RTP on average whichever fish it hits, and a bullet that
 * hits nothing costs nothing.
 */
export const BANCA_RTP = 0.96;
export const BANCA_LEVELS = [100, 500, 1000, 5000, 10000];
/** Shots a player may fire per second (the server enforces it) */
export const BANCA_MAX_RATE = 8;

export interface FishType {
  id: string;
  vi: string;
  en: string;
  zh: string;
  icon: string;
  mult: number;
  /** Drawing size in pixels (at 400px wide) and speed in pixels a second */
  size: number;
  speed: number;
  /** How often it turns up, relative to the others */
  weight: number;
}

export const FISH: FishType[] = [
  { id: "tep", vi: "Tép", en: "Shrimp", zh: "小蝦", icon: "🦐", mult: 2, size: 26, speed: 70, weight: 30 },
  { id: "ca_nho", vi: "Cá nhỏ", en: "Minnow", zh: "小魚", icon: "🐟", mult: 3, size: 30, speed: 65, weight: 26 },
  { id: "ca_he", vi: "Cá hề", en: "Clownfish", zh: "小丑魚", icon: "🐠", mult: 5, size: 34, speed: 60, weight: 20 },
  { id: "ca_noc", vi: "Cá nóc", en: "Pufferfish", zh: "河豚", icon: "🐡", mult: 8, size: 38, speed: 50, weight: 14 },
  { id: "muc", vi: "Mực", en: "Squid", zh: "魷魚", icon: "🦑", mult: 12, size: 42, speed: 55, weight: 10 },
  { id: "bach_tuoc", vi: "Bạch tuộc", en: "Octopus", zh: "章魚", icon: "🐙", mult: 20, size: 48, speed: 42, weight: 7 },
  { id: "rua", vi: "Rùa biển", en: "Sea turtle", zh: "海龜", icon: "🐢", mult: 30, size: 52, speed: 36, weight: 5 },
  { id: "ca_heo", vi: "Cá heo", en: "Dolphin", zh: "海豚", icon: "🐬", mult: 50, size: 58, speed: 60, weight: 3 },
  { id: "ca_map", vi: "Cá mập", en: "Shark", zh: "鯊魚", icon: "🦈", mult: 100, size: 66, speed: 48, weight: 1.6 },
  { id: "ca_voi", vi: "Cá voi", en: "Whale", zh: "鯨魚", icon: "🐋", mult: 150, size: 76, speed: 30, weight: 0.8 },
  { id: "rong_vang", vi: "Rồng vàng", en: "Golden dragon", zh: "黃金龍", icon: "🐉", mult: 300, size: 86, speed: 34, weight: 0.4 },
];
export const fishById = (id: string) => FISH.find((f) => f.id === id);

/** The chance of catching a fish with one hit */
export const catchChance = (f: FishType) => BANCA_RTP / f.mult;
/** A hit catches when a roll from 0 to 999,999 is below this (it divides exactly for every fish) */
export const catchThreshold = (mult: number) => Math.round((BANCA_RTP * 1_000_000) / mult);

export interface BancaShot { caught: boolean; fish: string; mult: number; payout: number; balance: number }
