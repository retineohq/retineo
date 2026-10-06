import type {
  Object,
  Claim,
  Relationship,
  Context,
  ContextMembership,
  KnowledgeGap,
  Evidence,
  Provenance,
} from '../domain/entities.js';
import type { ObjectId, ClaimId, RelationshipId, ContextId, MembershipId, GapId, EvidenceId } from '../domain/ids.js';

export interface ObjectRepository {
  save(object: Object): void;
  get(id: ObjectId): Object | undefined;
  all(): Object[];
}

export interface ClaimRepository {
  save(claim: Claim): void;
  get(id: ClaimId): Claim | undefined;
  all(): Claim[];
  bySubject(subjectId: ObjectId): Claim[];
}

export interface RelationshipRepository {
  save(relationship: Relationship): void;
  get(id: RelationshipId): Relationship | undefined;
  all(): Relationship[];
  bySource(sourceId: ObjectId): Relationship[];
  byTarget(targetId: ObjectId): Relationship[];
}

export interface ContextRepository {
  save(context: Context): void;
  get(id: ContextId): Context | undefined;
  all(): Context[];
}

export interface MembershipRepository {
  save(membership: ContextMembership): void;
  get(id: MembershipId): ContextMembership | undefined;
  byContext(contextId: ContextId): ContextMembership[];
  all(): ContextMembership[];
}

export interface GapRepository {
  save(gap: KnowledgeGap): void;
  get(id: GapId): KnowledgeGap | undefined;
  all(): KnowledgeGap[];
}

export interface EvidenceRepository {
  save(evidence: Evidence): void;
  get(id: EvidenceId): Evidence | undefined;
  all(): Evidence[];
}

export interface ProvenanceRepository {
  save(provenance: Provenance): void;
  byAssertion(assertionId: string): Provenance[];
  all(): Provenance[];
}

export interface TransactionPort {
  begin(): void;
  commit(): void;
  rollback(): void;
}

export interface IdentityResolver {
  resolve(id: ObjectId): ObjectId;
  merge(fromId: ObjectId, intoId: ObjectId): void;
}
