/**
 * End-to-end API tests against a real PostgreSQL database.
 * Needs TEST_DATABASE_URL pointing at a throwaway database: it is wiped first.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { STARTING_BALANCE } from "../shared/schema";
import { REFERRAL_WELCOME } from "../shared/stickers";

const TEST_DB = process.env.TEST_DATABASE_URL;
const BET = 1000;

let base = "";
let server: Server;
let pool: import("pg").Pool;
let ctr = 0;

/** Minimal client that keeps the session cookie between requests */
class Player {
  cookie = "";
  constructor(public username = `p${Date.now() % 1e6}_${ctr++}`, public password = "secret123") {}

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  }

  /** Signs up, then sets the balance to TEST_START so the ledger sums below don't depend on the sign-up bonus */
  async register() {
    const r = await this.req("POST", "/api/register", { username: this.username, password: this.password });
    expect(r.status).toBe(200);
    expect(r.body.balance).toBe(STARTING_BALANCE);
    await setBalance(this.username, TEST_START);
    return r.body;
  }
  spin(betAmount = BET) { return this.req("POST", "/api/game/spin", { betAmount }); }
  /** A spin that takes any free spins it wins straight away (steady pick), like a player would */
  async play(betAmount = BET) {
    const r = await this.spin(betAmount);
    if (r.status === 200 && r.body.pendingFreeSpinUnits > 0) {
      const pick = await this.req("POST", "/api/game/free-spins/pick", { choice: "steady" });
      expect(pick.status).toBe(200);
    }
    return r;
  }
  state() { return this.req("GET", "/api/game/state").then((r) => r.body); }
}

const TEST_START = 50000;

async function setBalance(username: string, balance: number) {
  await pool.query("update users set balance = $1 where username = $2", [balance, username]);
}

