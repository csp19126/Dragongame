import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. On Railway, add a PostgreSQL database to the project and " +
      "reference it from this service (Variables → Add Reference → DATABASE_URL).",
  );
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_SIZE ?? 10),
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});

// An idle client erroring (e.g. the database restarted) must not crash the server
pool.on("error", (err) => console.error("[db] idle client error:", err.message));

export const db = drizzle(pool, { schema });
