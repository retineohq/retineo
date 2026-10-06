# RETINEO — Concrete Semantic Model v0.1

> Третий эксперимент этапа Phase 3 (Three-to-five documents) из `HANDOFF_Q.md`.
> Документ A: `HANDOFF_Q.md` — концептуальный сдвиг.
> Документ B: `RETINEO-MEMORY-CORE-DOMAIN-SPEC-v0.1.md` — доменная модель.
> Документ C: `RETINEO-MEMORY-CORE-TECHNICAL-SPEC-v0.2.md` — техническая архитектура.
> Результат — текстовый артефакт, не код и не схема БД.

---

## 1. Идентификация

- **Название документа:** Retineo Memory Core — Technical Architecture Specification v0.2
- **Источник:** `/home/ryzen/MY_Brand/FROM_GPT/RETINEO-MEMORY-CORE-TECHNICAL-SPEC-v0.2.md`
- **Дата создания документа:** 2026-09-23
- **Дата обработки:** 2026-10-05
- **Объём:** 1849 строк, 3780 слов
- **Формат:** Markdown, один язык (английский)
- **Связь с предыдущими:** развитие — C определяет техническую реализацию доменной модели B, которая в свою очередь детализирует концептуальный сдвиг A

---

## 2. Original

Полный текст находится по пути, указанному в разделе «Идентификация».
В артефакт не копируется.

---

## 3. Summary

Документ — техническая архитектура Memory Core. Он превращает доменную модель
B в конкретную реализацию: границы системы, hexagonal architecture, storage ports,
index architecture, query architecture, agent boundary, API boundary, security
architecture, testing strategy, operational metrics, implementation sequence.

Центральный тезис: retrieval служит памяти, а не наоборот. Все indexes —
derived projections, их потеря не разрушает memory. Ядро независимо от БД,
vector DB, LLM, embedding model, search, UI, connector, agent framework.

Система построена на границах: External World → Source Adapters → Evidence
Boundary → Extraction Layer → Candidate → Decision Layer → Policy Layer →
Memory Core (authoritative state + immutable journal) → rebuildable indexes +
segment export. Нет прямого пути от источника, LLM или агента в авторитетную память.

Query architecture: query → index entry points → objects/claims/contexts →
relationship traversal → temporal filtering → support filtering → authorization →
context assembly. Search находит точку входа; memory graph и context model
обеспечивают реконструкцию.

Segment — переносимый фрагмент памяти с hash, signature, policy_ref, version.
Import требует верификации; не может тихо мутировать память.

Реализация разделена на 12 фаз, от pure domain (без DB, без AI) до segments
и agent access. Первый milestone: 16 шагов без AI — ingest source, create evidence/
objects/claims/relationships, attach provenance, create contexts, merge identities,
preserve history, mark evidence unavailable, keep memory intact, write journal,
query context.

Acceptance test — не скорость поиска или качество embeddings, а способность
сохранять, связывать, объяснять, обновлять и переиспользовать знание между
источниками без реконструкции из chunks.

### Обоснование

Включено: цель, архитектурный тезис, границы, hexagonal architecture, query flow,
segments, реализационная последовательность, milestone, acceptance test.

Исключено: полные JSON-схемы, детальные lifecycle-диаграммы, operational metrics
в деталях, начальная структура репозитория.

---

## 4. Essence — вариант A (natural-language)

Техническая спецификация определяет, как доменная модель становится работающей
системой: авторитетная память отделена от всех производных механизмов (indexes,
segments, agents) через границы и ports. Знание входит в память только через
Evidence → Candidate → Decision → Policy. Все indexes rebuildable, все мутации
журналируются, вся история сохраняется. Первый milestone — детерминированное ядро
без AI; критерий успеха — не скорость поиска, а способность сохранять и связывать
знание между источниками.

### Обоснование

Сохраняет архитектурную инверсию и границу «memory vs derived».
Детали фаз, ports, API — уходят, доступно в original.

---

## 5. Essence — вариант B (structured)

```json
{
  "role": "technical architecture specification",
  "central_thesis": "retrieval serves memory, not vice versa",
  "boundary_chain": [
    "sources", "evidence", "candidate", "decision", "policy",
    "memory core", "indexes + segments"
  ],
  "no_direct_mutation": ["source", "LLM", "agent", "index"],
  "hexagonal": true,
  "ports": [
    "ObjectRepository", "ClaimRepository", "RelationshipRepository",
    "ContextRepository", "MembershipRepository", "EvidenceRepository",
    "KnowledgeGapRepository", "Journal", "IdentityResolver", "Transaction"
  ],
  "query_flow": [
    "index entry points", "objects/claims/contexts", "relationship traversal",
    "temporal filtering", "support filtering", "authorization", "context assembly"
  ],
  "segments": {
    "is": "portable portion of memory",
    "requires": ["hash", "signature", "policy_ref", "version"],
    "import": "verify → validate → apply explicitly"
  },
  "implementation_phases": 12,
  "first_milestone": "16-step scenario without AI",
  "acceptance": "preserve, connect, explain, update, reuse knowledge across sources without chunk reconstruction"
}
```

