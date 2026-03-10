# VnSlot 888 Dragon Fortune - Vietnamese Slot Machine Game

## Overview

VnSlot 888 Dragon Fortune is a full-stack web application featuring a Vietnamese/Oriental-themed slot machine game designed for the Vietnamese gambling market. It features an addictive, fast-paced gaming experience with rich animations, sound effects, achievement systems, streak tracking, and a competitive leaderboard. The app supports bilingual UI (English and Vietnamese) and uses a deep purple/gold color scheme. Includes a gift card deposit system, withdrawal requests, profile page, and PWA support for mobile install.

## User Preferences

Preferred communication style: Simple, everyday language.
Design: Purple + gold color scheme; Oriental/Vietnamese aesthetic. No cartoonish symbols.
Symbols: 🐉🧧🏮💎🪙🎎🌸🏯⚔️📜
Target market: Vietnamese betting game players (Bắn Cá, Máy Xèng style)

## System Architecture

### Frontend (React + Vite)
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter - pages: Home (landing + game), Auth, Leaderboard, Deposit (with withdrawal tab), About, Terms, Profile, 404
- **State Management**: TanStack React Query v5 for server state
- **UI Components**: shadcn/ui (Radix primitives) with Tailwind CSS
- **Animations**: Framer Motion for slot reels, page transitions, streak effects; canvas-confetti for wins
- **Sound System**: Web Audio API-based `SoundManager` (`client/src/lib/sound.ts`) generating real-time sounds for spins, wins, bonuses, streaks, bet changes, auto-spin toggle, button clicks
- **Styling**: Tailwind CSS with CSS variables (purple/gold/red palette), custom fonts (Lobster, Nunito, Roboto Mono). SlotMachine colors centralized in CSS variables (--slot-gold, --slot-purple, etc.)
- **Internationalization**: Custom `LanguageProvider` toggling EN/VI with 60+ keys covering all game terms, landing page, dashboard, overlays, deposit/withdrawal, profile, about/terms/privacy/support
- **PWA**: manifest.json, service worker (static asset caching only, excludes /api/*), installable on Android/iOS home screen
- **Path aliases**: `@/` → `client/src/`, `@shared/` → `shared/`

### Key Components
- **SlotMachine** (`client/src/components/SlotMachine.tsx`): Core game with 3×3 grid (3 columns × 3 rows), 5 paylines (3 horizontal + 2 diagonal), ~0.9s spin cycles, auto-spin with sound feedback, near-miss system, fake repeater overlays, screen flash/shake, payline highlighting with SVG overlays. Mobile-responsive with aspect-ratio cells, responsive bet buttons. Colors use CSS variables for theming.
- **AchievementBadge** (`client/src/components/AchievementBadge.tsx`): Badge display with Lucide icon mapping and pulse animations
- **StreakDisplay** (`client/src/components/StreakDisplay.tsx`): Win streak counter with tier labels
- **Leaderboard** (`client/src/components/Leaderboard.tsx`): Ranked player list with Crown icons
- **Header** (`client/src/components/Header.tsx`): Animated balance counter, notification bell, top-up button, profile link in dropdown

### Pages
- **Home** (`client/src/pages/Home.tsx`): Landing page (unauthenticated) or 3-column game dashboard (authenticated) with footer. Fully i18n'd.
- **Deposit** (`client/src/pages/Deposit.tsx`): Gift card redemption + withdrawal request tab with history, contact agent flow
- **Profile** (`client/src/pages/Profile.tsx`): Editable username, first name, last name; stats display grid
- **About** (`client/src/pages/About.tsx`): Company branding page with stats, features, team info (bilingual)
- **Terms** (`client/src/pages/Terms.tsx`): Terms of service (bilingual, 9 sections)

### Backend (Express + Node.js)
- **Framework**: Express.js with TypeScript via `tsx`
- **API Endpoints**:
  - `POST /api/register` - Create account (bcrypt hashed password)
  - `POST /api/login` - Login (bcrypt compare, backward-compatible with legacy plaintext, auto-rehashes on login)
  - `GET /api/me` - Current user
  - `GET /api/game/state` - Balance, streak, stats
  - `POST /api/game/spin` - Spin with atomic balance deduction/credit
  - `GET /api/game/leaderboard` - Top 10 players
  - `GET /api/achievements/:userId` - User's unlocked badges
  - `POST /api/deposits/gift-card` - Redeem gift card code
  - `GET /api/deposits/history` - Deposit transaction history
  - `POST /api/withdrawals/request` - Submit withdrawal request
  - `GET /api/withdrawals/history` - Withdrawal history
  - `GET /api/user/profile` - Get profile data
  - `PATCH /api/user/profile` - Update profile
  - `GET /api/ai/predict` - Oracle advice
  - `POST /api/admin/gift-balance` - Admin: gift balance (ADMIN_KEY env var)
  - `POST /api/admin/create-gift-card` - Admin: create gift card (ADMIN_KEY env var)
- **Password Security**: bcryptjs with salt rounds 10. Legacy plaintext passwords auto-upgraded to bcrypt on successful login.
- **Route Definitions**: Shared in `shared/routes.ts` with Zod validation

### Database (PostgreSQL + Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Connection**: `node-postgres` Pool via `DATABASE_URL`
- **Schema**: `shared/schema.ts`
- **Key Tables**:
  - `users` - id, username, password (bcrypt hashed), email, balance, tokens, streak, maxStreak, totalWins, maxWin, gamesPlayed, profile fields, timestamps
  - `game_states` - userId, slotId, lastSpinResult, freeSpins, consecutiveWins
  - `achievements` - userId, badgeId, badgeName, description, icon, unlockedAt
  - `deposits` - userId, amount, method, cardCode, status, createdAt
  - `gift_cards` - code (unique), denomination, isRedeemed, redeemedBy, createdAt, redeemedAt. Auto-seeded on startup.
  - `withdrawals` - id, userId, amount, status (pending/completed/rejected), note, createdAt, updatedAt
  - `sessions` - Express session storage (connect-pg-simple)
- **Atomic Operations**: `deductBalanceAtomic` and `creditBalanceAtomic` use SQL-level arithmetic with WHERE balance checks to prevent race conditions

### Game Mechanics
- **Symbols**: 🐉🧧🏮💎🪙🎎🌸🏯⚔️📜 (10 total)
- **Bet Amounts**: 1K, 5K, 10K, 50K, 100K, 500K, 1M (Vietnamese Đồng style)
- **Grid**: 3×3 (3 columns × 3 rows), backend returns `grid: string[][]` (grid[col][row]) and `winLines: number[]`
- **Paylines** (5 total):
  - Line 0: Top horizontal row
  - Line 1: Middle horizontal row
  - Line 2: Bottom horizontal row
  - Line 3: Diagonal top-left → bottom-right
  - Line 4: Diagonal bottom-left → top-right
- **Win System** (Designed for addiction/retention):
  - 3+ line match: 100x bet + 20 free spins — 0.3% chance
  - 2 line match: 25x bet + 10 free spins — jackpot tier
  - 1 line match: 5-8x bet (Dragon 8x, Diamond 7x, Envelope 6x, others 5x); diagonal lines pay 1.5x bonus
  - 2-of-3 partial wins: 15% chance for 1.5-3.5x bet
  - Near-miss (forced 2-match-but-miss): ~40% of spins show adjacent symbol breaking a payline
  - Fake repeaters: ~12% of near-misses trigger a "REPEATER!" overlay but no actual win
- **Spin Speed**: ~900ms total cycle (250ms base + 180ms per column gap)
- **Achievements**: 8 badges (first_win, hot_streak_3/5, dragon_master, high_roller, millionaire, jackpot_hunter, lucky_seven)

### Deposit & Withdrawal System
- **Gift Cards**: Auto-seeded on startup (DRAGON-50K-2024, FORTUNE-100K-888, LUCKY-500K-VIP, PHOENIX-1M-GOLD, EMPEROR-5M-PLAT, DRAGON-10M-ULTRA, WELCOME-50K-NEW, VIP-100K-2024, SUSU-10M-VIP)
- **Withdrawals**: "Contact agent" flow — user submits amount + optional note, balance deducted atomically, status starts as "pending"
- **Contact**: Agents via Zalo/Telegram for card purchases and withdrawal processing

### Authentication
- **Dual Auth**:
  1. Replit Auth (OIDC) via passport
  2. Username/password via /api/register and /api/login (bcrypt hashed)
- **Session**: PostgreSQL-backed via connect-pg-simple
- **Env Vars**: DATABASE_URL, SESSION_SECRET, ISSUER_URL, REPL_ID, ADMIN_KEY (optional)

### CSS Animation & Variable System (`client/src/index.css`)
- Custom keyframes: symbolFloat, coinDrop, screenShake, pulseGlow, streakFire, reelBlur, winExplosion, autoSpinBorder, balanceFlash, nearMissPulse, spinButtonPulse, edgeGlow, winCellGlow
- SlotMachine CSS variables: --slot-gold, --slot-purple, --slot-frame-*, --slot-grid-*, --slot-payline-*, --slot-win-*, --slot-spin-*
- All animations use GPU-accelerated properties (transform, opacity) for 60fps

## External Dependencies

### Required Services
- PostgreSQL Database via DATABASE_URL
- Replit Auth (OIDC) - ISSUER_URL, REPL_ID, SESSION_SECRET

### Key NPM Packages
- Frontend: react, wouter, @tanstack/react-query, framer-motion, canvas-confetti, lucide-react, shadcn/ui, tailwindcss
- Backend: express, drizzle-orm, pg, passport, express-session, connect-pg-simple, openid-client, zod, bcryptjs
- Build: vite, esbuild, tsx, drizzle-kit
