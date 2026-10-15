import { describe, expect, it } from 'vitest';
import { PostgresDatabase, PostgresObjectRepository, createPgExecutor, postgresSchemaSql } from '../src/adapters/postgres/index.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('Postgres integration', () => {
  it('applies schema and round-trips object', async () => {
    const executor = await createPgExecutor({ connectionString: DATABASE_URL });
    const db = new PostgresDatabase(executor);
    await db.applySchema(postgresSchemaSql);

    const repo = new PostgresObjectRepository(executor);
    const object = {
      id: `obj:it:${Date.now()}`,
      type: 'entity',
      name: 'IntegrationTest',
      aliases: [],
      lifecycleState: 'active' as const,
      redirectTo: null,
      sensitivity: 'internal' as const,
      tenantId: 'integration-test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    repo.save(object);
    await executor.exec('SELECT 1');
    const loaded = repo.get(object.id);
    expect(loaded).toEqual(object);
    await executor.query('DELETE FROM objects WHERE id = $1', [object.id]);
  });
});
