# RETINEO Memory Core — Repository Structure

> This file is the single source of truth for codebase navigation.
>
> **Rules for this file**
>
> - Every PR or session that creates a new file or changes a public API must update `structure.md` in the same commit.
> - Before writing any new function, check `structure.md` for existing implementations. If a similar export already exists, reuse it via the documented import path. Do not create files with overlapping responsibility.
> - New files: add row to the relevant directory table with one-line description.
> - New exports: update the directory's `index.ts` barrel export.
> - New features: add entry to Functional Cross-Reference Index.
> - Planned files stay marked with `(planned)` until merged.

---

## Top-Level Layout

```
retineo/
├── packages/memory-core/   # Persistent epistemic memory core (clean rewrite per HANDOFF Phase 7)
│   ├── src/
│   ├── domain/         # Typed entities, value objects, IDs (17 entities, M1–M20 invariants)
│   ├── ports/          # Repository/Journal/Transaction/Identity/Decision/Policy/Representation/Segment/Extraction/Embedding interfaces
│   ├── adapters/       # InMemory + SQLite adapters, ingestion, extraction models, embedding models
│   ├── core/           # MemoryCore service (30+ operations, atomic mutations, journal) + QueryEngine
│   ├── api/            # HTTP server (Fastify, 13 endpoints) + MCP server (9 tools)
│   ├── bin/            # memory-core CLI (serve, ingest, journal, extract, query, mcp)
│   ├── experiments/    # Programmatic validation of Phase 4–5 (5/5 passing)
│   └── tests/          # 65 deterministic tests, no AI/network
├── docs/                # Developer documentation
│   ├── semantic-model/  # Phase 1–6 experiment artifacts + STATUS + ROADMAP-DETAIL + WORKING-CONVENTIONS
│   ├── ...              # Legacy docs (to be updated for memory-core)
├── docs/                # Developer documentation
│   ├── README.md        # Documentation index
│   ├── INSTALL.md       # Installation guide (npm, binary, source)
│   ├── DISTRIBUTION.md  # Distribution guide: npm vs binary vs source
│   ├── GETTING_STARTED.md # First-run tutorial
│   ├── CONTRIBUTING.md  # Contributor guide
│   ├── ARCHITECTURE.md  # High-level system overview
│   ├── ADAPTER_GUIDE.md # Third-party adapter developer guide
│   ├── LLM_PROVIDERS.md # LLM provider interface & factory guide
│   ├── SEARCH.md        # Search configuration & retrieval pipeline guide
│   ├── MULTILINGUAL.md  # Multilingual support & language pack guide
│   ├── LOGGING.md       # Structured logging configuration & events
│   ├── OPERATIONS.md    # Graceful shutdown, health checks, monitoring
│   ├── API.md           # HTTP Bridge API reference
│   ├── CLI.md           # CLI command reference
│   ├── HEALTH.md        # Health check & readiness probe guide
│   ├── MCP.md           # MCP server tool reference
│   ├── PERFORMANCE.md   # Performance tuning & benchmarks
│   ├── SECURITY.md      # Security model & secrets management
│   ├── TROUBLESHOOTING.md # Common issues & fixes
│   ├── CHANGELOG.md     # Version history
│   └── CAPABILITIES_AUDIT.md # Full capabilities inventory & gap analysis
│   ├── semantic-model/    # NEW: Phase 1–6 experiment artifacts + Phase 4–5 experiments
│   │   ├── HANDOFF_Q.md                            # Concrete Semantic Model v0.1 (doc A)
│   │   ├── RETINEO-MEMORY-CORE-DOMAIN-SPEC-v0.1.md # Concrete Semantic Model v0.1 (doc B)
│   │   ├── RETINEO-MEMORY-CORE-TECHNICAL-SPEC-v0.2.md # Concrete Semantic Model v0.1 (doc C)
│   │   ├── phase4-retrieval-experiment.md           # Phase 4: chunk vs essence vs knowledge vs context retrieval
│   │   ├── phase5-compression-experiment.md         # Phase 5: compression ratio vs semantic/relationship recall
│   │   └── phase6-domain-model.md                   # Phase 6: minimal domain model definition
├── .github/
│   ├── workflows/
│   │   ├── ci.yml       # CI: test on PR/push (Node 20, 22, pnpm)
│   │   └── release.yml  # CD: publish npm + build binaries + GitHub Release
│   └── release.yml      # Release notes category configuration
├── CHANGELOG.md         # Version history
├── structure.md         # This file
├── package.json         # @retineo/memory-core. Dependencies: better-sqlite3, fastify, @modelcontextprotocol/sdk.
├── eslint.config.mjs    # Flat ESLint config: @eslint/js + typescript-eslint + globals
├── tsconfig.json
└── README.md
```

