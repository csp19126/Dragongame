# VnSlot - Vietnamese-Themed Slot Machine Game

## Overview

VnSlot is a full-stack web application featuring a Vietnamese-themed slot machine game with a vibrant red/gold/purple aesthetic. Players can register, spin slot reels, track their balance, and compete on a leaderboard. The app supports bilingual UI (English and Vietnamese) and includes AI integration features for voice chat, image generation, and chat conversations.

The game logic (spinning, win calculation, balance management) is handled server-side via API endpoints, while the frontend animates results with Framer Motion and canvas-confetti for celebrations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (React + Vite)
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight client-side router) with pages: Home, Auth, Leaderboard, 404
- **State Management**: TanStack React Query for server state (caching, mutations, invalidation)
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives with Tailwind CSS
- **Animations**: Framer Motion for slot reel animations and page transitions; canvas-confetti for win celebrations
- **Styling**: Tailwind CSS with CSS variables for theming (purple/gold/red palette), custom fonts (Lobster, Nunito, Roboto Mono)
- **Internationalization**: Custom React Context (`LanguageProvider`) toggling between English and Vietnamese translations
- **Auth Context**: Custom `AuthProvider` wrapping React Query to manage user session state
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend (Express + Node.js)
- **Framework**: Express.js with TypeScript, run via `tsx` in development
- **API Pattern**: REST endpoints under `/api/` prefix (register, login, game/spin, game/state, leaderboard)
- **Route Definitions**: Shared route/schema definitions in `shared/routes.ts` using Zod for input validation
- **Build**: Custom build script using esbuild for server + Vite for client, outputs to `dist/`
- **Static Serving**: Production serves built client from `dist/public/`, development uses Vite middleware with HMR

### Database (PostgreSQL + Drizzle ORM)
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Connection**: `node-postgres` Pool via `DATABASE_URL` environment variable
- **Schema Location**: `shared/schema.ts` (main tables) + `shared/models/` (auth, chat models)
- **Key Tables**:
  - `users` - Player accounts with username, password, balance (default 1000)
  - `game_states` - Per-user slot machine state (last spin result, free spins)
  - `sessions` - Express session storage for Replit Auth (managed by connect-pg-simple)
  - `conversations` / `messages` - Chat/voice conversation storage
- **Migrations**: Drizzle Kit with `db:push` command for schema sync
- **Note**: There is a schema conflict - `shared/schema.ts` defines `users` with serial integer ID, while `shared/models/auth.ts` also exports a `users` table with varchar UUID ID for Replit Auth. The main app schema's `users` table is the one used for gameplay.

### Authentication
- **Dual Auth System**: 
  1. Replit Auth (OpenID Connect) via `server/replit_integrations/auth/` - uses passport with OIDC strategy, session-based
  2. Simple username/password auth via `/api/register` and `/api/login` endpoints
- **Session Storage**: PostgreSQL-backed sessions via `connect-pg-simple`
- **Environment Variables Required**: `DATABASE_URL`, `SESSION_SECRET`, `ISSUER_URL`, `REPL_ID`

### Storage Layer
- **Pattern**: Repository/Storage pattern with `IStorage` interface in `server/storage.ts`
- **Implementation**: `DatabaseStorage` class using Drizzle ORM queries
- **Singleton**: Exported as `storage` instance

### AI Integrations (Replit-specific)
- Located in `server/replit_integrations/` and `client/replit_integrations/`
- **Audio/Voice**: OpenAI-based speech-to-text, text-to-speech, voice chat with SSE streaming
- **Image Generation**: OpenAI gpt-image-1 model for image generation/editing
- **Chat**: Conversation management with OpenAI completions
- **Batch Processing**: Generic utility for rate-limited parallel API calls
- **Environment Variables**: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Game Logic
- Slot symbols: 🐉 🐯 🐢 🌺 🪙 🏮
- Spin endpoint: `POST /api/game/spin` with `slotId` and `betAmount`
- Returns: result symbols, win amount, new balance, free spins, jackpot flag
- Balance starts at 1000 for new users
- Frontend animates rapid symbol changes then settles on server-returned result

## External Dependencies

### Required Services
- **PostgreSQL Database**: Connected via `DATABASE_URL` environment variable. Required for all data storage.
- **Replit Auth (OIDC)**: OpenID Connect provider at `ISSUER_URL` (defaults to `https://replit.com/oidc`). Requires `REPL_ID` and `SESSION_SECRET`.

### Optional AI Services
- **OpenAI API** (via Replit AI Integrations): Used for voice chat, image generation, and text chat. Requires `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`.
- **ffmpeg**: Required on the system for audio format conversion in voice features.

### Key NPM Packages
- **Frontend**: react, wouter, @tanstack/react-query, framer-motion, canvas-confetti, lucide-react, shadcn/ui (Radix primitives), tailwindcss
- **Backend**: express, drizzle-orm, pg, passport, express-session, connect-pg-simple, openid-client, openai, zod
- **Build Tools**: vite, esbuild, tsx, drizzle-kit