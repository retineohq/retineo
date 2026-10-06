import type {
  EvidenceId,
  ObjectId,
  ClaimId,
  RelationshipId,
  ContextId,
  MembershipId,
  GapId,
  ProvenanceId,
  SourceId,
  SourceItemId,
  SourceVersionId,
  CandidateId,
  DecisionId,
  PolicyId,
  RepresentationId,
  EventId,
  SegmentId,
} from './ids.js';
import type {
  Timestamp,
  TemporalState,
  SupportState,
  Confidence,
  ScopeQualifier,
  ObjectLifecycle,
  ClaimLifecycle,
  RelationshipLifecycle,
  ContextLifecycle,
  GapLifecycle,
  EvidenceState,
  GapType,
  MembershipMode,
  MemberType,
  RepresentationType,
  SemanticClass,
  PredicateType,
  RelationType,
  SourceState,
  ItemState,
  SourceTrustProfile,
} from './value-objects.js';

export interface Source {
  id: SourceId;
  type: string;
  name: string;
  trustProfile: SourceTrustProfile;
  state: SourceState;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SourceItem {
  id: SourceItemId;
  sourceId: SourceId;
  externalId: string;
  locator: string;
  state: ItemState;
  currentVersionId: SourceVersionId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SourceVersion {
  id: SourceVersionId;
  sourceItemId: SourceItemId;
  contentHash: string;
  capturedAt: Timestamp;
  sourceTime: Timestamp | null;
  contentRef: string;
  metadata: Record<string, unknown>;
}

export interface Evidence {
  id: EvidenceId;
  sourceVersionId: SourceVersionId;
  segmentRef: string | null;
  contentHash: string;
  state: EvidenceState;
  createdAt: Timestamp;
}

export interface Object {
  id: ObjectId;
  type: string;
  name: string;
  aliases: string[];
  lifecycleState: ObjectLifecycle;
  redirectTo: ObjectId | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Claim {
  id: ClaimId;
  subjectId: ObjectId;
  predicate: PredicateType;
  objectOrValue: ObjectId | string | number;
  evidenceRefs: EvidenceId[];
  temporalState: TemporalState;
  lifecycleState: ClaimLifecycle;
  supportState: SupportState;
  confidence: Confidence;
  scope: ScopeQualifier | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Relationship {
  id: RelationshipId;
  sourceObject: ObjectId;
  relationType: RelationType;
  targetObject: ObjectId;
  evidenceRefs: EvidenceId[];
  temporalState: TemporalState;
  lifecycleState: RelationshipLifecycle;
  supportState: SupportState;
  confidence: Confidence;
  scope: ScopeQualifier | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Context {
  id: ContextId;
  type: string;
  name: string;
  purpose: string | null;
  lifecycleState: ContextLifecycle;
  temporalState: TemporalState;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ContextMembership {
  id: MembershipId;
  contextId: ContextId;
  memberType: MemberType;
  memberId: string;
  mode: MembershipMode;
  confidence: Confidence;
  validFrom: Timestamp | null;
  validTo: Timestamp | null;
  createdAt: Timestamp;
}

export interface KnowledgeGap {
  id: GapId;
  type: GapType;
  subjectId: ObjectId | null;
  description: string;
  evidenceRefs: EvidenceId[];
  lifecycleState: GapLifecycle;
  createdAt: Timestamp;
  resolvedAt: Timestamp | null;
}

export interface Provenance {
  id: ProvenanceId;
  assertionType: 'object' | 'claim' | 'relationship';
  assertionId: ObjectId | ClaimId | RelationshipId;
  evidenceId: EvidenceId;
  learnedAt: Timestamp;
  basis: string | null;
}

export interface Candidate {
  id: CandidateId;
  type: string;
  payload: Record<string, unknown>;
  evidenceRefs: EvidenceId[];
  extractor: string;
  extractorVersion: string;
  createdAt: Timestamp;
}

export interface Decision {
  id: DecisionId;
  candidateRef: CandidateId;
  verdict: 'Accept' | 'Reject' | 'Escalate';
  reasoning: string | null;
  decisionModel: string;
  createdAt: Timestamp;
}

export interface Policy {
  id: PolicyId;
  decisionRef: DecisionId;
  action: 'Allow' | 'Deny' | 'Quarantine';
  aclRef: string | null;
  createdAt: Timestamp;
}

export interface SemanticRepresentation {
  id: RepresentationId;
  type: RepresentationType;
  evidenceId: EvidenceId;
  generator: string;
  generatorVersion: string;
  content: string | Record<string, unknown>;
  contentHash: string;
  tokenCount: number;
  semanticClasses: SemanticClass[];
  createdAt: Timestamp;
}

export interface JournalEvent {
  id: EventId;
  sequence: number;
  timestamp: Timestamp;
  entityType: string;
  entityId: string;
  operation: string;
  payloadHash: string;
  actor: string;
}

export interface Segment {
  id: SegmentId;
  rootContext: ContextId;
  includedObjects: ObjectId[];
  includedClaims: ClaimId[];
  includedRelationships: RelationshipId[];
  includedContexts: ContextId[];
  includedEvidence: EvidenceId[];
  purpose: string;
  sensitivity: string;
  version: number;
  payloadHash: string;
  signature: string;
  createdAt: Timestamp;
  expiresAt: Timestamp | null;
}
