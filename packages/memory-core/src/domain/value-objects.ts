export type Timestamp = string; // ISO 8601

export interface TemporalState {
  observedAt: Timestamp | null;
  validFrom: Timestamp | null;
  validTo: Timestamp | null;
}

export interface SupportState {
  level: 'weak' | 'moderate' | 'strong';
  evidenceCount: number;
  disagreeingCount: number;
}

export type Confidence = number; // 0..1

export interface ScopeQualifier {
  domain: string | null;
  environment: string | null;
  condition: string | null;
}

export type ObjectLifecycle =
  | 'active'
  | 'merged'
  | 'retired';

export type ClaimLifecycle =
  | 'active'
  | 'superseded'
  | 'contradicted'
  | 'withdrawn';

export type RelationshipLifecycle =
  | 'active'
  | 'superseded'
  | 'contradicted'
  | 'withdrawn';

export type ContextLifecycle =
  | 'active'
  | 'archived';

export type GapLifecycle =
  | 'open'
  | 'resolved';

export type EvidenceState =
  | 'available'
  | 'unavailable';

export type GapType =
  | 'OpenQuestion'
  | 'MissingEvidence'
  | 'UnresolvedConflict'
  | 'UnknownDependency';

export type MembershipMode =
  | 'explicit'
  | 'inferred'
  | 'rule_based'
  | 'temporary';

export type MemberType =
  | 'object'
  | 'claim'
  | 'relationship'
  | 'evidence'
  | 'context'
  | 'knowledge_gap';

export type RepresentationType =
  | 'summary'
  | 'essence_nl'
  | 'essence_structured'
  | 'embedding';

export type SemanticClass =
  | 'topic'
  | 'entities'
  | 'state'
  | 'decision'
  | 'condition'
  | 'time'
  | 'scope'
  | 'negation'
  | 'causality'
  | 'uncertainty'
  | 'relation';

export type PredicateType =
  | 'has_role'
  | 'has_property'
  | 'has_value';

export type RelationType =
  | 'supersedes'
  | 'caused_by'
  | 'depends_on'
  | 'supports'
  | 'contradicts'
  | 'invalidates'
  | 'references'
  | 'belongs_to'
  | 'related_to';

export type SourceState =
  | 'active'
  | 'disabled';

export type ItemState =
  | 'active'
  | 'retired';

export type SourceTrustProfile = 'trusted' | 'untrusted' | 'sandboxed';
