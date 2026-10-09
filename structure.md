# RETINEO Memory Core — Repository Structure

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
├── packages/memory-core/   # Persistent epistemic memory core (clean rewrite per HANDOFF Phase 7)
│   ├── src/
│   ├── domain/         # Typed entities, value objects, IDs (17 entities, M1–M20 invariants)
│   ├── ports/          # Repository/Journal/Transaction/Identity/Decision/Policy/Representation/Segment/Extraction/Embedding interfaces
│   ├── adapters/       # InMemory + SQLite adapters, ingestion, extraction models, embedding models
│   ├── core/           # MemoryCore service (30+ operations, atomic mutations, journal) + QueryEngine
│   ├── api/            # HTTP server (Fastify, 13 endpoints) + MCP server (9 tools)
│   ├── bin/            # memory-core CLI (serve, ingest, journal, extract, query, mcp)
│   ├── experiments/    # Programmatic validation of Phase 4–5 (5/5 passing)
│   └── tests/          # 65 deterministic tests, no AI/network
├── docs/                # Documentation
│   ├── semantic-model/  # Phase 1–6 experiment artifacts + STATUS + ROADMAP-DETAIL + WORKING-CONVENTIONS
│   └── DEPRECATED.md    # Legacy docs index (old architecture, deprecated)
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
│   ├── semantic-model/    # NEW: Phase 1–6 experiment artifacts + Phase 4–5 experiments
│   │   ├── HANDOFF_Q.md                            # Concrete Semantic Model v0.1 (doc A)
│   │   ├── RETINEO-MEMORY-CORE-DOMAIN-SPEC-v0.1.md # Concrete Semantic Model v0.1 (doc B)
│   │   ├── RETINEO-MEMORY-CORE-TECHNICAL-SPEC-v0.2.md # Concrete Semantic Model v0.1 (doc C)
│   │   ├── phase4-retrieval-experiment.md           # Phase 4: chunk vs essence vs knowledge vs context retrieval
│   │   ├── phase5-compression-experiment.md         # Phase 5: compression ratio vs semantic/relationship recall
│   │   └── phase6-domain-model.md                   # Phase 6: minimal domain model definition
├── .github/
│   ├── workflows/
│   │   ├── ci.yml       # CI: test on PR/push (Node 20, 22, pnpm)
│   │   └── release.yml  # CD: publish npm + build binaries + GitHub Release
│   └── release.yml      # Release notes category configuration
├── CHANGELOG.md         # Version history
├── structure.md         # This file
├── package.json         # @retineo/memory-core. Dependencies: better-sqlite3, fastify, @modelcontextprotocol/sdk.
├── eslint.config.mjs    # Flat ESLint config: @eslint/js + typescript-eslint + globals
├── tsconfig.json
└── README.md
```

---

## Directory Reference

### `packages/memory-core/src/domain/` — Domain Entities & Value Objects

| File               | Exports                                                                                          | Description                                        |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `ids.ts`           | `SourceId`, `EvidenceId`, `ObjectId`, `ClaimId`, `RelationshipId`, `ContextId`, etc. + `createId` | Typed ID aliases with prefixes (obj:, claim:, ev:). |
| `value-objects.ts` | `TemporalState`, `SupportState`, `ScopeQualifier`, lifecycle enums, `PredicateType`, `RelationType`, `SemanticClass` | Value objects. Temporal, support, scope — устраняют потери Phase 5. |
| `entities.ts`      | `Source`, `SourceItem`, `SourceVersion`, `Evidence`, `Object`, `Claim`, `Relationship`, `Context`, `ContextMembership`, `KnowledgeGap`, `Provenance`, `Candidate`, `Decision`, `Policy`, `SemanticRepresentation`, `JournalEvent`, `Segment` | 17 typed entities. Claim — ключевая сущность. |

### `packages/memory-core/src/ports/` — Interfaces

| File               | Exports                                                                                            | Description                                |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `repositories.ts`  | `ObjectRepository`, `ClaimRepository`, `RelationshipRepository`, `ContextRepository`, `MembershipRepository`, `GapRepository`, `EvidenceRepository`, `ProvenanceRepository`, `SourceRepository`, `SourceItemRepository`, `SourceVersionRepository`, `TransactionPort`, `IdentityResolver` | 11 repository interfaces + transaction + identity |
| `journal.ts`       | `Journal`                                                                                           | Atomic journal append + all() + sequence() |
| `lifecycle.ts`     | `CandidateRepository`, `DecisionRepository`, `PolicyRepository`, `DecisionModel`, `PolicyModel`    | Candidate → Decision → Policy pipeline     |
| `representation.ts`| `RepresentationRepository`, `RepresentationModel`                                                  | SemanticRepresentation (summary/essence/embedding) |
| `segment.ts`       | `SegmentRepository`, `SegmentSecurityModel`                                                        | Portable memory segments + hash/signature  |
| `extraction.ts`    | `ExtractionModel`, `ExtractionResult`, `ExtractedClaim`, `ExtractedRelationship`                   | Evidence → candidates extraction           |
| `embedding.ts`     | `EmbeddingModel`, `EmbeddingVector`                                                                | Embedding + cosine similarity (replaceable)|

### `packages/memory-core/src/adapters/` — Implementations

| Directory   | Contents                                                                                                   | Description                                |
| ----------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `inmemory/` | Все repository implementations, `InMemoryJournal`, `InMemoryTransaction`, `InMemoryIdentityResolver`, `DeterministicDecisionModel`, `PermissivePolicyModel`, `TrivialRepresentationModel`, `RegexExtractionModel`, `HashEmbeddingModel`, `TrivialSegmentSecurityModel` | Reference adapter. Детерминированный, тестовый. |
| `sqlite/`   | SQLite версии всех репозиториев, `SqliteDatabase`, `SqliteJournal`, `SqliteTransaction`, `SqliteIdentityResolver`, `schema.sql` | Persistent adapter (Stage 2). WAL mode. |
| `ingestion/`| `FilesystemSourceAdapter`                                                                                  | Source → SourceItem → SourceVersion → Evidence (Stage 3). |

### `packages/memory-core/src/core/` — Domain Service

| File              | Exports                                                                 | Description                                |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| `memory-core.ts`  | `MemoryCore`, `MemoryCoreDeps`                                          | 30+ операций: objects, claims, relationships, contexts, membership, gaps, evidence, provenance, candidate/decision/policy, representations, merge, journal, segments (export/import), extract, ingestDirectoryAsync |
| `query-engine.ts` | `QueryEngine`, `EntryPointsResult`, `KnowledgeQueryResult`, `ContextReconstructionResult` | findEntryPoints (essence matching), knowledgeQuery (claims/relationships), reconstructContext (multi-hop) |

### `packages/memory-core/src/api/` — External Interfaces

| File            | Exports                                        | Description                                |
| --------------- | ----------------------------------------------- | ------------------------------------------ |
| `http-server.ts`| `createHttpServer`, `startHttpServer`          | Fastify, 13 endpoints (health, objects, claims, relationships, contexts, query, segments, journal) |
| `mcp-server.ts` | `MemoryCoreMCPServer`, `MCPServerOptions`      | MCP stdio, 9 tools                          |

### `packages/memory-core/bin/` — CLI

| File              | Commands                                   | Description                                |
| ----------------- | ------------------------------------------- | ------------------------------------------ |
| `memory-core.js`  | serve, ingest, journal, extract, query, mcp | SQLite default db, HTTP port 7900          |

### `packages/memory-core/experiments/` — Validation

| File                        | Description                                                | Result     |
| --------------------------- | ---------------------------------------------------------- | ---------- |
| `validate-phase4-5.ts`      | Программная валидация Phase 4–5 (5 тестов, HashEmbeddingModel) | 5/5 pass   |

### `packages/memory-core/tests/` — Tests

| File                  | Description                                   | Count  |
| --------------------- | --------------------------------------------- | ------ |
| `memory-core.test.ts` | 16-step milestone + M1–M20 invariants + pipeline + HTTP + MCP + SQLite persistence | 65     |

## Functional Cross-Reference Index

> Lookup: "I want to do X" → start here.

### Memory Core (new package — persistent epistemic memory)

| Task                                                    | Primary Module                                 | Import Path                                         | Related                                                          |
| ------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| **Build typed domain entity**                            | `domain/entities.ts`                            | `packages/memory-core/src/domain/entities.ts`       | `ids.ts`, `value-objects.ts`, 17 typed entities                  |
| **Create memory objects/claims/relationships atomically**| `MemoryCore`                                    | `packages/memory-core/src/core/memory-core.ts`      | 25 operations, every mutation journaled                          |
| **Propose candidate → decide → apply policy**           | `MemoryCore.proposeCandidate/decide/applyPolicy`| `packages/memory-core/src/core/memory-core.ts`      | `DecisionModel`, `PolicyModel` — replaceable providers           |
| **Generate semantic representation (summary/essence)**  | `MemoryCore.createSemanticRepresentation`       | `packages/memory-core/src/core/memory-core.ts`      | `RepresentationModel` port, rebuildable, not memory              |
| **Traverse relationships (multi-hop context)**          | `MemoryCore.traverseRelationships`              | `packages/memory-core/src/core/memory-core.ts`      | Depth limit, skips superseded, identity-aware                    |
| **Export/verify portable memory segment**               | `MemoryCore.exportSegment/verifySegment`        | `packages/memory-core/src/core/memory-core.ts`      | `SegmentSecurityModel`, hash + signature                         |
| **Get agent context package**                            | `MemoryCore.getAgentContext`                    | `packages/memory-core/src/core/memory-core.ts`      | objects/claims/relationships/evidence/knownGaps                  |
| **Merge objects preserving history**                    | `MemoryCore.mergeObjects`                       | `packages/memory-core/src/core/memory-core.ts`      | Tombstone + redirect, M5 invariant                               |
| **Resolve identity redirects**                          | `InMemoryIdentityResolver`                      | `packages/memory-core/src/adapters/inmemory/identity-resolver.ts` | Circular redirect detection                        |
| **Run deterministic in-memory core**                    | `InMemory*` adapters                            | `packages/memory-core/src/adapters/inmemory/`       | Reference adapter, test fixture                                  |
| **Verify memory invariants M1–M20**                     | `packages/memory-core/tests/`                   | `packages/memory-core/tests/memory-core.test.ts`    | 27 tests, no AI/DB/network                                       |

---

## Maintenance Rules

1. **Immutability**: Evidence and SourceVersion are immutable (M2, M3). New version = new ID.
2. **Schema changes**: If `packages/memory-core/src/adapters/sqlite/schema.sql` changes, document migration strategy in the PR.
3. **No overlapping responsibility**: Before adding a new file, check the Functional Cross-Reference Index. If the capability exists, extend the existing module rather than creating a parallel one.
4. **Barrel exports**: Every `src/{dir}/` must have an `index.ts` that re-exports public symbols. Tests and consumers import from the barrel, never deep-import.
5. **Planned markers**: Directories or files not yet implemented must be marked `(planned)` in this file. Remove the marker only when code is merged and tested.
6. **Test parity**: Every public export must have corresponding tests in `packages/memory-core/tests/`. Update test tables when adding new test files.
7. **Invariants**: All 20 invariants M1–M20 must keep test coverage. Any change to MemoryCore must verify invariant tests still pass.
