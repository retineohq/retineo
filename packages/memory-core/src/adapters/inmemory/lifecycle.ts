import type {
  Candidate,
  Decision,
  Policy,
} from '../../domain/entities.js';
import type { CandidateId, DecisionId, PolicyId } from '../../domain/ids.js';
import type {
  CandidateRepository,
  DecisionRepository,
  PolicyRepository,
  DecisionModel,
  PolicyModel,
} from '../../ports/lifecycle.js';
import type {
  RepresentationRepository,
} from '../../ports/representation.js';
import type { SemanticRepresentation } from '../../domain/entities.js';
import type { Segment } from '../../domain/entities.js';
import type { RepresentationId, EvidenceId } from '../../domain/ids.js';
import type { RepresentationType, SemanticClass } from '../../domain/value-objects.js';

export class InMemoryCandidateRepository implements CandidateRepository {
  private store = new Map<CandidateId, Candidate>();

  save(candidate: Candidate): void {
    this.store.set(candidate.id, { ...candidate });
  }

  get(id: CandidateId): Candidate | undefined {
    return this.store.get(id);
  }

  all(): Candidate[] {
    return Array.from(this.store.values());
  }
}

export class InMemoryDecisionRepository implements DecisionRepository {
  private store = new Map<DecisionId, Decision>();

  save(decision: Decision): void {
    this.store.set(decision.id, { ...decision });
  }

  get(id: DecisionId): Decision | undefined {
    return this.store.get(id);
  }

  all(): Decision[] {
    return Array.from(this.store.values());
  }

  byCandidate(candidateId: CandidateId): Decision[] {
    return this.all().filter((decision) => decision.candidateRef === candidateId);
  }
}

export class InMemoryPolicyRepository implements PolicyRepository {
  private store = new Map<PolicyId, Policy>();

  save(policy: Policy): void {
    this.store.set(policy.id, { ...policy });
  }

  get(id: PolicyId): Policy | undefined {
    return this.store.get(id);
  }

  all(): Policy[] {
    return Array.from(this.store.values());
  }

  byDecision(decisionId: DecisionId): Policy[] {
    return this.all().filter((policy) => policy.decisionRef === decisionId);
  }
}

export class DeterministicDecisionModel implements DecisionModel {
  evaluate(
    candidate: Candidate,
    context: { existingClaimsCount: number },
  ): { verdict: 'Accept' | 'Reject' | 'Escalate'; reasoning: string | null } {
    if (candidate.evidenceRefs.length === 0) {
      return { verdict: 'Reject', reasoning: 'No evidence attached' };
    }
    if (candidate.evidenceRefs.length >= 2) {
      return { verdict: 'Accept', reasoning: `${candidate.evidenceRefs.length} evidence refs` };
    }
    if (candidate.type === 'ClaimCandidate' && context.existingClaimsCount > 0) {
      return { verdict: 'Escalate', reasoning: 'Single evidence with existing claims — needs review' };
    }
    return { verdict: 'Accept', reasoning: 'Single evidence, no conflicts' };
  }
}

export class PermissivePolicyModel implements PolicyModel {
  evaluate(
    decision: Decision,
  ): { action: 'Allow' | 'Deny' | 'Quarantine'; aclRef: string | null } {
    if (decision.verdict === 'Accept') {
      return { action: 'Allow', aclRef: null };
    }
    if (decision.verdict === 'Escalate') {
      return { action: 'Quarantine', aclRef: null };
    }
    return { action: 'Deny', aclRef: null };
  }
}

export class InMemoryRepresentationRepository implements RepresentationRepository {
  private store = new Map<RepresentationId, SemanticRepresentation>();

  save(representation: SemanticRepresentation): void {
    this.store.set(representation.id, { ...representation });
  }

  get(id: RepresentationId): SemanticRepresentation | undefined {
    return this.store.get(id);
  }

  all(): SemanticRepresentation[] {
    return Array.from(this.store.values());
  }

  byType(type: RepresentationType): SemanticRepresentation[] {
    return this.all().filter((representation) => representation.type === type);
  }

  byEvidence(evidenceId: EvidenceId): SemanticRepresentation[] {
    return this.all().filter((representation) => representation.evidenceId === evidenceId);
  }
}

export class InMemorySegmentRepository {
  private store = new Map<string, Segment>();

  save(segment: Segment): void {
    this.store.set(segment.id, { ...segment });
  }

  get(id: string): Segment | undefined {
    return this.store.get(id);
  }

  all(): Segment[] {
    return Array.from(this.store.values());
  }
}

export class TrivialSegmentSecurityModel {
  sign(payloadHash: string): string {
    return `sig:${payloadHash}`;
  }

  verify(segment: Segment): boolean {
    return segment.signature === `sig:${segment.payloadHash}`;
  }
}

export class TrivialRepresentationModel {
  generate(input: {
    type: RepresentationType;
    evidenceId: EvidenceId;
    content: string;
  }): {
    content: string | Record<string, unknown>;
    tokenCount: number;
    semanticClasses: SemanticClass[];
  } {
    if (input.type === 'essence_structured') {
      const words = input.content.split(/\s+/).filter(Boolean).slice(0, 5);
      return {
        content: { topic: words.join(' ') },
        tokenCount: words.length,
        semanticClasses: ['topic'],
      };
    }
    const words = input.content.split(/\s+/).filter(Boolean);
    return {
      content: words.slice(0, Math.max(1, Math.floor(words.length / 4))).join(' '),
      tokenCount: Math.max(1, Math.floor(words.length / 4)),
      semanticClasses: ['topic', 'decision'],
    };
  }
}
