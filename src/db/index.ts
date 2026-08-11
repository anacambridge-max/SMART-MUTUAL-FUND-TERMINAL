import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const g = globalThis as typeof globalThis & { __smartMfPool?: Pool };

// Keep the module import-safe during `next build`. Runtime database-backed
// routes still require DATABASE_URL, but the build itself should not fail just
// because CI does not have production secrets configured.
export const pool =
  g.__smartMfPool ??
  new Pool({
    connectionString: databaseUrl ?? "postgresql://build:build@localhost:5432/build",
  });

if (process.env.NODE_ENV !== "production") g.__smartMfPool = pool;

export const db = databaseUrl
  ? drizzle(pool)
  : new Proxy({} as ReturnType<typeof drizzle>, {
      get() {
        throw new Error("DATABASE_URL is required for database operations");
      },
    });
