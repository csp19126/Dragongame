# VnSlot 888 · Dragon Fortune

A free-to-play, Vietnamese-style 5-reel slot game. **Play money only**: coins can't be bought
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

## Community (`/community`)

- **Chat**: one public room. Players unlock it after 3 games. The server enforces the rules in
  `shared/chat.ts`: links, phone numbers and any buying/selling of coins for real money are blocked,
  swearing is starred out, there are 3 seconds between messages, and 3 reports from different players
  hide a message. Admins hide or restore messages, mute (1h/24h/7d) or ban players, and set an
  announcement shown on the home page and in chat (Admin → Community).
- **Sticker album** (`shared/stickers.ts`): 4 Vietnamese sets of 6 with rarities. Packs of 3 come
  from a free daily pack, one pack per 25 games, and bonus packs. Completing a set pays 200K-1M coins
  and the full album pays 5M, each once. Five spare stickers swap for a pack; spares can be gifted
  (10 a day). Stickers can be sent in chat.
- **Invite a friend**: `/auth?ref=USERNAME`. The friend gets 50K extra at sign-up; once they've
  played 20 games the inviter claims 100K plus a sticker pack (up to 50 friends).

## Pool tournaments (`/tournament`)

Free to enter; the house pays coin prizes (default 5M / 2M / 500K to each losing semi-finalist), so
it's a skill competition with no stake. One is scheduled automatically every Saturday at 20:00
Vietnam time (13:00 UTC); admins can switch that off, create their own, start one early or cancel
one (Admin → Tournaments). At the start time the bracket is drawn at random (byes fill it to a
power of two) and each match opens as an online pool table with both players seated. Players get an
alert on any page and have 5 minutes to sit down; whoever turns up wins a no-show (a coin toss if
neither does). Everything is stored in the database, so a redeploy only restarts the frames being
played: a watchdog reopens tables for matches that lost theirs. The champion is announced in chat.

## Share cards

Big slot wins, online pool wins, tournament places and completed sticker sets offer a "share" button.
It draws a 1080×1920 picture in the browser (`client/src/lib/shareCard.ts`) with the win, the
player's name and a QR code of their invite link, then opens the phone's share sheet (or saves the
picture). The card says play coins have no cash value.

## Voucher codes

Admin → Promo codes lists every code with its value, batch, a note (who it was given to) and who
redeemed it. "Make a batch" creates up to 200 random codes like `VN888-K7QX-M2PA` at once. A starter
pack of 53 codes (50K to 5M) is generated once on first start; codes are made on the server at runtime
and are never in this repository. A link like `/auth?code=VN888-XXXX-XXXX` pre-fills the code at sign-up.

## The game

- **5 reels × 3 rows, 10 paylines.** 3, 4 or 5 of a kind in a row from the leftmost reel pays the
  multiple of the bet in the in-game paytable. The smallest prize is about the bet (🐟/🪙 ×0.8-1), so
  almost every win gives at least the stake back: 29% of spins pay, 21% are a profit.
- **🔒 GIỮ CUỘN (HOLD), like a pub fruit machine:** after a losing paid spin, 1 time in 5 the player
  may hold up to 2 reels for the next spin at the same bet (so it can't be farmed by raising the
  bet). Holds never follow a win or a held spin. Choices matter: `bestHold()` works out the exact
  value of every hold, and the published RTP is for those best holds.
- **🔮 Dragon Pearl (wild):** stands in for any symbol on a line, and a run of pearls pays by itself
  (×8 / ×40 / ×400); a line pays whichever reading is worth more.
- **🐉 Rồng Lặp (Repeater):** 3 or more 🔮 anywhere wake the dragon (about 1 spin in 350). The pearls
  stick, winning cells lock and every other cell re-spins for free. Each new winning line, or a line
  that grows longer (it pays the extra), pays ×2, then ×3, ×5, ×8, ×12; the chain continues while
  each repeat adds something. Pearls that land during repeats stick too.
- **🏺 Hũ Rồng progressive jackpot:** 1% of every paid bet feeds a shared pot that never drops below
  100,000,000. Three 🔮 on the middle row of reels 1-3, on the spin or any repeat, wins a share that
  grows with the bet: bet ÷ 1M of the pot (1K → 0.1%, 100K → 10%, 1M → the whole pot).
- **🧧 Red envelope (scatter) and Chọn Lì Xì:** pays anywhere: 3 → ×1, 4 → ×4, 5+ → ×20, plus 8 / 16 / 32
  free-spin units. The player picks how to take them: all the spins at ×1, half at ×2, a quarter at
  ×4, or a mystery envelope (one of those at random). Spins × multiplier is the same, so every pick
  is worth the same on average. More envelopes during free spins add spins at the same multiplier.
- **🥣 Xóc Đĩa double-up:** after a paid spin wins, the player may stake the win (or half of it) on four
  coins under a bowl: chẵn / lẻ ×2, four red / four white ×16, up to 5 rounds. Exactly fair odds
  (100% return), so it never changes the game's RTP; the server shakes the coins.
- **🎋 Xin Xăm oracle:** once an hour the player picks a topic (luck, wealth, love, work, health), may
  type a question (it never leaves the phone) and draws one of 24 fortune sticks with a Vietnamese
  verse, a meaning and advice. The stick's grade blesses the next spin: Đại Cát ×5, Thượng ×3,
  Trung ×2, Hạ ×1.5. The fortune is entertainment and says so.
- 50,000 coins on sign-up, 50,000 more every 20 hours, plus admin-created promo codes.
- Every cell is drawn independently with Node's `crypto.randomInt`. No near-miss forcing, no
  per-player tuning.
- **Return to player: 96.6% with the best holds (87.7% never holding) + 1% through the jackpot.**
  Measured over 40M simulated spins each way (±0.1%) and re-checked against the real engine
  (`npm run rtp`); tests check the hold maths against full enumeration, the first-spin line pays
  against the exact value from the paytable, and the whole game against both published figures.
  1 in 94 spins pays 10× or more; max seen about 4,300×.
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
