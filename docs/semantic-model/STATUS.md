# RETINEO Memory Core — Status Snapshot

> Фиксация состояния на 2026-10-16. Wave 2 завершена: AI-адаптеры,
> multi-tenant, ACL, Postgres foundation, distributed replication foundation.

---

## 1. Что сделано

### 1.1. Экспериментальная фаза (Phase 0–6)

| Фаза | Артефакт | Результат |
|---|---|---|
| Phase 0–1 (conceptual validation, one document) | `HANDOFF_Q.md` | Concrete Semantic Model v0.1 на документе A. 20 Objects, 17 Claims, 17 Relationships. |
| Phase 2 (two documents) | `RETINEO-MEMORY-CORE-DOMAIN-SPEC-v0.1.md` | Cross-document analysis A→B. 12 подтверждений, 8 развитий, 0 противоречий. |
| Phase 3 (three documents) | `RETINEO-MEMORY-CORE-TECHNICAL-SPEC-v0.2.md` | Multi-hop analysis A→B→C. 6 путей подтверждены, 0 противоречий. |
| Phase 4 (retrieval experiment) | `phase4-retrieval-experiment.md` | Chunk vs Essence vs Knowledge vs Context. 5 гипотез подтверждено, 1 частично. |
| Phase 5 (compression experiment) | `phase5-compression-experiment.md` | Compression 25–51×. H-B опровергнута: essence недостаточна для relationship discovery. |
| Phase 6 (domain model definition) | `phase6-domain-model.md` | 17 сущностей, M1–M20, retrieval architecture. |

### 1.2. Реализация (Phase 7, partial)

Пакет `packages/memory-core/`:

