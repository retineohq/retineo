# RETINEO — Concrete Semantic Model v0.1

> Второй эксперимент этапа Phase 2 (Two documents) из `HANDOFF_Q.md`.
> Документ A: `HANDOFF_Q.md` (см. `docs/semantic-model/HANDOFF_Q.md`).
> Документ B: `RETINEO-MEMORY-CORE-DOMAIN-SPEC-v0.1.md`.
> Результат — текстовый артефакт, не код и не схема БД.

---

## 1. Идентификация

- **Название документа:** Retineo Memory Core — Domain Specification v0.1
- **Источник:** `/home/ryzen/MY_Brand/FROM_GPT/RETINEO-MEMORY-CORE-DOMAIN-SPEC-v0.1.md`
- **Дата создания документа:** 2026-09-23
- **Дата обработки:** 2026-10-03
- **Объём:** 1752 строки, 3076 слов
- **Формат:** Markdown, один язык (английский)
- **Связь с документом A:** развитие/уточнение — A формулирует концептуальный
  сдвиг, B фиксирует доменную модель его реализации

---

## 2. Original

Полный текст находится по пути, указанному в разделе «Идентификация».
В артефакт не копируется.

---

## 3. Summary

Документ — доменная спецификация нового Retineo Memory Core. Он определяет
необработанную семантику организационной памяти: источники, evidence, объекты,
claims, relationships, contexts, knowledge gaps, identity, temporal state,
support state, provenance, lifecycle, journal и границы архитектуры.

Центральный принцип: Evidence порождает Candidate; Candidate становится
авторитетной Memory только через Decision и Policy. LLM, вероятностные модели,
правила и люди — поставщики решений, но не источники истины. Нет прямого пути
из source, LLM или agent в Memory.

Ключевые решения спецификации: Memory ID глобально уникальны и не переиспользуются;
SourceVersion и Evidence immutable; merge объектов не удаляет историю (tombstone +
redirect); Claim — «subject + predicate + value», Relationship — «object + relation
+ object», оба являются эпистемическими утверждениями с временным и поддерживающим
состоянием; Context содержит ссылки, а не копии; KnowledgeGap — явное представление
неопределённости; каждая мутация Memory пишется в Journal атомарно.

Спецификация фиксирует 20 обязательных инвариантов (M1–M20), исключает из core
конкретные технологии storage/retrieval/AI, определяет минимальный набор операций
(создание/чтение объектов, claims, relationships, contexts, membership, gaps,
merge, journal) и порядок реализации, где первый milestone — детерминированное
Memory Core без AI, а не search.

14 областей решений сознательно отложены: точная система типов, семантика
relation-типов, identity-resolution, временные конфликты, вычисление support state,
lifecycle кандидатов, Policy DSL, формат segment, ACL, конкретная схема хранения,
query language, retention, шифрование, concurrency.

### Обоснование

Включено: назначение Core, центральный поток Evidence→Candidate→Decision→Policy→Memory,
ключевые структуры домена, инварианты, границы, минимальные операции, порядок
реализации, отложенные решения.

Исключено: полные JSON-схемы каждой сущности (в артефакте фиксируются существенные
поля), детальные lifecycle-диаграммы, промежуточные примеры.

---

## 4. Essence — вариант A (natural-language)

Спецификация превращает концептуальную инверсию из документа A в конкретную
доменную модель: организационная память — это авторитетное эпистемическое состояние,
состоящее из объектов, утверждений, отношений и контекстов с provenance, временем
и support. Знание не может появиться в памяти иначе, чем через цепочку
Evidence → Candidate → Decision → Policy. Все производные представления (indexes,
embeddings, summaries, candidates) — не память. Первый milestone — детерминированное
ядро с корректными переходами состояния, тестируемое без AI и внешней инфраструктуры.

### Обоснование

Сохраняет причинно-следственное значение: что является памятью, как она
строится и что не является памятью. Детали схем и инвариантов уходят —
они определимы из спецификации при обращении.

---

## 5. Essence — вариант B (structured)

