// Database connection using node-postgres for local PostgreSQL
// Switched from @neondatabase/serverless to support local postgres (not Neon cloud)
import pg from 'pg';
const { Pool } = pg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { requireEnv } from "./env";

// Prefer STREAMBOT_DATABASE_URL, fallback to DATABASE_URL
const DATABASE_URL = process.env.STREAMBOT_DATABASE_URL || requireEnv(
  'DATABASE_URL',
  'DATABASE_URL or STREAMBOT_DATABASE_URL must be set. Did you forget to provision a database?'
);

console.log('[StreamBot DB] Using database:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));

// Database connection retry configuration
const DB_RETRY_CONFIG = {
  maxRetries: parseInt(process.env.DB_MAX_RETRIES || '5', 10),
  initialDelayMs: parseInt(process.env.DB_RETRY_DELAY_MS || '1000', 10),
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create pool first, before defining waitForDatabase
export const pool = new Pool({ 
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool errors to prevent crashes
pool.on('error', (err: Error) => {
  console.error('[Database] Unexpected pool error:', err);
});

export const db = drizzle(pool, { schema });

export async function waitForDatabase(): Promise<boolean> {
  let retries = 0;
  let delay = DB_RETRY_CONFIG.initialDelayMs;

  while (retries < DB_RETRY_CONFIG.maxRetries) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('[Database] ✓ Connection established');
      return true;
    } catch (error: any) {
      retries++;
      console.warn(`[Database] Connection attempt ${retries}/${DB_RETRY_CONFIG.maxRetries} failed:`, error.message);
      
      if (retries < DB_RETRY_CONFIG.maxRetries) {
        console.log(`[Database] Retrying in ${delay}ms...`);
        await sleep(delay);
        delay = Math.min(delay * DB_RETRY_CONFIG.backoffMultiplier, DB_RETRY_CONFIG.maxDelayMs);
      }
    }
  }

  console.error('[Database] ✗ Failed to connect after', DB_RETRY_CONFIG.maxRetries, 'attempts');
  return false;
}
