# Changelog

## [0.6.2] - 2026-07-22

### Added
- **Public programmatic runtime API:** `createCore({ dataDir, config?, logger? })` returns a `CoreHandle` that exposes the engine's runtime capabilities directly from `@retineo/core`.
  - `packages/core/src/runtime/core-handle.ts` implements the facade, wiring together `IngestionService`, `HealthAnalyzer`, `SimilarityService`, `Registry`, and `CAS`.
  - Methods: `ingest()`, `health()`, `findSimilar()`, `listDocuments()`, `getNode()`, and `close()`.
  - `ingest()` auto-drains pending L1/L2/L3 jobs so callers get compiled artifacts immediately.
  - `close()` deterministically releases SQLite handles and worker resources.
  - Re-exported from `packages/core/src/index.ts`; the runtime result shape is available as `RuntimeIngestResult` to avoid colliding with the existing protocol `IngestResult`.
- **New `runtime/` directory:** `packages/core/src/runtime/index.ts` barrel export for the programmatic API.

### Documentation
- Added "Programmatic API" section to `README.md`.
- Added full `CoreHandle` reference to `docs/API.md`.
- Updated `structure.md` with the new `runtime/` directory and public exports.

### Tests
- Added `tests/runtime/runtime-api.test.ts`: lifecycle, unknown hashes, ghosts, and error cases.
- 462 tests passing, 0 skipped.

### Changed
- Nothing. This release is purely additive.

### Deprecated
- Nothing.

## [0.6.1] - 2026-07-17

### Added
- **Document similarity API:** `SimilarityService.findSimilar(contentHash)` returns the top-K semantically similar documents using the existing L3/HNSW index.
  - `packages/core/src/search/similarity-service.ts` exposes `SimilarOptions`, `SimilarDocument`, and `createSimilarityService()`.
  - Aggregates chunk-level hits into document-level scores (mean of top-3 chunk similarities), applies threshold filtering, and resolves `sourcePath` via the Registry.
  - Unknown hashes return an empty array; ghosts are excluded by default.
- **HTTP API:** `POST /v1/similar` accepts `hash`, optional `topK`, `threshold`, and `includeGhosts`, returns `{ results: SimilarDocument[] }`.
- **MCP tool:** `retineo_find_similar` finds similar documents by content hash.
- **CLI command:** `retineo similar <hash> [--top-k <n>] [--threshold <n>] [--json]` prints a table or raw JSON.

### Tests
- Added `tests/search/similarity-service.test.ts`, `tests/bridge/similarity-api.test.ts`, `tests/mcp/similarity-mcp.test.ts`, `tests/cli/similarity-cli.test.ts`.
- 458 tests passing, 0 skipped.

### Documentation
- Updated `docs/API.md`, `docs/CLI.md`, and `README.md` with the new similarity capability.

## [0.6.0] - 2026-07-17

### Added
- **Memory Health Check Core MVP:** `src/health/` analyzes an ingested collection and produces a diagnostic JSON report.
  - `HealthAnalyzer` orchestrates coverage, knowledge density, duplicate concepts, orphans, ghosts, knowledge age, and memory score metrics.
  - `findings-engine.ts` turns metric results into concrete findings referencing specific `contentHash` values.
  - `report-builder.ts` emits `HealthReport` with `score`, `strong`, `attention`, `recommendations`, and `advancedMetrics`.
  - New metrics live under `src/health/metrics/`: `coverage-score`, `knowledge-density`, `duplicate-concepts` (cosine threshold 0.94), `orphans`, `ghosts`, `knowledge-age`, `memory-score`.
- **CLI command:** `retineo health <path>` syncs a directory and prints a pretty-printed JSON report. Exit code is `1` when `score < 50`.
- **HTTP API:**
  - `POST /v1/health` — starts an async health analysis job, returns `{ jobId }`.
  - `GET /v1/health/:jobId` — returns job status (`pending`, `running`, `completed`, `failed`).
  - `GET /v1/report/:jobId` — returns the completed `HealthReport` JSON.
