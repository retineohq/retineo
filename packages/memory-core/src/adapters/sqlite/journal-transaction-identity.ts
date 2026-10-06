import type { JournalEvent } from '../../domain/entities.js';
import type { Journal } from '../../ports/journal.js';
import type { TransactionPort } from '../../ports/repositories.js';
import type { ObjectId } from '../../domain/ids.js';
import type { IdentityResolver } from '../../ports/repositories.js';
import type { SqliteDatabase } from './repositories.js';

export class SqliteJournal implements Journal {
  constructor(private db: SqliteDatabase) {}

  append(event: Omit<JournalEvent, 'id' | 'sequence'>): JournalEvent {
    const result = this.db.db.prepare(
      `INSERT INTO journal (id, timestamp, entity_type, entity_id, operation, payload_hash, actor)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `event:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      event.timestamp, event.entityType, event.entityId,
      event.operation, event.payloadHash, event.actor,
    );
    const row = this.db.db.prepare(
      'SELECT * FROM journal WHERE sequence = ?',
    ).get(result.lastInsertRowid) as any;
    return {
      id: row.id, sequence: row.sequence, timestamp: row.timestamp,
      entityType: row.entity_type, entityId: row.entity_id,
      operation: row.operation, payloadHash: row.payload_hash, actor: row.actor,
    };
  }

  all(): JournalEvent[] {
    return (this.db.db.prepare('SELECT * FROM journal ORDER BY sequence').all() as any[]).map((row) => ({
      id: row.id, sequence: row.sequence, timestamp: row.timestamp,
      entityType: row.entity_type, entityId: row.entity_id,
      operation: row.operation, payloadHash: row.payload_hash, actor: row.actor,
    }));
  }

  sequence(): number {
    const row = this.db.db.prepare('SELECT MAX(sequence) as max FROM journal').get() as any;
    return row.max ?? 0;
  }
}

export class SqliteTransaction implements TransactionPort {
  constructor(private db: SqliteDatabase) {}

  begin(): void {
    this.db.db.exec('BEGIN IMMEDIATE');
  }

  commit(): void {
    this.db.db.exec('COMMIT');
  }

  rollback(): void {
    this.db.db.exec('ROLLBACK');
  }
}

export class SqliteIdentityResolver implements IdentityResolver {
  constructor(private db: SqliteDatabase) {}

  resolve(id: ObjectId): ObjectId {
    const visited = new Set<ObjectId>();
    let current = id;
    while (true) {
      if (visited.has(current)) {
        throw new Error(`Circular redirect detected: ${id}`);
      }
      visited.add(current);
      const row = this.db.db.prepare('SELECT redirect_to FROM objects WHERE id = ?').get(current) as any;
      if (!row || !row.redirect_to) {
        return current;
      }
      current = row.redirect_to;
    }
  }

  merge(fromId: ObjectId, intoId: ObjectId): void {
    this.db.db.prepare('UPDATE objects SET redirect_to = ? WHERE id = ?').run(intoId, fromId);
  }
}
