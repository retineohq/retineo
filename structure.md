# ECHO Core — Repository Structure

> This file is the single source of truth for codebase navigation.
>
> **Rules for this file**
> - Every PR or session that creates a new file or changes a public API must update `structure.md` in the same commit.
> - Before writing any new function, check `structure.md` for existing implementations. If a similar export already exists, reuse it via the documented import path. Do not create files with overlapping responsibility.
> - New files: add row to the relevant directory table with one-line description.
> - New exports: update the directory's `index.ts` barrel export.
> - New features: add entry to Functional Cross-Reference Index.
> - Planned files stay marked with `(planned)` until merged.

---

## Top-Level Layout

```
echo-core/
├── packages/core/src/
│   ├── domain/          # Types, schemas, shared domain language
│   ├── adapters/        # Adapter IPC protocol
│   ├── storage/         # CAS, Registry, Config, NodeBuilder
│   ├── embeddings/      # (planned) Vector embedding generation & caching
│   ├── search/          # Query analysis, retrieval, context assembly
│   ├── llm/             # LLM provider abstraction, rate limiting, factory
│   ├── layers/          # L1/L2/L3 compilation pipelines, queue worker
│   ├── context/         # (planned) Context assembly, window management
│   ├── ghost/           # (planned) Orphan recovery, garbage collection
│   ├── bridge/          # (planned) HTTP/gRPC API, WebSocket streaming
│   ├── mcp/             # (planned) Model Context Protocol server
│   ├── i18n/            # Language packs, detection, cross-lingual search
│   └── utils/           # (planned) Shared helpers, hash utils, validation
├── packages/core/adapters/  # Built-in adapter scripts (CommonJS)
│   ├── text/                # Text adapter (.txt)
│   ├── markdown/            # Markdown adapter (.md)
│   ├── pdf/                 # PDF adapter (placeholder)
│   ├── audio-mock/          # Mock audio adapter (.mp3, .wav)
│   ├── video-mock/          # Mock video adapter (.mp4, .avi)
│   └── image-mock/          # Mock image adapter (.png, .jpg, .jpeg)
├── tests/
│   ├── storage/         # CAS, Registry, NodeBuilder tests
│   ├── adapters/        # Transport, Manager, Ingestion, Mock adapter tests
│   ├── llm/             # Provider factory, mock provider, rate limiter tests
│   ├── layers/          # L1/L2/L3 generators, pipeline, worker tests
│   ├── search/          # Query analyzer, retrieval service, context assembler, end-to-end
│   └── i18n/            # Language detector, pack registry tests
├── docs/                # Developer documentation
│   ├── README.md        # Documentation index
│   ├── ARCHITECTURE.md  # High-level system overview
│   ├── ADAPTER_GUIDE.md # Third-party adapter developer guide
│   ├── SEARCH.md        # Search configuration & retrieval pipeline guide
│   └── MULTILINGUAL.md  # Multilingual support & language pack guide
├── structure.md         # This file
├── package.json
├── tsconfig.json
└── README.md
```

---

## Directory Reference

### `src/domain/` — Domain Types & Runtime Validation

| File | Exports | Description |
|------|---------|-------------|
| `types.ts` | `Hash`, `SourceRef`, `SourceRecord`, `SegmentRecord`, `ContextNode`, `L0Artifact`, `L1Artifact`, `L2Artifact`, `BuildManifest`, `GeneratorInfo`, `JobRecord`, `JobStatus`, `NormalizedContent`, `SegmentRef`, `SearchOptions`, `RetrievalResult`, etc. | Core domain interfaces. Immutable. |
| `schemas.ts` | `HashSchema`, `BuildManifestSchema`, `JobRecordSchema`, `ContentMetaSchema`, `SegmentRefSchema`, etc. | Zod runtime validators for all domain types. |
| `index.ts` | Barrel export of `types.js` + `schemas.js` | Public domain API entrypoint. |

