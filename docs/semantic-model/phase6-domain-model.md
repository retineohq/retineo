# RETINEO — Phase 6 Domain Model Definition

> Определяет минимальную доменную модель Memory Core по результатам
> Phase 1–5. Не код — фиксирование структур, полей, инвариантов и границ
> для будущей реализации (Phase 7).

---

## 1. Цель

Модель должна:

1. соответствовать канонической формуле из B (#44–#45):
   `Memory = Objects + Claims + Relationships + Contexts + KnowledgeGaps + Evidence + Provenance + Time + Support + Identity`
2. устранять три критические потери из Phase 5 (Time 0%, State 17%, Scope 33%)
3. поддерживать многослойный retrieval из Phase 4:
   Essence → entry points, Claims → relationship discovery, Multi-hop → context reconstruction
4. сохранить инварианты M1–M20 из B/C без изменений
5. оставаться минимальной — не добавлять сущности, не требуемые экспериментами

---

## 2. Сущности домена

### 2.1. Source

```
Source {
  id: SourceId
  type: SourceType
  name: string
  trust_profile: TrustProfile
  state: SourceState
  created_at: Timestamp
  updated_at: Timestamp
}
```

### 2.2. SourceItem

```
SourceItem {
  id: SourceItemId
  source_id: SourceId
  external_id: string
  locator: Locator
  state: ItemState
  current_version_id: SourceVersionId
  created_at: Timestamp
  updated_at: Timestamp
}
```

### 2.3. SourceVersion

```
SourceVersion {
  id: SourceVersionId
  source_item_id: SourceItemId
  content_hash: Hash
  captured_at: Timestamp
  source_time: Timestamp | null
  content_ref: ContentRef
  metadata: Metadata
}
```

**Invariant M3:** immutable.

### 2.4. Evidence

```
Evidence {
  id: EvidenceId
  source_version_id: SourceVersionId
  segment_ref: SegmentRef | null
  content_hash: Hash
  state: EvidenceState
  created_at: Timestamp
}
```

**Invariant M2:** immutable.

### 2.5. Object

```
Object {
  id: ObjectId
  type: ObjectType
  name: string
  aliases: [string]
  lifecycle_state: ObjectLifecycle
  redirect_to: ObjectId | null
  tombstone: Tombstone | null
  created_at: Timestamp
  updated_at: Timestamp
}
```

**Invariant M4:** id не переиспользуется.
**Invariant M5:** merge не уничтожает — tombstone + redirect.

### 2.6. Claim

Критическая сущность. Устраняет три потери Phase 5.

```
Claim {
  id: ClaimId
  subject_id: ObjectId
  predicate: PredicateType
  object_or_value: ObjectId | Value

  evidence_refs: [EvidenceId]

  temporal_state: {
    observed_at: Timestamp | null
    valid_from: Timestamp | null
    valid_to: Timestamp | null
  }

  lifecycle_state: ClaimLifecycle
  support_state: SupportState
  confidence: Confidence

  scope: ScopeQualifier | null

  created_at: Timestamp
  updated_at: Timestamp
}
```

**Инвариант M19:** support_state ≠ confidence.

**Устранение потерь Phase 5:**

| Потеря | Поле | Условие |
|---|---|---|
| Time 0% | temporal_state (observed_at, valid_from, valid_to) | C1 |
| State 17% | lifecycle_state, support_state, confidence | C3, M19 |
| Scope 33% | scope (qualifier) | C5 |

### 2.7. Relationship

```
Relationship {
  id: RelationshipId
  source_object: ObjectId
  relation_type: RelationType
  target_object: ObjectId

  evidence_refs: [EvidenceId]

  temporal_state: {
    observed_at: Timestamp | null
    valid_from: Timestamp | null
    valid_to: Timestamp | null
  }

  lifecycle_state: RelationshipLifecycle
  support_state: SupportState
  confidence: Confidence

  scope: ScopeQualifier | null

  created_at: Timestamp
  updated_at: Timestamp
}
```

**Invariant M7:** contradiction не уничтожает Relationship.

### 2.8. Context

```
Context {
  id: ContextId
  type: ContextType
  name: string
  purpose: string | null
  lifecycle_state: ContextLifecycle
  temporal_state: TemporalState
  created_at: Timestamp
  updated_at: Timestamp
}
```

### 2.9. ContextMembership

```
ContextMembership {
  id: MembershipId
  context_id: ContextId
  member_type: MemberType
  member_id: ObjectId | ClaimId | RelationshipId | EvidenceId | ContextId | KnowledgeGapId
  mode: MembershipMode (explicit | inferred | rule_based | temporary)
  confidence: Confidence
  valid_from: Timestamp | null
  valid_to: Timestamp | null
  created_at: Timestamp
}
```

**Инвариант M6:** membership не копирует объект.

### 2.10. KnowledgeGap

```
KnowledgeGap {
  id: GapId
  type: GapType (OpenQuestion | MissingEvidence | UnresolvedConflict | UnknownDependency)
  subject: ObjectId | null
  description: string
  evidence_refs: [EvidenceId]
  lifecycle_state: GapLifecycle
  created_at: Timestamp
  resolved_at: Timestamp | null
}
```

**Инвариант M18:** unknown — валидное состояние.

### 2.11. Provenance

```
Provenance {
  id: ProvenanceId
  assertion_type: assertion_entity_type
  assertion_id: assertion_id
  evidence_id: EvidenceId
  learned_at: Timestamp
  basis: string | null
}
```

**Инвариант M1:** каждый authoritative assertion имеет provenance.

### 2.12. Candidate

```
Candidate {
  id: CandidateId
  type: CandidateType
  payload: object
  evidence_refs: [EvidenceId]
  extractor: string
  extractor_version: string
  created_at: Timestamp
}
```

**Инвариант M9:** Candidate не является Memory.

### 2.13. Decision

```
Decision {
  id: DecisionId
  candidate_ref: CandidateId
  verdict: Accept | Reject | Escalate
  reasoning: string | null
  decision_model: string
  created_at: Timestamp
}
```

**Инвариант M10:** Decision не является Memory.

### 2.14. Policy

```
Policy {
  id: PolicyId
  decision_ref: DecisionId
  action: Allow | Deny | Quarantine
  acl_ref: string | null
  created_at: Timestamp
}
```

**Инвариант M11:** Policy не меняет эпистемический результат.
**Инвариант M12:** Decision Layer не имеет ACL authority.

### 2.15. SemanticRepresentation

Решение пользователя из Phase 3: Summary/Essence — не память.
Отдельная сущность для derived representations.

```
SemanticRepresentation {
  id: RepresentationId
  type: RepresentationType (summary | essence_nl | essence_structured | embedding)
  source: {
    evidence_id: EvidenceId
    generator: string
    generator_version: string
  }
  content: string | object
  content_hash: Hash
  token_count: number
  compression_ratio: number
  semantic_classes: [SemanticClass]  // какие классы сохранены
  created_at: Timestamp
  rebuildable: true
}
```

**Границы:**

- Не входит в Memory formula (B #45)
- Rebuildable из Evidence (потеря не разрушает память)
- Привязана к Evidence через provenance
- Для retrieval: Essence = entry points; Claims = relationship discovery

**Ограничение из Phase 5:**

SemanticRepresentation не хранит temporal state, lifecycle state или scope
как поля — для этого существуют Claims. Essence сохраняет только те классы,
которые подтверждены в Phase 5 (Topic, Decision, Negation, Causality).

### 2.16. Journal

```
JournalEvent {
  id: EventId
  sequence: number
  timestamp: Timestamp
  entity_type: EntityType
  entity_id: EntityId
  operation: Operation
  payload_hash: Hash
  actor: ActorRef
}
```

**Инвариант M15:** каждая мутация памяти имеет journal event.
**Инвариант M16:** мутация и journal append атомарны.
**Инвариант M17:** историческое состояние восстановимо.

### 2.17. Segment

```
Segment {
  id: SegmentId
  root_context: ContextId
  included_objects: [ObjectId]
  included_claims: [ClaimId]
  included_relationships: [RelationshipId]
  included_contexts: [ContextId]
  included_evidence: [EvidenceId]
  purpose: string
  sensitivity: SensitivityLevel
  version: number
  payload_hash: Hash
  signature: string
  created_at: Timestamp
  expires_at: Timestamp | null
}
```

Import требует верификации. Не может тихо мутировать память.

---

## 3. Состав памяти

### 3.1. Входит в Memory

```
Memory =
    Objects
  + Claims
  + Relationships
  + Contexts
  + ContextMemberships
  + KnowledgeGaps
  + Evidence
  + Provenance
  + Identity history (redirects, tombstones)
  + Temporal state
  + Support state
  + Journal
```

### 3.2. Не входит в Memory

```
Candidates
Decisions
Policies
Indexes
Embeddings
SemanticRepresentations (summaries, essences)
Segments (порт — не память)
```

---

## 4. Инварианты M1–M20

Все 20 инвариантов из B/C сохраняются без изменений:

| ID | Инвариант |
|---|---|
| M1 | Каждый authoritative assertion имеет provenance |
| M2 | Evidence immutable |
| M3 | SourceVersion immutable |
| M4 | Memory IDs never reused |
| M5 | Object merge никогда не уничтожает исторический Object |
| M6 | Context membership никогда не копирует Object |
| M7 | Contradiction никогда не уничтожает Claim |
| M8 | Index loss никогда не вызывает Memory loss |
| M9 | Candidate не является Memory |
| M10 | Decision не является Memory |
| M11 | Policy не изменяет epistemic results |
| M12 | Decision Layer не имеет ACL authority |
| M13 | LLM/Jev не имеют прямого мутационного доступа к Core |
| M14 | Source disappearance не удаляет Memory |
| M15 | Каждая мутация Memory имеет Journal event |
| M16 | Мутация и Journal append атомарны |
| M17 | Историческое состояние восстанавливаемо |
| M18 | Unknown состояния представлены явно |
| M19 | Support State ≠ Confidence |
| M20 | Core независим от конкретной storage/retrieval/AI технологии |

---

## 5. Минимальные операции

Из B (#42), соответствуют Phase 4–5:

```
createObject       getObject
createClaim        getClaim
createRelationship getRelationship
createContext      getContext
addMembership      removeMembership
createKnowledgeGap resolveKnowledgeGap
getEvidence        getProvenance
mergeObjects
getJournal
```

Дополнительные операции из Phase 4–5:

```
createSemanticRepresentation   // summary/essence/embedding
rebuildSemanticRepresentation  // при потере
getSemanticRepresentations    // для retrieval
traverseRelationships          // multi-hop context
getClaimsByObject               // knowledge retrieval
getMultiHopPath                 // context reconstruction
```

---

## 6. Retrieval architecture (из Phase 4–5)

```
                    ┌─────────────────────────┐
                    │      Original           │
                    │  (verification, C1)     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Claims + Multi-hop   │
                    │  (context, C2–C7)       │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      Essence            │
                    │  (entry points)         │
                    └─────────────────────────┘
```

| Уровень | Роль | Минимальный набор данных |
|---|---|---|
| Essence | Entry points, topic discovery | SemanticRepresentation (type=essence) |
| Claims + Multi-hop | Relationship discovery, context | Claims, Relationships, Multi-hop paths |
| Original | Verification, temporal, detail | Evidence, SourceVersion |

**Query flow:**

```
query
  ↓
essence matching         // entry point
  ↓
claims of matched object  // knowledge
  ↓
relationship traversal   // multi-hop
  ↓
temporal filtering       // C1
  ↓
support filtering        // M19
  ↓
scope filtering          // C5
  ↓
context assembly         // reconstruction
```

---

## 7. Реализация (Phase 7 план)

### 7.1. Первая фаза реализации

```
1.  Value objects: IDs, Timestamps, Hashes
2.  Entity schemas: Source, SourceItem, SourceVersion, Evidence
3.  Entity schemas: Object, Claim, Relationship
4.  Temporal state, Support state, ScopeQualifier
5.  Context, ContextMembership
6.  KnowledgeGap
7.  Provenance
8.  Candidate, Decision, Policy
9.  SemanticRepresentation
10. Journal, Segment
```

### 7.2. Инварианты в коде

Каждый из M1–M20 реализуется как тест в доменном слое.
Тестирование — без AI, без DB, без network (из C #36).

### 7.3. Ports

```
ObjectRepository
ClaimRepository
RelationshipRepository
ContextRepository
MembershipRepository
EvidenceRepository
KnowledgeGapRepository
SemanticRepresentationRepository
Journal
IdentityResolver
Transaction
DecisionModel
PolicyModel
```

### 7.4. Первый milestone (из C #40)

16 шагов без AI:

```
1.  ingest source version
2.  create evidence
3.  create objects
4.  create claims
5.  create relationships
6.  attach provenance
7.  create contexts
8.  place objects in multiple contexts
9.  create a contradiction
10. create a knowledge gap
11. merge two identities
12. preserve historical references
13. mark evidence unavailable
14. keep memory intact
15. write journal events
16. query the resulting context
```

---

## 8. Отложенные решения

Из C (#42), остаётся актуальным:

```
exact object type registry
relation ontology
identity-resolution algorithm
temporal conflict semantics
support-decay algorithm
candidate lifecycle
policy DSL
segment wire format
ACL model
encryption/key management
retention/redaction rules
database schema
query language
HTTP API details
concurrency model
distributed deployment
```

---

## 9. Открытые вопросы

1. **PredicateType / RelationType.** Точная система типов для predicates
   и relation types не определена. Является ли это блокером Phase 7?
   Рекомендация: начать с минимального набора (has_role, supersedes,
   caused_by, depends_on, contradicts) и расширять по мере необходимости.
2. **Temporal conflict semantics.** Если два claims конфликтуют по времени
   (valid_from пересекается), что делать? Рекомендация: отложить до Phase 7,
   фиксировать конфликты как UnresolvedConflict (KnowledgeGap).
3. **Support state вычисление.** Как считать Support State (M19)?
   Рекомендация: отложить. Не блокер Phase 7 (милягстоун — 16 шагов
   без AI, детерминированные переходы, support как поле без алгоритма).

---

## 10. Что не входит в этот результат

- реализация в коде (Phase 7);
- схема базы данных;
- выбор конкретных технологий;
- рекомендации по инфраструктуре.

Модель фиксирует структуры, поля, инварианты и границы для будущей реализации.
