import { pgTable, text, serial, integer, bigint, boolean, timestamp, varchar, json, index, jsonb, primaryKey, uniqueIndex, customType } from "drizzle-orm/pg-core";
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
  /** Daily bonus for the first counted pool win of the day */
  lastPoolBonusAt: timestamp("last_pool_bonus_at"),
  /** Daily bonus for the first practice penalty-shootout win of the day */
  lastFootballBonusAt: timestamp("last_football_bonus_at"),
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
  /** The fortune stick behind the waiting blessing (activeModifier is its multiplier x100) */
  oracleStick: integer("oracle_stick"),
  /** Free-spin units won but not yet taken: the player picks how (Chọn Lì Xì) */
  freeSpinUnits: integer("free_spin_units").default(0).notNull(),
  /** Every free-spin win is multiplied by this (from the player's pick) */
  freeSpinMult: integer("free_spin_mult").default(1).notNull(),
  /** Xóc Đĩa double-up: the win that can still be staked, and how many rounds were played */
  gambleAmount: bigint("gamble_amount", { mode: "number" }).default(0).notNull(),
  gambleRounds: integer("gamble_rounds").default(0).notNull(),
  /** HOLD offered after a losing spin: the grid the player may hold reels from, at this bet */
  holdGrid: jsonb("hold_grid").$type<string[][]>(),
  holdBet: integer("hold_bet"),
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
  /** League: shots played, the season (YYYY-MM, Vietnam time) and whether it counted */
  shots: integer("shots"),
  season: text("season"),
  counted: boolean("counted").default(false).notNull(),
}, (t) => [index("pool_matches_season").on(t.season, t.counted)]);

// Darts. Online matches work like pool's: stakes are taken when a player sits down and the
// winner gets both; the live game itself is kept in server memory (server/darts.ts).
export const dartsMatches = pgTable("darts_matches", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  player1: varchar("player1").notNull(),
  player2: varchar("player2"),
  stake: integer("stake").notNull(),
  legs: integer("legs").notNull().default(1),
  status: text("status").notNull(), // waiting | playing | finished | cancelled
  winner: varchar("winner"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});

// Darts Daily Challenge: 9 darts, one ranked attempt per player per day (Vietnam time).
// Practice attempts aren't stored.
export const dartsDaily = pgTable("darts_daily", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD
  darts: jsonb("darts").$type<{ x: number; y: number; ring: string; n: number; mult: number; score: number }[]>().notNull().default(sql`'[]'::jsonb`),
  score: integer("score").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("darts_daily_user_day").on(t.userId, t.day), index("darts_daily_day").on(t.day, t.score)]);

// A day's Daily Challenge prizes: inserted in the same transaction as the payments, so they're paid once
export const dartsDailyResults = pgTable("darts_daily_results", {
  day: text("day").primaryKey(),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  summary: jsonb("summary").$type<{ username: string; score: number; prize: number }[]>().notNull(),
});

