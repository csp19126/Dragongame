# VnSlot 888 Dragon Fortune - Vietnamese Slot Machine Game

## Overview

VnSlot 888 Dragon Fortune is a full-stack web application featuring a Vietnamese/Oriental-themed slot machine game designed for the Vietnamese gambling market. It features an addictive, fast-paced gaming experience with rich animations, sound effects, achievement systems, streak tracking, and a competitive leaderboard. The app supports bilingual UI (English and Vietnamese) and uses a deep purple/gold color scheme. Includes a gift card deposit system and professional branding pages.

## User Preferences

Preferred communication style: Simple, everyday language.
Design: Purple + gold color scheme; Oriental/Vietnamese aesthetic. No cartoonish symbols.
Symbols: 🐉🧧🏮💎🪙🎎🌸🏯⚔️📜
Target market: Vietnamese betting game players (Bắn Cá, Máy Xèng style)

## System Architecture

### Frontend (React + Vite)
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter - pages: Home (landing + game), Auth, Leaderboard, Deposit, About, Terms, 404
- **State Management**: TanStack React Query v5 for server state
- **UI Components**: shadcn/ui (Radix primitives) with Tailwind CSS
- **Animations**: Framer Motion for slot reels, page transitions, streak effects; canvas-confetti for wins
- **Sound System**: Web Audio API-based `SoundManager` (`client/src/lib/sound.ts`) generating real-time sounds for spins, wins, bonuses, streaks
- **Styling**: Tailwind CSS with CSS variables (purple/gold/red palette), custom fonts (Lobster, Nunito, Roboto Mono)
- **Internationalization**: Custom `LanguageProvider` toggling EN/VI with keys for all game terms + deposit/about/terms/privacy/support
- **Path aliases**: `@/` → `client/src/`, `@shared/` → `shared/`

### Key Components
- **SlotMachine** (`client/src/components/SlotMachine.tsx`): Core game with 3 reels, ~0.9s spin cycles, auto-spin, near-miss system with dramatic 3rd reel slowdown, fake repeater overlays, screen flash/shake effects, particle effects, share button, loss-streak encouragement, streak display, enhanced sound integration. Premium cabinet design with ambient edge glow, glass/scanline effects.
- **AchievementBadge** (`client/src/components/AchievementBadge.tsx`): Badge display with Lucide icon mapping and pulse animations
- **StreakDisplay** (`client/src/components/StreakDisplay.tsx`): Win streak counter with tier labels (On Fire, Unstoppable, Dragon Mode)
- **Leaderboard** (`client/src/components/Leaderboard.tsx`): Ranked player list with Crown icons
- **Header** (`client/src/components/Header.tsx`): Animated balance counter, token display, notification bell, top-up button linked to /deposit

### Pages
- **Home** (`client/src/pages/Home.tsx`): Landing page (unauthenticated) or 3-column game dashboard (authenticated) with footer
- **Deposit** (`client/src/pages/Deposit.tsx`): Gift card redemption, deposit tiers, transaction history
- **About** (`client/src/pages/About.tsx`): Company branding page with stats, features, team info (bilingual)
- **Terms** (`client/src/pages/Terms.tsx`): Terms of service (bilingual, 9 sections)

### Backend (Express + Node.js)
- **Framework**: Express.js with TypeScript via `tsx`
- **API Endpoints**:
  - `POST /api/register` - Create account
  - `POST /api/login` - Login
  - `GET /api/me` - Current user
  - `GET /api/game/state` - Balance, streak, stats
  - `POST /api/game/spin` - Spin with bet, returns result + achievements
  - `GET /api/game/leaderboard` - Top 10 players
  - `GET /api/achievements/:userId` - User's unlocked badges (auth required)
  - `POST /api/deposits/gift-card` - Redeem gift card code, add balance
  - `GET /api/deposits/history` - User's deposit transaction history
  - `GET /api/ai/predict` - Oracle advice
- **Route Definitions**: Shared in `shared/routes.ts` with Zod validation