---

## Directory Reference

### `packages/memory-core/src/domain/` — Domain Entities & Value Objects

| File               | Exports                                                                                          | Description                                        |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `ids.ts`           | `SourceId`, `EvidenceId`, `ObjectId`, `ClaimId`, `RelationshipId`, `ContextId`, etc. + `createId` | Typed ID aliases with prefixes (obj:, claim:, ev:). |
| `value-objects.ts` | `TemporalState`, `SupportState`, `ScopeQualifier`, lifecycle enums, `PredicateType`, `RelationType`, `SemanticClass` | Value objects. Temporal, support, scope — устраняют потери Phase 5. |
| `entities.ts`      | `Source`, `SourceItem`, `SourceVersion`, `Evidence`, `Object`, `Claim`, `Relationship`, `Context`, `ContextMembership`, `KnowledgeGap`, `Provenance`, `Candidate`, `Decision`, `Policy`, `SemanticRepresentation`, `JournalEvent`, `Segment` | 17 typed entities. Claim — ключевая сущность. |

### `packages/memory-core/src/ports/` — Interfaces

| File               | Exports                                                                                            | Description                                |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `repositories.ts`  | `ObjectRepository`, `ClaimRepository`, `RelationshipRepository`, `ContextRepository`, `MembershipRepository`, `GapRepository`, `EvidenceRepository`, `ProvenanceRepository`, `SourceRepository`, `SourceItemRepository`, `SourceVersionRepository`, `TransactionPort`, `IdentityResolver` | 11 repository interfaces + transaction + identity |
| `journal.ts`       | `Journal`                                                                                           | Atomic journal append + all() + sequence() |
| `lifecycle.ts`     | `CandidateRepository`, `DecisionRepository`, `PolicyRepository`, `DecisionModel`, `PolicyModel`    | Candidate → Decision → Policy pipeline     |
| `representation.ts`| `RepresentationRepository`, `RepresentationModel`                                                  | SemanticRepresentation (summary/essence/embedding) |
| `segment.ts`       | `SegmentRepository`, `SegmentSecurityModel`                                                        | Portable memory segments + hash/signature  |
| `extraction.ts`    | `ExtractionModel`, `ExtractionResult`, `ExtractedClaim`, `ExtractedRelationship`                   | Evidence → candidates extraction           |
| `embedding.ts`     | `EmbeddingModel`, `EmbeddingVector`                                                                | Embedding + cosine similarity (replaceable)|

### `packages/memory-core/src/adapters/` — Implementations

| Directory   | Contents                                                                                                   | Description                                |
| ----------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `inmemory/` | Все repository implementations, `InMemoryJournal`, `InMemoryTransaction`, `InMemoryIdentityResolver`, `DeterministicDecisionModel`, `PermissivePolicyModel`, `TrivialRepresentationModel`, `RegexExtractionModel`, `HashEmbeddingModel`, `TrivialSegmentSecurityModel` | Reference adapter. Детерминированный, тестовый. |
| `sqlite/`   | SQLite версии всех репозиториев, `SqliteDatabase`, `SqliteJournal`, `SqliteTransaction`, `SqliteIdentityResolver`, `schema.sql` | Persistent adapter (Stage 2). WAL mode. |
| `ingestion/`| `FilesystemSourceAdapter`                                                                                  | Source → SourceItem → SourceVersion → Evidence (Stage 3). |

### `packages/memory-core/src/core/` — Domain Service

