import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db.js";

const PostgresStore = pgSession(session);

export function getSessionMiddleware() {
  return session({
    store: new PostgresStore({
      pool: pool,
      tableName: "session",
      createTableIfMissing: true
    }),
    name: "dragon_session",
    secret: "dragon_gold_888_secret", 
    resave: true,                // Force save to ensure it writes to DB
    saveUninitialized: true,     // Create a session even before login to test connectivity
    proxy: true,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: false,             // MUST be false for non-HTTPS or proxy setups
      sameSite: "lax",           // Required for subdomains
      httpOnly: false,           // Set to false temporarily so we can "see" it in DevTools
      path: "/" 
    },
  });
}