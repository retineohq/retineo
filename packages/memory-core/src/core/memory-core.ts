import type {
  Source,
  SourceItem,
  SourceVersion,
  Evidence,
  Object,
  Claim,
  Relationship,
  Context,
  ContextMembership,
  KnowledgeGap,
  Provenance,
  JournalEvent,
  Candidate,
  Decision,
  Policy,
  SemanticRepresentation,
  Segment,
} from '../domain/entities.js';
import type {
  SourceId,
  SourceItemId,
  SourceVersionId,
  EvidenceId,
  ObjectId,
  ClaimId,
  RelationshipId,
  ContextId,
  MembershipId,
  GapId,
  ProvenanceId,
  CandidateId,
  DecisionId,
  PolicyId,
  RepresentationId,
} from '../domain/ids.js';
import type {
  PredicateType,
  RelationType,
  MemberType,
  MembershipMode,
  GapType,
  ScopeQualifier,
} from '../domain/value-objects.js';
import type {
  ObjectRepository,
  ClaimRepository,
  RelationshipRepository,
  ContextRepository,
  MembershipRepository,
  GapRepository,
  EvidenceRepository,
  ProvenanceRepository,
  TransactionPort,
  IdentityResolver,
} from '../ports/repositories.js';
import type {
  CandidateRepository,
  DecisionRepository,
  PolicyRepository,
  DecisionModel,
  PolicyModel,
} from '../ports/lifecycle.js';
import type {
  ExtractionModel,
} from '../ports/extraction.js';
import type {
  RepresentationRepository,
  RepresentationModel,
} from '../ports/representation.js';
import type {
  SegmentRepository,
  SegmentSecurityModel,
} from '../ports/segment.js';
import type { Journal } from '../ports/journal.js';
import { createId } from '../domain/ids.js';

export interface MemoryCoreDeps {
  objects: ObjectRepository;
  claims: ClaimRepository;
  relationships: RelationshipRepository;
  contexts: ContextRepository;
  memberships: MembershipRepository;
  gaps: GapRepository;
  evidence: EvidenceRepository;
  provenance: ProvenanceRepository;
  journal: Journal;
  transaction: TransactionPort;
  identity: IdentityResolver;
  candidates: CandidateRepository;
  decisions: DecisionRepository;
  policies: PolicyRepository;
  decisionModel: DecisionModel;
  policyModel: PolicyModel;
  representations: RepresentationRepository;
  representationModel: RepresentationModel;
  segments: SegmentRepository;
  segmentSecurity: SegmentSecurityModel;
  extractionModel: ExtractionModel;
}

interface CreateObjectInput {
  type: string;
  name: string;
  aliases?: string[];
  actor: string;
}

interface CreateClaimInput {
  subjectId: ObjectId;
  predicate: PredicateType;
  objectOrValue: ObjectId | string | number;
  evidenceRefs: EvidenceId[];
  observedAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  scope?: ScopeQualifier | null;
  confidence?: number;
  supportState?: { level: 'weak' | 'moderate' | 'strong'; evidenceCount: number; disagreeingCount: number };
  actor: string;
}

interface CreateRelationshipInput {
  sourceObject: ObjectId;
  relationType: RelationType;
  targetObject: ObjectId;
  evidenceRefs: EvidenceId[];
  observedAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  scope?: ScopeQualifier | null;
  confidence?: number;
  actor: string;
}

interface CreateContextInput {
  type: string;
  name: string;
  purpose?: string | null;
  actor: string;
}

interface AddMembershipInput {
  contextId: ContextId;
  memberType: MemberType;
  memberId: string;
  mode: MembershipMode;
  confidence?: number;
  actor: string;
}

interface CreateGapInput {
  type: GapType;
  subjectId?: ObjectId | null;
  description: string;
  evidenceRefs?: EvidenceId[];
  actor: string;
}

export class MemoryCore {
  private representationCounter = 0;
  private candidateCounter = 0;

  constructor(private readonly deps: MemoryCoreDeps) {}

  private now(): string {
    return new Date().toISOString();
  }

