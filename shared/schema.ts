import { pgTable, text, serial, integer, bigint, boolean, timestamp, varchar, json, index, jsonb, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // bigint: a few max-bet dragon lines can push a balance past the 2.1B int4 limit
  balance: bigint("balance", { mode: "number" }).default(50000).notNull(),
  tokens: integer("tokens").default(0).notNull(),
  totalWins: integer("total_wins").default(0).notNull(),
  maxWin: bigint("max_win", { mode: "number" }).default(0).notNull(),
  streak: integer("streak").default(0).notNull(),
  maxStreak: integer("max_streak").default(0).notNull(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  lastDailyBonusAt: timestamp("last_daily_bonus_at"),
  // Community
  lastSeenAt: timestamp("last_seen_at"),
  mutedUntil: timestamp("muted_until"),
  banned: boolean("banned").default(false).notNull(),
  // Invite a friend: who sent this player, and whether the inviter has been paid for them
  referredBy: varchar("referred_by"),
  referralPaid: boolean("referral_paid").default(false).notNull(),
  // Sticker packs: when the free daily pack was last opened, and how many play packs were opened
  lastFreePackAt: timestamp("last_free_pack_at"),
  playPacksOpened: integer("play_packs_opened").default(0).notNull(),
  bonusPacks: integer("bonus_packs").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gameStates = pgTable("game_states", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  slotId: text("slot_id").notNull(),
  activeModifier: integer("active_modifier").default(100),
  freeSpins: integer("free_spins").default(0),
  // Free spins are played at the bet that won them, so they can't be cashed in at a bigger bet
  freeSpinBet: integer("free_spin_bet").default(0),
  lastOracleAt: timestamp("last_oracle_at"),
  consecutiveWins: integer("consecutive_wins").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [index("idx_game_states_user").on(t.userId, t.slotId)]);

export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  badgeId: text("badge_id").notNull(),
  badgeName: text("badge_name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
}, (t) => [index("idx_achievements_user").on(t.userId)]);

// Coin credits: promo codes and daily bonuses. Coins are play money only.
export const deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  cardCode: text("card_code"),
  status: text("status").default("completed").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [index("idx_deposits_user").on(t.userId)]);

// Promo codes (table name kept so existing data survives `db:push`)
export const giftCards = pgTable("gift_cards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  denomination: integer("denomination").notNull(),
  isRedeemed: boolean("is_redeemed").default(false).notNull(),
  redeemedBy: varchar("redeemed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  redeemedAt: timestamp("redeemed_at"),
  /** Which batch the code was made in, e.g. "Starter pack" */
  batch: text("batch"),
  /** Admin's note, e.g. who the code was given to */
  note: text("note"),
});

// Legacy table, no longer used by the app. Kept so `db:push` doesn't drop existing rows.
export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").default("pending").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Blackjack hands. A hand in progress (finished = false) holds the shoe and the dealer's
// hole card, so they never reach the browser; at most one per player (partial unique index).
export const blackjackHands = pgTable("blackjack_hands", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  state: jsonb("state").notNull(),
  finished: boolean("finished").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Online pool matches. Stakes are taken when a player sits down and paid to the winner;
// the live game itself is kept in server memory (server/pool.ts).
export const poolMatches = pgTable("pool_matches", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  player1: varchar("player1").notNull(),
  player2: varchar("player2"),
  stake: integer("stake").notNull(),
  status: text("status").notNull(), // waiting | playing | finished | cancelled
  winner: varchar("winner"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});

// Community chat. Text or a sticker; deleted messages stay for the moderation log.
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  text: text("text"),
  sticker: text("sticker"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("chat_messages_created").on(t.createdAt)]);

export const chatReports = pgTable("chat_reports", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  reporterId: varchar("reporter_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("chat_reports_once").on(t.messageId, t.reporterId)]);

// The sticker album: how many of each sticker a player holds
export const userStickers = pgTable("user_stickers", {
  userId: varchar("user_id").notNull(),
  stickerId: text("sticker_id").notNull(),
  count: integer("count").default(0).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.stickerId] })]);

