# VnSlot 888 · Dragon Fortune

A free-to-play, Vietnamese-style 3×3 slot game. **Play money only**: coins can't be bought
and can't be cashed out. Bilingual (Tiếng Việt / English), installable on phones as a PWA.

## Run it locally

Needs Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and SESSION_SECRET
npm run db:push             # creates / migrates the tables (safe on existing data)
npm run dev                 # http://localhost:5000
```

## Deploy (Railway, Replit, anything with Node + Postgres)

```bash
npm run build && npm start  # serves on $PORT
```

Environment variables:

| Name | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `SESSION_SECRET` | yes in production | Long random string (`openssl rand -hex 32`) |
| `ADMIN_USERNAMES` | no | Comma-separated usernames that get the Admin panel |
| `PORT` | no | Defaults to 5000 |

Production cookies are HTTPS-only, so serve it over HTTPS (Railway/Replit do this for you).

## The game

- 5 symbols, 5 paylines (3 rows + 2 diagonals). Three in a line pays the multiple of your bet
  shown in the in-game paytable (🐉 ×88.8, 🥁 ×10, 🌸 ×6, 🏮 ×2.5, 🪙 ×1).
- A spin paying 10× the bet or more awards 3 free spins at that same bet.
- The Dragon Oracle doubles your next spin's winnings, once an hour.
- 50,000 coins on sign-up, 50,000 more every 20 hours, plus admin-created promo codes.
- Every cell is drawn independently with Node's `crypto.randomInt`. No near-miss forcing,
  no per-player tuning.
- **RTP is exactly 95.98%** including free spins. Verify with `npm run rtp`, which
  enumerates all 1,953,125 grids and cross-checks the real engine with 2M simulated spins.

## Code map

- `shared/schema.ts`: database tables, paytable, bets, game constants
- `server/game.ts`: the pure slot engine
- `server/storage.ts`: database access; `spin()` runs as one transaction with a conditional
  balance update, so parallel requests can't double-spend
- `server/routes.ts`: the HTTP API
- `client/src/components/SlotMachine.tsx`: the machine UI
- `script/rtp.ts`: exact RTP calculator