- **Advanced metrics placeholder:** `fragmentation`, `contradictions`, and `topicDistribution` are listed as Pro/Enterprise features in the report; Core does not implement L4/L5/L9 pipelines.

### Tests
- Added `tests/health/health-analyzer.test.ts`, `duplicate-concepts.test.ts`, `knowledge-age.test.ts`, `findings-engine.test.ts`, `report-builder.test.ts`.
- Added `tests/cli/health-cli.test.ts` and `tests/bridge/health-api.test.ts`.
- 444 tests passing, 0 skipped.

## [0.5.8] - 2026-07-15

### Fixed
- **Search deduplication by `contentHash`:** `search/retrieval-service.ts` filters duplicate `contentHash` values after L2 rerank. One document no longer occupies multiple result slots.
- **Full titles in search output:** `layers/l1-generator.ts` no longer truncates titles to 80 characters; `cli/formatters.ts` no longer truncates L2 summaries. Search results show complete content.

### Tests
- Fixed flaky `transport.test.ts` exit-code timing.
- 433 tests passing, 0 skipped.

## [0.5.7] - 2026-07-15

### Fixed
- **`cas.exists()` recognizes both object layouts:** `storage/cas.ts` now returns `true` when either `artifact.bin` (legacy `write()`) or `node.json` (pipeline `writeObject()`) exists. Prevents `ingest.skip.duplicate` during `rebuild --force` after the CAS `objects/` directory is wiped.
- **`rebuild --force` fully resets Registry:** `cli/commands.ts` captures filesystem source IDs, then calls `registry.clearSources()`/`clearJobs()`/`clearOrphans()` before re-syncing. All files are re-ingested, including duplicate-content files under different paths.
- **`RETINEO_DATA_DIR` honoured on first run:** `storage/config.ts` saves `dataDir: $RETINEO_DATA_DIR` into the default `config.yaml`; `bin/retineo.js` uses the same default when no config exists. CLI no longer silently falls back to `~/.retineo` in fresh data directories.

### Tests
- 419 tests passing, 14 skipped.

## [0.5.6] - 2026-07-14

### Fixed
- **HNSW duplicate prevention:** `embeddings/hnsw-index.ts` now tracks inserted hashes and skips duplicates in `add()`/`build()`. `search/retrieval-service.ts` checks `hnswIndex.has(chunkHash)` before adding vectors, avoiding duplicate HNSW entries when the same chunk is re-ingested or reloaded.
- **`rebuild --force` adapter registration:** `cli/commands.ts` lazily registers `FileSystemSourceAdapter` for every `filesystem:*` source before `syncSource()`, fixing `Source adapter not found` errors during `retineo rebuild --force`.
- **`rebuild --force` re-ingest after wipe:** `services/ingestion-service.ts` now verifies `contentHash` exists in CAS before skipping by etag. If CAS was wiped (e.g. `--force`), changed content is re-ingested even when Registry still references the old etag.
- **Registry cleanup helpers:** `storage/registry.ts` adds `clearSources()`, `clearJobs()`, and `clearOrphans()`. `rebuild --force` clears jobs/orphans but preserves source records so adapters can re-sync.

### Tests
- Updated `tests/cli/commands.test.ts` mock `ingestionService` with `registerAdapter`.
- 419 tests passing, 14 skipped.

## [0.5.5] - 2026-07-08

