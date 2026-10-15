import type { Pool as PgPool, PoolClient } from 'pg';
import type { SqlExecutorWithPump } from './database.js';

export interface PostgresConnectionOptions {
  connectionString?: string;
  diagnostic?: boolean;
}

export async function createPgExecutor(options: PostgresConnectionOptions = {}): Promise<SqlExecutorWithPump> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: options.connectionString ?? process.env.DATABASE_URL ?? 'postgres://localhost:5432/retineo',
  });
  const selectCache = new Map<string, any[]>();
  const selects = new Map<string, Promise<any[]>>();
  const writes: Promise<unknown>[] = [];
  const runSelect = async (sql: string, params: unknown[]): Promise<any[]> => {
    const { rows } = await pool.query(sql, params as any[]);
    if (options.diagnostic) console.error(`pg-executor: select rows=${rows.length} key=${sql.slice(0, 40)}`);
    return rows;
  };
  const runWrite = async (sql: string, params: unknown[]): Promise<void> => {
    await pool.query(sql, params as any[]);
    if (options.diagnostic) console.error(`pg-executor: write done key=${sql.slice(0, 40)}`);
    selectCache.clear();
    selects.clear();
  };
  return {
    query(sql: string, params: unknown[] = []) {
      if (options.diagnostic) console.error(`pg-executor: ${sql.slice(0, 80)}`);
      if (/^(SELECT|WITH)/i.test(sql.trim())) {
        const key = `${sql}:${JSON.stringify(params)}`;
        if (selectCache.has(key)) {
          return { rows: selectCache.get(key)! };
        }
        const promise = runSelect(sql, params).then((rows) => {
          selectCache.set(key, rows);
          selects.delete(key);
          return rows;
        });
        selects.set(key, promise);
        return { rows: [] };
      }
      writes.push(runWrite(sql, params));
      return { rows: [] };
    },
    pumpSelects: async () => {
      await Promise.all([...selects.values()]);
    },
    prepareSelect: async (sql: string, params: unknown[] = []) => {
      const key = `${sql}:${JSON.stringify(params)}`;
      const existing = selects.get(key);
      if (existing) {
        await existing;
        return;
      }
      const rows = await runSelect(sql, params);
      selectCache.set(key, rows);
    },
    __pump: async () => {
      await Promise.all([...writes, ...Array.from(selects.values())]);
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

