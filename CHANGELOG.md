# Changelog

## [0.1.2] - 2026-06-08

### Fixed
- `init --non-interactive` now requires explicit `--llm-model` and `--embed-model` flags instead of auto-selecting broken defaults
- Ingest deduplication: duplicate ingestion now returns early and does not queue any jobs
- Default `search.semantic.threshold` is now consistently `0.5` across all config paths (was `0.75` in `enPack`)
- `recover` now accepts both `rootHash` and `rawHash`, uses correct CAS object path, and validates file hash against either hash

## [0.1.1] - 2026-06-08

### Fixed
- Ingest deduplication: idempotent ingestion by content hash + source path
- Recover now looks up source path from SQLite registry
- Config command uses subcommands (set/get/list)
- Daemon PID file written immediately for stable lifecycle

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