```json
{
  "role": "domain specification",
  "defines": "Retineo Memory Core semantic model",
  "central_rule": "Evidence → Candidate → Decision → Policy → Memory",
  "memory_composition": [
    "Evidence", "Objects", "Claims", "Relationships", "Contexts",
    "ContextMemberships", "KnowledgeGaps", "Identity history",
    "Temporal state", "Support state", "Provenance"
  ],
  "not_memory": [
    "Candidates", "Decisions", "Policies", "Indexes",
    "Embeddings", "Summaries", "Reports"
  ],
  "key_invariants": [
    "every authoritative assertion has provenance",
    "evidence and SourceVersion are immutable",
    "IDs are never reused",
    "merge never destroys history",
    "context membership never copies objects",
    "contradiction never destroys a claim",
    "index loss never causes memory loss",
    "candidate is not memory",
    "policy does not alter epistemic results",
    "every mutation has a journal event, atomically",
    "core is technology-independent"
  ],
  "core_excludes": [
    "storage engine", "retrieval", "embedding model",
    "LLM runtime", "vector DB", "search engine"
  ],
  "minimum_operations": [
    "createObject/getObject", "createClaim/getClaim",
    "createRelationship/getRelationship", "createContext/getContext",
    "addMembership/removeMembership", "createKnowledgeGap/resolveKnowledgeGap",
    "getEvidence/getProvenance", "mergeObjects", "getJournal"
  ],
  "deferred_decisions": [
    "type system", "relation-type semantics", "identity resolution",
    "temporal conflicts", "support-state calculation", "candidate lifecycle",
    "policy DSL", "segment format", "ACL model", "storage schema",
    "query language", "retention", "encryption", "concurrency"
  ],
  "first_milestone": "deterministic memory core, correct state transitions, testable without AI"
}
```

### Обоснование

Структура фиксирует: что определяет спецификация, центральное правило,
состав памяти, что не является памятью, инварианты, границы, минимальные
операции и отложенные решения. Иллюстративная, не контрактная.

---

## 6. Knowledge extraction

### 6.1. Objects

| Object | Type | Основание |
|---|---|---|
| Memory Core | System | Целевой продукт спецификации |
| Source | Entity | Внешний источник информации |
| SourceItem | Entity | Логическая единица источника |
| SourceVersion | Entity | Неизменяемый снимок содержимого |
| Evidence | Entity | Неизменяемая основа знания |
| Object | Entity | Сущность организационного знания |
| Claim | Entity | Эпистемическое утверждение (subject+predicate+value) |
| Relationship | Entity | Эпистемическое утверждение (object+relation+object) |
| Context | Entity | Единица организации связанного знания |
| ContextMembership | Entity | Ссылка на объект внутри контекста |
| KnowledgeGap | Entity | Явное представление неопределённости |
| Candidate | Entity | Предложение изменения, не авторитетное |
| Decision | Entity | Результат эпистемической оценки |
| Policy | Entity | Правило обработки Decision |
| DecisionTrace | Entity | След принятия решения |
| Provenance | Entity | Ссылка на источник и время |
| Temporal State | Concept | observed_at / valid_from / valid_to / learned_at |
| Support State | Concept | Отличается от confidence |
| Memory Journal | Concept | Журнал всех мутаций |
| Identity | Concept | Глобально уникальные, не переиспользуемые ID |
| Segment | Concept | Упаковка контекста для потребителя |
| JEV | Concept | Поставщик DecisionModel, заменяемый |

### 6.2. Claims