| File              | Exports                                                                 | Description                                |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| `memory-core.ts`  | `MemoryCore`, `MemoryCoreDeps`                                          | 30+ операций: objects, claims, relationships, contexts, membership, gaps, evidence, provenance, candidate/decision/policy, representations, merge, journal, segments (export/import), extract, ingestDirectoryAsync |
| `query-engine.ts` | `QueryEngine`, `EntryPointsResult`, `KnowledgeQueryResult`, `ContextReconstructionResult` | findEntryPoints (essence matching), knowledgeQuery (claims/relationships), reconstructContext (multi-hop) |

### `packages/memory-core/src/api/` — External Interfaces

| File            | Exports                                        | Description                                |
| --------------- | ----------------------------------------------- | ------------------------------------------ |
| `http-server.ts`| `createHttpServer`, `startHttpServer`          | Fastify, 13 endpoints (health, objects, claims, relationships, contexts, query, segments, journal) |
| `mcp-server.ts` | `MemoryCoreMCPServer`, `MCPServerOptions`      | MCP stdio, 9 tools                          |

### `packages/memory-core/bin/` — CLI

| File              | Commands                                   | Description                                |
| ----------------- | ------------------------------------------- | ------------------------------------------ |
| `memory-core.js`  | serve, ingest, journal, extract, query, mcp | SQLite default db, HTTP port 7900          |

### `packages/memory-core/experiments/` — Validation

| File                        | Description                                                | Result     |
| --------------------------- | ---------------------------------------------------------- | ---------- |
| `validate-phase4-5.ts`      | Программная валидация Phase 4–5 (5 тестов, HashEmbeddingModel) | 5/5 pass   |

### `packages/memory-core/tests/` — Tests

| File                  | Description                                   | Count  |
| --------------------- | --------------------------------------------- | ------ |
| `memory-core.test.ts` | 16-step milestone + M1–M20 invariants + pipeline + HTTP + MCP + SQLite persistence | 65     |

## Functional Cross-Reference Index

> Lookup: "I want to do X" → start here.

### Memory Core (new package — persistent epistemic memory)

| Task                                                    | Primary Module                                 | Import Path                                         | Related                                                          |
| ------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| **Build typed domain entity**                            | `domain/entities.ts`                            | `packages/memory-core/src/domain/entities.ts`       | `ids.ts`, `value-objects.ts`, 17 typed entities                  |
| **Create memory objects/claims/relationships atomically**| `MemoryCore`                                    | `packages/memory-core/src/core/memory-core.ts`      | 25 operations, every mutation journaled                          |
| **Propose candidate → decide → apply policy**           | `MemoryCore.proposeCandidate/decide/applyPolicy`| `packages/memory-core/src/core/memory-core.ts`      | `DecisionModel`, `PolicyModel` — replaceable providers           |
| **Generate semantic representation (summary/essence)**  | `MemoryCore.createSemanticRepresentation`       | `packages/memory-core/src/core/memory-core.ts`      | `RepresentationModel` port, rebuildable, not memory              |
| **Traverse relationships (multi-hop context)**          | `MemoryCore.traverseRelationships`              | `packages/memory-core/src/core/memory-core.ts`      | Depth limit, skips superseded, identity-aware                    |
| **Export/verify portable memory segment**               | `MemoryCore.exportSegment/verifySegment`        | `packages/memory-core/src/core/memory-core.ts`      | `SegmentSecurityModel`, hash + signature                         |
| **Get agent context package**                            | `MemoryCore.getAgentContext`                    | `packages/memory-core/src/core/memory-core.ts`      | objects/claims/relationships/evidence/knownGaps                  |
| **Merge objects preserving history**                    | `MemoryCore.mergeObjects`                       | `packages/memory-core/src/core/memory-core.ts`      | Tombstone + redirect, M5 invariant                               |
| **Resolve identity redirects**                          | `InMemoryIdentityResolver`                      | `packages/memory-core/src/adapters/inmemory/identity-resolver.ts` | Circular redirect detection                        |
| **Run deterministic in-memory core**                    | `InMemory*` adapters                            | `packages/memory-core/src/adapters/inmemory/`       | Reference adapter, test fixture                                  |
| **Verify memory invariants M1–M20**                     | `packages/memory-core/tests/`                   | `packages/memory-core/tests/memory-core.test.ts`    | 27 tests, no AI/DB/network                                       |

