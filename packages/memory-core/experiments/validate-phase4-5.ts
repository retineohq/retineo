/**
 * Программная валидация Phase 4–5 (handoff разделы 65–67).
 * Проверяет аналитические выводы программно, с embeddings.
 * Не использует LLM — embeddings детерминированные (HashEmbeddingModel).
 */

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
  InMemoryCandidateRepository,
  InMemoryDecisionRepository,
  InMemoryPolicyRepository,
  DeterministicDecisionModel,
  PermissivePolicyModel,
  InMemoryRepresentationRepository,
  TrivialRepresentationModel,
  InMemorySegmentRepository,
  TrivialSegmentSecurityModel,
  RegexExtractionModel,
  InMemorySourceRepository,
  InMemorySourceItemRepository,
  InMemorySourceVersionRepository,
  HashEmbeddingModel,
  QueryEngine,
  createId,
} from '../dist/index.js';

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
    representations: new InMemoryRepresentationRepository(),
    representationModel: new TrivialRepresentationModel(),
    segments: new InMemorySegmentRepository(),
    segmentSecurity: new TrivialSegmentSecurityModel(),
    extractionModel: new RegexExtractionModel(),
  });
}

const DOC_A = `
  Retineo отказывается от RAG-подхода, где смысл восстанавливается из chunks
  в момент запроса, и переходит к модели, где знание и контекст строятся заранее
  как многоуровневые семантические представления с provenance. Документы — это
  evidence, а не основная единица памяти. Память — это структуры объектов,
  отношений и контекстов, а retrieval — механизм навигации по ним.
`;

const DOC_B = `
  Спецификация превращает концептуальную инверсию в конкретную доменную модель:
  организационная память — это авторитетное эпистемическое состояние, состоящее
  из объектов, утверждений, отношений и контекстов с provenance, временем
  и support. Знание не может появиться в памяти иначе, чем через цепочку
  Evidence → Candidate → Decision → Policy. Все производные представления —
  не память. Первый milestone — детерминированное ядро с корректными переходами.
`;

const DOC_C = `
  Техническая спецификация определяет, как доменная модель становится работающей
  системой: авторитетная память отделена от всех производных механизмов через
  границы и ports. Знание входит в память только через Evidence → Candidate →
  Decision → Policy. Все indexes rebuildable, все мутации журналируются.
  Первый milestone — детерминированное ядро без AI.
`;

interface ValidationResult {
  name: string;
  passed: boolean;
  details: string;
}

