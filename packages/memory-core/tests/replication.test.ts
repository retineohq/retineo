import { describe, expect, it } from 'vitest';
import { pullReplicationOnce } from '../src/adapters/replication/pull-loop.js';
import { MemoryCore } from '../src/index.js';
import { InMemoryObjectRepository, InMemoryClaimRepository, InMemoryRelationshipRepository, InMemoryContextRepository, InMemoryMembershipRepository, InMemoryGapRepository, InMemoryEvidenceRepository, InMemoryProvenanceRepository, InMemoryJournal, InMemoryTransaction, InMemoryIdentityResolver, InMemoryRepresentationRepository, TrivialRepresentationModel, InMemorySegmentRepository, TrivialSegmentSecurityModel, RegexExtractionModel } from '../src/index.js';
import { InMemorySourceRepository, InMemorySourceItemRepository, InMemorySourceVersionRepository } from '../src/index.js';
import { InMemoryCandidateRepository, InMemoryDecisionRepository, InMemoryPolicyRepository, DeterministicDecisionModel, PermissivePolicyModel, SensitivityAccessControlModel } from '../src/index.js';
import { PolicyBasedAgentAccessModel, InMemoryAgentPolicyRepository } from '../src/index.js';

function buildCore(): MemoryCore {
  return new MemoryCore({
    objects: new InMemoryObjectRepository(),
    claims: new InMemoryClaimRepository(),
    relationships: new InMemoryRelationshipRepository(),
    contexts: new InMemoryContextRepository(),
    memberships: new InMemoryMembershipRepository(),
    gaps: new InMemoryGapRepository(),
    evidence: new InMemoryEvidenceRepository(),
    provenance: new InMemoryProvenanceRepository(),
    sources: new InMemorySourceRepository(),
    sourceItems: new InMemorySourceItemRepository(),
    sourceVersions: new InMemorySourceVersionRepository(),
    journal: new InMemoryJournal(),
    transaction: new InMemoryTransaction(),
    identity: new InMemoryIdentityResolver(),
    candidates: new InMemoryCandidateRepository(),
    decisions: new InMemoryDecisionRepository(),
    policies: new InMemoryPolicyRepository(),
    decisionModel: new DeterministicDecisionModel(),
    policyModel: new PermissivePolicyModel(),
    accessControl: new SensitivityAccessControlModel(),
    agentPolicies: new InMemoryAgentPolicyRepository(),
    agentAccessModel: new PolicyBasedAgentAccessModel(),
    representations: new InMemoryRepresentationRepository(),
    representationModel: new TrivialRepresentationModel(),
    segments: new InMemorySegmentRepository(),
    segmentSecurity: new TrivialSegmentSecurityModel(),
    extractionModel: new RegexExtractionModel(),
  });
}

describe('Replication pull-loop', () => {
  it('applies remote journal events idempotently', async () => {
    const source = buildCore();
    source.createObject({ type: 'technology', name: 'Synced', actor: 'test', tenantId: 'default' });
    const events = source.journalSince(0);

    const replica = buildCore();
    const result = await pullReplicationOnce(replica, {
      getEvents: async (since) => ({ lastSequence: events.length, events: events.filter((event) => event.sequence > since) }),
    });
    expect(result.applied).toBe(events.length);
    expect(replica.journalSequence()).toBe(events.length);

    const second = await pullReplicationOnce(replica, {
      getEvents: async (since) => ({ lastSequence: events.length, events: events.filter((event) => event.sequence > since) }),
    });
    expect(second.applied).toBe(0);
  });
});
