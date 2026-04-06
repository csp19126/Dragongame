import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db.js";

const PostgresStore = pgSession(session);

export function getSessionMiddleware() {
  return session({
    store: new PostgresStore({
      pool: pool,
      tableName: "session",
      createTableIfMissing: false // <--- CHANGED TO FALSE
    }),
    name: "dragon_session",
    secret: "dragon_gold_888_secret", 
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: false, 
      sameSite: "lax",
      httpOnly: true,
      path: "/" 
    },
  });
}