/**
 * db.ts — Database connection pool (Single Responsibility: only manages the connection)
 *
 * TWO TABLES:
 *   1. daily_solves  → LeetCode problem tracking + backfill tracking
 *   2. auth_users    → Login auth & authorisation (whitelist + admin unified)
 */
import { Pool, QueryResult } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.SUPABASE_DATABASE_URL || "",
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function dbQuery(text: string, params?: unknown[]): Promise<QueryResult> {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/**
 * setupDb — Creates BOTH tables on first run.
 *
 * TABLE 1: daily_solves
 *   username, date, solve_count, backfilled (whether this date was backfilled), updated_at
 *
 * TABLE 2: auth_users
 *   Unified auth: admins have password_hash + is_admin=true
 *   Whitelisted regular users have is_admin=false, password_hash=NULL (email-only access)
 */
export async function setupDb(): Promise<void> {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS daily_solves (
      username      TEXT      NOT NULL,
      date          DATE      NOT NULL,
      solve_count   INTEGER   NOT NULL DEFAULT 0,
      backfilled    BOOLEAN   NOT NULL DEFAULT FALSE,
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (username, date)
    );
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_daily_solves_date ON daily_solves (date);
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id            SERIAL    PRIMARY KEY,
      email         TEXT      NOT NULL UNIQUE,
      password_hash TEXT,
      is_admin      BOOLEAN   NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}