### Обоснование

Структура фиксирует архитектурный каркас: границы, ports, query flow, segments,
фазы и milestone. Иллюстративная, не контрактная.

---

## 6. Knowledge extraction

### 6.1. Objects

| Object | Type | Основание |
|---|---|---|
| Memory Core | System | Headless domain component |
| Source Adapter | Component | External → Evidence |
| Evidence Boundary | Boundary | Входная точка памяти |
| Extraction Layer | Component | Parser/LLM/rules → Candidate |
| Candidate | Entity | Предложение изменения |
| Decision Layer | Component | Epistemic assessment |
| Policy Layer | Component | Trust/ACL/action |
| Memory Core | Component | Authoritative state + journal |
| Index | Component | Rebuildable projection (BM25/vector/graph/temporal) |
| Segment | Component | Portable memory portion |
| Query Architecture | Concept | Search → entry points → traversal |
| Agent Boundary | Boundary | Context package → Candidate proposal |
| API Boundary | Boundary | HTTP endpoints |
| Storage Ports | Interface | Repository/transaction/journal abstraction |
| Journal | Component | Immutable event log |
| Identity Resolver | Component | Merge + redirect |
| Segment Security Envelope | Concept | hash/signature/policy_ref |

### 6.2. Claims

| Claim | Уверенность | Обоснование |
|---|---|---|
| Retrieval служит памяти, а не наоборот. | высокая | Раздел 2 |
| All indexes are derived projections; их потеря не разрушает memory. | высокая | Раздел 30, M8 |
| Core независим от конкретной БД/vector DB/LLM/embedding/search/UI/connector. | высокая | Разделы 1, 29 |
| Нет прямого пути source/LLM/agent/index → Memory. | высокая | Раздел 4, 34 |
| Query flow: search finds entry points; memory graph and context model provide reconstruction. | высокая | Раздел 31 |
| Segment — переносимый фрагмент с hash/signature/policy_ref. | высокая | Раздел 27 |
| Import сегмента требует верификации; не может тихо мутировать память. | высокая | Раздел 28 |
| Первый milestone — 16 шагов без AI. | высокая | Раздел 40 |
| Acceptance test — не скорость, а способность сохранять и связывать знание. | высокая | Раздел 41 |
| Реализация 12 фаз, от pure domain до agent access. | высокая | Раздел 39 |
| Hexagonal architecture: domain компилируется без DB/AI SDK. | высокая | Раздел 5 |
| External input untrusted. | высокая | Раздел 34 |
| Every mutation auditable. | высокая | Раздел 43.14 |
| Core must remain small. | высокая | Раздел 43.15 |

### 6.3. Relationships

| Source | Type | Target | Обоснование |
|---|---|---|---|
| Source Adapter | feeds | Evidence Boundary | Раздел 4 |
| Evidence Boundary | feeds | Extraction Layer | Раздел 4 |
| Extraction Layer | produces | Candidate | Раздел 4 |
| Candidate | enters | Decision Layer | Раздел 4 |
| Decision Layer | produces | Decision | Раздел 4 |
| Decision | enters | Policy Layer | Раздел 4 |
| Policy Layer | gates | Memory Core | Раздел 4 |
| Memory Core | produces | Indexes | Раздел 4 |
| Memory Core | produces | Segments | Раздел 4 |
| Index | derived_from | Memory Core | Раздел 30 |
| Segment | exported_from | Memory Core | Раздел 27 |
| Agent | receives | Context Package | Раздел 32 |
| Agent | proposes | Candidate | Раздел 32 |
| Query | enters_through | Index entry points | Раздел 31 |
| Query | reconstructs_via | Memory graph + context | Раздел 31 |

---

## 7. Provenance