- **Domain:** 17 typed entities (Source → Segment), value objects с temporal state, support state, scope, lifecycle
- **Ports:** 9 repository interfaces + Journal + Transaction + IdentityResolver + DecisionModel + PolicyModel + RepresentationRepository + SegmentRepository
- **InMemory adapters:** все порты, детерминированные модели (Decision, Policy, Representation, SegmentSecurity)
- **MemoryCore:** 25 операций, каждая атомарна с Journal event
- **Тесты:** 42, все проходят. 16-шаговый milestone без AI. Все 20 инвариантов M1–M20 покрыты тестами (Этап 1 завершён).
- **SQLite adapter (Этап 2):** полный набор репозиториев, Journal с auto-increment, Transaction с BEGIN/COMMIT, IdentityResolver через redirect. Persistence тест: close + reopen — память переживает перезапуск.
- **Filesystem ingestion (Этап 3):** SourceAdapter → Source → SourceItem → SourceVersion → Evidence. Повторный ingest unchanged = skip. Изменённый файл = новая SourceVersion (M3 append-only). Content hash проверен (M2). Репозитории Source/SourceItem/SourceVersion добавлены в оба adapter'а.
- **Sandboxing (Этап 3):** untrusted/sandboxed → Evidence state=unavailable. `requireEvidence` блокирует quarantined evidence в claims (handoff #40).
- **Candidate extraction (Этап 4):** ExtractionModel port + RegexExtractionModel (детерминированный). `extractFromEvidence`: Evidence → extraction → Candidate → Decision → Policy → Memory (Object + Claim/Relationship). Полный pipeline работает без AI.
- **Retrieval projections (Этап 5):** QueryEngine — `findEntryPoints` (essence token matching), `knowledgeQuery` (claims/relationships по keyword), `reconstructContext` (multi-hop paths + claims + gaps). Многослойный retrieval работает.
- **Segment import (Этап 6):** `importSegment` — verify signature, expire check, autoApply опция, validation что все members существуют локально. Journal events: import_verified/import_rejected/import_applied. Import не мутирует память молча.
- **HTTP API (Этап 7):** Fastify сервер с 13 endpoints — health, objects (GET/POST + provenance), claims GET/POST, contexts GET, relationships POST, query (entry-points/knowledge/context), segments (GET/import), journal. Порт 0 для тестов, inject-based.
- **CLI (Этап 7):** `memory-core` binary — serve (HTTP), ingest, journal, extract, query. Дефолт SQLite db. Проверено вручную: ingest пишет в journal через MemoryCore.
- **MCP server (Этап 7):** `MemoryCoreMCPServer` — 9 tools (get_object, get_claim, get_context, create_object, query_entry_points, query_knowledge, query_context, get_journal, get_segment). Stdio transport. CLI команда `memory-core mcp`.
- **Программная валидация Phase 4–5 (Этап 7):** `experiments/validate-phase4-5.ts` — 5/5 тестов пройдено программно. HashEmbeddingModel (детерминированный, 64 dim). Проверено: entry points через cosine similarity (0.192), compression 5.8×, semantic recall 1.00, relationship discovery через extraction pipeline, multi-hop reconstruction.
- **tsc:** чисто для memory-core и для старого ядра.

### 1.3. Wave 2 (2026-10-13 … 2026-10-16)

- **SQLite migrations:** `schema_version` v1, версия хранится в БД.
- **REST expansion:** +8 endpoints (contexts POST, memberships, relationships GET, candidates, decide, apply-policy, extract, segments/export).
- **Negative tests:** +43 edge cases (дубликаты, коллизии, отсутствие evidence, race идемпотентность).
- **OpenRouter extraction:** async `ExtractionModel` порт (`extractAsync`), adapter `OpenRouterExtractionModel`, env `OPENROUTER_API_KEY`/`OPENROUTER_EXTRACTION_MODEL`. CLI `extract-async`, REST `POST /extract { async: true }`.
- **Ollama extraction:** adapter `OllamaExtractionModel` (`/api/generate`, `format: json`), few-shot prompt, env `OLLAMA_BASE_URL`/`OLLAMA_EXTRACTION_MODEL` (default `qwen2.5:3b`). CLI `extract-async … ollama`, REST `engine: "ollama"`. Real round-trip проверен пользователем.
- **Ollama embeddings:** `OllamaEmbeddingModel` (768 dims проверено).
- **Sensitivity model:** уровни `public|internal|confidential|restricted`, поля `sensitivity` на core-сущностях, SQLite колонки + default 'internal'.
- **Agent filtering:** `getAgentContext({ maxSensitivity, tenantId })`, REST query-param.
- **Multi-tenant:** `tenantId` на Source/SourceItem/SourceVersion/Evidence/Object/Claim/Relationship/Context/Membership/Gap; core-методы принимают обязательный `tenantId`; изоляция в queries/multi-hop/agent-context; SQLite `tenant_id` колонки.
- **ACL (v1):** `AccessControlModel.canRead` + `SensitivityAccessControlModel`; denied → `getAgentContext` возвращает `null`.
- **Postgres foundation:** `SqlExecutor` contract, `PostgresDatabase.applySchema`, `PostgresObjectRepository`, `createPgExecutor` (pg Pool, `DATABASE_URL`), select-cache + `prepareSelect` для sync-чтения. Integration-test зелёный против Docker Postgres (140 passed).
- **Multi-hop:** `QueryEngine.findMultiHopPaths(start, end, maxDepth, tenantId)` + REST `POST /query/multi-hop`.
- **Distributed foundation:** journal events idempotent, `core.journalSince/journalSequence/applyJournalEvent`, REST `GET/POST /replication/events`.
- **CI:** green; tests 140 (плюс 1 integration skipped без DATABASE_URL).

### 1.4. Решения пользователя

1. Summary/Essence — representation layer, не память (подтверждено)
2. Support State вычисление — отложено до Phase 7/6
3. Acceptance test метрики — отложены до retrieval experiment
4. Три документа достаточно для Phase 3
5. Объём документов превышает протокол — принято продолжение
6. SemanticRepresentation — отложена до Phase 6 (реализована в Phase 7 как derived representation, не memory)

---

## 2. Ключевые выводы экспериментов

1. **Essence — entry point, не память.** Compression 51×, сохраняет Topic/Decision/Negation/Causality. Не сохраняет Time (0%), State (17%), Scope (33%).
2. **Claims — основа relationship discovery.** 48% recall, 5/7 C1–C7. Требуют temporal_state, lifecycle_state, support_state, scope как поля.
3. **Multi-hop paths — основа context reconstruction.** 65% recall, 6/7 C1–C7.
4. **Нет универсального представления.** Разные запросы требуют разных уровней: Essence для entry, Claims+Multi-hop для context, Original для verification.
5. **Многослойная retrieval architecture:** Essence → entry points; Claims+Multi-hop → context; Original → verification.

---

## 3. Что не сделано

| Пункт | Фаза | Причина |
|---|---|---|
| Semantic compression через LLM | Phase 5 (real) | Валидация выполнена программно (5/5). Essence-LLM — адаптер за портом, будущее расширение. |
| Acceptance test метрики | Phase 4 | Отложено по решению пользователя. |
| Support State вычисление | Phase 6 | Отложено по решению пользователя. |
| Distributed (реальная синхронизация) | Wave 3 | Есть только journal-фундамент: pull по sequence, idempotent apply. Нет конфликт-резолюции и push.
| Postgres: полный набор репозиториев | Wave 3 | Сейчас foundation (Object + schema + executor). Остальные repository по аналогии. |
| Postgres migrations | Wave 3 | SQLite-схема не переносится автоматически; нужен SQL runner поверх `schema.sql`.

---

## 4. Следующие шаги

Рекомендуемый порядок:

1. **Wave 3 — Postgres completion.** Остальные репозитории (Source*, Claim, Relationship, Context*, Gap, Evidence, Provenance) по образцу Object; SQL migrations runner; peer-тест с SQLite-поведением.
2. **Wave 3 — Distributed v1.** Pull-loop между инстансами по `/replication/events?since=`, дедупликация, journal compaction, опционально push-уведомления.
3. **Wave 3 — Agent filtering v2.** Фильтрация по агентским правам поверх tenant+sensitivity (Политики-как-код, тесты).
4. **Cleanup старого ядра.** После полного перевода CLI/bridge на новые порты — удалить `packages/core`.

---

## 5. Коммит-граница (актуализация)

Основные репозитории формируются волнами. Актуальная точка:

```
packages/memory-core/       # domain, ports, adapters (inmemory, sqlite, postgres-foundation, ollama, openrouter, ingestion)
packages/memory-core/tests  # 140 passing (+1 integration skipped без DATABASE_URL)
docs/semantic-model/        # артефакты Phase 1–6 + STATUS snapshot (Wave 2)
```

Старое ядро (`packages/core/`) не изменено.
