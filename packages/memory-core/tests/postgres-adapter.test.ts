import { describe, expect, it } from 'vitest';
import { PostgresDatabase, PostgresObjectRepository, postgresSchemaSql } from '../src/adapters/postgres/index.js';

class FakePostgresExecutor {
  private objects = new Map<string, any>();
  applied: string | null = null;

  query(sql: string, params: any[] = []) {
    if (sql.startsWith('INSERT')) {
      this.objects.set(params[0], {
        id: params[0], type: params[1], name: params[2], aliases: params[3],
        lifecycle_state: params[4], redirect_to: params[5], sensitivity: params[6],
        tenant_id: params[7], created_at: params[8], updated_at: params[9],
      });
      return { rows: [] };
    }
    const rows = Array.from(this.objects.values());
    return { rows: sql.includes('WHERE') ? rows.filter((row) => row.id === params[0]) : rows };
  }

  async exec(sql: string) {
    this.applied = sql;
  }
}

describe('Postgres adapter (contract)', () => {
  it('applies schema and persists object via SqlExecutor contract', async () => {
    const executor = new FakePostgresExecutor();
    const db = new PostgresDatabase(executor);
    await db.applySchema(postgresSchemaSql);
    expect(executor.applied).toContain('CREATE TABLE IF NOT EXISTS objects');

    const repo = new PostgresObjectRepository(executor);
    const object = {
      id: 'obj:test', type: 'entity', name: 'Test', aliases: [],
      lifecycleState: 'active' as const, redirectTo: null,
      sensitivity: 'internal' as const, tenantId: 'tenant-a',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    repo.save(object);
    expect(repo.get('obj:test')).toEqual(object);
    expect(repo.all()).toHaveLength(1);
  });
});
