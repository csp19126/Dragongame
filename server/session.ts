import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db";

const PostgresStore = pgSession(session);

export function getSessionMiddleware(secret: string) {
  const isProd = process.env.NODE_ENV === "production";
  return session({
    store: new PostgresStore({
      pool,
      tableName: "session",
      createTableIfMissing: false, // created by the migrations
      pruneSessionInterval: 60 * 15,
    }),
    name: "dragon_session",
    secret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      // HTTPS-only in production. Set COOKIE_SECURE=false to run production over plain http.
      secure: isProd && process.env.COOKIE_SECURE !== "false",
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    },
  });
}