  private journal(operation: string, entityType: string, entityId: string, actor: string): void {
    this.deps.journal.append({
      timestamp: this.now(),
      entityType,
      entityId,
      operation,
      payloadHash: `${entityType}:${entityId}:${operation}`,
      actor,
    });
  }

  private requireEvidence(evidenceRefs: EvidenceId[]): void {
    for (const ref of evidenceRefs) {
      const evidence = this.deps.evidence.get(ref);
      if (!evidence) {
        throw new Error(`Unknown evidence: ${ref}`);
      }
      if (evidence.state === 'unavailable') {
        throw new Error(`Evidence unavailable (quarantined): ${ref}`);
      }
    }
  }

  private assertProvenance(assertionType: 'claim' | 'relationship', assertionId: string, evidenceRefs: EvidenceId[]): void {
    if (evidenceRefs.length === 0) {
      throw new Error(`M1 violated: ${assertionType} ${assertionId} requires provenance`);
    }
    for (const evidenceId of evidenceRefs) {
      this.deps.provenance.save({
        id: createId('prov', `${assertionId}:${evidenceId}`),
        assertionType,
        assertionId,
        evidenceId,
        learnedAt: this.now(),
        basis: null,
      });
    }
  }

  createObject(input: CreateObjectInput): Object {
    this.deps.transaction.begin();
    try {
      const now = this.now();
      const object: Object = {
        id: createId('obj', input.name.toLowerCase().replace(/\s+/g, '-')),
        type: input.type,
        name: input.name,
        aliases: input.aliases ?? [],
        lifecycleState: 'active',
        redirectTo: null,
        createdAt: now,
        updatedAt: now,
      };

      const existing = this.deps.objects.get(object.id);
      if (existing && existing.lifecycleState !== 'merged') {
        throw new Error(`M4 violated: object ID already exists: ${object.id}`);
      }

      this.deps.objects.save(object);
      this.journal('create', 'object', object.id, input.actor);
      this.deps.transaction.commit();
      return object;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  getObject(id: ObjectId): Object {
    const resolved = this.deps.identity.resolve(id);
    const object = this.deps.objects.get(resolved);
    if (!object) {
      throw new Error(`Object not found: ${id}`);
    }
    return object;
  }

  createClaim(input: CreateClaimInput): Claim {
    this.deps.transaction.begin();
    try {
      this.requireEvidence(input.evidenceRefs);
      const resolvedSubject = this.deps.identity.resolve(input.subjectId);
      if (!this.deps.objects.get(resolvedSubject)) {
        throw new Error(`Subject object not found: ${input.subjectId}`);
      }
      if (typeof input.objectOrValue !== 'string' && typeof input.objectOrValue !== 'number') {
        const resolvedTarget = this.deps.identity.resolve(input.objectOrValue as ObjectId);
        if (!this.deps.objects.get(resolvedTarget)) {
          throw new Error(`Object not found: ${input.objectOrValue}`);
        }
      }

      const now = this.now();
      const claim: Claim = {
        id: createId('claim', `${resolvedSubject}:${input.predicate}`),
        subjectId: resolvedSubject,
        predicate: input.predicate,
        objectOrValue: input.objectOrValue,
        evidenceRefs: input.evidenceRefs,
        temporalState: {
          observedAt: input.observedAt ?? null,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
        },
        lifecycleState: 'active',
        supportState: input.supportState ?? { level: 'weak', evidenceCount: input.evidenceRefs.length, disagreeingCount: 0 },
        confidence: input.confidence ?? 0.5,
        scope: input.scope ?? null,
        createdAt: now,
        updatedAt: now,
      };

      this.deps.claims.save(claim);
      this.assertProvenance('claim', claim.id, input.evidenceRefs);
      this.journal('create', 'claim', claim.id, input.actor);
      this.deps.transaction.commit();
      return claim;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  getClaim(id: ClaimId): Claim {
    const claim = this.deps.claims.get(id);
    if (!claim) {
      throw new Error(`Claim not found: ${id}`);
    }
    return claim;
  }

  createRelationship(input: CreateRelationshipInput): Relationship {
    this.deps.transaction.begin();
    try {
      this.requireEvidence(input.evidenceRefs);
      const resolvedSource = this.deps.identity.resolve(input.sourceObject);
      const resolvedTarget = this.deps.identity.resolve(input.targetObject);
      if (!this.deps.objects.get(resolvedSource)) {
        throw new Error(`Source object not found: ${input.sourceObject}`);
      }
      if (!this.deps.objects.get(resolvedTarget)) {
        throw new Error(`Target object not found: ${input.targetObject}`);
      }

      const now = this.now();
      const relationship: Relationship = {
        id: createId('rel', `${resolvedSource}:${input.relationType}:${resolvedTarget}`),
        sourceObject: resolvedSource,
        relationType: input.relationType,
        targetObject: resolvedTarget,
        evidenceRefs: input.evidenceRefs,
        temporalState: {
          observedAt: input.observedAt ?? null,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
        },
        lifecycleState: 'active',
        supportState: { level: 'weak', evidenceCount: input.evidenceRefs.length, disagreeingCount: 0 },
        confidence: input.confidence ?? 0.5,
        scope: input.scope ?? null,
        createdAt: now,
        updatedAt: now,
      };

      this.deps.relationships.save(relationship);
      this.assertProvenance('relationship', relationship.id, input.evidenceRefs);
      this.journal('create', 'relationship', relationship.id, input.actor);
      this.deps.transaction.commit();
      return relationship;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  getRelationship(id: RelationshipId): Relationship {
    const relationship = this.deps.relationships.get(id);
    if (!relationship) {
      throw new Error(`Relationship not found: ${id}`);
    }
    return relationship;
  }

  createContext(input: CreateContextInput): Context {
    this.deps.transaction.begin();
    try {
      const now = this.now();
      const context: Context = {
        id: createId('ctx', input.name.toLowerCase().replace(/\s+/g, '-')),
        type: input.type,
        name: input.name,
        purpose: input.purpose ?? null,
        lifecycleState: 'active',
        temporalState: { observedAt: now, validFrom: now, validTo: null },
        createdAt: now,
        updatedAt: now,
      };
      this.deps.contexts.save(context);
      this.journal('create', 'context', context.id, input.actor);
      this.deps.transaction.commit();
      return context;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  getContext(id: ContextId): Context {
    const context = this.deps.contexts.get(id);
    if (!context) {
      throw new Error(`Context not found: ${id}`);
    }
    return context;
  }

  addMembership(input: AddMembershipInput): ContextMembership {
    this.deps.transaction.begin();
    try {
      if (!this.deps.contexts.get(input.contextId)) {
        throw new Error(`Context not found: ${input.contextId}`);
      }
      const resolvedMember = input.memberType === 'object'
        ? this.deps.identity.resolve(input.memberId as ObjectId)
        : input.memberId;
      if (input.memberType === 'object' && !this.deps.objects.get(resolvedMember as ObjectId)) {
        throw new Error(`Member object not found: ${input.memberId}`);
      }

      const now = this.now();
      const membership: ContextMembership = {
        id: createId('mem', `${input.contextId}:${input.memberType}:${resolvedMember}`),
        contextId: input.contextId,
        memberType: input.memberType,
        memberId: resolvedMember,
        mode: input.mode,
        confidence: input.confidence ?? 0.5,
        validFrom: now,
        validTo: null,
        createdAt: now,
      };
      this.deps.memberships.save(membership);
      this.journal('add_membership', 'membership', membership.id, input.actor);
      this.deps.transaction.commit();
      return membership;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  removeMembership(id: MembershipId, actor: string): void {
    this.deps.transaction.begin();
    try {
      if (!this.deps.memberships.get(id)) {
        throw new Error(`Membership not found: ${id}`);
      }
      this.journal('remove_membership', 'membership', id, actor);
      this.deps.transaction.commit();
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  createKnowledgeGap(input: CreateGapInput): KnowledgeGap {
    this.deps.transaction.begin();
    try {
      const now = this.now();
      const gap: KnowledgeGap = {
        id: createId('gap', `${input.type}:${Date.now()}`),
        type: input.type,
        subjectId: input.subjectId ?? null,
        description: input.description,
        evidenceRefs: input.evidenceRefs ?? [],
        lifecycleState: 'open',
        createdAt: now,
        resolvedAt: null,
      };
      this.deps.gaps.save(gap);
      this.journal('create', 'knowledge_gap', gap.id, input.actor);
      this.deps.transaction.commit();
      return gap;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  resolveKnowledgeGap(id: GapId, actor: string): KnowledgeGap {
    this.deps.transaction.begin();
    try {
      const gap = this.deps.gaps.get(id);
      if (!gap) {
        throw new Error(`Gap not found: ${id}`);
      }
      const resolved: KnowledgeGap = { ...gap, lifecycleState: 'resolved', resolvedAt: this.now() };
      this.deps.gaps.save(resolved);
      this.journal('resolve', 'knowledge_gap', id, actor);
      this.deps.transaction.commit();
      return resolved;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  getEvidence(id: EvidenceId): Evidence {
    const evidence = this.deps.evidence.get(id);
    if (!evidence) {
      throw new Error(`Evidence not found: ${id}`);
    }
    return evidence;
  }

  getProvenance(assertionId: string): Provenance[] {
    return this.deps.provenance.byAssertion(assertionId);
  }

  mergeObjects(fromId: ObjectId, intoId: ObjectId, actor: string): void {
    this.deps.transaction.begin();
    try {
      const resolvedFrom = this.deps.identity.resolve(fromId);
      const resolvedInto = this.deps.identity.resolve(intoId);
      const fromObject = this.deps.objects.get(resolvedFrom);
      const intoObject = this.deps.objects.get(resolvedInto);
      if (!fromObject || !intoObject) {
        throw new Error('M5 violated: merge requires both objects to exist');
      }
      if (fromObject.lifecycleState === 'merged') {
        throw new Error(`Object already merged: ${fromId}`);
      }
      if (resolvedFrom === resolvedInto) {
        throw new Error('Cannot merge object into itself');
      }

      this.deps.objects.save({
        ...fromObject,
        lifecycleState: 'merged',
        redirectTo: resolvedInto,
        updatedAt: this.now(),
      });
      this.deps.identity.merge(resolvedFrom, resolvedInto);
      this.journal('merge', 'object', resolvedFrom, actor);
      this.deps.transaction.commit();
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  markEvidenceUnavailable(id: EvidenceId, actor: string): void {
    this.deps.transaction.begin();
    try {
      const evidence = this.deps.evidence.get(id);
      if (!evidence) {
        throw new Error(`Evidence not found: ${id}`);
      }
      this.deps.evidence.save({ ...evidence, state: 'unavailable' });
      this.journal('mark_unavailable', 'evidence', id, actor);
      this.deps.transaction.commit();
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  createEvidence(evidence: Omit<Evidence, 'createdAt'>): Evidence {
    this.deps.transaction.begin();
    try {
      const full: Evidence = { ...evidence, createdAt: this.now() };
      this.deps.evidence.save(full);
      this.journal('create', 'evidence', full.id, 'system');
      this.deps.transaction.commit();
      return full;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  getJournal(): JournalEvent[] {
    return this.deps.journal.all();
  }

  proposeCandidate(input: {
    type: string;
    payload: Record<string, unknown>;
    evidenceRefs: EvidenceId[];
    extractor: string;
    extractorVersion: string;
    actor: string;
  }): Candidate {
    this.deps.transaction.begin();
    try {
      this.requireEvidence(input.evidenceRefs);
      const candidate: Candidate = {
        id: createId('cand', `${input.type}:${Date.now()}:${this.candidateCounter++}`),
        type: input.type,
        payload: input.payload,
        evidenceRefs: input.evidenceRefs,
        extractor: input.extractor,
        extractorVersion: input.extractorVersion,
        createdAt: this.now(),
      };
      this.deps.candidates.save(candidate);
      this.journal('propose', 'candidate', candidate.id, input.actor);
      this.deps.transaction.commit();
      return candidate;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  decide(candidateId: CandidateId, actor: string): Decision {
    this.deps.transaction.begin();
    try {
      const candidate = this.deps.candidates.get(candidateId);
      if (!candidate) {
        throw new Error(`Candidate not found: ${candidateId}`);
      }
      const existingDecisions = this.deps.decisions.byCandidate(candidateId);
      if (existingDecisions.length > 0) {
        throw new Error(`Candidate already decided: ${candidateId}`);
      }
      const evaluation = this.deps.decisionModel.evaluate(candidate, {
        existingClaimsCount: this.deps.claims.all().length,
      });
      const decision: Decision = {
        id: createId('dec', `${candidateId}:${Date.now()}`),
        candidateRef: candidateId,
        verdict: evaluation.verdict,
        reasoning: evaluation.reasoning,
        decisionModel: 'default',
        createdAt: this.now(),
      };
      this.deps.decisions.save(decision);
      this.journal('decide', 'decision', decision.id, actor);
      this.deps.transaction.commit();
      return decision;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  applyPolicy(decisionId: DecisionId, actor: string): Policy {
    this.deps.transaction.begin();
    try {
      const decision = this.deps.decisions.get(decisionId);
      if (!decision) {
        throw new Error(`Decision not found: ${decisionId}`);
      }
      const existingPolicies = this.deps.policies.byDecision(decisionId);
      if (existingPolicies.length > 0) {
        throw new Error(`Decision already policy-applied: ${decisionId}`);
      }
      const evaluation = this.deps.policyModel.evaluate(decision);
      const policy: Policy = {
        id: createId('pol', `${decisionId}:${Date.now()}`),
        decisionRef: decisionId,
        action: evaluation.action,
        aclRef: evaluation.aclRef,
        createdAt: this.now(),
      };
      this.deps.policies.save(policy);
      this.journal('apply_policy', 'policy', policy.id, actor);
      this.deps.transaction.commit();
      return policy;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  getCandidate(id: CandidateId): Candidate {
    const candidate = this.deps.candidates.get(id);
    if (!candidate) {
      throw new Error(`Candidate not found: ${id}`);
    }
    return candidate;
  }

  getDecision(id: DecisionId): Decision {
    const decision = this.deps.decisions.get(id);
    if (!decision) {
      throw new Error(`Decision not found: ${id}`);
    }
    return decision;
  }

  getPolicy(id: PolicyId): Policy {
    const policy = this.deps.policies.get(id);
    if (!policy) {
      throw new Error(`Policy not found: ${id}`);
    }
    return policy;
  }

  createSemanticRepresentation(input: {
    type: 'summary' | 'essence_nl' | 'essence_structured' | 'embedding';
    evidenceId: EvidenceId;
    content: string;
    actor: string;
  }): SemanticRepresentation {
    this.deps.transaction.begin();
    try {
      if (!this.deps.evidence.get(input.evidenceId)) {
        throw new Error(`Evidence not found: ${input.evidenceId}`);
      }
      const generated = this.deps.representationModel.generate({
        type: input.type,
        evidenceId: input.evidenceId,
        content: input.content,
      });
      const representation: SemanticRepresentation = {
        id: createId('rep', `${input.type}:${Date.now()}:${this.representationCounter++}`),
        type: input.type,
        evidenceId: input.evidenceId,
        generator: 'default',
        generatorVersion: '1.0.0',
        content: generated.content,
        contentHash: `${input.evidenceId}:${input.type}`,
        tokenCount: generated.tokenCount,
        semanticClasses: generated.semanticClasses,
        createdAt: this.now(),
      };
      this.deps.representations.save(representation);
      this.journal('create', 'representation', representation.id, input.actor);
      this.deps.transaction.commit();
      return representation;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  getSemanticRepresentation(id: RepresentationId): SemanticRepresentation {
    const representation = this.deps.representations.get(id);
    if (!representation) {
      throw new Error(`Representation not found: ${id}`);
    }
    return representation;
  }

  getSemanticRepresentationsByType(type: 'summary' | 'essence_nl' | 'essence_structured' | 'embedding'): SemanticRepresentation[] {
    return this.deps.representations.byType(type);
  }

  getSemanticRepresentationsByEvidence(evidenceId: EvidenceId): SemanticRepresentation[] {
    return this.deps.representations.byEvidence(evidenceId);
  }

  getClaimsByObject(subjectId: ObjectId): Claim[] {
    return this.deps.claims.bySubject(this.deps.identity.resolve(subjectId));
  }

  getRelationshipsByObject(objectId: ObjectId): Relationship[] {
    const resolved = this.deps.identity.resolve(objectId);
    const out = this.deps.relationships.bySource(resolved);
    const into = this.deps.relationships.byTarget(resolved);
    return [...out, ...into];
  }

  traverseRelationships(startId: ObjectId, maxDepth: number = 3): Relationship[][] {
    const paths: Relationship[][] = [];
    const visited = new Set<ObjectId>();

    const walk = (objectId: ObjectId, path: Relationship[], depth: number): void => {
      if (depth >= maxDepth) return;
      if (visited.has(objectId)) return;
      visited.add(objectId);
      const resolved = this.deps.identity.resolve(objectId);
      const relationships = this.deps.relationships.bySource(resolved);
      for (const relationship of relationships) {
        if (relationship.lifecycleState !== 'active') continue;
        const newPath = [...path, relationship];
        paths.push(newPath);
        walk(relationship.targetObject, newPath, depth + 1);
      }
    };

    walk(startId, [], 0);
    return paths;
  }

  exportSegment(input: {
    rootContext: ContextId;
    purpose: string;
    sensitivity: string;
    actor: string;
    expiresInDays?: number;
  }): Segment {
    this.deps.transaction.begin();
    try {
      const context = this.deps.contexts.get(input.rootContext);
      if (!context) {
        throw new Error(`Context not found: ${input.rootContext}`);
      }
      const memberships = this.deps.memberships.byContext(input.rootContext);
      const includedObjects: ObjectId[] = [];
      const includedClaims: ClaimId[] = [];
      const includedRelationships: RelationshipId[] = [];
      const includedContexts: ContextId[] = [];
      const includedEvidence: EvidenceId[] = [];
      for (const membership of memberships) {
        switch (membership.memberType) {
          case 'object': includedObjects.push(membership.memberId); break;
          case 'claim': includedClaims.push(membership.memberId); break;
          case 'relationship': includedRelationships.push(membership.memberId); break;
          case 'context': includedContexts.push(membership.memberId); break;
          case 'evidence': includedEvidence.push(membership.memberId); break;
        }
      }
      const payloadHash = `${input.rootContext}:${includedObjects.length}:${includedClaims.length}`;
      const now = this.now();
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const segment: Segment = {
        id: createId('seg', `${input.rootContext}:${Date.now()}`),
        rootContext: input.rootContext,
        includedObjects,
        includedClaims,
        includedRelationships,
        includedContexts,
        includedEvidence,
        purpose: input.purpose,
        sensitivity: input.sensitivity,
        version: 1,
        payloadHash,
        signature: this.deps.segmentSecurity.sign(payloadHash),
        createdAt: now,
        expiresAt,
      };
      this.deps.segments.save(segment);
      this.journal('export', 'segment', segment.id, input.actor);
      this.deps.transaction.commit();
      return segment;
    } catch (error) {
      this.deps.transaction.rollback();
      throw error;
    }
  }

  verifySegment(segmentId: string): boolean {
    const segment = this.deps.segments.get(segmentId);
    if (!segment) {
      throw new Error(`Segment not found: ${segmentId}`);
    }
    return this.deps.segmentSecurity.verify(segment);
  }

  getSegment(segmentId: string): Segment {
    const segment = this.deps.segments.get(segmentId);
    if (!segment) {
      throw new Error(`Segment not found: ${segmentId}`);
    }
    return segment;
  }

  getAgentContext(input: {
    contextId: ContextId;
    maxSensitivity?: string;
    allowedPurposes?: string[];
  }): {
    objects: Object[];
    relationships: Relationship[];
    claims: Claim[];
    evidence: Evidence[];
    knownGaps: KnowledgeGap[];
  } | null {
    const context = this.deps.contexts.get(input.contextId);
    if (!context) {
      return null;
    }
    const memberships = this.deps.memberships.byContext(input.contextId);
    const objects: Object[] = [];
    const claims: Claim[] = [];
    const relationships: Relationship[] = [];
    const evidenceItems: Evidence[] = [];
    const knownGaps: KnowledgeGap[] = [];
    for (const membership of memberships) {
      if (membership.memberType === 'object') {
        const object = this.deps.objects.get(this.deps.identity.resolve(membership.memberId));
        if (object) objects.push(object);
      } else if (membership.memberType === 'claim') {
        const claim = this.deps.claims.get(membership.memberId);
        if (claim) claims.push(claim);
      } else if (membership.memberType === 'relationship') {
        const relationship = this.deps.relationships.get(membership.memberId);
        if (relationship) relationships.push(relationship);
      } else if (membership.memberType === 'evidence') {
        const evidence = this.deps.evidence.get(membership.memberId);
        if (evidence) evidenceItems.push(evidence);
      } else if (membership.memberType === 'knowledge_gap') {
        const gap = this.deps.gaps.get(membership.memberId);
        if (gap) knownGaps.push(gap);
      }
    }
    return { objects, relationships, claims, evidence: evidenceItems, knownGaps };
  }

  extractFromEvidence(input: {
    evidenceId: EvidenceId;
    content: string;
    actor: string;
  }): { candidatesCreated: number; accepted: number; quarantined: number; rejected: number } {
    const evidence = this.deps.evidence.get(input.evidenceId);
    if (!evidence) {
      throw new Error(`Evidence not found: ${input.evidenceId}`);
    }
    if (evidence.state === 'unavailable') {
      throw new Error(`Evidence quarantined: ${input.evidenceId}`);
    }

    const result = this.deps.extractionModel.extract(evidence, input.content);
    let candidatesCreated = 0;
    let accepted = 0;
    let quarantined = 0;
    let rejected = 0;

    for (const extracted of result.claims) {
      const candidate = this.proposeCandidate({
        type: 'ClaimCandidate',
        payload: { ...extracted },
        evidenceRefs: [input.evidenceId],
        extractor: 'regex-extraction',
        extractorVersion: '1.0.0',
        actor: input.actor,
      });
      candidatesCreated++;
      const decision = this.decide(candidate.id, input.actor);
      const policy = this.applyPolicy(decision.id, input.actor);
      if (policy.action === 'Allow') {
        // Create or resolve subject object
        const subjectName = extracted.subjectName;
        let subject = this.deps.objects.all().find((obj) => obj.name === subjectName);
        if (!subject) {
          subject = this.createObject({ type: 'entity', name: subjectName, actor: input.actor });
        }
        const subjectId = this.deps.identity.resolve(subject.id);
        this.createClaim({
          subjectId,
          predicate: extracted.predicate,
          objectOrValue: extracted.objectOrValue,
          evidenceRefs: [input.evidenceId],
          observedAt: extracted.observedAt ?? null,
          validFrom: extracted.validFrom ?? null,
          validTo: extracted.validTo ?? null,
          confidence: extracted.confidence,
          actor: input.actor,
        });
        accepted++;
      } else if (policy.action === 'Quarantine') {
        quarantined++;
      } else {
        rejected++;
      }
    }

    for (const extracted of result.relationships) {
      const candidate = this.proposeCandidate({
        type: 'RelationshipCandidate',
        payload: { ...extracted },
        evidenceRefs: [input.evidenceId],
        extractor: 'regex-extraction',
        extractorVersion: '1.0.0',
        actor: input.actor,
      });
      candidatesCreated++;
      const decision = this.decide(candidate.id, input.actor);
      const policy = this.applyPolicy(decision.id, input.actor);
      if (policy.action === 'Allow') {
        let source = this.deps.objects.all().find((obj) => obj.name === extracted.sourceName);
        if (!source) {
          source = this.createObject({ type: 'entity', name: extracted.sourceName, actor: input.actor });
        }
        let target = this.deps.objects.all().find((obj) => obj.name === extracted.targetName);
        if (!target) {
          target = this.createObject({ type: 'entity', name: extracted.targetName, actor: input.actor });
        }
        this.createRelationship({
          sourceObject: this.deps.identity.resolve(source.id),
          relationType: extracted.relationType,
          targetObject: this.deps.identity.resolve(target.id),
          evidenceRefs: [input.evidenceId],
          confidence: extracted.confidence,
          actor: input.actor,
        });
        accepted++;
      } else if (policy.action === 'Quarantine') {
        quarantined++;
      } else {
        rejected++;
      }
    }

    return { candidatesCreated, accepted, quarantined, rejected };
  }
}