// The once-a-day reward for beating the computer at darts
export const dartsRewards = pgTable("darts_rewards", {
  userId: varchar("user_id").notNull(),
  day: text("day").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

// One row per game played (a spin, a hand, a round, a pool match), for the admin's numbers.
// bet is what the play cost (0 for a free spin), payout what it paid back (stake included).
export const gamePlays = pgTable("game_plays", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  game: text("game").notNull(),
  bet: bigint("bet", { mode: "number" }).notNull(),
  payout: bigint("payout", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("game_plays_created").on(t.createdAt), index("game_plays_user").on(t.userId, t.createdAt)]);

// The days (Vietnam time) each player opened the game, for daily actives and retention
export const userDays = pgTable("user_days", {
  userId: varchar("user_id").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD
}, (t) => [primaryKey({ columns: [t.userId, t.day] }), index("user_days_day").on(t.day)]);

// Lô Tô: each round's 90 numbers in calling order (made when the round is first needed),
// and the tickets bought. A ticket's first full row is worked out when it's bought and
// kept hidden until the calls reach it; it is paid at that moment.
export const lotoRounds = pgTable("loto_rounds", {
  round: integer("round").primaryKey(),
  draws: jsonb("draws").$type<number[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lotoTickets = pgTable("loto_tickets", {
  id: serial("id").primaryKey(),
  round: integer("round").notNull(),
  userId: varchar("user_id").notNull(),
  grid: jsonb("grid").$type<(number | null)[][]>().notNull(),
  price: integer("price").notNull(),
  kinhAt: integer("kinh_at"),
  payout: bigint("payout", { mode: "number" }).notNull(),
  settled: boolean("settled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("loto_tickets_round").on(t.round, t.userId), index("loto_tickets_unsettled").on(t.settled, t.round)]);

// Đua Ngựa: each race's prices and result, drawn when the race is first needed and kept secret
// until the gates open; and the bets, each paid once when its race is over.
export const horseRounds = pgTable("horse_rounds", {
  round: integer("round").primaryKey(),
  /** Win chance of each horse (basis points), by horse index */
  chances: jsonb("chances").$type<number[]>().notNull(),
  /** Legacy: the win price of each horse in tenths (35 = ×3.5), by horse index */
  odds: jsonb("odds").$type<number[]>().notNull(),
  /** The win price of each horse in hundredths (351 = ×3.51), by horse index */
  odds100: jsonb("odds100").$type<number[]>().notNull(),
  winner: integer("winner").notNull(),
  /** Horse indexes, first to last */
  finishOrder: jsonb("finish_order").$type<number[]>().notNull(),
  seed: integer("seed").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const horseBets = pgTable("horse_bets", {
  id: serial("id").primaryKey(),
  round: integer("round").notNull(),
  userId: varchar("user_id").notNull(),
  /** "win" | "top2" | "top3" | "forecast" */
  betType: varchar("bet_type", { length: 10 }).default("win").notNull(),
  horse: integer("horse").notNull(),
  /** Second place, for a forecast */
  horse2: integer("horse2"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  /** Legacy: the price in tenths (rounded down) */
  odds: integer("odds").notNull(),
  /** The price when the bet was placed, in hundredths: this is what is paid */
  odds100: integer("odds100").notNull(),
  payout: bigint("payout", { mode: "number" }),
  settled: boolean("settled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("horse_bets_round").on(t.round, t.userId), index("horse_bets_unsettled").on(t.settled, t.round)]);

// Tiến Lên against three computer players: one game in progress per player
export const tienlenGames = pgTable("tienlen_games", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  stake: integer("stake").notNull(),
  state: jsonb("state").notNull(),
  finished: boolean("finished").default(false).notNull(),
  place: integer("place"),
  payout: bigint("payout", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("tienlen_games_user").on(t.userId, t.finished)]);

// Coins set aside for a live card table round (what each player could lose), so they can't be
// spent elsewhere mid-round. Settled rounds delete their rows; a restart refunds whatever is left.
export const tableEscrows = pgTable("table_escrows", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  code: text("code").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("table_escrows_code").on(t.code)]);

// League seasons already settled (one row each, so prizes can only be paid once)
export const leagueSeasons = pgTable("league_seasons", {
  season: text("season").primaryKey(),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  summary: jsonb("summary").$type<{ username: string; points: number; prize: number }[]>().notNull(),
});

// Penalty shootout (Sút Phạt Đền): online matches with their stakes, like pool_matches.
// kicks is the full record (both choices, the seed and the outcome) once the match is over.
export const footballMatches = pgTable("football_matches", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  player1: varchar("player1").notNull(),
  player2: varchar("player2"),
  stake: integer("stake").notNull(),
  status: text("status").notNull(), // waiting | playing | finished | cancelled
  winner: varchar("winner"),
  reason: text("reason"),
  score: text("score"),
  kicks: jsonb("kicks"),
  /** Ladder: the week (Monday, Vietnam time), whether it counted, and the rating change */
  week: text("week"),
  counted: boolean("counted").default(false).notNull(),
  eloDelta: integer("elo_delta"),
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
}, (t) => [index("football_matches_week").on(t.week, t.counted)]);

// Penalty King weekly ladder: each player's Elo for a week (everyone starts the week at 1000)
export const footballRatings = pgTable("football_ratings", {
  userId: varchar("user_id").notNull(),
  week: text("week").notNull(),
  rating: integer("rating").notNull(),
  played: integer("played").default(0).notNull(),
  won: integer("won").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.week] }), index("football_ratings_week").on(t.week, t.rating)]);

// A paid ladder week: the row is written first, so a week can only ever be paid once
export const footballWeeks = pgTable("football_weeks", {
  week: text("week").primaryKey(),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  summary: jsonb("summary").$type<{ username: string; rating: number; prize: number }[]>().notNull(),
});

// Community chat. Text or a sticker; deleted messages stay for the moderation log.
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  text: text("text"),
  sticker: text("sticker"),
  /** The message this one answers */
  replyTo: integer("reply_to"),
  /** Social 3: the lounge room ("main", "eu", "us", "au", "zh") and an attached photo */
  room: text("room").default("main").notNull(),
  photoId: integer("photo_id"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("chat_messages_created").on(t.createdAt), index("chat_messages_room").on(t.room, t.id)]);

export const chatReports = pgTable("chat_reports", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  reporterId: varchar("reporter_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("chat_reports_once").on(t.messageId, t.reporterId)]);

// ---- Social: profile photos, private messages, blocks and reports ----

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// One profile photo per player (a small square JPEG/PNG/WebP, checked by its bytes).
// users.profile_image_url points at /api/avatar/<key> while a photo is set: the key is random
// and new for every upload, so the URL can be cached forever and never reveals the player's id.
export const userAvatars = pgTable("user_avatars", {
  userId: varchar("user_id").primaryKey(),
  key: text("key").notNull(),
  data: bytea("data").notNull(),
  mime: text("mime").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("user_avatars_key").on(t.key)]);

// Private messages between two players: text or a sticker the sender owns
export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  fromId: varchar("from_id").notNull(),
  toId: varchar("to_id").notNull(),
  text: text("text"),
  sticker: text("sticker"),
  /** The message this one answers (in the same conversation) */
  replyTo: integer("reply_to"),
  /** A game invite / challenge card ({ kind: "invite", game, path }), shown instead of text */
  card: jsonb("card").$type<{ kind: "invite"; game: string; path: string }>(),
  /** A photo sent in the conversation (message_photos.id) */
  photoId: integer("photo_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
  deleted: boolean("deleted").default(false).notNull(),
}, (t) => [
  index("direct_messages_pair").on(t.fromId, t.toId, t.id),
  index("direct_messages_to").on(t.toId, t.readAt),
  index("direct_messages_created").on(t.createdAt),
]);

export const userBlocks = pgTable("user_blocks", {
  blockerId: varchar("blocker_id").notNull(),
  blockedId: varchar("blocked_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index("user_blocks_blocked").on(t.blockedId)]);

// A private message reported by the player who received it (admins can read only these)
export const dmReports = pgTable("dm_reports", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  reporterId: varchar("reporter_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("dm_reports_once").on(t.messageId, t.reporterId)]);

// A profile (photo or name) reported by another player
export const profileReports = pgTable("profile_reports", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  reporterId: varchar("reporter_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("profile_reports_once").on(t.userId, t.reporterId)]);

// ---- Social 2.0: friends, notifications, reactions, the activity feed, friend Lì Xì ----

// One row per pair of friends, the smaller user id first
export const friendships = pgTable("friendships", {
  userA: varchar("user_a").notNull(),
  userB: varchar("user_b").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userA, t.userB] }), index("friendships_b").on(t.userB)]);

export const friendRequests = pgTable("friend_requests", {
  fromId: varchar("from_id").notNull(),
  toId: varchar("to_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.fromId, t.toId] }), index("friend_requests_to").on(t.toId)]);

// The bell: friend requests, mentions, replies, reactions (grouped by `ref`), gifts, friends' big wins
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  kind: text("kind").notNull(),
  actorId: varchar("actor_id"),
  /** Groups notifications that update in place (reactions to one message, one gift) */
  ref: text("ref"),
  data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("notifications_user").on(t.userId, t.id), index("notifications_ref").on(t.userId, t.ref), index("notifications_created").on(t.createdAt), index("notifications_actor").on(t.actorId)]);

// Emoji reactions on public chat ("chat") and private ("dm") messages: one of each emoji per player
export const messageReactions = pgTable("message_reactions", {
  scope: varchar("scope", { length: 4 }).notNull(),
  messageId: integer("message_id").notNull(),
  userId: varchar("user_id").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.scope, t.messageId, t.userId, t.emoji] }), index("message_reactions_user").on(t.userId)]);

// Activity feed: big wins, jackpots, horse winners, new players, level-ups, new friendships.
// `ref` makes each event appear once however many times it's noticed.
export const feedItems = pgTable("feed_items", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  userId: varchar("user_id").notNull(),
  otherId: varchar("other_id"),
  game: text("game"),
  amount: bigint("amount", { mode: "number" }),
  bet: bigint("bet", { mode: "number" }),
  level: integer("level"),
  ref: text("ref").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("feed_items_ref").on(t.ref), index("feed_items_user").on(t.userId), index("feed_items_other").on(t.otherId), index("feed_items_created").on(t.createdAt)]);

// Daily friend Lì Xì: made by the game (never taken from the sender), one per pair per Vietnam day
export const friendGifts = pgTable("friend_gifts", {
  id: serial("id").primaryKey(),
  fromId: varchar("from_id").notNull(),
  toId: varchar("to_id").notNull(),
  day: text("day").notNull(),
  amount: integer("amount").notNull(),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("friend_gifts_once").on(t.fromId, t.toId, t.day), index("friend_gifts_to").on(t.toId, t.day)]);

// A player's social profile and privacy settings, plus their level (XP comes from game_plays)
export const userSocial = pgTable("user_social", {
  userId: varchar("user_id").primaryKey(),
  bio: text("bio"),
  favGame: text("fav_game"),
  showcase: jsonb("showcase").$type<string[]>().default([]).notNull(),
  dmFrom: text("dm_from").default("everyone").notNull(),
  requestsFrom: text("requests_from").default("everyone").notNull(),
  showPresence: boolean("show_presence").default(true).notNull(),
  showInFeed: boolean("show_in_feed").default(true).notNull(),
  // Social 3: a richer profile (all optional) and photo viewing
  country: text("country"),
  hideCountry: boolean("hide_country").default(false).notNull(),
  favGames: jsonb("fav_games").$type<string[]>().default([]).notNull(),
  languages: jsonb("languages").$type<string[]>().default([]).notNull(),
  playStyle: text("play_style"),
  /** Show photos from non-friends without the blur (off by default) */
  showPhotos: boolean("show_photos").default(false).notNull(),
  xp: bigint("xp", { mode: "number" }).default(0).notNull(),
  level: integer("level").default(1).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---- Social 3: clubs, daily quests, Talk, photos, find a match ----

// A club (Hội): one per player, up to 30 members. Starting one costs coins (a sink).
export const clubs = pgTable("clubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tag: text("tag").notNull(),
  emblem: text("emblem").notNull(),
  color: text("color").notNull(),
  description: text("description"),
  /** Anyone can join (true) or the owner/officers approve requests (false) */
  open: boolean("open").default(true).notNull(),
  ownerId: varchar("owner_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("clubs_name_lower").on(sql`lower(${t.name})`)]);

// The primary key on user_id is what makes it one club per player
export const clubMembers = pgTable("club_members", {
  userId: varchar("user_id").primaryKey(),
  clubId: integer("club_id").notNull(),
  role: text("role").notNull(), // owner | officer | member
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (t) => [index("club_members_club").on(t.clubId)]);

export const clubRequests = pgTable("club_requests", {
  clubId: integer("club_id").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.clubId, t.userId] }), index("club_requests_user").on(t.userId)]);

export const clubMessages = pgTable("club_messages", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  text: text("text"),
  sticker: text("sticker"),
  photoId: integer("photo_id"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("club_messages_club").on(t.clubId, t.id), index("club_messages_user").on(t.userId)]);

export const clubChatReports = pgTable("club_chat_reports", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  reporterId: varchar("reporter_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("club_chat_reports_once").on(t.messageId, t.reporterId)]);

// The weekly club reward: one row per finished Vietnam week once it has been paid (restart safe)
export const clubWeeks = pgTable("club_weeks", {
  week: text("week").primaryKey(), // YYYY-MM-DD of the Monday
  winners: jsonb("winners").$type<{ clubId: number; name: string; rank: number; xp: number; paid: number }[]>().default([]).notNull(),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
});
export const clubRewardPayouts = pgTable("club_reward_payouts", {
  week: text("week").notNull(),
  userId: varchar("user_id").notNull(),
  clubId: integer("club_id").notNull(),
  rank: integer("rank").notNull(),
  amount: integer("amount").notNull(),
}, (t) => [primaryKey({ columns: [t.week, t.userId] })]);

// Three quests per player per Vietnam day, drawn the first time they look
export const dailyQuests = pgTable("daily_quests", {
  userId: varchar("user_id").notNull(),
  day: text("day").notNull(),
  slot: integer("slot").notNull(),
  questId: text("quest_id").notNull(),
  notified: boolean("notified").default(false).notNull(),
  claimedAt: timestamp("claimed_at"),
}, (t) => [primaryKey({ columns: [t.userId, t.day, t.slot] })]);

// Social things a player did that quests count; `ref` makes each one count once
export const questEvents = pgTable("quest_events", {
  userId: varchar("user_id").notNull(),
  day: text("day").notNull(),
  kind: text("kind").notNull(),
  ref: text("ref").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.day, t.kind, t.ref] })]);

// The chest for finishing all three of a day's quests (and the 7-day streak bonus paid with it)
export const questChests = pgTable("quest_chests", {
  userId: varchar("user_id").notNull(),
  day: text("day").notNull(),
  amount: integer("amount").notNull(),
  streakBonus: integer("streak_bonus").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

// Photos sent in messages (DMs, club chat, lounge rooms, Talk). Metadata is stripped on upload.
export const messagePhotos = pgTable("message_photos", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  /** Where it was sent: "dm" (ref = the receiver's id), "club" (ref = club id), "lounge", "talk" */
  scope: text("scope").notNull(),
  ref: text("ref"),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  bytes: integer("bytes").notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("message_photos_user").on(t.userId, t.createdAt)]);

// Talk: topic boards (fixed list in shared/social3.ts) with threads and replies
export const talkThreads = pgTable("talk_threads", {
  id: serial("id").primaryKey(),
  board: text("board").notNull(),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  photoId: integer("photo_id"),
  replies: integer("replies").default(0).notNull(),
  thumbs: integer("thumbs").default(0).notNull(),
  lastAt: timestamp("last_at").defaultNow().notNull(),
  hidden: boolean("hidden").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("talk_threads_board").on(t.board, t.lastAt), index("talk_threads_user").on(t.userId)]);

export const talkReplies = pgTable("talk_replies", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  userId: varchar("user_id").notNull(),
  text: text("text"),
  photoId: integer("photo_id"),
  hidden: boolean("hidden").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("talk_replies_thread").on(t.threadId, t.id), index("talk_replies_user").on(t.userId)]);

export const talkThumbs = pgTable("talk_thumbs", {
  threadId: integer("thread_id").notNull(),
  userId: varchar("user_id").notNull(),
}, (t) => [primaryKey({ columns: [t.threadId, t.userId] }), index("talk_thumbs_user").on(t.userId)]);

// "Find a match": a short-lived post saying what you want to play
export const matchPosts = pgTable("match_posts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  game: text("game").notNull(),
  stake: integer("stake").default(0).notNull(),
  note: text("note"),
  expiresAt: timestamp("expires_at").notNull(),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("match_posts_open").on(t.expiresAt), index("match_posts_user").on(t.userId)]);

// Reports on Social 3 things: "photo", "thread", "reply", "club", "match"
export const ugcReports = pgTable("ugc_reports", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  targetId: integer("target_id").notNull(),
  reporterId: varchar("reporter_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("ugc_reports_once").on(t.kind, t.targetId, t.reporterId), index("ugc_reports_reporter").on(t.reporterId)]);

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

// Pool tournaments: free to enter, coin prizes paid by the house, single elimination
export const tournaments = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  size: integer("size").notNull(), // most players allowed (8, 16 or 32)
  prizes: jsonb("prizes").$type<number[]>().notNull(), // [1st, 2nd, each semi-finalist]
  status: text("status").notNull(), // open | live | finished | cancelled
  auto: boolean("auto").default(false).notNull(), // made by the weekly schedule
  rounds: integer("rounds"),
  winnerId: varchar("winner_id"),
  winnerName: text("winner_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
}, (t) => [index("tournaments_status").on(t.status)]);

export const tournamentPlayers = pgTable("tournament_players", {
  tournamentId: integer("tournament_id").notNull(),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  place: integer("place"), // 1, 2, 3 (semi-finalists) once decided
  prize: bigint("prize", { mode: "number" }),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.tournamentId, t.userId] })]);

export const tournamentMatches = pgTable("tournament_matches", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull(),
  round: integer("round").notNull(), // 1 = first round
  slot: integer("slot").notNull(),
  player1: varchar("player1"),
  player2: varchar("player2"),
  name1: text("name1"),
  name2: text("name2"),
  status: text("status").notNull(), // pending | playing | finished
  code: text("code"), // the pool table while it's being played
  winnerId: varchar("winner_id"),
  reason: text("reason"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [uniqueIndex("tournament_matches_slot").on(t.tournamentId, t.round, t.slot)]);

export type Tournament = typeof tournaments.$inferSelect;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;

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
   * regular: pays for 3, 4 or 5 in a row from the leftmost reel on a payline
   * wild:    stands in for any regular symbol on a line; a run of wilds also pays by itself
   * scatter: pays by count anywhere on the screen (see SCATTER_PAYS), never on lines
   */
  kind: "regular" | "wild" | "scatter";
  /** Payout for [3, 4, 5] in a row, as multiples of the TOTAL bet (all zero for the scatter) */
  pays: [number, number, number];
  /** Chance on every reel, out of the total weight */
  weight: number;
}

export const REELS = 5;
export const ROWS = 3;

export const SLOT_SYMBOLS: SlotSymbol[] = [
  { id: "pearl", name: "Dragon Pearl (Wild)", kind: "wild", pays: [8, 40, 400], weight: 4 },
  { id: "dragon", name: "Imperial Dragon", kind: "regular", pays: [3, 12, 80], weight: 30 },
  { id: "drum", name: "Bronze Drum", kind: "regular", pays: [1.5, 5, 20], weight: 36 },
  { id: "lotus", name: "Golden Lotus", kind: "regular", pays: [1.5, 3, 12], weight: 40 },
  { id: "lantern", name: "Jade Lantern", kind: "regular", pays: [1.2, 2.5, 8], weight: 44 },
  { id: "koi", name: "Lucky Koi", kind: "regular", pays: [1, 2, 6], weight: 48 },
  { id: "coin", name: "Lucky Coin", kind: "regular", pays: [1, 2, 6], weight: 48 },
  { id: "envelope", name: "Lucky Red Envelope (Scatter)", kind: "scatter", pays: [0, 0, 0], weight: 6 },
];

export const WILD_ID = "pearl";
export const SCATTER_ID = "envelope";

/** Each payline is the row (0 top, 1 middle, 2 bottom) it uses on reels 1 to 5 */
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
  [1, 0, 1, 2, 1],
];

/** What a run of `count` (3-5) of a symbol pays, as a multiple of the total bet */
export function payOf(id: string, count: number): number {
  const s = SLOT_SYMBOLS.find((x) => x.id === id);
  return s && count >= 3 ? s.pays[Math.min(count, 5) - 3] : 0;
}

/**
 * Red envelopes anywhere on the screen. Highest matching count wins:
 * pays is a multiple of the TOTAL bet; `units` is the free-spin award before the player
 * picks how to take it (see FREE_SPIN_OPTIONS). Free spins are played at the bet that won them.
 */
export const SCATTER_PAYS = [
  { count: 5, pays: 20, units: 32 },
  { count: 4, pays: 4, units: 16 },
  { count: 3, pays: 1, units: 8 },
];

/**
 * Chọn Lì Xì: the player picks how to take a free-spin award of `units`: units/mult spins,
 * every win multiplied by mult. Spins x multiplier is the same for every choice, so every
 * envelope is worth the same on average; they differ only in how swingy they are.
 * "mystery" is one of the others at random.
 */
export const FREE_SPIN_OPTIONS = [
  { id: "steady", mult: 1 },
  { id: "bold", mult: 2 },
  { id: "daring", mult: 4 },
] as const;
export type FreeSpinChoice = (typeof FREE_SPIN_OPTIONS)[number]["id"] | "mystery";

/**
 * GIỮ CUỘN (HOLD), like a pub fruit machine: after a losing paid spin, now and then
 * (1 in HOLD_CHANCE) the player may hold up to HOLD_MAX_REELS reels for their next paid spin:
 * those reels keep their symbols and the rest spin. Holds never follow a win or a held spin.
 * Choosing well matters: the published RTP is for the best holds; ignoring them returns less.
 */
export const HOLD_CHANCE = 5;
export const HOLD_MAX_REELS = 2;

export const BET_OPTIONS = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];

/**
 * Rồng Lặp (Repeater): REPEATER_PEARLS or more Dragon Pearls anywhere wake the dragon.
 * The pearls (sticky wilds) and any winning cells lock and every other cell re-spins for
 * free. Each repeat that forms a new winning line, or makes a paid line longer, pays the new
 * value (the extra, for a longer line) times the next multiplier and goes again; a repeat
 * that adds nothing ends it. Pearls that land during repeats lock too.
 * Two pearls wake a short repeater (REPEATER_SMALL); three or more the full ladder.
 */
export const REPEATER_PEARLS = 2;
export const REPEATER_BIG_PEARLS = 3;
export const REPEATER_SMALL = [1, 1];
export const REPEATER_MULTIPLIERS = [2, 3, 5, 8, 12];
/** The repeater's multipliers for a spin with this many pearls (none below REPEATER_PEARLS) */
export const repeaterLadder = (pearls: number) => (pearls >= REPEATER_BIG_PEARLS ? REPEATER_MULTIPLIERS : pearls >= REPEATER_PEARLS ? REPEATER_SMALL : []);

/**
 * Hũ Rồng progressive jackpot: every paid spin adds JACKPOT_CONTRIBUTION of its bet to a
 * shared pot. Three Dragon Pearls on the MIDDLE row, reels 1-3 (on the spin or any repeat),
 * win a share of it that scales with the bet: bet / JACKPOT_FULL_BET of the pot, so the top
 * bet takes the whole pot and every bet wins at least about 100x itself. The pot never drops
 * below JACKPOT_SEED.
 */
export const JACKPOT_ROW = 1;
export const JACKPOT_CONTRIBUTION = 0.01;
export const JACKPOT_FULL_BET = 1_000_000;
export const JACKPOT_SEED = 100_000_000;

/** What a jackpot pays at this bet out of a pot of this size */
export function jackpotShare(pot: number, bet: number) {
  return Math.floor(pot * Math.min(1, bet / JACKPOT_FULL_BET));
}

/**
 * Return to player, measured over 40M simulated spins (20M each way, ±0.3%): 95.9% for a player
 * who makes the best HOLD choices (87.7% for one who never holds), with Rồng Lặp and free spins
 * included; the engine tests re-check it. The 1% jackpot contribution is all paid back to
 * players through the jackpot.
 * The Xóc Đĩa double-up is exactly fair (100%), so taking it never changes the return.
 */
export const BASE_RTP = 0.959;
/** The same game for a player who never uses HOLD (20M simulated spins, ±0.3%) */
export const RTP_WITHOUT_HOLD = 0.877;
export const TOTAL_RTP = BASE_RTP + JACKPOT_CONTRIBUTION;

/** Largest win seen in simulation, as a multiple of the bet (excluding the jackpot and double-up) */
export const MAX_WIN_MULTIPLE = 4317;
export const ORACLE_COOLDOWN_MS = 60 * 60 * 1000;

export const DAILY_BONUS_AMOUNT = 50000;
export const DAILY_BONUS_COOLDOWN_MS = 20 * 60 * 60 * 1000;
export const STARTING_BALANCE = 100000;

/** Public contact address (privacy questions, account deletion help) */
export const CONTACT_EMAIL = "support@vnslot888.online";

// Meeting people (opt-in): who is open to it, what they're looking for, and 💛 between players
export const datingProfiles = pgTable("dating_profiles", {
  userId: varchar("user_id").primaryKey(),
  open: boolean("open").default(false).notNull(),
  lookingFor: text("looking_for").default("chat").notNull(),
  birthYear: integer("birth_year"),
  gender: text("gender"),
  seeking: text("seeking").array().default(sql`'{}'::text[]`).notNull(),
  ageMin: integer("age_min").default(18).notNull(),
  ageMax: integer("age_max").default(99).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("dating_profiles_open").on(t.open, t.updatedAt)]);

export const datingLikes = pgTable("dating_likes", {
  fromId: varchar("from_id").notNull(),
  toId: varchar("to_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.fromId, t.toId] }), index("dating_likes_to").on(t.toId)]);
