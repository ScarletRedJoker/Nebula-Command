import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as platformSchema from "./platform-schema";
import * as aiSandboxSchema from "./ai-sandbox-schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const schema = { ...platformSchema, ...aiSandboxSchema };

export const db = drizzle(pool, { schema });

export function isDbConnected(): boolean {
  return !!process.env.DATABASE_URL;
}
