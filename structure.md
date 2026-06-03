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
│   ├── search/          # (planned) HNSW, hybrid retrieval, candidate ranking
│   ├── llm/             # (planned) LLM provider abstraction, prompt templates
│   ├── layers/          # (planned) L1/L2/L3 compilation pipelines
│   ├── context/         # (planned) Context assembly, window management
│   ├── ghost/           # (planned) Orphan recovery, garbage collection
│   ├── bridge/          # (planned) HTTP/gRPC API, WebSocket streaming
│   ├── mcp/             # (planned) Model Context Protocol server
│   └── utils/           # (planned) Shared helpers, hash utils, validation
├── tests/
│   └── storage/         # CAS, Registry, NodeBuilder tests
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

### `src/search/` — Retrieval & Ranking (planned)

| File | Exports | Description |
|------|---------|-------------|
| `index.ts` | `(planned)` | Barrel export placeholder. |

### `src/llm/` — LLM Provider Abstraction (planned)

| File | Exports | Description |
|------|---------|-------------|
| `index.ts` | `(planned)` | Barrel export placeholder. |

### `src/layers/` — Compilation Pipelines (planned)

| File | Exports | Description |
|------|---------|-------------|
| `index.ts` | `(planned)` | Barrel export placeholder. |

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
| **Add a new adapter protocol method** | `protocol` | `src/adapters/protocol.ts` | `AdapterMethod`, `JSONRPCRequest` |
| **Implement a custom storage backend** | `CASStorage` interface | `src/storage/cas.ts` | Implement `write`, `read`, `exists`, `writeObject`, `readObject` |
| **Track orphaned objects for later GC** | `Registry` (orphans) | `src/storage/registry.ts` | `insertOrphan`, `recoverOrphan`, `purgeOrphansOlderThan` |
| **Build a search index over compiled nodes** | `(planned)` `search/` | `src/search/` | `embeddings/`, `layers/L3` |
| **Generate vector embeddings for a node** | `(planned)` `embeddings/` | `src/embeddings/` | `ContextNode`, `L2Artifact` |
| **Expose ECHO over HTTP/WebSocket** | `(planned)` `bridge/` | `src/bridge/` | `mcp/`, `context/` |
| **Serve as an MCP server** | `(planned)` `mcp/` | `src/mcp/` | `bridge/`, `search/` |

---

## Maintenance Rules

1. **Immutability**: Objects under `objects/{hash}/` are immutable. Never modify after creation. New version = new hash.
2. **Schema changes**: If `src/storage/schema.sql` changes, document migration strategy in the PR and update `Registry` row helpers if column names shift.
3. **No overlapping responsibility**: Before adding a new file, check the Functional Cross-Reference Index. If the capability exists, extend the existing module rather than creating a parallel one.
4. **Barrel exports**: Every `src/{dir}/` must have an `index.ts` that re-exports public symbols. Tests and consumers import from the barrel, never deep-import.
5. **Planned markers**: Directories or files not yet implemented must be marked `(planned)` in this file. Remove the marker only when code is merged and tested.
6. **Test parity**: Every public export in `src/storage/` (and future layers) must have corresponding tests in `tests/{dir}/`. Update test tables when adding new test files.