| Task                                                    | Primary Module                                 | Import Path                                         | Related                                                          |
| ------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| **Ingest a file and store normalized content**          | `CASStorage` + `NodeBuilder`                   | `src/storage/cas.ts`, `src/storage/node-builder.ts` | `Registry.insertSource`, `Registry.insertSegment`                |
| **Register a new source and link its root hash**        | `Registry`                                     | `src/storage/registry.ts`                           | `SourceRecord`, `NodeBuilder.buildRoot`                          |
| **Create child segments from adapter output**           | `NodeBuilder`                                  | `src/storage/node-builder.ts`                       | `SegmentRef`, `NormalizedContent`                                |
| **Read or write an immutable artifact by hash**         | `CASStorage`                                   | `src/storage/cas.ts`                                | `computeHash`, `getObjectPath`                                   |
| **Run background compilation jobs reliably**            | `Registry` (jobs)                              | `src/storage/registry.ts`                           | `acquireLease`, `heartbeatJob`, `releaseExpiredLeases`           |
| **Recover from a crashed worker mid-job**               | `Registry`                                     | `src/storage/registry.ts`                           | `releaseExpiredLeases` → re-acquire                              |
| **Load or save user configuration**                     | `ConfigManager`                                | `src/storage/config.ts`                             | `RetineoConfig`, `FileConfigManager`                                |
| **Validate runtime data against domain types**          | `schemas`                                      | `src/domain/schemas.ts`                             | `zod` schemas for every domain type                              |
| **Spawn an adapter process and talk JSON-RPC**          | `LineDelimitedJSONTransport`                   | `src/adapters/transport.ts`                         | `AdapterTransport`, `JSONRPCRequest`, `JSONRPCResponse`          |
| **Manage adapter lifecycle (spawn, init, kill)**        | `DefaultAdapterProcessRunner`                  | `src/adapters/runner.ts`                            | `AdapterProcessRunner`, `InitializeParams`                       |
| **Load and resolve built-in adapters**                  | `DefaultAdapterManager`                        | `src/adapters/manager.ts`                           | `AdapterCapabilities`, `NormalizedContentSchema`, `sniffTextFile` fallback for extension-less files |
| **Ingest a file end-to-end (adapter → CAS → registry)** | `DefaultIngestionService` + `FileSystemSourceAdapter` | `src/services/ingestion-service.ts`, `src/adapters/filesystem-adapter.ts` | `CASStorage`, `Registry`, `NodeBuilder`, `AdapterManager`. `ingestBatch` recurses into directories. |
| **Add a new document source (S3, API, etc.)**           | `SourceAdapter` + `AdapterRegistry`            | `src/adapters/source-adapter.ts`                    | Implement `sync()`, `fetch()`, optional `delete()`; register with `DefaultIngestionService.registerAdapter()`. |
| **Re-sync an existing source after wipe/rebuild**       | `DefaultIngestionService.syncSource()`         | `src/services/ingestion-service.ts`                 | Skips unchanged etags only when `contentHash` still exists in CAS; re-ingests if CAS was wiped. |
| **Clear Registry state during rebuild**                 | `SQLiteRegistry.clearSources/clearJobs/clearOrphans` | `src/storage/registry.ts`                     | `rebuild --force` captures source IDs first, then clears sources/jobs/orphans before re-sync. |
| **Discover mock multimodal adapters**                   | `MockAdapterRegistry`                          | `src/adapters/mock-registry.ts`                     | `MOCK_ADAPTERS`, `MockAdapterInfo`                               |
| **Write a third-party adapter**                         | `ADAPTER_GUIDE.md`                             | `docs/ADAPTER_GUIDE.md`                             | `protocol.ts`, `types.ts`, `schemas.ts`                          |
| **Add structured logging**                              | `createLogger`                                 | `src/utils/logger.ts`                               | `Logger`, `LogMeta`, `getGlobalLogger`                           |
| **Write logs to console + file simultaneously**         | `DualLogger`                                   | `src/utils/logger.ts`                               | `LoggerConfig` with `console`, `file`, `pretty` flags. Console = stderr (pretty or JSON), file = JSON. Console works even if file fails. |