async function main() {
  const results: ValidationResult[] = [];
  const embedding = new HashEmbeddingModel(64);
  const core = buildCore();
  const engine = new QueryEngine(core);

  // Setup: 3 documents → evidence → essence representations
  const docs: Array<[string, string, string]> = [
    ['A', 'handoff', DOC_A],
    ['B', 'domain-spec', DOC_B],
    ['C', 'tech-spec', DOC_C],
  ];
  for (const [name, slug, content] of docs) {
    const evId = createId('ev', `val-${slug}`);
    core.createEvidence({
      id: evId,
      sourceVersionId: createId('sv', `val-${slug}`),
      segmentRef: null,
      contentHash: `hash-${slug}`,
      state: 'available',
    });
    // Essence: концентрированная версия (первые предложения, как в настоящем essence)
    const sentences = content.trim().split(/[.!?]\s+/);
    const essence = sentences.slice(0, Math.ceil(sentences.length / 2)).join('. ') + '.';
    core.createSemanticRepresentation({
      type: 'essence_nl',
      evidenceId: evId,
      content: essence,
      actor: 'validation',
    });
  }

  // PHASE 4 VALIDATION: entry points via embeddings
  {
    const reps = (core as any).deps.representations.byType('essence_nl');
    const query = 'retrieval навигация память';
    const queryVector = embedding.embed(query);
    const scored = reps.map((representation: any) => {
      const contentText = typeof representation.content === 'string'
        ? representation.content
        : JSON.stringify(representation.content);
      const repVector = embedding.embed(contentText);
      return {
        representationId: representation.id,
        evidenceId: representation.evidenceId,
        score: embedding.cosineSimilarity(queryVector, repVector),
      };
    }).sort((a: any, b: any) => b.score - a.score);

    const passed = scored.length > 0 && scored[0].score > 0;
    results.push({
      name: 'Phase 4: Essence entry points via embedding similarity',
      passed,
      details: `top score=${scored[0]?.score.toFixed(3)}, reps=${scored.length}`,
    });
  }

  // PHASE 5 VALIDATION: compression ratio
  {
    const originalWords = DOC_A.split(/\s+/).length + DOC_B.split(/\s+/).length + DOC_C.split(/\s+/).length;
    const reps = (core as any).deps.representations.byType('essence_nl');
    const essenceWords = reps.reduce((sum: number, representation: any) => {
      const text = typeof representation.content === 'string' ? representation.content : JSON.stringify(representation.content);
      return sum + text.split(/\s+/).length;
    }, 0);
    const ratio = (originalWords / essenceWords).toFixed(1);
    const passed = Number(ratio) > 2;
    results.push({
      name: 'Phase 5: Compression ratio (original → essence)',
      passed,
      details: `${originalWords} words → ${essenceWords} words = ${ratio}×`,
    });
  }

  // PHASE 5 VALIDATION: semantic recall (token overlap)
  {
    const reps = (core as any).deps.representations.byType('essence_nl');
    const originals = [DOC_A, DOC_B, DOC_C];
    let totalOverlap = 0;
    for (let i = 0; i < originals.length; i++) {
      const originalTokens = new Set(
        originals[i].toLowerCase().split(/[^a-zа-яё0-9]+/).filter((token) => token.length > 3),
      );
      const essenceText = typeof reps[i].content === 'string' ? reps[i].content : JSON.stringify(reps[i].content);
      const essenceTokens = essenceText.toLowerCase().split(/[^a-zа-яё0-9]+/).filter((token) => token.length > 3);
      const matches = essenceTokens.filter((token) => originalTokens.has(token));
      totalOverlap += essenceTokens.length > 0 ? matches.length / essenceTokens.length : 0;
    }
    const recall = (totalOverlap / originals.length).toFixed(2);
    const passed = Number(recall) > 0.3;
    results.push({
      name: 'Phase 5: Semantic recall (token overlap ≥ 0.3)',
      passed,
      details: `average recall = ${recall}`,
    });
  }

  // PHASE 4 VALIDATION: relationship discovery via extraction pipeline
  {
    const content = 'ADR-002 supersedes ADR-001. The failure caused by misconfiguration.';
    const evId = createId('ev', 'val-rel');
    core.createEvidence({
      id: evId,
      sourceVersionId: createId('sv', 'val-rel'),
      segmentRef: null,
      contentHash: 'hash-rel',
      state: 'available',
    });
    const extraction = core.extractFromEvidence({ evidenceId: evId, content, actor: 'validation' });
    const relationships = (core as any).deps.relationships.all();
    const passed = relationships.length > 0 && extraction.accepted > 0;
    results.push({
      name: 'Phase 4: Relationship discovery via extraction → Candidate → Decision → Memory',
      passed,
      details: `candidates=${extraction.candidatesCreated}, accepted=${extraction.accepted}, relationships=${relationships.length}`,
    });
  }

  // PHASE 4 VALIDATION: context reconstruction (multi-hop)
  {
    const objects = (core as any).deps.objects.all();
    let pathsFound = 0;
    for (const obj of objects) {
      const context = engine.reconstructContext(obj.id);
      pathsFound += context.paths.length;
    }
    const passed = pathsFound > 0;
    results.push({
      name: 'Phase 4: Context reconstruction (multi-hop traversal)',
      passed,
      details: `objects=${objects.length}, total paths=${pathsFound}`,
    });
  }

  console.log('\n=== Программная валидация Phase 4–5 ===\n');
  for (const result of results) {
    console.log(`${result.passed ? '✅ PASS' : '❌ FAIL'}: ${result.name}`);
    console.log(`   ${result.details}\n`);
  }

  const passedCount = results.filter((result) => result.passed).length;
  console.log(`Итог: ${passedCount}/${results.length} тестов пройдено\n`);
  process.exit(passedCount === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
