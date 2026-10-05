import { AsyncLocalStorage } from 'node:async_hooks';
import pg, { type PoolClient, type QueryResultRow } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const { Pool } = pg;

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

const context = new AsyncLocalStorage<Queryable>();

const globalDB = globalThis as unknown as {
  karierPool?: pg.Pool;
  karierPGLite?: PGlite;
  karierPGLiteInitPromise?: Promise<PGlite>;
};

function pool(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum dikonfigurasi');
  return (globalDB.karierPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  }));
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS residents (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, block TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES residents(id),
 amount INTEGER NOT NULL CHECK(amount>0 AND amount%5000=0), paid_date TEXT NOT NULL,
 start_month TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 channel TEXT NOT NULL DEFAULT 'cash' CHECK(channel IN ('cash','DANA','OVO','GoPay','bank','other'))
);
CREATE TABLE IF NOT EXISTS cash_entries (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
 amount INTEGER NOT NULL CHECK(amount>0), date TEXT NOT NULL, description TEXT NOT NULL,
 channel TEXT NOT NULL DEFAULT 'cash' CHECK(channel IN ('cash','DANA','OVO','GoPay','bank','other'))
);
CREATE TABLE IF NOT EXISTS loans (
 id TEXT PRIMARY KEY, borrower TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
 date TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('cash','DANA','OVO','GoPay','bank','other')),
 note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS repayments (
 id TEXT PRIMARY KEY, loan_id TEXT NOT NULL REFERENCES loans(id),
 amount INTEGER NOT NULL CHECK(amount>0), date TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('cash','DANA','OVO','GoPay','bank','other'))
);
CREATE TABLE IF NOT EXISTS transfers (
 id TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount>0), date TEXT NOT NULL,
 from_channel TEXT NOT NULL CHECK(from_channel IN ('cash','DANA','OVO','GoPay','bank','other')),
 to_channel TEXT NOT NULL CHECK(to_channel IN ('cash','DANA','OVO','GoPay','bank','other')),
 note TEXT NOT NULL DEFAULT '', CHECK(from_channel<>to_channel)
);
CREATE INDEX IF NOT EXISTS payments_resident_date ON payments(resident_id,paid_date);
CREATE INDEX IF NOT EXISTS repayments_loan ON repayments(loan_id);
CREATE INDEX IF NOT EXISTS entries_date ON cash_entries(date);
`;

const TABLES = ['residents', 'payments', 'cash_entries', 'loans', 'repayments', 'transfers'] as const;
const FIELDS: Record<string, string[]> = {
  residents: ['id', 'name', 'block'],
  payments: ['id', 'resident_id', 'amount', 'paid_date', 'start_month', 'note', 'channel'],
  cash_entries: ['id', 'kind', 'amount', 'date', 'description', 'channel'],
  loans: ['id', 'borrower', 'amount', 'date', 'channel', 'note'],
  repayments: ['id', 'loan_id', 'amount', 'date', 'channel'],
  transfers: ['id', 'amount', 'date', 'from_channel', 'to_channel', 'note'],
};

async function getPGlite(): Promise<PGlite> {
  if (globalDB.karierPGLite) return globalDB.karierPGLite;
  if (globalDB.karierPGLiteInitPromise) return globalDB.karierPGLiteInitPromise;

  globalDB.karierPGLiteInitPromise = (async () => {
    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const baseDir = isServerless ? '/tmp' : process.cwd();
    const dataDir = path.resolve(baseDir, isServerless ? 'pglite_db' : 'database/pglite_db');

    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {
        console.warn('Could not create data directory, using in-memory fallback:', err);
      }
    }

    let db: PGlite;
    try {
      db = new PGlite(dataDir);
    } catch {
      db = new PGlite();
    }

    try {
      const check = await db.query<{ count: string }>(
        "SELECT count(*) as count FROM information_schema.tables WHERE table_name = 'residents'"
      );
      if (Number(check.rows[0]?.count) === 0) {
        await db.exec(SCHEMA_SQL);

        let snapshot: Record<string, Record<string, unknown>[]> | null = null;
        try {
          const snapshotPath = path.resolve(process.cwd(), 'database/snapshot.json');
          if (fs.existsSync(snapshotPath)) {
            snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
          }
        } catch {}

        if (!snapshot) {
          try {
            const bundled = await import('@/database/snapshot.json');
            snapshot = (bundled.default || bundled) as unknown as Record<string, Record<string, unknown>[]>;
          } catch {}
        }

        if (snapshot) {
          for (const t of TABLES) {
            const rows = snapshot[t] || [];
            const keys = FIELDS[t] || [];
            const placeholders = keys.map((_, i) => '$' + (i + 1)).join(',');
            for (const r of rows) {
              await db.query(
                `INSERT INTO ${t} (${keys.join(',')}) VALUES (${placeholders})`,
                keys.map((k) => r[k])
              );
            }
          }
        }
      }
    } catch (e) {
      console.error('PGlite initialization error:', e);
    }
    globalDB.karierPGLite = db;
    return db;
  })();

  return globalDB.karierPGLiteInitPromise;
}

async function getClient(): Promise<Queryable> {
  const store = context.getStore();
  if (store) return store;
  if (process.env.DATABASE_URL) {
    return pool();
  }
  return await getPGlite();
}

function statement(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export type Database = { prepare: (sql: string) => Prepared };

class Prepared {
  constructor(private sql: string, private values: unknown[] = []) {}
  bind(...values: unknown[]) {
    return new Prepared(this.sql, values);
  }
  private async query<T extends QueryResultRow>() {
    const client = await getClient();
    return client.query<T>(statement(this.sql), this.values);
  }
  async first<T extends QueryResultRow = QueryResultRow>() {
    return (await this.query<T>()).rows[0] ?? null;
  }
  async all<T extends QueryResultRow = QueryResultRow>() {
    return { results: (await this.query<T>()).rows };
  }
  async run() {
    await this.query();
  }
}

export function getDB(): Database {
  return { prepare: (sql) => new Prepared(sql) };
}

export async function withTransaction(action: () => Promise<Response>) {
  if (process.env.DATABASE_URL) {
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 15000');
      await client.query('SELECT pg_advisory_xact_lock(20261002,5000)');
      const response = await context.run(client, action);
      await client.query(response.ok ? 'COMMIT' : 'ROLLBACK');
      return response;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else {
    const db = await getPGlite();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(20261002,5000)');
      const response = await context.run(db, action);
      await db.query(response.ok ? 'COMMIT' : 'ROLLBACK');
      return response;
    } catch (e) {
      try {
        await db.query('ROLLBACK');
      } catch {}
      throw e;
    }
  }
}
