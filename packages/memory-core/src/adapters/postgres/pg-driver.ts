import type { Pool as PgPool, PoolClient } from 'pg';
import type { SqlExecutor } from './database.js';

export interface PostgresConnectionOptions {
  connectionString?: string;
}

export async function createPgExecutor(options: PostgresConnectionOptions = {}): Promise<SqlExecutor> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: options.connectionString ?? process.env.DATABASE_URL ?? 'postgres://localhost:5432/retineo',
  });
  const queryCache = new Map<string, any[]>();
  const pending = new Map<string, Promise<any[]>>();
  async function runSelect(sql: string, params: unknown[]): Promise<any[]> {
    const { rows } = await pool.query(sql, params as any[]);
    return rows;
  }
  const cachedQuery = (sql: string, params: unknown[]): any[] => {
    const key = `${sql}:${JSON.stringify(params)}`;
    if (pending.has(key)) {
      throw new Error('Async query in progress — repository.get must not race');
    }
    const cached = queryCache.get(key);
    if (cached) return cached;
    const promise = runSelect(sql, params).then((rows) => {
      queryCache.set(key, rows);
      pending.delete(key);
      return rows;
    });
    pending.set(key, promise);
    return [] as any[];
  };
  return {
    query(sql: string, params: unknown[] = []) {
      if (/^(SELECT|WITH)/i.test(sql.trim())) {
        const rows = cachedQuery(sql, params);
        return { rows };
      }
      const promise = pool.query(sql, params as any[]);
      void promise.then(() => queryCache.clear()).catch(() => {});
      return { rows: [] };
    },
    async exec(sql: string) {
      const client = await pool.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
    },
  };
}