### `src/adapters/` — Adapter IPC Protocol

| File | Exports | Description |
|------|---------|-------------|
| `protocol.ts` | `JSONRPCRequest`, `JSONRPCResponse`, `JSONRPCError`, `AdapterErrorCodes`, `InitializeParams`, `InitializeResult`, `CapabilitiesResult`, `IngestParams`, `IngestResult`, `ShutdownParams`, `AdapterMethod`, `AdapterTransport` | JSON-RPC 2.0 protocol for adapter child processes. |
| `transport.ts` | `JSONRPCTransport`, `LineDelimitedJSONTransport` | LDJSON over stdin/stdout with timeout, error, exit handlers. |
| `runner.ts` | `AdapterProcessRunner`, `DefaultAdapterProcessRunner` | Spawns adapter, auto-initializes, graceful shutdown. |
| `manager.ts` | `AdapterManager`, `DefaultAdapterManager` | Loads built-in adapters, resolves by mimeType/extension, ingests. |
| `ingestion.ts` | `IngestionService`, `DefaultIngestionService` | Orchestrator: file → adapter → CAS → registry → ContextNode. |
| `mock-registry.ts` | `MockAdapterRegistry`, `MockAdapterInfo`, `MOCK_ADAPTERS` | Central registry for mock multimodal adapters (Phase 2.5). |
| `index.ts` | Barrel export of `protocol.js`, `transport.js`, `runner.js`, `manager.js`, `ingestion.js`, `mock-registry.js` | Public adapter API entrypoint. |

### `src/storage/` — Persistence Layer (Phase 1)

| File | Exports | Description |
|------|---------|-------------|
| `cas.ts` | `CASStorage`, `LocalCASStorage`, `NodeArtifacts`, `computeHash`, `getObjectPath` | Content-Addressable Storage: SHA-256 keyed object filesystem. |
| `registry.ts` | `Registry`, `SQLiteRegistry`, `OrphanRecord` | SQLite-backed registry: sources, segments, jobs (lease model), orphans. |
| `config.ts` | `ConfigManager`, `FileConfigManager`, `EchoConfig` | YAML config manager (`~/.echo/config.yaml`). |
| `node-builder.ts` | `NodeBuilder`, `DefaultNodeBuilder` | Builds `ContextNode` trees + `BuildManifest` from adapter output. |
| `schema.sql` | — | SQLite DDL: `sources`, `segments`, `jobs`, `orphaned_objects`, `encryption_keys`, `audit_logs`. |
| `index.ts` | Barrel export of `cas.js`, `registry.js`, `config.js`, `node-builder.js` | Public storage API entrypoint. |

### `src/embeddings/` — Vector Embeddings (planned)

| File | Exports | Description |
|------|---------|-------------|
| `index.ts` | `(planned)` | Barrel export placeholder. |

### `src/search/` — Retrieval & Ranking

| File | Exports | Description |
|------|---------|-------------|
| `query-analyzer.ts` | `QueryAnalyzer`, `DefaultQueryAnalyzer`, `AnalyzedQuery`, `QueryIntent`, `QuerySignal`, `SessionContext` | Language detection, intent classification, entity extraction, pronoun resolution. |
| `retrieval-service.ts` | `RetrievalService`, `DefaultRetrievalService`, `CandidateNode`, `RetrievalResult`, `Citation`, `SearchOptions` | L3 semantic/keyword/hybrid search, L2 rerank, L1/L0 cascade. |
| `context-assembler.ts` | `ContextAssembler`, `DefaultContextAssembler`, `AssembledContext`, `ContextSegment` | Token budget allocation, citation generation, drill-down segments. |
| `index.ts` | Barrel export of `query-analyzer.js`, `retrieval-service.js`, `context-assembler.js` | Public search API entrypoint. |

### `src/llm/` — LLM Provider Abstraction

