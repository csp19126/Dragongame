# VnSlot 888 Dragon Fortune - Vietnamese Slot Machine Game

## Overview

VnSlot 888 Dragon Fortune is a full-stack web application featuring a Vietnamese/Oriental-themed slot machine game designed for the Vietnamese gambling market. It features an addictive, fast-paced gaming experience with rich animations, sound effects, achievement systems, streak tracking, and a competitive leaderboard. The app supports bilingual UI (English and Vietnamese) and uses a deep purple/gold color scheme.

## User Preferences

Preferred communication style: Simple, everyday language.
Design: Purple + gold color scheme; Oriental/Vietnamese aesthetic. No cartoonish symbols.
Symbols: 🐉🧧🏮💎🪙🎎🌸🏯⚔️📜
Target market: Vietnamese betting game players (Bắn Cá, Máy Xèng style)

## System Architecture

### Frontend (React + Vite)
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter - pages: Home (landing + game), Auth, Leaderboard, 404
- **State Management**: TanStack React Query v5 for server state
- **UI Components**: shadcn/ui (Radix primitives) with Tailwind CSS
- **Animations**: Framer Motion for slot reels, page transitions, streak effects; canvas-confetti for wins
- **Sound System**: Web Audio API-based `SoundManager` (`client/src/lib/sound.ts`) generating real-time sounds for spins, wins, bonuses, streaks
- **Styling**: Tailwind CSS with CSS variables (purple/gold/red palette), custom fonts (Lobster, Nunito, Roboto Mono)
- **Internationalization**: Custom `LanguageProvider` toggling EN/VI with keys for all game terms
- **Path aliases**: `@/` → `client/src/`, `@shared/` → `shared/`

### Key Components
- **SlotMachine** (`client/src/components/SlotMachine.tsx`): Core game with 3 reels, fast 1.5s spin cycles, auto-spin, near-miss highlighting, screen shake, particle effects, streak display, sound integration
- **AchievementBadge** (`client/src/components/AchievementBadge.tsx`): Badge display with Lucide icon mapping and pulse animations
- **StreakDisplay** (`client/src/components/StreakDisplay.tsx`): Win streak counter with tier labels (On Fire, Unstoppable, Dragon Mode)
- **Leaderboard** (`client/src/components/Leaderboard.tsx`): Ranked player list with Crown icons
- **Header** (`client/src/components/Header.tsx`): Animated balance counter, token display, notification bell, top-up button

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
  - `sessions` - Express session storage (connect-pg-simple)

### Game Mechanics
- **Symbols**: 🐉🧧🏮💎🪙🎎🌸🏯⚔️📜 (10 total)
- **Bet Amounts**: 1000, 5000, 10000, 50000, 100000 (Vietnamese Đồng style)
- **Win System**:
  - 3 match (Jackpot): 50x bet + 15 free spins
  - 2 match: 5x bet with dynamic multipliers (Dragon 3x, Gem 2.5x)
  - Bonus round: 30% on jackpot, 15% on 2-match (2x multiplier)
  - Repeater: 20% on jackpot (2x multiplier)
  - Wild multiplier: 5% chance for 2x/5x/10x on any win
- **Achievements**: 8 badges (first_win, hot_streak_3/5, dragon_master, high_roller, millionaire, jackpot_hunter, lucky_seven)
- **Streak Tracking**: Consecutive wins tracked, displayed with tier labels

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