### Changed
- **Event-driven ingestion (PR3):** replaced monolithic `retineo ingest <path>` with a `SourceAdapter` abstraction.
  - `adapters/source-adapter.ts` defines `SourceAdapter`, `AdapterRegistry`, `SourceDocument`, and `SourceFetchResult`.
  - `adapters/filesystem-adapter.ts` implements `FileSystemSourceAdapter` (`sourceId = filesystem` or `filesystem:<dir>`). Syncs directories recursively, fetches bodies, normalizes non-plain-text files through `AdapterManager`, and falls back to raw read.
  - `services/ingestion-service.ts` defines `IngestionService` and `DefaultIngestionService`. Single entry point `ingest(sourceId, externalId, body, etag, metadata?)` for every source. Computes `contentHash`, skips unchanged etags, runs the full pipeline on change, and writes to `audit_log`.
  - `retineo ingest <path>` now delegates to `FileSystemSourceAdapter` + `IngestionService`.
  - `retineo rebuild` clears Registry + CAS + HNSW and re-syncs registered adapters (filesystem). Supports `--force` to wipe the data directory before rebuilding.
- **Corrupted SQLite handling:** startup detects schema errors in `~/.retineo/retineo.sqlite` and prints a clear message (`retineo rebuild --force` or remove the directory manually) instead of crashing.
- **AdapterManager fallback:** `FileSystemSourceAdapter.fetch()` normalizes PDF/image/audio/video via document adapters; raw read if normalization fails.

### Fixed
- Re-ingesting an unchanged file now returns `action: 'unchanged'` with no duplicate pipeline run and no duplicate embeddings.
- Deleted files in a watched directory are marked `RegistryEntry.status = 'ghost'` on the next `syncSource()`.

### Tests
- Updated `tests/adapters/ingestion.test.ts`, `tests/adapters/multimodal-pipeline.test.ts`, `tests/integration/image-pipeline.test.ts`, `tests/integration/pdf-pipeline.test.ts`, and `tests/cli/ingest-watch.test.ts` for `IngestionService` + `FileSystemSourceAdapter`.
- 419 tests passing, 14 skipped.

## [0.5.4] - 2026-07-08

### Changed
- **Retrieval Cleanup (PR2):** search results are now addressed strictly by `contentHash` and `chunkHash`. `sourcePath` is resolved post-search via the Registry.
  - `search/retrieval-service.ts` returns `CandidateNode` with `contentHash`, `chunkHash`, `score`, `similarity`. `sourcePath` removed from the embedding/index level.
  - `search/context-assembler.ts` injects `sourcePath` during final assembly through `RegistryStore.listByContentHash`. Ghost segments include `isGhost: true` and L2 essence, skipping L0 load.
  - `cli/commands.ts` search/recover updated to use Registry-resolved paths; `recover` only updates `RegistryEntry.status = 'active'`, no filesystem write.
  - `cli/formatters.ts` formats `contentHash` + `sourcePath` pairs and renders ghost badges 👻.
  - `bridge/handlers.ts` responses include `contentHash`, `chunkHash`, `isGhost`, and Registry-resolved `sourcePath`.
- **Audit foundation:** `SQLiteRegistry` implements `AuditService` and writes to the new `audit_log` table.
  - `ingest`, `search`, `recover`, and `rebuild` actions are logged with timestamp, actor, action, optional `resourceHash`, and metadata.
- **Registry compliance fields:** `sources` table extended with `created_at`, `retention_policy`, `sensitivity_level`, and `encryption_key_id` (defaults applied via `ALTER TABLE`).
- **Ghost logic migration:** `ghost/orphan-detector.ts` marks ghosts via `RegistryEntry.status = 'ghost'` and `deletedAt`; `ghost/recovery-service.ts` restores via `status = 'active'`. File-existence checks are no longer the source of truth.

### Fixed
- Ghost results no longer attempt to load missing L0 content; they return L2 summary only.
- `recover` no longer fails when the original filesystem path is absent.

### Tests
- Updated retrieval, bridge, CLI, ghost, and integration tests for the new `contentHash`-first model and audit expectations.
- 419 tests passing, 14 skipped.

## [0.5.3] - 2026-07-08

