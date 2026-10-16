# Changelog

## 0.7.2 (2026-10-17)

- CLI: `ingest`, `extract`, `extract-async` now pass `tenantId` (`TENANT_ID` env or `default`) into the pipeline, fixing NOT NULL constraint on `sources.tenant_id`.

## 0.7.1 (2026-10-17)

- Same as 0.7.0 plus fixed npm entry points (`main`/`types`) for the root package.

## 0.7.0 (2026-10-16)

### Wave 1–4 summary

- Epistemic memory core: domain, ports, in-memory adapters, M1–M20 invariants.
- SQLite persistent adapter with migrations; Postgres adapter (full repositories, schema, migrations runner, pg executor).
- REST API, CLI, MCP server.
- AI adapters: OpenRouter extraction, Ollama extraction and embeddings.
- Query engine: entry points, knowledge query, context reconstruction, multi-hop paths.
- Multi-tenancy (tenantId on core entities), sensitivity levels, ACL model.
- Agent context filtering, stored agent policies with `PolicyBasedAgentAccessModel`.
- Journal-based replication: REST pull/push, pull-loop adapter, idempotent apply, Bearer auth option.

### Runtime

- CLI storage switch: `STORAGE=postgres DATABASE_URL=... memory-core serve`.
- CLI replication: `memory-core replicate-pull <sourceUrl> [dbFile]` with `REPLICATION_TOKEN`.

### Tests

- 146 passing (+1 Postgres integration skipped without `DATABASE_URL`).
