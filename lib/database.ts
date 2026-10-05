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

async function getPGlite(): Promise<PGlite> {
  if (globalDB.karierPGLite) return globalDB.karierPGLite;
  if (globalDB.karierPGLiteInitPromise) return globalDB.karierPGLiteInitPromise;

  globalDB.karierPGLiteInitPromise = (async () => {
    const dataDir = path.resolve(process.cwd(), 'database/pglite_db');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const db = new PGlite(dataDir);
    try {
      const check = await db.query<{ count: string }>(
        "SELECT count(*) as count FROM information_schema.tables WHERE table_name = 'residents'"
      );
      if (Number(check.rows[0]?.count) === 0) {
        const schemaPath = path.resolve(process.cwd(), 'database/schema.sql');
        if (fs.existsSync(schemaPath)) {
          await db.exec(fs.readFileSync(schemaPath, 'utf8'));
        }
        const snapshotPath = path.resolve(process.cwd(), 'database/snapshot.json');
        if (fs.existsSync(snapshotPath)) {
          const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
          const { tables, fields } = await import('../scripts/finance.mjs');
          for (const t of tables) {
            for (const r of snapshot[t]) {
              const keys = (fields as Record<string, string[]>)[t] || [];
              const placeholders = keys.map((_, i) => '$' + (i + 1)).join(',');
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
