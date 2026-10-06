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
import type { ObjectId, ClaimId, RelationshipId, ContextId, MembershipId, GapId, ProvenanceId, EvidenceId } from '../../domain/ids.js';
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

export class InMemoryObjectRepository implements ObjectRepository {
  private store = new Map<ObjectId, Object>();

  save(object: Object): void {
    this.store.set(object.id, { ...object });
  }

  get(id: ObjectId): Object | undefined {
    return this.store.get(id);
  }

  all(): Object[] {
    return Array.from(this.store.values());
  }
}

export class InMemoryClaimRepository implements ClaimRepository {
  private store = new Map<ClaimId, Claim>();

  save(claim: Claim): void {
    this.store.set(claim.id, { ...claim });
  }

  get(id: ClaimId): Claim | undefined {
    return this.store.get(id);
  }

  all(): Claim[] {
    return Array.from(this.store.values());
  }

  bySubject(subjectId: ObjectId): Claim[] {
    return this.all().filter((claim) => claim.subjectId === subjectId);
  }
}

export class InMemoryRelationshipRepository implements RelationshipRepository {
  private store = new Map<RelationshipId, Relationship>();

  save(relationship: Relationship): void {
    this.store.set(relationship.id, { ...relationship });
  }

  get(id: RelationshipId): Relationship | undefined {
    return this.store.get(id);
  }

  all(): Relationship[] {
    return Array.from(this.store.values());
  }

  bySource(sourceId: ObjectId): Relationship[] {
    return this.all().filter((relationship) => relationship.sourceObject === sourceId);
  }

  byTarget(targetId: ObjectId): Relationship[] {
    return this.all().filter((relationship) => relationship.targetObject === targetId);
  }
}

export class InMemoryContextRepository implements ContextRepository {
  private store = new Map<ContextId, Context>();

  save(context: Context): void {
    this.store.set(context.id, { ...context });
  }

  get(id: ContextId): Context | undefined {
    return this.store.get(id);
  }

  all(): Context[] {
    return Array.from(this.store.values());
  }
}

export class InMemoryMembershipRepository implements MembershipRepository {
  private store = new Map<MembershipId, ContextMembership>();

  save(membership: ContextMembership): void {
    this.store.set(membership.id, { ...membership });
  }

  get(id: MembershipId): ContextMembership | undefined {
    return this.store.get(id);
  }

  byContext(contextId: ContextId): ContextMembership[] {
    return this.all().filter((membership) => membership.contextId === contextId);
  }

  all(): ContextMembership[] {
    return Array.from(this.store.values());
  }
}

export class InMemoryGapRepository implements GapRepository {
  private store = new Map<GapId, KnowledgeGap>();

  save(gap: KnowledgeGap): void {
    this.store.set(gap.id, { ...gap });
  }

  get(id: GapId): KnowledgeGap | undefined {
    return this.store.get(id);
  }

  all(): KnowledgeGap[] {
    return Array.from(this.store.values());
  }
}

export class InMemoryEvidenceRepository implements EvidenceRepository {
  private store = new Map<EvidenceId, Evidence>();

  save(evidence: Evidence): void {
    this.store.set(evidence.id, { ...evidence });
  }

  get(id: EvidenceId): Evidence | undefined {
    return this.store.get(id);
  }

  all(): Evidence[] {
    return Array.from(this.store.values());
  }
}

export class InMemoryProvenanceRepository implements ProvenanceRepository {
  private store = new Map<ProvenanceId, Provenance>();

  save(provenance: Provenance): void {
    this.store.set(provenance.id, { ...provenance });
  }

  byAssertion(assertionId: string): Provenance[] {
    return this.all().filter((provenance) => provenance.assertionId === assertionId);
  }

  all(): Provenance[] {
    return Array.from(this.store.values());
  }
}
