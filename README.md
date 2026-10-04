# VnSlot 888 · Dragon Fortune

A free-to-play, Vietnamese-style 3×3 slot game. **Play money only**: coins can't be bought
and can't be cashed out. Bilingual (Tiếng Việt / English), installable on phones as an app.

The server looks after itself:

- **Database:** creates its tables on first start and upgrades them on every deploy. Nothing to run by hand.
- **Session secret:** generates its own and remembers it.
- **Health checks:** `/api/health` reports whether the app and its database are up.
- **Packages:** the production server needs no `node_modules`, just Node, `dist/` and `migrations/`.

## Host it

### Railway (recommended)

1. Create a project from this GitHub repo. `railway.json` tells Railway to build the Dockerfile.
2. Add a **PostgreSQL** database to the same project.
3. In the game service's **Variables**, add a reference to the database's `DATABASE_URL`.
4. Optional: set `ADMIN_USERNAMES` to your username to get the Admin panel.
5. Under **Settings → Networking**, click **Generate Domain**. Done.

### Any machine with Docker

```bash
docker compose up -d      # game + database, open http://localhost:5000
```

### Any Node host (Render, Fly, a VPS…)

```bash
npm ci && npm run build
DATABASE_URL=postgresql://... node dist/index.js
```

### Settings

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `ADMIN_USERNAMES` | no | Comma-separated usernames that get the Admin panel |
| `SESSION_SECRET` | no | Your own session secret. Generated and stored in the DB if unset |
| `PORT` | no | Defaults to 5000 (Railway sets it automatically) |
| `COOKIE_SECURE` | no | Set to `false` only if you serve production over plain http |

## Develop

```bash
npm install
cp .env.example .env      # set DATABASE_URL
npm run dev               # http://localhost:5000, migrations run automatically
```

| Command | What it does |
|---|---|
| `npm run check` | TypeScript typecheck |
| `npm test` | Engine tests; API tests too when `TEST_DATABASE_URL` points at a throwaway database |
| `npm run rtp` | Return-to-player simulation of the real engine (20M spins by default) |
| `npm run build` | Production build into `dist/` |
| `npm run db:generate` | After changing `shared/schema.ts`, writes the next migration into `migrations/` |

Every push runs typecheck, tests against a real PostgreSQL, the build and a smoke test of the
built server (`.github/workflows/ci.yml`).

## The other games

All games share one coin balance; every result is drawn on the server.

- **🦀 Bầu Cua Tôm Cá** (`/bau-cua`): bet on six pictures, three dice; a picture on k dice pays k to 1. RTP 92.13% (exact).
- **🎡 Roulette** (`/roulette`): European single zero. RTP 97.30% (exact).
- **🃏 Xì Dách / Blackjack** (`/blackjack`): 6 decks shuffled every hand, dealer stands on all 17s,
  blackjack pays 3:2, double on any two cards (also after a split), split once, split aces get one card,
  dealer peeks. The hand lives on the server (the shoe and hole card never reach the browser).
  About 99.6% RTP with basic strategy (0.39% ± 0.12% edge over 4M simulated hands).
- **🎱 Bi-a 8 bóng / 8-ball pool** (`/pool`): play the computer for practice, or play other people
  online for a stake (free, 1K to 1M). Each player puts the stake up, the winner takes both; there is
  no house cut. Share an invite link (`/pool?table=CODE`) or join an open table from the lobby; anyone
  can watch live tables. The server is the referee: it runs the same deterministic physics
  (`shared/pool/engine.ts`) as the browsers and applies standard 8-ball rules (fouls give ball in
  hand). 45 seconds a shot; three timeouts or 90 seconds away loses the game. Live games are held in
  memory, so a redeploy cancels them and refunds both stakes on the next start.

## Voucher codes

Admin → Promo codes lists every code with its value, batch, a note (who it was given to) and who
redeemed it. "Make a batch" creates up to 200 random codes like `VN888-K7QX-M2PA` at once. A starter
pack of 53 codes (50K to 5M) is generated once on first start; codes are made on the server at runtime
and are never in this repository. A link like `/auth?code=VN888-XXXX-XXXX` pre-fills the code at sign-up.

## The game

- 3×3 grid, **9 paylines**: rows, diagonals, V shapes and zigzags. Three of a kind on a line pays
  the multiple of the bet in the in-game paytable (🐉 ×30, 🥁 ×3, 🌸 ×1.3, 🏮 ×0.7, 🐟 ×0.4, 🪙 ×0.4).
  Every amount is a multiple of the bet, so a 1M bet pays 1,000 times what a 1K bet pays.
- **🔮 Dragon Pearl (wild):** stands in for any symbol on a line; three pearls pay ×120.
- **🔁 Repeater (Rồng Lặp):** after a line win the winning symbols lock and every other cell re-spins
  for free. Each new winning line pays ×2, then ×3, ×5, ×8, ×12; the chain continues while each
  repeat wins something new.
- **🏺 Hũ Rồng progressive jackpot:** 1% of every paid bet feeds a shared pot that never drops below
  100,000,000. Three 🔮 on the middle row, on the spin or any repeat, wins a share that grows with
  the bet: bet ÷ 1M of the pot (1K → 0.1%, 100K → 10%, 1M → the whole pot), so every bet wins at
  least 100× itself.
- **🧧 Red envelope (scatter):** pays anywhere on the grid. 3 → ×1 + 5 free spins, 4 → ×5 + 8,
  5+ → ×25 + 10. Free spins play at the bet that won them.
- The Dragon Oracle doubles your next spin's winnings, once an hour.
- 50,000 coins on sign-up, 50,000 more every 20 hours, plus admin-created promo codes.
- Every cell is drawn independently with Node's `crypto.randomInt`. No near-miss forcing, no
  per-player tuning.
- **Return to player: 95.8% from the game + 1% through the jackpot = 96.8%.** Measured over 60M
  simulated spins (±0.1%) and re-checked against the real engine (`npm run rtp`); a test enforces it.
  About 32% of spins pay something, 20% are a profit, 1 in 82 pays 10× or more, max seen 1,900×.
- Celebrations scale with the win (coin pop → BIG WIN fireworks → MEGA WIN → DRAGON FORTUNE →
  NỔ HŨ for the jackpot). Spins that pay back less than the bet are labelled honestly as small
  wins and are not celebrated. Reels are animated from JavaScript, so they spin even on phones
  or browsers that switch CSS animations off.

## Code map

| Path | What's there |
|---|---|
| `shared/schema.ts` | Database tables, paytable, bets, game constants |
| `server/game.ts` | The pure slot engine |
| `server/storage.ts` | Database access; each spin is one transaction with a conditional balance update |
| `server/routes.ts` | HTTP API |
| `server/app.ts` / `server/index.ts` | App setup (security headers, sessions, health) / startup and shutdown |
| `server/migrate.ts`, `migrations/` | Automatic schema migrations |
| `client/src/components/SlotMachine.tsx` | The machine UI |
| `tests/` | Engine and API tests |
