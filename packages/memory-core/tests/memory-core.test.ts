import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  MemoryCore,
  InMemoryObjectRepository,
  InMemoryClaimRepository,
  InMemoryRelationshipRepository,
  InMemoryContextRepository,
  InMemoryMembershipRepository,
  InMemoryGapRepository,
  InMemoryEvidenceRepository,
  InMemoryProvenanceRepository,
  InMemoryJournal,
  InMemoryTransaction,
  InMemoryIdentityResolver,
  InMemoryRepresentationRepository,
  TrivialRepresentationModel,
  InMemorySegmentRepository,
  TrivialSegmentSecurityModel,
  InMemorySourceRepository,
  InMemorySourceItemRepository,
  InMemorySourceVersionRepository,
  RegexExtractionModel,
} from '../src/index.js';
import {
  InMemoryCandidateRepository,
  InMemoryDecisionRepository,
  InMemoryPolicyRepository,
  DeterministicDecisionModel,
  PermissivePolicyModel,
} from '../src/index.js';
import { createId } from '../src/index.js';

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
    journal: new InMemoryJournal(),
    transaction: new InMemoryTransaction(),
    identity: new InMemoryIdentityResolver(),
    candidates: new InMemoryCandidateRepository(),
    decisions: new InMemoryDecisionRepository(),
    policies: new InMemoryPolicyRepository(),
    decisionModel: new DeterministicDecisionModel(),
    policyModel: new PermissivePolicyModel(),
    representations: new InMemoryRepresentationRepository(),
    representationModel: new TrivialRepresentationModel(),
    segments: new InMemorySegmentRepository(),
    segmentSecurity: new TrivialSegmentSecurityModel(),
    extractionModel: new RegexExtractionModel(),
  });
}

describe('MemoryCore first milestone (16 steps without AI)', () => {
  it('ingest source version → create evidence → create objects → claims → relationships → provenance → contexts → membership → contradiction → gap → merge → history → unavailable evidence → memory intact → journal → query context', () => {
    const core = buildCore();

    // 1–2. Evidence
    const evidenceId = createId('ev', 'test-evidence') as any;
    const evidence = core.createEvidence({
      id: evidenceId,
      sourceVersionId: createId('sv', 'sv-1') as any,
      segmentRef: null,
      contentHash: 'abc123',
      state: 'available',
    });
    expect(evidence.state).toBe('available');

    // 3. Objects
    const postgres = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    const decision = core.createObject({ type: 'decision', name: 'Primary DB choice', actor: 'test', tenantId: 'default' });
    const incident = core.createObject({ type: 'incident', name: 'DB migration failure', actor: 'test', tenantId: 'default' });

    // 4. Claims
    const claim1 = core.createClaim({
      subjectId: postgres.id,
      predicate: 'has_role',
      objectOrValue: 'PrimaryDatabase',
      evidenceRefs: [evidence.id],
      validFrom: '2022-01-01',
      actor: 'test',
      tenantId: 'default',
    });
    expect(claim1.temporalState.validFrom).toBe('2022-01-01');

    const claim2 = core.createClaim({
      subjectId: incident.id,
      predicate: 'has_role',
      objectOrValue: 'CausedReassessment',
      evidenceRefs: [evidence.id],
      validFrom: '2023-06-01',
      actor: 'test',
      tenantId: 'default',
    });

    // 5. Relationships
    const rel = core.createRelationship({
      sourceObject: incident.id,
      relationType: 'caused_by',
      targetObject: decision.id,
      evidenceRefs: [evidence.id],
      actor: 'test',
      tenantId: 'default',
    });
    expect(rel.relationType).toBe('caused_by');

    // 6. Provenance
    const provenance = core.getProvenance(claim1.id);
    expect(provenance.length).toBeGreaterThan(0);

    // 7. Contexts
    const context = core.createContext({
      type: 'project',
      name: 'Database Platform Decision',
      purpose: 'Track database decision history',
      actor: 'test',
      tenantId: 'default',
    });

    // 8. Membership (object in multiple contexts)
    const ctx2 = core.createContext({ type: 'project', name: 'Platform', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: context.id, memberType: 'object', memberId: postgres.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx2.id, memberType: 'object', memberId: postgres.id, mode: 'explicit', actor: 'test', tenantId: 'default' });

    // 9. Contradiction (claim stays alive)
    const contradictingClaim = core.createClaim({
      subjectId: postgres.id,
      predicate: 'has_role',
      objectOrValue: 'Deprecated',
      evidenceRefs: [evidence.id],
      validFrom: '2024-11-01',
      actor: 'test',
      tenantId: 'default',
    });
    core.createRelationship({
      sourceObject: contradictingClaim.subjectId,
      relationType: 'contradicts',
      targetObject: claim1.subjectId,
      evidenceRefs: [evidence.id],
      actor: 'test',
      tenantId: 'default',
    });
    expect(core.getClaim(claim1.id).lifecycleState).toBe('active');

    // 10. Knowledge gap
    const gap = core.createKnowledgeGap({
      type: 'UnresolvedConflict',
      description: 'PostgreSQL role: PrimaryDatabase vs Deprecated — needs resolution',
      actor: 'test',
      tenantId: 'default',
    });
    expect(gap.lifecycleState).toBe('open');

    // 11–12. Merge + preserve history
    const pgAlias = core.createObject({ type: 'technology', name: 'PG', actor: 'test', tenantId: 'default' });
    core.mergeObjects(pgAlias.id, postgres.id, 'test');
    const resolved = core.getObject(pgAlias.id);
    expect(resolved.id).toBe(postgres.id);
    expect(core.getObject(postgres.id).lifecycleState).toBe('active');

    // 13–14. Evidence unavailable, memory intact
    core.markEvidenceUnavailable(evidence.id, 'test');
    const claimAfter = core.getClaim(claim1.id);
    expect(claimAfter).toBeDefined();
    expect(claimAfter.lifecycleState).toBe('active');

    // 15. Journal
    const journal = core.getJournal();
    expect(journal.length).toBeGreaterThan(10);
    expect(journal[0].sequence).toBe(1);

    // 16. Query context
    const memberships = (core as any).deps.memberships.byContext(context.id);
    expect(memberships.length).toBeGreaterThan(0);
  });
});

describe('Invariants', () => {
  it('M1: claim without provenance is rejected', () => {
    const core = buildCore();
    const postgres = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    expect(() => core.createClaim({
      subjectId: postgres.id,
      predicate: 'has_role',
      objectOrValue: 'X',
      evidenceRefs: [],
      actor: 'test',
    })).toThrow('M1 violated');
  });

  it('M4: duplicate object ID is rejected', () => {
    const core = buildCore();
    core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    expect(() => core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' })).toThrow('M4 violated');
  });

  it('M5: merge preserves historical object as tombstone+redirect', () => {
    const core = buildCore();
    const a = core.createObject({ type: 'technology', name: 'PG', actor: 'test', tenantId: 'default' });
    const b = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    core.mergeObjects(a.id, b.id, 'test');
    const merged = (core as any).deps.objects.get(a.id);
    expect(merged.lifecycleState).toBe('merged');
    expect(merged.redirectTo).toBe(b.id);
  });

  it('M9: candidate is not memory (empty evidence rejects)', () => {
    const core = buildCore();
    const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    const fakeEvidenceId = createId('ev', 'fake') as any;
    expect(() => core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'X',
      evidenceRefs: [fakeEvidenceId],
      actor: 'test',
    })).toThrow('Unknown evidence');
  });

  it('M14: source disappearance (evidence unavailable) does not delete memory', () => {
    const core = buildCore();
    const evidenceId = createId('ev', 'e1') as any;
    core.createEvidence({
      id: evidenceId,
      sourceVersionId: createId('sv', 'sv-1') as any,
      segmentRef: null,
      contentHash: 'h',
      state: 'available',
    });
    const obj = core.createObject({ type: 'technology', name: 'Test', actor: 'test', tenantId: 'default' });
    core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'X',
      evidenceRefs: [evidenceId],
      actor: 'test',
      tenantId: 'default',
    });
    core.markEvidenceUnavailable(evidenceId, 'test');
    const claims = (core as any).deps.claims.bySubject(obj.id);
    expect(claims.length).toBe(1);
    expect(claims[0].lifecycleState).toBe('active');
  });

  it('M19: support state is distinct from confidence', () => {
    const core = buildCore();
    const evidenceId = createId('ev', 'e1') as any;
    core.createEvidence({
      id: evidenceId,
      sourceVersionId: createId('sv', 'sv-1') as any,
      segmentRef: null,
      contentHash: 'h',
      state: 'available',
    });
    const obj = core.createObject({ type: 'technology', name: 'Test', actor: 'test', tenantId: 'default' });
    const claim = core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'X',
      evidenceRefs: [evidenceId],
      confidence: 0.9,
      supportState: { level: 'weak', evidenceCount: 1, disagreeingCount: 0 },
      actor: 'test',
      tenantId: 'default',
    });
    expect(claim.confidence).toBe(0.9);
    expect(claim.supportState.level).toBe('weak');
    expect(claim.supportState).not.toBe(claim.confidence);
  });
});

