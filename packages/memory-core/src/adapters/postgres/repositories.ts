import type { Object as DomainObject } from '../../domain/entities.js';
import type { ObjectId } from '../../domain/ids.js';
import type { ObjectRepository } from '../../ports/repositories.js';
import { parseSensitivity } from '../../domain/value-objects.js';
import type { SqlExecutor } from './database.js';

export class PostgresObjectRepository implements ObjectRepository {
  constructor(private db: SqlExecutor) {}

  save(object: DomainObject): void {
    this.db.query(
      `INSERT INTO objects (id, type, name, aliases, lifecycle_state, redirect_to, sensitivity, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET type = $2, name = $3, aliases = $4, lifecycle_state = $5,
         redirect_to = $6, sensitivity = $7, tenant_id = $8, updated_at = $10`,
      [object.id, object.type, object.name, JSON.stringify(object.aliases), object.lifecycleState,
       object.redirectTo, object.sensitivity, object.tenantId, object.createdAt, object.updatedAt],
    );
  }

  get(id: ObjectId): DomainObject | undefined {
    const result = this.db.query('SELECT * FROM objects WHERE id = $1', [id]) as any;
    const row = result?.rows?.[0];
    if (!row) return undefined;
    return {
      id: row.id, type: row.type, name: row.name,
      aliases: JSON.parse(row.aliases), lifecycleState: row.lifecycle_state,
      redirectTo: row.redirect_to, sensitivity: parseSensitivity(row.sensitivity),
      tenantId: row.tenant_id, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  all(): DomainObject[] {
    const result = this.db.query('SELECT * FROM objects') as any;
    const rows = result?.rows ?? [];
    return rows.map((row: any) => ({
      id: row.id, type: row.type, name: row.name,
      aliases: JSON.parse(row.aliases), lifecycleState: row.lifecycle_state,
      redirectTo: row.redirect_to, sensitivity: parseSensitivity(row.sensitivity),
      tenantId: row.tenant_id, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }
}