| File | Exports | Description |
|------|---------|-------------|
| `provider.ts` | `LLMProvider`, `EmbeddingProvider`, `ProviderConfig`, `GenerateOptions`, `ProviderCapabilities` | Provider interfaces. |
| `factory.ts` | `LLMProviderFactory`, `EmbeddingProviderFactory`, `DefaultLLMProviderFactory`, `DefaultEmbeddingProviderFactory` | Config-driven provider loading with `${ENV_VAR}` resolution. |
| `rate-limiter.ts` | `RateLimiter`, `SemaphoreRateLimiter` | Per-provider concurrency semaphore. |
| `providers/ollama.ts` | `OllamaProvider` | LLM + Embedding via Ollama `/api/generate` and `/api/embed`. |
| `providers/openai-compatible.ts` | `OpenAICompatibleProvider` | LLM + Embedding via OpenAI-compatible `/chat/completions` and `/embeddings`. |
| `providers/mock.ts` | `MockLLMProvider` | Deterministic hash-based provider for tests. |
| `index.ts` | Barrel export of `provider.js`, `factory.js`, `rate-limiter.js`, `providers/*.js` | Public LLM API entrypoint. |

### `src/layers/` — Compilation Pipelines

| File | Exports | Description |
|------|---------|-------------|
| `l1-generator.ts` | `L1Generator`, `DefaultL1Generator`, `L1Result`, `L1Index`, `Section`, `Chunk` | Rule-based markdown structural parser. |
| `l2-generator.ts` | `L2Generator`, `DefaultL2Generator` | LLM-powered semantic extraction with Zod validation and retry. |
| `l3-generator.ts` | `L3Generator`, `DefaultL3Generator`, `L3Result`, `L3Metadata`, `bruteForceSearch` | Embedding indexer. MVP: `embeddings.jsonl` + brute-force cosine. |
| `pipeline.ts` | `CompilationPipeline`, `DefaultCompilationPipeline`, `CompilationPipelineDeps` | Orchestrates L1→L2→L3 via job queue. |
| `worker.ts` | `QueueWorker`, `DefaultQueueWorker`, `QueueWorkerOptions` | Lease-based job processor with heartbeat. |
| `index.ts` | Barrel export of `l1-generator.js`, `l2-generator.js`, `l3-generator.js`, `pipeline.js`, `worker.js` | Public layers API entrypoint. |

### `src/context/` — Context Assembly (planned)

| File | Exports | Description |
|------|---------|-------------|
| `index.ts` | `(planned)` | Barrel export placeholder. |

### `src/ghost/` — Orphan Recovery & GC (planned)

| File | Exports | Description |
|------|---------|-------------|
| `index.ts` | `(planned)` | Barrel export placeholder. |

### `src/bridge/` — External API (planned)

| File | Exports | Description |
|------|---------|-------------|
| `index.ts` | `(planned)` | Barrel export placeholder. |

### `src/mcp/` — Model Context Protocol (planned)

| File | Exports | Description |
|------|---------|-------------|
| `index.ts` | `(planned)` | Barrel export placeholder. |

### `src/i18n/` — Multilingual Support

| File | Exports | Description |
|------|---------|-------------|
| `language-pack.ts` | `LanguagePack` | Interface for per-language prompts and search tuning. |
| `detector.ts` | `LanguageDetector`, `HeuristicDetector`, `FrancDetector`, `CLD3Detector`, `createDetector` | Language detection with franc/cld3/heuristic providers. |
| `registry.ts` | `LanguagePackRegistry`, `DefaultLanguagePackRegistry` | Built-in pack registry (en, ru, zh) + custom pack registration. |
| `packs/en.ts` | `enPack` | English language pack with default prompts. |
| `packs/ru.ts` | `ruPack` | Russian language pack with Cyrillic script regex. |
| `packs/zh.ts` | `zhPack` | Chinese language pack with CJK script regex. |
| `index.ts` | Barrel export of `language-pack.js`, `detector.js`, `registry.js`, `packs/*.js` | Public i18n API entrypoint. |