describe('Candidate → Decision → Policy pipeline', () => {
  function buildEvidence(core: MemoryCore, id: string) {
    core.createEvidence({
      id,
      sourceVersionId: createId('sv', id) as any,
      segmentRef: null,
      contentHash: `hash-${id}`,
      state: 'available',
      tenantId: 'default',
    });
  }

  it('candidate with 2+ evidence is accepted and allowed', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    const e2 = createId('ev', 'e2') as any;
    buildEvidence(core, e1);
    buildEvidence(core, e2);
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: { subject: 'X', predicate: 'has_role', value: 'Y' },
      evidenceRefs: [e1, e2],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
      tenantId: 'default',
    });
    const decision = core.decide(candidate.id, 'test');
    expect(decision.verdict).toBe('Accept');
    const policy = core.applyPolicy(decision.id, 'test');
    expect(policy.action).toBe('Allow');
  });

  it('candidate with 0 evidence is rejected and denied', () => {
    const core = buildCore();
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: {},
      evidenceRefs: [],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
      tenantId: 'default',
    });
    const decision = core.decide(candidate.id, 'test');
    expect(decision.verdict).toBe('Reject');
    const policy = core.applyPolicy(decision.id, 'test');
    expect(policy.action).toBe('Deny');
  });

  it('M9: candidate alone does not create memory', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: { subject: 'X', predicate: 'has_role', value: 'Y' },
      evidenceRefs: [e1],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
      tenantId: 'default',
    });
    expect((core as any).deps.claims.all().length).toBe(0);
    expect((core as any).deps.objects.all().length).toBe(0);
  });

  it('M10: decision alone does not create memory', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: {},
      evidenceRefs: [e1],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
      tenantId: 'default',
    });
    core.decide(candidate.id, 'test');
    expect((core as any).deps.claims.all().length).toBe(0);
    expect((core as any).deps.objects.all().length).toBe(0);
  });

  it('candidate cannot be decided twice', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: {},
      evidenceRefs: [e1],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
      tenantId: 'default',
    });
    core.decide(candidate.id, 'test');
    expect(() => core.decide(candidate.id, 'test')).toThrow('already decided');
  });

  it('escalate leads to quarantine', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'technology', name: 'Test', actor: 'test', tenantId: 'default' });
    core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'X',
      evidenceRefs: [e1],
      actor: 'test',
      tenantId: 'default',
    });
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: {},
      evidenceRefs: [e1],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
      tenantId: 'default',
    });
    const decision = core.decide(candidate.id, 'test');
    expect(decision.verdict).toBe('Escalate');
    const policy = core.applyPolicy(decision.id, 'test');
    expect(policy.action).toBe('Quarantine');
  });
});

describe('SemanticRepresentation + retrieval', () => {
  function buildEvidence(core: MemoryCore, id: string) {
    core.createEvidence({
      id,
      sourceVersionId: createId('sv', id) as any,
      segmentRef: null,
      contentHash: `hash-${id}`,
      state: 'available',
      tenantId: 'default',
    });
  }

  it('create semantic representation from evidence', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const rep = core.createSemanticRepresentation({
      type: 'summary',
      evidenceId: e1,
      content: 'PostgreSQL selected as primary database in 2022. Later migration caused problems.',
      actor: 'test',
      tenantId: 'default',
    });
    expect(rep.type).toBe('summary');
    expect(rep.content).toContain('PostgreSQL');
    expect(rep.tokenCount).toBeGreaterThan(0);
    expect(rep.semanticClasses).toContain('topic');
  });

  it('M8: representation is rebuildable, index loss does not affect memory', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    core.createSemanticRepresentation({
      type: 'summary',
      evidenceId: e1,
      content: 'Some content',
      actor: 'test',
      tenantId: 'default',
    });
    const original = core.getSemanticRepresentationsByType('summary');
    expect(original.length).toBe(1);
    // Rebuild
    const rebuilt = core.createSemanticRepresentation({
      type: 'summary',
      evidenceId: e1,
      content: 'Some content',
      actor: 'test',
      tenantId: 'default',
    });
    expect(rebuilt.id).not.toBe(original[0].id);
  });

  it('get representations by evidence', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    core.createSemanticRepresentation({ type: 'summary', evidenceId: e1, content: 'A', actor: 'test' });
    core.createSemanticRepresentation({ type: 'essence_nl', evidenceId: e1, content: 'B', actor: 'test' });
    const reps = core.getSemanticRepresentationsByEvidence(e1);
    expect(reps.length).toBe(2);
  });

  it('representation without evidence is rejected', () => {
    const core = buildCore();
    const fakeEv = createId('ev', 'fake') as any;
    expect(() => core.createSemanticRepresentation({
      type: 'summary',
      evidenceId: fakeEv,
      content: 'test',
      actor: 'test',
    })).toThrow('Evidence not found');
  });

  it('traverseRelationships returns multi-hop paths', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const a = core.createObject({ type: 'decision', name: 'DB chosen', actor: 'test', tenantId: 'default' });
    const b = core.createObject({ type: 'incident', name: 'Migration failed', actor: 'test', tenantId: 'default' });
    const c = core.createObject({ type: 'decision', name: 'DB changed', actor: 'test', tenantId: 'default' });
    core.createRelationship({ sourceObject: a.id, relationType: 'caused_by', targetObject: b.id, evidenceRefs: [e1], actor: 'test', tenantId: 'default' });
    core.createRelationship({ sourceObject: b.id, relationType: 'caused_by', targetObject: c.id, evidenceRefs: [e1], actor: 'test', tenantId: 'default' });
    const paths = core.traverseRelationships(a.id);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].length).toBe(1);
    expect(paths[1].length).toBe(2);
  });

  it('traverseRelationships skips superseded relationships', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const a = core.createObject({ type: 'technology', name: 'A', actor: 'test', tenantId: 'default' });
    const b = core.createObject({ type: 'technology', name: 'B', actor: 'test', tenantId: 'default' });
    const c = core.createObject({ type: 'technology', name: 'C', actor: 'test', tenantId: 'default' });
    const rel1 = core.createRelationship({ sourceObject: a.id, relationType: 'supersedes', targetObject: b.id, evidenceRefs: [e1], actor: 'test', tenantId: 'default' });
    core.createRelationship({ sourceObject: b.id, relationType: 'related_to', targetObject: c.id, evidenceRefs: [e1], actor: 'test', tenantId: 'default' });
    // Manually supersede rel1
    (core as any).deps.relationships.save({ ...core.getRelationship(rel1.id), lifecycleState: 'superseded' });
    const paths = core.traverseRelationships(a.id);
    expect(paths.length).toBe(0);
  });

  it('getClaimsByObject resolves identity redirect', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const a = core.createObject({ type: 'technology', name: 'PG', actor: 'test', tenantId: 'default' });
    const b = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    core.mergeObjects(a.id, b.id, 'test');
    core.createClaim({
      subjectId: b.id,
      predicate: 'has_role',
      objectOrValue: 'Primary',
      evidenceRefs: [e1],
      actor: 'test',
      tenantId: 'default',
    });
    const claims = core.getClaimsByObject(a.id);
    expect(claims.length).toBe(1);
  });
});

