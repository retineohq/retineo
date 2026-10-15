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
  let queue: Promise<void> = Promise.resolve();
  const runSelect = async (sql: string, params: unknown[]): Promise<any[]> => {
    const { rows } = await pool.query(sql, params as any[]);
    return rows;
  };
  const enqueue = <T>(task: () => Promise<T>): { result: T | null; promise: Promise<T> } => {
    const run = queue.then(task);
    queue = run.then(() => undefined, () => undefined);
    return { result: null, promise: run };
  };
  return {
    query(sql: string, params: unknown[] = []) {
      if (/^(SELECT|WITH)/i.test(sql.trim())) {
        const { promise } = enqueue(() => runSelect(sql, params));
        queue = promise.then(() => undefined).catch(() => undefined);
        return { rows: [] };
      }
      const { promise } = enqueue(async () => {
        await pool.query(sql, params as any[]);
        return null;
      });
      void promise.catch(() => {});
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