| Утверждение/элемент | Раздел spec | Строки |
|---|---|---|
| Purpose, центральный тезис | #1–#2 | 9–72 |
| Design goals, non-goals | #3 | 73–110 |
| System boundaries | #4 | 111–163 |
| Hexagonal architecture | #5 | 164–199 |
| Domain model (Source→Knowledge objects) | #6–#9 | 200–407 |
| Claims, Relationships, Temporal | #10–#12 | 408–511 |
| Support vs confidence | #13 | 512–548 |
| Gaps, Context, Membership | #14–#16 | 549–668 |
| Candidates, Decision, JEV, Policy | #17–#20 | 669–810 |
| Journal, Lifecycle, Contradictions | #23–#25 | 871–1000 |
| Segments | #27–#28 | 1027–1098 |
| Storage ports | #29 | 1099–1130 |
| Index architecture | #30 | 1131–1167 |
| Query architecture | #31 | 1168–1204 |
| Agent/API boundary | #32–#33 | 1205–1289 |
| Security architecture | #34 | 1290–1327 |
| Core invariants M1–M20 | #35 | 1328–1393 |
| Testing strategy | #36 | 1394–1445 |
| Implementation sequence | #39 | 1550–1679 |
| First milestone | #40 | 1680–1708 |
| Acceptance test | #41 | 1709–1752 |
| Deferred decisions | #42 | 1753–1779 |
| Architectural principles | #43 | 1780–1801 |
| Final architecture | #44 | 1802–1849 |

---

## 8. Cross-document analysis (A → B → C)

### 8.1. Цепочка документов

```
A (HANDOFF_Q)          B (DOMAIN-SPEC v0.1)     C (TECH-SPEC v0.2)
концептуальный сдвиг → доменная модель     → техническая реализация
```

Тип связи A→B: развитие (подтверждено пользователем).
Тип связи B→C: **развитие** — C определяет техническую реализацию модели B.
Тип связи A→C: **подтверждение через B** — C реализует принципы A через модель B.

### 8.2. Подтверждения (C подтверждает B)