### `src/utils/` — Shared Utilities (planned)

| File | Exports | Description |
|------|---------|-------------|
| `index.ts` | `(planned)` | Barrel export placeholder. |

### `tests/storage/` — Storage Layer Tests

| File | Tests | Description |
|------|-------|-------------|
| `cas.test.ts` | `computeHash`, `getObjectPath`, `LocalCASStorage` (write/read/exists/delete/writeObject/readObject) | CAS correctness, hash path resolution, artifact persistence. |
| `registry.test.ts` | Sources CRUD, Segments CRUD + FK cascade, Job lease model (acquire/heartbeat/complete/fail/release), Orphan lifecycle | SQLite registry integrity, lease crash recovery, orphan purge. |
| `node-builder.test.ts` | `buildRoot`, `buildSegments`, `createBuildManifest` | Node tree construction, placeholder generators, manifest validity. |

### `tests/adapters/` — Adapter IPC Tests

| File | Tests | Description |
|------|-------|-------------|
| `transport.test.ts` | send/receive, error response, timeout, process exit, onExit handler, auto-id, graceful close | LDJSON transport over child_process stdin/stdout. |
| `manager.test.ts` | loadBuiltIn, resolve by extension/mimeType, ingest text/md, capabilities | AdapterManager loads adapters, resolves files, validates output. |
| `ingestion.test.ts` | full pipeline (file → CAS → registry), idempotency, batch ingest, job queueing | IngestionService orchestrates adapter → CAS → registry → GENERATE_L1 job. |
| `audio-mock.test.ts` | load manifest, resolve .mp3/wav, ingest speech blocks, segments, timestamps, determinism | Mock audio adapter validation. |
| `video-mock.test.ts` | load manifest, resolve .mp4/avi, ingest frame + speech blocks, bbox, segments | Mock video adapter validation. |
| `image-mock.test.ts` | load manifest, resolve .png/.jpg, ingest ocr blocks, bbox, confidence, no segments | Mock image adapter validation. |
| `multimodal-pipeline.test.ts` | end-to-end: audio/video/image → CAS → registry → verify content.meta.json | Full pipeline with mock multimodal adapters. |

### `tests/llm/` — LLM Provider Tests

| File | Tests | Description |
|------|-------|-------------|
| `factory.test.ts` | Provider loading from config, `${ENV_VAR}` resolution, getDefault, list, register | Factory config parsing and provider registry. |
| `providers/mock.test.ts` | Deterministic generate, jsonMode, embed normalization, validate, capabilities | MockLLMProvider correctness. |
| `rate-limiter.test.ts` | Concurrency limits, queue behavior, release semantics | SemaphoreRateLimiter correctness. |

### `tests/layers/` — Compilation Pipeline Tests

| File | Tests | Description |
|------|-------|-------------|
| `l1-generator.test.ts` | Heading detection, section tree, chunking, code block preservation, frontmatter | DefaultL1Generator structural parsing. |
| `l2-generator.test.ts` | Prompt building, JSON validation, retry on invalid JSON/Zod failure, truncation | DefaultL2Generator LLM extraction. |
| `l3-generator.test.ts` | Embedding generation, jsonl/bm25/manifest writes, manifest increment, brute-force search | DefaultL3Generator indexing. |
| `pipeline.test.ts` | GENERATE_L1 → L2 enqueue, GENERATE_L2 → L3 enqueue, GENERATE_L3 manifest update, end-to-end | DefaultCompilationPipeline orchestration. |
| `worker.test.ts` | processNext, empty queue, crash recovery, retry on failure, start/stop lifecycle | DefaultQueueWorker lease model. |

### `tests/search/` — Search & Retrieval Tests

