import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type {
  Object,
  Claim,
  Relationship,
  Context,
  ContextMembership,
  KnowledgeGap,
  Evidence,
  Provenance,
} from '../../domain/entities.js';
import type {
  ObjectId,
  ClaimId,
  RelationshipId,
  ContextId,
  MembershipId,
  GapId,
  ProvenanceId,
  EvidenceId,
} from '../../domain/ids.js';
import type {
  ObjectRepository,
  ClaimRepository,
  RelationshipRepository,
  ContextRepository,
  MembershipRepository,
  GapRepository,
  EvidenceRepository,
  ProvenanceRepository,
} from '../../ports/repositories.js';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export class SqliteDatabase {
  readonly db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(readFileSync(schemaPath, 'utf8'));
  }

  close(): void {
    this.db.close();
  }
}

function parseScope(raw: string | null): any {
  return raw ? JSON.parse(raw) : null;
}

function serializeScope(scope: any): string | null {
  return scope ? JSON.stringify(scope) : null;
}

export class SqliteObjectRepository implements ObjectRepository {
  constructor(private db: SqliteDatabase) {}

  save(object: Object): void {
    this.db.db.prepare(
      `INSERT INTO objects (id, type, name, aliases, lifecycle_state, redirect_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type, name = excluded.name, aliases = excluded.aliases,
         lifecycle_state = excluded.lifecycle_state, redirect_to = excluded.redirect_to,
         updated_at = excluded.updated_at`,
    ).run(
      object.id, object.type, object.name,
      JSON.stringify(object.aliases), object.lifecycleState,
      object.redirectTo, object.createdAt, object.updatedAt,
    );
  }

