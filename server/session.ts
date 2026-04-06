// server/session.ts
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
    secret: "dragon_gold_888_secret", // Hardcoded for consistency
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: false, // Must be false for Railway's default setup
      sameSite: "lax",
      httpOnly: true,
      path: "/" // Ensures the cookie is sent for all /api calls
    },
  });
}