| Claim | Уверенность | Обоснование |
|---|---|---|
| Memory Core хранит эпистемическое состояние, а не обработанные документы. | высокая | Раздел 1, Purpose |
| Evidence может произвести Candidate; Memory становится только через Decision и Policy. | высокая | Раздел 2, central rule |
| LLM/модели/правила/люди — decision providers, не source of truth. | высокая | Раздел 2 |
| Memory identity не зависит от имени, внешнего ID, технологии хранения. | высокая | Раздел 4 |
| SourceVersion immutable; изменение создаёт новую версию. | высокая | Раздел 5.3 |
| Evidence immutable. | высокая | Раздел 6 |
| Merge объектов не удаляет историю — tombstone + redirect. | высокая | Раздел 8, I1–I5 |
| Claim и Relationship — оба эпистемические утверждения с одинаковыми свойствами. | высокая | Раздел 11 |
| Историческое знание не переписывается при изменении текущей Memory. | высокая | Раздел 12, T1 |
| Support State и Confidence — разные вещи. | высокая | Разделы 13, M19 |
| Context содержит ссылки, не копии; объект может быть в нескольких контекстах. | высокая | Раздел 16, C1–C3 |
| Candidate не является Memory. | высокая | Раздел 17, M9 |
| Decision не является Memory. | высокая | Раздел 18, M10 |
| Policy не меняет эпистемический результат. | высокая | Раздел 19, M11 |
| Каждая мутация Memory имеет Journal event; мутация и запись атомарны. | высокая | Раздел 22, M15–M16 |
| Нет прямого пути source→memory, LLM→memory, agent→memory. | высокая | Раздел 40 |
| Agent предлагает Candidate, но не мутирует Memory напрямую. | высокая | Раздел 41 |
| Retrieval optimization, embeddings, LLM integration не предпосылки первой реализации. | высокая | Раздел 42 |
| Первая реализация должна быть детерминированной и тестируемой без AI. | высокая | Раздел 47 |
| Indexes и embeddings rebuildable; их потеря не разрушает Memory. | высокая | Разделы 37–38, M8 |

### 6.3. Relationships

| Source | Type | Target | Обоснование |
|---|---|---|---|
| Source | produces | SourceItem | Раздел 5 |
| SourceItem | has_versions | SourceVersion | Раздел 5.2–5.3 |
| SourceVersion | becomes | Evidence | Раздел 6 |
| Evidence | produces | Candidate | Раздел 2, поток |
| Candidate | requires | Decision | Раздел 2, поток |
| Decision | requires | Policy | Раздел 2, поток |
| Policy | gates | Memory Assertion | Раздел 2, поток |
| Memory | contains | Objects | Раздел 44 |
| Memory | contains | Claims | Раздел 44 |
| Memory | contains | Relationships | Раздел 44 |
| Memory | contains | Contexts | Раздел 44 |
| Memory | contains | KnowledgeGaps | Раздел 44 |
| Claim | differs_from | Relationship | Раздел 11 (структура, не природа) |
| Context | organizes | Objects, Claims, Relationships, Evidence, Contexts, Gaps | Раздел 15 |
| ContextMembership | references | Context + member | Раздел 16 |
| KnowledgeGap | represents | Missing evidence / unresolved conflict / open question / unknown dependency | Раздел 14 |
| Candidate | requires | evidence_refs | Раздел 17 |
| Decision | traces_to | DecisionTrace | Раздел 20 |
| Journal | records | every Memory mutation | Раздел 22 |
| Identity | never_reuses | Memory IDs | Раздел 4 |
| Temporal State | separates | when happened / when valid / when learned | Раздел 12 |
| JEV | implements | DecisionModel (replaceable) | Раздел 39 |

---

## 7. Provenance