  get(id: ObjectId): Object | undefined {
    const row = this.db.db.prepare('SELECT * FROM objects WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id, type: row.type, name: row.name,
      aliases: JSON.parse(row.aliases), lifecycleState: row.lifecycle_state,
      redirectTo: row.redirect_to, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  all(): Object[] {
    return (this.db.db.prepare('SELECT * FROM objects').all() as any[]).map((row) => ({
      id: row.id, type: row.type, name: row.name,
      aliases: JSON.parse(row.aliases), lifecycleState: row.lifecycle_state,
      redirectTo: row.redirect_to, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }
}

export class SqliteClaimRepository implements ClaimRepository {
  constructor(private db: SqliteDatabase) {}

  private toEntity(row: any): Claim {
    return {
      id: row.id, subjectId: row.subject_id, predicate: row.predicate,
      objectOrValue: row.object_or_value, evidenceRefs: JSON.parse(row.evidence_refs),
      temporalState: { observedAt: row.observed_at, validFrom: row.valid_from, validTo: row.valid_to },
      lifecycleState: row.lifecycle_state,
      supportState: { level: row.support_level, evidenceCount: row.support_evidence_count, disagreeingCount: row.support_disagreeing_count },
      confidence: row.confidence,
      scope: parseScope(row.scope), createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  save(claim: Claim): void {
    this.db.db.prepare(
      `INSERT INTO claims (id, subject_id, predicate, object_or_value, evidence_refs,
         observed_at, valid_from, valid_to, lifecycle_state,
         support_level, support_evidence_count, support_disagreeing_count,
         confidence, scope, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         lifecycle_state = excluded.lifecycle_state,
         support_level = excluded.support_level,
         support_evidence_count = excluded.support_evidence_count,
         support_disagreeing_count = excluded.support_disagreeing_count,
         confidence = excluded.confidence, updated_at = excluded.updated_at`,
    ).run(
      claim.id, claim.subjectId, claim.predicate,
      String(claim.objectOrValue), JSON.stringify(claim.evidenceRefs),
      claim.temporalState.observedAt, claim.temporalState.validFrom, claim.temporalState.validTo,
      claim.lifecycleState, claim.supportState.level, claim.supportState.evidenceCount,
      claim.supportState.disagreeingCount, claim.confidence,
      serializeScope(claim.scope), claim.createdAt, claim.updatedAt,
    );
  }

  get(id: ClaimId): Claim | undefined {
    const row = this.db.db.prepare('SELECT * FROM claims WHERE id = ?').get(id) as any;
    return row ? this.toEntity(row) : undefined;
  }

  all(): Claim[] {
    return (this.db.db.prepare('SELECT * FROM claims').all() as any[]).map((row) => this.toEntity(row));
  }

  bySubject(subjectId: ObjectId): Claim[] {
    return (this.db.db.prepare('SELECT * FROM claims WHERE subject_id = ?').all(subjectId) as any[]).map((row) => this.toEntity(row));
  }
}

export class SqliteRelationshipRepository implements RelationshipRepository {
  constructor(private db: SqliteDatabase) {}

  private toEntity(row: any): Relationship {
    return {
      id: row.id, sourceObject: row.source_object, relationType: row.relation_type,
      targetObject: row.target_object, evidenceRefs: JSON.parse(row.evidence_refs),
      temporalState: { observedAt: row.observed_at, validFrom: row.valid_from, validTo: row.valid_to },
      lifecycleState: row.lifecycle_state,
      supportState: { level: row.support_level, evidenceCount: row.support_evidence_count, disagreeingCount: row.support_disagreeing_count },
      confidence: row.confidence,
      scope: parseScope(row.scope), createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  save(relationship: Relationship): void {
    this.db.db.prepare(
      `INSERT INTO relationships (id, source_object, relation_type, target_object, evidence_refs,
         observed_at, valid_from, valid_to, lifecycle_state,
         support_level, support_evidence_count, support_disagreeing_count,
         confidence, scope, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         lifecycle_state = excluded.lifecycle_state,
         support_level = excluded.support_level,
         support_evidence_count = excluded.support_evidence_count,
         support_disagreeing_count = excluded.support_disagreeing_count,
         confidence = excluded.confidence, updated_at = excluded.updated_at`,
    ).run(
      relationship.id, relationship.sourceObject, relationship.relationType,
      relationship.targetObject, JSON.stringify(relationship.evidenceRefs),
      relationship.temporalState.observedAt, relationship.temporalState.validFrom, relationship.temporalState.validTo,
      relationship.lifecycleState, relationship.supportState.level, relationship.supportState.evidenceCount,
      relationship.supportState.disagreeingCount, relationship.confidence,
      serializeScope(relationship.scope), relationship.createdAt, relationship.updatedAt,
    );
  }

  get(id: RelationshipId): Relationship | undefined {
    const row = this.db.db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as any;
    return row ? this.toEntity(row) : undefined;
  }

  all(): Relationship[] {
    return (this.db.db.prepare('SELECT * FROM relationships').all() as any[]).map((row) => this.toEntity(row));
  }

  bySource(sourceId: ObjectId): Relationship[] {
    return (this.db.db.prepare('SELECT * FROM relationships WHERE source_object = ?').all(sourceId) as any[]).map((row) => this.toEntity(row));
  }

  byTarget(targetId: ObjectId): Relationship[] {
    return (this.db.db.prepare('SELECT * FROM relationships WHERE target_object = ?').all(targetId) as any[]).map((row) => this.toEntity(row));
  }
}

export class SqliteContextRepository implements ContextRepository {
  constructor(private db: SqliteDatabase) {}

  save(context: Context): void {
    this.db.db.prepare(
      `INSERT INTO contexts (id, type, name, purpose, lifecycle_state, observed_at, valid_from, valid_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type, name = excluded.name, purpose = excluded.purpose,
         lifecycle_state = excluded.lifecycle_state, updated_at = excluded.updated_at`,
    ).run(
      context.id, context.type, context.name, context.purpose,
      context.lifecycleState,
      context.temporalState.observedAt, context.temporalState.validFrom, context.temporalState.validTo,
      context.createdAt, context.updatedAt,
    );
  }

  get(id: ContextId): Context | undefined {
    const row = this.db.db.prepare('SELECT * FROM contexts WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id, type: row.type, name: row.name, purpose: row.purpose,
      lifecycleState: row.lifecycle_state,
      temporalState: { observedAt: row.observed_at, validFrom: row.valid_from, validTo: row.valid_to },
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  all(): Context[] {
    return (this.db.db.prepare('SELECT * FROM contexts').all() as any[]).map((row) => ({
      id: row.id, type: row.type, name: row.name, purpose: row.purpose,
      lifecycleState: row.lifecycle_state,
      temporalState: { observedAt: row.observed_at, validFrom: row.valid_from, validTo: row.valid_to },
      createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }
}

export class SqliteMembershipRepository implements MembershipRepository {
  constructor(private db: SqliteDatabase) {}

  save(membership: ContextMembership): void {
    this.db.db.prepare(
      `INSERT INTO memberships (id, context_id, member_type, member_id, mode, confidence, valid_from, valid_to, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         mode = excluded.mode, confidence = excluded.confidence, valid_to = excluded.valid_to`,
    ).run(
      membership.id, membership.contextId, membership.memberType,
      membership.memberId, membership.mode, membership.confidence,
      membership.validFrom, membership.validTo, membership.createdAt,
    );
  }

  get(id: MembershipId): ContextMembership | undefined {
    const row = this.db.db.prepare('SELECT * FROM memberships WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id, contextId: row.context_id, memberType: row.member_type,
      memberId: row.member_id, mode: row.mode, confidence: row.confidence,
      validFrom: row.valid_from, validTo: row.valid_to, createdAt: row.created_at,
    };
  }

  byContext(contextId: ContextId): ContextMembership[] {
    return (this.db.db.prepare('SELECT * FROM memberships WHERE context_id = ?').all(contextId) as any[]).map((row) => ({
      id: row.id, contextId: row.context_id, memberType: row.member_type,
      memberId: row.member_id, mode: row.mode, confidence: row.confidence,
      validFrom: row.valid_from, validTo: row.valid_to, createdAt: row.created_at,
    }));
  }

  all(): ContextMembership[] {
    return (this.db.db.prepare('SELECT * FROM memberships').all() as any[]).map((row) => ({
      id: row.id, contextId: row.context_id, memberType: row.member_type,
      memberId: row.member_id, mode: row.mode, confidence: row.confidence,
      validFrom: row.valid_from, validTo: row.valid_to, createdAt: row.created_at,
    }));
  }
}

export class SqliteGapRepository implements GapRepository {
  constructor(private db: SqliteDatabase) {}

  save(gap: KnowledgeGap): void {
    this.db.db.prepare(
      `INSERT INTO gaps (id, type, subject_id, description, evidence_refs, lifecycle_state, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         lifecycle_state = excluded.lifecycle_state, resolved_at = excluded.resolved_at`,
    ).run(
      gap.id, gap.type, gap.subjectId, gap.description,
      JSON.stringify(gap.evidenceRefs), gap.lifecycleState, gap.createdAt, gap.resolvedAt,
    );
  }

  get(id: GapId): KnowledgeGap | undefined {
    const row = this.db.db.prepare('SELECT * FROM gaps WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id, type: row.type, subjectId: row.subject_id, description: row.description,
      evidenceRefs: JSON.parse(row.evidence_refs), lifecycleState: row.lifecycle_state,
      createdAt: row.created_at, resolvedAt: row.resolved_at,
    };
  }

  all(): KnowledgeGap[] {
    return (this.db.db.prepare('SELECT * FROM gaps').all() as any[]).map((row) => ({
      id: row.id, type: row.type, subjectId: row.subject_id, description: row.description,
      evidenceRefs: JSON.parse(row.evidence_refs), lifecycleState: row.lifecycle_state,
      createdAt: row.created_at, resolvedAt: row.resolved_at,
    }));
  }
}

export class SqliteEvidenceRepository implements EvidenceRepository {
  constructor(private db: SqliteDatabase) {}

  save(evidence: Evidence): void {
    this.db.db.prepare(
      `INSERT INTO evidence (id, source_version_id, segment_ref, content_hash, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state`,
    ).run(evidence.id, evidence.sourceVersionId, evidence.segmentRef, evidence.contentHash, evidence.state, evidence.createdAt);
  }

  get(id: EvidenceId): Evidence | undefined {
    const row = this.db.db.prepare('SELECT * FROM evidence WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id, sourceVersionId: row.source_version_id, segmentRef: row.segment_ref,
      contentHash: row.content_hash, state: row.state, createdAt: row.created_at,
    };
  }

  all(): Evidence[] {
    return (this.db.db.prepare('SELECT * FROM evidence').all() as any[]).map((row) => ({
      id: row.id, sourceVersionId: row.source_version_id, segmentRef: row.segment_ref,
      contentHash: row.content_hash, state: row.state, createdAt: row.created_at,
    }));
  }
}

export class SqliteProvenanceRepository implements ProvenanceRepository {
  constructor(private db: SqliteDatabase) {}

  save(provenance: Provenance): void {
    this.db.db.prepare(
      `INSERT INTO provenance (id, assertion_type, assertion_id, evidence_id, learned_at, basis)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(provenance.id, provenance.assertionType, provenance.assertionId, provenance.evidenceId, provenance.learnedAt, provenance.basis);
  }

  byAssertion(assertionId: string): Provenance[] {
    return (this.db.db.prepare('SELECT * FROM provenance WHERE assertion_id = ?').all(assertionId) as any[]).map((row) => ({
      id: row.id, assertionType: row.assertion_type, assertionId: row.assertion_id,
      evidenceId: row.evidence_id, learnedAt: row.learned_at, basis: row.basis,
    }));
  }

  all(): Provenance[] {
    return (this.db.db.prepare('SELECT * FROM provenance').all() as any[]).map((row) => ({
      id: row.id, assertionType: row.assertion_type, assertionId: row.assertion_id,
      evidenceId: row.evidence_id, learnedAt: row.learned_at, basis: row.basis,
    }));
  }
}
