import type { Evidence } from '../domain/entities.js';
import type { EvidenceId } from '../domain/ids.js';
import type { PredicateType, RelationType } from '../domain/value-objects.js';

export interface ExtractedClaim {
  subjectName: string;
  predicate: PredicateType;
  objectOrValue: string;
  observedAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  confidence: number;
  basis: string | null;
}

export interface ExtractedRelationship {
  sourceName: string;
  relationType: RelationType;
  targetName: string;
  confidence: number;
  basis: string | null;
}

export interface ExtractionResult {
  claims: ExtractedClaim[];
  relationships: ExtractedRelationship[];
}

export interface ExtractionModel {
  extract(evidence: Evidence, content: string): ExtractionResult;
}
