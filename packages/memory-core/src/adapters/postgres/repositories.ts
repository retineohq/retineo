import type {
  Object as DomainObject,
  Source,
  SourceItem,
  SourceVersion,
  Claim,
  Relationship,
  Context,
  ContextMembership,
  KnowledgeGap,
  Evidence,
  Provenance,
} from '../../domain/entities.js';
import type { ObjectId, ClaimId, RelationshipId, ContextId, MembershipId, GapId, EvidenceId, ProvenanceId, SourceId, SourceItemId, SourceVersionId } from '../../domain/ids.js';
import type {
  ObjectRepository,
  SourceRepository,
  SourceItemRepository,
  SourceVersionRepository,
  ClaimRepository,
  RelationshipRepository,
  ContextRepository,
  MembershipRepository,
  GapRepository,
  EvidenceRepository,
  ProvenanceRepository,
} from '../../ports/repositories.js';
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

function parseScope(raw: string | null): any {
  return raw ? JSON.parse(raw) : null;
}

function serializeScope(scope: any): string | null {
  return scope ? JSON.stringify(scope) : null;
}

export class PostgresSourceRepository implements SourceRepository {
  constructor(private db: any) {}

  save(source: Source): void {
    this.db.query(
      `INSERT INTO sources (id, type, name, trust_profile, state, tenant_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET type=$2, name=$3, trust_profile=$4, state=$5, tenant_id=$6, updated_at=$8`,
      [source.id, source.type, source.name, source.trustProfile, source.state, source.tenantId, source.createdAt, source.updatedAt],
    );
  }

  get(id: SourceId): Source | undefined {
    const row = (this.db.query('SELECT * FROM sources WHERE id = $1', [id]) as any)?.rows?.[0];
    if (!row) return undefined;
    return { id: row.id, type: row.type, name: row.name, trustProfile: row.trust_profile, state: row.state, tenantId: row.tenant_id, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  all(): Source[] {
    const rows = (this.db.query('SELECT * FROM sources') as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, type: row.type, name: row.name, trustProfile: row.trust_profile, state: row.state, tenantId: row.tenant_id, createdAt: row.created_at, updatedAt: row.updated_at }));
  }
}

export class PostgresSourceItemRepository implements SourceItemRepository {
  constructor(private db: any) {}

  save(item: SourceItem): void {
    this.db.query(
      `INSERT INTO source_items (id, source_id, external_id, locator, state, current_version_id, tenant_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET state=$5, current_version_id=$6, tenant_id=$7, updated_at=$9`,
      [item.id, item.sourceId, item.externalId, item.locator, item.state, item.currentVersionId, item.tenantId, item.createdAt, item.updatedAt],
    );
  }