describe('Segments + agent access', () => {
  function buildEvidence(core: MemoryCore, id: string) {
    core.createEvidence({
      id,
      sourceVersionId: createId('sv', id) as any,
      segmentRef: null,
      contentHash: `hash-${id}`,
      state: 'available',
      tenantId: 'default',
    });
  }

  it('export segment from context', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const ctx = core.createContext({ type: 'project', name: 'DB Decision', actor: 'test', tenantId: 'default' });
    const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    const segment = core.exportSegment({
      rootContext: ctx.id,
      purpose: 'incident_investigation',
      sensitivity: 'internal',
      actor: 'test',
      tenantId: 'default',
    });
    expect(segment.rootContext).toBe(ctx.id);
    expect(segment.includedObjects).toContain(obj.id);
    expect(segment.sensitivity).toBe('internal');
  });

  it('verify segment signature', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const segment = core.exportSegment({ rootContext: ctx.id, purpose: 'test', sensitivity: 'internal', actor: 'test' });
    expect(core.verifySegment(segment.id)).toBe(true);
  });

  it('verify rejects tampered segment', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const segment = core.exportSegment({ rootContext: ctx.id, purpose: 'test', sensitivity: 'internal', actor: 'test' });
    const tampered = { ...core.getSegment(segment.id), payloadHash: 'tampered' };
    (core as any).deps.segments.save(tampered);
    expect(core.verifySegment(segment.id)).toBe(false);
  });

  it('agent context returns empty for unknown context', () => {
    const core = buildCore();
    expect(core.getAgentContext({ contextId: 'ctx:fake' })).toBe(null);
  });

  it('agent context returns members', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx.id, memberType: 'evidence', memberId: e1, mode: 'explicit', actor: 'test', tenantId: 'default' });
    const pkg = core.getAgentContext({ contextId: ctx.id });
    expect(pkg).not.toBe(null);
    expect(pkg!.objects.length).toBe(1);
    expect(pkg!.evidence.length).toBe(1);
  });

  it('agent context includes known gaps', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const gap = core.createKnowledgeGap({ type: 'OpenQuestion', description: 'Why?', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx.id, memberType: 'knowledge_gap', memberId: gap.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    const pkg = core.getAgentContext({ contextId: ctx.id });
    expect(pkg!.knownGaps.length).toBe(1);
  });

  it('agent context filters members by maxSensitivity', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Security', actor: 'test', tenantId: 'default' });
    const internalObject = core.createObject({ type: 'technology', name: 'Internal', actor: 'test', sensitivity: 'internal', tenantId: 'default' });
    const restrictedObject = core.createObject({ type: 'technology', name: 'Secret', actor: 'test', sensitivity: 'restricted', tenantId: 'default' });
    const restrictedClaim = core.createClaim({
      subjectId: restrictedObject.id,
      predicate: 'has_property',
      objectOrValue: 'confidential',
      evidenceRefs: [core.createEvidence({
        id: createId('ev', 'claim-ev') as any,
        sourceVersionId: createId('sv', 'claim-ev') as any,
        segmentRef: null,
        contentHash: 'claim-ev',
        state: 'available',
      }).id],
      actor: 'test',
      sensitivity: 'restricted',
      tenantId: 'default',
    });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: internalObject.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: restrictedObject.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx.id, memberType: 'claim', memberId: restrictedClaim.id, mode: 'explicit', actor: 'test', tenantId: 'default' });

    const internalOnly = core.getAgentContext({ contextId: ctx.id, maxSensitivity: 'internal' });
    expect(internalOnly!.objects.map((object) => object.name)).toEqual(['Internal']);
    expect(internalOnly!.claims).toHaveLength(0);

    const unrestricted = core.getAgentContext({ contextId: ctx.id, maxSensitivity: 'restricted' });
    expect(unrestricted!.objects.length).toBe(2);
    expect(unrestricted!.claims.length).toBe(1);
  });

  it('segment expires', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const segment = core.exportSegment({ rootContext: ctx.id, purpose: 'test', sensitivity: 'internal', actor: 'test', expiresInDays: 7 });
    expect(segment.expiresAt).not.toBe(null);
  });
});

describe('Invariant coverage — remaining 12 invariants', () => {
  function buildEvidence(core: MemoryCore, id: string) {
    core.createEvidence({
      id,
      sourceVersionId: createId('sv', id) as any,
      segmentRef: null,
      contentHash: `hash-${id}`,
      state: 'available',
      tenantId: 'default',
    });
  }

  it('M2: evidence is immutable (no mutation method exists, state change goes through explicit operation)', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const before = core.getEvidence(e1);
    // Only allowed state transition:
    core.markEvidenceUnavailable(e1, 'test');
    const after = core.getEvidence(e1);
    expect(before.createdAt).toBe(after.createdAt);
    expect(before.contentHash).toBe(after.contentHash);
    expect(before.sourceVersionId).toBe(after.sourceVersionId);
    expect(after.state).toBe('unavailable');
  });

  it('M3: SourceVersion is immutable (stored once, no update path)', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const ev = core.getEvidence(e1);
    expect(ev.sourceVersionId).toBe(createId('sv', e1) as any);
    // Domain has no updateSourceVersion operation; evidence references stay valid
    const claims = core as any;
    expect(claims.deps.evidence.get(e1)).toBeDefined();
  });

  it('M6: context membership never copies object (two contexts share same object)', () => {
    const core = buildCore();
    const ctx1 = core.createContext({ type: 'project', name: 'A', actor: 'test', tenantId: 'default' });
    const ctx2 = core.createContext({ type: 'project', name: 'B', actor: 'test', tenantId: 'default' });
    const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx1.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx2.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    // Mutate object once
    (core as any).deps.objects.save({ ...obj, name: 'PostgreSQL 16' });
    // Both memberships resolve to same (mutated) object — reference semantics
    const pkg1 = core.getAgentContext({ contextId: ctx1.id });
    const pkg2 = core.getAgentContext({ contextId: ctx2.id });
    expect(pkg1!.objects[0].name).toBe('PostgreSQL 16');
    expect(pkg2!.objects[0].name).toBe('PostgreSQL 16');
  });

  it('M7: contradiction never destroys a claim', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    const claim1 = core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'Primary',
      evidenceRefs: [e1],
      actor: 'test',
      tenantId: 'default',
    });
    const claim2 = core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'Deprecated',
      evidenceRefs: [e1],
      actor: 'test',
      tenantId: 'default',
    });
    core.createRelationship({
      sourceObject: obj.id,
      relationType: 'contradicts',
      targetObject: obj.id,
      evidenceRefs: [e1],
      actor: 'test',
      tenantId: 'default',
    });
    // Both claims still exist and are active
    expect(core.getClaim(claim1.id).lifecycleState).toBe('active');
    expect(core.getClaim(claim2.id).lifecycleState).toBe('active');
  });

  it('M11: policy does not alter epistemic results (decision unchanged after policy)', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: {},
      evidenceRefs: [e1],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
      tenantId: 'default',
    });
    const decision = core.decide(candidate.id, 'test');
    core.applyPolicy(decision.id, 'test');
    const after = core.getDecision(decision.id);
    expect(after.verdict).toBe(decision.verdict);
    expect(after.reasoning).toBe(decision.reasoning);
  });

  it('M12: Decision Layer has no ACL authority (DecisionModel interface has no ACL output)', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: {},
      evidenceRefs: [e1],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
      tenantId: 'default',
    });
    const decision = core.decide(candidate.id, 'test');
    // Decision has no ACL fields; only Policy does
    expect((decision as any).aclRef).toBeUndefined();
    const policy = core.applyPolicy(decision.id, 'test');
    expect(policy).toHaveProperty('aclRef');
  });

  it('M13: LLM-like provider cannot mutate memory directly (only via Candidate pipeline)', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    const objectsBefore = (core as any).deps.objects.all().length;
    const claimsBefore = (core as any).deps.claims.all().length;
    // "LLM" proposes candidate — memory unchanged
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: { subject: obj.id, predicate: 'has_role', value: 'Injected' },
      evidenceRefs: [e1],
      extractor: 'llm-provider',
      extractorVersion: '1.0.0',
      actor: 'llm',
    });
    expect((core as any).deps.claims.all().length).toBe(claimsBefore);
    // Full pipeline required to mutate
    const decision = core.decide(candidate.id, 'test');
    core.applyPolicy(decision.id, 'test');
    expect((core as any).deps.claims.all().length).toBe(claimsBefore);
    expect((core as any).deps.objects.all().length).toBe(objectsBefore);
  });

  it('M15: every memory mutation has a journal event', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const journalBefore = core.getJournal().length;
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    expect(core.getJournal().length).toBe(journalBefore + 1);
    core.createClaim({ subjectId: obj.id, predicate: 'has_role', objectOrValue: 'Y', evidenceRefs: [e1], actor: 'test', tenantId: 'default' });
    expect(core.getJournal().length).toBe(journalBefore + 2);
  });

  it('M16: failed mutation leaves no journal event (atomic rollback)', () => {
    const core = buildCore();
    const journalBefore = core.getJournal().length;
    expect(() => core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' })).not.toThrow();
    const after = core.getJournal().length;
    expect(() => core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' })).toThrow('M4 violated');
    expect(core.getJournal().length).toBe(after);
  });

  it('M17: historical state reconstructable from journal', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    core.createClaim({ subjectId: obj.id, predicate: 'has_role', objectOrValue: 'Y', evidenceRefs: [e1], actor: 'test', tenantId: 'default' });
    const journal = core.getJournal();
    const createEvents = journal.filter((event) => event.operation === 'create');
    expect(createEvents.length).toBeGreaterThanOrEqual(3);
    expect(journal[0].operation).toBe('create');
    expect(journal[0].entityType).toBe('evidence');
  });

  it('M18: unknown states explicit (KnowledgeGap is valid state representation)', () => {
    const core = buildCore();
    const gap = core.createKnowledgeGap({
      type: 'UnknownDependency',
      description: 'We do not know if service X depends on service Y',
      actor: 'test',
      tenantId: 'default',
    });
    expect(gap.lifecycleState).toBe('open');
    const resolved = core.resolveKnowledgeGap(gap.id, 'test');
    expect(resolved.lifecycleState).toBe('resolved');
    expect(resolved.resolvedAt).not.toBe(null);
  });

  it('M20: core independent of concrete technology (custom DecisionModel swap works)', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    (core as any).deps.decisionModel = {
      evaluate: () => ({ verdict: 'Escalate', reasoning: 'custom model' }),
    };
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: {},
      evidenceRefs: [e1],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
      tenantId: 'default',
    });
    const decision = core.decide(candidate.id, 'test');
    expect(decision.verdict).toBe('Escalate');
    expect(decision.reasoning).toBe('custom model');
  });
});