| Claim из B | Claim из C | Тип связи |
|---|---|---|
| M1: Provenance обязателен | M1: Every authoritative assertion has provenance | подтверждает |
| M2–M3: Evidence/SourceVersion immutable | M2–M3 те же | подтверждает |
| M4: IDs never reused | M4 те же | подтверждает |
| M5–M8: merge/membership/contradiction/index | M5–M8 те же | подтверждает |
| M9–M11: Candidate/Decision/Policy separation | M9–M11 те же | подтверждает |
| M15–M16: Journal atomic | M15–M16 те же | подтверждает |
| M19: Support ≠ confidence | M19 те же | подтверждает |
| M20: Core technology-independent | M20 те же | подтверждает |
| Storage independence (B #31) | Storage ports + adapters (C #29) | подтверждает |
| Hexagonal architecture (B #32) | Ports & Adapters (C #5) | подтверждает |
| Minimum core operations (B #42) | Testing strategy (C #36) | подтверждает |

Все 20 инвариантов B воспроизведены в C идентично (M1–M20).

### 8.3. Развитие (C уточняет B)

| Идея из B | Детализация в C |
|---|---|
| Hexagonal architecture (концепция) | Конкретная диаграмма ports/adapters/domain (C #5) |
| Storage independence (принцип) | Storage ports с конкретным списком (C #29) |
| Indexes rebuildable (инвариант M8) | Index architecture с 6 типами indexes (C #30) |
| Query model (концепция) | Полный query flow с 7 шагами (C #31) |
| Agent boundary (принцип) | Agent boundary с Context Package (C #32) |
| Security boundary (принцип) | Security architecture с обязательным pipeline (C #34) |
| Testing strategy (принцип) | Domain tests + property/invariant tests (C #36) |
| Implementation order (список) | 12 фаз с переходом от pure domain к agent access (C #39) |
| Segment (упоминание) | Полная схема Segment + security envelope (C #27–#28) |

### 8.4. Cross-document multi-hop (A → B → C)

Проверка multi-hop контекста (Phase 3 цель из handoff раздел 64):

| Начало | Путь | Конец | Смысл |
|---|---|---|---|
| A: «Retrieval не должен быть единственным механизмом реконструкции» (A #74.5) | → B: «Search finds where to enter Memory» (B #45) | → C: Query flow — search finds entry points; memory graph provides reconstruction (C #31) | Принцип A закреплён в архитектуре B и реализован в query flow C |
| A: «LLM output должен проходить через candidate/decision boundary» (A #74.11) | → B: Candidate → Decision → Policy → Memory (B #2) | → C: Extraction Layer → Candidate → Decision Layer → Policy Layer → Memory Core (C #4) | Граница A превращена в доменную модель B и технический pipeline C |
| A: «Original не заменяется derived representations» (A #74.1) | → B: Evidence immutable (M2), SourceVersion immutable (M3) | → C: Evidence Boundary + immutable journal (C #4) | Принцип неизменяемости проходит все три уровня |
| A: «Indexes должны быть rebuildable» (A #74.10) | → B: Index loss never causes Memory loss (M8) | → C: Index architecture — все indexes derived projections (C #30) | Index как disposable подтверждён на всех уровнях |
| A: «Context может иметь собственные представления» (A #23, гипотеза) | → B: Context entity с membership (B #15–#16) | → C: Segment — portable portion of memory (C #27) | Гипотеза A реализована как Segment в C |
| A: «Retineo does not primarily index documents» (A #86) | → B: Memory Core source of truth (B #44–#45) | → C: Final architecture — Memory Core is the source of truth (C #44) | Центральная инверсия A подтверждена архитектурно в C |

Six multi-hop paths подтверждены. Ни одна не прервана противоречием.

### 8.5. Противоречия / несоответствия

Явных противоречий не обнаружено.

Одна зона неоднозначности, унаследованная из B:

- **Summary/Essence lifecycle.** B относит Summaries к «not memory» (#44).
  C не определяет, где строятся и хранятся Summary/Essence, как они связаны
  с Evidence и являются ли они derived projections (как indexes).
  A ставит этот вопрос (A #76.1), B классифицирует, C не разрешает.

Это не блокер для Phase 3 — спецификация корректно откладывает решение.
Но вопрос остаётся открытым перед Phase 6 (domain model implementation).

### 8.6. Supersession

Не обнаружено. C не заменяет B или A — он детализирует их.

### 8.7. User-confirmed decisions (интегрированы)

Из предыдущего этапа:

1. **Summary/Essence → representation layer.** Пользователь подтвердил
   предложение: Summary/Essence — производные представления, не память.
   Строятся из Evidence, rebuildable, привязаны через provenance.
   Не входят в Memory formula (B #45). Решение фиксировано для future
   domain model implementation.
2. **Support State.** Различие M19 зафиксировано; вычисление отложено.
   Не блокер для Phase 3. Станет актуальным в Phase 6.
3. **Объём документов.** Пользователь подтвердил продолжение с отклонением
   от рекомендованного лимита (<2000 слов). Все три документа превышают.

---

## 9. Наблюдения

### Что было трудно извлечь

- C содержит 44 раздела. Приходилось различать архитектурные границы (разделы
  4–5), доменные сущности (6–16), технические механизмы (29–33) и реализационную
  последовательность (39–40). Это разные уровни абстракции, смешанные в одном
  документе.
- Acceptance test (раздел 41) — самый ценный раздел для будущей валидации,
  но он сформулирован качественно (can preserve/connect/explain/update/reuse).
  Метрик нет. Это зона, требующая доработки перед Phase 4 (retrieval experiment).

### Где теряется информация при сжатии

- Полные схемы всех ports, endpoints, Segment payload, lifecycle-диаграммы,
  operational metrics, initial repository structure — уходят в original.
- Implementation sequence с 12 фазами сжата до списка фаз; детальный состав
  каждой фазы — в original.

### Где возникает неоднозначность

- **Summary/Essence в representation layer.** Решение пользователя зафиксировано,
  но C не имеет сущности для этого. Будет нужна новая сущность
  `SemanticRepresentation` в будущей доменной модели.
- **Acceptance test без метрик.** Качественные критерии (merge, connect, change,
  provenance, reconstruction, reuse, segmentation, resilience) не имеют
  численных порогов. Phase 4/5 потребует их определения.

---

## 10. Открытые вопросы

1. **Acceptance test метрики.** Раздел 41 C определяет качественные критерии
   (merge, connect, change, provenance, reconstruction, reuse, segmentation,
   resilience). Нужны ли численные пороги для этих критериев перед Phase 4,
   или качественной оценки достаточно на текущем этапе?
2. **SemanticRepresentation сущность.** Решение пользователя (Summary/Essence
   → representation layer) требует новой сущности в будущей доменной модели.
   Определить её сейчас (в Phase 3) или отложить до Phase 6?
3. **Четвёртый документ.** Handoff предполагает Phase 3 на 3–5 документах
   для multi-hop. Три документа уже дают подтверждённые multi-hop пути
   (раздел 8.4). Достаточно ли трёх для перехода к Phase 4 (retrieval
   experiment), или нужен четвёртый документ другой категории
   (например, ADR, incident report, meeting notes)?

---

## 11. Что не входит в этот результат

Следуя разделу 90.3 handoff:

- реализация в коде;
- схема базы данных;
- выбор технологий;
- рекомендации по инфраструктуре.

Ядро не изменено.