// Album rewards already paid (one per set, plus "album" for the whole book)
export const stickerRewards = pgTable("sticker_rewards", {
  userId: varchar("user_id").notNull(),
  setId: text("set_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.setId] })]);

// Server-managed settings, e.g. the auto-generated session secret
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// The shared progressive jackpot (Hũ Rồng). A single row, id = 1.
export const jackpot = pgTable("jackpot", {
  id: integer("id").primaryKey(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  lastWinner: text("last_winner"),
  lastAmount: bigint("last_amount", { mode: "number" }),
  lastWonAt: timestamp("last_won_at"),
});

// Express session store (connect-pg-simple). Declared here so `db:push` never tries to drop it.
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (t) => [index("IDX_session_expire").on(t.expire)]);

export type User = typeof users.$inferSelect;
export type PublicUser = Omit<User, "password">;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type GameState = typeof gameStates.$inferSelect;
export type InsertGameState = typeof gameStates.$inferInsert;
export type GiftCard = typeof giftCards.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type Deposit = typeof deposits.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;

export const credentialsSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(24, "Username is too long")
    .regex(/^[\p{L}\p{N}_ .-]+$/u, "Username has invalid characters"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});
export type Credentials = z.infer<typeof credentialsSchema>;

// ---- Game definition (shared by server engine and client display) ----

export interface SlotSymbol {
  id: string;
  name: string;
  /**
   * regular: pays when three line up on a payline
   * wild:    stands in for any regular symbol on a line; three wilds pay `pays`
   * scatter: pays by count anywhere on the grid (see SCATTER_PAYS), never on lines
   */
  kind: "regular" | "wild" | "scatter";
  /** Payout for three on a line, as a multiple of the TOTAL bet (0 for the scatter) */
  pays: number;
  weight: number;
}

export const SLOT_SYMBOLS: SlotSymbol[] = [
  { id: "pearl", name: "Dragon Pearl (Wild)", kind: "wild", pays: 120, weight: 2 },
  { id: "dragon", name: "Imperial Dragon", kind: "regular", pays: 30, weight: 4 },
  { id: "drum", name: "Bronze Drum", kind: "regular", pays: 3, weight: 9 },
  { id: "lotus", name: "Golden Lotus", kind: "regular", pays: 1.3, weight: 14 },
  { id: "lantern", name: "Jade Lantern", kind: "regular", pays: 0.7, weight: 22 },
  { id: "koi", name: "Lucky Koi", kind: "regular", pays: 0.4, weight: 28 },
  { id: "coin", name: "Lucky Coin", kind: "regular", pays: 0.4, weight: 28 },
  { id: "envelope", name: "Lucky Red Envelope (Scatter)", kind: "scatter", pays: 0, weight: 6 },
];

export const WILD_ID = "pearl";
export const SCATTER_ID = "envelope";

/** Each payline is [row in col 0, row in col 1, row in col 2] */
export const PAYLINES = [
  [0, 0, 0], [1, 1, 1], [2, 2, 2], // rows
  [0, 1, 2], [2, 1, 0],            // diagonals
  [0, 1, 0], [2, 1, 2],            // V shapes
  [1, 0, 1], [1, 2, 1],            // zigzags
];

/**
 * Red envelopes anywhere on the grid. Highest matching count wins:
 * pays is a multiple of the TOTAL bet; freeSpins are played at the same bet.
 */
export const SCATTER_PAYS = [
  { count: 5, pays: 25, freeSpins: 10 },
  { count: 4, pays: 5, freeSpins: 8 },
  { count: 3, pays: 1, freeSpins: 5 },
];

export const BET_OPTIONS = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];

/**
 * Repeater (Rồng Lặp): after a line win the winning cells lock and every other cell
 * re-spins for free. Each repeat that forms at least one NEW winning line pays those
 * new lines times the next multiplier and goes again; a repeat with no new line ends it.
 */
export const REPEATER_MULTIPLIERS = [2, 3, 5, 8, 12];

/**
 * Hũ Rồng progressive jackpot: every paid spin adds JACKPOT_CONTRIBUTION of its bet to a
 * shared pot. Three Dragon Pearls on the MIDDLE row (on the spin or any repeat) win a
 * share of it that scales with the bet: bet / JACKPOT_FULL_BET of the pot, so the top bet
 * takes the whole pot and every bet wins at least about 100x itself (JACKPOT_SEED / FULL_BET).
 * The pot never drops below JACKPOT_SEED.
 */
export const JACKPOT_LINE = 1;
export const JACKPOT_CONTRIBUTION = 0.01;
export const JACKPOT_FULL_BET = 1_000_000;
export const JACKPOT_SEED = 100_000_000;

/** What a jackpot pays at this bet out of a pot of this size */
export function jackpotShare(pot: number, bet: number) {
  return Math.floor(pot * Math.min(1, bet / JACKPOT_FULL_BET));
}

/**
 * Return to player, measured: the base game including repeaters and free spins returns
 * 95.8% (60M-spin simulation, ±0.1%; the engine tests re-check it), and the 1% jackpot
 * contribution is all paid back to players through the jackpot.
 */
export const BASE_RTP = 0.958;
export const TOTAL_RTP = BASE_RTP + JACKPOT_CONTRIBUTION;

/** Largest win seen in 60M simulated spins, as a multiple of the bet (excluding the jackpot) */
export const MAX_WIN_MULTIPLE = 1900;
/** Oracle blessing multiplies the winnings of the player's next spin */
export const ORACLE_WIN_MULTIPLIER = 2;
export const ORACLE_COOLDOWN_MS = 60 * 60 * 1000;

export const DAILY_BONUS_AMOUNT = 50000;
export const DAILY_BONUS_COOLDOWN_MS = 20 * 60 * 60 * 1000;
export const STARTING_BALANCE = 50000;

/** Public contact address (privacy questions, account deletion help) */
export const CONTACT_EMAIL = "support@vnslot888.online";