  get(id: SourceItemId): SourceItem | undefined {
    const row = (this.db.query('SELECT * FROM source_items WHERE id = $1', [id]) as any)?.rows?.[0];
    if (!row) return undefined;
    return { id: row.id, sourceId: row.source_id, externalId: row.external_id, locator: row.locator, state: row.state, currentVersionId: row.current_version_id, tenantId: row.tenant_id, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  all(): SourceItem[] {
    const rows = (this.db.query('SELECT * FROM source_items') as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, sourceId: row.source_id, externalId: row.external_id, locator: row.locator, state: row.state, currentVersionId: row.current_version_id, tenantId: row.tenant_id, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  bySource(sourceId: SourceId): SourceItem[] {
    const rows = (this.db.query('SELECT * FROM source_items WHERE source_id = $1', [sourceId]) as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, sourceId: row.source_id, externalId: row.external_id, locator: row.locator, state: row.state, currentVersionId: row.current_version_id, tenantId: row.tenant_id, createdAt: row.created_at, updatedAt: row.updated_at }));
  }
}

export class PostgresSourceVersionRepository implements SourceVersionRepository {
  constructor(private db: any) {}

  save(version: SourceVersion): void {
    this.db.query(
      `INSERT INTO source_versions (id, source_item_id, content_hash, captured_at, source_time, content_ref, metadata, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [version.id, version.sourceItemId, version.contentHash, version.capturedAt, version.sourceTime, version.contentRef, JSON.stringify(version.metadata), version.tenantId],
    );
  }

  get(id: SourceVersionId): SourceVersion | undefined {
    const row = (this.db.query('SELECT * FROM source_versions WHERE id = $1', [id]) as any)?.rows?.[0];
    if (!row) return undefined;
    return { id: row.id, sourceItemId: row.source_item_id, contentHash: row.content_hash, capturedAt: row.captured_at, sourceTime: row.source_time, contentRef: row.content_ref, metadata: JSON.parse(row.metadata), tenantId: row.tenant_id };
  }

  all(): SourceVersion[] {
    const rows = (this.db.query('SELECT * FROM source_versions') as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, sourceItemId: row.source_item_id, contentHash: row.content_hash, capturedAt: row.captured_at, sourceTime: row.source_time, contentRef: row.content_ref, metadata: JSON.parse(row.metadata), tenantId: row.tenant_id }));
  }

  byItem(itemId: SourceItemId): SourceVersion[] {
    const rows = (this.db.query('SELECT * FROM source_versions WHERE source_item_id = $1', [itemId]) as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, sourceItemId: row.source_item_id, contentHash: row.content_hash, capturedAt: row.captured_at, sourceTime: row.source_time, contentRef: row.content_ref, metadata: JSON.parse(row.metadata), tenantId: row.tenant_id }));
  }
}

export class PostgresClaimRepository implements ClaimRepository {
  constructor(private db: any) {}

  private toEntity(row: any): Claim {
    return {
      id: row.id, subjectId: row.subject_id, predicate: row.predicate,
      objectOrValue: row.object_or_value, evidenceRefs: JSON.parse(row.evidence_refs),
      temporalState: { observedAt: row.observed_at, validFrom: row.valid_from, validTo: row.valid_to },
      lifecycleState: row.lifecycle_state,
      supportState: { level: row.support_level, evidenceCount: row.support_evidence_count, disagreeingCount: row.support_disagreeing_count },
      confidence: row.confidence, sensitivity: parseSensitivity(row.sensitivity),
      scope: parseScope(row.scope), createdAt: row.created_at, updatedAt: row.updated_at, tenantId: row.tenant_id,
    };
  }

  save(claim: Claim): void {
    this.db.query(
      `INSERT INTO claims (id, subject_id, predicate, object_or_value, evidence_refs, observed_at, valid_from, valid_to,
         lifecycle_state, support_level, support_evidence_count, support_disagreeing_count, confidence, sensitivity, tenant_id, scope, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET lifecycle_state=$9, support_level=$10, support_evidence_count=$11,
         support_disagreeing_count=$12, confidence=$13, sensitivity=$14, tenant_id=$15, updated_at=$18`,
      [claim.id, claim.subjectId, claim.predicate, String(claim.objectOrValue), JSON.stringify(claim.evidenceRefs),
       claim.temporalState.observedAt, claim.temporalState.validFrom, claim.temporalState.validTo,
       claim.lifecycleState, claim.supportState.level, claim.supportState.evidenceCount, claim.supportState.disagreeingCount,
       claim.confidence, claim.sensitivity, claim.tenantId, serializeScope(claim.scope), claim.createdAt, claim.updatedAt],
    );
  }

  get(id: ClaimId): Claim | undefined {
    const row = (this.db.query('SELECT * FROM claims WHERE id = $1', [id]) as any)?.rows?.[0];
    return row ? this.toEntity(row) : undefined;
  }

  all(): Claim[] {
    const rows = (this.db.query('SELECT * FROM claims') as any)?.rows ?? [];
    return rows.map((row: any) => this.toEntity(row));
  }

  bySubject(subjectId: ObjectId): Claim[] {
    const rows = (this.db.query('SELECT * FROM claims WHERE subject_id = $1', [subjectId]) as any)?.rows ?? [];
    return rows.map((row: any) => this.toEntity(row));
  }
}

export class PostgresRelationshipRepository implements RelationshipRepository {
  constructor(private db: any) {}

  private toEntity(row: any): Relationship {
    return {
      id: row.id, sourceObject: row.source_object, relationType: row.relation_type,
      targetObject: row.target_object, evidenceRefs: JSON.parse(row.evidence_refs),
      temporalState: { observedAt: row.observed_at, validFrom: row.valid_from, validTo: row.valid_to },
      lifecycleState: row.lifecycle_state,
      supportState: { level: row.support_level, evidenceCount: row.support_evidence_count, disagreeingCount: row.support_disagreeing_count },
      confidence: row.confidence, sensitivity: parseSensitivity(row.sensitivity),
      scope: parseScope(row.scope), createdAt: row.created_at, updatedAt: row.updated_at, tenantId: row.tenant_id,
    };
  }

  save(relationship: Relationship): void {
    this.db.query(
      `INSERT INTO relationships (id, source_object, relation_type, target_object, evidence_refs, observed_at, valid_from, valid_to,
         lifecycle_state, support_level, support_evidence_count, support_disagreeing_count, confidence, sensitivity, tenant_id, scope, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET lifecycle_state=$9, support_level=$10, support_evidence_count=$11,
         support_disagreeing_count=$12, confidence=$13, sensitivity=$14, tenant_id=$15, updated_at=$18`,
      [relationship.id, relationship.sourceObject, relationship.relationType, relationship.targetObject,
       JSON.stringify(relationship.evidenceRefs), relationship.temporalState.observedAt,
       relationship.temporalState.validFrom, relationship.temporalState.validTo,
       relationship.lifecycleState, relationship.supportState.level, relationship.supportState.evidenceCount,
       relationship.supportState.disagreeingCount, relationship.confidence, relationship.sensitivity,
       relationship.tenantId, serializeScope(relationship.scope), relationship.createdAt, relationship.updatedAt],
    );
  }

  get(id: RelationshipId): Relationship | undefined {
    const row = (this.db.query('SELECT * FROM relationships WHERE id = $1', [id]) as any)?.rows?.[0];
    return row ? this.toEntity(row) : undefined;
  }

  all(): Relationship[] {
    const rows = (this.db.query('SELECT * FROM relationships') as any)?.rows ?? [];
    return rows.map((row: any) => this.toEntity(row));
  }

  bySource(sourceId: ObjectId): Relationship[] {
    const rows = (this.db.query('SELECT * FROM relationships WHERE source_object = $1', [sourceId]) as any)?.rows ?? [];
    return rows.map((row: any) => this.toEntity(row));
  }

  byTarget(targetId: ObjectId): Relationship[] {
    const rows = (this.db.query('SELECT * FROM relationships WHERE target_object = $1', [targetId]) as any)?.rows ?? [];
    return rows.map((row: any) => this.toEntity(row));
  }
}

export class PostgresContextRepository implements ContextRepository {
  constructor(private db: any) {}

  save(context: Context): void {
    this.db.query(
      `INSERT INTO contexts (id, type, name, purpose, lifecycle_state, sensitivity, tenant_id, observed_at, valid_from, valid_to, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET type=$2, name=$3, purpose=$4, lifecycle_state=$5, sensitivity=$6, tenant_id=$7, updated_at=$12`,
      [context.id, context.type, context.name, context.purpose, context.lifecycleState, context.sensitivity,
       context.tenantId, context.temporalState.observedAt, context.temporalState.validFrom, context.temporalState.validTo,
       context.createdAt, context.updatedAt],
    );
  }

  get(id: ContextId): Context | undefined {
    const row = (this.db.query('SELECT * FROM contexts WHERE id = $1', [id]) as any)?.rows?.[0];
    if (!row) return undefined;
    return {
      id: row.id, type: row.type, name: row.name, purpose: row.purpose, lifecycleState: row.lifecycle_state,
      sensitivity: parseSensitivity(row.sensitivity), tenantId: row.tenant_id,
      temporalState: { observedAt: row.observed_at, validFrom: row.valid_from, validTo: row.valid_to },
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  all(): Context[] {
    const rows = (this.db.query('SELECT * FROM contexts') as any)?.rows ?? [];
    return rows.map((row: any) => ({
      id: row.id, type: row.type, name: row.name, purpose: row.purpose, lifecycleState: row.lifecycle_state,
      sensitivity: parseSensitivity(row.sensitivity), tenantId: row.tenant_id,
      temporalState: { observedAt: row.observed_at, validFrom: row.valid_from, validTo: row.valid_to },
      createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }
}

export class PostgresMembershipRepository implements MembershipRepository {
  constructor(private db: any) {}

  save(membership: ContextMembership): void {
    this.db.query(
      `INSERT INTO memberships (id, context_id, member_type, member_id, mode, confidence, valid_from, valid_to, tenant_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET mode=$5, confidence=$6, valid_to=$8, tenant_id=$9`,
      [membership.id, membership.contextId, membership.memberType, membership.memberId, membership.mode,
       membership.confidence, membership.validFrom, membership.validTo, membership.tenantId, membership.createdAt],
    );
  }

  get(id: MembershipId): ContextMembership | undefined {
    const row = (this.db.query('SELECT * FROM memberships WHERE id = $1', [id]) as any)?.rows?.[0];
    if (!row) return undefined;
    return { id: row.id, contextId: row.context_id, memberType: row.member_type, memberId: row.member_id, mode: row.mode, confidence: row.confidence, validFrom: row.valid_from, validTo: row.valid_to, tenantId: row.tenant_id, createdAt: row.created_at };
  }

  byContext(contextId: ContextId): ContextMembership[] {
    const rows = (this.db.query('SELECT * FROM memberships WHERE context_id = $1', [contextId]) as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, contextId: row.context_id, memberType: row.member_type, memberId: row.member_id, mode: row.mode, confidence: row.confidence, validFrom: row.valid_from, validTo: row.valid_to, tenantId: row.tenant_id, createdAt: row.created_at }));
  }

  all(): ContextMembership[] {
    const rows = (this.db.query('SELECT * FROM memberships') as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, contextId: row.context_id, memberType: row.member_type, memberId: row.member_id, mode: row.mode, confidence: row.confidence, validFrom: row.valid_from, validTo: row.valid_to, tenantId: row.tenant_id, createdAt: row.created_at }));
  }
}

export class PostgresGapRepository implements GapRepository {
  constructor(private db: any) {}

  save(gap: KnowledgeGap): void {
    this.db.query(
      `INSERT INTO gaps (id, type, subject_id, description, evidence_refs, lifecycle_state, sensitivity, tenant_id, created_at, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET lifecycle_state=$6, resolved_at=$10`,
      [gap.id, gap.type, gap.subjectId, gap.description, JSON.stringify(gap.evidenceRefs), gap.lifecycleState, gap.sensitivity, gap.tenantId, gap.createdAt, gap.resolvedAt],
    );
  }

  get(id: GapId): KnowledgeGap | undefined {
    const row = (this.db.query('SELECT * FROM gaps WHERE id = $1', [id]) as any)?.rows?.[0];
    if (!row) return undefined;
    return { id: row.id, type: row.type, subjectId: row.subject_id, description: row.description, evidenceRefs: JSON.parse(row.evidence_refs), lifecycleState: row.lifecycle_state, sensitivity: parseSensitivity(row.sensitivity), tenantId: row.tenant_id, createdAt: row.created_at, resolvedAt: row.resolved_at };
  }

  all(): KnowledgeGap[] {
    const rows = (this.db.query('SELECT * FROM gaps') as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, type: row.type, subjectId: row.subject_id, description: row.description, evidenceRefs: JSON.parse(row.evidence_refs), lifecycleState: row.lifecycle_state, sensitivity: parseSensitivity(row.sensitivity), tenantId: row.tenant_id, createdAt: row.created_at, resolvedAt: row.resolved_at }));
  }
}

export class PostgresEvidenceRepository implements EvidenceRepository {
  constructor(private db: any) {}

  save(evidence: Evidence): void {
    this.db.query(
      `INSERT INTO evidence (id, source_version_id, segment_ref, content_hash, state, tenant_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET state=$5`,
      [evidence.id, evidence.sourceVersionId, evidence.segmentRef, evidence.contentHash, evidence.state, evidence.tenantId, evidence.createdAt],
    );
  }

  get(id: EvidenceId): Evidence | undefined {
    const row = (this.db.query('SELECT * FROM evidence WHERE id = $1', [id]) as any)?.rows?.[0];
    if (!row) return undefined;
    return { id: row.id, sourceVersionId: row.source_version_id, segmentRef: row.segment_ref, contentHash: row.content_hash, state: row.state, tenantId: row.tenant_id, createdAt: row.created_at };
  }

  all(): Evidence[] {
    const rows = (this.db.query('SELECT * FROM evidence') as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, sourceVersionId: row.source_version_id, segmentRef: row.segment_ref, contentHash: row.content_hash, state: row.state, tenantId: row.tenant_id, createdAt: row.created_at }));
  }
}

export class PostgresProvenanceRepository implements ProvenanceRepository {
  constructor(private db: any) {}

  save(provenance: Provenance): void {
    this.db.query(
      `INSERT INTO provenance (id, assertion_type, assertion_id, evidence_id, learned_at, basis)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [provenance.id, provenance.assertionType, provenance.assertionId, provenance.evidenceId, provenance.learnedAt, provenance.basis],
    );
  }

  byAssertion(assertionId: string): Provenance[] {
    const rows = (this.db.query('SELECT * FROM provenance WHERE assertion_id = $1', [assertionId]) as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, assertionType: row.assertion_type, assertionId: row.assertion_id, evidenceId: row.evidence_id, learnedAt: row.learned_at, basis: row.basis }));
  }

  all(): Provenance[] {
    const rows = (this.db.query('SELECT * FROM provenance') as any)?.rows ?? [];
    return rows.map((row: any) => ({ id: row.id, assertionType: row.assertion_type, assertionId: row.assertion_id, evidenceId: row.evidence_id, learnedAt: row.learned_at, basis: row.basis }));
  }
}