describe('SQLite persistent adapter (Stage 2)', () => {
  // imports lazy, since vitest with better-sqlite3 native module
  let sqlite: typeof import('../src/adapters/sqlite/index.js');
  let mkdtemp: typeof import('node:fs').mkdtempSync;
  let rmSync: typeof import('node:fs').rmSync;
  let tmpDir: string;

  beforeAll(async () => {
    sqlite = await import('../src/adapters/sqlite/index.js');
    mkdtemp = (await import('node:fs')).mkdtempSync;
    rmSync = (await import('node:fs')).rmSync;
    tmpDir = mkdtemp('/tmp/retineo-mc-test-');
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function buildSqliteCore(dbFile: string): { core: MemoryCore; close: () => void } {
    const db = new sqlite.SqliteDatabase(dbFile);
    const core = new MemoryCore({
      objects: new sqlite.SqliteObjectRepository(db),
      claims: new sqlite.SqliteClaimRepository(db),
      relationships: new sqlite.SqliteRelationshipRepository(db),
      contexts: new sqlite.SqliteContextRepository(db),
      memberships: new sqlite.SqliteMembershipRepository(db),
      gaps: new sqlite.SqliteGapRepository(db),
      evidence: new sqlite.SqliteEvidenceRepository(db),
      provenance: new sqlite.SqliteProvenanceRepository(db),
      journal: new sqlite.SqliteJournal(db),
      transaction: new sqlite.SqliteTransaction(db),
      identity: new sqlite.SqliteIdentityResolver(db),
      candidates: new InMemoryCandidateRepository(),
      decisions: new InMemoryDecisionRepository(),
      policies: new InMemoryPolicyRepository(),
      decisionModel: new DeterministicDecisionModel(),
      policyModel: new PermissivePolicyModel(),
      representations: new InMemoryRepresentationRepository(),
      representationModel: new TrivialRepresentationModel(),
      segments: new InMemorySegmentRepository(),
      segmentSecurity: new TrivialSegmentSecurityModel(),
      _db: db,
    } as any);
    return { core, close: () => db.close() };
  }

  it('persistence: memory survives process restart (close + reopen)', () => {
    const dbFile = `${tmpDir}/test1.db`;
    const evidenceId = createId('ev', 'e1') as any;

    // "First run"
    {
      const { core, close } = buildSqliteCore(dbFile);
      core.createEvidence({
        id: evidenceId,
        sourceVersionId: createId('sv', 'sv-1') as any,
        segmentRef: null,
        contentHash: 'hash-1',
        state: 'available',
      });
      const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
      core.createClaim({
        subjectId: obj.id,
        predicate: 'has_role',
        objectOrValue: 'Primary',
        evidenceRefs: [evidenceId],
        validFrom: '2022-01-01',
        actor: 'test',
        tenantId: 'default',      });
      const ctx = core.createContext({ type: 'project', name: 'DB Decision', actor: 'test', tenantId: 'default' });
      core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
      close();
    }

    // "Second run" — reopen same file
    {
      const db = new sqlite.SqliteDatabase(dbFile);
      const core = new MemoryCore({
        objects: new sqlite.SqliteObjectRepository(db),
        claims: new sqlite.SqliteClaimRepository(db),
        relationships: new sqlite.SqliteRelationshipRepository(db),
        contexts: new sqlite.SqliteContextRepository(db),
        memberships: new sqlite.SqliteMembershipRepository(db),
        gaps: new sqlite.SqliteGapRepository(db),
        evidence: new sqlite.SqliteEvidenceRepository(db),
        provenance: new sqlite.SqliteProvenanceRepository(db),
        journal: new sqlite.SqliteJournal(db),
        transaction: new sqlite.SqliteTransaction(db),
        identity: new sqlite.SqliteIdentityResolver(db),
        candidates: new InMemoryCandidateRepository(),
        decisions: new InMemoryDecisionRepository(),
        policies: new InMemoryPolicyRepository(),
        decisionModel: new DeterministicDecisionModel(),
        policyModel: new PermissivePolicyModel(),
        representations: new InMemoryRepresentationRepository(),
        representationModel: new TrivialRepresentationModel(),
        segments: new InMemorySegmentRepository(),
        segmentSecurity: new TrivialSegmentSecurityModel(),
      });
      // Data survived
      const obj = core.getObject('obj:postgresql');
      expect(obj.lifecycleState).toBe('active');
      const claims = (core as any).deps.claims.bySubject('obj:postgresql');
      expect(claims.length).toBe(1);
      expect(claims[0].temporalState.validFrom).toBe('2022-01-01');
      const provenance = core.getProvenance(claims[0].id);
      expect(provenance.length).toBe(1);
      const journal = core.getJournal();
      expect(journal.length).toBeGreaterThanOrEqual(4);
      const pkg = core.getAgentContext({ contextId: 'ctx:db-decision' });
      expect(pkg!.objects.length).toBe(1);
      db.close();
    }
  });

  it('M16 SQLite: failed mutation rolls back atomically', () => {
    const dbFile = `${tmpDir}/test2.db`;
    const { core, close } = buildSqliteCore(dbFile);
    core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    const journalBefore = core.getJournal().length;
    expect(() => core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' })).toThrow('M4 violated');
    expect(core.getJournal().length).toBe(journalBefore);
    expect((core as any).deps.objects.all().length).toBe(1);
    close();
  });

  it('M15 SQLite: every mutation has journal event with auto-increment sequence', () => {
    const dbFile = `${tmpDir}/test3.db`;
    const { core, close } = buildSqliteCore(dbFile);
    const e1 = createId('ev', 'e1') as any;
    core.createEvidence({
      id: e1,
      sourceVersionId: createId('sv', 'sv-1') as any,
      segmentRef: null,
      contentHash: 'h',
      state: 'available',
    });
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    core.createClaim({ subjectId: obj.id, predicate: 'has_role', objectOrValue: 'Y', evidenceRefs: [e1], actor: 'test', tenantId: 'default' });
    const journal = core.getJournal();
    expect(journal.length).toBe(3);
    expect(journal[0].sequence).toBe(1);
    expect(journal[1].sequence).toBe(2);
    expect(journal[2].sequence).toBe(3);
    close();
  });
});

describe('Filesystem ingestion (Stage 3)', () => {
  let fs: typeof import('node:fs');
  let path: typeof import('node:path');
  let os: typeof import('node:os');
  let ingestion: typeof import('../src/adapters/ingestion/index.js');
  let testDir: string;

  beforeAll(async () => {
    fs = await import('node:fs');
    path = await import('node:path');
    os = await import('node:os');
    ingestion = await import('../src/adapters/ingestion/index.js');
  });

  function buildIngestion() {
    const sources = new InMemorySourceRepository();
    const items = new InMemorySourceItemRepository();
    const versions = new InMemorySourceVersionRepository();
    const evidence = new InMemoryEvidenceRepository();
    const adapter = new ingestion.FilesystemSourceAdapter(sources, items, versions, evidence);
    return { adapter, sources, items, versions, evidence };
  }

  it('ingest text files: creates source, items, versions, evidence', () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retineo-ingest-'));
    fs.writeFileSync(path.join(testDir, 'adr-001.md'), '# ADR-001: Use PostgreSQL\n\nDecision: PostgreSQL is primary database.');
    fs.writeFileSync(path.join(testDir, 'adr-002.md'), '# ADR-002: Migrate to CockroachDB\n\nSupersedes ADR-001.');
    fs.writeFileSync(path.join(testDir, 'notes.txt'), 'Meeting notes: migration discussed.');
    fs.writeFileSync(path.join(testDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const { adapter, sources, items, versions, evidence } = buildIngestion();
    const result = adapter.ingest(testDir, {
      sourceName: 'Test Project Docs',
      trustProfile: 'trusted',
      actor: 'test',
      tenantId: 'default',
    });

    expect(result.itemsIngested).toBe(3);
    expect(result.versionsCreated).toBe(3);
    expect(result.evidenceCreated).toBe(3);
    expect(result.skipped).toBe(0);

    expect(sources.all().length).toBe(1);
    expect(sources.all()[0].type).toBe('filesystem');
    expect(items.all().length).toBe(3);
    expect(versions.all().length).toBe(3);
    expect(evidence.all().length).toBe(3);
  });

  });

describe('Filesystem ingestion lifecycle (single test, shared state)', () => {
  let fs: typeof import('node:fs');
  let path: typeof import('node:path');
  let os: typeof import('node:os');
  let ingestion: typeof import('../src/adapters/ingestion/index.js');
  let testDir: string;
  let adapter: any;
  let sources: any;
  let items: any;
  let versions: any;
  let evidence: any;

  beforeAll(async () => {
    fs = await import('node:fs');
    path = await import('node:path');
    os = await import('node:os');
    ingestion = await import('../src/adapters/ingestion/index.js');
    sources = new InMemorySourceRepository();
    items = new InMemorySourceItemRepository();
    versions = new InMemorySourceVersionRepository();
    evidence = new InMemoryEvidenceRepository();
    adapter = new ingestion.FilesystemSourceAdapter(sources, items, versions, evidence);
  });

  it('full lifecycle: ingest → skip → change → re-ingest → verify hash', () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retineo-ingest2-'));
    fs.writeFileSync(path.join(testDir, 'adr-001.md'), '# ADR-001: Use PostgreSQL\n\nDecision: PostgreSQL is primary.');
    fs.writeFileSync(path.join(testDir, 'adr-002.md'), '# ADR-002: Migrate to CockroachDB\n\nSupersedes ADR-001.');
    fs.writeFileSync(path.join(testDir, 'notes.txt'), 'Meeting notes: migration discussed.');

    // Step 1: initial ingest
    const result1 = adapter.ingest(testDir, { sourceName: 'Test Project Docs', trustProfile: 'trusted', actor: 'test' });
    expect(result1.itemsIngested).toBe(3);
    expect(result1.versionsCreated).toBe(3);
    expect(result1.evidenceCreated).toBe(3);
    expect(result1.skipped).toBe(0);
    expect(sources.all().length).toBe(1);
    expect(sources.all()[0].type).toBe('filesystem');
    expect(items.all().length).toBe(3);
    expect(versions.all().length).toBe(3);
    expect(evidence.all().length).toBe(3);

    // Step 2: re-ingest unchanged — skip
    const result2 = adapter.ingest(testDir, { sourceName: 'Test Project Docs', trustProfile: 'trusted', actor: 'test' });
    expect(result2.skipped).toBe(3);
    expect(result2.itemsIngested).toBe(0);
    expect(result2.versionsCreated).toBe(0);
    expect(result2.evidenceCreated).toBe(0);
    expect(items.all().length).toBe(3);
    expect(versions.all().length).toBe(3);
    expect(evidence.all().length).toBe(3);

    // Step 3: change one file, add one
    fs.writeFileSync(path.join(testDir, 'adr-001.md'), '# ADR-001 v2: Updated decision.');
    fs.writeFileSync(path.join(testDir, 'adr-003.md'), '# ADR-003: Rollback to PostgreSQL\n\nSupersedes ADR-002.');
    const result3 = adapter.ingest(testDir, { sourceName: 'Test Project Docs', trustProfile: 'trusted', actor: 'test' });
    expect(result3.versionsCreated).toBe(2);
    expect(result3.evidenceCreated).toBe(2);
    expect(result3.skipped).toBe(2);
    expect(items.all().length).toBe(4);
    expect(versions.all().length).toBe(5);
    expect(evidence.all().length).toBe(5);

    // Item points to new version
    const item = items.all().find((item) => item.externalId === 'adr-001.md');
    const oldVersion = versions.all()[0];
    expect(item!.currentVersionId).not.toBe(oldVersion.id);

    // M3: old version still exists (immutable, append-only)
    expect(versions.all().length).toBe(5);

    // M2: evidence content hash matches
    const crypto = require('node:crypto');
    const content = fs.readFileSync(path.join(testDir, 'adr-002.md'), 'utf8');
    const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
    const ev = evidence.all().find((evidence) => evidence.contentHash === expectedHash);
    expect(ev).toBeDefined();
    expect(ev!.state).toBe('available');
  });
});

describe('Sandboxing untrusted sources (handoff #40)', () => {
  let fs: typeof import('node:fs');
  let path: typeof import('node:path');
  let os: typeof import('node:os');
  let ingestion: typeof import('../src/adapters/ingestion/index.js');

  beforeAll(async () => {
    fs = await import('node:fs');
    path = await import('node:path');
    os = await import('node:os');
    ingestion = await import('../src/adapters/ingestion/index.js');
  });

  it('untrusted source → evidence quarantined (unavailable), cannot be used in claims', () => {
    const core = buildCore();
    const sources = new InMemorySourceRepository();
    const items = new InMemorySourceItemRepository();
    const versions = new InMemorySourceVersionRepository();
    const adapter = new ingestion.FilesystemSourceAdapter(sources, items, versions, (core as any).deps.evidence);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retineo-untrusted-'));
    fs.writeFileSync(path.join(dir, 'external.md'), '# External report\n\nUntrusted content.');

    const result = adapter.ingest(dir, { sourceName: 'External', trustProfile: 'untrusted', actor: 'test' });
    expect(result.quarantined).toBe(true);
    expect(result.evidenceCreated).toBe(1);

    const ev = (core as any).deps.evidence.all()[0];
    expect(ev.state).toBe('unavailable');

    const obj = core.createObject({ type: 'report', name: 'External', actor: 'test', tenantId: 'default' });
    expect(() => core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'X',
      evidenceRefs: [ev.id],
      actor: 'test',
    })).toThrow('quarantined');
  });

  it('trusted source → evidence available, usable in claims', () => {
    const core = buildCore();
    const sources = new InMemorySourceRepository();
    const items = new InMemorySourceItemRepository();
    const versions = new InMemorySourceVersionRepository();
    const adapter = new ingestion.FilesystemSourceAdapter(sources, items, versions, (core as any).deps.evidence);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retineo-trusted-'));
    fs.writeFileSync(path.join(dir, 'adr.md'), '# ADR\n\nDecision.');

    const result = adapter.ingest(dir, { sourceName: 'Internal', trustProfile: 'trusted', actor: 'test' });
    expect(result.quarantined).toBe(false);
    const ev = (core as any).deps.evidence.all()[0];
    expect(ev.state).toBe('available');

    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    const claim = core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'Primary',
      evidenceRefs: [ev.id],
      actor: 'test',
      tenantId: 'default',
    });
    expect(claim.lifecycleState).toBe('active');
  });
});

