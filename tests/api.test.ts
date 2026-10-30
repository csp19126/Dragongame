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

  describe("penalty shootout (football)", () => {
    async function connect(p: Player, code: string) {
      const { WebSocket } = await import("ws");
      const ws = new WebSocket(base.replace("http", "ws") + `/ws/football?code=${code}`, { headers: { Cookie: p.cookie } });
      const msgs: any[] = [];
      const all: any[] = [];
      ws.on("message", (m) => { const x = JSON.parse(String(m)); msgs.push(x); all.push(x); });
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
      return { ws, msgs, all, next };
    }
    const fb = () => import("../server/football");
    const sf = () => import("../shared/football");
    type Conn = Awaited<ReturnType<typeof connect>>;

    /** Waits for the "choose" phase of kick number `n` and returns that state */
    const chooseState = (c: Conn, n: number) => c.next((m) => m.t === "state" && m.status === "playing" && m.phase === "choose" && m.shootout.kicks.length === n);

    it("hides both choices until both are in, resolves on the server, and the winner takes the pot once", async () => {
      const { shooterOf } = await sf();
      const { expireFootballClockForTest } = await fb();
      const a = new Player(), b = new Player(), watcher = new Player();
      await a.register(); await b.register(); await watcher.register();
      const made = await a.req("POST", "/api/football/tables", { stake: 10000, kit: "br" });
      expect(made.status).toBe(200);
      const code = made.body.code;
      expect((await a.state()).balance).toBe(40000);
      expect((await a.req("POST", "/api/football/tables", { stake: 0 })).status).toBe(409); // one table at a time
      expect((await b.req("GET", "/api/football/tables")).body.open.map((t: any) => t.code)).toContain(code);
      expect((await b.req("POST", `/api/football/tables/${code}/join`, { kit: "br" })).status).toBe(200);
      expect((await b.state()).balance).toBe(40000);
      const ca = await connect(a, code), cb = await connect(b, code), cw = await connect(watcher, code);
      const conns = [ca, cb];
      let st = await chooseState(ca, 0);
      expect(st.seat).toBe(0);
      expect(st.kits[0]).toBe("br");
      expect(st.kits[1]).not.toBe("br"); // no two teams in the same shirt
      expect((await chooseState(cw, 0)).seat).toBeNull();

      // Kick 1: the shooter commits first. The keeper and the watcher learn only that a choice is in.
      const shooter = shooterOf(st.shootout);
      const keeper = 1 - shooter;
      const secret = { x: -0.77, y: 0.31, power: 0.64, curve: 0.21 };
      cw.ws.send(JSON.stringify({ t: "shoot", shot: secret })); // a spectator can't play
      conns[keeper].ws.send(JSON.stringify({ t: "shoot", shot: secret })); // nor the keeper shoot
      expect((await conns[keeper].next((m) => m.t === "error")).message).toBe("Not your turn");
      conns[shooter].ws.send(JSON.stringify({ t: "shoot", shot: secret }));
      const seen = await conns[keeper].next((m) => m.t === "state" && m.committed[shooter]);
      expect(seen.committed[keeper]).toBe(false);
      conns[shooter].ws.send(JSON.stringify({ t: "shoot", shot: { x: 0.5, y: 0.5, power: 0.5, curve: 0 } }));
      expect((await conns[shooter].next((m) => m.t === "error")).message).toBe("Already chosen");
      await new Promise((r) => setTimeout(r, 150));
      for (const c of [conns[keeper], cw]) {
        const leaked = c.all.filter((m) => JSON.stringify(m).includes("-0.77") || m.t === "kick");
        expect(leaked).toEqual([]);
      }
      conns[keeper].ws.send(JSON.stringify({ t: "dive", zone: 3 }));
      const k1 = await conns[keeper].next((m) => m.t === "kick");
      expect(await conns[shooter].next((m) => m.t === "kick")).toEqual(k1);
      expect(await cw.next((m) => m.t === "kick")).toEqual(k1);
      expect(k1.kick.shot).toEqual(secret);
      expect(k1.kick.dive).toBe(3);
      expect(k1.by).toBe(shooter);
      // The result is exactly what the shared maths says for the server's seed
      const { resolveKick } = await sf();
      expect(resolveKick(secret, 3, k1.kick.seed)).toEqual(k1.kick);

      // Play it out; the keeper always dives bottom right
      let n = 1;
      let end: any = null;
      while (!end && n < 40) {
        expireFootballClockForTest(code); // skip the replay pause
        const s = await ca.next((m) => m.t === "state" && (m.status === "finished" || (m.phase === "choose" && m.shootout.kicks.length === n)));
        if (s.status === "finished") { end = s; break; }
        const sh = shooterOf(s.shootout);
        // Seat 0 places it low in the corner; seat 1 leathers it over the bar
        const shot = sh === 0 ? { x: -0.75, y: 0.2, power: 0.5, curve: 0 } : { x: 0, y: 0.9, power: 1, curve: 0 };
        conns[sh].ws.send(JSON.stringify({ t: "shoot", shot }));
        conns[1 - sh].ws.send(JSON.stringify({ t: "dive", zone: 2 }));
        const k = await ca.next((m) => m.t === "kick");
        n++;
        if (k.decisive) end = await ca.next((m) => m.t === "state" && m.status === "finished");
      }
      expect(end).toBeTruthy();
      const w = end.result.winner as 0 | 1;
      expect(end.result).toMatchObject({ reason: "win", payout: 20000, ladder: { counted: true, delta: 16 } });
      const [winner, loser] = w === 0 ? [a, b] : [b, a];
      expect((await winner.state()).balance).toBe(60000);
      expect((await loser.state()).balance).toBe(40000);

      // Resigning after the end changes nothing
      conns[1 - w].ws.send(JSON.stringify({ t: "resign" }));
      await new Promise((r) => setTimeout(r, 200));
      expect((await winner.state()).balance).toBe(60000);
      const row = (await pool.query("select status, winner, counted, elo_delta, kicks from football_matches where code = $1", [code])).rows[0];
      expect(row).toMatchObject({ status: "finished", counted: true, elo_delta: 16 });
      expect(row.kicks.length).toBe(n);
      const plays = (await pool.query("select u.username, bet::int, payout::int from game_plays g join users u on u.id = g.user_id where game = 'football' and u.username in ($1, $2) order by payout", [a.username, b.username])).rows;
      expect(plays).toEqual([{ username: loser.username, bet: 10000, payout: 0 }, { username: winner.username, bet: 10000, payout: 20000 }]);
      const ratings = (await pool.query("select u.username, rating, played, won from football_ratings r join users u on u.id = r.user_id where u.username in ($1, $2) order by rating", [a.username, b.username])).rows;
      expect(ratings).toEqual([{ username: loser.username, rating: 984, played: 1, won: 0 }, { username: winner.username, rating: 1016, played: 1, won: 1 }]);
      const ladder = (await a.req("GET", "/api/football/ladder")).body;
      expect(ladder.table.find((r: any) => r.username === winner.username)).toMatchObject({ rating: 1016, played: 1, won: 1 });

      // Rematch: both ask, both stakes held again on a new table
      ca.ws.send(JSON.stringify({ t: "rematch" }));
      cb.ws.send(JSON.stringify({ t: "rematch" }));
      const re = await ca.next((m) => m.t === "rematch");
      expect(re.code).not.toBe(code);
      expect((await winner.state()).balance).toBe(50000);
      expect((await loser.state()).balance).toBe(30000);
      const ra = await connect(a, re.code);
      expect((await ra.next((m) => m.t === "state")).seat).toBe(1); // the other player hosts the rematch
      ra.ws.send(JSON.stringify({ t: "resign" }));
      await ra.next((m) => m.t === "state" && m.status === "finished");
      expect((await b.state()).balance).toBe(w === 1 ? 70000 : 50000);
      for (const c of [ca, cb, cw, ra]) c.ws.close();
    }, 60000);

    it("picks at random when the clock runs out, and too many timeouts lose", async () => {
      const { shooterOf } = await sf();
      const { expireFootballClockForTest } = await fb();
      const a = new Player(), b = new Player();
      await a.register(); await b.register();
      const code = (await a.req("POST", "/api/football/tables", { stake: 1000 })).body.code;
      await b.req("POST", `/api/football/tables/${code}/join`);
      const ca = await connect(a, code), cb = await connect(b, code);
      for (let n = 0; n < 4; n++) {
        const s = await chooseState(ca, n);
        // A plays; B never does
        if (shooterOf(s.shootout) === 0) ca.ws.send(JSON.stringify({ t: "shoot", shot: { x: 0, y: 0.3, power: 0.5, curve: 0 } }));
        else ca.ws.send(JSON.stringify({ t: "dive", zone: 1 }));
        await ca.next((m) => m.t === "state" && m.committed[0]);
        expireFootballClockForTest(code);
        if (n === 3) break; // B's 4th time out in a row: he loses before the kick is taken
        const k = await cb.next((m) => m.t === "kick");
        expect(k.by === 1 ? typeof k.kick.shot.x : k.kick.dive).not.toBeUndefined(); // B was given a choice
        expireFootballClockForTest(code);
      }
      const end = await ca.next((m) => m.t === "state" && m.status === "finished");
      expect(end.result).toMatchObject({ winner: 0, reason: "timeouts", payout: 2000, ladder: { counted: false } });
      expect((await a.state()).balance).toBe(51000);
      expect((await b.state()).balance).toBe(49000);
      ca.ws.close(); cb.ws.close();
    }, 30000);

    it("refunds a cancelled table, refuses a seat you can't afford, and refunds after a restart", async () => {
      const a = new Player(), b = new Player();
      await a.register(); await b.register();
      expect((await a.req("POST", "/api/football/tables", { stake: 777 })).status).toBe(400);
      const t1 = (await a.req("POST", "/api/football/tables", { stake: 50000 })).body.code;
      expect((await a.state()).balance).toBe(0);
      await setBalance(b.username, 1000);
      expect((await b.req("POST", `/api/football/tables/${t1}/join`)).status).toBe(400);
      expect((await b.state()).balance).toBe(1000);
      expect((await b.req("GET", "/api/football/tables")).body.open.map((t: any) => t.code)).toContain(t1);
      expect((await b.req("POST", `/api/football/tables/${t1}/cancel`)).status).toBe(404); // not yours
      expect((await a.req("POST", `/api/football/tables/${t1}/cancel`)).status).toBe(200);
      expect((await a.state()).balance).toBe(50000);

      // A match in progress when the server restarts: both stakes back
      await setBalance(b.username, 50000);
      const t2 = (await a.req("POST", "/api/football/tables", { stake: 10000 })).body.code;
      await b.req("POST", `/api/football/tables/${t2}/join`);
      expect((await b.state()).balance).toBe(40000);
      const { recoverFootballMatches, dropAllFootballRoomsForTest } = await fb();
      dropAllFootballRoomsForTest();
      await recoverFootballMatches();
      await recoverFootballMatches(); // twice is harmless
      expect((await a.state()).balance).toBe(50000);
      expect((await b.state()).balance).toBe(50000);
      expect((await pool.query("select status from football_matches where code = $1", [t2])).rows[0].status).toBe("cancelled");
    });

    it("practice against the computer never pays (bar the daily first win) and checks every input", async () => {
      const { shooterOf } = await sf();
      const p = new Player();
      await p.register();
      expect((await p.req("POST", "/api/football/practice/kick", { dive: 1 })).status).toBe(404);
      let r = await p.req("POST", "/api/football/practice", { level: "easy", kit: "jp" });
      expect(r.body.practice).toMatchObject({ level: "easy", kit: "jp", winner: null });
      let practice = r.body.practice;
      let guard = 0;
      while (practice.winner === null && guard++ < 60) {
        const mine = shooterOf(practice.shootout) === 0;
        if (mine) expect((await p.req("POST", "/api/football/practice/kick", { dive: 2 })).status).toBe(400); // you're shooting
        r = await p.req("POST", "/api/football/practice/kick", mine ? { shot: { x: 0.6, y: 0.3, power: 0.6, curve: 0 } } : { dive: 1 });
        expect(r.status).toBe(200);
        expect(r.body.by).toBe(mine ? 0 : 1);
        practice = r.body.practice;
      }
      expect(practice.winner).not.toBeNull();
      expect((await p.req("POST", "/api/football/practice/kick", { dive: 1 })).status).toBe(409);
      expect((await p.state()).balance).toBe(50000); // Easy never pays
      expect((await pool.query("select count(*)::int n from game_plays g join users u on u.id = g.user_id where u.username = $1", [p.username])).rows[0].n).toBe(0);
    }, 30000);

    it("pays the weekly Penalty King prizes exactly once, only to players with enough matches", async () => {
      const { settleFootballWeek, footballTick } = await fb();
      const { previousWeek, weekOf } = await sf();
      const ps = [new Player(), new Player(), new Player(), new Player(), new Player()];
      for (const p of ps) await p.register();
      const ids = await Promise.all(ps.map(async (p) => (await p.req("GET", "/api/me")).body.id));
      const week = "2020-01-06";
      // ratings: p0 1100 (but only 4 games), p1 1080, p2 1050, p3 1020, p4 1010
      const rows: [number, number, number][] = [[1100, 4, 4], [1080, 6, 5], [1050, 7, 4], [1020, 5, 3], [1010, 9, 5]];
      for (const [i, [rating, played, won]] of rows.entries()) {
        await pool.query("insert into football_ratings (user_id, week, rating, played, won) values ($1, $2, $3, $4, $5)", [ids[i], week, rating, played, won]);
      }
      const first = await settleFootballWeek(week);
      expect(first?.paid).toBe(3);
      expect(first?.summary.map((w: any) => w.username)).toEqual([ps[1].username, ps[2].username, ps[3].username]);
      expect(await settleFootballWeek(week)).toBeNull(); // never twice
      const bal = await Promise.all(ps.map(async (p) => (await p.state()).balance));
      expect(bal).toEqual([50000, 1_050_000, 550_000, 300_000, 50000]);
      const deps = (await pool.query("select amount from deposits where method = 'football_weekly' and user_id = any($1) order by amount desc", [ids])).rows.map((r) => r.amount);
      expect(deps).toEqual([1_000_000, 500_000, 250_000]);
      const chat = (await pool.query("select text from chat_messages where user_id = 'system' and text like $1", [`%${week}%`])).rows;
      expect(chat.length).toBe(1);
      expect(chat[0].text).toContain(ps[1].username);
      await pool.query("delete from chat_messages where user_id = 'system' and text like $1", [`%${week}%`]); // keep the chat tests' room clean
      // The scheduler settles last week by itself, once
      const now = new Date();
      await footballTick(now);
      await footballTick(now);
      expect((await pool.query("select count(*)::int n from football_weeks where week = $1", [previousWeek(weekOf(now))])).rows[0].n).toBe(1);
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
      for (const e of r.body) expect(Object.keys(e).sort()).toEqual(["avatarUrl", "balance", "club", "maxStreak", "maxWin", "rank", "totalWins", "username"]);
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

    it("chat: needs a few games, no content filter (owner policy), rate limits, reports hide", async () => {
      const a = new Player(), b = new Player(), c = new Player(), d = new Player();
      for (const p of [a, b, c, d]) await p.register();
      expect((await a.req("POST", "/api/chat", { text: "xin chào" })).body.message).toBe("play_first");
      for (const p of [a, b, c, d]) await games(p.username, 5);
      const hi = await a.req("POST", "/api/chat", { text: "  xin   chào các bạn  " });
      expect(hi.status).toBe(200);
      expect(hi.body.text).toBe("xin chào các bạn");
      expect((await b.req("POST", "/api/chat", { text: "x".repeat(201) })).body.message).toBe("long");
      // Nothing is filtered or masked: words, links and numbers go through as typed
      const sw = await b.req("POST", "/api/chat", { text: "đm thua rồi, xem vnslot888.online 0912 345 678" });
      expect(sw.status).toBe(200);
      expect(sw.body.text).toBe("đm thua rồi, xem vnslot888.online 0912 345 678");
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
      // No monitoring: unreported messages aren't in the admin's view; a reported one is
      expect((await admin.req("GET", "/api/admin/community/chat")).body.messages.some((x: any) => x.id === m.body.id)).toBe(false);
      const witness = new Player(); await witness.register(); await games(witness.username, 5);
      await witness.req("POST", `/api/chat/${m.body.id}/report`);
      const view = await admin.req("GET", "/api/admin/community/chat");
      expect(view.body.messages.find((x: any) => x.id === m.body.id)).toMatchObject({ username: bad.username, reports: 1, deleted: false });

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
  describe("social: photos, profiles, private messages", () => {
    const games = (username: string, n: number) => pool.query("update users set games_played = $1 where username = $2", [n, username]);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const jpeg = (size = 2000) => { const b = Buffer.alloc(size, 7); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };
    const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 1)]);
    const webp = () => Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(300, 2)]);
    async function social(n: number, played = 5) {
      const ps = Array.from({ length: n }, () => new Player());
      for (const p of ps) { await p.register(); await games(p.username, played); }
      return ps;
    }

    it("sniffs real image bytes", async () => {
      const { sniffImage, safeAvatarUrl, initialOf } = await import("../shared/social");
      expect(sniffImage(jpeg())).toBe("image/jpeg");
      expect(sniffImage(png())).toBe("image/png");
      expect(sniffImage(webp())).toBe("image/webp");
      expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
      expect(sniffImage(Buffer.from("GIF89a......"))).toBeNull();
      expect(safeAvatarUrl("/api/avatar/0123456789abcdef0123456789abcdef")).toBe("/api/avatar/0123456789abcdef0123456789abcdef");
      expect(safeAvatarUrl("javascript:alert(1)")).toBeNull();
      expect(safeAvatarUrl("https://evil.example/x.png")).toBeNull();
      expect(initialOf("đức")).toBe("Đ");
    });

    it("photo upload: gate, bad bytes, size limit, serving with cache headers, removal", async () => {
      const [newbie] = await social(1, 1);
      const photo = (b: Buffer) => ({ photo: `data:image/jpeg;base64,${b.toString("base64")}` });
      expect((await newbie.req("POST", "/api/profile/photo", photo(jpeg()))).body.message).toBe("play_first");
      await games(newbie.username, 3);
      const me = (await newbie.req("GET", "/api/me")).body;

      const fake = await newbie.req("POST", "/api/profile/photo", { photo: Buffer.from("<html><script>alert(1)</script></html>").toString("base64") });
      expect(fake.status).toBe(400);
      expect(fake.body.message).toBe("Photo must be a JPEG, PNG or WebP image");
      expect((await newbie.req("POST", "/api/profile/photo", { photo: "not base64 !!" })).status).toBe(400);
      const big = await newbie.req("POST", "/api/profile/photo", photo(jpeg(151 * 1024)));
      expect(big.status).toBe(400);
      expect(big.body.message).toBe("Photo is too big (150 KB max)");
      const huge = await newbie.req("POST", "/api/profile/photo", photo(jpeg(400 * 1024)));
      expect(huge.status).toBe(413); // over the route's body limit
      // Other routes keep the small body limit
      expect((await newbie.req("POST", "/api/chat", { text: "x".repeat(150 * 1024) })).status).toBe(413);

      const ok = await newbie.req("POST", "/api/profile/photo", { photo: png().toString("base64") });
      expect(ok.status).toBe(200);
      expect(ok.body.profileImageUrl).toMatch(/^\/api\/avatar\/[0-9a-f]{32}$/);
      expect(ok.body.profileImageUrl).not.toContain(me.id); // never reveals the player's id
      expect((await newbie.req("GET", "/api/me")).body.profileImageUrl).toBe(ok.body.profileImageUrl);

      const res = await fetch(base + ok.body.profileImageUrl);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toContain("max-age=31536000");
      expect(Buffer.from(await res.arrayBuffer()).equals(png())).toBe(true);
      expect((await fetch(`${base}/api/avatar/nobody-here`)).status).toBe(404);
      // A new upload gets a new URL; the old one stops working
      const again = await newbie.req("POST", "/api/profile/photo", { photo: jpeg().toString("base64") });
      expect(again.body.profileImageUrl).not.toBe(ok.body.profileImageUrl);
      expect((await fetch(base + ok.body.profileImageUrl)).status).toBe(404);
      expect((await fetch(base + again.body.profileImageUrl)).headers.get("content-type")).toBe("image/jpeg");

      expect((await newbie.req("DELETE", "/api/profile/photo")).status).toBe(200);
      expect((await newbie.req("GET", "/api/me")).body.profileImageUrl).toBeNull();
      expect((await fetch(base + again.body.profileImageUrl)).status).toBe(404);
      const left = await pool.query("select count(*) from user_avatars where user_id = $1", [me.id]);
      expect(Number(left.rows[0].count)).toBe(0);

      // Muted players can't change their photo
      await pool.query("update users set muted_until = now() + interval '1 hour' where id = $1", [me.id]);
      expect((await newbie.req("POST", "/api/profile/photo", photo(jpeg()))).body.message).toBe("muted");
    });

    it("photo changes are limited per day", async () => {
      const [p] = await social(1);
      let last = 0;
      for (let i = 0; i < 11; i++) last = (await p.req("POST", "/api/profile/photo", { photo: jpeg().toString("base64") })).status;
      expect(last).toBe(429);
    });

    it("profile: public fields only, avatars in chat and the rich list", async () => {
      const [a, b] = await social(2);
      await a.req("POST", "/api/profile/photo", { photo: jpeg().toString("base64") });
      const prof = await b.req("GET", `/api/players/${a.username.toUpperCase()}/profile`);
      expect(prof.status).toBe(200);
      expect(Object.keys(prof.body).sort()).toEqual(["acceptsRequests", "admin", "avatarUrl", "biggestWin", "bio", "blockedByYou", "club", "country", "favGame", "favGames", "friendsCount", "friendsOnlyDm", "gamesPlayed", "languages", "league", "level", "memberSince", "online", "playStyle", "playing", "relation", "showcase", "stickers", "username", "you"]);
      expect(prof.body).toMatchObject({ username: a.username, gamesPlayed: 5, online: true, you: false, blockedByYou: false, league: null });
      expect(prof.body.avatarUrl).toMatch(/^\/api\/avatar\//);
      for (const k of ["balance", "email", "password", "firstName", "id", "mutedUntil"]) expect(prof.body).not.toHaveProperty(k);
      expect((await a.req("GET", `/api/players/${a.username}/profile`)).body.you).toBe(true);
      expect((await b.req("GET", "/api/players/no_such_player_x/profile")).status).toBe(404);
      expect((await new Player().req("GET", `/api/players/${a.username}/profile`)).status).toBe(401);

      const m = await a.req("POST", "/api/chat", { text: "ảnh mới nè" });
      expect(m.body.avatar).toBe(prof.body.avatarUrl);
      expect((await b.req("GET", "/api/chat")).body.messages.find((x: any) => x.id === m.body.id).avatar).toBe(prof.body.avatarUrl);
    });

    it("private messages: send, thread, unread counts, read ticks, filters", async () => {
      const [a, b, c] = await social(3);
      const [newbie] = await social(1, 0);
      expect((await newbie.req("POST", "/api/dm/send", { to: a.username, text: "hi" })).body.message).toBe("play_first");
      expect((await a.req("POST", "/api/dm/send", { to: a.username, text: "me" })).status).toBe(400);
      expect((await a.req("POST", "/api/dm/send", { to: "no_such_player_x", text: "hi" })).status).toBe(404);

      const m1 = await a.req("POST", "/api/dm/send", { to: b.username, text: "  chào   bạn  " });
      expect(m1.status).toBe(200);
      expect(m1.body).toMatchObject({ mine: true, text: "chào bạn", read: false });
      expect((await a.req("POST", "/api/dm/send", { to: b.username, text: "again" })).status).toBe(429);
      await sleep(1600);
      expect((await a.req("POST", "/api/dm/send", { to: b.username, text: "x".repeat(501) })).body.message).toBe("long");
      expect((await a.req("POST", "/api/dm/send", { to: b.username, sticker: "legend_rong" })).body.message).toBe("not_owned");
      const m2 = await a.req("POST", "/api/dm/send", { to: b.username, text: "y".repeat(500) });
      expect(m2.status).toBe(200);
      const raw = await c.req("POST", "/api/dm/send", { to: b.username, text: "zalo 0912345678, fuck" });
      expect(raw.body.text).toBe("zalo 0912345678, fuck"); // no content filter

      expect((await b.req("GET", "/api/dm/unread")).body.total).toBe(3);
      const convs = (await b.req("GET", "/api/dm/conversations")).body.conversations;
      expect(convs.map((x: any) => x.username)).toEqual([c.username, a.username]);
      expect(convs[1]).toMatchObject({ unread: 2, last: { mine: false } });

      const th = (await b.req("GET", `/api/dm/thread/${a.username}`)).body;
      expect(th.messages.map((x: any) => x.id)).toEqual([m1.body.id, m2.body.id]);
      expect(th.messages[0].mine).toBe(false);
      expect(th.cantMessage).toBe(false);
      expect((await b.req("GET", `/api/dm/thread/${a.username}?after=${m1.body.id}`)).body.messages.map((x: any) => x.id)).toEqual([m2.body.id]);

      expect((await a.req("GET", `/api/dm/thread/${b.username}`)).body.readUpTo).toBe(0);
      expect((await b.req("POST", "/api/dm/read", { with: a.username })).body.total).toBe(1);
      expect((await b.req("GET", "/api/dm/unread")).body.total).toBe(1);
      const seen = (await a.req("GET", `/api/dm/thread/${b.username}`)).body;
      expect(seen.readUpTo).toBe(m2.body.id);
      expect(seen.messages.every((x: any) => x.read)).toBe(true);
      // Nobody else can read the conversation or report into it
      expect((await c.req("GET", `/api/dm/thread/${a.username}`)).body.messages).toEqual([]);
      expect((await c.req("POST", `/api/dm/${m1.body.id}/report`)).status).toBe(404);
      // A banned sender's conversation is hidden, so it no longer counts as unread
      await pool.query("update users set banned = true where username = $1", [c.username]);
      expect((await b.req("GET", "/api/dm/unread")).body.total).toBe(0);
      expect((await b.req("GET", "/api/dm/conversations")).body.conversations.map((x: any) => x.username)).toEqual([a.username]);
    });

    it("blocking stops messages both ways without saying who blocked", async () => {
      const [a, b] = await social(2);
      expect((await a.req("POST", `/api/players/${b.username}/block`, { block: true })).body.blocked).toBe(true);
      const fromA = await a.req("POST", "/api/dm/send", { to: b.username, text: "hi" });
      const fromB = await b.req("POST", "/api/dm/send", { to: a.username, text: "hi" });
      expect([fromA.status, fromB.status]).toEqual([403, 403]);
      expect(fromA.body.message).toBe("Can't message this player");
      expect(fromB.body.message).toBe("Can't message this player");
      expect((await b.req("GET", `/api/dm/thread/${a.username}`)).body).toMatchObject({ cantMessage: true, blockedByYou: false });
      expect((await a.req("GET", `/api/players/${b.username}/profile`)).body.blockedByYou).toBe(true);
      await a.req("POST", `/api/players/${b.username}/block`, { block: false });
      expect((await b.req("POST", "/api/dm/send", { to: a.username, text: "hi again" })).status).toBe(200);
      expect((await a.req("POST", `/api/players/${a.username}/block`, { block: true })).status).toBe(400);
    });

    it("reports: the receiver reports a message, admins see it with context and act; profile reports too", async () => {
      const [admin, bad, victim, other] = await social(4);
      const aUser = (await admin.req("GET", "/api/me")).body;
      await pool.query("update users set is_admin = true where id = $1", [aUser.id]);
      const badUser = (await bad.req("GET", "/api/me")).body;
      const ids: number[] = [];
      for (let i = 0; i < 7; i++) {
        const [from, to] = i % 2 ? [victim, bad] : [bad, victim];
        if (i >= 2) await sleep(i % 2 ? 0 : 1600); // bad sends every other message: wait out the pace limit
        const r = await from.req("POST", "/api/dm/send", { to: to.username, text: `message ${i}` });
        expect(r.status).toBe(200);
        ids.push(r.body.id);
      }
      const target = ids[6]; // sent by bad
      expect((await bad.req("POST", `/api/dm/${target}/report`)).status).toBe(404); // not to you
      expect((await victim.req("POST", `/api/dm/${target}/report`, { reason: "rude" })).status).toBe(200);
      expect((await victim.req("POST", `/api/dm/${target}/report`, { reason: "rude" })).status).toBe(200); // once

      expect((await victim.req("GET", "/api/admin/social/reports")).status).toBe(403);
      const view = (await admin.req("GET", "/api/admin/social/reports")).body;
      const rep = view.messages.find((m: any) => m.id === target);
      expect(rep).toMatchObject({ fromName: bad.username, toName: victim.username, text: "message 6", reports: 1, reasons: ["rude"] });
      expect(rep.context.map((c: any) => c.id)).toEqual(ids.slice(1, 6));
      // Only reported messages are visible: no other route lists private conversations to admins
      expect(view.messages.some((m: any) => m.id === ids[0])).toBe(false);

      expect((await admin.req("POST", `/api/admin/social/dm/${target}`, { action: "delete" })).status).toBe(200);
      expect((await victim.req("GET", `/api/dm/thread/${bad.username}`)).body.messages.map((m: any) => m.id)).not.toContain(target);
      expect((await admin.req("GET", "/api/admin/social/reports")).body.messages.some((m: any) => m.id === target)).toBe(false);

      // Profile reports: grouped per player; removing the photo clears them
      await bad.req("POST", "/api/profile/photo", { photo: jpeg().toString("base64") });
      expect((await bad.req("POST", `/api/players/${bad.username}/report`, {})).status).toBe(400);
      await victim.req("POST", `/api/players/${bad.username}/report`, { reason: "not their photo" });
      await other.req("POST", `/api/players/${bad.username}/report`);
      const pr = (await admin.req("GET", "/api/admin/social/reports")).body.profiles.find((p: any) => p.userId === badUser.id);
      expect(pr).toMatchObject({ username: bad.username, reporters: 2, reasons: ["not their photo"] });
      expect(pr.avatarUrl).toMatch(/^\/api\/avatar\//);
      expect((await admin.req("POST", `/api/admin/social/photo/${badUser.id}/remove`)).status).toBe(200);
      expect((await bad.req("GET", "/api/me")).body.profileImageUrl).toBeNull();
      expect((await admin.req("GET", "/api/admin/social/reports")).body.profiles.some((p: any) => p.userId === badUser.id)).toBe(false);
      expect((await admin.req("GET", `/api/admin/players/${badUser.id}`)).body.avatarUrl).toBeNull();

      await other.req("POST", `/api/players/${victim.username}/report`);
      const vUser = (await victim.req("GET", "/api/me")).body;
      await admin.req("POST", `/api/admin/social/profile/${vUser.id}/dismiss`);
      expect((await admin.req("GET", "/api/admin/social/reports")).body.profiles.some((p: any) => p.userId === vUser.id)).toBe(false);

      const stats = (await admin.req("GET", "/api/admin/analytics?days=7&admins=1")).body;
      expect(stats.kpis.dmToday).toBeGreaterThanOrEqual(7);
    });

    it("deleting an account removes the photo, private messages, blocks and reports", async () => {
      const [gone, friend] = await social(2);
      const g = (await gone.req("GET", "/api/me")).body;
      await gone.req("POST", "/api/profile/photo", { photo: jpeg().toString("base64") });
      const m = await friend.req("POST", "/api/dm/send", { to: gone.username, text: "see you" });
      await gone.req("POST", `/api/dm/${m.body.id}/report`);
      await gone.req("POST", "/api/dm/send", { to: friend.username, text: "bye" });
      await gone.req("POST", `/api/players/${friend.username}/block`, { block: true });
      await friend.req("POST", `/api/players/${gone.username}/report`);
      expect((await gone.req("POST", "/api/user/delete", { password: gone.password })).status).toBe(200);
      const left = await pool.query(`select
        (select count(*) from user_avatars where user_id = $1) +
        (select count(*) from direct_messages where from_id = $1 or to_id = $1) +
        (select count(*) from user_blocks where blocker_id = $1 or blocked_id = $1) +
        (select count(*) from dm_reports where reporter_id = $1 or message_id = $2) +
        (select count(*) from profile_reports where user_id = $1 or reporter_id = $1) as n`, [g.id, m.body.id]);
      expect(Number(left.rows[0].n)).toBe(0);
      expect((await friend.req("GET", "/api/dm/conversations")).body.conversations).toEqual([]);
      expect((await friend.req("GET", "/api/dm/unread")).body.total).toBe(0);
    });
  });

  describe("Social 2.0: friends, notifications, reactions, feed, Lì Xì", () => {
    const games = (username: string, n: number) => pool.query("update users set games_played = $1 where username = $2", [n, username]);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const idOf = async (p: Player) => (await p.req("GET", "/api/me")).body.id as string;
    async function players(n: number, played = 12) {
      const ps = Array.from({ length: n }, () => new Player());
      for (const p of ps) { await p.register(); await games(p.username, played); }
      return ps;
    }
    async function befriend(a: Player, b: Player) {
      expect((await a.req("POST", "/api/friends/request", { username: b.username })).body.relation).toBe("sent");
      expect((await b.req("POST", "/api/friends/accept", { username: a.username })).body.relation).toBe("friends");
    }
    const notifs = async (p: Player) => (await p.req("GET", "/api/notifications")).body;
    const tick = async () => (await import("../server/friends")).socialTick();

    it("friend requests: send, decline, cancel, accept (also by asking back), remove; notifications both ways", async () => {
      const [a, b, c] = await players(3);
      const [newbie] = await players(1, 0);
      expect((await newbie.req("POST", "/api/friends/request", { username: a.username })).body.message).toBe("play_first");
      expect((await a.req("POST", "/api/friends/request", { username: a.username })).status).toBe(400);
      expect((await a.req("POST", "/api/friends/request", { username: "no_such_player_x" })).status).toBe(404);

      expect((await a.req("POST", "/api/friends/request", { username: b.username.toUpperCase() })).body.relation).toBe("sent");
      expect((await a.req("POST", "/api/friends/request", { username: b.username })).body.relation).toBe("sent"); // idempotent
      expect((await b.req("GET", `/api/players/${a.username}/profile`)).body.relation).toBe("received");
      expect((await a.req("GET", `/api/players/${b.username}/profile`)).body.relation).toBe("sent");
      const fb = (await b.req("GET", "/api/friends")).body;
      expect(fb.incoming.map((x: any) => x.username)).toEqual([a.username]);
      expect((await a.req("GET", "/api/friends")).body.outgoing.map((x: any) => x.username)).toEqual([b.username]);
      const nb = await notifs(b);
      expect(nb.unread).toBe(1);
      expect(nb.items[0]).toMatchObject({ kind: "friend_request", actor: { username: a.username }, read: false });

      // Decline, then a cancelled request disappears from the other bell
      await b.req("POST", "/api/friends/decline", { username: a.username });
      expect((await b.req("GET", "/api/friends")).body.incoming).toEqual([]);
      expect((await notifs(b)).unread).toBe(0);
      await sleep(900);
      expect((await a.req("POST", "/api/friends/request", { username: b.username })).status).toBe(200);
      await a.req("POST", "/api/friends/cancel", { username: b.username });
      expect((await b.req("GET", "/api/friends")).body.incoming).toEqual([]);
      expect((await notifs(b)).items.filter((n: any) => n.kind === "friend_request" && !n.read)).toEqual([]);
      expect((await b.req("POST", "/api/friends/accept", { username: a.username })).status).toBe(404);

      // Asking back accepts
      await sleep(900); // requests are paced
      expect((await a.req("POST", "/api/friends/request", { username: b.username })).body.relation).toBe("sent");
      expect((await b.req("POST", "/api/friends/request", { username: a.username })).body.relation).toBe("friends");
      const fa = (await a.req("GET", "/api/friends")).body;
      expect(fa.friends.map((x: any) => x.username)).toEqual([b.username]);
      expect(fa.friends[0]).toMatchObject({ online: true, gift: "too_new" });
      expect(fa.outgoing).toEqual([]);
      expect((await notifs(a)).items[0]).toMatchObject({ kind: "friend_accepted", actor: { username: b.username } });
      expect((await b.req("GET", `/api/players/${a.username}/profile`)).body).toMatchObject({ relation: "friends", friendsCount: 1 });

      // Accept the normal way too
      await c.req("POST", "/api/friends/request", { username: a.username });
      await a.req("POST", "/api/friends/accept", { username: c.username });
      expect((await a.req("GET", `/api/players/${a.username}/profile`)).body.friendsCount).toBe(2);
      await a.req("POST", "/api/friends/remove", { username: c.username });
      expect((await c.req("GET", "/api/friends")).body.friends).toEqual([]);

      // Search by name shows the relation, never blocked players
      const found = (await c.req("GET", `/api/friends/search?q=${a.username.slice(0, 6)}`)).body.players;
      expect(found.find((x: any) => x.username === a.username)).toMatchObject({ relation: "none" });
      expect((await c.req("GET", "/api/friends/search?q=%25")).body.players).toEqual([]); // no wildcard tricks
    });

    it("blocking ends the friendship and pending requests, and stops new ones; 'nobody' refuses requests", async () => {
      const [a, b, c] = await players(3);
      await befriend(a, b);
      await c.req("POST", "/api/friends/request", { username: a.username });
      await a.req("POST", `/api/players/${b.username}/block`, { block: true });
      await a.req("POST", `/api/players/${c.username}/block`, { block: true });
      expect((await a.req("GET", "/api/friends")).body).toMatchObject({ friends: [], incoming: [] });
      expect((await b.req("GET", "/api/friends")).body.friends).toEqual([]);
      expect((await notifs(a)).items.some((n: any) => n.kind === "friend_request")).toBe(false);
      expect((await b.req("POST", "/api/friends/request", { username: a.username })).status).toBe(403);
      expect((await a.req("POST", "/api/friends/request", { username: b.username })).status).toBe(403);
      expect((await b.req("GET", `/api/friends/search?q=${a.username}`)).body.players).toEqual([]);
      await a.req("POST", `/api/players/${b.username}/block`, { block: false });
      expect((await b.req("POST", "/api/friends/request", { username: a.username })).body.relation).toBe("sent");

      expect((await c.req("PUT", "/api/social/privacy", { requestsFrom: "nobody" })).body.requestsFrom).toBe("nobody");
      const r = await b.req("POST", "/api/friends/request", { username: c.username });
      expect(r.status).toBe(403);
      expect(r.body.message).toBe("This player isn't taking friend requests");
      expect((await b.req("GET", `/api/players/${c.username}/profile`)).body.acceptsRequests).toBe(false);
    });

    it("privacy is enforced by the server: friends-only messages, hidden presence, feed opt-out", async () => {
      const [a, b, c] = await players(3);
      await befriend(a, b);
      expect((await c.req("PUT", "/api/social/privacy", { dmFrom: "nobody" })).status).toBe(400);
      await a.req("PUT", "/api/social/privacy", { dmFrom: "friends" });
      const no = await c.req("POST", "/api/dm/send", { to: a.username, text: "hello stranger" });
      expect(no.status).toBe(403);
      expect(no.body.message).toBe("This player only accepts messages from friends");
      expect((await c.req("GET", `/api/dm/thread/${a.username}`)).body).toMatchObject({ cantMessage: true, cantReason: "This player only accepts messages from friends" });
      expect((await b.req("POST", "/api/dm/send", { to: a.username, text: "hi friend" })).status).toBe(200);
      expect((await a.req("POST", "/api/dm/send", { to: c.username, text: "I can still write first" })).status).toBe(200);

      // Hidden presence: offline to everyone, no game, even to friends
      expect((await c.req("GET", `/api/players/${a.username}/profile`)).body.online).toBe(true);
      await a.req("PUT", "/api/social/privacy", { showPresence: false });
      expect((await c.req("GET", `/api/players/${a.username}/profile`)).body).toMatchObject({ online: false, playing: null });
      expect((await b.req("GET", "/api/friends")).body.friends[0]).toMatchObject({ username: a.username, online: false, playing: null, join: null });
      expect((await b.req("GET", "/api/dm/conversations")).body.conversations[0]).toMatchObject({ username: a.username, online: false });
      expect((await a.req("GET", `/api/players/${a.username}/profile`)).body.online).toBe(true); // you always see yourself

      // Feed opt-out hides their wins, past and future
      const aid = await idOf(a);
      await pool.query("insert into game_plays (user_id, game, bet, payout) values ($1, 'slot', 1000, 80000)", [aid]);
      await tick();
      const mine = async (p: Player) => (await p.req("GET", "/api/feed")).body.items.filter((i: any) => i.user.username === a.username);
      expect((await mine(c)).map((i: any) => i.kind)).toContain("big_win");
      expect((await mine(c)).find((i: any) => i.kind === "big_win")).toMatchObject({ game: "slot", amount: 80000, bet: 1000 });
      await a.req("PUT", "/api/social/privacy", { showInFeed: false });
      expect(await mine(c)).toEqual([]);
      expect((await c.req("GET", "/api/social/settings")).body.privacy).toEqual({ dmFrom: "everyone", requestsFrom: "everyone", showPresence: true, showInFeed: true, hideCountry: false, showPhotos: false });
      expect((await a.req("GET", "/api/social/settings")).body.privacy).toEqual({ dmFrom: "friends", requestsFrom: "everyone", showPresence: false, showInFeed: false, hideCountry: false, showPhotos: false });
    });

    it("reactions: one of each emoji per player, toggled, counted, grouped in one notification, rate limited", async () => {
      const [a, b, c] = await players(3);
      const m = (await a.req("POST", "/api/chat", { text: "phản ứng đi nào" })).body;
      expect((await b.req("POST", `/api/chat/${m.id}/react`, { emoji: "💩" })).status).toBe(400);
      expect((await b.req("POST", "/api/chat/999999999/react", { emoji: "❤️" })).status).toBe(404);
      expect((await b.req("POST", `/api/chat/${m.id}/react`, { emoji: "❤️" })).body.on).toBe(true);
      expect((await b.req("POST", `/api/chat/${m.id}/react`, { emoji: "🔥" })).body.on).toBe(true);
      expect((await c.req("POST", `/api/chat/${m.id}/react`, { emoji: "❤️" })).body.on).toBe(true);
      const rb = (await b.req("GET", "/api/chat")).body.messages.find((x: any) => x.id === m.id).reactions;
      expect(rb).toEqual(expect.arrayContaining([{ e: "❤️", n: 2, mine: true }, { e: "🔥", n: 1, mine: true }]));
      const off = await b.req("POST", `/api/chat/${m.id}/react`, { emoji: "❤️" });
      expect(off.body.on).toBe(false);
      expect(off.body.reactions).toEqual(expect.arrayContaining([{ e: "❤️", n: 1, mine: false }]));
      const na = (await notifs(a)).items.filter((n: any) => n.kind === "reaction");
      expect(na.length).toBe(1);
      expect(na[0].data).toMatchObject({ scope: "chat", messageId: m.id, total: 3 });
      expect(na[0].data.actors).toEqual(expect.arrayContaining([b.username, c.username]));

      // Private messages: only the two players can react
      const d = (await a.req("POST", "/api/dm/send", { to: b.username, text: "riêng tư" })).body;
      expect((await c.req("POST", `/api/dm/${d.id}/react`, { emoji: "😂" })).status).toBe(404);
      expect((await b.req("POST", `/api/dm/${d.id}/react`, { emoji: "😂" })).body.on).toBe(true);
      expect((await a.req("GET", `/api/dm/thread/${b.username}`)).body.messages.find((x: any) => x.id === d.id).reactions).toEqual([{ e: "😂", n: 1, mine: false }]);

      let last = 0;
      for (let i = 0; i < 45; i++) last = (await c.req("POST", `/api/chat/${m.id}/react`, { emoji: "👍" })).status;
      expect(last).toBe(429);
    });

    it("mentions notify real players only, never across a block; replies quote visible messages only", async () => {
      const [a, b, c, admin] = await players(4);
      await pool.query("update users set is_admin = true where username = $1", [admin.username]);
      await c.req("POST", `/api/players/${a.username}/block`, { block: true });
      const m = await a.req("POST", "/api/chat", { text: `chào @${b.username} và @${c.username} và @khong_co_ai_ten_nay và @${a.username}`, mentions: [b.username] });
      expect(m.status).toBe(200);
      await sleep(200);
      const nb = (await notifs(b)).items.filter((n: any) => n.kind === "mention");
      expect(nb.length).toBe(1);
      expect(nb[0]).toMatchObject({ actor: { username: a.username }, data: { scope: "chat", messageId: m.body.id } });
      expect((await notifs(c)).items.some((n: any) => n.kind === "mention")).toBe(false);
      expect((await notifs(a)).items.some((n: any) => n.kind === "mention")).toBe(false);

      // Replies
      const r = await b.req("POST", "/api/chat", { text: "trả lời nè", replyTo: m.body.id });
      expect(r.status).toBe(200);
      expect(r.body.reply).toMatchObject({ id: m.body.id, username: a.username });
      await sleep(200);
      expect((await notifs(a)).items.find((n: any) => n.kind === "reply")).toMatchObject({ actor: { username: b.username }, data: { messageId: r.body.id } });
      expect((await b.req("GET", "/api/chat")).body.messages.find((x: any) => x.id === r.body.id).reply.id).toBe(m.body.id);
      expect((await c.req("POST", "/api/chat", { text: "không có", replyTo: 999999999 })).body.message).toBe("That message can't be answered");
      await admin.req("POST", `/api/admin/community/chat/${m.body.id}`, { deleted: true });
      expect((await c.req("POST", "/api/chat", { text: "đã xoá rồi", replyTo: m.body.id })).status).toBe(400);
      // A reply to a removed message no longer shows what it said
      expect((await c.req("GET", "/api/chat")).body.messages.find((x: any) => x.id === r.body.id).reply).toMatchObject({ id: m.body.id, text: null });

      // Private replies: only to a message in the same conversation
      const d1 = (await a.req("POST", "/api/dm/send", { to: b.username, text: "câu hỏi" })).body;
      const d2 = await b.req("POST", "/api/dm/send", { to: a.username, text: "câu trả lời", replyTo: d1.id });
      expect(d2.body.reply).toMatchObject({ id: d1.id, mine: false, text: "câu hỏi" });
      expect((await admin.req("POST", "/api/dm/send", { to: b.username, text: "lấy trộm", replyTo: d1.id })).status).toBe(400);
    });

    it("daily friend Lì Xì: made by the game, limits enforced, sender's balance untouched", async () => {
      const [a, b] = await players(2);
      await befriend(a, b);
      const send = (from: Player, to: Player) => from.req("POST", "/api/friends/gift", { username: to.username });
      expect((await send(a, b)).body.message).toBe("You can send Lì Xì after being friends for a day");
      await pool.query("update friendships set created_at = now() - interval '25 hours'");
      await games(a.username, 9);
      expect((await send(a, b)).body.message).toBe("Play 10 games before sending Lì Xì");
      await games(a.username, 10);
      await games(b.username, 3);
      expect((await send(a, b)).body.message).toBe("Your friend needs to play 10 games first");
      await games(b.username, 10);
      const [stranger] = await players(1);
      expect((await send(stranger, b)).status).toBe(403);

      const before = (await a.req("GET", "/api/me")).body.balance;
      expect((await send(a, b)).status).toBe(200);
      expect((await a.req("GET", "/api/me")).body.balance).toBe(before); // the sender pays nothing
      expect((await send(a, b)).body.message).toBe("You already sent Lì Xì to this friend today");
      expect((await a.req("GET", "/api/friends")).body.friends[0].gift).toBe("sent_today");

      const gift = (await notifs(b)).items.find((n: any) => n.kind === "gift");
      expect(gift).toMatchObject({ actor: { username: a.username }, data: { amount: 5000, claimed: false } });
      const bBefore = (await b.req("GET", "/api/me")).body.balance;
      expect((await a.req("POST", `/api/friends/gift/${gift.data.giftId}/claim`)).status).toBe(409); // not yours
      const claim = await b.req("POST", `/api/friends/gift/${gift.data.giftId}/claim`);
      expect(claim.body).toMatchObject({ amount: 5000, balance: bBefore + 5000 });
      expect((await b.req("POST", `/api/friends/gift/${gift.data.giftId}/claim`)).status).toBe(409);
      expect((await notifs(b)).items.find((n: any) => n.kind === "gift").data.claimed).toBe(true);
      const bid = await idOf(b);
      const dep = await pool.query("select amount, method from deposits where user_id = $1 and method = 'friend_gift'", [bid]);
      expect(dep.rows).toEqual([{ amount: 5000, method: "friend_gift" }]);
      expect((await a.req("GET", "/api/me")).body.balance).toBe(before);
      const { BONUS_NAMES } = await import("../shared/analytics");
      expect(BONUS_NAMES.friend_gift).toBeTruthy();

      // At most 10 received a day: the 11th friend is politely refused
      const senders = await players(10);
      const ids = await Promise.all(senders.map(idOf));
      for (const id of ids) {
        const [x, y] = id < bid ? [id, bid] : [bid, id];
        await pool.query("insert into friendships (user_a, user_b, created_at) values ($1, $2, now() - interval '2 days')", [x, y]);
      }
      const results = await Promise.all(senders.map((s) => send(s, b)));
      expect(results.filter((r) => r.status === 200).length).toBe(9); // a's gift already counts
      const refused = results.find((r) => r.status !== 200)!;
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe("Your friend has received all the Lì Xì they can today");
      const n = await pool.query("select count(*)::int as n from friend_gifts where to_id = $1", [bid]);
      expect(n.rows[0].n).toBe(10);
      const stats = (await (async () => { const adm = (await players(1))[0]; await pool.query("update users set is_admin = true where username = $1", [adm.username]); return (await adm.req("GET", "/api/admin/analytics?days=7&admins=1")).body; })());
      expect(stats.kpis.friendGiftsToday).toBeGreaterThanOrEqual(10);
      expect(stats.kpis.friendships).toBeGreaterThanOrEqual(11);
    });

    it("levels come from coins staked; level-ups reach the feed; profiles show bio, level and showcase", async () => {
      const [a, b] = await players(2);
      await befriend(a, b);
      const aid = await idOf(a);
      expect((await b.req("GET", `/api/players/${a.username}/profile`)).body.level).toMatchObject({ level: 1, xp: 0 });
      await pool.query("insert into game_plays (user_id, game, bet, payout) values ($1, 'roulette', 3000000, 0)", [aid]);
      await tick();
      const lv = (await b.req("GET", `/api/players/${a.username}/profile`)).body.level;
      expect(lv).toMatchObject({ level: 8, xp: 3000 });
      const feed = (await b.req("GET", "/api/feed?scope=friends")).body.items;
      expect(feed.find((i: any) => i.kind === "level_up" && i.user.username === a.username)).toMatchObject({ level: 8 });
      expect(feed.find((i: any) => i.kind === "friends")).toBeTruthy();
      expect(feed.some((i: any) => i.kind === "joined" && i.user.username === a.username)).toBe(true);
      expect((await b.req("GET", "/api/chat")).body.messages).toBeDefined();

      // About me: not filtered, 300 characters at most
      expect((await a.req("PUT", "/api/social/profile", { bio: "x".repeat(301) })).body.message).toBe("long");
      expect((await a.req("PUT", "/api/social/profile", { favGame: "poker" })).status).toBe(400);
      expect((await a.req("PUT", "/api/social/profile", { showcase: ["no_hu"] })).body.message).toBe("You haven't earned that badge");
      await pool.query("insert into achievements (user_id, badge_id, badge_name, description, icon) values ($1, 'first_win', 'First Win', 'x', 'star')", [aid]);
      const ok = await a.req("PUT", "/api/social/profile", { bio: "  Thích   quay hũ 🐉 ", favGame: "slot", showcase: ["first_win"] });
      expect(ok.body).toMatchObject({ bio: "Thích quay hũ 🐉", favGame: "slot", showcase: ["first_win"] });
      const prof = (await b.req("GET", `/api/players/${a.username}/profile`)).body;
      expect(prof).toMatchObject({ bio: "Thích quay hũ 🐉", favGame: "slot", showcase: ["first_win"], friendsCount: 1 });
      for (const k of ["balance", "email", "firstName", "lastName", "password", "id"]) expect(prof).not.toHaveProperty(k);

      // Reported bios reach the admin, who can clear them
      const [admin] = await players(1);
      await pool.query("update users set is_admin = true where username = $1", [admin.username]);
      await b.req("POST", `/api/players/${a.username}/report`, { reason: "bio" });
      const rep = (await admin.req("GET", "/api/admin/social/reports")).body.profiles.find((p: any) => p.userId === aid);
      expect(rep.bio).toBe("Thích quay hũ 🐉");
      expect((await b.req("POST", `/api/admin/social/bio/${aid}/clear`)).status).toBe(403);
      await admin.req("POST", `/api/admin/social/bio/${aid}/clear`);
      expect((await b.req("GET", `/api/players/${a.username}/profile`)).body.bio).toBeNull();
      expect((await admin.req("GET", "/api/admin/social/reports")).body.profiles.some((p: any) => p.userId === aid)).toBe(false);
    });

    it("friends leaderboard ranks me and my friends by this week's biggest win", async () => {
      const [a, b, c] = await players(3);
      await befriend(a, b);
      const [aid, bid, cid] = await Promise.all([a, b, c].map(idOf));
      await pool.query("insert into game_plays (user_id, game, bet, payout) values ($1, 'slot', 1000, 5000), ($1, 'slot', 1000, 3000), ($2, 'slot', 1000, 9000), ($3, 'slot', 1000, 900000)", [aid, bid, cid]);
      const rows = (await a.req("GET", "/api/leaderboard/friends")).body.rows;
      expect(rows.map((r: any) => r.username)).toEqual([b.username, a.username]);
      expect(rows[1]).toMatchObject({ you: true, biggestWin: 5000, coinsWon: 6000 });
      expect(rows[0]).not.toHaveProperty("balance");
    });

    it("the social socket: anonymous refused; pushes messages, typing, seen and notifications", async () => {
      const { WebSocket } = await import("ws");
      const url = base.replace("http", "ws") + "/ws/social";
      const anon = await new Promise<number>((resolve) => {
        const ws = new WebSocket(url);
        ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
        ws.on("open", () => resolve(200));
        ws.on("error", () => {});
      });
      expect(anon).toBe(401);

      const [a, b] = await players(2);
      const open = async (p: Player) => {
        const ws = new WebSocket(url, { headers: { Cookie: p.cookie } });
        const msgs: any[] = [];
        ws.on("message", (m) => msgs.push(JSON.parse(String(m))));
        await new Promise<void>((resolve, reject) => { ws.on("open", () => resolve()); ws.on("error", reject); });
        const wait = async (pred: (m: any) => boolean) => {
          for (let i = 0; i < 100; i++) { const f = msgs.find(pred); if (f) return f; await sleep(30); }
          throw new Error("no message: " + JSON.stringify(msgs));
        };
        return { ws, msgs, wait };
      };
      const sa = await open(a), sb = await open(b);
      expect((await sb.wait((m) => m.t === "unread"))).toMatchObject({ dm: 0, notif: 0 });

      const sent = (await a.req("POST", "/api/dm/send", { to: b.username, text: "qua socket" })).body;
      const got = await sb.wait((m) => m.t === "dm");
      expect(got).toMatchObject({ with: a.username, m: { id: sent.id, text: "qua socket", mine: false } });
      await sb.wait((m) => m.t === "unread" && m.dm === 1);

      sb.ws.send(JSON.stringify({ t: "typing", to: a.username }));
      expect(await sa.wait((m) => m.t === "typing")).toEqual({ t: "typing", from: b.username });

      await b.req("POST", "/api/dm/read", { with: a.username });
      expect(await sa.wait((m) => m.t === "seen")).toEqual({ t: "seen", by: b.username, upTo: sent.id });

      await a.req("POST", "/api/friends/request", { username: b.username });
      expect((await sb.wait((m) => m.t === "notif")).n).toMatchObject({ kind: "friend_request", actor: { username: a.username } });
      await b.req("POST", "/api/friends/accept", { username: a.username });
      sb.ws.send(JSON.stringify({ t: "presence", route: "/slot-777" }));
      expect(await sa.wait((m) => m.t === "presence" && m.playing === "slot777")).toMatchObject({ username: b.username, online: true });
      expect((await a.req("GET", "/api/friends")).body.friends[0]).toMatchObject({ username: b.username, online: true, playing: "slot777" });

      const chat = (await a.req("POST", "/api/chat", { text: "xin chào cả nhà" })).body;
      expect((await sb.wait((m) => m.t === "chat")).m).toMatchObject({ id: chat.id, username: a.username });

      // A friend at a card table with a free seat can be joined
      const t = await a.req("POST", "/api/cards/tables", { mode: "house", stake: 1000 });
      const fb = (await b.req("GET", "/api/friends")).body.friends[0];
      expect(fb.join).toEqual({ kind: "cards", href: `/ban-bai?table=${t.body.code}` });
      sa.ws.close(); sb.ws.close();
    });

    it("deleting an account removes friendships, requests, notifications, reactions, feed, gifts and settings", async () => {
      const [gone, f1, f2] = await players(3);
      await befriend(gone, f1);
      await gone.req("POST", "/api/friends/request", { username: f2.username });
      await f2.req("PUT", "/api/social/privacy", { showInFeed: true });
      await gone.req("PUT", "/api/social/profile", { bio: "tạm biệt" });
      await pool.query("update friendships set created_at = now() - interval '2 days'");
      expect((await f1.req("POST", "/api/friends/gift", { username: gone.username })).status).toBe(200);
      const m = (await f1.req("POST", "/api/chat", { text: "của f1" })).body;
      await gone.req("POST", `/api/chat/${m.id}/react`, { emoji: "🔥" });
      const g2 = (await gone.req("POST", "/api/chat", { text: "của gone" })).body;
      await f2.req("POST", `/api/chat/${g2.id}/react`, { emoji: "❤️" });
      const gid = await idOf(gone);
      await pool.query("insert into game_plays (user_id, game, bet, payout) values ($1, 'slot', 1000, 99000)", [gid]);
      await tick();
      const count = async () => Number((await pool.query(`select
        (select count(*) from friendships where user_a = $1 or user_b = $1) +
        (select count(*) from friend_requests where from_id = $1 or to_id = $1) +
        (select count(*) from notifications where user_id = $1 or actor_id = $1) +
        (select count(*) from message_reactions where user_id = $1 or (scope = 'chat' and message_id = $2)) +
        (select count(*) from feed_items where user_id = $1 or other_id = $1) +
        (select count(*) from friend_gifts where from_id = $1 or to_id = $1) +
        (select count(*) from user_social where user_id = $1) as n`, [gid, g2.id])).rows[0].n);
      expect(await count()).toBeGreaterThan(8);
      expect((await gone.req("POST", "/api/user/delete", { password: gone.password })).status).toBe(200);
      expect(await count()).toBe(0);
      expect((await f1.req("GET", "/api/friends")).body.friends).toEqual([]);
      expect((await f1.req("GET", "/api/notifications")).body.items.some((n: any) => n.actor === null && n.kind !== "reaction")).toBe(false);
    });
  });

  describe("Social 3: invites, clubs, quests, Talk, matches, photos, lounge, profiles", () => {
    const games = (username: string, n: number) => pool.query("update users set games_played = $1 where username = $2", [n, username]);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const idOf = async (p: Player) => (await p.req("GET", "/api/me")).body.id as string;
    async function players(n: number, played = 12) {
      const ps = Array.from({ length: n }, () => new Player());
      for (const p of ps) { await p.register(); await games(p.username, played); }
      return ps;
    }
    async function befriend(a: Player, b: Player) {
      expect((await a.req("POST", "/api/friends/request", { username: b.username })).body.relation).toBe("sent");
      expect((await b.req("POST", "/api/friends/accept", { username: a.username })).body.relation).toBe("friends");
    }
    const notifs = async (p: Player) => (await p.req("GET", "/api/notifications")).body.items as any[];
    const balanceOf = async (p: Player) => Number((await pool.query("select balance from users where username = $1", [p.username])).rows[0].balance);
    const play = (uid: string, game: string, bet: number, payout: number, at = "now()") =>
      pool.query(`insert into game_plays (user_id, game, bet, payout, created_at) values ($1, $2, $3, $4, ${at}) returning id`, [uid, game, bet, payout]).then((r) => r.rows[0].id as number);

    it("invites: the contract, a bell with Join and a challenge card in the DM thread", async () => {
      const [a, b, c] = await players(3);
      const send = (p: Player, body: any) => p.req("POST", "/api/invites", body);
      expect((await send(a, { to: b.username, game: "chess", path: "/pool" })).status).toBe(400);
      for (const path of ["//evil.com", "/\\evil", "https://evil.com", "/phi-tieu?table=AB12", "/poolx", "/pool/../admin", "pool"]) {
        expect((await send(a, { to: b.username, game: "pool", path })).status).toBe(400);
      }
      expect((await send(a, { to: "no_such_player_zz", game: "pool", path: "/pool" })).status).toBe(404);
      expect((await send(a, { to: a.username, game: "pool", path: "/pool" })).status).toBe(400);
      const ok = await send(a, { to: b.username, game: "pool", path: "/pool?table=AB12" });
      expect(ok).toMatchObject({ status: 200, body: { ok: true } });
      const n = (await notifs(b)).find((x) => x.kind === "invite");
      expect(n).toMatchObject({ actor: { username: a.username }, data: { game: "pool", path: "/pool?table=AB12" } });
      const thread = (await b.req("GET", `/api/dm/thread/${a.username}`)).body;
      expect(thread.messages.at(-1)).toMatchObject({ mine: false, text: null, card: { kind: "invite", game: "pool", path: "/pool?table=AB12" } });
      const conv = (await b.req("GET", "/api/dm/conversations")).body.conversations.find((x: any) => x.username === a.username);
      expect(conv.last.card).toMatchObject({ game: "pool" });
      // Rate limited: straight away again, and the same player again soon
      expect((await send(a, { to: c.username, game: "cards", path: "/ban-bai?table=XY99" })).status).toBe(429);
      await sleep(3100);
      expect((await send(a, { to: b.username, game: "darts", path: "/phi-tieu?table=AB12" })).status).toBe(429);
      expect((await send(a, { to: c.username, game: "football", path: "/da-bong" })).status).toBe(200);
      // Blocks
      await c.req("POST", `/api/players/${a.username}/block`, { block: true });
      await sleep(3100);
      expect((await send(a, { to: c.username, game: "cards", path: "/ban-bai" })).status).toBe(403);
      // Friends-only messages: strangers can't invite; friends can, even with friend requests off
      const [d, e] = await players(2);
      await befriend(d, b);
      await b.req("PUT", "/api/social/privacy", { dmFrom: "friends", requestsFrom: "nobody" });
      expect((await send(e, { to: b.username, game: "pool", path: "/pool" })).status).toBe(403);
      expect((await send(d, { to: b.username, game: "pool", path: "/pool" })).status).toBe(200);
      // Brand-new accounts can't send invites
      const newbie = new Player(); await newbie.register();
      expect((await send(newbie, { to: b.username, game: "pool", path: "/pool" })).body.message).toBe("play_first");
    });

    it("clubs: the fee is a sink, one club each, names checked, 30 members, roles", async () => {
      const [owner, m1, m2, m3, rich] = await players(5);
      await setBalance(owner.username, 60_000);
      const make = (p: Player, body: any) => p.req("POST", "/api/clubs", { emblem: "🐉", color: "#f59e0b", tag: "RONG", open: true, ...body });
      const n = `Rồng ${Date.now() % 100000}`;
      expect((await make(owner, { name: "ab" })).status).toBe(400);
      expect((await make(owner, { name: "<b>club</b>" })).status).toBe(400);
      expect((await make(owner, { name: n, emblem: "💩" })).status).toBe(400);
      expect((await make(owner, { name: n, color: "red" })).status).toBe(400);
      const ok = await make(owner, { name: n, description: "Chào mừng!" });
      expect(ok.status).toBe(200);
      expect(ok.body.balance).toBe(10_000);
      expect(await balanceOf(owner)).toBe(10_000);
      const oid = await idOf(owner);
      expect((await pool.query("select amount from deposits where user_id = $1 and method = 'club_fee'", [oid])).rows.map((r) => Number(r.amount))).toEqual([-50_000]);
      const id = ok.body.id;
      await setBalance(owner.username, 200_000);
      expect((await make(owner, { name: `${n}x` })).status).toBe(409); // one club each
      await setBalance(rich.username, 200_000);
      expect((await make(rich, { name: n.toUpperCase() })).status).toBe(409); // name taken (any case)
      await setBalance(m1.username, 1000);
      expect((await make(m1, { name: "Nghèo quá" })).status).toBe(400); // not enough coins
      expect(await balanceOf(m1)).toBe(1000);
      // Join, roles
      for (const p of [m1, m2, m3]) expect((await p.req("POST", `/api/clubs/${id}/join`)).body.joined).toBe(true);
      expect((await m1.req("POST", `/api/clubs/${id}/join`)).status).toBe(409);
      const act = (p: Player, action: string, who: Player) => p.req("POST", `/api/clubs/${id}/members`, { action, username: who.username });
      expect((await act(m1, "kick", m2)).status).toBe(403);
      expect((await act(m1, "promote", m2)).status).toBe(403);
      expect((await act(owner, "promote", m1)).status).toBe(200);
      expect((await act(m1, "kick", owner)).status).toBe(403);
      expect((await act(m1, "promote", m2)).status).toBe(403); // officers can't promote
      expect((await act(m1, "kick", m3)).status).toBe(200);    // officers remove members
      expect((await m3.req("POST", `/api/clubs/${id}/join`)).status).toBe(403); // kicked: not straight back
      expect((await notifs(m3)).some((x) => x.kind === "club" && x.data.action === "kicked")).toBe(true);
      const view = (await m2.req("GET", `/api/clubs/${id}`)).body;
      expect(view.members.map((x: any) => [x.username, x.role])).toEqual([[owner.username, "owner"], [m1.username, "officer"], [m2.username, "member"]]);
      expect(view.me.role).toBe("member");
      // The tag shows on the profile, the rich list and in chat
      expect((await rich.req("GET", `/api/players/${m2.username}/profile`)).body.club).toMatchObject({ id, tag: "RONG", name: n, role: "member" });
      // The owner can't just walk out; hands over first
      expect((await owner.req("POST", `/api/clubs/${id}/leave`)).status).toBe(409);
      expect((await act(owner, "transfer", m2)).status).toBe(200);
      const v2 = (await owner.req("GET", `/api/clubs/${id}`)).body;
      expect(v2.members.find((x: any) => x.username === m2.username).role).toBe("owner");
      expect(v2.me.role).toBe("officer");
      expect((await owner.req("POST", `/api/clubs/${id}/leave`)).status).toBe(200);
      // Full at 30
      for (let i = 0; i < 27; i++) {
        const u = (await pool.query("insert into users (username, password) values ($1, 'x') returning id", [`fill${Date.now() % 1e6}_${i}`])).rows[0].id;
        await pool.query("insert into club_members (user_id, club_id, role) values ($1, $2, 'member')", [u, id]);
      }
      await (await import("../server/clubs")).loadClubs();
      const count = Number((await pool.query("select count(*) from club_members where club_id = $1", [id])).rows[0].count);
      expect(count).toBe(29);
      const [x1, x2] = await players(2);
      expect((await x1.req("POST", `/api/clubs/${id}/join`)).status).toBe(200);
      expect((await x2.req("POST", `/api/clubs/${id}/join`)).body.message).toBe("This club is full");
      // Approval clubs: a request, then the leader decides
      await setBalance(rich.username, 200_000);
      const c2 = (await make(rich, { name: `Kín ${Date.now() % 100000}`, tag: "KIN", open: false })).body.id;
      expect((await x2.req("POST", `/api/clubs/${c2}/join`)).body).toMatchObject({ joined: false, requested: true });
      expect((await notifs(rich)).some((x) => x.kind === "club" && x.data.action === "request")).toBe(true);
      expect((await rich.req("GET", `/api/clubs/${c2}`)).body.requests.map((r: any) => r.username)).toEqual([x2.username]);
      expect((await rich.req("POST", `/api/clubs/${c2}/requests`, { username: x2.username, accept: true })).status).toBe(200);
      expect((await x2.req("GET", `/api/clubs/${c2}`)).body.me.role).toBe("member");
      // Disband: only the owner
      expect((await x2.req("POST", `/api/clubs/${c2}/disband`)).status).toBe(403);
      expect((await rich.req("POST", `/api/clubs/${c2}/disband`)).status).toBe(200);
      expect((await x2.req("GET", `/api/clubs/${c2}`)).status).toBe(404);
      expect((await rich.req("GET", `/api/players/${x2.username}/profile`)).body.club).toBeNull();
      // Admin can rename and disband
      const adm = (await players(1))[0];
      await pool.query("update users set is_admin = true where username = $1", [adm.username]);
      expect((await adm.req("POST", `/api/admin/clubs/${id}/rename`, { name: "Đã đổi tên" })).status).toBe(200);
      expect((await adm.req("GET", "/api/admin/clubs")).body.clubs.find((c: any) => c.id === id).name).toBe("Đã đổi tên");
      expect((await m2.req("GET", "/api/admin/clubs")).status).toBe(403);
      expect((await adm.req("POST", `/api/admin/clubs/${id}/disband`)).status).toBe(200);
      expect((await m2.req("GET", "/api/clubs")).body.mine).toBeNull();
    });

    it("club chat: members only, same pace limits as the public chat, reports reach the admin", async () => {
      const [owner, a, b, c, out] = await players(5);
      await setBalance(owner.username, 100_000);
      const id = (await owner.req("POST", "/api/clubs", { name: `Chat ${Date.now() % 100000}`, tag: "CHAT", emblem: "🔥", color: "#ef4444" })).body.id;
      for (const p of [a, b, c]) await p.req("POST", `/api/clubs/${id}/join`);
      const say = (p: Player, body: any) => p.req("POST", `/api/clubs/${id}/chat`, body);
      expect((await say(out, { text: "chào" })).status).toBe(403);
      expect((await out.req("GET", `/api/clubs/${id}/chat`)).status).toBe(403);
      expect((await say(owner, { text: "x".repeat(201) })).body.message).toBe("long");
      expect((await say(owner, { text: "" })).body.message).toBe("empty");
      const m = await say(owner, { text: "Chào cả hội!" });
      expect(m.status).toBe(200);
      expect((await say(owner, { text: "nữa nè" })).body.message).toBe("slow_down");
      const list = (await a.req("GET", `/api/clubs/${id}/chat`)).body.messages;
      expect(list.map((x: any) => x.text)).toEqual(["Chào cả hội!"]);
      expect((await out.req("POST", `/api/clubs/chat/${m.body.id}/report`)).status).toBe(404);
      for (const p of [a, b, c]) expect((await p.req("POST", `/api/clubs/chat/${m.body.id}/report`)).status).toBe(200);
      expect((await a.req("GET", `/api/clubs/${id}/chat`)).body.messages).toEqual([]);
      const adm = (await players(1))[0];
      await pool.query("update users set is_admin = true where username = $1", [adm.username]);
      const rep = (await adm.req("GET", "/api/admin/social3/reports")).body.clubMessages.find((x: any) => x.id === m.body.id);
      expect(rep).toMatchObject({ reports: 3, deleted: true, username: owner.username });
      expect((await adm.req("POST", `/api/admin/clubs/messages/${m.body.id}`, { hidden: false })).status).toBe(200);
      expect((await a.req("GET", `/api/clubs/${id}/chat`)).body.messages.length).toBe(1);
      // Chat messages carry the club tag
      await sleep(3100);
      const pub = (await owner.req("POST", "/api/chat", { text: "xin chào mọi người" })).body;
      expect(pub.club).toMatchObject({ id, tag: "CHAT", emblem: "🔥" });
    });

    it("the weekly club reward: top three clubs' active members, paid exactly once", async () => {
      const ps = await players(4);
      const ids = await Promise.all(ps.map(idOf));
      const clubsMod = await import("../server/clubs");
      const { vnWeekStart } = await import("../shared/friends");
      // Two weeks back, so the startup scheduler (which pays last week) hasn't touched it
      const week = new Date(vnWeekStart(new Date()).getTime() - 14 * 86_400_000);
      const inWeek = `'${new Date(week.getTime() + 3 * 86_400_000).toISOString()}'::timestamp`;
      const mk = async (p: Player, uid: string, name: string) => {
        await setBalance(p.username, 100_000);
        const id = (await p.req("POST", "/api/clubs", { name, tag: "WK", emblem: "⭐", color: "#3b82f6" })).body.id;
        await pool.query("update club_members set joined_at = $2 where user_id = $1", [uid, new Date(week.getTime() - 86_400_000)]);
        return id;
      };
      const s = Date.now() % 100000;
      const c1 = await mk(ps[0], ids[0], `Tuần A ${s}`);
      await ps[1].req("POST", `/api/clubs/${c1}/join`);
      await pool.query("update club_members set joined_at = $2 where user_id = $1", [ids[1], new Date(week.getTime() - 86_400_000)]);
      const c2 = await mk(ps[2], ids[2], `Tuần B ${s}`);
      await mk(ps[3], ids[3], `Tuần C ${s}`);
      // Club 1: 900K staked (900 XP) by one member, the other did nothing; club 2: 500 XP; club 3: nothing
      await play(ids[0], "slot", 900_000, 0, inWeek);
      await play(ids[2], "slot", 500_000, 0, inWeek);
      const before = await Promise.all(ps.map(balanceOf));
      expect(await clubsMod.payClubWeek(week)).toBe(true);
      expect(await clubsMod.payClubWeek(week)).toBe(false);
      await Promise.all([clubsMod.payClubWeek(week), clubsMod.payClubWeek(week)]);
      const after = await Promise.all(ps.map(balanceOf));
      expect(after.map((x, i) => x - before[i])).toEqual([100_000, 0, 50_000, 0]);
      const rows = (await pool.query("select user_id, amount from deposits where method = 'club_weekly' and user_id = any($1)", [ids])).rows;
      expect(rows.length).toBe(2);
      const w = (await pool.query("select winners from club_weeks where week = $1", [(await import("../shared/league")).vnDay(week)])).rows[0].winners;
      expect(w.slice(0, 2).map((x: any) => [x.clubId, x.rank])).toEqual([[c1, 1], [c2, 2]]);
      expect((await notifs(ps[0])).some((n) => n.kind === "club" && n.data.action === "reward" && n.data.amount === 100_000)).toBe(true);
      // The live board: this week's XP
      await play(ids[1], "slot", 7_000, 0);
      const board = (await ps[1].req("GET", "/api/clubs")).body;
      expect(board.clubs.find((c: any) => c.id === c1).weeklyXp).toBe(7);
      expect((await ps[1].req("GET", `/api/clubs/${c1}`)).body.members.find((m: any) => m.username === ps[1].username).weeklyXp).toBe(7);
    });

    it("daily quests: progress from real plays and posts, each claim paid once, the chest and the 7-day streak", async () => {
      const [p] = await players(1);
      await setBalance(p.username, 1_000_000);
      const uid = await idOf(p);
      const { vnDay } = await import("../shared/league");
      const day = vnDay(new Date());
      const first = (await p.req("GET", "/api/quests")).body;
      expect(first.quests.length).toBe(3);
      expect(first.quests.some((q: any) => q.social)).toBe(true);
      expect(new Set(first.quests.map((q: any) => q.kind)).size).toBe(3);
      // Same quests on a second look
      expect((await p.req("GET", "/api/quests")).body.quests.map((q: any) => q.id)).toEqual(first.quests.map((q: any) => q.id));
      // Pin today's quests so the test knows what to do
      await pool.query("delete from daily_quests where user_id = $1", [uid]);
      await pool.query("insert into daily_quests (user_id, day, slot, quest_id) values ($1, $2, 0, 'spins20'), ($1, $2, 1, 'plays30'), ($1, $2, 2, 'talk1')", [uid, day]);
      expect((await p.req("POST", "/api/quests/0/claim")).status).toBe(409); // not done yet
      for (let i = 0; i < 30; i++) expect((await p.play(1000)).status).toBe(200);
      const mid = (await p.req("GET", "/api/quests")).body;
      expect(mid.quests.map((q: any) => q.progress)).toEqual([20, 30, 0]);
      expect((await p.req("POST", "/api/talk/threads", { board: "misc", title: "Chào mọi người", body: "Hôm nay đẹp trời!" })).status).toBe(200);
      expect((await p.req("GET", "/api/quests")).body.quests[2].progress).toBe(1);
      // Two taps at once: one payout
      const before = await balanceOf(p);
      const claims = await Promise.all([p.req("POST", "/api/quests/0/claim"), p.req("POST", "/api/quests/0/claim")]);
      expect(claims.map((c) => c.status).sort()).toEqual([200, 409]);
      expect(await balanceOf(p)).toBe(before + 20_000);
      expect((await p.req("POST", "/api/quests/chest")).status).toBe(409); // not all claimed
      expect((await p.req("POST", "/api/quests/1/claim")).body.reward).toBe(15_000);
      expect((await p.req("POST", "/api/quests/2/claim")).body.reward).toBe(15_000);
      // Six chests in the days before: today's makes seven in a row
      for (let i = 1; i <= 6; i++) {
        const d = new Date(new Date(`${day}T00:00:00Z`).getTime() - i * 86_400_000).toISOString().slice(0, 10);
        await pool.query("insert into quest_chests (user_id, day, amount) values ($1, $2, 50000)", [uid, d]);
      }
      const b2 = await balanceOf(p);
      const chest = await Promise.all([p.req("POST", "/api/quests/chest"), p.req("POST", "/api/quests/chest")]);
      expect(chest.map((c) => c.status).sort()).toEqual([200, 409]);
      expect(chest.find((c) => c.status === 200)!.body).toMatchObject({ amount: 50_000, streakBonus: 250_000, streak: 7 });
      expect(await balanceOf(p)).toBe(b2 + 300_000);
      const v = (await p.req("GET", "/api/quests")).body;
      expect(v.chest).toMatchObject({ claimed: true, ready: false });
      expect(v.streak.days).toBe(7);
      const paid = (await pool.query("select coalesce(sum(amount), 0)::int as s from deposits where user_id = $1 and method = 'daily_quest'", [uid])).rows[0].s;
      expect(paid).toBe(20_000 + 15_000 + 15_000 + 50_000 + 250_000);
      // Social quests count each thing once and only from real events
      const { questEvent } = await import("../server/quests");
      await questEvent(uid, "chat", "chat:1");
      await questEvent(uid, "chat", "chat:1");
      expect((await pool.query("select count(*)::int as n from quest_events where user_id = $1 and kind = 'chat'", [uid])).rows[0].n).toBe(1);
    });

    it("quests are quiet: play-a-friend counts real matches between friends, no notifications", async () => {
      const [a, b] = await players(2);
      const [ua, ub] = await Promise.all([idOf(a), idOf(b)]);
      const { vnDay } = await import("../shared/league");
      const day = vnDay(new Date());
      for (const u of [ua, ub]) await pool.query("insert into daily_quests (user_id, day, slot, quest_id) values ($1, $2, 0, 'friendmatch'), ($1, $2, 1, 'chat3'), ($1, $2, 2, 'gift1')", [u, day]);
      const { questFriendMatch } = await import("../server/quests");
      await questFriendMatch([ua, ub], "test:1");
      expect((await a.req("GET", "/api/quests")).body.quests[0].progress).toBe(0); // not friends
      await befriend(a, b);
      await questFriendMatch([ua, ub], "test:2");
      await questFriendMatch([ua, ub], "test:2");
      expect((await a.req("GET", "/api/quests")).body.quests[0].progress).toBe(1);
      expect((await notifs(b)).some((n) => n.kind === ("quest" as string))).toBe(false);
    });

    it("Talk: boards, threads with replies, newest activity first, paging, no content filter, live push", async () => {
      const [a, b, c] = await players(3);
      const boards = (await a.req("GET", "/api/talk/boards")).body.boards.map((x: any) => x.id);
      expect(boards).toEqual(["intro", "lfg", "pool", "darts", "cards", "abroad", "zh", "misc"]);
      const post = (p: Player, body: any) => p.req("POST", "/api/talk/threads", body);
      expect((await post(a, { board: "nope", title: "x", body: "y" })).status).toBe(400);
      expect((await post(a, { board: "misc", title: "", body: "y" })).status).toBe(400);
      expect((await post(a, { board: "misc", title: "t", body: "x".repeat(2001) })).body.message).toBe("long");
      const t1 = await post(a, { board: "misc", title: "Xin chào, mình ở Leeds", body: "Đm trời lạnh quá, ai ở UK không? zalo 0912345678" });
      expect(t1.status).toBe(200);
      expect(t1.body).toMatchObject({ board: "misc", title: "Xin chào, mình ở Leeds", body: "Đm trời lạnh quá, ai ở UK không? zalo 0912345678", replies: 0, mine: true });
      expect((await post(a, { board: "misc", title: "again", body: "too soon" })).body.message).toBe("slow_down");
      // A socket sees new replies live
      const { WebSocket } = await import("ws");
      const ws = new WebSocket(base.replace("http", "ws") + "/ws/social", { headers: { Cookie: c.cookie } });
      const got: any[] = [];
      ws.on("message", (m) => got.push(JSON.parse(String(m))));
      await new Promise<void>((r) => ws.on("open", () => r()));
      const r1 = await b.req("POST", `/api/talk/threads/${t1.body.id}/replies`, { text: "Mình ở Manchester nè!" });
      expect(r1.status).toBe(200);
      await sleep(200);
      expect(got.some((m) => m.t === "talk_reply" && m.threadId === t1.body.id && m.reply.text === "Mình ở Manchester nè!")).toBe(true);
      ws.close();
      expect((await notifs(a)).some((n) => n.kind === "talk" && n.data.threadId === t1.body.id)).toBe(true);
      const th = (await c.req("GET", `/api/talk/threads/${t1.body.id}`)).body;
      expect(th.thread.replies).toBe(1);
      expect(th.replies.items.map((x: any) => x.text)).toEqual(["Mình ở Manchester nè!"]);
      expect((await c.req("POST", `/api/talk/threads/${t1.body.id}/thumb`)).body).toEqual({ on: true, thumbs: 1 });
      // Paging: 25 threads (made directly), newest activity first, 20 a page
      const uc = await idOf(c);
      for (let i = 0; i < 25; i++) await pool.query("insert into talk_threads (board, user_id, title, body, last_at) values ('pool', $1, $2, 'b', now() - ($3 || ' minutes')::interval)", [uc, `T${i}`, String(i + 1)]);
      const p1 = (await a.req("GET", "/api/talk/threads?board=pool")).body;
      expect(p1.items.length).toBe(20);
      expect(p1.items.slice(0, 3).map((x: any) => x.title)).toEqual(["T0", "T1", "T2"]);
      expect(p1.more).toBe(true);
      const p2 = (await a.req("GET", `/api/talk/threads?board=pool&before=${encodeURIComponent(p1.next)}`)).body;
      expect(p2.items.map((x: any) => x.title)).toEqual(["T20", "T21", "T22", "T23", "T24"]);
      expect(p2.more).toBe(false);
      // A reply brings a thread back to the top of "all"
      const all = (await a.req("GET", "/api/talk/threads")).body.items;
      expect(all[0].id).toBe(t1.body.id);
      // Blocking hides it both ways
      await c.req("POST", `/api/players/${a.username}/block`, { block: true });
      expect((await c.req("GET", `/api/talk/threads/${t1.body.id}`)).status).toBe(404);
    });

    it("find a match: post, one active each, join leads to the table flow, expiry, close", async () => {
      const [a, b] = await players(2);
      const mk = (p: Player, body: any) => p.req("POST", "/api/matches", body);
      expect((await mk(a, { game: "chess", stake: 0, minutes: 30 })).status).toBe(400);
      expect((await mk(a, { game: "pool", stake: 12345, minutes: 30 })).status).toBe(400);
      expect((await mk(a, { game: "pool", stake: 0, minutes: 5 })).status).toBe(400);
      await setBalance(a.username, 5_000);
      expect((await mk(a, { game: "pool", stake: 10_000, minutes: 30 })).body.message).toBe("Not enough coins");
      await setBalance(a.username, 500_000);
      const p1 = await mk(a, { game: "pool", stake: 10_000, minutes: 30, note: "Ai làm vài ván không?" });
      expect(p1.status).toBe(200);
      await sleep(10_100);
      const p2 = await mk(a, { game: "cards", stake: 1_000, minutes: 15 });
      const mine = (await b.req("GET", "/api/matches")).body.posts.filter((x: any) => x.author.username === a.username);
      expect(mine.map((x: any) => x.id)).toEqual([p2.body.id]); // the new one replaced the old
      expect((await a.req("POST", `/api/matches/${p2.body.id}/join`)).status).toBe(400);
      const j = await b.req("POST", `/api/matches/${p2.body.id}/join`);
      expect(j.body.href).toBe(`/ban-bai?challenge=${encodeURIComponent(a.username)}&stake=1000`);
      expect((await notifs(a)).some((n) => n.kind === "match" && n.data.postId === p2.body.id)).toBe(true);
      // Expiry
      await pool.query("update match_posts set expires_at = now() - interval '1 second' where id = $1", [p2.body.id]);
      expect((await b.req("GET", "/api/matches")).body.posts.some((x: any) => x.id === p2.body.id)).toBe(false);
      expect((await b.req("POST", `/api/matches/${p2.body.id}/join`)).status).toBe(404);
      // Close
      await sleep(10_100);
      const p3 = await mk(a, { game: "darts", stake: 0, minutes: 60 });
      expect((await b.req("DELETE", `/api/matches/${p3.body.id}`)).status).toBe(404);
      expect((await a.req("DELETE", `/api/matches/${p3.body.id}`)).status).toBe(200);
      expect((await b.req("GET", "/api/matches")).body.posts.some((x: any) => x.id === p3.body.id)).toBe(false);
    }, 40_000);

    it("photos in messages: metadata stripped, size and rate limits, who can see them, blur setting", async () => {
      const [a, b, c] = await players(3);
      const seg = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
      const jpeg = Buffer.concat([
        Buffer.from([0xff, 0xd8]),
        seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary")),
        seg(0xe1, Buffer.from("Exif\0\0GPS-SECRET-LOCATION 51.5,-0.1", "binary")),
        seg(0xfe, Buffer.from("taken at home", "binary")),
        seg(0xdb, Buffer.from([0, 1])),
        seg(0xda, Buffer.from([0, 0])), Buffer.from("PIXELS"), Buffer.from([0xff, 0xd9]),
      ]);
      const up = (p: Player, body: any) => p.req("POST", "/api/photos", body);
      expect((await up(a, { scope: "dm", to: b.username, photo: Buffer.from("not an image").toString("base64") })).status).toBe(400);
      expect((await up(a, { scope: "dm", to: b.username, photo: Buffer.alloc(700_000, 1).toString("base64") })).status).toBe(413);
      const ph = await up(a, { scope: "dm", to: b.username, photo: jpeg.toString("base64") });
      expect(ph.status).toBe(200);
      const stored: Buffer = (await pool.query("select data from message_photos where id = $1", [ph.body.id])).rows[0].data;
      expect(stored.includes(Buffer.from("GPS-SECRET"))).toBe(false);
      expect(stored.includes(Buffer.from("taken at home"))).toBe(false);
      expect(stored.includes(Buffer.from("JFIF"))).toBe(true);
      expect(stored.includes(Buffer.from("PIXELS"))).toBe(true);
      // Sent in the DM; only the two of them can fetch it
      const m = await a.req("POST", "/api/dm/send", { to: b.username, photoId: ph.body.id });
      expect(m.body).toMatchObject({ photo: ph.body.id, text: null });
      const get = async (p: Player, id: number) => (await fetch(`${base}/api/photos/${id}`, { headers: { Cookie: p.cookie } })).status;
      expect(await get(b, ph.body.id)).toBe(200);
      expect(await get(a, ph.body.id)).toBe(200);
      expect(await get(c, ph.body.id)).toBe(404);
      // A photo made for one place can't be used in another
      expect((await c.req("POST", "/api/dm/send", { to: b.username, photoId: ph.body.id })).status).toBe(400);
      // Blur: off for non-friends unless the viewer turns "always show photos" on
      expect((await b.req("GET", "/api/social/settings")).body.privacy.showPhotos).toBe(false);
      expect((await b.req("GET", `/api/dm/thread/${a.username}`)).body.peer.friend).toBe(false);
      expect((await b.req("PUT", "/api/social/privacy", { showPhotos: true })).body.showPhotos).toBe(true);
      // Reported photos reach the admin queue, and only then can the admin see them
      const adm = (await players(1))[0];
      await pool.query("update users set is_admin = true where username = $1", [adm.username]);
      expect(await get(adm, ph.body.id)).toBe(404);
      expect((await b.req("POST", `/api/photos/${ph.body.id}/report`, { reason: "nude" })).status).toBe(200);
      expect(await get(adm, ph.body.id)).toBe(200);
      const q = (await adm.req("GET", "/api/admin/social3/reports")).body.items.find((x: any) => x.kind === "photo" && x.id === ph.body.id);
      expect(q).toMatchObject({ reports: 1, reasons: ["nude"], username: a.username, photo: ph.body.id });
      expect((await adm.req("POST", `/api/admin/ugc/photo/${ph.body.id}`, { action: "delete" })).status).toBe(200);
      expect(await get(b, ph.body.id)).toBe(404);
      // Rate limit: 20 an hour
      await pool.query("insert into message_photos (user_id, scope, mime, data, bytes) select $1, 'lounge', 'image/jpeg', '\\x00', 1 from generate_series(1, 20)", [await idOf(c)]);
      expect((await up(c, { scope: "lounge", photo: jpeg.toString("base64") })).status).toBe(429);
      // Lounge photos: any signed-in player can see them
      const lp = await up(b, { scope: "lounge", photo: jpeg.toString("base64") });
      expect((await b.req("POST", "/api/chat", { photoId: lp.body.id, room: "eu" })).body).toMatchObject({ photo: lp.body.id, room: "eu" });
      expect(await get(c, lp.body.id)).toBe(200);
    });

    it("lounge rooms keep their own messages; the main lounge is the old chat", async () => {
      const [a, b] = await players(2);
      const m1 = await a.req("POST", "/api/chat", { text: "chào sảnh", room: "main" });
      const m2 = await b.req("POST", "/api/chat", { text: "大家好", room: "zh" });
      expect(m2.body.room).toBe("zh");
      const main = (await a.req("GET", "/api/chat")).body.messages.map((x: any) => x.id);
      expect(main).toContain(m1.body.id);
      expect(main).not.toContain(m2.body.id);
      expect((await a.req("GET", "/api/chat?room=zh")).body.messages.map((x: any) => x.id)).toEqual([m2.body.id]);
      expect((await a.req("GET", "/api/chat?room=nowhere")).body.messages.map((x: any) => x.id)).toContain(m1.body.id);
    });

    it("richer profiles: about me, country (can be hidden), games, languages, play style", async () => {
      const [a, b] = await players(2);
      const r = await a.req("PUT", "/api/social/profile", { bio: "Mình mê bi-a, hay chơi tối thứ Sáu. ".repeat(5).trim(), country: "GB", favGames: ["pool", "cards"], languages: ["vi", "en"], playStyle: "competitive" });
      expect(r.status).toBe(200);
      expect((await a.req("PUT", "/api/social/profile", { country: "XX" })).status).toBe(400);
      expect((await a.req("PUT", "/api/social/profile", { favGames: ["chess"] })).status).toBe(400);
      expect((await a.req("PUT", "/api/social/profile", { languages: ["fr"] })).status).toBe(400);
      const prof = (await b.req("GET", `/api/players/${a.username}/profile`)).body;
      expect(prof).toMatchObject({ country: "GB", favGames: ["pool", "cards"], languages: ["vi", "en"], playStyle: "competitive" });
      expect(prof.bio.length).toBeGreaterThan(80);
      await a.req("PUT", "/api/social/privacy", { hideCountry: true });
      expect((await b.req("GET", `/api/players/${a.username}/profile`)).body.country).toBeNull();
      await befriend(a, b);
      expect((await b.req("GET", "/api/friends")).body.friends[0].facts).toMatchObject({ country: null, languages: ["vi", "en"], playStyle: "competitive" });
    });

    it("reports: threads and replies hide after three, the queue shows only reported items, admin deletes and dismisses", async () => {
      const [a, r1, r2, r3, adm] = await players(5);
      await pool.query("update users set is_admin = true where username = $1", [adm.username]);
      const t = (await a.req("POST", "/api/talk/threads", { board: "misc", title: "Bài đăng", body: "nội dung" })).body.id;
      const unreported = (await r1.req("POST", "/api/talk/threads", { board: "misc", title: "Không ai báo", body: "ok" })).body.id;
      expect((await a.req("POST", `/api/talk/threads/${t}/report`)).status).toBe(400);
      for (const p of [r1, r2]) await p.req("POST", `/api/talk/threads/${t}/report`, { reason: "spam" });
      expect((await r3.req("GET", `/api/talk/threads/${t}`)).status).toBe(200);
      await r3.req("POST", `/api/talk/threads/${t}/report`);
      expect((await r3.req("GET", `/api/talk/threads/${t}`)).status).toBe(404);
      const items = (await adm.req("GET", "/api/admin/social3/reports")).body.items;
      expect(items.find((x: any) => x.kind === "thread" && x.id === t)).toMatchObject({ reports: 3, hidden: true, title: "Bài đăng", username: a.username, reasons: ["spam", "spam"] });
      expect(items.some((x: any) => x.kind === "thread" && x.id === unreported)).toBe(false);
      expect((await adm.req("POST", `/api/admin/ugc/thread/${t}`, { action: "restore" })).status).toBe(200);
      expect((await r3.req("GET", `/api/talk/threads/${t}`)).status).toBe(200);
      // Clubs can be reported too
      await setBalance(a.username, 100_000);
      const club = (await a.req("POST", "/api/clubs", { name: `Báo ${Date.now() % 100000}`, tag: "BAO", emblem: "🔥", color: "#ef4444" })).body.id;
      expect((await r1.req("POST", `/api/clubs/${club}/report`, { reason: "offensive name" })).status).toBe(200);
      expect((await adm.req("GET", "/api/admin/social3/reports")).body.items.find((x: any) => x.kind === "club" && x.id === club)).toMatchObject({ reports: 1 });
      expect((await adm.req("POST", `/api/admin/ugc/club/${club}`, { action: "dismiss" })).status).toBe(200);
      expect((await adm.req("GET", "/api/admin/social3/reports")).body.items.some((x: any) => x.kind === "club" && x.id === club)).toBe(false);
      expect((await r1.req("GET", "/api/admin/social3/reports")).status).toBe(403);
    });

    it("online now: friends first, then others who share their presence", async () => {
      const [a, b, c] = await players(3);
      await befriend(a, b);
      const { WebSocket } = await import("ws");
      const open = (p: Player) => new Promise<import("ws").WebSocket>((resolve, reject) => {
        const ws = new WebSocket(base.replace("http", "ws") + "/ws/social", { headers: { Cookie: p.cookie } });
        ws.on("open", () => resolve(ws)); ws.on("error", reject);
      });
      const socks = [await open(b), await open(c)];
      await sleep(150);
      let v = (await a.req("GET", "/api/online")).body;
      expect(v.friends.map((f: any) => f.username)).toEqual([b.username]);
      expect(v.others.some((o: any) => o.username === c.username)).toBe(true);
      await c.req("PUT", "/api/social/privacy", { showPresence: false });
      v = (await a.req("GET", "/api/online")).body;
      expect(v.others.some((o: any) => o.username === c.username)).toBe(false);
      for (const s of socks) s.close();
    });

    it("deleting an account removes clubs data, Talk, match posts, photos, reports and quests", async () => {
      const [gone, keep, other] = await players(3);
      await setBalance(gone.username, 100_000);
      const gid = await idOf(gone);
      const club = (await gone.req("POST", "/api/clubs", { name: `Xoá ${Date.now() % 100000}`, tag: "DEL", emblem: "🌙", color: "#06b6d4" })).body.id;
      await keep.req("POST", `/api/clubs/${club}/join`);
      const msg = (await gone.req("POST", `/api/clubs/${club}/chat`, { text: "tạm biệt hội" })).body;
      await keep.req("POST", `/api/clubs/chat/${msg.id}/report`);
      const mine = (await gone.req("POST", "/api/talk/threads", { board: "misc", title: "của tôi", body: "x" })).body.id;
      await keep.req("POST", `/api/talk/threads/${mine}/replies`, { text: "trả lời" });
      const theirs = (await keep.req("POST", "/api/talk/threads", { board: "misc", title: "của bạn", body: "y" })).body.id;
      await gone.req("POST", `/api/talk/threads/${theirs}/thumb`);
      await gone.req("POST", `/api/talk/threads/${theirs}/replies`, { text: "hay đấy" });
      await other.req("POST", `/api/talk/threads/${mine}/report`);
      await gone.req("POST", `/api/talk/threads/${theirs}/report`).catch(() => {});
      await gone.req("POST", "/api/matches", { game: "pool", stake: 0, minutes: 30 });
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 3, 0, 0xff, 0xda, 0, 2, 1, 2, 0xff, 0xd9]);
      const ph = (await gone.req("POST", "/api/photos", { scope: "lounge", photo: jpeg.toString("base64") })).body.id;
      await other.req("POST", `/api/photos/${ph}/report`);
      await gone.req("GET", "/api/quests");
      await (await import("../server/quests")).questEvent(gid, "chat", "x:1");
      await gone.req("POST", "/api/invites", { to: keep.username, game: "pool", path: "/pool" });
      const count = async () => Number((await pool.query(`select
        (select count(*) from club_members where user_id = $1) + (select count(*) from club_messages where user_id = $1) +
        (select count(*) from club_chat_reports where reporter_id = $1 or message_id = $2) + (select count(*) from talk_threads where user_id = $1) +
        (select count(*) from talk_replies where user_id = $1 or thread_id = $3) + (select count(*) from talk_thumbs where user_id = $1) +
        (select count(*) from ugc_reports where reporter_id = $1 or (kind = 'thread' and target_id = $3) or (kind = 'photo' and target_id = $4)) +
        (select count(*) from match_posts where user_id = $1) + (select count(*) from message_photos where user_id = $1) +
        (select count(*) from daily_quests where user_id = $1) + (select count(*) from quest_events where user_id = $1) +
        (select count(*) from direct_messages where from_id = $1 or to_id = $1) as n`, [gid, msg.id, mine, ph])).rows[0].n);
      expect(await count()).toBeGreaterThan(12);
      expect((await gone.req("POST", "/api/user/delete", { password: gone.password })).status).toBe(200);
      expect(await count()).toBe(0);
      // The club passed to the remaining member; the other thread's counts are right
      const v = (await keep.req("GET", `/api/clubs/${club}`)).body;
      expect(v.members.map((m: any) => [m.username, m.role])).toEqual([[keep.username, "owner"]]);
      expect((await keep.req("GET", `/api/talk/threads/${theirs}`)).body.thread).toMatchObject({ replies: 0, thumbs: 0 });
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
      // Each round really stakes 1,000 from the balance: enough coins that a losing streak can't run it dry
      await setBalance(p.username, 10_000_000);
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
      // Five paid spins; any free spins won along the way are played too (they cost nothing)
      let staked = 0, paidSpins = 0;
      for (let guard = 0; paidSpins < 5 && guard < 100; guard++) {
        const r = await p.spin(BET);
        expect(r.status).toBe(200);
        if (!r.body.isFreeSpin) { staked += BET; paidSpins++; }
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

  describe("Đua Ngựa", () => {
    it("takes bets only while betting is open, hides the result until the off, and pays each bet once", async () => {
      const { placeHorseBets, settleHorse, horseView, horseRound } = await import("../server/horse");
      const H = await import("../shared/horse");
      const p = new Player();
      const pu = await p.register();
      await setBalance(p.username, 10_000_000);
      const user = (await pool.query("select * from users where id = $1", [pu.id])).rows[0];
      // A race far in the future, so the live timer leaves it alone until we say
      const t = H.horseRoundTimes(H.horseRoundAt(Date.now()).round + 2000);
      const betting = t.start + 5000;

      // Bad bets
      expect(await placeHorseBets(pu.id, { bets: [{ horse: 8, amount: 1000 }] }, betting)).toHaveProperty("error");
      expect(await placeHorseBets(pu.id, { bets: [{ horse: 0, amount: 1500 }] }, betting)).toHaveProperty("error");
      expect(await placeHorseBets(pu.id, { bets: [] }, betting)).toHaveProperty("error");
      expect(await placeHorseBets(pu.id, { bets: [{ horse: 0, amount: 6_000_000 }] }, betting)).toHaveProperty("error");
      expect(await placeHorseBets(pu.id, { bets: [{ horse: 0, amount: 1000 }] }, t.raceStart - 500)).toMatchObject({ code: "closed" });
      expect(await placeHorseBets(pu.id, { bets: [{ horse: 0, amount: 1000 }] }, t.raceStart + 100)).toMatchObject({ code: "closed" });
      // Wrong bet types, and forecasts that aren't two different horses
      expect(await placeHorseBets(pu.id, { bets: [{ type: "place", horse: 0, amount: 1000 }] }, betting)).toMatchObject({ error: "Pick a bet type" });
      expect(await placeHorseBets(pu.id, { bets: [{ type: "top2", horse: 0, horse2: 1, amount: 1000 }] }, betting)).toMatchObject({ error: "Pick a bet type" });
      expect(await placeHorseBets(pu.id, { bets: [{ type: "forecast", horse: 3, horse2: 3, amount: 1000 }] }, betting)).toMatchObject({ error: "Pick two different horses for 1st and 2nd" });
      expect(await placeHorseBets(pu.id, { bets: [{ type: "forecast", horse: 3, amount: 1000 }] }, betting)).toMatchObject({ error: "Pick the horses for 1st and 2nd" });
      expect(await placeHorseBets(pu.id, { bets: [{ type: "forecast", horse: 3, horse2: 8, amount: 1000 }] }, betting)).toHaveProperty("error");
      expect((await p.state()).balance).toBe(10_000_000); // nothing was taken

      // Before the off nothing about the result leaves the server
      const before = await horseView(user, betting);
      expect(before.race).toBeNull();
      const json = JSON.stringify(before);
      expect(json).not.toMatch(/seed|order|chances/i);
      expect(before.winners.every((x) => x.round < t.round)).toBe(true);
      const row = await horseRound(t.round);
      const M = H.horseMarket(row.chances);
      expect(before.odds).toEqual(M);
      expect([...row.chances].sort((a, b) => b - a)).toEqual(H.HORSE_CHANCES);
      expect(row.odds100).toEqual(M.win);
      expect(row.finishOrder[0]).toBe(row.winner);
      expect(await horseRound(t.round)).toEqual(row); // made once

      // Every kind of bet, winners and losers; the same bet twice in one slip is one bet
      const [a, b, c, , , , , z] = row.finishOrder;
      const r1 = await placeHorseBets(pu.id, { bets: [
        { horse: a, amount: 150_000 }, { type: "win", horse: a, amount: 150_000 }, // win: wins
        { type: "win", horse: b, amount: 20_000 }, // loses
        { type: "top2", horse: b, amount: 10_000 }, // wins
        { type: "top2", horse: c, amount: 10_000 }, // loses
        { type: "top3", horse: c, amount: 10_000 }, // wins
        { type: "top3", horse: z, amount: 10_000 }, // loses
        { type: "forecast", horse: a, horse2: b, amount: 5_000 }, // wins
        { type: "forecast", horse: b, horse2: a, amount: 5_000 }, // loses
      ] }, betting);
      expect(r1).not.toHaveProperty("error");
      expect((r1 as any).balance).toBe(10_000_000 - 370_000);
      const bets = (r1 as any).bets as import("../shared/horse").HorseBetView[];
      expect(bets).toHaveLength(8);
      // Prices are locked at bet time
      for (const x of bets) expect(x.odds100).toBe(H.horseBetOdds(M, x.type, x.horse, x.horse2));
      expect(bets.find((x) => x.type === "forecast" && x.horse === a)).toMatchObject({ horse2: b, odds100: M.forecast[a][b] });
      await placeHorseBets(pu.id, { bets: [{ horse: z, amount: 30_000 }] }, betting);
      // 5M a race at most, counting what's already on
      expect(await placeHorseBets(pu.id, { bets: [{ type: "top3", horse: z, amount: 4_601_000 }] }, betting)).toMatchObject({ error: "At most 5,000,000 coins on one race" });
      // Not enough coins
      const poor = new Player();
      const poorU = await poor.register();
      expect(await placeHorseBets(poorU.id, { bets: [{ type: "forecast", horse: 0, horse2: 1, amount: 100_000 }] }, betting)).toMatchObject({ error: "Not enough coins" });

      // The room sees what's been bet (forecasts count for the first horse) and who; the bets are pending
      const mid = await horseView(user, betting + 1000);
      expect(mid.pool[a]).toEqual({ amount: 305_000, players: 1 });
      expect(mid.backers[a]).toEqual([{ username: p.username, avatarUrl: null }]);
      expect(mid.players).toBe(1);
      expect(mid.mine.every((x) => x.status === "pending" && x.payout === null)).toBe(true);

      // The off: seed and order are revealed
      const racing = await horseView(user, t.raceStart + 10);
      expect(racing.race).toEqual({ seed: row.seed, order: row.finishOrder });

      // Nothing is paid during the race; everything after it, once
      await settleHorse(t.raceEnd - 100);
      expect((await pool.query("select count(*)::int as n from horse_bets where round = $1 and settled", [t.round])).rows[0].n).toBe(0);
      const bal = (await p.state()).balance;
      await Promise.all([settleHorse(t.raceEnd + 10), settleHorse(t.raceEnd + 20), settleHorse(t.raceEnd + 30)]);
      await settleHorse(t.raceEnd + 1000);
      const pays = {
        win: H.horsePayout(300_000, M.win[a]),
        top2: H.horsePayout(10_000, M.top2[b]),
        top3: H.horsePayout(10_000, M.top3[c]),
        forecast: H.horsePayout(5_000, M.forecast[a][b]),
      };
      const totalWin = pays.win + pays.top2 + pays.top3 + pays.forecast;
      expect((await p.state()).balance).toBe(bal + totalWin);
      const plays = (await pool.query("select bet, payout from game_plays where user_id = $1 and game = 'horse' order by id", [pu.id])).rows;
      expect(plays).toHaveLength(9);
      expect(plays.reduce((s: number, x: any) => s + Number(x.bet), 0)).toBe(400_000);
      expect(plays.reduce((s: number, x: any) => s + Number(x.payout), 0)).toBe(totalWin);
      const after = await horseView(user, t.raceEnd + 2000);
      expect(after.mine.find((x) => x.type === "win" && x.horse === a)).toMatchObject({ status: "won", payout: pays.win });
      expect(after.mine.find((x) => x.type === "top2" && x.horse === b)).toMatchObject({ status: "won", payout: pays.top2 });
      expect(after.mine.find((x) => x.type === "top3" && x.horse === c)).toMatchObject({ status: "won", payout: pays.top3 });
      expect(after.mine.find((x) => x.type === "forecast" && x.horse === a)).toMatchObject({ status: "won", payout: pays.forecast });
      expect(after.mine.filter((x) => x.status === "lost")).toHaveLength(5);
      expect(after.winners[0]).toEqual({ round: t.round, horse: a, odds100: M.win[a] });
      // The form guide counts this race
      expect(after.form.last[a][0]).toBe(1);
      expect(after.form.last[z][0]).toBe(8);
      // A big win is announced in the chat, once
      expect(totalWin).toBeGreaterThanOrEqual(H.HORSE_BIG_WIN);
      const chat = (await pool.query("select text from chat_messages where username = '🏇 Đua Ngựa' and text like $1", [`%${p.username}%`])).rows;
      expect(chat).toHaveLength(1);
      // Settling again changes nothing
      await settleHorse(t.raceEnd + 5000);
      expect((await p.state()).balance).toBe(bal + totalWin);
    });

    it("keeps the bets of an old slip paying at their old price after the upgrade", async () => {
      const { settleHorse, horseRound } = await import("../server/horse");
      const H = await import("../shared/horse");
      const p = new Player();
      const pu = await p.register();
      const t = H.horseRoundTimes(H.horseRoundAt(Date.now()).round + 2100);
      const row = await horseRound(t.round);
      // A bet as the old version wrote it: no type, price in tenths, copied to hundredths by the migration
      await pool.query("insert into horse_bets (round, user_id, horse, amount, odds, odds100) values ($1, $2, $3, 10000, 35, 350)", [t.round, pu.id, row.winner]);
      const bal = (await p.state()).balance;
      await settleHorse(t.raceEnd + 10);
      expect((await p.state()).balance).toBe(bal + 35_000);
      const r = (await pool.query("select bet_type, payout::int as payout from horse_bets where user_id = $1", [pu.id])).rows[0];
      expect(r).toEqual({ bet_type: "win", payout: 35_000 });
    });

    it("serves the race over HTTP, with cheers for everyone", async () => {
      const H = await import("../shared/horse");
      const { horseCheer, horseView } = await import("../server/horse");
      const p = new Player();
      const pu = await p.register();
      const r = await p.req("GET", "/api/horse");
      expect(r.status).toBe(200);
      expect(r.body.odds.win).toHaveLength(8);
      expect(r.body.odds.forecast).toHaveLength(8);
      expect(r.body.form.last).toHaveLength(8);
      expect(Array.isArray(r.body.bigWins)).toBe(true);
      if (Date.now() < r.body.raceStart) expect(r.body.race).toBeNull();
      expect((await p.req("POST", "/api/horse/bet", { bets: [{ horse: 0, amount: 999 }] })).status).toBe(400);
      expect((await p.req("POST", "/api/horse/bet", { bets: [{ type: "forecast", horse: 1, horse2: 1, amount: 1000 }] })).status).toBe(400);
      expect((await new Player().req("GET", "/api/horse")).status).toBe(401);
      expect((await new Player().req("POST", "/api/horse/cheer", { emoji: "🔥" })).status).toBe(401);
      expect((await p.req("POST", "/api/horse/cheer", { emoji: "💩" })).status).toBe(400);

      // Cheers: only once the race is on, rate-limited, shown to everyone watching, no coins
      const t = H.horseRoundTimes(H.horseRoundAt(Date.now()).round + 2200);
      const me = { id: pu.id, username: p.username };
      expect(horseCheer(me, { emoji: "🔥" }, t.raceStart - 1000)).toMatchObject({ status: 409 });
      expect(horseCheer(me, { emoji: "🔥", horse: 2 }, t.raceStart + 1000)).toHaveProperty("cheer");
      expect(horseCheer(me, { emoji: "📣" }, t.raceStart + 1100)).toMatchObject({ status: 429 });
      expect(horseCheer(me, { emoji: "🐎", horse: 9 }, t.raceStart + 3000)).toMatchObject({ status: 400 });
      expect(horseCheer(me, { emoji: "💰", horse: null }, t.raceStart + 3000)).toHaveProperty("cheer");
      for (let i = 0; i < 28; i++) expect(horseCheer(me, { emoji: "📣" }, t.raceStart + 4000 + i * H.HORSE_CHEER_GAP_MS)).toHaveProperty("cheer");
      expect(horseCheer(me, { emoji: "📣" }, t.end - 1)).toMatchObject({ status: 429 }); // 30 a race at most
      expect(horseCheer(me, { emoji: "📣" }, t.end + H.HORSE_BET_MS + 10)).toHaveProperty("cheer"); // a new race
      const other = new Player();
      const ou = await other.register();
      const watcher = (await pool.query("select * from users where id = $1", [ou.id])).rows[0];
      const seen = await horseView(watcher, t.raceStart + 3500);
      expect(seen.cheers.map((c) => [c.username, c.emoji, c.horse])).toEqual([[p.username, "🔥", 2], [p.username, "💰", null]]);
      expect((await p.state()).balance).toBe(TEST_START);
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

  describe("Slot 777 Cổ Điển", () => {
    it("validates the bet strictly", async () => {
      const p = new Player();
      await p.register();
      for (const body of [
        {}, { lines: 2, lineBet: 100 }, { lines: 5, lineBet: 150 }, { lines: 5, lineBet: -100 }, { lines: "5", lineBet: 100 },
        { lines: 5, lineBet: 100.5 }, { lines: 1, lineBet: 100, extra: 1 }, { lines: 5, lineBet: 400_000 },
      ]) {
        const r = await p.req("POST", "/api/slot777/spin", body);
        expect(r.status, JSON.stringify(body)).toBe(400);
        expect(r.body.message).toBe("Invalid bet");
      }
      expect((await p.state()).balance).toBe(TEST_START);
      expect((await new Player().req("POST", "/api/slot777/spin", { lines: 1, lineBet: 100 })).status).toBe(401);
    });

    it("takes lines × line bet, pays the line wins, and logs every spin", async () => {
      const { evalLine777, PAYLINES_777 } = await import("../shared/slot777");
      const p = new Player();
      const pu = await p.register();
      let expected = TEST_START, bet = 0, won = 0;
      for (let i = 0; i < 30; i++) {
        const lines = [1, 3, 5][i % 3];
        const r = await p.req("POST", "/api/slot777/spin", { lines, lineBet: 200 });
        expect(r.status).toBe(200);
        expect(r.body.reels).toHaveLength(3);
        for (const col of r.body.reels) expect(col).toHaveLength(3);
        let sum = 0;
        for (let l = 1; l <= lines; l++) {
          const symbols = PAYLINES_777[l - 1].map((row, reel) => r.body.reels[reel][row]);
          const mult = evalLine777(symbols).mult;
          const w = r.body.lineWins.find((x: any) => x.line === l);
          expect(w?.payout ?? 0).toBe(mult * 200);
          sum += mult * 200;
        }
        expect(r.body.lineWins.every((w: any) => w.line <= lines)).toBe(true);
        expect(r.body.payout).toBe(sum);
        expected += r.body.payout - lines * 200;
        bet += lines * 200; won += r.body.payout;
        expect(r.body.balance).toBe(expected);
      }
      expect((await p.state()).balance).toBe(expected);
      const [tot] = (await pool.query("select count(*)::int as n, sum(bet)::int as bet, sum(payout)::int as payout from game_plays where user_id = $1 and game = 'slot777'", [pu.id])).rows;
      expect(tot).toEqual({ n: 30, bet, payout: won });
    });

    it("can't overdraw, even with many spins at once", async () => {
      const p = new Player();
      await p.register();
      await setBalance(p.username, 5000);
      const rs = await Promise.all(Array.from({ length: 12 }, () => p.req("POST", "/api/slot777/spin", { lines: 5, lineBet: 200 })));
      const ok = rs.filter((r) => r.status === 200);
      for (const r of rs) expect([200, 400]).toContain(r.status);
      const final = (await p.state()).balance;
      expect(final).toBeGreaterThanOrEqual(0);
      expect(final).toBe(5000 - ok.length * 1000 + ok.reduce((a, r) => a + r.body.payout, 0));
      await setBalance(p.username, 999);
      const r = await p.req("POST", "/api/slot777/spin", { lines: 5, lineBet: 200 });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe("Insufficient balance");
      expect((await p.state()).balance).toBe(999);
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
        let moved = false;
        for (const p of players) {
          const mine = await state(p, code);
          if (mine.turn !== mine.you) continue;
          const seat = mine.seats[mine.you];
          await p.req("POST", `/api/cards/tables/${code}/act`, { action: seat.total < line(mine, mine.you) && seat.count < 5 ? "hit" : "stand" });
          moved = true;
        }
        // Someone else (or the computer) is thinking
        if (!moved) await new Promise((r) => setTimeout(r, 150));
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

    it("Xì Dách on your own: a computer player sits in, plays fairly, and steps aside when a friend arrives", async () => {
      const { dropAllTablesForTest } = await import("../server/cardtables");
      dropAllTablesForTest();
      const a = new Player(), b = new Player();
      await a.register(); await b.register();
      const code = (await a.req("POST", "/api/cards/tables", { mode: "banker", stake: 5000 })).body.code;
      const wa = await seatWs(a, code);
      const dealt = await until(a, code, (s) => s.phase !== "waiting");
      const bot = dealt.seats.find((x: any) => x?.bot);
      expect(bot).toBeTruthy();
      expect(bot.username).toMatch(/🤖/);
      const end = await playOut([a], code, (st, me) => (st.seats[me].banker ? 15 : 16));
      const mine = end.seats[end.you];
      // Only the person's coins move; nothing is held afterwards
      expect((await a.state()).balance).toBe(50000 + mine.net);
      expect((await pool.query("select count(*)::int as n from table_escrows where code = $1", [code])).rows[0].n).toBe(0);
      // A friend sits down: from the next round it's people only
      expect((await b.req("POST", `/api/cards/tables/${code}/sit`)).status).toBe(200);
      const wb = await seatWs(b, code);
      const next = await until(a, code, (st) => st.round >= 2 && st.phase !== "waiting", 15000);
      expect(next.seats.some((x: any) => x?.bot)).toBe(false);
      expect(next.seats.filter((x: any) => x?.playing).length).toBe(2);
      wa.close(); wb.close();
    }, 30000);

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
  describe("darts", () => {
    async function connect(p: Player, code: string) {
      const { WebSocket } = await import("ws");
      const ws = new WebSocket(base.replace("http", "ws") + `/ws/darts?code=${code}`, { headers: { Cookie: p.cookie } });
      const msgs: any[] = [];
      ws.on("message", (m) => msgs.push(JSON.parse(String(m))));
      await new Promise<void>((resolve, reject) => { ws.on("open", () => resolve()); ws.on("error", reject); });
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
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const plays = async (username: string) => (await pool.query("select bet, payout from game_plays g join users u on u.id = g.user_id where u.username = $1 and g.game = 'darts' order by g.id", [username])).rows.map((r: any) => [Number(r.bet), Number(r.payout)]);

    it("online: both stakes held, the server throws the darts, the winner takes the pot exactly once, rematch", async () => {
      const a = new Player(), b = new Player(), watcher = new Player();
      await a.register(); await b.register(); await watcher.register();
      const made = await a.req("POST", "/api/darts/tables", { stake: 10000, legs: 3 });
      expect(made.status).toBe(200);
      const code = made.body.code;
      expect((await a.state()).balance).toBe(40000);
      expect((await a.req("POST", "/api/darts/tables", { stake: 0 })).status).toBe(409);
      expect((await b.req("GET", "/api/darts/tables")).body.open.map((t: any) => t.code)).toContain(code);
      const ca = await connect(a, code);
      expect((await ca.next((m) => m.t === "state")).status).toBe("waiting");
      expect((await b.req("POST", `/api/darts/tables/${code}/join`)).status).toBe(200);
      expect((await b.state()).balance).toBe(40000);
      expect((await watcher.req("POST", `/api/darts/tables/${code}/join`)).status).toBe(409); // seat taken
      const cb = await connect(b, code);
      const cw = await connect(watcher, code);
      const sb = await cb.next((m) => m.t === "state" && m.status === "playing");
      expect(sb.seat).toBe(1);
      expect(sb.legs).toBe(3);
      expect((await cw.next((m) => m.t === "state")).seat).toBeNull();

      // Whoever's turn it is throws; a spectator's throw and an out-of-turn throw do nothing
      const first = sb.game.turn as 0 | 1;
      const thrower = first === 0 ? ca : cb, other = first === 0 ? cb : ca;
      cw.ws.send(JSON.stringify({ t: "throw", x: 0, y: -103, power: 1, drift: 0, holdMs: 1000 }));
      other.ws.send(JSON.stringify({ t: "throw", x: 0, y: -103, power: 1, drift: 0, holdMs: 1000 }));
      expect((await other.next((m) => m.t === "error")).message).toBe("Not your turn");
      // The client can't choose where it lands: it only sends the aim
      thrower.ws.send(JSON.stringify({ t: "throw", x: 0, y: -103, power: 1, drift: 0, holdMs: 1000, hit: { x: 0, y: 0, score: 60 }, score: 180 }));
      const seen = await cw.next((m) => m.t === "dart");
      expect(seen.by).toBe(first);
      expect(Number.isFinite(seen.hit.x) && Number.isFinite(seen.hit.y)).toBe(true);
      expect(seen.game.scores[first]).toBe(501 - seen.hit.score);
      expect(seen.game.visit).toHaveLength(1);

      // Live aim reaches the opponent
      thrower.ws.send(JSON.stringify({ t: "aim", x: 10, y: -100, hold: 300 }));
      expect((await other.next((m) => m.t === "aim")).x).toBe(10);

      // A resigns: B gets both stakes; a second resign changes nothing
      ca.ws.send(JSON.stringify({ t: "resign" }));
      const end = await cb.next((m) => m.t === "state" && m.status === "finished");
      expect(end.result).toMatchObject({ winner: 1, reason: "resign", payout: 20000 });
      cb.ws.send(JSON.stringify({ t: "resign" }));
      ca.ws.send(JSON.stringify({ t: "resign" }));
      await sleep(200);
      expect((await a.state()).balance).toBe(40000);
      expect((await b.state()).balance).toBe(60000);
      expect(await plays(a.username)).toEqual([[10000, 0]]);
      expect(await plays(b.username)).toEqual([[10000, 20000]]);
      expect((await pool.query("select status, winner from darts_matches where code = $1", [code])).rows[0].status).toBe("finished");

      // Rematch: B opens a table for the same stake, saved for A
      cb.ws.send(JSON.stringify({ t: "rematch" }));
      const rm = await ca.next((m) => m.t === "state" && m.rematch);
      expect(rm.rematch.by).toBe(1);
      expect((await b.state()).balance).toBe(50000);
      expect((await watcher.req("POST", `/api/darts/tables/${rm.rematch.code}/join`)).status).toBe(409); // saved for A
      expect((await watcher.req("GET", "/api/darts/tables")).body.open.map((t: any) => t.code)).not.toContain(rm.rematch.code);
      expect((await a.req("POST", `/api/darts/tables/${rm.rematch.code}/join`)).status).toBe(200);
      expect((await a.state()).balance).toBe(30000);
      const cr = await connect(a, rm.rematch.code);
      expect((await cr.next((m) => m.t === "state")).status).toBe("playing");
      cr.ws.send(JSON.stringify({ t: "resign" }));
      await sleep(300);
      expect((await b.state()).balance).toBe(70000);
      for (const c of [ca, cb, cw, cr]) c.ws.close();
    });

    it("online: refunds a cancelled table, refuses what you can't afford, refunds after a restart", async () => {
      const a = new Player(), b = new Player();
      await a.register(); await b.register();
      const t1 = (await a.req("POST", "/api/darts/tables", { stake: 50000 })).body.code;
      expect((await a.state()).balance).toBe(0);
      await setBalance(b.username, 1000);
      expect((await b.req("POST", `/api/darts/tables/${t1}/join`)).status).toBe(400);
      expect((await b.state()).balance).toBe(1000);
      expect((await b.req("GET", "/api/darts/tables")).body.open.map((t: any) => t.code)).toContain(t1);
      expect((await a.req("POST", `/api/darts/tables/${t1}/cancel`)).status).toBe(200);
      expect((await a.state()).balance).toBe(50000);
      expect((await a.req("POST", "/api/darts/tables", { stake: 777 })).status).toBe(400);
      expect((await a.req("POST", "/api/darts/tables", { stake: 0, legs: 2 })).status).toBe(400);

      // Mid-game restart: both stakes go back, once
      await setBalance(b.username, 50000);
      const t2 = (await a.req("POST", "/api/darts/tables", { stake: 10000 })).body.code;
      expect((await b.req("POST", `/api/darts/tables/${t2}/join`)).status).toBe(200);
      const { recoverDartsMatches, dropAllDartsRoomsForTest } = await import("../server/darts");
      dropAllDartsRoomsForTest();
      await recoverDartsMatches();
      await recoverDartsMatches();
      expect((await a.state()).balance).toBe(50000);
      expect((await b.state()).balance).toBe(50000);
      expect((await pool.query("select status from darts_matches where code = $1", [t2])).rows[0].status).toBe("cancelled");
    });

    it("practice against the computer never takes coins; the first win of the day pays once", async () => {
      const { setDartsScatterForTest } = await import("../server/darts");
      const { targetPoint } = await import("../shared/darts");
      const a = new Player();
      await a.register();
      expect((await a.req("POST", "/api/darts/practice/start", { level: "silly" })).status).toBe(400);
      const st = await a.req("POST", "/api/darts/practice/start", { level: "hard", legs: 1 });
      expect(st.body.practice.bot.name).toBe("Big Jock");
      // Three darts: then the computer throws its visit back
      let r: any;
      for (let i = 0; i < 3; i++) {
        r = await a.req("POST", "/api/darts/practice/throw", { ...targetPoint("T20"), power: 1, drift: 0, holdMs: 1000 });
        expect(r.status).toBe(200);
        await sleep(260);
      }
      expect(r.body.bot.length).toBeGreaterThanOrEqual(1);
      expect(r.body.game.turn).toBe(0);
      expect((await a.state()).balance).toBe(50000);

      // Play a perfect leg (no scatter): 3×180, then T20 T19 D12
      setDartsScatterForTest(() => [0, 0]);
      try {
        await a.req("POST", "/api/darts/practice/start", { level: "hard", legs: 1 });
        const aims = ["T20", "T20", "T20", "T20", "T20", "T20", "T20", "T19", "D12"];
        for (const t of aims) {
          await sleep(260);
          r = await a.req("POST", "/api/darts/practice/throw", { ...targetPoint(t), power: 1, drift: 0, holdMs: 1000 });
          if (r.body.game?.winner !== null) break;
        }
        expect(r.body.game.winner).toBe(0);
        expect(r.body.reward).toBe(10000);
        expect((await a.state()).balance).toBe(60000);
        // Again the same day: no more reward
        await a.req("POST", "/api/darts/practice/start", { level: "medium", legs: 1 });
        for (const t of aims) {
          await sleep(260);
          r = await a.req("POST", "/api/darts/practice/throw", { ...targetPoint(t), power: 1, drift: 0, holdMs: 1000 });
          if (r.body.game?.winner !== null) break;
        }
        expect(r.body.game.winner).toBe(0);
        expect(r.body.reward).toBe(0);
        expect((await a.state()).balance).toBe(60000);
        expect((await a.req("POST", "/api/darts/practice/throw", { x: 0, y: 0 })).status).toBe(409); // game over
      } finally {
        setDartsScatterForTest();
      }
      expect(await plays(a.username)).toEqual([]);
    });

    it("daily challenge: one ranked attempt a day, a leaderboard, prizes paid once", async () => {
      const { settleDaily } = await import("../server/darts");
      const { vnDay } = await import("../shared/league");
      const day = vnDay(new Date());
      // Leave only our players on today's board
      await pool.query("delete from darts_daily where day = $1", [day]);
      await pool.query("delete from darts_daily_results where day = $1", [day]);
      const ps = [new Player(), new Player(), new Player(), new Player()];
      for (const p of ps) await p.register();

      const [a] = ps;
      expect((await a.req("POST", "/api/darts/daily/throw", { ranked: true, x: 0, y: 0 })).status).toBe(409); // not started
      await sleep(260);
      expect((await a.req("POST", "/api/darts/daily/start", { ranked: true })).status).toBe(200);
      let last: any;
      for (let i = 0; i < 9; i++) {
        last = await a.req("POST", "/api/darts/daily/throw", { ranked: true, x: 0, y: -103, power: 1, drift: 0, holdMs: 1000 });
        expect(last.status).toBe(200);
        await sleep(260);
      }
      expect(last.body.done).toBe(true);
      expect(last.body.darts).toHaveLength(9);
      expect(last.body.score).toBe(last.body.darts.reduce((s: number, h: any) => s + h.score, 0));
      expect((await a.req("POST", "/api/darts/daily/throw", { ranked: true, x: 0, y: -103 })).status).toBe(409);
      expect((await a.req("POST", "/api/darts/daily/start", { ranked: true })).status).toBe(409); // only one a day
      // Practice runs are still allowed, and aren't ranked
      expect((await a.req("POST", "/api/darts/daily/start", { ranked: false })).status).toBe(200);
      await sleep(260);
      expect((await a.req("POST", "/api/darts/daily/throw", { ranked: false, x: 0, y: 0 })).status).toBe(200);

      // Fixed scores for the others (written straight in), then the board
      const scores = [300, 250, 200];
      for (const [i, p] of ps.slice(1).entries()) {
        const id = (await pool.query("select id from users where username = $1", [p.username])).rows[0].id;
        await pool.query("insert into darts_daily (user_id, day, darts, score) values ($1, $2, '[]'::jsonb, $3)", [id, day, scores[i]]);
      }
      await pool.query("update darts_daily set score = 100 where user_id = (select id from users where username = $1) and day = $2", [a.username, day]);
      const view = (await a.req("GET", "/api/darts/daily")).body;
      expect(view.top.map((t: any) => t.score)).toEqual([300, 250, 200, 100]);
      expect(view.me.rank).toBe(4);
      expect(view.me.ranked.done).toBe(true);
      expect(view.me.practice.darts).toHaveLength(1);
      expect(view.prizes).toEqual([500000, 200000, 100000]);

      const before = await Promise.all(ps.map(async (p) => (await p.state()).balance));
      const paid = await settleDaily(day);
      expect(paid?.map((w) => w.prize)).toEqual([500000, 200000, 100000]);
      expect(await settleDaily(day)).toBeNull(); // only once
      const after = await Promise.all(ps.map(async (p) => (await p.state()).balance));
      expect(after.map((v, i) => v - before[i])).toEqual([0, 500000, 200000, 100000]);
      const dep = await pool.query("select count(*)::int as n from deposits where method = 'darts_daily'");
      expect(dep.rows[0].n).toBe(3);
      const chat = await pool.query("select text from chat_messages where user_id = 'system' and text like $1", [`%${ps[1].username}%`]);
      expect(chat.rows).toHaveLength(1);
    });
  });
  describe("Meet (opt-in dating)", () => {
    async function ready(n: number) {
      const ps = Array.from({ length: n }, () => new Player());
      for (const p of ps) {
        await p.register();
        await pool.query("update users set games_played = 25, created_at = now() - interval '5 days', profile_image_url = '/api/avatar/x.jpg' where username = $1", [p.username]);
      }
      return ps;
    }
    const born = new Date().getUTCFullYear() - 30;
    const on = (p: Player, over: Record<string, unknown> = {}) => p.req("PUT", "/api/dating/me", { open: true, lookingFor: "dating", birthYear: born, gender: "man", seeking: [], ageMin: 18, ageMax: 99, ...over });

    it("needs a photo, some games and a few days before switching on, and 18+", async () => {
      const fresh = new Player();
      await fresh.register();
      const me = (await fresh.req("GET", "/api/dating/me")).body;
      expect(me.eligible).toBe(false);
      expect(me.needs.photo).toBe(true);
      expect((await on(fresh)).status).toBe(403);
      const [a] = await ready(1);
      expect((await on(a, { birthYear: new Date().getUTCFullYear() - 17 })).status).toBe(400);
      expect((await on(a, { ageMin: 50, ageMax: 30 })).status).toBe(400);
      const r = await on(a);
      expect(r.status).toBe(200);
      expect(r.body.open).toBe(true);
    });

    it("shows people whose settings fit both ways; 💛 is private until both tap it, then DMs open", async () => {
      const [a, b, c] = await ready(3);
      await on(a, { gender: "man", seeking: ["woman"] });
      await on(b, { gender: "woman", seeking: ["man"] });
      await on(c, { gender: "man", seeking: ["man"] });
      const seen = async (p: Player) => ((await p.req("GET", "/api/dating/people")).body.people as any[]).map((x) => x.username);
      expect(await seen(a)).toContain(b.username);
      expect(await seen(a)).not.toContain(c.username);
      expect(await seen(b)).not.toContain(c.username);
      // b only takes messages from friends
      await b.req("PUT", "/api/social/privacy", { dmFrom: "friends" });
      expect((await a.req("POST", "/api/dm/send", { to: b.username, text: "hi" })).status).toBe(403);
      const l1 = await a.req("POST", `/api/dating/like/${b.username}`);
      expect(l1.body).toEqual({ liked: true, matched: false });
      expect((await b.req("GET", "/api/notifications")).body.items.some((n: any) => n.kind === "dating")).toBe(false);
      const l2 = await b.req("POST", `/api/dating/like/${a.username}`);
      expect(l2.body.matched).toBe(true);
      expect((await a.req("GET", "/api/notifications")).body.items.some((n: any) => n.kind === "dating" && n.actor?.username === b.username)).toBe(true);
      expect((await a.req("GET", "/api/dating/matches")).body.matches.map((m: any) => m.username)).toEqual([b.username]);
      expect((await a.req("POST", "/api/dm/send", { to: b.username, text: "hello 💛" })).status).toBe(200);
      // A block hides them and closes the chat
      await b.req("POST", `/api/players/${a.username}/block`, { block: true });
      expect(await seen(b)).not.toContain(a.username);
      expect((await a.req("GET", "/api/dating/matches")).body.matches).toEqual([]);
    });

    it("deleting an account removes its Meet data", async () => {
      const [a, b] = await ready(2);
      await on(a); await on(b);
      await a.req("POST", `/api/dating/like/${b.username}`);
      await b.req("POST", `/api/dating/like/${a.username}`);
      const id = (await a.req("GET", "/api/me")).body.id;
      expect((await a.req("POST", "/api/user/delete", { password: a.password })).status).toBe(200);
      expect((await pool.query("select count(*)::int as n from dating_likes where from_id = $1 or to_id = $1", [id])).rows[0].n).toBe(0);
      expect((await pool.query("select count(*)::int as n from dating_profiles where user_id = $1", [id])).rows[0].n).toBe(0);
    });
  });
});
