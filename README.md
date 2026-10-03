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
| `npm run rtp` | Exact return-to-player calculation over all 1,953,125 grids |
| `npm run build` | Production build into `dist/` |
| `npm run db:generate` | After changing `shared/schema.ts`, writes the next migration into `migrations/` |

Every push runs typecheck, tests against a real PostgreSQL, the build and a smoke test of the
built server (`.github/workflows/ci.yml`).

## The game

- 5 symbols, 5 paylines (3 rows + 2 diagonals). Three in a line pays the multiple of your bet
  shown in the in-game paytable (🐉 ×88.8, 🥁 ×10, 🌸 ×6, 🏮 ×2.5, 🪙 ×1). All lines add up.
- A spin paying 10× the bet or more awards 3 free spins at that same bet.
- The Dragon Oracle doubles your next spin's winnings, once an hour.
- 50,000 coins on sign-up, 50,000 more every 20 hours, plus admin-created promo codes.
- Every cell is drawn independently with Node's `crypto.randomInt`. No near-miss forcing, no
  per-player tuning. **RTP is exactly 95.98%** including free spins; a test enforces it.

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