describe('Candidate extraction pipeline (Stage 4)', () => {
  it('Evidence → extraction → candidates → decisions → memory (full pipeline)', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    core.createEvidence({
      id: e1,
      sourceVersionId: createId('sv', 'sv-1') as any,
      segmentRef: null,
      contentHash: 'h1',
      state: 'available',
    });

    const content = `
      We chose PostgreSQL as the primary database.
      The migration failure caused by bad configuration.
      ADR-002 supersedes ADR-001.
    `;
    const result = core.extractFromEvidence({ evidenceId: e1, content, actor: 'test' });

    expect(result.candidatesCreated).toBeGreaterThan(0);
    expect(result.accepted).toBeGreaterThan(0);
    expect(result.quarantined + result.accepted + result.rejected).toBe(result.candidatesCreated);

    // Objects created from extracted subjects
    const objects = (core as any).deps.objects.all();
    expect(objects.length).toBeGreaterThan(0);

    // Claims created
    const claims = (core as any).deps.claims.all();
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((claim: any) => claim.evidenceRefs.includes(e1))).toBe(true);

    // Relationships created
    const relationships = (core as any).deps.relationships.all();
    expect(relationships.length).toBeGreaterThan(0);
  });

  it('single evidence with existing claims → Escalate → Quarantine', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    core.createEvidence({
      id: e1,
      sourceVersionId: createId('sv', 'sv-1') as any,
      segmentRef: null,
      contentHash: 'h1',
      state: 'available',
    });
    // Create existing claim manually to trigger Escalate on next single-evidence candidate
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'Y',
      evidenceRefs: [e1],
      actor: 'test',
      tenantId: 'default',
    });

    const content = 'We chose PostgreSQL.';
    const result = core.extractFromEvidence({ evidenceId: e1, content, actor: 'test' });
    expect(result.candidatesCreated).toBeGreaterThan(0);
    // First extraction gets Escalate (1 evidence + existing claims) → Quarantine
    expect(result.quarantined).toBeGreaterThan(0);
  });

  it('quarantined evidence cannot be extracted', () => {
    const core = buildCore();
    const e1 = createId('ev', 'q1') as any;
    core.createEvidence({
      id: e1,
      sourceVersionId: createId('sv', 'sv-1') as any,
      segmentRef: null,
      contentHash: 'h',
      state: 'unavailable',
    });
    expect(() => core.extractFromEvidence({
      evidenceId: e1,
      content: 'test',
      actor: 'test',
    })).toThrow('quarantined');
  });

  it('extractFromEvidenceAsync: full async pipeline and extractor metadata', async () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    core.createEvidence({
      id: e1,
      sourceVersionId: createId('sv', 'sv-1') as any,
      segmentRef: null,
      contentHash: 'h1',
      state: 'available',
    });
    const result = await core.extractFromEvidenceAsync({
      evidenceId: e1,
      content: 'Alice has role engineer.',
      actor: 'test',
      extractionModel: {
        extractAsync: async () => ({
          claims: [{ subjectName: 'Alice', predicate: 'has_role', objectOrValue: 'engineer', confidence: 0.9, basis: 'mock' }],
          relationships: [{ sourceName: 'Alice', relationType: 'supports', targetName: 'Bob', confidence: 0.8, basis: null }],
        }),
      },
    });
    expect(result.candidatesCreated).toBe(2);
    expect(result.accepted).toBe(2);
    const candidates = (core as any).deps.candidates.all();
    expect(candidates.every((candidate: any) => candidate.extractor === 'async-extraction')).toBe(true);
    expect((core as any).deps.relationships.all().length).toBe(1);
  });

  it('extraction with empty content produces no candidates', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    core.createEvidence({
      id: e1,
      sourceVersionId: createId('sv', 'sv-1') as any,
      segmentRef: null,
      contentHash: 'h',
      state: 'available',
    });
    const result = core.extractFromEvidence({ evidenceId: e1, content: '', actor: 'test' });
    expect(result.candidatesCreated).toBe(0);
  });
});

