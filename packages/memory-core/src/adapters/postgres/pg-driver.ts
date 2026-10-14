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
  return {
    query(sql: string, params: unknown[] = []) {
      return pool.query(sql, params as any[]);
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
