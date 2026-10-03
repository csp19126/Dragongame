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

    it("never double-spends under 20 simultaneous spins", async () => {
      const p = new Player();
      await p.register();
      await setBalance(p.username, 3 * BET);
      const results = await Promise.all(Array.from({ length: 20 }, () => p.spin(BET)));
      const ok = results.filter((r) => r.status === 200).map((r) => r.body);
      // Spins are serialised on the user's row, so each stake must have come out of a non-negative balance
      ok.forEach((r) => expect(r.newBalance - r.winAmount).toBeGreaterThanOrEqual(0));
      expect(results.some((r) => r.status === 400)).toBe(true); // 3K can't fund 20 spins
      const paid = ok.filter((r) => !r.isFreeSpin).reduce((a, r) => a + r.bet, 0);
      const won = ok.reduce((a, r) => a + r.winAmount, 0);
      const s = await p.state();
      expect(s.balance).toBe(3 * BET - paid + won);
      expect(s.balance).toBeGreaterThanOrEqual(0);
      expect(s.gamesPlayed).toBe(ok.length);
      results.filter((r) => r.status !== 200).forEach((r) => expect(r.status).toBe(400));
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
