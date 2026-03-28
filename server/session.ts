import session from "express-session";
import connectPg from "connect-pg-simple";

export function getSessionMiddleware() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set");
  }

  const sessionTtlMs = 7 * 24 * 60 * 60 * 1000; // 1 week
  const PgStore = connectPg(session);

  const store = new PgStore({
    conString: process.env.DATABASE_URL,
    // Local dev: create the sessions table automatically if missing.
    // (This table isn't part of `shared/schema.ts`.)
    createTableIfMissing: true,
    ttl: sessionTtlMs,
    tableName: "sessions",
  });

  const isProd = process.env.NODE_ENV === "production";

  return session({
    secret: process.env.SESSION_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: sessionTtlMs,
    },
  });
}

