export * from './database.js';
export * from './migrations.js';
export * from './repositories.js';
export * from './pg-driver.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const postgresSchemaSql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');
