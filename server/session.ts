import session from "express-session";
import MemoryStore from "memorystore";

const MemoryStoreSession = MemoryStore(session);

export function getSessionMiddleware() {
  return session({
    secret: process.env.SESSION_SECRET || "dragongame-secret-key",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStoreSession({ checkPeriod: 86400000 }),
    proxy: true, 
    cookie: {
      httpOnly: true,
      secure: true, 
      sameSite: 'none', 
      maxAge: 7 * 24 * 60 * 60 * 1000, 
    },
  });
}