import { db } from "./db";
import {
  users, gameStates, achievements, deposits, giftCards, jackpot, appSettings, blackjackHands,
  type User, type GameState, type Achievement, type Deposit, type GiftCard,
  STARTING_BALANCE, DAILY_BONUS_AMOUNT, DAILY_BONUS_COOLDOWN_MS, ORACLE_COOLDOWN_MS, WILD_ID,
  JACKPOT_CONTRIBUTION, JACKPOT_SEED, jackpotShare,
} from "@shared/schema";
import { eq, desc, sql, and, or, isNull, lt, count, sum } from "drizzle-orm";
import { randomInt } from "crypto";
import { spin as runSpin, type SpinOutcome } from "./game";
import * as bj from "./blackjack";

/** Unambiguous characters (no 0/O, 1/I/L) so codes are easy to read out and type */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const codePart = (n: number) => Array.from({ length: n }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
/** A random voucher code like VN888-K7QX-M2PA (about 40 bits of randomness, so it can't be guessed) */
export function newVoucherCode(prefix = "VN888") {
  return `${prefix}-${codePart(4)}-${codePart(4)}`;
}

/** Made once, the first time the server starts with this version, so the admin has codes to hand out */
export const STARTER_PACK = [
  { denomination: 50_000, count: 20 },
  { denomination: 100_000, count: 15 },
  { denomination: 500_000, count: 10 },
  { denomination: 1_000_000, count: 5 },
  { denomination: 5_000_000, count: 3 },
];

export const SLOT_ID = "main";

const ACHIEVEMENTS = {
  first_win: { name: "First Win", description: "Won your first spin!", icon: "star" },
  hot_streak_3: { name: "Hot Streak", description: "3 wins in a row!", icon: "flame" },
  hot_streak_5: { name: "On Fire", description: "5 wins in a row!", icon: "zap" },
  dragon_master: { name: "Dragon Master", description: "Three dragons on a line!", icon: "crown" },
  high_roller: { name: "High Roller", description: "Bet 100,000 or more!", icon: "gem" },
  millionaire: { name: "Millionaire", description: "Balance reached 1,000,000!", icon: "trophy" },
  jackpot_hunter: { name: "Jackpot Hunter", description: "Won 50x your bet in one spin!", icon: "target" },
  lucky_seven: { name: "Lucky Seven", description: "Won 7 times!", icon: "gift" },
  lucky_envelope: { name: "Lucky Envelope", description: "Landed 3 red envelopes!", icon: "mail" },
  pearl_power: { name: "Pearl Power", description: "Won a line with the Dragon Pearl wild!", icon: "sparkles" },
  chain_reaction: { name: "Chain Reaction", description: "3 Repeaters in one spin!", icon: "repeat" },
  no_hu: { name: "Nổ Hũ!", description: "Won the Hũ Rồng jackpot!", icon: "crown" },
} as const;
type BadgeId = keyof typeof ACHIEVEMENTS;

export interface SpinResult extends SpinOutcome {
  /** What the slot itself paid; winAmount adds the jackpot on top */
  gameWin: number;
  jackpotWin: number;
  /** The jackpot after this spin (null only if the jackpot row is missing) */
  jackpotPool: number | null;
  bet: number;
  isFreeSpin: boolean;
  blessed: boolean;
  newBalance: number;
  totalFreeSpins: number;
  streak: number;
  totalWins: number;
  maxWin: number;
  gamesPlayed: number;
  newAchievements: Achievement[];
}

export type SpinError = { error: "insufficient_balance" | "no_user" };

export interface TableStats {
  newBalance: number;
  totalWins: number;
  maxWin: number;
  gamesPlayed: number;
  newAchievements: Achievement[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class DatabaseStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`);
    return user;
  }

  async createUser(data: { username: string; password: string }): Promise<User> {
    const [user] = await db.insert(users).values({
      username: data.username,
      password: data.password,
      balance: STARTING_BALANCE,
    }).returning();
    return user;
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async updateProfile(userId: string, data: { username?: string; firstName?: string; lastName?: string }): Promise<User> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    return user;
  }

  async getGameState(userId: string): Promise<GameState | undefined> {
    const [state] = await db.select().from(gameStates)
      .where(and(eq(gameStates.userId, userId), eq(gameStates.slotId, SLOT_ID)))
      .orderBy(gameStates.id).limit(1);
    return state;
  }

  private async ensureGameState(userId: string): Promise<GameState> {
    const existing = await this.getGameState(userId);
    if (existing) return existing;
    const [created] = await db.insert(gameStates).values({ userId, slotId: SLOT_ID }).returning();
    return created;
  }

  /**
   * One spin, all-or-nothing. The stake is taken (or a free spin consumed) with a
   * conditional UPDATE so two simultaneous requests can never both spend the same
   * balance, and the whole thing runs in a transaction so a crash can't take a
   * stake without paying the win.
   */
  /** `play` is only overridden by tests (to force a specific grid); the game always uses the real RNG. */
  async spin(userId: string, requestedBet: number, play: typeof runSpin = runSpin): Promise<SpinResult | SpinError> {
    const state = await this.ensureGameState(userId);

    return db.transaction(async (tx) => {
      // 0. Lock this player's rows in a fixed order (user, then game state). Concurrent
      //    spins for the same player then queue up instead of deadlocking each other.
      //    The shared jackpot row is always locked last, so this order can't form a cycle.
      const [me] = await tx.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, userId)).for("update");
      await tx.select({ id: gameStates.id }).from(gameStates).where(eq(gameStates.id, state.id)).for("update");

      // 1. Pay for the spin: free spin first, otherwise stake from balance
      let isFreeSpin = false;
      let bet = requestedBet;
      const [usedFree] = await tx.update(gameStates)
        .set({ freeSpins: sql`${gameStates.freeSpins} - 1` })
        .where(and(eq(gameStates.id, state.id), sql`${gameStates.freeSpins} > 0`))
        .returning();
      if (usedFree) {
        isFreeSpin = true;
        bet = usedFree.freeSpinBet || requestedBet;
      } else {
        const [paid] = await tx.update(users)
          .set({ balance: sql`${users.balance} - ${bet}` })
          .where(and(eq(users.id, userId), sql`${users.balance} >= ${bet}`))
          .returning({ id: users.id });
        if (!paid) return { error: "insufficient_balance" } as SpinError;
      }

      // 2. Consume the oracle blessing, if one is waiting
      const [blessing] = await tx.update(gameStates)
        .set({ activeModifier: 100 })
        .where(and(eq(gameStates.id, state.id), sql`${gameStates.activeModifier} > 100`))
        .returning({ id: gameStates.id });
      const blessed = !!blessing;

      // 3. Spin (Repeater included)
      const outcome = play(bet, { blessed });

      // 3b. Jackpot: paid spins feed the pot; middle-row pearls win it
      const contribution = isFreeSpin ? 0 : Math.floor(bet * JACKPOT_CONTRIBUTION);
      let jackpotWin = 0;
      let jackpotPool: number | null = null;
      if (outcome.jackpotHit) {
        const [pot] = await tx.select().from(jackpot).where(eq(jackpot.id, 1)).for("update");
        const amount = (pot?.amount ?? JACKPOT_SEED) + contribution;
        jackpotWin = jackpotShare(amount, bet);
        jackpotPool = Math.max(JACKPOT_SEED, amount - jackpotWin);
        await tx.insert(jackpot)
          .values({ id: 1, amount: jackpotPool, lastWinner: me.username, lastAmount: jackpotWin, lastWonAt: new Date() })
          .onConflictDoUpdate({ target: jackpot.id, set: { amount: jackpotPool, lastWinner: me.username, lastAmount: jackpotWin, lastWonAt: new Date() } });
      }
      const totalWin = outcome.winAmount + jackpotWin;
      // A "win" means the spin actually made a profit; getting your stake back isn't a win
      const won = totalWin > bet;

      // 4. Free spins: awarded spins are locked to the bet that won them
      const [gs] = await tx.update(gameStates).set({
        freeSpins: sql`${gameStates.freeSpins} + ${outcome.freeSpinsAwarded}`,
        ...(outcome.freeSpinsAwarded > 0 ? { freeSpinBet: bet } : {}),
        consecutiveWins: won ? sql`${gameStates.consecutiveWins} + 1` : 0,
        updatedAt: new Date(),
      }).where(eq(gameStates.id, state.id)).returning();

      // 5. Pay out and update stats in one statement
      const [user] = await tx.update(users).set({
        balance: sql`${users.balance} + ${totalWin}`,
        gamesPlayed: sql`${users.gamesPlayed} + 1`,
        totalWins: won ? sql`${users.totalWins} + 1` : users.totalWins,
        streak: won ? sql`${users.streak} + 1` : 0,
        maxStreak: won ? sql`greatest(${users.maxStreak}, ${users.streak} + 1)` : users.maxStreak,
        maxWin: sql`greatest(${users.maxWin}, ${totalWin})`,
      }).where(eq(users.id, userId)).returning();
      if (!user) throw new Error("User vanished mid-spin");

      // 6. Achievements
      const earned: BadgeId[] = [];
      if (won) earned.push("first_win");
      if (user.streak >= 3) earned.push("hot_streak_3");
      if (user.streak >= 5) earned.push("hot_streak_5");
      if (outcome.dragonLine) earned.push("dragon_master");
      if (bet >= 100000 && !isFreeSpin) earned.push("high_roller");
      if (user.balance >= 1_000_000) earned.push("millionaire");
      if (totalWin >= bet * 50) earned.push("jackpot_hunter");
      if (user.totalWins >= 7) earned.push("lucky_seven");
      if (outcome.freeSpinsAwarded > 0) earned.push("lucky_envelope");
      if (outcome.lineWins.some((w) => w.withWild || w.symbol === WILD_ID)) earned.push("pearl_power");
      if (outcome.repeats >= 3) earned.push("chain_reaction");
      if (jackpotWin > 0) earned.push("no_hu");

      const newAchievements = await this.award(tx, userId, earned);

      // 7. Feed the jackpot last: the shared row is locked only for the moment before commit
      if (contribution > 0 && jackpotPool === null) {
        const [pot] = await tx.update(jackpot).set({ amount: sql`${jackpot.amount} + ${contribution}` })
          .where(eq(jackpot.id, 1)).returning({ amount: jackpot.amount });
        jackpotPool = pot?.amount ?? null;
      }

      return {
        ...outcome,
        winAmount: totalWin,
        gameWin: outcome.winAmount,
        jackpotWin,
        jackpotPool,
        bet,
        isFreeSpin,
        blessed,
        newBalance: user.balance,
        totalFreeSpins: gs.freeSpins ?? 0,
        streak: user.streak,
        totalWins: user.totalWins,
        maxWin: user.maxWin,
        gamesPlayed: user.gamesPlayed,
        newAchievements,
      };
    });
  }

  /** Grants the badges in `earned` that the player doesn't have yet */
  private async award(tx: Tx, userId: string, earned: BadgeId[]): Promise<Achievement[]> {
    const newAchievements: Achievement[] = [];
    if (!earned.length) return newAchievements;
    const have = new Set((await tx.select({ b: achievements.badgeId }).from(achievements)
      .where(eq(achievements.userId, userId))).map((r) => r.b));
    for (const id of earned.filter((b) => !have.has(b))) {
      const def = ACHIEVEMENTS[id];
      const [a] = await tx.insert(achievements).values({
        userId, badgeId: id, badgeName: def.name, description: def.description, icon: def.icon,
      }).returning();
      newAchievements.push(a);
    }
    return newAchievements;
  }

  /**
   * One round of a table game (Bầu Cua, roulette): takes the whole stake with a
   * conditional UPDATE, plays, and pays out, all in one transaction.
   */
  async playTable<T extends { totalBet: number; winAmount: number }>(
    userId: string, totalBet: number, play: () => T,
  ): Promise<(T & TableStats) | SpinError> {
    return db.transaction(async (tx) => {
      const [paid] = await tx.update(users)
        .set({ balance: sql`${users.balance} - ${totalBet}` })
        .where(and(eq(users.id, userId), sql`${users.balance} >= ${totalBet}`))
        .returning({ id: users.id });
      if (!paid) return { error: "insufficient_balance" } as SpinError;

      const outcome = play();
      if (outcome.totalBet !== totalBet) throw new Error("Stake mismatch");
      const won = outcome.winAmount > totalBet;

      const [user] = await tx.update(users).set({
        balance: sql`${users.balance} + ${outcome.winAmount}`,
        gamesPlayed: sql`${users.gamesPlayed} + 1`,
        totalWins: won ? sql`${users.totalWins} + 1` : users.totalWins,
        maxWin: sql`greatest(${users.maxWin}, ${outcome.winAmount})`,
      }).where(eq(users.id, userId)).returning();
      if (!user) throw new Error("User vanished mid-round");

      const earned: BadgeId[] = [];
      if (won) earned.push("first_win");
      if (totalBet >= 100000) earned.push("high_roller");
      if (user.balance >= 1_000_000) earned.push("millionaire");
      if (outcome.winAmount >= totalBet * 50) earned.push("jackpot_hunter");
      if (user.totalWins >= 7) earned.push("lucky_seven");

      return {
        ...outcome,
        newBalance: user.balance,
        totalWins: user.totalWins,
        maxWin: user.maxWin,
        gamesPlayed: user.gamesPlayed,
        newAchievements: await this.award(tx, userId, earned),
      };
    });
  }

  // ---- Blackjack ----

  async getActiveBlackjack(userId: string): Promise<bj.BlackjackState | null> {
    const [row] = await db.select().from(blackjackHands)
      .where(and(eq(blackjackHands.userId, userId), eq(blackjackHands.finished, false)));
    return (row?.state as bj.BlackjackState) ?? null;
  }

  /** Pays out a finished hand and updates stats; returns the stats for the response */
  private async settleBlackjack(tx: Tx, userId: string, s: bj.BlackjackState): Promise<TableStats> {
    const won = s.payout > s.totalBet;
    const [user] = await tx.update(users).set({
      balance: sql`${users.balance} + ${s.payout}`,
      gamesPlayed: sql`${users.gamesPlayed} + 1`,
      totalWins: won ? sql`${users.totalWins} + 1` : users.totalWins,
      maxWin: sql`greatest(${users.maxWin}, ${s.payout})`,
    }).where(eq(users.id, userId)).returning();
    const earned: BadgeId[] = [];
    if (won) earned.push("first_win");
    if (s.totalBet >= 100000) earned.push("high_roller");
    if (user.balance >= 1_000_000) earned.push("millionaire");
    if (user.totalWins >= 7) earned.push("lucky_seven");
    return { newBalance: user.balance, totalWins: user.totalWins, maxWin: user.maxWin, gamesPlayed: user.gamesPlayed, newAchievements: await this.award(tx, userId, earned) };
  }

  /** Starts a hand: takes the stake, deals, and settles straight away on a blackjack */
  async blackjackDeal(userId: string, bet: number, shoe: bj.Card[] = bj.newShoe()):
    Promise<{ state: bj.BlackjackState; stats: TableStats | null; balance: number } | { error: "insufficient_balance" | "hand_in_progress" }> {
    return db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const [open] = await tx.select({ id: blackjackHands.id }).from(blackjackHands)
        .where(and(eq(blackjackHands.userId, userId), eq(blackjackHands.finished, false)));
      if (open) return { error: "hand_in_progress" as const };
      const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${bet}` })
        .where(and(eq(users.id, userId), sql`${users.balance} >= ${bet}`)).returning({ balance: users.balance });
      if (!paid) return { error: "insufficient_balance" as const };
      const state = bj.deal(bet, shoe);
      await tx.insert(blackjackHands).values({ userId, state, finished: state.finished });
      const stats = state.finished ? await this.settleBlackjack(tx, userId, state) : null;
      return { state, stats, balance: stats?.newBalance ?? paid.balance };
    });
  }

  /** Hit, stand, double or split on the player's open hand */
  async blackjackAct(userId: string, action: bj.Action):
    Promise<{ state: bj.BlackjackState; stats: TableStats | null; balance: number } | { error: "insufficient_balance" | "no_hand" | "not_allowed" }> {
    return db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const [row] = await tx.select().from(blackjackHands)
        .where(and(eq(blackjackHands.userId, userId), eq(blackjackHands.finished, false))).for("update");
      if (!row) return { error: "no_hand" as const };
      const before = row.state as bj.BlackjackState;
      if (!bj.allowedActions(before).includes(action)) return { error: "not_allowed" as const };
      const extra = bj.extraStake(before, action);
      let balance: number | undefined;
      if (extra > 0) {
        const [paid] = await tx.update(users).set({ balance: sql`${users.balance} - ${extra}` })
          .where(and(eq(users.id, userId), sql`${users.balance} >= ${extra}`)).returning({ balance: users.balance });
        if (!paid) return { error: "insufficient_balance" as const };
        balance = paid.balance;
      }
      const state = bj.act(before, action);
      await tx.update(blackjackHands).set({ state, finished: state.finished, updatedAt: new Date() }).where(eq(blackjackHands.id, row.id));
      const stats = state.finished ? await this.settleBlackjack(tx, userId, state) : null;
      if (balance === undefined && !stats) {
        const [u] = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
        balance = u.balance;
      }
      return { state, stats, balance: stats?.newBalance ?? balance! };
    });
  }

  async getJackpot() {
    const [pot] = await db.select().from(jackpot).where(eq(jackpot.id, 1));
    return pot ?? { id: 1, amount: JACKPOT_SEED, lastWinner: null, lastAmount: null, lastWonAt: null };
  }

  /** Returns the time the oracle can next be used, or null if the blessing was granted now. */
  async consultOracle(userId: string): Promise<{ granted: boolean; nextAvailableAt: Date }> {
    const state = await this.ensureGameState(userId);
    const cutoff = new Date(Date.now() - ORACLE_COOLDOWN_MS);
    const [updated] = await db.update(gameStates)
      .set({ activeModifier: 200, lastOracleAt: new Date() })
      .where(and(eq(gameStates.id, state.id), or(isNull(gameStates.lastOracleAt), lt(gameStates.lastOracleAt, cutoff))))
      .returning();
    const last = updated?.lastOracleAt ?? state.lastOracleAt ?? new Date();
    return { granted: !!updated, nextAvailableAt: new Date(last.getTime() + ORACLE_COOLDOWN_MS) };
  }

  async claimDailyBonus(userId: string): Promise<{ granted: boolean; balance: number; nextAvailableAt: Date }> {
    const cutoff = new Date(Date.now() - DAILY_BONUS_COOLDOWN_MS);
    return db.transaction(async (tx) => {
      const [u] = await tx.update(users).set({
        balance: sql`${users.balance} + ${DAILY_BONUS_AMOUNT}`,
        lastDailyBonusAt: new Date(),
      }).where(and(eq(users.id, userId), or(isNull(users.lastDailyBonusAt), lt(users.lastDailyBonusAt, cutoff))))
        .returning();
      if (u) {
        await tx.insert(deposits).values({ userId, amount: DAILY_BONUS_AMOUNT, method: "daily_bonus" });
        return { granted: true, balance: u.balance, nextAvailableAt: new Date(Date.now() + DAILY_BONUS_COOLDOWN_MS) };
      }
      const [cur] = await tx.select().from(users).where(eq(users.id, userId));
      const last = cur?.lastDailyBonusAt ?? new Date();
      return { granted: false, balance: cur?.balance ?? 0, nextAvailableAt: new Date(last.getTime() + DAILY_BONUS_COOLDOWN_MS) };
    });
  }

  async getLeaderboard(limit = 10): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.balance)).limit(limit);
  }

  async getAchievements(userId: string): Promise<Achievement[]> {
    return db.select().from(achievements).where(eq(achievements.userId, userId));
  }

  async getCredits(userId: string): Promise<Deposit[]> {
    return db.select().from(deposits).where(eq(deposits.userId, userId)).orderBy(desc(deposits.createdAt)).limit(50);
  }

  async redeemPromoCode(code: string, userId: string): Promise<{ amount: number; newBalance: number } | null> {
    return db.transaction(async (tx) => {
      const [claimed] = await tx.update(giftCards)
        .set({ isRedeemed: true, redeemedBy: userId, redeemedAt: new Date() })
        .where(and(eq(giftCards.code, code), eq(giftCards.isRedeemed, false)))
        .returning();
      if (!claimed) return null;
      const [u] = await tx.update(users).set({ balance: sql`${users.balance} + ${claimed.denomination}` })
        .where(eq(users.id, userId)).returning();
      await tx.insert(deposits).values({ userId, amount: claimed.denomination, method: "promo_code", cardCode: code });
      return { amount: claimed.denomination, newBalance: u.balance };
    });
  }

  // ---- Admin ----

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.balance));
  }

  async adminUpdateUser(userId: string, data: Partial<Pick<User, "balance" | "username" | "firstName" | "lastName" | "password">>): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async adminDeleteUser(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(achievements).where(eq(achievements.userId, userId));
      await tx.delete(blackjackHands).where(eq(blackjackHands.userId, userId));
      await tx.delete(gameStates).where(eq(gameStates.userId, userId));
      await tx.delete(deposits).where(eq(deposits.userId, userId));
      await tx.delete(users).where(eq(users.id, userId));
    });
  }

  async getAllPromoCodes(): Promise<(GiftCard & { redeemedByName: string | null })[]> {
    const rows = await db.select({ card: giftCards, redeemedByName: users.username })
      .from(giftCards).leftJoin(users, eq(users.id, giftCards.redeemedBy))
      .orderBy(desc(giftCards.createdAt), giftCards.id);
    return rows.map((r) => ({ ...r.card, redeemedByName: r.redeemedByName }));
  }

  /** Makes `count` new random codes worth `denomination` each */
  async createPromoBatch(count: number, denomination: number, batch: string, prefix = "VN888"): Promise<GiftCard[]> {
    const made: GiftCard[] = [];
    while (made.length < count) {
      const rows = await db.insert(giftCards)
        .values(Array.from({ length: count - made.length }, () => ({ code: newVoucherCode(prefix), denomination, batch })))
        .onConflictDoNothing({ target: giftCards.code })
        .returning();
      made.push(...rows);
    }
    return made;
  }

  async updatePromoNote(id: number, note: string): Promise<GiftCard | undefined> {
    const [card] = await db.update(giftCards).set({ note: note || null }).where(eq(giftCards.id, id)).returning();
    return card;
  }

  /** Creates the starter pack of vouchers once; safe to call on every boot and from several servers */
  async ensureStarterPack(): Promise<number> {
    return db.transaction(async (tx) => {
      const [claimed] = await tx.insert(appSettings).values({ key: "voucher_starter_pack", value: new Date().toISOString() })
        .onConflictDoNothing().returning();
      if (!claimed) return 0;
      let made = 0;
      for (const { denomination, count } of STARTER_PACK) {
        const rows = await tx.insert(giftCards)
          .values(Array.from({ length: count }, () => ({ code: newVoucherCode(), denomination, batch: "Starter pack" })))
          .onConflictDoNothing({ target: giftCards.code }).returning({ id: giftCards.id });
        made += rows.length;
      }
      return made;
    });
  }

  async createPromoCode(code: string, denomination: number, note?: string): Promise<GiftCard> {
    const [card] = await db.insert(giftCards).values({ code, denomination, batch: "Custom", note: note || null }).returning();
    return card;
  }

  async deletePromoCode(id: number): Promise<void> {
    await db.delete(giftCards).where(eq(giftCards.id, id));
  }

  async getAdminStats() {
    const [u] = await db.select({
      totalUsers: count(),
      totalBalance: sum(users.balance),
      totalWins: sum(users.totalWins),
      totalGamesPlayed: sum(users.gamesPlayed),
    }).from(users);
    const [active] = await db.select({ n: count() }).from(giftCards).where(eq(giftCards.isRedeemed, false));
    const [redeemed] = await db.select({ n: count() }).from(giftCards).where(eq(giftCards.isRedeemed, true));
    return {
      totalUsers: u.totalUsers,
      totalBalance: Number(u.totalBalance ?? 0),
      totalWins: Number(u.totalWins ?? 0),
      totalGamesPlayed: Number(u.totalGamesPlayed ?? 0),
      activePromoCodes: active.n,
      redeemedPromoCodes: redeemed.n,
    };
  }

  /** Grants admin to the usernames listed in the ADMIN_USERNAMES env var (comma separated). */
  async syncAdmins(usernames: string[]): Promise<void> {
    for (const name of usernames) {
      const u = await this.getUserByUsername(name);
      if (u && !u.isAdmin) {
        await db.update(users).set({ isAdmin: true }).where(eq(users.id, u.id));
        console.log(`[startup] granted admin to "${u.username}"`);
      } else if (!u) {
        console.warn(`[startup] ADMIN_USERNAMES lists "${name}" but no such user exists yet`);
      }
    }
  }
}

export const storage = new DatabaseStorage();
