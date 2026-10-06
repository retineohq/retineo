import type {
  Candidate,
  Decision,
  Policy,
} from '../domain/entities.js';
import type { CandidateId, DecisionId, PolicyId } from '../domain/ids.js';

export interface CandidateRepository {
  save(candidate: Candidate): void;
  get(id: CandidateId): Candidate | undefined;
  all(): Candidate[];
}

export interface DecisionRepository {
  save(decision: Decision): void;
  get(id: DecisionId): Decision | undefined;
  all(): Decision[];
  byCandidate(candidateId: CandidateId): Decision[];
}

export interface PolicyRepository {
  save(policy: Policy): void;
  get(id: PolicyId): Policy | undefined;
  all(): Policy[];
  byDecision(decisionId: DecisionId): Policy[];
}

export interface DecisionModel {
  evaluate(
    candidate: Candidate,
    context: { existingClaimsCount: number },
  ): { verdict: 'Accept' | 'Reject' | 'Escalate'; reasoning: string | null };
}

export interface PolicyModel {
  evaluate(
    decision: Decision,
  ): { action: 'Allow' | 'Deny' | 'Quarantine'; aclRef: string | null };
}
