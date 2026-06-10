# Handoff: Architectural Fixes v0.2.0

## Status: COMPLETE

### What's Done
- [x] **Section 1: ContextNode Drift Fix** — `ContextNodeRepository` created, pipeline refactored to load/save via repository, `cas.ts` updated to persist `parentId` and `sourceRef` in `node.json`
- [x] **Section 2: HNSW as Default** — `hnswlib-node` installed as dependency, `NativeHNSWWrapper` now maps labels→hashes, save/load preserves mapping via `.labels.json`, fallback warns via logger
- [x] **Section 3: BM25 → Okapi BM25** — `OkapiBM25` class with IDF/k1/b, `bm25.json` extended format (`invertedIndex` + `docLengths`), retrieval service uses raw BM25 scores (no normalization, keyword mode skips threshold)
- [x] **Section 4: Ghost System Lifecycle** — `DefaultOrphanDetector` (detects deleted sources), `DefaultGhostRecoveryService` (list/recover/purge), CLI commands (`retineo ghost list/recover/purge`)
- [x] **Section 5: Document Hit + L1 Navigation** — `DocumentHit`/`ChunkHit`/`NavigationNode` types, `calculateDocumentScore` (coverage/density bonus), `buildNavigationTree` from L1 sections, `aggregateDocumentHits` groups chunks by document

### Tests
- Total: 408 tests
- Passing: 408 tests
- New tests: 43 tests (9 ContextNodeRepository + 21 DocumentHit/Navigation + 13 Ghost System)

### Files Changed/Created

**New files:**
- `packages/core/src/storage/context-node-repository.ts`
- `packages/core/src/search/bm25.ts`
- `packages/core/src/ghost/orphan-detector.ts`
- `packages/core/src/ghost/recovery-service.ts`
- `packages/core/src/ghost/index.ts`
- `tests/storage/context-node-repository.test.ts`
- `tests/search/document-hit.test.ts`
- `tests/search/navigation-tree.test.ts`
- `tests/ghost/orphan-detector.test.ts`
- `tests/ghost/recovery-service.test.ts`
- `tests/cli/ghost-commands.test.ts`

**Modified files:**
- `packages/core/src/layers/pipeline.ts` — uses ContextNodeRepository
- `packages/core/src/search/retrieval-service.ts` — OkapiBM25, DocumentHit types
- `packages/core/src/embeddings/hnsw-index.ts` — label→hash mapping, fallback warning
- `packages/core/src/storage/cas.ts` — persists parentId/sourceRef in node.json
- `packages/core/src/storage/index.ts` — barrel export
- `packages/core/src/layers/l3-generator.ts` — extended bm25.json format
- `packages/core/src/cli/commands.ts` — ghost commands
- `packages/core/src/cli/index.ts` — ghost CLI subcommands
- `packages/core/src/cli/daemon.ts` — contextNodeRepository in pipeline deps
- `packages/core/src/cli/worker-script.ts` — contextNodeRepository in pipeline deps
- `structure.md` — all new files documented

### Known Issues
- None. All tests pass, build clean.

### Next Steps
- E2E smoke test with real Ollama
- `docs/CHANGELOG.md` v0.2.0 entry
- `docs/ARCHITECTURE.md` update for ContextNode, HNSW, BM25, Ghost, DocumentHit
- Git commit: `fix(architecture): v0.2.0 — ContextNode drift, HNSW default, Okapi BM25, Ghost lifecycle, DocumentHit`