### Database (PostgreSQL + Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Connection**: `node-postgres` Pool via `DATABASE_URL`
- **Schema**: `shared/schema.ts`
- **Key Tables**:
  - `users` - id, username, password, email, balance, tokens, streak, maxStreak, totalWins, maxWin, gamesPlayed, profile fields, timestamps
  - `game_states` - userId, slotId, lastSpinResult, freeSpins, consecutiveWins
  - `achievements` - userId, badgeId, badgeName, description, icon, unlockedAt
  - `deposits` - userId, amount, method, cardCode, status, createdAt
  - `gift_cards` - code (unique), denomination, isRedeemed, redeemedBy, createdAt, redeemedAt
  - `sessions` - Express session storage (connect-pg-simple)

### Game Mechanics
- **Symbols**: 🐉🧧🏮💎🪙🎎🌸🏯⚔️📜 (10 total)
- **Bet Amounts**: 1000, 5000, 10000, 50000, 100000 (Vietnamese Đồng style)
- **Win System** (Designed for addiction/retention):
  - 3 match (Jackpot): 50x bet + 15 free spins — 0.5% chance
  - 2 match (real win): 2-5x bet with Dragon 2x / Gem 1.5x multipliers — ~11.5% chance
  - Near-miss (forced 2-match-but-miss): ~43% of spins show 2 matching + adjacent symbol on 3rd reel, creating "almost won" feel
  - Fake repeaters: ~12% of near-misses trigger a "REPEATER!" announcement with animation but the re-spin produces a loss
  - Remaining ~45% are clean losses (all different symbols)
  - Wild multiplier: 3% chance for 2x/3x/5x on any win
  - Free spins on 2-match wins: 8% chance for 3-5 free spins
- **Spin Speed**: ~900ms total cycle (250ms base + 180ms per reel gap), vs previous 1700ms. Near-miss spins use 350ms gap with dramatic 3rd reel slowdown
- **Encouragement System**: After 5+ consecutive losses, shows motivating messages ("Almost there!", "Dragon stirs... BIG WIN incoming!")
- **Share Feature**: Win amounts ≥3x bet show a "Share Win" button (Web Share API / clipboard fallback)
- **Near-miss Effects**: "SO CLOSE!" overlay, screen shake, descending tension sound, red glow pulse on matched reels
- **Fake Repeater Effects**: "REPEATER! Re-spinning for bonus..." overlay with cyan glow and spinning icon, disappears after 2.5s
- **Screen Flash**: Purple flash on spin start, gold flash on big win, cyan flash on fake repeater
- **Achievements**: 8 badges (first_win, hot_streak_3/5, dragon_master, high_roller, millionaire, jackpot_hunter, lucky_seven)
- **Streak Tracking**: Consecutive wins tracked, displayed with tier labels

### Deposit System
- **Gift Cards**: Pre-seeded codes (DRAGON-50K-2024, FORTUNE-100K-888, etc.)
- **Tiers**: 50K, 100K, 500K, 1M, 5M, 10M with bonus percentages
- **Flow**: User enters code → backend validates → marks redeemed → adds balance → creates deposit record
- **Contact**: Agents via Zalo/Telegram for card purchases

### Authentication
- **Dual Auth**:
  1. Replit Auth (OIDC) via passport
  2. Username/password via /api/register and /api/login
- **Session**: PostgreSQL-backed via connect-pg-simple
- **Env Vars**: DATABASE_URL, SESSION_SECRET, ISSUER_URL, REPL_ID

### CSS Animation System (`client/src/index.css`)
- Custom keyframes: symbolFloat, coinDrop, screenShake, pulseGlow, streakFire, reelBlur, winExplosion, autoSpinBorder, balanceFlash, nearMissPulse, sparkle
- Utility classes: .win-explosion, .streak-badge, .auto-spin-active, .symbol-float, .reel-spinning, .balance-change, .near-miss-pulse, .screen-shake, .pulse-glow, .coin-drop
- All animations use GPU-accelerated properties (transform, opacity) for 60fps

## External Dependencies

### Required Services
- PostgreSQL Database via DATABASE_URL
- Replit Auth (OIDC) - ISSUER_URL, REPL_ID, SESSION_SECRET

### Key NPM Packages
- Frontend: react, wouter, @tanstack/react-query, framer-motion, canvas-confetti, lucide-react, shadcn/ui, tailwindcss
- Backend: express, drizzle-orm, pg, passport, express-session, connect-pg-simple, openid-client, zod
- Build: vite, esbuild, tsx, drizzle-kit