### Changed
- **Registry/CAS separation (PR1):** L0–L3 are now strictly content-addressable. `contentHash` is the only key inside the content pipeline.
  - `storage/types.ts` introduces `ContentStore`, `RegistryEntry`, and `RegistryStore` interfaces.
  - `storage/cas.ts` persists only `BuildManifest` in `node.json`; `sourcePath`, `sourceRef`, and `parentId` are no longer written to CAS.
  - `storage/registry.ts` now stores `source_id`, `external_id`, `content_hash`, `etag`, `status`, `deleted_at`, and `last_seen_at`. Primary key is `(source_id, external_id)`.
  - `storage/node-builder.ts` builds `ContextNode` from `RegistryEntry + SourceRef + NormalizedContent`; `ContextNode.id` = `contentHash`, segment parent linkage uses `parentHash`.
  - `storage/context-node-repository.ts` resolves sources via `RegistryStore.get(sourceId, externalId)`. It rethrows incompatible-format errors from CAS instead of swallowing them, so v1 objects surface the rebuild instruction.
  - `layers/l1-l3-generator.ts` and `embeddings/hnsw-index.ts` operate only with `contentHash`. `embeddings.jsonl` records use `parentId`/`rootHash` = `contentHash`.
  - `cli/commands.ts` `rebuild`/`recover` operate on `contentHash` via `registry.listByContentHash`.
  - `bridge/types.ts` and `bridge/handlers.ts` expose `SourceResponse` as a `RegistryEntry` view.
- **Data format version:** `BuildManifest.schemaVersion` and `HNSWManifest.schemaVersion` are now `2`. Old v1 `node.json`/`embeddings.jsonl` files are detected on read and throw `Data format v1 is incompatible. Run: retineo rebuild`.
- **SQLite schema guard:** `SQLiteRegistry` detects pre-v2 `sources` tables missing `content_hash` on open and throws the same rebuild instruction before any query runs.
- **`retineo rebuild` v1 fallback:** the CLI entry point now catches the v1 format error for the `rebuild` command, wipes the old SQLite/CAS/index state, and creates a fresh v2 data directory.

### Fixed
- `search/retrieval-service.ts` resolves `sourcePath` for UI citations from the Registry (`externalId`) instead of assuming `parentId` is a filesystem path.
- `cli/worker-script.ts` avoids auto-starting the worker when imported under Vitest, preventing spurious `process.exit(1)` during tests.

### Tests
- Updated all tests to the new `RegistryEntry`/`contentHash` data model.
- 420 tests passing, 14 skipped.

## [0.5.2] - 2026-07-07

### Added
- **CLI intent override:** `retineo search` now accepts `-i, --intent <vague|section|precision>` to force the query intent instead of relying on automatic detection.
- **Multilingual intent rules:** `LanguagePack` now supports optional `intentPatterns` for rule-based intent classification. Built-in packs for English, Russian, and Chinese include regex patterns for `vague`, `section`, and `precision` intents.
- **Cross-lingual concept extraction:** `DefaultL2Generator` prompt now explicitly asks the LLM to include domain/technical terms in both the document language (`concepts`) and English (`conceptsEn`).
- **HNSW index persistence:** `loadOrBuildHNSW` now saves a newly built native `hnsw.bin` index alongside `hnsw.manifest.json`, so the index is reused on subsequent startups instead of being rebuilt from `embeddings.jsonl` each time.

### Changed
- **Intent detection priority:** `DefaultQueryAnalyzer` resolves intent in the order: explicit override → language-pack regex patterns → fallback English rules → LLM-based classification.

### Fixed
- **HNSW native import shape:** `hnswlib-node` is now imported defensively, handling both CJS default and named ESM exports, which fixes `HierarchicalNSW is not a constructor` errors in some environments.

### Tests
- Added `query-analyzer.test.ts` coverage for Russian `vague`/`precision`, Chinese `section`, and explicit intent override.
- Added `packs.test.ts` coverage verifying `intentPatterns` presence in built-in packs.
- Updated `hnsw-index.test.ts` to assert persisted `hnsw.bin` after `loadOrBuildHNSW`.
- 420 tests passing, 14 skipped.

## [0.5.1] - 2026-07-06

