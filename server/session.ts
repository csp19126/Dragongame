import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db.js";

const PostgresStore = pgSession(session);

export function getSessionMiddleware() {
  return session({
    store: new PostgresStore({
      pool: pool,                // Using the pool from your db.ts
      tableName: "session",      // Database table for logins
      createTableIfMissing: true // Automatically creates the table
    }),
    name: "dragon_session",
    secret: "dragon_gold_888",
    resave: false,               
    saveUninitialized: false,
    proxy: true,                 // Essential for Railway/Cloud hosting
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // Stay logged in for 30 days
      secure: false,             
      sameSite: "lax",
      httpOnly: true,
    },
  });
}