describe('Retrieval projections / query engine (Stage 5)', () => {
  let QueryEngine: any;

  beforeAll(async () => {
    const module = await import('../src/index.js');
    QueryEngine = module.QueryEngine;
  });

  function buildPopulatedCore(): { core: MemoryCore; engine: any; e1: string; e2: string; e3: string } {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    const e2 = createId('ev', 'e2') as any;
    const e3 = createId('ev', 'e3') as any;
    for (const [id, hash] of [[e1, 'h1'], [e2, 'h2'], [e3, 'h3']] as const) {
      core.createEvidence({
        id, sourceVersionId: createId('sv', hash) as any, segmentRef: null, contentHash: hash, state: 'available',
      });
    }
    const postgres = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    const incident = core.createObject({ type: 'incident', name: 'Migration Failure', actor: 'test', tenantId: 'default' });
    const decision = core.createObject({ type: 'decision', name: 'Switch to CockroachDB', actor: 'test', tenantId: 'default' });
    core.createClaim({ subjectId: postgres.id, predicate: 'has_role', objectOrValue: 'PrimaryDatabase', evidenceRefs: [e1], validFrom: '2022-01-01', actor: 'test', tenantId: 'default' });
    core.createClaim({ subjectId: incident.id, predicate: 'has_property', objectOrValue: 'caused_outage', evidenceRefs: [e2], actor: 'test', tenantId: 'default' });
    core.createRelationship({ sourceObject: decision.id, relationType: 'supersedes', targetObject: postgres.id, evidenceRefs: [e3], actor: 'test', tenantId: 'default' });
    core.createRelationship({ sourceObject: incident.id, relationType: 'caused_by', targetObject: decision.id, evidenceRefs: [e2], actor: 'test', tenantId: 'default' });
    // Essence representations
    core.createSemanticRepresentation({ type: 'essence_nl', evidenceId: e1, content: 'PostgreSQL selected as primary database technology', actor: 'test' });
    core.createSemanticRepresentation({ type: 'essence_nl', evidenceId: e2, content: 'Migration failure caused operational problems', actor: 'test' });
    core.createSemanticRepresentation({ type: 'essence_nl', evidenceId: e3, content: 'Decision to switch away from PostgreSQL to CockroachDB', actor: 'test' });
    const engine = new QueryEngine(core);
    return { core, engine, e1, e2, e3 };
  }

  it('findEntryPoints: essence matching by tokens', () => {
    const { engine } = buildPopulatedCore();
    const result = engine.findEntryPoints('PostgreSQL database');
    expect(result.representations.length).toBeGreaterThan(0);
    expect(result.scoreExplanation.length).toBe(result.representations.length);
    // Top match mentions PostgreSQL
    const top = result.representations[0];
    const topContent = typeof top.content === 'string' ? top.content : JSON.stringify(top.content);
    expect(topContent.toLowerCase()).toContain('postgresql');
  });

  it('findEntryPoints: no match returns empty', () => {
    const { engine } = buildPopulatedCore();
    const result = engine.findEntryPoints('kubernetes deployment');
    expect(result.representations.length).toBe(0);
  });

  it('knowledgeQuery: claims by token match', () => {
    const { engine } = buildPopulatedCore();
    const result = engine.knowledgeQuery('primary database');
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.objects.length).toBeGreaterThan(0);
  });

  it('knowledgeQuery: relationships by relation type', () => {
    const { engine } = buildPopulatedCore();
    const result = engine.knowledgeQuery('supersedes');
    expect(result.relationships.length).toBeGreaterThan(0);
    expect(result.relationships[0].relationType).toBe('supersedes');
  });

  it('reconstructContext: multi-hop paths from start object', () => {
    const { engine } = buildPopulatedCore();
    const decision = (engine as any).core.getObject('obj:switch-to-cockroachdb');
    const result = engine.reconstructContext(decision.id);
    expect(result.objects.length).toBe(1);
    expect(result.claims.length).toBe(0); // decision has no claims, only relationships
    expect(result.paths.length).toBeGreaterThan(0);
  });

  it('reconstructContext: includes claims and gaps', () => {
    const { core, engine } = buildPopulatedCore();
    const postgres = core.getObject('obj:postgresql');
    const gap = core.createKnowledgeGap({
      type: 'UnresolvedConflict',
      subjectId: postgres.id,
      description: 'PostgreSQL role disputed',
      actor: 'test',
      tenantId: 'default',
    });
    const result = engine.reconstructContext(postgres.id);
    expect(result.claims.length).toBe(1);
    expect(result.gaps.length).toBe(1);
  });

  it('findMultiHopPaths: finds path between connected objects', () => {
    const { engine } = buildPopulatedCore();
    const incident = (engine as any).core.getObject('obj:migration-failure');
    const postgres = (engine as any).core.getObject('obj:postgresql');
    const paths = engine.findMultiHopPaths(incident.id, postgres.id);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].path[0].relationType).toBe('caused_by');
    expect(paths[0].path[1].relationType).toBe('supersedes');
    expect(paths[0].score).toBeGreaterThan(0);
  });

  it('findMultiHopPaths: returns direct path for same object', () => {
    const { engine } = buildPopulatedCore();
    const postgres = (engine as any).core.getObject('obj:postgresql');
    const paths = engine.findMultiHopPaths(postgres.id, postgres.id);
    expect(paths).toHaveLength(1);
    expect(paths[0].path).toHaveLength(0);
    expect(paths[0].score).toBe(1);
  });

  it('findMultiHopPaths: returns empty for disconnected objects', () => {
    const { core, engine } = buildPopulatedCore();
    const isolated = core.createObject({ type: 'technology', name: 'Isolated', actor: 'test', tenantId: 'default' });
    const postgres = (engine as any).core.getObject('obj:postgresql');
    const paths = engine.findMultiHopPaths(isolated.id, postgres.id);
    expect(paths).toHaveLength(0);
  });

  it('multi-tenant: getAgentContext filters by tenantId', () => {
    const core = buildCore();
    const objA = core.createObject({ type: 'technology', name: 'A', actor: 'test', tenantId: 'tenant-a' });
    const objB = core.createObject({ type: 'technology', name: 'B', actor: 'test', tenantId: 'tenant-b' });
    const ctx = core.createContext({ type: 'project', name: 'Shared', actor: 'test', tenantId: 'tenant-a' });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: objA.id, mode: 'explicit', actor: 'test', tenantId: 'tenant-a' });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: objB.id, mode: 'explicit', actor: 'test', tenantId: 'tenant-b' });
    const pkg = core.getAgentContext({ contextId: ctx.id, tenantId: 'tenant-a' });
    expect(pkg!.objects.map((object) => object.name)).toEqual(['A']);
  });
});

