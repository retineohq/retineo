export type Hash = string;

export type SourceId = string;
export type SourceItemId = string;
export type SourceVersionId = string;
export type EvidenceId = string;
export type ObjectId = string;
export type ClaimId = string;
export type RelationshipId = string;
export type ContextId = string;
export type MembershipId = string;
export type GapId = string;
export type ProvenanceId = string;
export type CandidateId = string;
export type DecisionId = string;
export type PolicyId = string;
export type RepresentationId = string;
export type EventId = string;
export type SegmentId = string;

export function createId(prefix: string, value: string): string {
  return `${prefix}:${value}`;
}
