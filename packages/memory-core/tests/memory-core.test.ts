import { describe, it, expect } from 'vitest';
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
    const postgres = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' });
    const decision = core.createObject({ type: 'decision', name: 'Primary DB choice', actor: 'test' });
    const incident = core.createObject({ type: 'incident', name: 'DB migration failure', actor: 'test' });

    // 4. Claims
    const claim1 = core.createClaim({
      subjectId: postgres.id,
      predicate: 'has_role',
      objectOrValue: 'PrimaryDatabase',
      evidenceRefs: [evidence.id],
      validFrom: '2022-01-01',
      actor: 'test',
    });
    expect(claim1.temporalState.validFrom).toBe('2022-01-01');

    const claim2 = core.createClaim({
      subjectId: incident.id,
      predicate: 'has_role',
      objectOrValue: 'CausedReassessment',
      evidenceRefs: [evidence.id],
      validFrom: '2023-06-01',
      actor: 'test',
    });

    // 5. Relationships
    const rel = core.createRelationship({
      sourceObject: incident.id,
      relationType: 'caused_by',
      targetObject: decision.id,
      evidenceRefs: [evidence.id],
      actor: 'test',
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
    });

    // 8. Membership (object in multiple contexts)
    const ctx2 = core.createContext({ type: 'project', name: 'Platform', actor: 'test' });
    core.addMembership({ contextId: context.id, memberType: 'object', memberId: postgres.id, mode: 'explicit', actor: 'test' });
    core.addMembership({ contextId: ctx2.id, memberType: 'object', memberId: postgres.id, mode: 'explicit', actor: 'test' });

    // 9. Contradiction (claim stays alive)
    const contradictingClaim = core.createClaim({
      subjectId: postgres.id,
      predicate: 'has_role',
      objectOrValue: 'Deprecated',
      evidenceRefs: [evidence.id],
      validFrom: '2024-11-01',
      actor: 'test',
    });
    core.createRelationship({
      sourceObject: contradictingClaim.subjectId,
      relationType: 'contradicts',
      targetObject: claim1.subjectId,
      evidenceRefs: [evidence.id],
      actor: 'test',
    });
    expect(core.getClaim(claim1.id).lifecycleState).toBe('active');

    // 10. Knowledge gap
    const gap = core.createKnowledgeGap({
      type: 'UnresolvedConflict',
      description: 'PostgreSQL role: PrimaryDatabase vs Deprecated — needs resolution',
      actor: 'test',
    });
    expect(gap.lifecycleState).toBe('open');

    // 11–12. Merge + preserve history
    const pgAlias = core.createObject({ type: 'technology', name: 'PG', actor: 'test' });
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
    const postgres = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' });
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
    core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' });
    expect(() => core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' })).toThrow('M4 violated');
  });

  it('M5: merge preserves historical object as tombstone+redirect', () => {
    const core = buildCore();
    const a = core.createObject({ type: 'technology', name: 'PG', actor: 'test' });
    const b = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' });
    core.mergeObjects(a.id, b.id, 'test');
    const merged = (core as any).deps.objects.get(a.id);
    expect(merged.lifecycleState).toBe('merged');
    expect(merged.redirectTo).toBe(b.id);
  });

  it('M9: candidate is not memory (empty evidence rejects)', () => {
    const core = buildCore();
    const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' });
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
    const obj = core.createObject({ type: 'technology', name: 'Test', actor: 'test' });
    core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'X',
      evidenceRefs: [evidenceId],
      actor: 'test',
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
    const obj = core.createObject({ type: 'technology', name: 'Test', actor: 'test' });
    const claim = core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'X',
      evidenceRefs: [evidenceId],
      confidence: 0.9,
      supportState: { level: 'weak', evidenceCount: 1, disagreeingCount: 0 },
      actor: 'test',
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
    });
    core.decide(candidate.id, 'test');
    expect(() => core.decide(candidate.id, 'test')).toThrow('already decided');
  });

  it('escalate leads to quarantine', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'technology', name: 'Test', actor: 'test' });
    core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'X',
      evidenceRefs: [e1],
      actor: 'test',
    });
    const candidate = core.proposeCandidate({
      type: 'ClaimCandidate',
      payload: {},
      evidenceRefs: [e1],
      extractor: 'test',
      extractorVersion: '1.0.0',
      actor: 'test',
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
    });
    const original = core.getSemanticRepresentationsByType('summary');
    expect(original.length).toBe(1);
    // Rebuild
    const rebuilt = core.createSemanticRepresentation({
      type: 'summary',
      evidenceId: e1,
      content: 'Some content',
      actor: 'test',
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
    const a = core.createObject({ type: 'decision', name: 'DB chosen', actor: 'test' });
    const b = core.createObject({ type: 'incident', name: 'Migration failed', actor: 'test' });
    const c = core.createObject({ type: 'decision', name: 'DB changed', actor: 'test' });
    core.createRelationship({ sourceObject: a.id, relationType: 'caused_by', targetObject: b.id, evidenceRefs: [e1], actor: 'test' });
    core.createRelationship({ sourceObject: b.id, relationType: 'caused_by', targetObject: c.id, evidenceRefs: [e1], actor: 'test' });
    const paths = core.traverseRelationships(a.id);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].length).toBe(1);
    expect(paths[1].length).toBe(2);
  });

  it('traverseRelationships skips superseded relationships', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const a = core.createObject({ type: 'technology', name: 'A', actor: 'test' });
    const b = core.createObject({ type: 'technology', name: 'B', actor: 'test' });
    const c = core.createObject({ type: 'technology', name: 'C', actor: 'test' });
    const rel1 = core.createRelationship({ sourceObject: a.id, relationType: 'supersedes', targetObject: b.id, evidenceRefs: [e1], actor: 'test' });
    core.createRelationship({ sourceObject: b.id, relationType: 'related_to', targetObject: c.id, evidenceRefs: [e1], actor: 'test' });
    // Manually supersede rel1
    (core as any).deps.relationships.save({ ...core.getRelationship(rel1.id), lifecycleState: 'superseded' });
    const paths = core.traverseRelationships(a.id);
    expect(paths.length).toBe(0);
  });

  it('getClaimsByObject resolves identity redirect', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const a = core.createObject({ type: 'technology', name: 'PG', actor: 'test' });
    const b = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' });
    core.mergeObjects(a.id, b.id, 'test');
    core.createClaim({
      subjectId: b.id,
      predicate: 'has_role',
      objectOrValue: 'Primary',
      evidenceRefs: [e1],
      actor: 'test',
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
    });
  }

  it('export segment from context', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const ctx = core.createContext({ type: 'project', name: 'DB Decision', actor: 'test' });
    const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test' });
    const segment = core.exportSegment({
      rootContext: ctx.id,
      purpose: 'incident_investigation',
      sensitivity: 'internal',
      actor: 'test',
    });
    expect(segment.rootContext).toBe(ctx.id);
    expect(segment.includedObjects).toContain(obj.id);
    expect(segment.sensitivity).toBe('internal');
  });

  it('verify segment signature', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test' });
    const segment = core.exportSegment({ rootContext: ctx.id, purpose: 'test', sensitivity: 'internal', actor: 'test' });
    expect(core.verifySegment(segment.id)).toBe(true);
  });

  it('verify rejects tampered segment', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test' });
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
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test' });
    const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' });
    core.addMembership({ contextId: ctx.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test' });
    core.addMembership({ contextId: ctx.id, memberType: 'evidence', memberId: e1, mode: 'explicit', actor: 'test' });
    const pkg = core.getAgentContext({ contextId: ctx.id });
    expect(pkg).not.toBe(null);
    expect(pkg!.objects.length).toBe(1);
    expect(pkg!.evidence.length).toBe(1);
  });

  it('agent context includes known gaps', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test' });
    const gap = core.createKnowledgeGap({ type: 'OpenQuestion', description: 'Why?', actor: 'test' });
    core.addMembership({ contextId: ctx.id, memberType: 'knowledge_gap', memberId: gap.id, mode: 'explicit', actor: 'test' });
    const pkg = core.getAgentContext({ contextId: ctx.id });
    expect(pkg!.knownGaps.length).toBe(1);
  });

  it('segment expires', () => {
    const core = buildCore();
    const ctx = core.createContext({ type: 'project', name: 'Test', actor: 'test' });
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
    const ctx1 = core.createContext({ type: 'project', name: 'A', actor: 'test' });
    const ctx2 = core.createContext({ type: 'project', name: 'B', actor: 'test' });
    const obj = core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' });
    core.addMembership({ contextId: ctx1.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test' });
    core.addMembership({ contextId: ctx2.id, memberType: 'object', memberId: obj.id, mode: 'explicit', actor: 'test' });
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
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test' });
    const claim1 = core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'Primary',
      evidenceRefs: [e1],
      actor: 'test',
    });
    const claim2 = core.createClaim({
      subjectId: obj.id,
      predicate: 'has_role',
      objectOrValue: 'Deprecated',
      evidenceRefs: [e1],
      actor: 'test',
    });
    core.createRelationship({
      sourceObject: obj.id,
      relationType: 'contradicts',
      targetObject: obj.id,
      evidenceRefs: [e1],
      actor: 'test',
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
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test' });
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
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test' });
    expect(core.getJournal().length).toBe(journalBefore + 1);
    core.createClaim({ subjectId: obj.id, predicate: 'has_role', objectOrValue: 'Y', evidenceRefs: [e1], actor: 'test' });
    expect(core.getJournal().length).toBe(journalBefore + 2);
  });

  it('M16: failed mutation leaves no journal event (atomic rollback)', () => {
    const core = buildCore();
    const journalBefore = core.getJournal().length;
    expect(() => core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' })).not.toThrow();
    const after = core.getJournal().length;
    expect(() => core.createObject({ type: 'technology', name: 'PostgreSQL', actor: 'test' })).toThrow('M4 violated');
    expect(core.getJournal().length).toBe(after);
  });

  it('M17: historical state reconstructable from journal', () => {
    const core = buildCore();
    const e1 = createId('ev', 'e1') as any;
    buildEvidence(core, e1);
    const obj = core.createObject({ type: 'technology', name: 'X', actor: 'test' });
    core.createClaim({ subjectId: obj.id, predicate: 'has_role', objectOrValue: 'Y', evidenceRefs: [e1], actor: 'test' });
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
    });
    const decision = core.decide(candidate.id, 'test');
    expect(decision.verdict).toBe('Escalate');
    expect(decision.reasoning).toBe('custom model');
  });
});