### Fixed
- **L1/L3 chunk hash alignment:** `DefaultL1Generator` now computes `contentHash` for every chunk. `DefaultL3Generator` reuses that hash instead of recomputing it, so L1 and L3 chunk IDs match.
- **Exact L0 citations in precision mode:** `DefaultRetrievalService.cascade()` now uses chunk geometry (`charStart`, `charEnd`, `lineStart`, `lineEnd`) from L3 embeddings to return the exact source slice. Falls back to heuristic paragraph search when geometry is absent.
- **Chunk geometry persistence:** `embeddings.jsonl` stores `chunkId`, `lineStart`, `lineEnd`, `charStart`, and `charEnd` for each vector.

### Tests
- Added `retrieval-service.test.ts` coverage for exact L0 slice retrieval when chunk geometry is present.
- 414 tests passing, 14 skipped.

## [0.5.0] - 2026-07-06

### Changed
- **L3 indexes L0 body, not L2 summary:** `DefaultL3Generator` now reads the raw L0 content and L1 chunks for embedding. Search returns citations from original text instead of summary.
- **HNSW is the real search path:** `DefaultRetrievalService` loads `hnsw.bin` at startup and uses it for semantic/hybrid queries. New vectors are added to the index immediately after each `GENERATE_L3` job.
- **Data contract:** `ContextNode` carries `sourcePath`, `parentId`, and optional `semanticLinks`. `node.json` persists these fields alongside `BuildManifest`.
- **Ghost sources in search:** deleted sources are still returned by search with `isGhost = true`; CLI search shows 👻 next to ghost results.

### Added
- CLI command `retineo rebuild` — deletes the global `index/` directory and cached L1/L2 artifacts, then re-queues compilation for all sources.
- Type `SemanticLink` (`targetHash`, `targetPath`, `reason`) and optional `semanticLinks?: SemanticLink[]` on `ContextNode` for future Pro/Plugin L4 features.

### Fixed
- `llm/factory.ts` now actually acquires/releases the `RateLimiter` semaphore inside `wrapWithCircuitBreaker`.
- `storage/secrets.ts` throws `CONFIG_SECRET_NOT_FOUND` instead of silently returning an empty string for missing secrets.
- `llm/providers/ollama.ts` no longer hardcodes a 4096 embedding dimension default.

### Documentation
- Updated `README.md`, `ARCHITECTURE.md`, `CLI.md`, `SEARCH.md`, `PERFORMANCE.md`, `API.md`, `INSTALL.md`, and `structure.md` to match the new L3/HNSW/ghost behavior and version 0.5.0.

### Tests
- 413 tests passing, 14 skipped.

## [0.4.5] - 2026-06-27

### Fixed
- **L1 title extraction:** `DefaultL1Generator` now derives the document title from the first markdown heading, the first non-empty line, or the source filename. This eliminates `Untitled Document` for PDFs, images, and plain-text files.
- **L1 chunking:** documents with only an H1 title now get chunks for the body; long documents without headings are split by `maxLinesPerChunk`. `chunkCount` is now `0` only for empty sources.
- **Empty source handling:** `CompilationPipeline` skips L2/L3 generation when L0 content is empty, avoiding wasted LLM calls.
- **Plain-text log segmentation:** files without markdown headings that contain log-style markers (ISO dates, `ECHO ... COMPLETE`, `STATUS:`) are split into pseudo-sections for navigation.
- **Source context in L1:** `L1Generator.generate` now receives `sourceRef` (URI + MIME type) so generators can use filename and media type.

### Added
- CLI flags `--rebuild-l1` and `--rebuild-l3` for `retineo compile`.

### Tests
- 412 tests passing, 14 skipped.

## [0.4.4] - 2026-06-27

### Fixed
- **Stale README/INSTALL/SECURITY version references:** updated hardcoded `Version: 0.2.0`, test count, install command (`npm install -g @retineo/core`), and supported-versions table to reflect the current `@retineo/core@0.4.x` release.

## [0.4.3] - 2026-06-27