| File | Tests | Description |
|------|-------|-------------|
| `query-analyzer.test.ts` | Language detection (heuristic/franc), intent classification (rule/LLM), entity extraction, pronoun resolution, signal generation | DefaultQueryAnalyzer correctness. |
| `retrieval-service.test.ts` | L3 semantic search, keyword search, hybrid mode, threshold filtering, L2 rerank scoring, L1/L0 cascade, trace | DefaultRetrievalService correctness. |
| `context-assembler.test.ts` | Token budgets per intent, cascade modes, citation generation, drill-down children, language propagation | DefaultContextAssembler correctness. |
| `end-to-end.test.ts` | Full pipeline: Russian query → detect → search → rerank → assemble → citations in Russian | Cross-lingual end-to-end validation. |

### `tests/i18n/` — Multilingual Tests

| File | Tests | Description |
|------|-------|-------------|
| `detector.test.ts` | Heuristic script detection, franc fallback, cld3 fallback, createDetector factory | LanguageDetector implementations. |
| `packs.test.ts` | Pack loading, prompt resolution, search tuning values, script regex, custom pack registration | DefaultLanguagePackRegistry correctness. |

---

## Functional Cross-Reference Index

> Lookup: "I want to do X" → start here.

| Task | Primary Module | Import Path | Related |
|------|---------------|-------------|---------|
| **Ingest a file and store normalized content** | `CASStorage` + `NodeBuilder` | `src/storage/cas.ts`, `src/storage/node-builder.ts` | `Registry.insertSource`, `Registry.insertSegment` |
| **Register a new source and link its root hash** | `Registry` | `src/storage/registry.ts` | `SourceRecord`, `NodeBuilder.buildRoot` |
| **Create child segments from adapter output** | `NodeBuilder` | `src/storage/node-builder.ts` | `SegmentRef`, `NormalizedContent` |
| **Read or write an immutable artifact by hash** | `CASStorage` | `src/storage/cas.ts` | `computeHash`, `getObjectPath` |
| **Run background compilation jobs reliably** | `Registry` (jobs) | `src/storage/registry.ts` | `acquireLease`, `heartbeatJob`, `releaseExpiredLeases` |
| **Recover from a crashed worker mid-job** | `Registry` | `src/storage/registry.ts` | `releaseExpiredLeases` → re-acquire |
| **Load or save user configuration** | `ConfigManager` | `src/storage/config.ts` | `EchoConfig`, `FileConfigManager` |
| **Validate runtime data against domain types** | `schemas` | `src/domain/schemas.ts` | `zod` schemas for every domain type |
| **Spawn an adapter process and talk JSON-RPC** | `LineDelimitedJSONTransport` | `src/adapters/transport.ts` | `AdapterTransport`, `JSONRPCRequest`, `JSONRPCResponse` |
| **Manage adapter lifecycle (spawn, init, kill)** | `DefaultAdapterProcessRunner` | `src/adapters/runner.ts` | `AdapterProcessRunner`, `InitializeParams` |
| **Load and resolve built-in adapters** | `DefaultAdapterManager` | `src/adapters/manager.ts` | `AdapterCapabilities`, `NormalizedContentSchema` |
| **Ingest a file end-to-end (adapter → CAS → registry)** | `DefaultIngestionService` | `src/adapters/ingestion.ts` | `CASStorage`, `Registry`, `NodeBuilder`, `AdapterManager` |
| **Discover mock multimodal adapters** | `MockAdapterRegistry` | `src/adapters/mock-registry.ts` | `MOCK_ADAPTERS`, `MockAdapterInfo` |
| **Write a third-party adapter** | `ADAPTER_GUIDE.md` | `docs/ADAPTER_GUIDE.md` | `protocol.ts`, `types.ts`, `schemas.ts` |
| **Add a new adapter protocol method** | `protocol` | `src/adapters/protocol.ts` | `AdapterMethod`, `JSONRPCRequest` |
| **Implement a custom storage backend** | `CASStorage` interface | `src/storage/cas.ts` | Implement `write`, `read`, `exists`, `writeObject`, `readObject` |
| **Track orphaned objects for later GC** | `Registry` (orphans) | `src/storage/registry.ts` | `insertOrphan`, `recoverOrphan`, `purgeOrphansOlderThan` |
| **Build a search index over compiled nodes** | `DefaultL3Generator` + `bruteForceSearch` | `src/layers/l3-generator.ts` | `EmbeddingProvider`, `hnsw.manifest.json` |
| **Generate vector embeddings for a node** | `EmbeddingProvider` | `src/llm/provider.ts` | `DefaultL3Generator`, `MockLLMProvider` |
| **Run the L1→L2→L3 compilation pipeline** | `DefaultCompilationPipeline` | `src/layers/pipeline.ts` | `QueueWorker`, `Registry` |
| **Process background jobs with lease recovery** | `DefaultQueueWorker` | `src/layers/worker.ts` | `Registry.acquireLease`, `heartbeatJob` |
| **Load LLM providers from config** | `DefaultLLMProviderFactory` | `src/llm/factory.ts` | `ProviderConfig`, `OllamaProvider`, `OpenAICompatibleProvider` |
| **Write a third-party LLM provider** | `LLM_PROVIDERS.md` | `docs/LLM_PROVIDERS.md` | `LLMProvider`, `EmbeddingProvider` |
| **Analyze a query (language, intent, entities)** | `DefaultQueryAnalyzer` | `src/search/query-analyzer.ts` | `LanguageDetector`, `LanguagePackRegistry` |
| **Search the index (semantic/keyword/hybrid)** | `DefaultRetrievalService` | `src/search/retrieval-service.ts` | `EmbeddingProvider`, `CASStorage`, `bruteForceSearch` |
| **Assemble context for LLM consumption** | `DefaultContextAssembler` | `src/search/context-assembler.ts` | `CandidateNode`, `SearchConfig` |
| **Detect language of a query** | `createDetector` | `src/i18n/detector.ts` | `FrancDetector`, `HeuristicDetector`, `CLD3Detector` |
| **Load or register a language pack** | `DefaultLanguagePackRegistry` | `src/i18n/registry.ts` | `LanguagePack`, `enPack`, `ruPack`, `zhPack` |
| **Add a new language to ECHO** | `LanguagePack` + `DefaultLanguagePackRegistry` | `src/i18n/packs/{code}.ts` | `docs/MULTILINGUAL.md` |
| **Configure search behavior** | `FileConfigManager` | `src/storage/config.ts` | `SearchConfig`, `I18nConfig` |
| **Expose ECHO over HTTP/WebSocket** | `(planned)` `bridge/` | `src/bridge/` | `mcp/`, `context/` |
| **Serve as an MCP server** | `(planned)` `mcp/` | `src/mcp/` | `bridge/`, `search/` |
| **Add a new LLM provider type to factory** | `DefaultLLMProviderFactory` | `src/llm/factory.ts` | Extend `createProvider` switch |

---

## Maintenance Rules

1. **Immutability**: Objects under `objects/{hash}/` are immutable. Never modify after creation. New version = new hash.
2. **Schema changes**: If `src/storage/schema.sql` changes, document migration strategy in the PR and update `Registry` row helpers if column names shift.
3. **No overlapping responsibility**: Before adding a new file, check the Functional Cross-Reference Index. If the capability exists, extend the existing module rather than creating a parallel one.
4. **Barrel exports**: Every `src/{dir}/` must have an `index.ts` that re-exports public symbols. Tests and consumers import from the barrel, never deep-import.
5. **Planned markers**: Directories or files not yet implemented must be marked `(planned)` in this file. Remove the marker only when code is merged and tested.
6. **Test parity**: Every public export in `src/storage/` (and future layers) must have corresponding tests in `tests/{dir}/`. Update test tables when adding new test files.
