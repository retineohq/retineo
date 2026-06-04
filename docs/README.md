# ECHO Core Documentation

## Quick Start
- [Installation](INSTALL.md)
- [Getting Started](GETTING_STARTED.md)
- [CLI Usage](CLI.md)
- [HTTP API](API.md)

## Developer Guides
- [Architecture Overview](ARCHITECTURE.md)
- [Writing Adapters](ADAPTER_GUIDE.md)
- [Contributing](CONTRIBUTING.md)
- [LLM Providers](LLM_PROVIDERS.md)

## Operations & Hardening
- [Health Checks & Metrics](HEALTH.md) — Liveness/readiness probes, Prometheus export
- [Security & Secrets](SECURITY.md) — Encrypted secrets, error codes, recommendations
- [Performance](PERFORMANCE.md) — HNSW, Parquet, batch embedding, LRU cache, benchmarks
- [Logging](LOGGING.md) — Structured logging configuration & events
- [Operations](OPERATIONS.md) — Graceful shutdown, health checks, monitoring

## Reference
- [Multilingual Support](MULTILINGUAL.md) — Language packs, detection, cross-lingual search
- [Domain Types](../packages/core/src/domain/types.ts) — TypeScript interfaces
- [Storage Schema](../packages/core/src/storage/schema.sql) — SQLite DDL
- [Repository Structure](../structure.md) — Codebase navigation