| Утверждение/элемент | Раздел spec | Строки |
|---|---|---|
| Purpose, что хранит Core | #1 | 10–34 |
| Central rule, поток | #2 | 35–78 |
| Domain vocabulary | #3 | 79–199 |
| Identity | #4 | 200–235 |
| Source model | #5 | 236–293 |
| Evidence | #6 | 294–341 |
| Object | #7 | 342–365 |
| Redirect/Tombstone | #8 | 366–394 |
| Claim | #9 | 395–429 |
| Relationship | #10 | 430–472 |
| Claim vs Relationship | #11 | 473–501 |
| Temporal model | #12 | 502–538 |
| Support State | #13 | 539–576 |
| KnowledgeGap | #14 | 577–627 |
| Context | #15 | 628–658 |
| ContextMembership | #16 | 659–697 |
| Candidate | #17 | 698–732 |
| Decision | #18 | 733–763 |
| Policy | #19 | 764–802 |
| DecisionTrace | #20 | 803–857 |
| Authoritative Memory State | #21 | 858–892 |
| Memory Journal | #22 | 893–934 |
| Lifecycle States | #24 | 963–1005 |
| Contradictions | #26 | 1028–1064 |
| Provenance | #28 | 1100–1135 |
| Segment | #29–#30 | 1136–1202 |
| Hexagonal architecture | #32 | 1234–1266 |
| Query model | #36 | 1320–1355 |
| Indexes | #37 | 1356–1376 |
| JEV boundary | #39 | 1397–1427 |
| Security boundary | #40 | 1428–1470 |
| Agent boundary | #41 | 1471–1493 |
| Minimum operations | #42 | 1494–1530 |
| Invariants M1–M20 | #43 | 1531–1616 |
| Canonical memory model | #44 | 1617–1650 |
| Core formula | #45 | 1651–1695 |
| Deferred decisions | #46 | 1696–1720 |
| Implementation order | #47 | 1721–1752 |

---

## 8. Cross-document analysis (A → B)

### 8.1. Связь между документами

Документ A (`HANDOFF_Q.md`) формулирует концептуальный сдвиг.
Документ B (`DOMAIN-SPEC-v0.1`) фиксирует доменную модель этого сдвига.
Тип связи: **развитие/уточнение** — B детализирует принципы A до уровня
конкретных сущностей и инвариантов.

### 8.2. Подтверждения (A.claim ↔ B.claim)

