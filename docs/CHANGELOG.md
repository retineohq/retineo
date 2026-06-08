# Changelog

## [0.1.1] - 2026-06-08

### Fixed
- **Ingest deduplication:** `echoc ingest` is now idempotent. Duplicate content from the same path is skipped; same content from a different path updates the source path without queuing new jobs.
- **Recover source path:** `echoc recover <hash>` now queries the SQLite registry to show the real source path instead of `unknown`.
- **Config subcommands:** `echoc config` now uses subcommands (`set`, `get`, `list`) instead of positional arguments, fixing "too many arguments" errors.
- **Daemon PID lifecycle:** `echoc daemon start` writes the PID file immediately so `stop` and `status` can always locate the process. Stale PID files are cleaned up automatically.

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
