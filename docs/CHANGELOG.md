# Changelog

## [0.1.1] - 2026-06-08

### Fixed
- **Ingest deduplication:** `echoc ingest` is now idempotent. Duplicate content from the same path is skipped with no jobs queued; same content from a different path updates the source path without queuing new jobs.
- **Recover file restore:** `echoc recover <hash>` now physically restores the file from CAS storage when the source file is missing, updates the registry path when a copy exists elsewhere, and prints clear errors when CAS content is missing.
- **L3 DEAD job recovery:** `echoc compile` recovers dead `GENERATE_L3` jobs and queues missing L3 jobs for nodes that have completed L2. The worker resets circuit breakers on startup to recover from transient Ollama failures. A 2-second retry delay is added between L3 attempts to give Ollama time to load the model.
- **Circuit breaker messaging:** When the Ollama embedding circuit breaker is open, the error now reads `Ollama embed model not responding — check model settings and ensure Ollama is running` instead of a raw technical message.
- **Config threshold default:** The default `search.semantic.threshold` is now consistently `0.5` across all default config paths (was `0.75` in the CLI wizard inline default).
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
