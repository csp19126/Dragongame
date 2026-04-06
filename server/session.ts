import session from "express-session";
import MemoryStore from "memorystore";

const SessionStore = MemoryStore(session);

export function getSessionMiddleware() {
  return session({
    name: "dragon_session",
    secret: "dragon_gold_888", 
    resave: true,              // Force the session to stay active during DB writes
    saveUninitialized: false,
    proxy: true,               // Required for Railway's networking
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      secure: false,           // Set to true only if you have forced SSL
      sameSite: "lax",
      httpOnly: true,
    },
    store: new SessionStore({
      checkPeriod: 86400000
    }),
  });
}