| **Configure logging via config.yaml**                    | `logging` section in `RetineoConfig`              | `src/storage/config.ts`                             | `LoggingConfig`: level, console, file, filePath, pretty. |
| **Implement graceful shutdown**                         | `DefaultShutdownManager`                       | `src/utils/shutdown.ts`                             | `ShutdownHandler`, `installSignalHandlers`                       |
| **Add a new adapter protocol method**                   | `protocol`                                     | `src/adapters/protocol.ts`                          | `AdapterMethod`, `JSONRPCRequest`                                |
| **Implement a custom storage backend**                  | `CASStorage` interface                         | `src/storage/cas.ts`                                | Implement `write`, `read`, `exists`, `writeObject`, `readObject` |
| **Track orphaned objects for later GC**                 | `Registry` (orphans)                           | `src/storage/registry.ts`                           | `insertOrphan`, `recoverOrphan`, `purgeOrphansOlderThan`         |
| **Build a search index over compiled nodes**            | `DefaultL3Generator` + `loadOrBuildHNSW`       | `src/layers/l3-generator.ts`, `src/embeddings/hnsw-index.ts` | Reads L0 body + L1 chunks, batch embeds, writes `embeddings.jsonl`/`bm25.json`/`hnsw.manifest.json`, and adds vectors to `hnsw.bin`. |
| **Generate vector embeddings for a node**               | `EmbeddingProvider`                            | `src/llm/provider.ts`                               | `DefaultL3Generator`, `MockLLMProvider`                          |
| **Load embedding records without re-reading the file**  | `loadEmbeddingRecords` / `invalidateEmbeddingRecords` | `src/embeddings/embedding-records.ts`        | Cached JSONL loader keyed by mtime/size; invalidated by `DefaultL3Generator` after writes. |
| **Use HNSW for fast approximate nearest neighbors**     | `createHNSWIndex`                              | `src/embeddings/hnsw-index.ts`                      | `loadOrBuildHNSW`, `BruteForceHNSW`; `has(hash)` deduplicates vectors before add. |
| **Store embeddings in Parquet/JSONL**                   | `createEmbeddingStore`                         | `src/embeddings/parquet-store.ts`                   | `JSONLEmbeddingStore`, `EmbeddingRecord`                         |
| **Batch embed multiple texts efficiently**              | `DefaultL3Generator.batchEmbed`                | `src/layers/l3-generator.ts`                        | `BatchEmbeddingConfig`                                           |
| **Cache search results and embeddings**                 | `SimpleLRUCache`                               | `src/utils/cache.ts`                                | `DefaultRetrievalService` embedding/L2/search caches             |
| **Protect LLM calls with circuit breaker**              | `DefaultCircuitBreaker`                        | `src/llm/circuit-breaker.ts`                        | `DefaultLLMProviderFactory` wrapper, fallback                    |
| **Encrypt and retrieve API secrets**                    | `FileSecretsManager`                           | `src/storage/secrets.ts`                            | `resolveSecret`, `resolveConfigValue`                            |
| **Add health/readiness probes**                         | `DefaultHealthService`                         | `src/bridge/health.ts`                              | `registerHealthRoutes`, `/v1/health`, `/v1/ready`                |
| **Analyze memory health of a collection**               | `DefaultHealthAnalyzer`                        | `src/health/health-analyzer.ts`                     | `generateFindings`, `buildReport`, L2 degradation diagnostics, process-lifetime report cache, `retineo health` |
| **Run a single health metric**                          | Metric classes in `src/health/metrics/`        | `src/health/metrics/*.ts`                           | `MetricResult`, `HealthAnalyzerDeps`                             |
| **Generate concrete health findings from metrics**      | `generateFindings`                             | `src/health/findings-engine.ts`                     | `Finding` references `{ contentHash, sourcePath? }`.             |
| **Build the final health report JSON**                  | `buildReport`                                  | `src/health/report-builder.ts`                      | `HealthReport`, grouped recommendations, `AdvancedMetricHint`    |
| **Run health analysis from CLI**                        | `CLICommands.health`                           | `src/cli/commands.ts`                               | `retineo health <path>`; sync log on `stderr`, JSON on `stdout`; exit code `1` if `score < 50`. |
| **Run health analysis from HTTP API**                   | Bridge health handlers                         | `src/bridge/handlers.ts`                            | `POST /v1/health`, `GET /v1/health/:jobId`, `GET /v1/report/:jobId` |
| **Export operational metrics**                          | `DefaultMetricsService`                        | `src/bridge/metrics.ts`                             | `formatPrometheus`, `/v1/metrics/prometheus`                     |
| **Handle errors consistently across HTTP/CLI**          | `sendErrorReply`, `formatCLIError`             | `src/utils/error-handler.ts`                        | `BaseRetineoError`, `isRetineoError`                                   |
| **Run the L1→L2→L3 compilation pipeline**               | `DefaultCompilationPipeline`                   | `src/layers/pipeline.ts`                            | `QueueWorker`, `Registry`                                        |
| **Process background jobs with lease recovery**         | `DefaultQueueWorker`                           | `src/layers/worker.ts`                              | `Registry.acquireLease`, `heartbeatJob`                          |
| **Load LLM providers from config**                      | `DefaultLLMProviderFactory`                    | `src/llm/factory.ts`                                | `ProviderConfig`, `OllamaProvider`, `OpenAICompatibleProvider`   |
| **Write a third-party LLM provider**                    | `LLM_PROVIDERS.md`                             | `docs/LLM_PROVIDERS.md`                             | `LLMProvider`, `EmbeddingProvider`                               |
| **Analyze a query (language, intent, entities)**        | `DefaultQueryAnalyzer`                         | `src/search/query-analyzer.ts`                      | `LanguageDetector`, `LanguagePackRegistry`                       |
| **Override query intent from the CLI**                  | `createCLI` with `-i/--intent`                 | `src/cli/index.ts`, `src/cli/commands.ts`           | `AnalyzeOptions`, `QueryIntent`                                  |
| **Add language-specific intent detection rules**        | `LanguagePack.intentPatterns`                  | `src/i18n/language-pack.ts`, `src/i18n/packs/*.ts`  | `DefaultQueryAnalyzer.detectIntentWithPack`                      |
| **Search the index (semantic/keyword/hybrid)**          | `DefaultRetrievalService`                      | `src/search/retrieval-service.ts`                   | Loads `hnsw.bin` at startup; uses `EmbeddingProvider`, `CASStorage`, `loadOrBuildHNSW`. Marks orphan results as ghosts. |
| **Assemble context for LLM consumption**                | `DefaultContextAssembler`                      | `src/search/context-assembler.ts`                   | `CandidateNode`, `SearchConfig`                                  |
| **Detect language of a query**                          | `createDetector`                               | `src/i18n/detector.ts`                              | `FrancDetector`, `HeuristicDetector`, `CLD3Detector`             |
| **Load or register a language pack**                    | `DefaultLanguagePackRegistry`                  | `src/i18n/registry.ts`                              | `LanguagePack`, `enPack`, `ruPack`, `zhPack`                     |
| **Add a new language to RETINEO**                          | `LanguagePack` + `DefaultLanguagePackRegistry` | `src/i18n/packs/{code}.ts`                          | `docs/MULTILINGUAL.md`                                           |
| **Translate query entities for cross-lingual keyword search** | `LLMQueryTranslator` / `NoOpQueryTranslator`   | `src/search/query-translator.ts`                    | `DefaultQueryAnalyzer`, `SearchConfig.crossLingual`              |
| **Search across languages via embeddings + keywords**   | `DefaultRetrievalService`                      | `src/search/retrieval-service.ts`                   | `conceptsEn` in `L2Artifact`, BM25 indexing, language-aware rerank |
| **Find semantically similar documents by content hash** | `SimilarityService` / `createSimilarityService` | `src/search/similarity-service.ts`                  | Reuses shared HNSW index and `chunkToSource` from `DefaultRetrievalService`; aggregates chunk scores to document score. `mode: 'exact'` skips HNSW build and uses brute-force cosine. Uses cached embedding records. |
| **Get similar documents over HTTP**                     | `POST /v1/similar` handler                     | `src/bridge/handlers.ts`                            | `SimilarRequest`/`SimilarResponse` in `src/bridge/types.ts`; route in `src/bridge/routes.ts`. |
| **Get similar documents via MCP**                       | `retineo_find_similar` tool                    | `src/mcp/handlers.ts`                               | Tool schema in `src/mcp/tools.ts`; input `hash`, optional `topK`. |
| **Get similar documents via CLI**                       | `retineo similar <hash>`                       | `src/cli/commands.ts`, `src/cli/index.ts`           | `--top-k`, `--threshold`, `--json`; empty index message advises `retineo ingest first`. |
| **Embed Core as a programmatic library**                | `createCore`                                   | `src/runtime/core-handle.ts`                        | Wires ingestion, health, similarity, registry, CAS. Auto-drains L1→L2→L3 jobs after `ingest()` with watchdog timeout and progress logs (`drainJobs processed N/M, remaining X`). `close()` releases SQLite + worker resources. |
| **Regenerate L1 artifacts for an existing collection**  | `CLICommands.compile` with `--rebuild-l1`      | `src/cli/commands.ts`                               | Deletes cached `L1.md` / `L1.index.json` and re-queues `GENERATE_L1`→`L2`→`L3` jobs. |
| **Derive L1 title from content/filename**               | `DefaultL1Generator.generate`                  | `src/layers/l1-generator.ts`                        | Uses first H1, first non-empty line, or basename of `sourceRef.uri`; avoids `Untitled Document`. |
| **Segment plain-text logs into L1 sections**            | `DefaultL1Generator` heuristic                   | `src/layers/l1-generator.ts`                        | Splits heading-less text by ISO dates, `ECHO … COMPLETE`, `STATUS:` and similar markers. |
| **Regenerate L2 artifacts for an existing collection**  | `CLICommands.compile` with `--rebuild-l2`      | `src/cli/commands.ts`                               | Deletes cached `L2.json` and re-queues `GENERATE_L2` jobs.       |
| **Re-run failed pipeline jobs (L1/L2/L3)**              | `CLICommands.compile` (no `--rebuild` flags)   | `src/cli/commands.ts`, `src/storage/registry.ts`    | Re-queues jobs with terminal `FAILED`/`DEAD` status so documents are never lost after repeated L2 failures. |
| **Get L2 readiness status**                             | `Registry.getL2Status`                         | `src/storage/registry.ts`                           | `{ ready, pending, failed, total }` — distinct-node counts from the `GENERATE_L2` job table. Exposed in health reports as `l2Status`/`l2FailedNodes`/`l2Pending`. |
| **Rebuild the global L3 index from existing L2**        | `CLICommands.compile` with `--rebuild-l3`      | `src/cli/commands.ts`                               | Deletes the global `index/` directory and re-queues `GENERATE_L3` for all nodes with L2. |
| **Fully rebuild the collection from L0**                | `CLICommands.rebuild`                          | `src/cli/commands.ts`                               | `--force` deletes `objects/` + `index/` + clears Registry sources/jobs/orphans, then re-syncs filesystem adapters. |
| **Store future semantic links on a node**               | `SemanticLink` type / `semanticLinks` field    | `src/domain/types.ts`, `src/storage/cas.ts`         | Optional array persisted in `node.json`; core does not generate links. |
| **Configure search behavior**                           | `FileConfigManager`                            | `src/storage/config.ts`                             | `SearchConfig`, `I18nConfig`                                     |
| **Expose RETINEO over HTTP/WebSocket**                     | `FastifyBridgeServer`                          | `src/bridge/server.ts`                              | `bridge/routes.ts`, `bridge/sse.ts`                              |
| **Serve as an MCP server**                              | `RetineoMCPServer`                                | `src/mcp/server.ts`                                 | `mcp/tools.ts`, `mcp/handlers.ts`                                |
| **Run CLI commands**                                    | `CLICommands` + `createCLI`                    | `src/cli/commands.ts`, `src/cli/index.ts`           | `commander`, `bridge/types.ts`                                   |
| **Manage encrypted API keys via CLI**                   | `CLICommands.keySet/get/delete/list`           | `src/cli/commands.ts`                               | `FileSecretsManager`, `retineo key`                                 |
| **Add a new LLM provider type to factory**              | `DefaultLLMProviderFactory`                    | `src/llm/factory.ts`                                | Extend `createProvider` switch                                   |
| **Run the first-time setup wizard**                     | `CLICommands.init`                             | `src/cli/commands.ts`                               | `probeOllama`, `prompt.ts` (`ask`/`choose`/`confirm`), `FileConfigManager.initializeDataDir` |
| **Run RETINEO with multi-provider LLM/embedding config**   | `DefaultLLMProviderFactory.loadFromConfig`     | `src/llm/factory.ts`                                | `RetineoConfig.llm.providers[]`, `RetineoConfig.embedding.providers[]` |
| **Spawn/detach the worker as a background process**     | `CLICommands.workerStart`                      | `src/cli/commands.ts`                               | `process-manager.ts` (PID file), `worker-script.ts` (fork target) |
| **Spawn/detach the bridge as a background process**     | `CLICommands.bridgeStart`                      | `src/cli/commands.ts`                               | `process-manager.ts`, `FastifyBridgeServer`                      |
| **Run worker + bridge in a single process (daemon)**    | `runDaemon`                                    | `src/cli/daemon.ts`                                 | `DefaultQueueWorker`, `FastifyBridgeServer`, `DefaultShutdownManager` |
| **Block until queued jobs for an ingested file finish** | `CLICommands.ingest` with `watch:true`         | `src/cli/commands.ts`                               | `Registry.getJobsBySource`, inline `startWorkerServices`. `ingestBatch` recurses into directories, skips non-files. |
| **Read/write PID files and tail logs**                  | `process-manager.ts`                           | `src/cli/process-manager.ts`                        | `isPidAlive`, `stopProcess`, `tailLog`, `streamLog`              |
| **Prompt the user interactively (readline, no deps)**   | `ask`, `choose`, `confirm`                     | `src/cli/prompt.ts`                                 | Node `readline` (stdlib)                                        |