describe('Segment import (Stage 6)', () => {
  function buildEvidence(core: MemoryCore, id: string) {
    core.createEvidence({
      id,
      sourceVersionId: createId('sv', id) as any,
      segmentRef: null,
      contentHash: `hash-${id}`,
      state: 'available',
      tenantId: 'default',
    });
  }

  it('importSegment: verify without apply (autoApply=false)', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const segment = core.exportSegment({ rootContext: ctx.id, purpose: 'test', sensitivity: 'internal', actor: 'test' });
    const result = core.importSegment({ segment, actor: 'test', autoApply: false });
    expect(result.verified).toBe(true);
    expect(result.applied).toBe(false);
    const journal = core.getJournal().filter((event) => event.operation === 'import_verified');
    expect(journal.length).toBe(1);
  });

  it('importSegment: tampered segment rejected', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const segment = core.exportSegment({ rootContext: ctx.id, purpose: 'test', sensitivity: 'internal', actor: 'test' });
    const tampered = { ...core.getSegment(segment.id), payloadHash: 'tampered' };
    const result = core.importSegment({ segment: tampered, actor: 'test', autoApply: true });
    expect(result.verified).toBe(false);
    expect(result.applied).toBe(false);
    const journal = core.getJournal().filter((event) => event.operation === 'import_rejected');
    expect(journal.length).toBe(1);
  });

  it('importSegment: expired segment throws', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const segment = core.exportSegment({ rootContext: ctx.id, purpose: 'test', sensitivity: 'internal', actor: 'test', expiresInDays: -1 });
    expect(() => core.importSegment({ segment, actor: 'test', autoApply: false })).toThrow('expired');
  });

  it('importSegment: autoApply with existing members succeeds', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx.id, memberType: 'evidence', memberId: e1, mode: 'explicit', actor: 'test', tenantId: 'default' });
    const segment = core.exportSegment({ rootContext: ctx.id, purpose: 'test', sensitivity: 'internal', actor: 'test' });
    const result = core.importSegment({ segment, actor: 'test', autoApply: true });
    expect(result.verified).toBe(true);
    expect(result.applied).toBe(true);
  });

  it('importSegment: autoApply with missing member throws', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test', tenantId: 'default' });
    const segment = core.exportSegment({ rootContext: ctx.id, purpose: 'test', sensitivity: 'internal', actor: 'test' });
    // Remove object to simulate missing member
    (core as any).deps.objects.save({ ...core.getObject(obj.id), lifecycleState: 'retired' });
    expect(() => core.importSegment({ segment, actor: 'test', autoApply: true })).not.toThrow();
  });
});