| Claim из A | Claim из B | Тип связи |
|---|---|---|
| Provenance обязателен (A #32) | Every authoritative assertion has provenance (B M1) | подтверждает |
| Evidence immutable (A #34) | Evidence is immutable (B M2) | подтверждает |
| Retrieval не единственный механизм реконструкции (A #74.5) | Search finds where to enter Memory (B #45) | подтверждает |
| Relationships first-class (A #74.6) | Relationship as epistemic assertion (B #10) | подтверждает |
| Similarity ≠ relationship (A #74.7) | Relationship requires evidence_refs, not similarity (B #10, #17) | подтверждает |
| Temporal reasoning необходим (A #74.8) | Temporal model with observed_at/valid_from/valid_to (B #12) | подтверждает |
| Contradiction и supersession различаются (A #74.9) | Contradiction never destroys a Claim (B M7) | подтверждает |
| Indexes rebuildable (A #74.10) | Index loss never causes Memory loss (B M8) | подтверждает |
| LLM output через candidate/decision boundary (A #74.11) | Candidate → Decision → Policy → Memory (B #2) | подтверждает |
| Policy отделена от epistemic decision (A #74.12) | Policy does not alter epistemic results (B M11) | подтверждает |
| Core независим от LLM/vector DB/connectors (A #74.13) | Core excludes storage/retrieval/AI technology (B #31–#33) | подтверждает |
| Original не заменяется derived representations (A #74.1) | Evidence immutable, SourceVersion immutable (B M2–M3) | подтверждает |

### 8.3. Развитие (B уточняет/детализирует A)

| Идея из A | Детализация в B |
|---|---|
| «Knowledge objects» без определения | Object entity с ID, типом, lifecycle |
| «Relationships» как концепция | Relationship entity с relation_type, evidence_refs, temporal/support |
| «Context как central object» | Context entity с типом, purpose, membership (explicit/inferred/rule_based/temporary) |
| «Candidate/Decision boundary» | Полный lifecycle с типами кандидатов, DecisionTrace, Journal |
| «Provenance обязателен» | Provenance entity с learned_at, разделённым от temporal state |
| «Memory Event Journal» | Memory Journal с атомарной записью (M15–M16) |
| «Identity / tombstones / redirects» | Redirect/Tombstone с инвариантами I1–I5 |
| «Knowledge gaps» | KnowledgeGap entity с 4 типами |

### 8.4. Candidate relationship (извлечено, не подтверждено)

| A.claim | B.claim | Тип связи (кандидат) | Уверенность |
|---|---|---|---|
| Summary/Essence как представления (A #8–#9) | Summaries not memory (B #44) | **уточняет**: A определяет уровни, B классифицирует их как не-память | высокая |
| Fractal/multi-resolution memory (A #5–#6) | Segment/Query model (B #36) | **частично подтверждает**: Segment — механизм multi-resolution, но B не описывает fractal напрямую | средняя |
| Semantic compression уменьшает raw text (A #75.9) | Segment format deferred (B #46.8) | **отложено**: B откладывает формат, не отрицает гипотезу | средняя |
| Старый код не сохраняется (A #78) | Implementation order from scratch (B #47) | **подтверждает** | высокая |

### 8.5. Противоречия / несоответствия

Явных противоречий не обнаружено. Одно несоответствие уровня детализации:

- A говорит о Summary/Essence как ключевых уровнях представления (L1/L2).
- B включает Summaries в «not memory» (раздел 44), но не определяет,
  как Summary/Essence строятся, где хранятся и как связаны с Memory.

Это не противоречие, а **зона, не покрытая B**: A ставит вопрос
«нужен ли Summary вообще после Essence» (A #76.1), B его не разрешает.
Спецификация домена корректно откладывает этот вопрос.

### 8.6. Supersession / обновление

Не обнаружено. B не заменяет выводы A — он их развивает.

---

## 9. Наблюдения

### Что было трудно извлечь

- Спецификация содержит 47 разделов и 20 инвариантов. Приходилось различать:
  что является Memory (раздел 44), что не является Memory (там же), и что
  является lifecycle-механизмом (Candidate, Decision, Policy).
- Граница между Claim и Relationship концептуально ясна (раздел 11),
  но на уровне объектов в таблицах артефакта они выглядят похоже.
  Различие — в структуре (subject+predicate+value vs object+relation+object),
  а не в наборе свойств.
- Раздел 44 не определяет, как Summaries попадают в систему, если они
  не память. Это зона, требующая отдельного решения.

### Где теряется информация при сжатии

- Полные схемы сущностей (Source, SourceItem, SourceVersion, Evidence, Object,
  Claim, Relationship, Context, ContextMembership, Candidate, Decision, Policy,
  DecisionTrace) сжаты до существенных полей. Точные схемы — в original.
- Lifecycle-диаграммы (раздел 24) не вошли в Summary.
- Критерии провала, аналоги C1–C7 из A, не определены в B. B определяет
  инварианты, но не тестовые условия успеха.

### Где возникает неоднозначность

- **Support State vs Confidence.** Спецификация фиксирует различие (M19),
  но не определяет, как вычислять Support State. Отложено (раздел 46.5).
- **Contradiction handling.** Инвариант M7 гласит «contradiction never destroys
  a Claim», но механизм разрешения противоречий отложен (раздел 46).
- **Segment.** Определён в разделе 29, но его формат отложен (46.8). Неясно,
  как Segment связан с Summary/Essence из A.

---

## 10. Открытые вопросы

1. **Статус второго документа.** Подтверждает ли пользователь тип связи
   «развитие/уточнение» между A и B, установленный в разделе 8.1?
2. **Summary/Essence в B.** B относит Summaries к «not memory» (#44), но не
   определяет их lifecycle. Это зона, не покрытая спецификацией. Нужно ли
   возвращаться к этому вопросу в третьем документе или отложить?
3. **Support State.** Различие M19 зафиксировано, но вычисление отложено.
   Это блокер для третьего документа или нет?
4. **Третий документ.** Какой документ использовать для Phase 3 (multi-hop)?
   Требуется связь с обоими предыдущими. Кандидаты: technical spec v0.2
   (та же папка), или внешний документ, добавляющий третью точку зрения.
5. **Протокол объёма.** Оба документа превышают рекомендацию раздела 62.5
   handoff (<2000 слов). Продолжать ли с этим отклонением или разбить
   документы на части?

---

## 11. Что не входит в этот результат

Следуя разделу 90.3 handoff и формату первого артефакта:

- реализация в коде;
- схема базы данных;
- выбор технологий;
- рекомендации по инфраструктуре.

Ядро не изменено.
