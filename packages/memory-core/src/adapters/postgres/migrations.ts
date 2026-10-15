import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqlExecutor } from './database.js';

export interface MigrationRunnerOptions {
  exec: SqlExecutor;
  migrationFile?: string;
}

export async function runPostgresMigrations(options: MigrationRunnerOptions): Promise<{ applied: number }> {
  const file = options.migrationFile ?? join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  const sql = readFileSync(file, 'utf8');
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  for (const statement of statements) {
    await options.exec.query(statement);
  }
  return { applied: statements.length };
}