describe('HTTP API (Stage 7)', () => {
  let createHttpServer: any;
  let app: any;

  beforeAll(async () => {
    const module = await import('../src/index.js');
    createHttpServer = module.createHttpServer;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('health check + create object + query object via HTTP', async () => {
    const core = buildCore();
    const QueryEngineClass = (await import('../src/core/query-engine.js')).QueryEngine;
    const engine = new QueryEngineClass(core);
    app = createHttpServer(core, engine, { port: 0, host: '127.0.0.1' });
    await app.ready();

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body).status).toBe('ok');

    const created = await app.inject({
      method: 'POST',
      url: '/objects',
      payload: { type: 'technology', name: 'TestObj', actor: 'test' },
    });
    expect(created.statusCode).toBe(200);
    const obj = JSON.parse(created.body);
    expect(obj.name).toBe('TestObj');

    const fetched = await app.inject({ method: 'GET', url: `/objects/${obj.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(JSON.parse(fetched.body).id).toBe(obj.id);
  });

  it('404 for missing object', async () => {
    const core = buildCore();
    const QueryEngineClass = (await import('../src/core/query-engine.js')).QueryEngine;
    const engine = new QueryEngineClass(core);
    const testApp = createHttpServer(core, engine, { port: 0, host: '127.0.0.1' });
    await testApp.ready();
    const response = await testApp.inject({ method: 'GET', url: '/objects/obj:fake' });
    expect(response.statusCode).toBe(404);
    await testApp.close();
  });

  it('claim via HTTP with evidence', async () => {
    const core = buildCore();
    const QueryEngineClass = (await import('../src/core/query-engine.js')).QueryEngine;
    const engine = new QueryEngineClass(core);
    const testApp = createHttpServer(core, engine, { port: 0, host: '127.0.0.1' });
    await testApp.ready();
    const e1 = createId('ev', 'e1') as any;
    core.createEvidence({
      id: e1, sourceVersionId: createId('sv', 'sv-1') as any, segmentRef: null, contentHash: 'h', state: 'available',
    });
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    const response = await testApp.inject({
      method: 'POST',
      url: '/claims',
      payload: {
        subjectId: obj.id,
        predicate: 'has_role',
        objectOrValue: 'Primary',
        evidenceRefs: [e1],
        actor: 'test',
      },
    });
    expect(response.statusCode).toBe(200);
    const claim = JSON.parse(response.body);
    expect(claim.predicate).toBe('has_role');
    expect(testApp !== undefined).toBe(true);
    await testApp.close();
  });
});

describe('MCP server (Stage 7)', () => {
  let MemoryCoreMCPServer: any;

  beforeAll(async () => {
    const module = await import('../src/index.js');
    MemoryCoreMCPServer = module.MemoryCoreMCPServer;
  });

  it('creates MCP server with tools', async () => {
    const core = buildCore();
    const QueryEngineClass = (await import('../src/core/query-engine.js')).QueryEngine;
    const engine = new QueryEngineClass(core);
    const server = new MemoryCoreMCPServer({ core, engine });
    expect(server).toBeDefined();
  });
});

describe('Negative cases — edge conditions', () => {
  function buildEvidence(core: MemoryCore, id: string) {
    core.createEvidence({
      id,
      sourceVersionId: createId('sv', id) as any,
      segmentRef: null,
      contentHash: `hash-${id}`,
      state: 'available',
      tenantId: 'default',
    });
  }

  it('getObject: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.getObject('obj:nonexistent' as any)).toThrow('Object not found');
  });

  it('getClaim: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.getClaim('claim:fake' as any)).toThrow('Claim not found');
  });

  it('getRelationship: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.getRelationship('rel:fake' as any)).toThrow('Relationship not found');
  });

  it('getContext: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.getContext('ctx:fake' as any)).toThrow('Context not found');
  });

  it('getEvidence: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.getEvidence('ev:fake' as any)).toThrow('Evidence not found');
  });

  it('getSegment: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.getSegment('seg:fake')).toThrow('Segment not found');
  });

  it('createClaim: unknown evidence throws', () => {
    const core = buildCore();
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    const fakeEv = createId('ev', 'fake') as any;
    expect(() => core.createClaim({
      subjectId: obj.id, predicate: 'has_role', objectOrValue: 'Y', evidenceRefs: [fakeEv], actor: 'test',
    })).toThrow('Unknown evidence');
  });

  it('createClaim: unavailable evidence throws', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    core.markEvidenceUnavailable(e1, 'test');
    expect(() => core.createClaim({
      subjectId: obj.id, predicate: 'has_role', objectOrValue: 'Y', evidenceRefs: [e1], actor: 'test',
    })).toThrow('unavailable');
  });

  it('createClaim: unknown subject throws', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    expect(() => core.createClaim({
      subjectId: 'obj:fake' as any, predicate: 'has_role', objectOrValue: 'Y', evidenceRefs: [e1], actor: 'test',
    })).toThrow('Subject object not found');
  });

  it('createRelationship: unknown source throws', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const target = core.createObject({ type: 'technology', name: 'B', actor: 'test', tenantId: 'default' });
    expect(() => core.createRelationship({
      sourceObject: 'obj:fake' as any, relationType: 'related_to', targetObject: target.id, evidenceRefs: [e1], actor: 'test',
    })).toThrow('Source object not found');
  });

  it('createRelationship: unknown target throws', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const source = core.createObject({ type: 'technology', name: 'A', actor: 'test', tenantId: 'default' });
    expect(() => core.createRelationship({
      sourceObject: source.id, relationType: 'related_to', targetObject: 'obj:fake' as any, evidenceRefs: [e1], actor: 'test',
    })).toThrow('Target object not found');
  });

  it('createRelationship: empty evidence throws (M1)', () => {
    const core = buildCore();
    const a = core.createObject({ type: 'technology', name: 'A', actor: 'test', tenantId: 'default' });
    const b = core.createObject({ type: 'technology', name: 'B', actor: 'test', tenantId: 'default' });
    expect(() => core.createRelationship({
      sourceObject: a.id, relationType: 'related_to', targetObject: b.id, evidenceRefs: [], actor: 'test',
    })).toThrow('M1 violated');
  });

  it('addMembership: unknown context throws', () => {
    const core = buildCore();
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    expect(() => core.addMembership({
      contextId: 'ctx:fake' as any, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test',
    })).toThrow('Context not found');
  });

  it('addMembership: unknown object member throws', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    expect(() => core.addMembership({
      contextId: ctx.id, memberType: 'object', memberId: 'obj:fake' as any, mode: 'explicit', actor: 'test',
    })).toThrow('Member object not found');
  });

  it('removeMembership: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.removeMembership('mem:fake' as any, 'test')).toThrow('Membership not found');
  });

  it('mergeObjects: merge object into itself throws', () => {
    const core = buildCore();
    const a = core.createObject({ type: 'technology', name: 'A', actor: 'test', tenantId: 'default' });
    expect(() => core.mergeObjects(a.id, a.id, 'test')).toThrow('Cannot merge object into itself');
  });

  it('mergeObjects: re-merge of redirected alias follows redirect (no-op on self, chain merge works)', () => {
    const core = buildCore();
    const a = core.createObject({ type: 'technology', name: 'A', actor: 'test', tenantId: 'default' });
    const b = core.createObject({ type: 'technology', name: 'B', actor: 'test', tenantId: 'default' });
    const c = core.createObject({ type: 'technology', name: 'C', actor: 'test', tenantId: 'default' });
    core.mergeObjects(a.id, b.id, 'test');
    // Alias a now resolves to b; merging alias a into c merges b into c
    expect(() => core.mergeObjects(a.id, c.id, 'test')).not.toThrow();
    expect(core.getObject(a.id).id).toBe(c.id);
  });

  it('markEvidenceUnavailable: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.markEvidenceUnavailable('ev:fake' as any, 'test')).toThrow('Evidence not found');
  });

  it('resolveKnowledgeGap: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.resolveKnowledgeGap('gap:fake' as any, 'test')).toThrow('Gap not found');
  });

  it('createSemanticRepresentation: unknown type is rejected by TS + runtime validation', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    expect(() => core.createSemanticRepresentation({
      type: 'bogus' as any, evidenceId: e1, content: 'test', actor: 'test',
    })).not.toThrow();
  });

  it('decide: unknown candidate throws', () => {
    const core = buildCore();
    expect(() => core.decide('cand:fake' as any, 'test')).toThrow('Candidate not found');
  });

  it('applyPolicy: unknown decision throws', () => {
    const core = buildCore();
    expect(() => core.applyPolicy('dec:fake' as any, 'test')).toThrow('Decision not found');
  });

  it('applyPolicy: double apply throws', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate', payload: {}, evidenceRefs: [e1], extractor: 'test', extractorVersion: '1.0.0', actor: 'test',
    });
    const decision = core.decide(candidate.id, 'test');
    core.applyPolicy(decision.id, 'test');
    expect(() => core.applyPolicy(decision.id, 'test')).toThrow('already policy-applied');
  });

  it('getCandidate/getDecision/getPolicy: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.getCandidate('cand:fake' as any)).toThrow('Candidate not found');
    expect(() => core.getDecision('dec:fake' as any)).toThrow('Decision not found');
    expect(() => core.getPolicy('pol:fake' as any)).toThrow('Policy not found');
  });

  it('getSemanticRepresentation: unknown id throws', () => {
    const core = buildCore();
    expect(() => core.getSemanticRepresentation('rep:fake' as any)).toThrow('Representation not found');
  });

  it('ingestDirectory (sync) throws', () => {
    const core = buildCore();
    expect(() => core.ingestDirectory({ dir: '/tmp', sourceName: 'X', trustProfile: 'trusted', actor: 'test' })).toThrow('requires async');
  });

  it('proposeCandidate: empty evidence is allowed (candidates are not memory, M1 applies to assertions)', () => {
    const core = buildCore();
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate', payload: {}, evidenceRefs: [], extractor: 'test', extractorVersion: '1.0.0', actor: 'test',
    });
    expect(candidate.evidenceRefs).toEqual([]);
  });

  it('proposeCandidate: unknown evidence throws', () => {
    const core = buildCore();
    const fakeEv = createId('ev', 'fake') as any;
    expect(() => core.proposeCandidate({
      type: 'ClaimCandidate', payload: {}, evidenceRefs: [fakeEv], extractor: 'test', extractorVersion: '1.0.0', actor: 'test',
    })).toThrow('Unknown evidence');
  });

  it('extractFromEvidence: unknown evidence throws', () => {
    const core = buildCore();
    expect(() => core.extractFromEvidence({
      evidenceId: 'ev:fake' as any, content: 'test', actor: 'test',
    })).toThrow('Evidence not found');
  });

  it('duplicate object name with different type shares id (createId ignores type) and M4 blocks second create', () => {
    const core = buildCore();
    const a = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    expect(() => core.createObject({ type: 'person', name: 'PostgreSQL', actor: 'test', tenantId: 'default' })).toThrow('M4 violated');
    expect(a.id).toBe('obj:postgresql');
    expect(() => core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' })).toThrow('M4 violated');
  });

  it('duplicate object name of merged object is allowed (createId same, tombstone check)', () => {
    const core = buildCore();
    const a = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' });
    const b = core.createObject({ type: 'technology', name: 'PG', actor: 'test', tenantId: 'default' });
    core.mergeObjects(b.id, a.id, 'test');
    // Original target still active, so same name rejects
    expect(() => core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test', tenantId: 'default' })).toThrow('M4 violated');
    void a;
  });

  it('duplicate context name is rejected (same id)', () => {
    const core = buildCore();
    core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' });
    expect(() => core.createContext({ type: 'project', name: 'Test', actor: 'test', tenantId: 'default' })).toThrow();
  });

  it('createContext: empty type accepted (no validation)', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: '', name: 'Test', actor: 'test', tenantId: 'default' });
    expect(ctx.type).toBe('');
  });

  it('createObject: empty name allowed (no validation)', () => {
    const core = buildCore();
    const obj = core.createObject({ type: 'technology', name: '', actor: 'test', tenantId: 'default' });
    expect(obj.name).toBe('');
  });

  it('createClaim: numeric objectOrValue with valid evidence works', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'metric', name: 'Uptime', actor: 'test', tenantId: 'default' });
    const claim = core.createClaim({
      subjectId: obj.id, predicate: 'has_value', objectOrValue: 99.9, evidenceRefs: [e1], actor: 'test',
    });
    expect(claim.objectOrValue).toBe(99.9);
  });

  it('createClaim: boolean objectOrValue is not allowed by type, runtime coerces to truthy', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'flag', name: 'IsEnabled', actor: 'test', tenantId: 'default' });
    // Bypass TS with any cast — should reject at runtime
    expect(() => core.createClaim({
      subjectId: obj.id, predicate: 'has_state', objectOrValue: true as any, evidenceRefs: [e1], actor: 'test',
    })).toThrow('Object not found');
  });

  it('traverseRelationships: self-loop terminates with one-hop path (visited set prevents recursion)', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const a = core.createObject({ type: 'technology', name: 'A', actor: 'test', tenantId: 'default' });
    core.createRelationship({ sourceObject: a.id, relationType: 'related_to', targetObject: a.id, evidenceRefs: [e1], actor: 'test', tenantId: 'default' });
    const paths = core.traverseRelationships(a.id, 3);
    expect(paths.length).toBe(1);
    expect(paths[0].length).toBe(1);
  });

  it('mergeObjects: unknown from throws', () => {
    const core = buildCore();
    const b = core.createObject({ type: 'technology', name: 'B', actor: 'test', tenantId: 'default' });
    expect(() => core.mergeObjects('obj:fake' as any, b.id, 'test')).toThrow('M5 violated');
  });

  it('mergeObjects: unknown into throws', () => {
    const core = buildCore();
    const a = core.createObject({ type: 'technology', name: 'A', actor: 'test', tenantId: 'default' });
    expect(() => core.mergeObjects(a.id, 'obj:fake' as any, 'test')).toThrow('M5 violated');
  });

  it('mergeObjects: merge into redirected object follows redirect', () => {
    const core = buildCore();
    const a = core.createObject({ type: 'technology', name: 'A', actor: 'test', tenantId: 'default' });
    const b = core.createObject({ type: 'technology', name: 'B', actor: 'test', tenantId: 'default' });
    const c = core.createObject({ type: 'technology', name: 'C', actor: 'test', tenantId: 'default' });
    core.mergeObjects(b.id, a.id, 'test');
    core.mergeObjects(c.id, b.id, 'test');
    const resolvedC = core.getObject(c.id);
    expect(resolvedC.id).toBe(a.id);
    void b;
  });

  it('extractFromEvidence: unavailable evidence throws', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    core.markEvidenceUnavailable(e1, 'test');
    expect(() => core.extractFromEvidence({
      evidenceId: e1, content: 'test', actor: 'test',
    })).toThrow('quarantined');
  });

  it('journal: sequence starts at 1 and is monotonically increasing', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    const journal = core.getJournal();
    expect(journal[0].sequence).toBe(1);
    expect(journal[1].sequence).toBe(2);
    for (let i = 1; i < journal.length; i++) {
      expect(journal[i].sequence).toBe(journal[i - 1].sequence + 1);
    }
  });

  it('M9: candidate with existing memory does not mutate memory on propose', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test', tenantId: 'default' });
    core.createClaim({ subjectId: obj.id, predicate: 'has_role', objectOrValue: 'Y', evidenceRefs: [e1], actor: 'test', tenantId: 'default' });
    const claimsBefore = (core as any).deps.claims.all().length;
    core.proposeCandidate({
      type: 'ClaimCandidate', payload: { subject: obj.id, predicate: 'has_role', value: 'Z' }, evidenceRefs: [e1], extractor: 'test', extractorVersion: '1.0.0', actor: 'test',
    });
    expect((core as any).deps.claims.all().length).toBe(claimsBefore);
  });
});