### Fixed
- **Cross-lingual query translation in CLI and MCP:** `bin/retineo.js` and `bin/retineo-mcp.js` now pass the configured LLM provider to `DefaultQueryAnalyzer`, enabling LLM entity extraction and English translation of non-English queries.
- **Entity extraction fallback for non-English keyword queries:** when a Cyrillic/CJK keyword query contains no capitalized words or quoted phrases, `DefaultQueryAnalyzer` now falls back to the meaningful query words as entities so they can be translated and matched against `conceptsEn`.

### Tests
- Added `query-analyzer.test.ts` coverage for the non-English keyword fallback.
- 407 tests passing, 14 skipped.

## [0.4.2] - 2026-06-27

### Fixed
- **L2 generator robustness for local LLMs:** some local models (e.g., Ollama `granite3.1-dense`) omit empty required arrays such as `relations`, `entities`, or `claims`. `DefaultL2Generator` now pre-fills missing arrays with `[]` before Zod validation, preventing spurious parse failures and retries.
- **L2 prompt language fidelity:** added an explicit Russian example and stricter instructions so non-English documents are summarized with concepts in the document's language and English translations in `conceptsEn`.
- **Removed self-dependency:** `@retineo/core` no longer declares itself as a dependency, which avoids duplicate/older copies being installed inside the package.

### Tests
- 406 tests passing, 14 skipped.

## [0.4.1] - 2026-06-27

### Fixed
- **npm package metadata:** deprecated the legacy `retineo-core` package in favor of `@retineo/core` and updated the repository URL to `https://github.com/retineohq/retineo.git`.
- **Transitive dependency vulnerabilities:** added `pnpm.overrides` for `hono >=4.12.27`, `esbuild >=0.28.1`, and `vite ^6.4.3`; `pnpm audit` now reports no actionable vulnerabilities.

## [0.4.0] - 2026-06-27

### Added
- **Full cross-lingual keyword search:**
  - `L2Artifact` now stores `language` and `conceptsEn` (English translation of concepts).
  - `DefaultL2Generator` asks the LLM for document language and English concepts, with heuristic fallback when the LLM omits them.
  - `DefaultL3Generator` indexes both `concepts` and `conceptsEn` in BM25 and preserves Cyrillic/CJK tokens.
  - `DefaultQueryAnalyzer` translates non-English query entities into English via the new `QueryTranslator` and appends them as `[en: ...]` for keyword matching.
  - `LLMQueryTranslator` and `NoOpQueryTranslator` are available; translation can be disabled with `search.crossLingual.translateQuery: "none"`.
  - `DefaultRetrievalService` rerank is now language-aware: it boosts same-language documents and matches query terms against both `concepts` and `conceptsEn`.
- **`retineo compile --rebuild-l2`:** deletes cached `L2.json` artifacts and re-queues `GENERATE_L2` jobs for all sources so existing collections can be upgraded to the multilingual format.
- **Expanded `search.crossLingual` config:** supports `enabled`, `translateQuery` (`none` | `llm`), and `targetLanguages`.

### Fixed
- **BM25 tokenization for non-Latin scripts:** the previous regex stripped all non-Latin characters, making Cyrillic/CJK keyword search return empty results. Tokenization now keeps Cyrillic (`\u0400-\u04FF`) and CJK (`\u4E00-\u9FFF`) characters.

### Tests
- Added/updated tests for `query-translator`, L2 generator language fallback, L3 generator `conceptsEn`/Cyrillic indexing, retrieval-service Cyrillic keyword search, and same-language rerank boost.
- 406 tests passing, 14 skipped.

## [0.3.4] - 2026-06-27

### Fixed
- **Language detection for non-Latin scripts:** `DefaultQueryAnalyzer` now preserves heuristic detection results for Cyrillic, CJK, Arabic, and other non-Latin scripts, even when confidence is below the configured threshold. Short queries like `фрактальная память` are now correctly reported as `ru` instead of being forced back to the default `en`.