---

## Maintenance Rules

1. **Immutability**: Objects under `objects/{hash}/` are immutable. Never modify after creation. New version = new hash.
2. **Schema changes**: If `src/storage/schema.sql` changes, document migration strategy in the PR and update `Registry` row helpers if column names shift.
3. **No overlapping responsibility**: Before adding a new file, check the Functional Cross-Reference Index. If the capability exists, extend the existing module rather than creating a parallel one.
4. **Barrel exports**: Every `src/{dir}/` must have an `index.ts` that re-exports public symbols. Tests and consumers import from the barrel, never deep-import.
5. **Planned markers**: Directories or files not yet implemented must be marked `(planned)` in this file. Remove the marker only when code is merged and tested.
6. **Test parity**: Every public export in `src/storage/` (and future layers) must have corresponding tests in `tests/{dir}/`. Update test tables when adding new test files.

---

## Service Lifecycle

RETINEO Core services are long-lived background processes. Each is tracked by a PID file in `~/.retineo/`:

| Service | PID file | Log file | Spawn script | Start command |
|---------|----------|----------|--------------|---------------|
| Worker  | `~/.retineo/worker.pid`  | `~/.retineo/logs/worker.log`  | `dist/cli/worker-script.js` | `retineo worker start` |
| Bridge  | `~/.retineo/bridge.pid`  | `~/.retineo/logs/bridge.log`  | (spawned by daemon or via FastifyBridgeServer) | `retineo bridge start` |
| Daemon  | `~/.retineo/daemon.pid`  | `~/.retineo/logs/daemon.log`  | `dist/cli/daemon.js` | `retineo daemon start` |

**Lifecycle contract:**
- `start`: spawn detached child, write JSON `{ pid, startedAt, service, logFile }` to PID file, wait 1s and verify the PID is alive (else raise + log tail).
- `stop`: read PID, send `SIGTERM`, wait 5s for graceful exit, then `SIGKILL` if still alive. Remove PID file.
- `status`: report running/stopped, PID, uptime, last heartbeat, job counts (from `Registry.getJobCounts`).
- `logs`: `tail -n 50 <log>` (or `-f` to stream).

**Watch flag**: `retineo ingest file.md --watch` blocks the CLI until all jobs for the ingested node are `COMPLETED` (or any fails / timeout). If no worker/daemon is running, it starts an inline worker in the same process so the user gets end-to-end behaviour without a separate `worker start` step. This is the recommended one-shot flow for interactive use.

**Daemon vs separate services:** `retineo daemon start` runs worker + bridge in a single process under one PID. This is the recommended production layout. Use `retineo worker start` / `retineo bridge start` separately only when you need them on different machines or want independent restart cycles.
