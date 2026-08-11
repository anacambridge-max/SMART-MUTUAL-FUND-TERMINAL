import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error("DATABASE_URL is required");
const g=globalThis as typeof globalThis & {__smartMfPool?:Pool};
export const pool=g.__smartMfPool??new Pool({connectionString:databaseUrl});
if(process.env.NODE_ENV!=="production")g.__smartMfPool=pool;
export const db=drizzle(pool);