### Tests
- Updated `query-analyzer.test.ts` and `end-to-end.test.ts` expectations to reflect correct Russian/Chinese detection.

## [0.2.0] - 2026-06-09

### Architectural Fixes
- **ContextNode First:** New `ContextNodeRepository` — single point of truth for loading/saving `ContextNode` via CAS + Registry. Pipeline and retrieval no longer construct CAS paths directly. `cas.ts` now persists `parentId` and `sourceRef` in `node.json` for full ContextNode reconstruction.
- **HNSW as Default:** `hnswlib-node` promoted from optional to required dependency. `NativeHNSWWrapper` now maintains label→hash mapping (persisted as `.labels.json` alongside `hnsw.bin`). Fallback to `BruteForceHNSW` logs a warning.
- **Okapi BM25:** New `OkapiBM25` class with proper IDF (`log((N-n+0.5)/(n+0.5))`), document length normalization, configurable k1=1.2/b=0.75. `bm25.json` format extended with `docLengths`. Retrieval service uses raw BM25 scores for keyword mode (no threshold filtering).
- **Ghost System Lifecycle:** `DefaultOrphanDetector` detects deleted sources at shutdown. `DefaultGhostRecoveryService` provides list/recover/purge operations. CLI commands: `retineo ghost list`, `retineo ghost recover <hash> [-t path]`, `retineo ghost purge <days>`.
- **Document Hit + L1 Navigation:** New `DocumentHit` aggregation groups chunk hits by source document with coverage/density bonuses. `buildNavigationTree` maps `ChunkHit[]` to `NavigationNode[]` using L1 section hierarchy. Exported: `calculateDocumentScore`, `aggregateDocumentHits`, `buildNavigationTree`.

### Tests
- 408 tests passing (was 365)
- New: ContextNodeRepository (9), DocumentHit/NavigationTree (21), Ghost System (13)

## [0.1.1] - 2026-06-08

### Fixed
- **Ingest deduplication:** `retineo ingest` is now idempotent. Duplicate content from the same path is skipped with no jobs queued; same content from a different path updates the source path without queuing new jobs.
- **Recover file restore:** `retineo recover <hash>` now physically restores the file from CAS storage when the source file is missing, updates the registry path when a copy exists elsewhere, and prints clear errors when CAS content is missing.
- **L3 DEAD job recovery:** `retineo compile` recovers dead `GENERATE_L3` jobs and queues missing L3 jobs for nodes that have completed L2. The worker resets circuit breakers on startup to recover from transient Ollama failures. A 2-second retry delay is added between L3 attempts to give Ollama time to load the model.
- **Circuit breaker messaging:** When the Ollama embedding circuit breaker is open, the error now reads `Ollama embed model not responding — check model settings and ensure Ollama is running` instead of a raw technical message.
- **Config threshold default:** The default `search.semantic.threshold` is now consistently `0.5` across all default config paths (was `0.75` in the CLI wizard inline default).
- **Config subcommands:** `retineo config` now uses subcommands (`set`, `get`, `list`) instead of positional arguments, fixing "too many arguments" errors.
- **Daemon PID lifecycle:** `retineo daemon start` writes the PID file immediately so `stop` and `status` can always locate the process. Stale PID files are cleaned up automatically.

## [0.1.0] - 2026-06-05

### Features
- Content Compilation Engine (L0-L3)
- Content-addressable storage (CAS)
- SQLite registry with job queue
- Adapter IPC (text, markdown, PDF, image OCR)
- Mock multimodal adapters (audio, video)
- LLM Provider Factory (Ollama, OpenAI-compatible)
- Compilation Pipeline (L1/L2/L3 generators)
- Retrieval & Search (multilingual, configurable)
- HTTP API + CLI + MCP
- Structured logging + graceful shutdown
- Health checks + metrics
- Circuit breaker + secrets management
- HNSW index + LRU cache

### Documentation
- Complete documentation suite (15 docs)
