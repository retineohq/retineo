import type { SemanticRepresentation } from '../domain/entities.js';
import type { RepresentationId, EvidenceId } from '../domain/ids.js';
import type { RepresentationType, SemanticClass } from '../domain/value-objects.js';

export interface RepresentationRepository {
  save(representation: SemanticRepresentation): void;
  get(id: RepresentationId): SemanticRepresentation | undefined;
  all(): SemanticRepresentation[];
  byType(type: RepresentationType): SemanticRepresentation[];
  byEvidence(evidenceId: EvidenceId): SemanticRepresentation[];
}

export interface RepresentationModel {
  generate(
    input: {
      type: RepresentationType;
      evidenceId: EvidenceId;
      content: string;
    },
  ): {
    content: string | Record<string, unknown>;
    tokenCount: number;
    semanticClasses: SemanticClass[];
  };
}