describe.skipIf(!TEST_DB)("API", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NODE_ENV = "test";
    process.env.TOURNAMENT_GRACE_MS = "2500";
    const pg = await import("pg");
    const wipe = new pg.default.Pool({ connectionString: TEST_DB });
    await wipe.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    await wipe.end();

    const { runMigrations } = await import("../server/migrate");
    const { createApp } = await import("../server/app");
    ({ pool } = await import("../server/db"));
    await runMigrations();
    await runMigrations(); // must be safe to run on every boot
    const { httpServer } = await createApp("test-secret");
    server = httpServer;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await pool?.end();
  });

  describe("accounts", () => {
    it("registers with the sign-up bonus and never exposes the password hash", async () => {
      const p = new Player();
      const user = await p.register();
      expect(user.balance).toBe(STARTING_BALANCE);
      expect(user).not.toHaveProperty("password");
      const me = await p.req("GET", "/api/me");
      expect(me.status).toBe(200);
      expect(me.body.username).toBe(p.username);
      expect(me.body).not.toHaveProperty("password");
    });

    it("rejects bad input and duplicate usernames (case-insensitive)", async () => {
      const p = new Player();
      expect((await p.req("POST", "/api/register", { username: "ab", password: "secret123" })).status).toBe(400);
      expect((await p.req("POST", "/api/register", { username: p.username, password: "123" })).status).toBe(400);
      await p.register();
      const dup = await new Player(p.username.toUpperCase()).req("POST", "/api/register", { username: p.username.toUpperCase(), password: "secret123" });
      expect(dup.status).toBe(409);
    });

    it("logs in, rejects a wrong password, and logs out", async () => {
      const p = new Player();
      await p.register();
      await p.req("POST", "/api/logout");
      expect((await p.req("GET", "/api/me")).status).toBe(401);
      expect((await p.req("POST", "/api/login", { username: p.username, password: "wrong-one" })).status).toBe(401);
      expect((await p.req("POST", "/api/login", { username: p.username, password: p.password })).status).toBe(200);
      expect((await p.req("GET", "/api/me")).status).toBe(200);
    });

    it("changes password only with the current one", async () => {
      const p = new Player();
      await p.register();
      expect((await p.req("POST", "/api/user/password", { currentPassword: "nope", newPassword: "another1" })).status).toBe(400);
      expect((await p.req("POST", "/api/user/password", { currentPassword: p.password, newPassword: "another1" })).status).toBe(200);
      await p.req("POST", "/api/logout");
      expect((await p.req("POST", "/api/login", { username: p.username, password: "another1" })).status).toBe(200);
    });

    it("rate-limits repeated login attempts", async () => {
      const p = new Player();
      let last = 0;
      for (let i = 0; i < 25; i++) {
        last = (await p.req("POST", "/api/login", { username: "nobody", password: "x" }, { "x-test-rate-limit": "1" })).status;
      }
      expect(last).toBe(429);
    });

    it("requires login for game endpoints", async () => {
      const anon = new Player();
      expect((await anon.spin()).status).toBe(401);
      expect((await anon.req("GET", "/api/game/state")).status).toBe(401);
    });
  });

  describe("spinning", () => {
    it("only accepts the published bet sizes", async () => {
      const p = new Player();
      await p.register();
      for (const bad of [-1000, 0, 1, 999, 1234, "1000; drop table users", null]) {
        expect((await p.req("POST", "/api/game/spin", { betAmount: bad })).status).toBe(400);
      }
    });

    it("refuses a bet bigger than the balance", async () => {
      const p = new Player();
      await p.register();
      const r = await p.spin(1_000_000);
      expect(r.status).toBe(400);
      expect((await p.state()).balance).toBe(50000);
    });

    it("keeps an exact ledger over many spins", async () => {
      const p = new Player();
      await p.register();
      let expected = 50000;
      for (let i = 0; i < 40; i++) {
        const r = await p.play(BET);
        expect(r.status).toBe(200);
        if (!r.body.isFreeSpin) expected -= r.body.bet;
        expected += r.body.winAmount;
        expect(r.body.newBalance).toBe(expected);
      }
      const s = await p.state();
      expect(s.balance).toBe(expected);
      expect(s.gamesPlayed).toBe(40);
    });

    it("refuses every spin from an empty balance, even 20 at once", async () => {
      const p = new Player();
      await p.register();
      await setBalance(p.username, 0);
      const results = await Promise.all(Array.from({ length: 20 }, () => p.spin(BET)));
      expect(results.map((r) => r.status)).toEqual(Array(20).fill(400));
      const s = await p.state();
      expect(s.balance).toBe(0);
      expect(s.gamesPlayed).toBe(0);
    });

    it("handles 20 simultaneous spins mixing free and paid spins without deadlocks or double-spends", async () => {
      const p = new Player();
      const user = await p.register();
      await setBalance(p.username, 3 * BET);
      // Free spins waiting is exactly the case that used to deadlock
      await pool.query(
        "insert into game_states (user_id, slot_id, free_spins, free_spin_bet) values ($1, 'main', 5, $2)",
        [user.id, BET],
      );
      const results = await Promise.all(Array.from({ length: 20 }, () => p.spin(BET)));
      results.forEach((r) => expect([200, 400, 409]).toContain(r.status)); // 409: free spins won, waiting for the pick
      const ok = results.filter((r) => r.status === 200).map((r) => r.body);
      // Spins are serialised per player, so each stake must have come out of a non-negative balance
      ok.forEach((r) => expect(r.newBalance - r.winAmount).toBeGreaterThanOrEqual(0));
      expect(ok.filter((r) => r.isFreeSpin).length).toBeGreaterThanOrEqual(5);
      const paid = ok.filter((r) => !r.isFreeSpin).reduce((a, r) => a + r.bet, 0);
      const won = ok.reduce((a, r) => a + r.winAmount, 0);
      const s = await p.state();
      expect(s.balance).toBe(3 * BET - paid + won);
      expect(s.gamesPlayed).toBe(ok.length);
    });

    it("plays free spins at the bet that won them, without charging", async () => {
      const p = new Player();
      const user = await p.register();
      await pool.query(
        "insert into game_states (user_id, slot_id, free_spins, free_spin_bet) values ($1, 'main', 2, $2)",
        [user.id, 5000],
      );
      const r = await p.spin(BET); // asks for 1K, must play the locked 5K
      expect(r.status).toBe(200);
      expect(r.body.isFreeSpin).toBe(true);
      expect(r.body.bet).toBe(5000);
      expect(r.body.newBalance).toBe(50000 + r.body.winAmount);
    });

    it("counts only profitable spins as wins", async () => {
      const p = new Player();
      await p.register();
      let wins = 0;
      for (let i = 0; i < 30; i++) {
        const r = (await p.play(BET)).body;
        if (r.winAmount > r.bet) wins++;
        expect(r.totalWins).toBe(wins);
      }
    });
  });

  describe("oracle, bonuses and promo codes", () => {
    it("oracle blesses one spin per hour", async () => {
      const p = new Player();
      await p.register();
      const { STICKS, GRADE_BLESSING } = await import("../shared/oracle");
      const drawn = (await p.req("POST", "/api/game/oracle")).body;
      expect(drawn.granted).toBe(true);
      const stick = STICKS.find((x) => x.n === drawn.stick)!;
      expect(drawn.blessing).toBe(GRADE_BLESSING[stick.grade]);
      expect((await p.req("POST", "/api/game/oracle")).body.granted).toBe(false);
      const st = await p.state();
      expect(st).toMatchObject({ blessed: true, blessing: drawn.blessing, oracleStick: drawn.stick });
      const r = (await p.spin(BET)).body;
      expect(r.blessed).toBe(true);
      expect(r.blessing).toBe(drawn.blessing);
      expect((await p.state()).blessed).toBe(false);
      expect((await p.spin(BET)).body.blessed).toBe(false);
    });

    it("daily bonus pays once, even when claimed in parallel", async () => {
      const p = new Player();
      await p.register();
      const results = await Promise.all(Array.from({ length: 5 }, () => p.req("POST", "/api/bonus/daily")));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect((await p.state()).balance).toBe(100000);
    });

    it("a promo code works once, for one player", async () => {
      await pool.query("insert into gift_cards (code, denomination) values ('TEST-CODE-1', 7000)");
      const a = new Player(); const b = new Player();
      await a.register(); await b.register();
      const [ra, rb] = await Promise.all([
        a.req("POST", "/api/promo/redeem", { code: "test-code-1" }),
        b.req("POST", "/api/promo/redeem", { code: "TEST-CODE-1" }),
      ]);
      expect([ra.status, rb.status].sort()).toEqual([200, 400]);
      const total = (await a.state()).balance + (await b.state()).balance;
      expect(total).toBe(100000 + 7000);
    });
  });

  describe("Hũ Rồng jackpot", () => {
    const pot = async () => (await new Player().req("GET", "/api/game/jackpot")).body.amount as number;

    it("starts at the seed and every paid spin feeds it 1% of the bet", async () => {
      const p = new Player();
      await p.register();
      await pool.query("update jackpot set amount = 100000000 where id = 1");
      const before = await pot();
      expect(before).toBe(100_000_000);
      const r = await p.spin(5000);
      expect(r.status).toBe(200);
      expect(r.body.jackpotPool).toBe(before + 50);
      expect(await pot()).toBe(before + 50);
    });

    it("free spins do not feed it", async () => {
      const p = new Player();
      const user = await p.register();
      await pool.query("insert into game_states (user_id, slot_id, free_spins, free_spin_bet) values ($1, 'main', 1, 1000)", [user.id]);
      const before = await pot();
      const r = await p.spin(1000);
      expect(r.body.isFreeSpin).toBe(true);
      expect(await pot()).toBe(before);
    });

    it("middle-row pearls win it: a share that grows with the bet, and the pot never drops under the seed", async () => {
      const { storage } = await import("../server/storage");
      const { spin } = await import("../server/game");
      const p = new Player();
      const user = await p.register();
      await pool.query("update jackpot set amount = 300000000 where id = 1");
      // grid[reel][row]: pearls on the middle row of reels 1-3; re-spins draw envelopes, which never pay
      const pearls = [["lotus", "pearl", "dragon"], ["drum", "pearl", "lotus"], ["dragon", "pearl", "drum"], ["koi", "lantern", "coin"], ["coin", "koi", "lantern"]];
      const noWins = () => () => 104;
      const r = await storage.spin(user.id, 10000, (bet, o) => spin(bet, { ...o, startGrid: pearls, rng: noWins() }));
      if ("error" in r) throw new Error(r.error);
      expect(r.jackpotHit).toBe(true);
      // 10K is 1% of the full-pot bet, so it wins 1% of the pot (after its own 1% contribution)
      expect(r.jackpotWin).toBe(Math.floor((300_000_000 + 100) * 0.01));
      expect(r.winAmount).toBe(r.gameWin + r.jackpotWin);
      expect(r.newBalance).toBe(50000 - 10000 + r.winAmount);
      expect(r.jackpotPool).toBe(300_000_100 - r.jackpotWin);
      const after = (await new Player().req("GET", "/api/game/jackpot")).body;
      expect(after.amount).toBe(r.jackpotPool);
      expect(after.lastAmount).toBe(r.jackpotWin);
      expect(after.lastWinner).toMatch(/\*\*/); // masked username
      expect(r.newAchievements.map((a) => a.badgeId)).toContain("no_hu");

      // Ten times the bet wins ten times as much
      const potNow = after.amount as number;
      await setBalance(p.username, 10_000_000);
      const mid = await storage.spin(user.id, 100000, (bet, o) => spin(bet, { ...o, startGrid: pearls, rng: noWins() }));
      if ("error" in mid) throw new Error(mid.error);
      expect(mid.jackpotWin).toBe(Math.floor((potNow + 1000) * 0.1));
      expect(mid.gameWin).toBe(10 * r.gameWin);

      // The top bet takes the whole pot, which refills to the seed
      const big = await storage.spin(user.id, 1_000_000, (bet, o) => spin(bet, { ...o, startGrid: pearls, rng: noWins() }));
      if ("error" in big) throw new Error(big.error);
      expect(big.jackpotWin).toBe(mid.jackpotPool! + 10_000);
      expect(big.jackpotPool).toBe(100_000_000);
    });
  });

  describe("online pool", () => {
    async function connect(p: Player, code: string) {
      const { WebSocket } = await import("ws");
      const ws = new WebSocket(base.replace("http", "ws") + `/ws/pool?code=${code}`, { headers: { Cookie: p.cookie } });
      const msgs: any[] = [];
      ws.on("message", (m) => msgs.push(JSON.parse(String(m))));
      await new Promise<void>((resolve, reject) => { ws.on("open", () => resolve()); ws.on("error", reject); });
      /** Waits for the next message matching `pred` */
      const next = async (pred: (m: any) => boolean, ms = 4000) => {
        const start = Date.now();
        while (Date.now() - start < ms) {
          const i = msgs.findIndex(pred);
          if (i >= 0) return msgs.splice(0, i + 1)[i];
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error("timed out waiting for a message");
      };
      return { ws, msgs, next };
    }

    it("two players stake, break, play and the winner takes the pot", async () => {
      const { playShot } = await import("../shared/pool/engine");
      const a = new Player(), b = new Player(), watcher = new Player();
      await a.register(); await b.register(); await watcher.register();
      const made = await a.req("POST", "/api/pool/tables", { stake: 10000 });
      expect(made.status).toBe(200);
      const code = made.body.code;
      expect((await a.state()).balance).toBe(40000);
      expect((await b.req("GET", "/api/pool/tables")).body.open.map((t: any) => t.code)).toContain(code);
      expect((await a.req("POST", "/api/pool/tables", { stake: 0 })).status).toBe(409); // one table at a time

      const ca = await connect(a, code);
      expect((await ca.next((m) => m.t === "state")).status).toBe("waiting");
      expect((await b.req("POST", `/api/pool/tables/${code}/join`)).status).toBe(200);
      expect((await b.state()).balance).toBe(40000);
      const cb = await connect(b, code);
      const cw = await connect(watcher, code);
      const sb = await cb.next((m) => m.t === "state" && m.status === "playing");
      expect(sb.seat).toBe(1);
      expect((await cw.next((m) => m.t === "state")).seat).toBeNull();

      // The breaker shoots; everyone sees the same shot; a local replay lands exactly where the server says
      const game = sb.game;
      const shooter = game.turn === 0 ? ca : cb;
      const other = game.turn === 0 ? cb : ca;
      cw.ws.send(JSON.stringify({ t: "shoot", shot: { dx: 1, dy: 0, power: 1, spin: 0 }, cue: { x: 50, y: 63.5 } })); // ignored: a spectator
      shooter.ws.send(JSON.stringify({ t: "shoot", shot: { dx: 1, dy: 0.01, power: 1, spin: 0 }, cue: { x: 50, y: 63.5 } }));
      const seenByOther = await other.next((m) => m.t === "shot");
      const seenByShooter = await shooter.next((m) => m.t === "shot");
      expect(seenByOther).toEqual(seenByShooter);
      const replay = playShot(game, seenByOther.shot, { x: 50, y: 63.5 }, false).state;
      expect(replay.balls).toEqual(seenByOther.state.balls);
      expect(seenByOther.by).toBe(game.turn);

      // Emotes reach the other player
      other.ws.send(JSON.stringify({ t: "emote", e: "🔥" }));
      expect((await shooter.next((m) => m.t === "emote")).e).toBe("🔥");

      // Player A resigns: B wins both stakes
      ca.ws.send(JSON.stringify({ t: "resign" }));
      const end = await cb.next((m) => m.t === "state" && m.status === "finished");
      expect(end.result).toMatchObject({ winner: 1, reason: "resign", payout: 20000 });
      expect((await a.state()).balance).toBe(40000);
      expect((await b.state()).balance).toBe(60000);
      const row = (await pool.query("select status, winner from pool_matches where code = $1", [code])).rows[0];
      expect(row.status).toBe("finished");
      for (const c of [ca, cb, cw]) c.ws.close();
    });

    it("refunds a cancelled table, refuses a join you can't afford, and refunds after a restart", async () => {
      const a = new Player(), b = new Player();
      await a.register(); await b.register();
      const t1 = (await a.req("POST", "/api/pool/tables", { stake: 50000 })).body.code;
      expect((await a.state()).balance).toBe(0);
      await setBalance(b.username, 1000);
      const j = await b.req("POST", `/api/pool/tables/${t1}/join`);
      expect(j.status).toBe(400);
      expect((await b.state()).balance).toBe(1000);
      expect((await b.req("GET", "/api/pool/tables")).body.open.map((t: any) => t.code)).toContain(t1); // seat freed again
      expect((await a.req("POST", `/api/pool/tables/${t1}/cancel`)).status).toBe(200);
      expect((await a.state()).balance).toBe(50000);
      expect((await a.req("POST", "/api/pool/tables", { stake: 777 })).status).toBe(400);

      // A table left open when the server restarts gets its stake back
      const t2 = (await a.req("POST", "/api/pool/tables", { stake: 10000 })).body.code;
      expect((await a.state()).balance).toBe(40000);
      const { recoverPoolMatches } = await import("../server/pool");
      await recoverPoolMatches();
      expect((await a.state()).balance).toBe(50000);
      expect((await pool.query("select status from pool_matches where code = $1", [t2])).rows[0].status).toBe("cancelled");
    });
  });

  describe("blackjack", () => {
    const shoe = (...cards: string[]) => [...cards, ...Array(30).fill("2C")].reverse();

    it("keeps an exact ledger through deal, double and settle, and hides the hole card", async () => {
      const { storage } = await import("../server/storage");
      const p = new Player();
      const user = await p.register();
      // player 6+5, dealer 6 + hidden 10; double draws a K (21); dealer 16 draws a 9 (25, bust)
      const dealt = await storage.blackjackDeal(user.id, 10000, shoe("6S", "6H", "5D", "10C", "KD", "9S"));
      if ("error" in dealt) throw new Error(dealt.error);
      expect(dealt.balance).toBe(40000);

      const open = await p.req("GET", "/api/games/blackjack");
      expect(open.body.hand.dealer.cards).toEqual(["6H", null]);
      expect(JSON.stringify(open.body)).not.toContain("10C");
      expect(open.body.hand.actions).toEqual(["hit", "stand", "double"]);
      expect((await p.req("POST", "/api/games/blackjack/deal", { bet: 1000 })).status).toBe(409);

      const r = await p.req("POST", "/api/games/blackjack/action", { action: "double" });
      expect(r.status).toBe(200);
      expect(r.body.hand.finished).toBe(true);
      expect(r.body.hand.hands[0].outcome).toBe("win");
      expect(r.body.hand.totalBet).toBe(20000);
      expect(r.body.hand.payout).toBe(40000);
      expect(r.body.newBalance).toBe(50000 - 20000 + 40000);
      expect((await p.state()).balance).toBe(70000);
      expect((await p.req("GET", "/api/games/blackjack")).body.hand).toBeNull();
      expect((await p.req("POST", "/api/games/blackjack/action", { action: "hit" })).status).toBe(404);
    });

    it("plays real hands over HTTP with an exact ledger", async () => {
      const p = new Player();
      await p.register();
      for (let i = 0; i < 12; i++) {
        const before = (await p.state()).balance;
        let r = await p.req("POST", "/api/games/blackjack/deal", { bet: 2000 });
        expect(r.status).toBe(200);
        while (!r.body.hand.finished) r = await p.req("POST", "/api/games/blackjack/action", { action: r.body.hand.hands[r.body.hand.active].total < 17 ? "hit" : "stand" });
        expect(r.body.newBalance).toBe(before - r.body.hand.totalBet + r.body.hand.payout);
        expect((await p.state()).balance).toBe(r.body.newBalance);
      }
    });

    it("refuses bad bets, unaffordable doubles and unknown actions", async () => {
      const { storage } = await import("../server/storage");
      const p = new Player();
      const user = await p.register();
      expect((await p.req("POST", "/api/games/blackjack/deal", { bet: 1500 })).status).toBe(400);
      expect((await p.req("POST", "/api/games/blackjack/deal", { bet: 2_000_000 })).status).toBe(400);
      await setBalance(p.username, 10000);
      const dealt = await storage.blackjackDeal(user.id, 10000, shoe("6S", "6H", "5D", "10C"));
      if ("error" in dealt) throw new Error(dealt.error);
      const dbl = await p.req("POST", "/api/games/blackjack/action", { action: "double" });
      expect(dbl.status).toBe(400);
      expect(dbl.body.code).toBe("insufficient_balance");
      expect((await p.req("POST", "/api/games/blackjack/action", { action: "surrender" })).status).toBe(400);
      expect((await p.req("POST", "/api/games/blackjack/action", { action: "stand" })).status).toBe(200);
    });
  });

  describe("voucher codes", () => {
    it("makes the starter pack exactly once, with unguessable codes", async () => {
      const { storage, STARTER_PACK } = await import("../server/storage");
      const expected = STARTER_PACK.reduce((a, b) => a + b.count, 0);
      const [first, second] = await Promise.all([storage.ensureStarterPack(), storage.ensureStarterPack()]);
      expect(first + second).toBe(expected);
      expect(await storage.ensureStarterPack()).toBe(0);
      const rows = (await pool.query("select code, denomination from gift_cards where batch = 'Starter pack'")).rows;
      expect(rows).toHaveLength(expected);
      for (const r of rows) expect(r.code).toMatch(/^VN888-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
      expect(new Set(rows.map((r) => r.code)).size).toBe(expected);
    });

    it("admins make batches, add notes, and see who redeemed a code", async () => {
      const admin = new Player();
      const a = await admin.register();
      await pool.query("update users set is_admin = true where id = $1", [a.id]);
      const batch = await admin.req("POST", "/api/admin/dashboard/gift-cards/batch", { count: 5, denomination: 250000, batch: "Test batch" });
      expect(batch.status).toBe(200);
      expect(batch.body).toHaveLength(5);
      expect(batch.body[0].batch).toBe("Test batch");
      expect((await admin.req("POST", "/api/admin/dashboard/gift-cards/batch", { count: 500, denomination: 1000 })).status).toBe(400);

      const card = batch.body[0];
      const noted = await admin.req("PATCH", `/api/admin/dashboard/gift-cards/${card.id}`, { note: "For Minh" });
      expect(noted.body.note).toBe("For Minh");

      const p = new Player();
      await p.register();
      const r = await p.req("POST", "/api/promo/redeem", { code: card.code.toLowerCase() });
      expect(r.status).toBe(200);
      expect(r.body.amount).toBe(250000);
      expect((await p.req("POST", "/api/promo/redeem", { code: card.code })).status).toBe(400);

      const list = (await admin.req("GET", "/api/admin/dashboard/gift-cards")).body;
      const used = list.find((c: any) => c.id === card.id);
      expect(used).toMatchObject({ isRedeemed: true, redeemedByName: p.username, note: "For Minh" });
      expect((await p.req("POST", "/api/admin/dashboard/gift-cards/batch", { count: 1, denomination: 1000 })).status).toBe(403);
    });
  });

  describe("account deletion and Android app", () => {
    it("a player can delete their own account, but only with the right password", async () => {
      const p = new Player();
      const user = await p.register();
      await p.spin();
      expect((await p.req("POST", "/api/user/delete", { password: "wrong-one" })).status).toBe(400);
      expect((await p.req("GET", "/api/me")).status).toBe(200);
      const r = await p.req("POST", "/api/user/delete", { password: p.password });
      expect(r.status).toBe(200);
      expect((await p.req("GET", "/api/me")).status).toBe(401);
      const left = await pool.query("select (select count(*) from users where id = $1) u, (select count(*) from game_states where user_id = $1) g", [user.id]);
      expect(Number(left.rows[0].u) + Number(left.rows[0].g)).toBe(0);
      const again = await new Player(p.username, p.password).req("POST", "/api/login", { username: p.username, password: p.password });
      expect(again.status).toBe(401);
    });

    it("serves Digital Asset Links from the environment", async () => {
      const empty = await new Player().req("GET", "/.well-known/assetlinks.json");
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual([]);
      process.env.ANDROID_CERT_SHA256 = "aa:bb, CC:DD";
      try {
        const r = await new Player().req("GET", "/.well-known/assetlinks.json");
        expect(r.body[0].target).toEqual({ namespace: "android_app", package_name: "online.vnslot888.twa", sha256_cert_fingerprints: ["AA:BB", "CC:DD"] });
        expect(r.body[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
      } finally {
        delete process.env.ANDROID_CERT_SHA256;
      }
    });
  });

  describe("table games", () => {
    it("Bầu Cua takes the whole stake and pays exactly what the dice say", async () => {
      const p = new Player();
      await p.register();
      for (let i = 0; i < 15; i++) {
        const before = (await p.state()).balance;
        const r = await p.req("POST", "/api/games/baucua", { bets: { cua: 1000, ga: 2000 } });
        expect(r.status).toBe(200);
        expect(r.body.dice).toHaveLength(3);
        const hits = (s: string) => r.body.dice.filter((d: string) => d === s).length;
        const expected = (hits("cua") ? 1000 * (1 + hits("cua")) : 0) + (hits("ga") ? 2000 * (1 + hits("ga")) : 0);
        expect(r.body.winAmount).toBe(expected);
        expect(r.body.newBalance).toBe(before - 3000 + expected);
        expect((await p.state()).balance).toBe(r.body.newBalance);
      }
    });

    it("roulette settles on the server and keeps an exact ledger", async () => {
      const p = new Player();
      await p.register();
      for (let i = 0; i < 15; i++) {
        const before = (await p.state()).balance;
        const r = await p.req("POST", "/api/games/roulette", { bets: [{ type: "red", amount: 1000 }, { type: "straight", value: 7, amount: 1000 }] });
        expect(r.status).toBe(200);
        const n = r.body.number;
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(36);
        const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
        const expected = (red ? 2000 : 0) + (n === 7 ? 36000 : 0);
        expect(r.body.winAmount).toBe(expected);
        expect(r.body.newBalance).toBe(before - 2000 + expected);
      }
    });

    it("refuses bets it can't cover, bad bets, and logged-out players", async () => {
      const p = new Player();
      await p.register();
      await setBalance(p.username, 5000);
      const big = await p.req("POST", "/api/games/baucua", { bets: { tom: 10000 } });
      expect(big.status).toBe(400);
      expect(big.body.code).toBe("insufficient_balance");
      expect((await p.state()).balance).toBe(5000);
      expect((await p.req("POST", "/api/games/roulette", { bets: [{ type: "straight", value: 40, amount: 1000 }] })).status).toBe(400);
      expect((await p.req("POST", "/api/games/baucua", { bets: { cua: 1234 } })).status).toBe(400);
      expect((await new Player().req("POST", "/api/games/roulette", { bets: [{ type: "red", amount: 1000 }] })).status).toBe(401);
    });

    it("two rounds at once can't spend the same coins", async () => {
      const p = new Player();
      await p.register();
      await setBalance(p.username, 10000);
      const rs = await Promise.all(Array.from({ length: 5 }, () =>
        p.req("POST", "/api/games/roulette", { bets: [{ type: "even", amount: 10000 }] })));
      // Rounds queue up on the balance, so none can spend coins that are not there
      const ok = rs.filter((r) => r.status === 200);
      expect(ok.length).toBeGreaterThanOrEqual(1);
      const final = (await p.state()).balance;
      const net = ok.reduce((a, r) => a + r.body.winAmount - 10000, 0);
      expect(final).toBe(10000 + net);
      expect(final).toBeGreaterThanOrEqual(0);
    });
  });

  describe("admin and public data", () => {
    it("admin endpoints are closed to normal players and open to admins", async () => {
      const p = new Player();
      const user = await p.register();
      expect((await p.req("GET", "/api/admin/dashboard/users")).status).toBe(403);
      await pool.query("update users set is_admin = true where id = $1", [user.id]);
      const list = await p.req("GET", "/api/admin/dashboard/users");
      expect(list.status).toBe(200);
      expect(list.body.length).toBeGreaterThan(0);
      list.body.forEach((u: any) => expect(u).not.toHaveProperty("password"));
      const created = await p.req("POST", "/api/admin/dashboard/gift-cards", { code: "admin-made", denomination: 1000 });
      expect(created.status).toBe(200);
      expect(created.body.code).toBe("ADMIN-MADE");
      expect((await p.req("DELETE", `/api/admin/dashboard/users/${user.id}`)).status).toBe(400); // can't delete yourself
    });

    it("leaderboard shows public fields only", async () => {
      const r = await new Player().req("GET", "/api/game/leaderboard");
      expect(r.status).toBe(200);
      expect(r.body.length).toBeGreaterThan(0);
      for (const e of r.body) expect(Object.keys(e).sort()).toEqual(["balance", "maxStreak", "maxWin", "rank", "totalWins", "username"]);
    });

    it("health check reports the database and unknown API routes return JSON 404", async () => {
      const anon = new Player();
      expect((await anon.req("GET", "/api/health")).body).toEqual({ status: "ok" });
      const r = await anon.req("GET", "/api/does-not-exist");
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ message: "Not found" });
    });
  });
  describe("community", () => {
    const games = (username: string, n: number) => pool.query("update users set games_played = $1 where username = $2", [n, username]);

    it("chat: needs a few games, filters money talk and links, masks swearing, rate limits, reports hide", async () => {
      const a = new Player(), b = new Player(), c = new Player(), d = new Player();
      for (const p of [a, b, c, d]) await p.register();
      expect((await a.req("POST", "/api/chat", { text: "xin chào" })).body.message).toBe("play_first");
      for (const p of [a, b, c, d]) await games(p.username, 5);
      const hi = await a.req("POST", "/api/chat", { text: "  xin   chào các bạn  " });
      expect(hi.status).toBe(200);
      expect(hi.body.text).toBe("xin chào các bạn");
      expect((await b.req("POST", "/api/chat", { text: "bán xu giá rẻ, ib zalo" })).body.message).toBe("trade");
      expect((await b.req("POST", "/api/chat", { text: "vào vnslot888.online" })).body.message).toBe("link");
      expect((await b.req("POST", "/api/chat", { text: "gọi 0912 345 678" })).body.message).toBe("phone");
      expect((await b.req("POST", "/api/chat", { text: "x".repeat(201) })).body.message).toBe("long");
      const sw = await b.req("POST", "/api/chat", { text: "đm thua rồi" });
      expect(sw.body.text).toBe("** thua rồi");
      expect((await b.req("POST", "/api/chat", { text: "again" })).status).toBe(429); // 3 s between messages
      expect((await d.req("POST", "/api/chat", { sticker: "legend_rong" })).body.message).toBe("not_owned");

      const list = await c.req("GET", "/api/chat");
      expect(list.body.messages.map((m: any) => m.id)).toEqual([hi.body.id, sw.body.id]);
      expect(list.body.messages[0]).not.toHaveProperty("userId");
      expect((await c.req("GET", `/api/chat?after=${hi.body.id}`)).body.messages.map((m: any) => m.id)).toEqual([sw.body.id]);

      // Three different players report: hidden for everyone
      expect((await b.req("POST", `/api/chat/${sw.body.id}/report`)).status).toBe(400); // not your own
      for (const p of [a, c, d]) expect((await p.req("POST", `/api/chat/${sw.body.id}/report`)).status).toBe(200);
      const after = await c.req("GET", "/api/chat");
      expect(after.body.messages.map((m: any) => m.id)).toEqual([hi.body.id]);
      expect(after.body.removed).toContain(sw.body.id);
    });

    it("admin: mute, ban (logs out, blocks login), announcement and stats", async () => {
      const admin = new Player(), bad = new Player();
      const aUser = await admin.register(); const bUser = await bad.register();
      await pool.query("update users set is_admin = true where id = $1", [aUser.id]);
      await games(bad.username, 5);
      const m = await bad.req("POST", "/api/chat", { text: "hello" });
      expect((await bad.req("GET", "/api/admin/community/chat")).status).toBe(403);
      const view = await admin.req("GET", "/api/admin/community/chat");
      expect(view.body.messages.find((x: any) => x.id === m.body.id)).toMatchObject({ username: bad.username, reports: 0, deleted: false });

      expect((await admin.req("POST", `/api/admin/community/users/${bUser.id}`, { minutes: 60 })).status).toBe(200);
      expect((await bad.req("POST", "/api/chat", { text: "still here" })).body.message).toBe("muted");
      expect((await admin.req("POST", `/api/admin/community/users/${bUser.id}`, { minutes: 0 })).status).toBe(200);

      await admin.req("PUT", "/api/admin/announcement", { text: "Giải đấu bi-a tối nay 20:00!" });
      expect((await new Player().req("GET", "/api/announcement")).body.text).toBe("Giải đấu bi-a tối nay 20:00!");

      expect((await admin.req("POST", `/api/admin/community/users/${bUser.id}`, { banned: true })).status).toBe(200);
      expect((await bad.req("GET", "/api/me")).status).toBe(403);
      expect((await bad.req("GET", "/api/me")).status).toBe(401); // the session is gone
      expect((await bad.req("POST", "/api/login", { username: bad.username, password: bad.password })).status).toBe(403);
      expect((await admin.req("GET", "/api/chat")).body.messages.map((x: any) => x.id)).not.toContain(m.body.id);

      const stats = (await admin.req("GET", "/api/admin/dashboard/stats")).body;
      for (const k of ["activeToday", "activeWeek", "newUsersWeek", "chatToday", "poolToday", "invitedPlayers", "mutedOrBanned"]) expect(typeof stats[k]).toBe("number");
      expect(stats.mutedOrBanned).toBeGreaterThanOrEqual(1);
    });

    it("stickers: a free pack a day, play packs, set rewards once, trade-in and gifts", async () => {
      const a = new Player(), b = new Player();
      await a.register(); await b.register();
      let album = (await a.req("GET", "/api/stickers")).body;
      expect(album.packs).toMatchObject({ free: true, play: 0, bonus: 0 });
      const first = await a.req("POST", "/api/stickers/open", { kind: "free" });
      expect(first.body.stickers).toHaveLength(3);
      expect((await a.req("POST", "/api/stickers/open", { kind: "free" })).status).toBe(409); // once a day
      expect((await a.req("POST", "/api/stickers/open", { kind: "play" })).status).toBe(409);
      await games(a.username, 50);
      expect((await a.req("GET", "/api/stickers")).body.packs.play).toBe(2);
      expect((await a.req("POST", "/api/stickers/open", { kind: "play" })).status).toBe(200);
      expect((await a.req("POST", "/api/stickers/open", { kind: "play" })).status).toBe(200);
      expect((await a.req("POST", "/api/stickers/open", { kind: "play" })).status).toBe(409);
      album = (await a.req("GET", "/api/stickers")).body;
      expect(Object.values(album.owned).reduce((t: number, n: any) => t + n, 0)).toBe(9);

      // Complete the Tết set by hand and claim it once
      expect((await a.req("POST", "/api/stickers/claim", { set: "tet" })).status).toBe(400);
      const { STICKERS } = await import("../shared/stickers");
      const uid = (await a.req("GET", "/api/me")).body.id;
      for (const s of STICKERS.filter((x) => x.set === "tet")) {
        await pool.query("insert into user_stickers (user_id, sticker_id, count) values ($1, $2, 3) on conflict (user_id, sticker_id) do update set count = 3", [uid, s.id]);
      }
      const before = (await a.state()).balance;
      const claim = await a.req("POST", "/api/stickers/claim", { set: "tet" });
      expect(claim.body.reward).toBe(200_000);
      expect((await a.state()).balance).toBe(before + 200_000);
      expect((await a.req("POST", "/api/stickers/claim", { set: "tet" })).body.message).toBe("Already claimed");
      expect((await a.req("POST", "/api/stickers/claim", { set: "album" })).status).toBe(400);

      // Trade 5 spares for a bonus pack; never touches the last copy
      const t = await a.req("POST", "/api/stickers/trade");
      expect(t.status).toBe(200);
      expect(t.body.traded.reduce((s: number, x: any) => s + x.n, 0)).toBe(5);
      album = (await a.req("GET", "/api/stickers")).body;
      expect(album.packs.bonus).toBe(1);
      for (const s of STICKERS.filter((x) => x.set === "tet")) expect(album.owned[s.id]).toBeGreaterThanOrEqual(1);

      // Gift a spare; can't gift your last one or to yourself
      const spare = STICKERS.find((x) => x.set === "tet" && album.owned[x.id] >= 2)!;
      const g = await a.req("POST", "/api/stickers/gift", { to: b.username.toUpperCase(), sticker: spare.id });
      expect(g.status).toBe(200);
      expect((await b.req("GET", "/api/stickers")).body.owned[spare.id]).toBe(1);
      expect((await b.req("POST", "/api/stickers/gift", { to: a.username, sticker: spare.id })).body.message).toBe("You need a spare one to gift");
      expect((await a.req("POST", "/api/stickers/gift", { to: a.username, sticker: spare.id })).status).toBe(400);
      expect((await a.req("GET", "/api/stickers")).body.giftsLeft).toBe(9);
    });

    it("invites: the friend gets a welcome bonus, the inviter is paid once after 20 games", async () => {
      const inviter = new Player(), friend = new Player(), stranger = new Player();
      await inviter.register();
      const f = await friend.req("POST", "/api/register", { username: friend.username, password: friend.password, ref: inviter.username.toUpperCase() });
      expect(f.status).toBe(200);
      expect(f.body.balance).toBe(STARTING_BALANCE + REFERRAL_WELCOME);
      const s = await stranger.req("POST", "/api/register", { username: stranger.username, password: stranger.password, ref: "nobody_by_that_name" });
      expect(s.body.balance).toBe(STARTING_BALANCE);

      let view = (await inviter.req("GET", "/api/referrals")).body;
      expect(view).toMatchObject({ code: inviter.username, paid: 0, claimable: 0 });
      expect(view.friends.map((x: any) => x.username)).toEqual([friend.username]);
      expect((await inviter.req("POST", "/api/referrals/claim")).body.paid).toBe(0);

      await games(friend.username, 20);
      view = (await inviter.req("GET", "/api/referrals")).body;
      expect(view.claimable).toBe(1);
      const before = (await inviter.state()).balance;
      const [c1, c2] = await Promise.all([inviter.req("POST", "/api/referrals/claim"), inviter.req("POST", "/api/referrals/claim")]);
      expect(c1.body.paid + c2.body.paid).toBe(1); // paid once even when tapped twice
      expect((await inviter.state()).balance).toBe(before + 100_000);
      expect((await inviter.req("GET", "/api/stickers")).body.packs.bonus).toBe(1);
    });
  });
  describe("pool tournament", () => {
    async function connect(p: Player, code: string) {
      const { WebSocket } = await import("ws");
      const ws = new WebSocket(base.replace("http", "ws") + `/ws/pool?code=${code}`, { headers: { Cookie: p.cookie } });
      const msgs: any[] = [];
      ws.on("message", (m) => msgs.push(JSON.parse(String(m))));
      await new Promise<void>((resolve, reject) => { ws.on("open", () => resolve()); ws.on("error", reject); });
      return { ws, msgs };
    }
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    async function until<T>(f: () => Promise<T | null | undefined | false>, ms = 6000): Promise<T> {
      const start = Date.now();
      while (Date.now() - start < ms) { const v = await f(); if (v) return v; await wait(50); }
      throw new Error("timed out");
    }
    const current = (p: Player) => p.req("GET", "/api/tournaments/current").then((r) => r.body);

    it("free entry, bracket with a bye, winners advance, prizes paid once, results in chat", async () => {
      const admin = new Player(), a = new Player(), b = new Player(), c = new Player();
      const au = await admin.register();
      for (const p of [a, b, c]) await p.register();
      await pool.query("update users set is_admin = true where id = $1", [au.id]);
      expect((await a.req("POST", "/api/admin/tournaments", { name: "Test Cup", startsAt: new Date(Date.now() + 60_000).toISOString(), size: 4, prizes: [300_000, 200_000, 100_000] })).status).toBe(403);
      const made = await admin.req("POST", "/api/admin/tournaments", { name: "Test Cup", startsAt: new Date(Date.now() + 60_000).toISOString(), size: 4, prizes: [300_000, 200_000, 100_000] });
      expect(made.status).toBe(200);
      const id = made.body.id;

      for (const p of [a, b, c]) expect((await p.req("POST", `/api/tournaments/${id}/join`)).status).toBe(200);
      expect((await a.req("POST", `/api/tournaments/${id}/join`)).status).toBe(200); // joining twice is harmless
      expect((await current(a)).players).toHaveLength(3);
      expect((await a.state()).balance).toBe(50_000); // free to enter

      expect((await admin.req("POST", `/api/admin/tournaments/${id}/start`)).body.result).toBe("started");
      expect((await new Player().req("POST", `/api/tournaments/${id}/join`)).status).toBe(401);
      const late = new Player(); await late.register();
      expect((await late.req("POST", `/api/tournaments/${id}/join`)).status).toBe(409); // closed once live

      // 3 players in a 4 bracket: one bye straight into the final, one semi-final being played
      let v = await current(a);
      expect(v.tournament).toMatchObject({ status: "live", rounds: 2 });
      expect(v.matches.filter((m: any) => m.reason === "bye")).toHaveLength(1);
      const byName = new Map([[a.username, a], [b.username, b], [c.username, c]]);
      const semi = v.matches.find((m: any) => m.round === 1 && m.status === "playing");
      const [p1, p2] = [byName.get(semi.name1)!, byName.get(semi.name2)!];
      const byeName = [a, b, c].find((p) => p !== p1 && p !== p2)!.username;
      expect(v.matches.find((m: any) => m.round === 2)).toMatchObject({ name1: byeName, status: "pending" });
      const my = (await current(p1)).myMatch;
      expect(my).toMatchObject({ code: semi.code, opponent: p2.username, round: 1 });

      // Both arrive; nobody can shoot before that; then p2 resigns
      const s1 = await connect(p1, my.code);
      const first = await until(async () => s1.msgs.find((m) => m.t === "state"));
      expect(first.tournament).toMatchObject({ id, name: "Test Cup", round: 1, rounds: 2 });
      expect(first.ready).toBe(false);
      const s2 = await connect(p2, my.code);
      await until(async () => s2.msgs.find((m) => m.t === "state" && m.ready));
      s2.ws.send(JSON.stringify({ t: "resign" }));
      await until(async () => s1.msgs.find((m) => m.t === "state" && m.result));
      s1.ws.close(); s2.ws.close();

      // The final opens by itself between p1 and the bye player
      const finalMatch = await until(async () => (await current(p1)).myMatch);
      expect(finalMatch.opponent).toBe(byeName);
      const byePlayer = byName.get(byeName)!;
      const f1 = await connect(p1, finalMatch.code), f2 = await connect(byePlayer, finalMatch.code);
      await until(async () => f1.msgs.find((m) => m.t === "state" && m.ready));
      f1.ws.send(JSON.stringify({ t: "resign" }));
      await until(async () => (await current(byePlayer)).tournament?.status === "finished");
      f1.ws.close(); f2.ws.close();

      v = await current(a);
      expect(v.tournament.status).toBe("finished");
      expect(v.tournament.winnerName).toBe(byeName);
      expect((await byePlayer.state()).balance).toBe(50_000 + 300_000);
      expect((await p1.state()).balance).toBe(50_000 + 200_000);
      expect((await p2.state()).balance).toBe(50_000 + 100_000);
      expect(v.champions[0]).toMatchObject({ name: byeName, tournament: "Test Cup", prize: 300_000 });
      const chat = (await admin.req("GET", "/api/chat")).body.messages.map((m: any) => m.text).join("\n");
      expect(chat).toContain(`${byeName} vô địch Test Cup`);

      // Settling twice can't pay twice
      const { onMatchFinished } = await import("../server/tournament");
      const finalId = v.matches.find((m: any) => m.round === 2).id;
      await onMatchFinished(finalId, (await byePlayer.req("GET", "/api/me")).body.id, "win");
      expect((await byePlayer.state()).balance).toBe(350_000);
    });

    it("a no-show loses, too few players cancels, and a restart reopens lost tables", async () => {
      const admin = new Player(), a = new Player(), b = new Player(), solo = new Player();
      const au = await admin.register();
      for (const p of [a, b, solo]) await p.register();
      await pool.query("update users set is_admin = true where id = $1", [au.id]);
      const mk = async (name: string) => (await admin.req("POST", "/api/admin/tournaments", { name, startsAt: new Date(Date.now() + 60_000).toISOString(), size: 4, prizes: [1000, 500, 0] })).body.id;

      const lonely = await mk("Lonely Cup");
      await solo.req("POST", `/api/tournaments/${lonely}/join`);
      expect((await admin.req("POST", `/api/admin/tournaments/${lonely}/start`)).body.result).toBe("cancelled");

      const cup = await mk("No Show Cup");
      for (const p of [a, b]) await p.req("POST", `/api/tournaments/${cup}/join`);
      await admin.req("POST", `/api/admin/tournaments/${cup}/start`);
      const m1 = await until(async () => (await current(a)).myMatch);

      // A restart wipes the table; the watchdog opens a new one for the same match
      const { dropAllRoomsForTest } = await import("../server/pool");
      const { tournamentTick } = await import("../server/tournament");
      dropAllRoomsForTest();
      await tournamentTick();
      const m2 = (await current(a)).myMatch;
      expect(m2.code).not.toBe(m1.code);

      // Only a turns up: after the wait, a wins the final by no-show
      const sa = await connect(a, m2.code);
      await until(async () => sa.msgs.find((m) => m.t === "state" && m.result), 8000);
      const fin = sa.msgs.filter((m) => m.t === "state").pop();
      expect(fin.result.reason).toBe("no_show");
      expect(fin.names[fin.result.winner]).toBe(a.username);
      sa.ws.close();
      await until(async () => (await admin.req("GET", "/api/admin/tournaments")).body.tournaments.find((t: any) => t.id === cup)?.status === "finished");
      expect((await a.state()).balance).toBe(51_000);
      expect((await b.state()).balance).toBe(50_500);
    });

    it("the weekly tournament is scheduled for Saturday 20:00 Vietnam time", async () => {
      const { nextWeeklyStart } = await import("../server/tournament");
      const s = nextWeeklyStart(new Date("2026-10-04T10:00:00Z")); // a Sunday
      expect(s.toISOString()).toBe("2026-10-10T13:00:00.000Z");
      expect(nextWeeklyStart(new Date("2026-10-10T12:30:00Z")).toISOString()).toBe("2026-10-17T13:00:00.000Z"); // under an hour away: next week
      expect(nextWeeklyStart(new Date("2026-10-10T11:00:00Z")).toISOString()).toBe("2026-10-10T13:00:00.000Z");
    });
  });
  describe("slot features", () => {
    const LINE_WIN = [["dragon", "lantern", "drum"], ["koi", "lantern", "lotus"], ["drum", "lantern", "koi"], ["lotus", "dragon", "coin"], ["coin", "koi", "lantern"]]; // middle row: 3 lanterns
    const envelopesRng = () => () => 104;

    it("free spins wait for the player's pick, then play at that multiplier and bet", async () => {
      const p = new Player();
      const user = await p.register();
      await pool.query("insert into game_states (user_id, slot_id, free_spin_units, free_spin_bet) values ($1, 'main', 12, 5000)", [user.id]);
      expect((await p.state()).pendingFreeSpinUnits).toBe(12);
      const blocked = await p.spin(BET);
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe("pick_free_spins");
      expect((await p.state()).balance).toBe(50000); // nothing taken
      expect((await p.req("POST", "/api/game/free-spins/pick", { choice: "silly" })).status).toBe(400);
      const pick = await p.req("POST", "/api/game/free-spins/pick", { choice: "daring" });
      expect(pick.body).toMatchObject({ choice: "daring", mult: 4, spins: 3, freeSpins: 3 });
      expect((await p.req("POST", "/api/game/free-spins/pick", { choice: "steady" })).status).toBe(409); // only once
      for (let i = 0; i < 3; i++) {
        const r = (await p.spin(BET)).body;
        expect(r).toMatchObject({ isFreeSpin: true, bet: 5000, freeSpinMult: 4 });
        expect(r.winAmount % 4).toBe(0);
      }
      const s = await p.state();
      expect(s.freeSpins === 0 || s.pendingFreeSpinUnits === 0).toBe(true);
    });

    it("the mystery envelope is one of the real choices", async () => {
      const seen = new Set<number>();
      for (let i = 0; i < 12; i++) {
        const p = new Player();
        const user = await p.register();
        await pool.query("insert into game_states (user_id, slot_id, free_spin_units, free_spin_bet) values ($1, 'main', 24, 1000)", [user.id]);
        const r = (await p.req("POST", "/api/game/free-spins/pick", { choice: "mystery" })).body;
        expect(r.mystery).toBe(true);
        expect(r.spins * r.mult).toBe(24);
        seen.add(r.mult);
      }
      expect(seen.size).toBeGreaterThan(1);
    });

    it("Xóc Đĩa double-up: stakes the last win at fair odds, half or all, and stops after a loss", async () => {
      const { storage } = await import("../server/storage");
      const { spin } = await import("../server/game");
      const { GAMBLE_PAYS, gambleWins } = await import("../shared/gamble");
      const p = new Player();
      const user = await p.register();
      const r = await storage.spin(user.id, 10000, (bet, o) => spin(bet, { ...o, startGrid: LINE_WIN, rng: envelopesRng() }));
      if ("error" in r) throw new Error(r.error);
      const { payOf } = await import("../shared/schema");
      const lanterns = Math.floor(payOf("lantern", 3) * 10000);
      expect(r.winAmount).toBe(lanterns); // 3 lanterns on the middle line
      expect(r.gambleAmount).toBe(lanterns);
      expect((await p.state()).gambleAmount).toBe(lanterns);
      expect((await p.req("POST", "/api/game/gamble", { pick: "red" })).status).toBe(400);

      let balance = (await p.state()).balance;
      let pot = lanterns;
      let rounds = 0;
      // Keep going (half stakes) until a loss or the round limit
      while (true) {
        const g = (await p.req("POST", "/api/game/gamble", { pick: "chan", half: true })).body;
        rounds++;
        const stake = Math.floor(pot / 2);
        expect(g.stake).toBe(stake);
        expect(g.kept).toBe(pot - stake);
        expect(g.reds).toBe(g.coins.filter(Boolean).length);
        expect(g.won).toBe(gambleWins("chan", g.reds));
        expect(g.payout).toBe(g.won ? stake * GAMBLE_PAYS.chan : 0);
        balance = balance - stake + g.payout;
        expect(g.balance).toBe(balance);
        expect(g.rounds).toBe(rounds);
        pot = g.gambleAmount;
        if (!g.canContinue) break;
      }
      expect(rounds).toBeLessThanOrEqual(5);
      expect((await p.req("POST", "/api/game/gamble", { pick: "le" })).status).toBe(409);
      expect((await p.state()).balance).toBe(balance);

      // A new win, then collect: nothing left to stake
      await storage.spin(user.id, 10000, (bet, o) => spin(bet, { ...o, startGrid: LINE_WIN, rng: envelopesRng() }));
      await p.req("POST", "/api/game/gamble/collect");
      expect((await p.req("POST", "/api/game/gamble", { pick: "chan" })).status).toBe(409);
      // A losing spin leaves nothing to double up
      const lose = await storage.spin(user.id, 1000, (bet, o) => spin(bet, { ...o, startGrid: [["dragon", "lantern", "drum"], ["drum", "koi", "lotus"], ["lotus", "dragon", "koi"], ["lantern", "drum", "dragon"], ["koi", "lotus", "lantern"]], rng: envelopesRng() }));
      if ("error" in lose) throw new Error(lose.error);
      expect(lose.winAmount).toBe(0);
      expect((await p.state()).gambleAmount).toBe(0);
    });

    it("the double-up is fair over many rounds (about half of even/odd bets win)", async () => {
      const p = new Player();
      const user = await p.register();
      let wins = 0;
      const N = 400;
      for (let i = 0; i < N; i++) {
        await pool.query("update game_states set gamble_amount = 1000, gamble_rounds = 0 where user_id = $1", [user.id]).then(async (q) => {
          if (!q.rowCount) await pool.query("insert into game_states (user_id, slot_id, gamble_amount) values ($1, 'main', 1000)", [user.id]);
        });
        const g = (await p.req("POST", "/api/game/gamble", { pick: i % 2 ? "chan" : "le" })).body;
        if (g.won) wins++;
      }
      // Binomial(400, 1/2): 5 standard deviations is +-50
      expect(Math.abs(wins - N / 2)).toBeLessThan(50);
    });
  });
  describe("GIỮ CUỘN (HOLD)", () => {
    it("is offered only after a losing paid spin, and a held spin keeps the held reels at the same bet", async () => {
      const p = new Player();
      const user = await p.register();
      await setBalance(p.username, 10_000_000);
      let offers = 0;
      for (let i = 0; i < 60; i++) {
        const r = (await p.play(BET)).body;
        if (r.holdOffer) {
          offers++;
          expect(r.winAmount).toBe(0);
          expect(r.isFreeSpin).toBe(false);
          expect(r.holdBet).toBe(BET);
        }
      }
      expect(offers).toBeGreaterThan(0);

      // Offer a known grid
      const grid = [["dragon", "pearl", "lotus"], ["koi", "pearl", "drum"], ["lotus", "drum", "koi"], ["drum", "lotus", "lantern"], ["lantern", "koi", "dragon"]];
      await pool.query("update game_states set hold_grid = $1, hold_bet = $2, free_spins = 0, free_spin_units = 0 where user_id = $3", [JSON.stringify(grid), 5000, user.id]);
      expect((await p.state())).toMatchObject({ holdOffer: true, holdBet: 5000 });
      expect((await p.req("POST", "/api/game/spin", { betAmount: 1000, hold: [0, 1] })).body.code).toBe("bad_hold"); // must be the same bet
      expect((await p.req("POST", "/api/game/spin", { betAmount: 5000, hold: [0, 1, 2] })).body.code).toBe("bad_hold"); // at most 2 reels
      expect((await p.req("POST", "/api/game/spin", { betAmount: 5000, hold: [0, 0] })).body.code).toBe("bad_hold");
      expect((await p.req("POST", "/api/game/spin", { betAmount: 5000, hold: [7] })).body.code).toBe("bad_hold");
      const before = (await p.state()).balance;
      const held = await p.req("POST", "/api/game/spin", { betAmount: 5000, hold: [0, 1] });
      expect(held.status).toBe(200);
      expect(held.body.heldReels).toEqual([0, 1]);
      expect(held.body.steps[0].grid[0]).toEqual(grid[0]);
      expect(held.body.steps[0].grid[1]).toEqual(grid[1]);
      expect(held.body.newBalance).toBe(before - 5000 + held.body.winAmount);
      expect(held.body.holdOffer).toBe(false); // never straight after a held spin
      expect((await p.req("POST", "/api/game/spin", { betAmount: 5000, hold: [0] })).body.code).toBe("no_hold");
    });
  });
  describe("pool league", () => {
    async function connect(p: Player, code: string) {
      const { WebSocket } = await import("ws");
      const ws = new WebSocket(base.replace("http", "ws") + `/ws/pool?code=${code}`, { headers: { Cookie: p.cookie } });
      const msgs: any[] = [];
      ws.on("message", (m) => msgs.push(JSON.parse(String(m))));
      await new Promise<void>((resolve, reject) => { ws.on("open", () => resolve()); ws.on("error", reject); });
      const next = async (pred: (m: any) => boolean, ms = 5000) => {
        const start = Date.now();
        while (Date.now() - start < ms) {
          const i = msgs.findIndex(pred);
          if (i >= 0) return msgs.splice(0, i + 1)[i];
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error("timed out waiting for a message");
      };
      return { ws, msgs, next };
    }

    /** A free table between two players: plays `shots` real shots (computer-chosen), then `loser` resigns */
    async function playGame(a: Player, b: Player, shots: number, loser: "a" | "b") {
      const { chooseAiShot } = await import("../shared/pool/ai");
      const code = (await a.req("POST", "/api/pool/tables", { stake: 0 })).body.code;
      const ca = await connect(a, code);
      await b.req("POST", `/api/pool/tables/${code}/join`);
      const cb = await connect(b, code);
      let state = (await ca.next((m) => m.t === "state" && m.status === "playing")).game;
      let n = 0;
      for (let i = 0; i < shots && state.winner === null; i++) {
        // Soft shots: legal, but too gentle to pot anything, so the game can't end on its own
        const { shot, cue } = chooseAiShot(state, Math.random, 6);
        (state.turn === 0 ? ca : cb).ws.send(JSON.stringify({ t: "shoot", shot: { ...shot, power: 0.06 }, cue }));
        state = (await ca.next((m) => m.t === "shot")).state;
        n++;
      }
      if (state.winner === null) (loser === "a" ? ca : cb).ws.send(JSON.stringify({ t: "resign" }));
      const end = await ca.next((m) => m.t === "state" && m.status === "finished");
      ca.ws.close(); cb.ws.close();
      return { end, shots: n, code };
    }
    const league = (p: Player) => p.req("GET", "/api/pool/league").then((r) => r.body);

    it("counts real games: 3 points a win, 1 a loss, a daily first-win bonus, and a short resign counts nothing", async () => {
      const a = new Player(), b = new Player();
      await a.register(); await b.register();
      const short = await playGame(a, b, 2, "a");
      expect(short.end.result.league).toEqual({ counted: false, bonus: 0 });
      expect((await league(a)).me).toBeNull();

      const g1 = await playGame(a, b, 8, "a");
      expect(g1.shots).toBe(8);
      expect(g1.end.result.reason).toBe("resign");
      expect(g1.end.result.league).toEqual({ counted: true, bonus: 20_000 });
      const winner = g1.end.names[g1.end.result.winner];
      expect(winner).toBe(b.username);
      expect((await b.state()).balance).toBe(50_000 + 20_000);
      const g2 = await playGame(a, b, 8, "a");
      expect(g2.end.result.league).toEqual({ counted: true, bonus: 0 }); // once a day
      const vb = await league(b);
      expect(vb.me).toMatchObject({ played: 2, won: 2, lost: 0, points: 6, rank: 1, form: ["W", "W"] });
      expect(vb.todayBonusTaken).toBe(true);
      const va = await league(a);
      expect(va.me).toMatchObject({ played: 2, won: 0, lost: 2, points: 2 });
      expect(va.table.map((r: any) => r.username)).toEqual(expect.arrayContaining([a.username, b.username]));
      expect(va.table[0]).not.toHaveProperty("userId");

      // The same two players: only 3 games a day count
      const g3 = await playGame(a, b, 8, "b");
      expect(g3.end.result.league.counted).toBe(true);
      const g4 = await playGame(a, b, 8, "b");
      expect(g4.end.result.league.counted).toBe(false);
    }, 60_000);

    it("pays a finished season once: prizes for the top and a reward for regulars", async () => {
      const { settleSeason } = await import("../server/league");
      const { LEAGUE_PRIZES, PARTICIPATION_PRIZE } = await import("../shared/league");
      const ps = [new Player(), new Player(), new Player()];
      const ids: string[] = [];
      for (const p of ps) ids.push((await p.register()).id);
      const add = (w: string, l: string, n: number) => pool.query(
        "insert into pool_matches (code, player1, player2, stake, status, winner, reason, finished_at, shots, season, counted) select 'T' || md5(random()::text), $1, $2, 0, 'finished', $1, 'win', '2026-08-15', 10, '2026-08', true from generate_series(1, $3)",
        [w, l, n]);
      await add(ids[0], ids[1], 6); // p0: 6 wins
      await add(ids[1], ids[2], 3); // p1: 3 wins, 6 losses
      const before = await Promise.all(ps.map((p) => p.state().then((s) => s.balance)));
      const r = await settleSeason("2026-08");
      expect(r?.champion?.username).toBe(ps[0].username);
      const after = await Promise.all(ps.map((p) => p.state().then((s) => s.balance)));
      expect(after[0] - before[0]).toBe(LEAGUE_PRIZES[0]);
      expect(after[1] - before[1]).toBe(LEAGUE_PRIZES[1]);
      expect(after[2] - before[2]).toBe(LEAGUE_PRIZES[2]);
      expect(await settleSeason("2026-08")).toBeNull(); // never twice
      expect((await ps[0].state()).balance).toBe(after[0]);
      const past = (await league(ps[0])).past;
      expect(past.find((x: any) => x.season === "2026-08")).toMatchObject({ champion: ps[0].username, points: 18 });
      expect(PARTICIPATION_PRIZE).toBeGreaterThan(0);
    });

    it("works out seasons in Vietnam time", async () => {
      const { seasonOf, seasonEnd, previousSeason, tierOf, nextTier } = await import("../shared/league");
      expect(seasonOf(new Date("2026-10-31T16:59:00Z"))).toBe("2026-10"); // 23:59 in Vietnam
      expect(seasonOf(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11"); // midnight in Vietnam
      expect(seasonEnd("2026-10").toISOString()).toBe("2026-10-31T17:00:00.000Z");
      expect(previousSeason("2027-01")).toBe("2026-12");
      expect(tierOf(0).id).toBe("bronze");
      expect(tierOf(80).id).toBe("gold");
      expect(nextTier(25)).toMatchObject({ need: 5 });
      expect(nextTier(200)).toBeNull();
    });
  });

  describe("admin analytics", () => {
    it("records every play and adds it up for the admin, who alone can see it", async () => {
      const admin = new Player(), p = new Player();
      const au = await admin.register(); const pu = await p.register();
      await pool.query("update users set is_admin = true where id = $1", [au.id]);
      expect((await p.req("GET", "/api/admin/analytics")).status).toBe(403);

      const before = (await admin.req("GET", "/api/admin/analytics?days=1")).body;
      let staked = 0, paid = 0;
      for (let i = 0; i < 5; i++) {
        const r = await p.spin(BET);
        expect(r.status).toBe(200);
        staked += BET; paid += r.body.winAmount;
        if (r.body.pendingFreeSpinUnits) await p.req("POST", "/api/game/free-spins/pick", { choice: "steady" });
      }
      const bc = await p.req("POST", "/api/games/baucua", { bets: { cua: 2000 } });
      expect(bc.status).toBe(200);

      const rows = (await pool.query("select game, bet, payout from game_plays where user_id = $1 order by id", [pu.id])).rows;
      const slot = rows.filter((r: any) => r.game === "slot" && Number(r.bet) > 0);
      expect(slot.length).toBe(5);
      expect(slot.reduce((a: number, r: any) => a + Number(r.bet), 0)).toBe(staked);
      expect(rows.find((r: any) => r.game === "baucua")).toMatchObject({ bet: "2000", payout: String(bc.body.winAmount) });

      const after = (await admin.req("GET", "/api/admin/analytics?days=1")).body;
      expect(after.kpis.playsToday - before.kpis.playsToday).toBe(rows.length);
      expect(after.kpis.wageredToday - before.kpis.wageredToday).toBe(staked + 2000);
      expect(after.games.find((g: any) => g.game === "baucua").plays).toBeGreaterThanOrEqual(1);
      expect(after.hideAdmins).toBe(true);
      expect(after.topPlayers.map((t: any) => t.username)).not.toContain(admin.username);

      const detail = (await admin.req("GET", `/api/admin/players/${pu.id}`)).body;
      expect(detail.username).toBe(p.username);
      expect(detail.games.find((g: any) => g.game === "slot").plays).toBeGreaterThanOrEqual(5);
      expect(detail.activeDays.length).toBeGreaterThanOrEqual(0);

      // A gift adds to the balance and shows up with the bonuses
      const bal = (await p.state()).balance;
      expect((await admin.req("POST", `/api/admin/players/${pu.id}/gift`, { amount: 5 })).status).toBe(400);
      const g = await admin.req("POST", `/api/admin/players/${pu.id}/gift`, { amount: 25000 });
      expect(g.body.balance).toBe(bal + 25000);
      expect((await p.req("POST", `/api/admin/players/${pu.id}/gift`, { amount: 25000 })).status).toBe(403);
      expect((await admin.req("GET", `/api/admin/players/${pu.id}`)).body.bonuses[0]).toMatchObject({ method: "admin_gift", amount: 25000 });
    });
  });

  describe("Lô Tô", () => {
    it("sells real tickets only while buying is open, keeps the winning call secret, and pays it exactly once", async () => {
      const { buyTickets, settleLoto, lotoView, roundDraws } = await import("../server/loto");
      const L = await import("../shared/loto");
      const p = new Player();
      const pu = await p.register();
      const user = (await pool.query("select * from users where id = $1", [pu.id])).rows[0];
      // A round far in the future, so the live timer leaves it alone until we say
      const t = L.lotoRoundTimes(L.lotoRoundAt(Date.now()).round + 1000);
      const buying = t.start + 5000;

      expect((await buyTickets(pu.id, { price: 7000, grids: [L.makeLotoGrid()] }, buying))).toHaveProperty("error");
      const bad = L.makeLotoGrid(); bad[0] = bad[1];
      expect((await buyTickets(pu.id, { price: 10000, grids: [bad] }, buying))).toHaveProperty("error");
      expect((await buyTickets(pu.id, { price: 10000, grids: [L.makeLotoGrid()] }, t.drawStart))).toMatchObject({ code: "closed" });

      const grids = [L.makeLotoGrid(), L.makeLotoGrid(), L.makeLotoGrid()];
      const r = await buyTickets(pu.id, { price: 10000, grids }, buying);
      expect(r).not.toHaveProperty("error");
      expect((r as any).balance).toBe(50000 - 30000);
      // Six a round at most
      await buyTickets(pu.id, { price: 1000, grids: [L.makeLotoGrid(), L.makeLotoGrid(), L.makeLotoGrid()] }, buying);
      expect((await buyTickets(pu.id, { price: 1000, grids: [L.makeLotoGrid()] }, buying))).toHaveProperty("error");

      const draws = await roundDraws(t.round);
      const expected = grids.map((g) => Math.round(10000 * L.lotoMultiplier(L.lotoKinhAt(g, draws))));
      // Before the calls, nothing about the outcome is visible
      const early = await lotoView(user, t.drawStart - 100);
      expect(early.calls).toEqual([]);
      expect(early.mine.every((x) => x.kinhAt === null && x.payout === null)).toBe(true);

      // Nothing is paid early; everything is paid once the calls end, and only once
      await settleLoto(t.drawStart - 100);
      const mid = (await pool.query("select count(*)::int as n from loto_tickets where round = $1 and settled", [t.round])).rows[0].n;
      expect(mid).toBe(0);
      const before = (await p.state()).balance;
      await settleLoto(t.callsEnd + 1000);
      await settleLoto(t.callsEnd + 2000);
      const small = (await pool.query("select payout from loto_tickets where round = $1 and price = 1000", [t.round])).rows.reduce((a: number, x: any) => a + Number(x.payout), 0);
      expect((await p.state()).balance).toBe(before + expected.reduce((a, b) => a + b, 0) + small);
      const plays = (await pool.query("select count(*)::int as n from game_plays where user_id = $1 and game = 'loto'", [pu.id])).rows[0].n;
      expect(plays).toBe(6);
      const after = await lotoView(user, t.callsEnd + 3000);
      expect(after.calls).toEqual(draws.slice(0, L.LOTO_CALLS));
    });
  });

  describe("Tiến Lên", () => {
    it("deals, checks every move, plays the computer players and pays by finishing place", async () => {
      const T = await import("../shared/tienlen");
      const p = new Player();
      const pu = await p.register();
      expect((await p.req("POST", "/api/tienlen/start", { stake: 1234 })).status).toBe(400);
      const s0 = await p.req("POST", "/api/tienlen/start", { stake: 10000 });
      expect(s0.status).toBe(200);
      expect((await p.req("POST", "/api/tienlen/start", { stake: 10000 })).status).toBe(409); // one game at a time
      let g = s0.body.game;
      expect(g.hand.length + g.events.filter((e: any) => e.seat === 0 && e.play).length).toBe(13);
      expect(g.counts.reduce((a: number, b: number) => a + b, 0) + g.events.filter((e: any) => e.play).reduce((a: number, e: any) => a + e.play.length, 0)).toBe(52);

      // Cards you don't hold, and plays that aren't combinations, are refused
      const notMine = Array.from({ length: 52 }, (_, i) => i).find((c) => !g.hand.includes(c))!;
      expect((await p.req("POST", "/api/tienlen/move", { cards: [notMine] })).status).toBe(400);
      const sorted = [...g.hand].sort((a: number, b: number) => a - b);
      const junk = [sorted[0], sorted[sorted.length - 1]];
      if (!T.classify(junk)) expect((await p.req("POST", "/api/tienlen/move", { cards: junk })).status).toBe(400);

      let guard = 0;
      while (!g.over && guard++ < 60) {
        const row = (await pool.query("select state from tienlen_games where id = $1", [g.id])).rows[0];
        const st = row.state;
        expect(st.turn).toBe(0);
        const h = T.hint(st, 0);
        const r = h ? await p.req("POST", "/api/tienlen/move", { cards: h }) : await p.req("POST", "/api/tienlen/move", { pass: true });
        expect(r.status).toBe(200);
        g = r.body.game;
      }
      expect(g.over).toBe(true);
      expect(g.payout).toBe(Math.round(10000 * T.TIENLEN_PAYS[g.place - 1]));
      expect((await p.state()).balance).toBe(50000 - 10000 + g.payout);
      expect((await pool.query("select bet, payout from game_plays where user_id = $1 and game = 'tienlen'", [pu.id])).rows)
        .toEqual([{ bet: "10000", payout: String(g.payout) }]);
      expect((await p.req("POST", "/api/tienlen/move", { pass: true })).status).toBe(404);

      // Giving up is last place
      await p.req("POST", "/api/tienlen/start", { stake: 1000 });
      const gave = await p.req("POST", "/api/tienlen/resign");
      expect(gave.body.game).toMatchObject({ over: true, place: 4, payout: 0 });
    });
  });

  describe("Bắn Cá", () => {
    it("charges each hit, pays catches, refuses made-up fish and too many shots, and logs the totals", async () => {
      const { flushBancaLog } = await import("../server/banca");
      const p = new Player();
      const pu = await p.register();
      expect((await p.req("POST", "/api/banca/shoot", { level: 500, fish: "kraken" })).status).toBe(400);
      expect((await p.req("POST", "/api/banca/shoot", { level: 333, fish: "tep" })).status).toBe(400);
      let expected = 50000, statuses: number[] = [], spent = 0, won = 0;
      for (let i = 0; i < 10; i++) {
        const r = await p.req("POST", "/api/banca/shoot", { level: 500, fish: "tep" });
        statuses.push(r.status);
        if (r.status === 200) {
          expected += -500 + r.body.payout; spent += 500; won += r.body.payout;
          expect(r.body.payout).toBe(r.body.caught ? 1000 : 0);
          expect(r.body.balance).toBe(expected);
        }
      }
      expect(statuses.filter((x) => x === 200).length).toBe(8); // eight a second
      expect(statuses.filter((x) => x === 429).length).toBe(2);
      expect((await p.state()).balance).toBe(expected);
      await flushBancaLog();
      // The log may have been written in more than one go (it flushes on a timer too): the totals must match
      const [tot] = (await pool.query("select sum(bet)::int as bet, sum(payout)::int as payout from game_plays where user_id = $1 and game = 'banca'", [pu.id])).rows;
      expect(tot).toEqual({ bet: spent, payout: won });
      // Can't shoot with no coins
      await setBalance(p.username, 100);
      await new Promise((r) => setTimeout(r, 1100));
      expect((await p.req("POST", "/api/banca/shoot", { level: 500, fish: "tep" })).status).toBe(400);
    });
  });

  describe("live card tables", () => {
    async function seatWs(p: Player, code: string) {
      const { WebSocket } = await import("ws");
      const ws = new WebSocket(base.replace("http", "ws") + `/ws/cards?code=${code}`, { headers: { Cookie: p.cookie } });
      await new Promise<void>((resolve, reject) => { ws.on("open", () => resolve()); ws.on("error", reject); });
      return ws;
    }
    const state = async (p: Player, code: string) => (await p.req("GET", `/api/cards/tables/${code}`)).body.state;
    /** Waits until a round is dealt (or settled) */
    async function until(p: Player, code: string, pred: (s: any) => boolean, ms = 8000) {
      const start = Date.now();
      for (;;) {
        const s = await state(p, code);
        if (pred(s)) return s;
        if (Date.now() - start > ms) throw new Error("timed out: " + JSON.stringify({ phase: s.phase, msg: s.message }));
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    /** Plays my hand whenever it's my turn: hit below the line, then stand */
    async function playOut(players: Player[], code: string, line: (s: any, me: number) => number) {
      for (let i = 0; i < 80; i++) {
        const s = await state(players[0], code);
        if (s.phase === "settled") return s;
        if (s.turn === null) { await new Promise((r) => setTimeout(r, 120)); continue; }
        for (const p of players) {
          const mine = await state(p, code);
          if (mine.turn !== mine.you) continue;
          const seat = mine.seats[mine.you];
          await p.req("POST", `/api/cards/tables/${code}/act`, { action: seat.total < line(mine, mine.you) && seat.count < 5 ? "hit" : "stand" });
        }
      }
      throw new Error("round never ended");
    }

    it("Bàn Chung: plays a round against the dealer, holds the stake, and pays exactly", async () => {
      const { dropAllTablesForTest } = await import("../server/cardtables");
      dropAllTablesForTest();
      const a = new Player();
      const au = await a.register();
      expect((await a.req("POST", "/api/cards/tables", { mode: "house", stake: 777 })).status).toBe(400);
      const code = (await a.req("POST", "/api/cards/tables", { mode: "house", stake: 10000 })).body.code;
      const ws = await seatWs(a, code);
      const dealt = await until(a, code, (s) => s.phase !== "waiting");
      expect(dealt.round).toBe(1);
      if (dealt.phase === "playing") {
        // Mid-round: the most I could lose is held aside, and the dealer's second card is hidden
        expect((await pool.query("select sum(amount)::int as n from table_escrows where code = $1", [code])).rows[0].n).toBe(20000);
        expect(dealt.dealer.cards[1]).toBeNull();
        expect((await a.state()).balance).toBe(50000 - 20000);
      }
      const end = await playOut([a], code, () => 17);
      const me = end.seats[end.you];
      expect(end.dealer.cards.every((c: any) => c)).toBe(true);
      expect((await a.state()).balance).toBe(50000 + me.net);
      expect((await pool.query("select count(*)::int as n from table_escrows where code = $1", [code])).rows[0].n).toBe(0);
      const log = (await pool.query("select bet, payout from game_plays where user_id = $1 and game = 'bj_table'", [au.id])).rows;
      expect(Number(log[0].payout) - Number(log[0].bet)).toBe(me.net);
      ws.close();
    });

    it("Xì Dách: players play the banker, coins only change hands, and the banker seat moves round", async () => {
      const { dropAllTablesForTest } = await import("../server/cardtables");
      dropAllTablesForTest();
      const a = new Player(), b = new Player(), c = new Player();
      await a.register(); await b.register(); await c.register();
      const code = (await a.req("POST", "/api/cards/tables", { mode: "banker", stake: 5000 })).body.code;
      expect((await b.req("POST", `/api/cards/tables/${code}/sit`)).status).toBe(200);
      expect((await c.req("POST", `/api/cards/tables/${code}/sit`)).status).toBe(200);
      // A second table for the same player is refused
      expect((await a.req("POST", "/api/cards/tables", { mode: "house", stake: 1000 })).status).toBe(409);
      const sockets = [await seatWs(a, code), await seatWs(b, code), await seatWs(c, code)];
      const dealt = await until(a, code, (s) => s.phase !== "waiting");
      const banker1 = dealt.seats.findIndex((s: any) => s?.banker);
      expect(banker1).toBeGreaterThanOrEqual(0);
      if (dealt.phase === "playing") {
        // Others' cards stay hidden until the end
        const other = dealt.seats.find((s: any) => s && !s.you);
        expect(other.cards).toBeNull();
        // Standing under 16 is refused, for whoever is to play
        for (const p of [a, b, c]) {
          const mine = await state(p, code);
          if (mine.turn === mine.you && mine.seats[mine.you].total < 16) {
            expect((await p.req("POST", `/api/cards/tables/${code}/act`, { action: "stand" })).status).toBe(400);
          }
        }
      }
      const end = await playOut([a, b, c], code, (s, me) => (s.seats[me].banker ? 15 : 16));
      const nets = end.seats.filter(Boolean).map((s: any) => s.net);
      expect(nets.reduce((x: number, y: number) => x + y, 0)).toBe(0); // zero-sum: the game takes nothing
      const balances = await Promise.all([a, b, c].map(async (p) => (await p.state()).balance));
      expect(balances.reduce((x, y) => x + y, 0)).toBe(150000);
      expect((await pool.query("select count(*)::int as n from table_escrows where code = $1", [code])).rows[0].n).toBe(0);
      // Next round: the banker seat has moved on
      const next = await until(a, code, (s) => s.round === 2 && s.phase !== "waiting", 15000);
      expect(next.seats.findIndex((s: any) => s?.banker)).not.toBe(banker1);
      for (const w of sockets) w.close();
    }, 30000);
  });
});
