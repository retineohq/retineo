# Progress: RETINEO Core v0.1.1 → v0.2.0 Architectural Fixes

## ✅ Completed
- [x] Section 1: ContextNode Drift Fix — ContextNodeRepository, pipeline refactor, CAS parentId persistence
- [x] Section 2: HNSW as Default — hnswlib-node installed, NativeHNSWWrapper label→hash mapping, fallback warning
- [x] Section 3: BM25 → Okapi BM25 — OkapiBM25 class, bm25.json extended format, retrieval service integration
- [x] Section 4: Ghost System Lifecycle — orphan-detector, recovery-service, CLI commands (ghost list/recover/purge)
- [x] Section 5: Document Hit + L1 Navigation — DocumentHit/ChunkHit/NavigationNode types, calculateDocumentScore, buildNavigationTree, aggregateDocumentHits
- [x] structure.md updated with all new files and descriptions

## 🔄 In Progress
- (none)

## 📋 Next Steps
- [ ] E2E smoke test (manual)
- [ ] docs/CHANGELOG.md update
- [ ] Git commit

## 📍 Current Status
All 5 sections implemented. 408/408 tests passing. Build clean. structure.md updated.
