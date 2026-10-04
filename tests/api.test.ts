/**
 * End-to-end API tests against a real PostgreSQL database.
 * Needs TEST_DATABASE_URL pointing at a throwaway database: it is wiped first.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import type { AddressInfo } from "net";

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

  async register() {
    const r = await this.req("POST", "/api/register", { username: this.username, password: this.password });
    expect(r.status).toBe(200);
    return r.body;
  }
  spin(betAmount = BET) { return this.req("POST", "/api/game/spin", { betAmount }); }
  state() { return this.req("GET", "/api/game/state").then((r) => r.body); }
}

async function setBalance(username: string, balance: number) {
  await pool.query("update users set balance = $1 where username = $2", [balance, username]);
}

describe.skipIf(!TEST_DB)("API", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NODE_ENV = "test";
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
    it("registers with 50,000 coins and never exposes the password hash", async () => {
      const p = new Player();
      const user = await p.register();
      expect(user.balance).toBe(50000);
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
        const r = await p.spin(BET);
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
      results.forEach((r) => expect([200, 400]).toContain(r.status));
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
        const r = (await p.spin(BET)).body;
        if (r.winAmount > r.bet) wins++;
        expect(r.totalWins).toBe(wins);
      }
    });
  });

  describe("oracle, bonuses and promo codes", () => {
    it("oracle blesses one spin per hour", async () => {
      const p = new Player();
      await p.register();
      expect((await p.req("POST", "/api/game/oracle")).body.granted).toBe(true);
      expect((await p.req("POST", "/api/game/oracle")).body.granted).toBe(false);
      expect((await p.state()).blessed).toBe(true);
      const r = (await p.spin(BET)).body;
      expect(r.blessed).toBe(true);
      expect(r.winAmount % 2).toBe(0);
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
      const pearls = [["lotus", "pearl", "dragon"], ["drum", "pearl", "lotus"], ["dragon", "pearl", "drum"]]; // grid[col][row]
      const noWins = () => { const seq = [3, 7, 3, 7, 3, 7]; let i = 0; return () => seq[i++ % seq.length]; };
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
});
