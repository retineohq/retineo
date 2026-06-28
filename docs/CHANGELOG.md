# Changelog

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
