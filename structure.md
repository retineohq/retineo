# RETINEO Core — Repository Structure

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
├── packages/core/src/
│   ├── domain/          # Types, schemas, shared domain language
│   ├── adapters/        # Adapter IPC protocol
│   ├── storage/         # CAS, Registry, Config, NodeBuilder
│   ├── embeddings/      # (planned) Vector embedding generation & caching
│   ├── search/          # Query analysis, retrieval (BM25/semantic/hybrid), context assembly, DocumentHit
│   ├── llm/             # LLM provider abstraction, rate limiting, factory
│   ├── layers/          # L1/L2/L3 compilation pipelines, queue worker
│   ├── context/         # (planned) Context assembly, window management
│   ├── ghost/           # Orphan recovery, garbage collection
│   ├── bridge/          # HTTP/gRPC API, WebSocket streaming
│   ├── mcp/             # Model Context Protocol server
│   ├── i18n/            # Language packs, detection, cross-lingual search
│   └── utils/           # Shared helpers, logger, shutdown manager
├── packages/core/adapters/  # Built-in adapter scripts (CommonJS, .cjs extension)
│   ├── text/                # Text adapter (.txt) — adapter.cjs
│   ├── markdown/            # Markdown adapter (.md) — adapter.cjs
│   ├── pdf/                 # PDF adapter (real, pdfjs-dist) — adapter.cjs
│   ├── image/               # Image OCR adapter (real, tesseract.js) — adapter.cjs
│   ├── audio/               # Real audio adapter (whisper.cpp primary → Whisper API fallback → graceful empty, .mp3/.wav/.m4a/.ogg/.flac/.webm) — adapter.cjs
│   ├── audio-mock/          # Mock audio adapter (fallback for testing) — adapter.cjs
│   ├── video/               # Real video adapter (ffmpeg + whisper.cpp primary → Whisper API fallback → graceful empty, .mp4/.avi/.mov/.mkv/.webm) — adapter.cjs
│   ├── video-mock/          # Mock video adapter (fallback for testing) — adapter.cjs
│   └── image-mock/          # Mock image adapter (deprecated, replaced by image/) — adapter.cjs
├── tests/
│   ├── storage/         # CAS, Registry, NodeBuilder tests
│   ├── adapters/        # Transport, Manager, Ingestion, Mock adapter tests
│   ├── llm/             # Provider factory, mock provider, rate limiter tests
│   ├── layers/          # L1/L2/L3 generators, pipeline, worker tests
│   ├── search/          # Query analyzer, retrieval service, context assembler, bm25, end-to-end, document-hit, navigation-tree
│   ├── i18n/            # Language detector, pack registry tests
│   ├── bridge/          # HTTP server, routes, SSE tests
│   ├── cli/             # CLI command parsing and execution tests
│   ├── mcp/             # MCP server initialization and tool tests
│   └── integration/     # End-to-end: CLI → HTTP → MCP
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
├── .github/
│   ├── workflows/
│   │   ├── ci.yml       # CI: test on PR/push (Node 20, 22, pnpm)
│   │   └── release.yml  # CD: publish npm + build binaries + GitHub Release
│   └── release.yml      # Release notes category configuration
├── bin/
│   ├── retineo.js     # CLI entry point (retineo) — wires real services: SQLiteRegistry, CAS, IngestionService, PinoLogger
│   └── retineo-mcp.js      # MCP server entry point (retineo-mcp)
├── CHANGELOG.md         # Version history
├── structure.md         # This file
├── package.json         # Dependencies: pino, pino-pretty, better-sqlite3, commander, etc. ESLint 9 + typescript-eslint flat config.
├── eslint.config.mjs    # Flat ESLint config: @eslint/js + typescript-eslint + globals
├── tsconfig.json
└── README.md
```

---

## Directory Reference

### `src/domain/` — Domain Types & Runtime Validation

| File         | Exports                                                                                                                                                                                                                                                | Description                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `types.ts`   | `Hash`, `SourceRef`, `SourceRecord`, `SegmentRecord`, `ContextNode`, `L0Artifact`, `L1Artifact`, `L2Artifact`, `BuildManifest`, `GeneratorInfo`, `JobRecord`, `JobStatus`, `NormalizedContent`, `SegmentRef`, `SearchOptions`, `RetrievalResult`, etc. | Core domain interfaces. Immutable.           |
| `schemas.ts` | `HashSchema`, `BuildManifestSchema`, `JobRecordSchema`, `ContentMetaSchema`, `SegmentRefSchema`, etc.                                                                                                                                                  | Zod runtime validators for all domain types. |
| `index.ts`   | Barrel export of `types.js` + `schemas.js`                                                                                                                                                                                                             | Public domain API entrypoint.                |

### `src/adapters/` — Adapter IPC Protocol

| File               | Exports                                                                                                                                                                                                                       | Description                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `protocol.ts`      | `JSONRPCRequest`, `JSONRPCResponse`, `JSONRPCError`, `AdapterErrorCodes`, `InitializeParams`, `InitializeResult`, `CapabilitiesResult`, `IngestParams`, `IngestResult`, `ShutdownParams`, `AdapterMethod`, `AdapterTransport` | JSON-RPC 2.0 protocol for adapter child processes.                |
| `transport.ts`     | `JSONRPCTransport`, `LineDelimitedJSONTransport`                                                                                                                                                                              | LDJSON over stdin/stdout with timeout, error, exit handlers. Sets `NODE_PATH` to project `node_modules` so adapters in temp dirs (tests) can resolve dependencies. |
| `runner.ts`        | `AdapterProcessRunner`, `DefaultAdapterProcessRunner`                                                                                                                                                                         | Spawns adapter, auto-initializes, graceful shutdown.              |
| `manager.ts`       | `AdapterManager`, `DefaultAdapterManager`, `sniffTextFile`                                                                                                                                                                                     | Loads built-in adapters, resolves by mimeType/extension. Fallback: files without extension are sniffed (first 4KB, null-byte check) and routed to text adapter if plain text. |
| `ingestion.ts`     | `IngestionService`, `DefaultIngestionService`, `IngestFileResult`                                                                                                                                                             | Orchestrator: file → adapter → CAS → registry → ContextNode. Returns `IngestFileResult` with `skipped` flag for deduplication. |
| `mock-registry.ts` | `MockAdapterRegistry`, `MockAdapterInfo`, `MOCK_ADAPTERS`                                                                                                                                                                     | Central registry for mock multimodal adapters (Phase 2.5).        |
| `index.ts`         | Barrel export of `protocol.js`, `transport.js`, `runner.js`, `manager.js`, `ingestion.js`, `mock-registry.js`                                                                                                                 | Public adapter API entrypoint.                                    |

### `src/storage/` — Persistence Layer (Phase 1)

| File              | Exports                                                                                | Description                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `cas.ts`          | `CASStorage`, `LocalCASStorage`, `NodeArtifacts`, `computeHash`, `getObjectPath`       | Content-Addressable Storage: SHA-256 keyed object filesystem.                                   |
| `registry.ts`     | `Registry`, `SQLiteRegistry`, `OrphanRecord`                                           | SQLite-backed registry: sources, segments, jobs (lease model), orphans. Job queries: `getJobsBySource`, `getJob`, `getJobCounts`, `getLastHeartbeat`, `getRunningWorkerIds`, `getDeadJobs`. Source deduplication: `getSourceByRootHash`, `getSourcesByRootHash`, `updateSourcePath`. Schema init uses `IF NOT EXISTS` for idempotent table/index creation. |
| `config.ts`       | `ConfigManager`, `FileConfigManager`, `RetineoConfig`, `LoggingConfig`, `LLMConfig`, `EmbeddingConfig`, `ProviderConfigEntry` | YAML config manager (`~/.retineo/config.yaml`). Includes `initializeDataDir()` for first-run setup. `logging` section: level, console, file, filePath, pretty. `llm.providers[]` and `embedding.providers[]` for multi-provider routing. `bridge: { host, port }` for HTTP API. |
| `node-builder.ts` | `NodeBuilder`, `DefaultNodeBuilder`                                                    | Builds `ContextNode` trees + `BuildManifest` from adapter output.                               |
| `secrets.ts`      | `SecretsManager`, `FileSecretsManager`, `resolveSecret`, `resolveConfigValue`          | AES-256-GCM encrypted secrets store (`~/.retineo/secrets.json`).                                   |
| `schema.sql`      | —                                                                                      | SQLite DDL: `sources`, `segments`, `jobs`, `orphaned_objects`, `encryption_keys`, `audit_logs`. |
| `context-node-repository.ts` | `ContextNodeRepository`, `DefaultContextNodeRepository` | Single point of truth for loading/saving ContextNode via CAS + Registry. |
| `index.ts`        | Barrel export of `cas.js`, `registry.js`, `config.js`, `node-builder.js`, `secrets.js`, `context-node-repository.js` | Public storage API entrypoint.                                                                  |

### `src/embeddings/` — Vector Embeddings

| File               | Exports                                                                                   | Description                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `hnsw-index.ts`    | `HNSWIndex`, `HNSWManifest`, `createHNSWIndex`, `loadOrBuildHNSW`, `BruteForceHNSW`       | Approximate nearest neighbor index with native `hnswlib-node` and brute-force fallback. |
| `parquet-store.ts` | `ParquetEmbeddingStore`, `EmbeddingRecord`, `createEmbeddingStore`, `JSONLEmbeddingStore` | Embedding persistence interface with JSONL fallback; Parquet migration stubbed.         |
| `index.ts`         | Barrel export of `hnsw-index.js`, `parquet-store.js`                                      | Public embeddings API entrypoint.                                                       |

### `src/search/` — Retrieval & Ranking

| File                   | Exports                                                                                                        | Description                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `query-analyzer.ts`    | `QueryAnalyzer`, `DefaultQueryAnalyzer`, `AnalyzedQuery`, `QueryIntent`, `QuerySignal`, `SessionContext`       | Language detection, intent classification, entity extraction, pronoun resolution. |
| `bm25.ts`              | `OkapiBM25`, `tokenize`                                                                          | Okapi BM25 with IDF, document length normalization, k1/b parameters.             |
| `retrieval-service.ts` | `RetrievalService`, `DefaultRetrievalService`, `CandidateNode`, `RetrievalResult`, `Citation`, `SearchOptions`, `DocumentHit`, `ChunkHit`, `NavigationNode`, `calculateDocumentScore`, `buildNavigationTree`, `aggregateDocumentHits` | L3 semantic/BM25/hybrid search, L2 rerank, L1/L0 cascade, DocumentHit aggregation. |
| `context-assembler.ts` | `ContextAssembler`, `DefaultContextAssembler`, `AssembledContext`, `ContextSegment`                            | Token budget allocation, citation generation, drill-down segments.                |
| `index.ts`             | Barrel export of `query-analyzer.js`, `retrieval-service.js`, `context-assembler.js`                           | Public search API entrypoint.                                                     |

### `src/llm/` — LLM Provider Abstraction

| File                             | Exports                                                                                                             | Description                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `provider.ts`                    | `LLMProvider`, `EmbeddingProvider`, `ProviderConfig`, `GenerateOptions`, `ProviderCapabilities`                     | Provider interfaces.                                                                                         |
| `factory.ts`                     | `LLMProviderFactory`, `EmbeddingProviderFactory`, `DefaultLLMProviderFactory`, `DefaultEmbeddingProviderFactory`    | Config-driven provider loading with `${ENV_VAR}` resolution, circuit breaker wrapping, fallback routing, and `resetCircuitBreaker(id)`. |
| `rate-limiter.ts`                | `RateLimiter`, `SemaphoreRateLimiter`                                                                               | Per-provider concurrency semaphore.                                                                          |
| `circuit-breaker.ts`             | `CircuitBreaker`, `DefaultCircuitBreaker`, `CircuitBreakerConfig`, `CircuitState`, `DEFAULT_CIRCUIT_BREAKER_CONFIG` | Per-provider circuit breaker with closed/open/half-open states. `reset()` available for worker startup recovery. |
| `providers/ollama.ts`            | `OllamaProvider`                                                                                                    | LLM + Embedding via Ollama `/api/generate` and `/api/embed`.                                                 |
| `providers/openai-compatible.ts` | `OpenAICompatibleProvider`                                                                                          | LLM + Embedding via OpenAI-compatible `/chat/completions` and `/embeddings`.                                 |
| `providers/mock.ts`              | `MockLLMProvider`                                                                                                   | Deterministic hash-based provider for tests.                                                                 |
| `index.ts`                       | Barrel export of `provider.js`, `factory.js`, `rate-limiter.js`, `circuit-breaker.js`, `providers/*.js`             | Public LLM API entrypoint.                                                                                   |

### `src/layers/` — Compilation Pipelines

| File              | Exports                                                                                                   | Description                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `l1-generator.ts` | `L1Generator`, `DefaultL1Generator`, `L1Result`, `L1Index`, `Section`, `Chunk`                            | Rule-based markdown structural parser.                         |
| `l2-generator.ts` | `L2Generator`, `DefaultL2Generator`                                                                       | LLM-powered semantic extraction with Zod validation and retry. |
| `l3-generator.ts` | `L3Generator`, `DefaultL3Generator`, `L3Result`, `L3Metadata`, `bruteForceSearch`, `BatchEmbeddingConfig` | Embedding indexer with batch embedding support. Deduplicates embeddings by hash on write. |
| `pipeline.ts`     | `CompilationPipeline`, `DefaultCompilationPipeline`, `CompilationPipelineDeps`                            | Orchestrates L1→L2→L3 via job queue. `llmProvider` and `embeddingProvider` are nullable; pipeline throws clear error if null when L2/L3 job processed. |
| `worker.ts`       | `QueueWorker`, `DefaultQueueWorker`, `QueueWorkerOptions`                                                 | Lease-based job processor with heartbeat.                      |
| `index.ts`        | Barrel export of `l1-generator.js`, `l2-generator.js`, `l3-generator.js`, `pipeline.js`, `worker.js`      | Public layers API entrypoint.                                  |

### `src/context/` — Context Assembly (planned)

| File       | Exports     | Description                |
| ---------- | ----------- | -------------------------- |
| `index.ts` | `(planned)` | Barrel export placeholder. |

### `src/ghost/` — Orphan Recovery & GC

| File                    | Exports                                                                                       | Description                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `orphan-detector.ts`    | `OrphanDetector`, `DefaultOrphanDetector`, `OrphanRecord`                                     | Detects deleted/modified source files and registers orphans.                      |
| `recovery-service.ts`   | `GhostRecoveryService`, `DefaultGhostRecoveryService`                                         | List, recover, and purge orphaned objects from CAS.                               |
| `index.ts`              | Barrel export of `orphan-detector.js`, `recovery-service.js`                                  | Public ghost API entrypoint.                                                      |

### `src/bridge/` — External API

| File               | Exports                                                                                                                                                                | Description                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `types.ts`         | `SearchRequest`, `SearchResponse`, `IngestRequest`, `IngestResponse`, `StatusResponse`, `NodeResponse`, `SourceResponse`, `JobResponse`, `BridgeError`, `BridgeConfig` | HTTP API request/response types.                                   |
| `server.ts`        | `BridgeServer`, `FastifyBridgeServer`, `BridgeServerOptions`                                                                                                           | Fastify-based localhost-only HTTP server with shutdown hook.       |
| `routes.ts`        | `registerRoutes`                                                                                                                                                       | Route registration (search, ingest, status, nodes list, nodes/:hash, sources, jobs). |
| `handlers.ts`      | `BridgeHandlersDeps`, `createHandlers`                                                                                                                                 | Request handlers calling core services. Status reads real vectorCount. listNodes endpoint. |
| `sse.ts`           | `SSEStream`, `createSSEStream`                                                                                                                                         | Server-Sent Events for job progress and search streaming.          |
| `health.ts`        | `HealthService`, `DefaultHealthService`, `HealthResult`, `ReadyResult`, `HealthServiceDeps`                                                                            | Liveness/readiness probes with SQLite, CAS, LLM, worker checks.    |
| `metrics.ts`       | `MetricsService`, `DefaultMetricsService`, `MetricsSnapshot`, `MetricsCounters`, `MetricsServiceDeps`, `formatPrometheus`, `createMetricsCounters`                     | Operational metrics collection and Prometheus text export.         |
| `routes-health.ts` | `registerHealthRoutes`, `HealthRoutesDeps`                                                                                                                             | Health, readiness, metrics, and Prometheus route registration.     |
| `index.ts`         | Barrel export of `types.js`, `server.js`, `routes.js`, `handlers.js`, `sse.js`, `health.js`, `metrics.js`, `routes-health.js`                                          | Public bridge API entrypoint.                                      |

### `src/cli/` — Command-Line Interface

| File            | Exports                                                                                                         | Description                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `commands.ts`   | `CLICommands`, `CLICommandsDeps`, `IngestCLIOptions`, `SearchCLIOptions`, `CompileCLIOptions`, `InitCLIOptions` | CLI command implementations: `init` (interactive wizard + non-interactive with required `--llm-model` / `--embed-model`), `ingest` (with `--watch` / `--timeout`, idempotent skip, recursive directory traversal), `search`, `status`, `compile` (with `--watch` / `--timeout` / `--provider` + dead L3 recovery), `config`, `jobs`, `recover` (restores from CAS by rootHash or rawHash), `doctor`, `key set/get/delete/list`, `worker start/stop/status/logs`, `bridge start/stop/status/logs`, `daemon start/stop/status/logs`. |
| `doctor.ts`     | `runDoctor`, `formatDoctor`, `DoctorResult`, `DependencyCheck`                                                  | External dependency checker (ffmpeg, tesseract, whisper.cpp, whisper model, whisper key, ollama). |
| `formatters.ts` | `formatSearchResult`, `formatStatus`, `formatJobs`, `formatIngestResult`, `formatConfig`, `formatRecoverResult` | Output formatters for CLI commands.                                                   |
| `prompt.ts`     | `ask`, `choose`, `confirm`, `PromptOptions`, `ChoiceOptions`                                                    | Readline-based single-question prompts. No external deps. Used by the `init` wizard. `ask` closes the readline interface before resolving. |
| `process-manager.ts` | `dataDir`, `pidFilePath`, `logFilePath`, `readPidFile`, `writePidFile`, `removePidFile`, `isPidAlive`, `stopProcess`, `tailLog`, `streamLog`, `ensureDataDirs`, `fileExists` | PID-file lifecycle and log tail helpers used by `worker`/`bridge`/`daemon` start/stop/status/logs. |
| `bridge-script.ts` | `startBridgeServices`, `RunningBridgeServices` | Standalone bridge entry point used by `child_process.fork()` from `retineo bridge start`. Wires SQLiteRegistry, CAS, adapters, search services, `DefaultLLMProviderFactory`/`DefaultEmbeddingProviderFactory` (config-driven), `FastifyBridgeServer`. |
| `worker-script.ts` | `startWorkerServices`, `RunningServices`                                                                    | Standalone worker entry point used by `child_process.fork()` from `retineo worker start` and `retineo daemon start`. Wires SQLiteRegistry, CAS, adapters, pipeline, `DefaultLLMProviderFactory`/`DefaultEmbeddingProviderFactory` (config-driven), `DefaultQueueWorker`. |
| `daemon.ts`     | `startDaemonServices`, `runDaemon`, `DaemonServices`                                                           | All-in-one daemon: starts worker + bridge in one process. Loads LLM/embedding providers from config via `DefaultLLMProviderFactory`/`DefaultEmbeddingProviderFactory`. Graceful shutdown order: bridge → worker → registry. |
| `index.ts`      | `createCLI`                                                                                                     | Commander-based CLI entry point. Supports `-v, --verbose` global flag for debug output. Wires all commands including service lifecycle subcommands. |

### `src/mcp/` — Model Context Protocol

| File          | Exports                                                                                                  | Description                          |
| ------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `tools.ts`    | `MCPTool`, `RETINEO_SEARCH_TOOL`, `RETINEO_INGEST_TOOL`, `RETINEO_STATUS_TOOL`, `RETINEO_GET_NODE_TOOL`, `ALL_TOOLS` | MCP tool definitions.                |
| `handlers.ts` | `MCPHandlersDeps`, `createHandlers`                                                                      | Tool handlers calling core services. |
| `server.ts`   | `MCPServer`, `RetineoMCPServer`, `MCPServerOptions`                                                         | MCP server over stdio transport.     |
| `index.ts`    | Barrel export of `tools.js`, `handlers.js`, `server.js`                                                  | Public MCP API entrypoint.           |

### `src/i18n/` — Multilingual Support

| File               | Exports                                                                                    | Description                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `language-pack.ts` | `LanguagePack`                                                                             | Interface for per-language prompts and search tuning.           |
| `detector.ts`      | `LanguageDetector`, `HeuristicDetector`, `FrancDetector`, `CLD3Detector`, `createDetector` | Language detection with franc/cld3/heuristic providers.         |
| `registry.ts`      | `LanguagePackRegistry`, `DefaultLanguagePackRegistry`                                      | Built-in pack registry (en, ru, zh) + custom pack registration. |
| `packs/en.ts`      | `enPack`                                                                                   | English language pack with default prompts.                     |
| `packs/ru.ts`      | `ruPack`                                                                                   | Russian language pack with Cyrillic script regex.               |
| `packs/zh.ts`      | `zhPack`                                                                                   | Chinese language pack with CJK script regex.                    |
| `index.ts`         | Barrel export of `language-pack.js`, `detector.js`, `registry.js`, `packs/*.js`            | Public i18n API entrypoint.                                     |

### `src/utils/` — Shared Utilities

| File               | Exports                                                                                                                                                                    | Description                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `logger.ts`        | `Logger`, `LogMeta`, `LoggerConfig`, `DualLogger`, `createLogger`, `setGlobalLogger`, `getGlobalLogger`                                                                    | Dual logger: console (stderr, pretty or JSON) + file (JSON). Console works even if file fails. `DualLogger` class for simultaneous output. |
| `shutdown.ts`      | `ShutdownManager`, `ShutdownHandler`, `DefaultShutdownManager`, `installSignalHandlers`                                                                                    | SIGTERM/SIGINT handling with 12-step graceful shutdown.              |
| `errors.ts`        | `RetineoError`, `BaseRetineoError`, `AdapterError`, `IngestError`, `LLMError`, `PipelineError`, `SearchError`, `BridgeError`, `ConfigError`, and factory functions for each code | Standardized error hierarchy with codes and HTTP status mapping.     |
| `error-handler.ts` | `isRetineoError`, `retineoErrorFrom`, `sendErrorReply`, `formatCLIError`                                                                                                         | Unified error handling for HTTP (Fastify), CLI, and MCP.             |
| `cache.ts`         | `LRUCache`, `SimpleLRUCache`                                                                                                                                               | In-memory LRU cache with TTL eviction and MRU reordering.            |
| `index.ts`         | Barrel export of `logger.js`, `shutdown.js`, `errors.js`, `error-handler.js`, `cache.js`                                                                                   | Public utils API entrypoint.                                         |

### `tests/storage/` — Storage Layer Tests

| File                   | Tests                                                                                                                 | Description                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `cas.test.ts`          | `computeHash`, `getObjectPath`, `LocalCASStorage` (write/read/exists/delete/writeObject/readObject)                   | CAS correctness, hash path resolution, artifact persistence.       |
| `registry.test.ts`     | Sources CRUD, Segments CRUD + FK cascade, Job lease model (acquire/heartbeat/complete/fail/release), Orphan lifecycle | SQLite registry integrity, lease crash recovery, orphan purge.     |
| `node-builder.test.ts` | `buildRoot`, `buildSegments`, `createBuildManifest`                                                                   | Node tree construction, placeholder generators, manifest validity. |
| `secrets.test.ts`      | `FileSecretsManager` set/get/delete/list, encryption round-trip, `resolveSecret`, `resolveConfigValue`                | AES-256-GCM secrets storage and config resolution.                 |
| `context-node-repository.test.ts` | loadByHash, loadBySourcePath, loadChildren, save roundtrip, buildManifest, loadL2 | DefaultContextNodeRepository correctness. |

### `tests/adapters/` — Adapter IPC Tests

| File                          | Tests                                                                                            | Description                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `transport.test.ts`           | send/receive, error response, timeout, process exit, onExit handler, auto-id, graceful close     | LDJSON transport over child_process stdin/stdout.                         |
| `manager.test.ts`             | loadBuiltIn, resolve by extension/mimeType, ingest text/md, capabilities                         | AdapterManager loads adapters, resolves files, validates output.          |
| `ingestion.test.ts`           | full pipeline (file → CAS → registry), idempotency, batch ingest, job queueing                   | IngestionService orchestrates adapter → CAS → registry → GENERATE_L1 job. |
| `pdf.test.ts`                 | valid PDF text extraction, heading detection, encrypted PDF, image-only PDF, manifest status     | Real PDF adapter via pdf-parse.                                           |
| `image.test.ts`               | PNG/JPG resolution, blank image empty content, unsupported format, missing file, manifest status | Real image OCR adapter via tesseract.js.                                  |
| `audio.test.ts`               | load manifest, resolve extensions/mimeTypes, ingest speech blocks, API fallback, graceful empty, large file, segments | Real audio adapter: whisper.cpp primary → Whisper API fallback → empty. |
| `audio-mock.test.ts`          | load manifest, resolve .mp3/wav, ingest speech blocks, segments, timestamps, determinism         | Mock audio adapter validation (fallback).                                 |
| `video.test.ts`               | load manifest, resolve .mp4, ffmpeg missing, graceful empty, manifest status                     | Real video adapter: ffmpeg + whisper.cpp primary → Whisper API fallback → empty. |
| `video-mock.test.ts`          | load manifest, resolve .mp4/avi, ingest frame + speech blocks, bbox, segments                    | Mock video adapter validation (fallback).                                 |
| `image-mock.test.ts`          | load manifest, resolve .png/.jpg, ingest ocr blocks, bbox, confidence, no segments               | Mock image adapter validation (deprecated).                               |
| `multimodal-pipeline.test.ts` | end-to-end: audio/video/image → CAS → registry → verify content.meta.json                        | Full pipeline with mock multimodal adapters.                              |

### `tests/llm/` — LLM Provider Tests

| File                      | Tests                                                                             | Description                                   |
| ------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| `factory.test.ts`         | Provider loading from config, `${ENV_VAR}` resolution, getDefault, list, register | Factory config parsing and provider registry. |
| `providers/mock.test.ts`  | Deterministic generate, jsonMode, embed normalization, validate, capabilities     | MockLLMProvider correctness.                  |
| `rate-limiter.test.ts`    | Concurrency limits, queue behavior, release semantics                             | SemaphoreRateLimiter correctness.             |
| `circuit-breaker.test.ts` | Closed→open transition, half-open recovery, fallback routing, failure counting    | DefaultCircuitBreaker state machine.          |

### `tests/layers/` — Compilation Pipeline Tests

| File                   | Tests                                                                                       | Description                               |
| ---------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `l1-generator.test.ts` | Heading detection, section tree, chunking, code block preservation, frontmatter             | DefaultL1Generator structural parsing.    |
| `l2-generator.test.ts` | Prompt building, JSON validation, retry on invalid JSON/Zod failure, truncation, real provider id/model passthrough, no mock fallback on error | DefaultL2Generator LLM extraction.        |
| `l3-generator.test.ts` | Embedding generation, jsonl/bm25/manifest writes, manifest increment, brute-force search    | DefaultL3Generator indexing.              |
| `pipeline.test.ts`     | GENERATE_L1 → L2 enqueue, GENERATE_L2 → L3 enqueue, GENERATE_L3 manifest update, end-to-end | DefaultCompilationPipeline orchestration. |
| `worker.test.ts`       | processNext, empty queue, crash recovery, retry on failure, start/stop lifecycle            | DefaultQueueWorker lease model.           |

### `tests/search/` — Search & Retrieval Tests

| File                        | Tests                                                                                                                            | Description                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `query-analyzer.test.ts`    | Language detection (heuristic/franc), intent classification (rule/LLM), entity extraction, pronoun resolution, signal generation | DefaultQueryAnalyzer correctness.    |
| `retrieval-service.test.ts` | L3 semantic search, keyword search, hybrid mode, threshold filtering, L2 rerank scoring, L1/L0 cascade, trace                    | DefaultRetrievalService correctness. |
| `context-assembler.test.ts` | Token budgets per intent, cascade modes, citation generation, drill-down children, language propagation                          | DefaultContextAssembler correctness. |
| `document-hit.test.ts`      | calculateDocumentScore (coverage/density bonus), aggregateDocumentHits, L1 integration                                          | DocumentHit scoring and aggregation. |
| `navigation-tree.test.ts`   | L1 H1/H2/H3 → tree, chunk→section mapping, section order                                                                      | Navigation tree construction.        |
| `end-to-end.test.ts`        | Full pipeline: Russian query → detect → search → rerank → assemble → citations in Russian                                        | Cross-lingual end-to-end validation. |

### `tests/bridge/` — Bridge Tests

| File                   | Tests                                                                | Description                               |
| ---------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| `server.test.ts`       | `FastifyBridgeServer` start/stop, route registration, GET /v1/status | HTTP server lifecycle.                    |
| `search-route.test.ts` | POST /v1/search (valid, invalid, empty)                              | Search route validation.                  |
| `ingest-route.test.ts` | POST /v1/ingest (valid, missing sourcePath)                          | Ingest route validation.                  |
| `sse.test.ts`          | SSE streaming, headers, events                                       | Server-Sent Events correctness.           |
| `health.test.ts`       | GET /v1/health (healthy/unhealthy), GET /v1/ready (ready/not ready)  | Liveness and readiness probes.            |
| `metrics.test.ts`      | GET /v1/metrics (JSON), GET /v1/metrics/prometheus (text format)     | Metrics collection and Prometheus export. |

### `tests/ghost/` — Ghost System Tests

| File                       | Tests                                                                                         | Description                                |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `orphan-detector.test.ts`  | detectDeletedSources (deleted/existing/multiple), orphan registry integration                 | DefaultOrphanDetector correctness.         |
| `recovery-service.test.ts` | listGhosts, recover (success/not found/CAS missing), purge                                    | DefaultGhostRecoveryService correctness.   |

### `tests/cli/` — CLI Tests

| File               | Tests                                                        | Description                        |
| ------------------ | ------------------------------------------------------------ | ---------------------------------- |
| `commands.test.ts` | `ingest`, `status`, `config`, `recover` with mocked services | CLI command parsing and execution. |
| `compile-provider.test.ts` | `compile` with `--provider` override: accepts valid provider, rejects invalid with available list | Provider override validation and error messages. |
| `prompt.test.ts` | `ask` closes readline after line input; returns default on empty input | Prompt helper correctness. |
| `init.test.ts`     | `init` creates directories, config, SQLite schema; idempotent | First-run initialization.          |
| `init-wizard.test.ts` | Non-interactive `init` writes Ollama-first config; honours `RETINEO_DATA_DIR`, `RETINEO_LLM_MODEL`, `RETINEO_EMBED_MODEL`, `RETINEO_BRIDGE_PORT`; bridge section defaults to `127.0.0.1:37891`; graceful fallback when Ollama is not running; interactive `init` calls `process.exit(0)` on completion | Interactive + non-interactive init wizard. |
| `worker-lifecycle.test.ts` | `writePidFile`/`readPidFile` round-trip; `isPidAlive` / `stopProcess`; `workerStatus` reports stopped/running based on PID file; `workerStart` is idempotent | Worker PID/lifecycle correctness. |
| `bridge-lifecycle.test.ts` | `bridgeStatus` reports stopped when no PID file; `bridgeStop` no-op; `bridgeLogs` handles missing log file | Bridge PID/lifecycle correctness. |
| `ingest-watch.test.ts` | `ingest` prints queued job ids; uses mock registry that completes after a few polls | `--watch` flag plumbing. |
| `daemon.test.ts`  | `daemon` module exports `startDaemonServices`/`runDaemon`; `process-manager` exports lifecycle helpers; `worker-script` exports `startWorkerServices` | Daemon + worker-script contract tests. |
| `ghost-commands.test.ts` | ghostList empty/populated output, ghostRecover, ghostPurge | Ghost CLI command correctness. |
| `key-list.test.ts` | `key list` empty state, masked output                        | Key management display.            |
| `doctor.test.ts`   | `runDoctor`, `formatDoctor`, Node.js check, whisper.cpp check, whisper model check, output formatting | Dependency checker correctness.    |
| `verbose.test.ts`  | `--verbose` flag sets debug level, pretty console output; config logging section defaults; `createLogger` with `logging` config | Verbose mode + config integration. |

### `tests/mcp/` — MCP Tests

| File             | Tests                                                        | Description                          |
| ---------------- | ------------------------------------------------------------ | ------------------------------------ |
| `server.test.ts` | `RetineoMCPServer` construction                                 | MCP server initialization.           |
| `tools.test.ts`  | `retineo_search`, `retineo_ingest`, `retineo_status`, `retineo_get_node` | Tool execution with mocked services. |
| `bin.test.ts`    | `retineo-mcp.js` exists, `RetineoMCPServer` importable             | MCP binary entry point.              |

### `tests/utils/` — Utility Tests

| File               | Tests                                                                       | Description                                 |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------- |
| `logger.test.ts`   | Log levels, child loggers, redaction, traceId propagation, DualLogger (console+file, pretty mode, level filtering, file failure resilience) | DualLogger + PinoLogger correctness.                     |
| `shutdown.test.ts` | SIGTERM handling, job release, adapter cleanup, timeout scenarios           | DefaultShutdownManager correctness.         |
| `errors.test.ts`   | `BaseRetineoError` hierarchy, `toJSON`, factory functions, status codes        | Standardized error codes and serialization. |
| `cache.test.ts`    | `SimpleLRUCache` get/set/has/delete, TTL eviction, MRU reordering, max size | LRU cache correctness.                      |

### `tests/integration/` — Integration Tests

| File                      | Tests                                                                              | Description                                   |
| ------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| `end-to-end.test.ts`      | CLI ingest → HTTP search → MCP status                                              | Full UI layer integration (mocked).           |
| `end-to-end-real.test.ts` | Config validation, L3 index integrity, dedup, search (EN/RU/cross-lingual), L2 quality, compile --provider, BM25 | Real Ollama + SQLite integration. No mocks.   |
| `pdf-pipeline.test.ts`    | Ingest real PDF → L1/L2/L3 compilation → verify artifacts                          | End-to-end PDF pipeline.                      |
| `image-pipeline.test.ts`  | Ingest real image → L1/L2/L3 compilation → verify artifacts                        | End-to-end image OCR pipeline.                |
| `audio-pipeline.test.ts`  | Ingest audio → verify speech blocks, timestamps, speaker labels                    | End-to-end audio transcription pipeline.      |
| `video-pipeline.test.ts`  | Ingest video → verify frame + speech blocks, ffmpeg handling                       | End-to-end video transcription pipeline.      |
| `circuit-breaker.test.ts` | Factory loads breaker config, wrapper fast-fails on open circuit, fallback routing | Circuit breaker integration with LLM factory. |

### `tests/i18n/` — Multilingual Tests

| File               | Tests                                                                                         | Description                              |
| ------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `detector.test.ts` | Heuristic script detection, franc fallback, cld3 fallback, createDetector factory             | LanguageDetector implementations.        |
| `packs.test.ts`    | Pack loading, prompt resolution, search tuning values, script regex, custom pack registration | DefaultLanguagePackRegistry correctness. |

---

## Functional Cross-Reference Index

> Lookup: "I want to do X" → start here.

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
| **Ingest a file end-to-end (adapter → CAS → registry)** | `DefaultIngestionService`                      | `src/adapters/ingestion.ts`                         | `CASStorage`, `Registry`, `NodeBuilder`, `AdapterManager`. `ingestBatch` recurses into directories. |
| **Discover mock multimodal adapters**                   | `MockAdapterRegistry`                          | `src/adapters/mock-registry.ts`                     | `MOCK_ADAPTERS`, `MockAdapterInfo`                               |
| **Write a third-party adapter**                         | `ADAPTER_GUIDE.md`                             | `docs/ADAPTER_GUIDE.md`                             | `protocol.ts`, `types.ts`, `schemas.ts`                          |
| **Add structured logging**                              | `createLogger`                                 | `src/utils/logger.ts`                               | `Logger`, `LogMeta`, `getGlobalLogger`                           |
| **Write logs to console + file simultaneously**         | `DualLogger`                                   | `src/utils/logger.ts`                               | `LoggerConfig` with `console`, `file`, `pretty` flags. Console = stderr (pretty or JSON), file = JSON. Console works even if file fails. |
| **Enable verbose debug output via CLI**                 | `--verbose` / `-v` flag                        | `src/cli/index.ts`, `bin/retineo.js`              | Sets `RETINEO_LOG_LEVEL=debug`, pretty console output. Checked via `process.argv` before logger creation. |
| **Configure logging via config.yaml**                    | `logging` section in `RetineoConfig`              | `src/storage/config.ts`                             | `LoggingConfig`: level, console, file, filePath, pretty. |
| **Implement graceful shutdown**                         | `DefaultShutdownManager`                       | `src/utils/shutdown.ts`                             | `ShutdownHandler`, `installSignalHandlers`                       |
| **Add a new adapter protocol method**                   | `protocol`                                     | `src/adapters/protocol.ts`                          | `AdapterMethod`, `JSONRPCRequest`                                |
| **Implement a custom storage backend**                  | `CASStorage` interface                         | `src/storage/cas.ts`                                | Implement `write`, `read`, `exists`, `writeObject`, `readObject` |
| **Track orphaned objects for later GC**                 | `Registry` (orphans)                           | `src/storage/registry.ts`                           | `insertOrphan`, `recoverOrphan`, `purgeOrphansOlderThan`         |
| **Build a search index over compiled nodes**            | `DefaultL3Generator` + `bruteForceSearch`      | `src/layers/l3-generator.ts`                        | `EmbeddingProvider`, `hnsw.manifest.json`. Deduplicates by hash on append. |
| **Generate vector embeddings for a node**               | `EmbeddingProvider`                            | `src/llm/provider.ts`                               | `DefaultL3Generator`, `MockLLMProvider`                          |
| **Use HNSW for fast approximate nearest neighbors**     | `createHNSWIndex`                              | `src/embeddings/hnsw-index.ts`                      | `loadOrBuildHNSW`, `BruteForceHNSW`                              |
| **Store embeddings in Parquet/JSONL**                   | `createEmbeddingStore`                         | `src/embeddings/parquet-store.ts`                   | `JSONLEmbeddingStore`, `EmbeddingRecord`                         |
| **Batch embed multiple texts efficiently**              | `DefaultL3Generator.batchEmbed`                | `src/layers/l3-generator.ts`                        | `BatchEmbeddingConfig`                                           |
| **Cache search results and embeddings**                 | `SimpleLRUCache`                               | `src/utils/cache.ts`                                | `DefaultRetrievalService` embedding/L2/search caches             |
| **Protect LLM calls with circuit breaker**              | `DefaultCircuitBreaker`                        | `src/llm/circuit-breaker.ts`                        | `DefaultLLMProviderFactory` wrapper, fallback                    |
| **Encrypt and retrieve API secrets**                    | `FileSecretsManager`                           | `src/storage/secrets.ts`                            | `resolveSecret`, `resolveConfigValue`                            |
| **Add health/readiness probes**                         | `DefaultHealthService`                         | `src/bridge/health.ts`                              | `registerHealthRoutes`, `/v1/health`, `/v1/ready`                |
| **Export operational metrics**                          | `DefaultMetricsService`                        | `src/bridge/metrics.ts`                             | `formatPrometheus`, `/v1/metrics/prometheus`                     |
| **Handle errors consistently across HTTP/CLI**          | `sendErrorReply`, `formatCLIError`             | `src/utils/error-handler.ts`                        | `BaseRetineoError`, `isRetineoError`                                   |
| **Run the L1→L2→L3 compilation pipeline**               | `DefaultCompilationPipeline`                   | `src/layers/pipeline.ts`                            | `QueueWorker`, `Registry`                                        |
| **Process background jobs with lease recovery**         | `DefaultQueueWorker`                           | `src/layers/worker.ts`                              | `Registry.acquireLease`, `heartbeatJob`                          |
| **Load LLM providers from config**                      | `DefaultLLMProviderFactory`                    | `src/llm/factory.ts`                                | `ProviderConfig`, `OllamaProvider`, `OpenAICompatibleProvider`   |
| **Write a third-party LLM provider**                    | `LLM_PROVIDERS.md`                             | `docs/LLM_PROVIDERS.md`                             | `LLMProvider`, `EmbeddingProvider`                               |
| **Analyze a query (language, intent, entities)**        | `DefaultQueryAnalyzer`                         | `src/search/query-analyzer.ts`                      | `LanguageDetector`, `LanguagePackRegistry`                       |
| **Search the index (semantic/keyword/hybrid)**          | `DefaultRetrievalService`                      | `src/search/retrieval-service.ts`                   | `EmbeddingProvider`, `CASStorage`, `bruteForceSearch`            |
| **Assemble context for LLM consumption**                | `DefaultContextAssembler`                      | `src/search/context-assembler.ts`                   | `CandidateNode`, `SearchConfig`                                  |
| **Detect language of a query**                          | `createDetector`                               | `src/i18n/detector.ts`                              | `FrancDetector`, `HeuristicDetector`, `CLD3Detector`             |
| **Load or register a language pack**                    | `DefaultLanguagePackRegistry`                  | `src/i18n/registry.ts`                              | `LanguagePack`, `enPack`, `ruPack`, `zhPack`                     |
| **Add a new language to RETINEO**                          | `LanguagePack` + `DefaultLanguagePackRegistry` | `src/i18n/packs/{code}.ts`                          | `docs/MULTILINGUAL.md`                                           |
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
