# Progress: ECHO Core — Ingestion Bug Fix

## ✅ Completed
- [x] Diagnosed root cause: `bin/echo-core.js` used mock deps instead of real services
- [x] Rewrote `bin/echo-core.js` to wire real services (SQLiteRegistry, CAS, IngestionService, Logger)
- [x] Fixed `SQLiteRegistry.initSchema()` to use `IF NOT EXISTS` for CREATE TABLE/INDEX
- [x] Fixed logger to create `~/.echo/logs/` directory before writing
- [x] Fixed adapter CJS/ESM compatibility: renamed all adapters to `.cjs`
- [x] Fixed `LineDelimitedJSONTransport` to set `NODE_PATH` for temp dir module resolution
- [x] Updated all test files to reference `adapter.cjs`
- [x] Updated inline test adapters to use CJS `require()` syntax
- [x] All 305 tests pass
- [x] Build clean
- [x] All acceptance criteria verified

## 🔄 In Progress
- (none)

## 📋 Next Steps
- (none — task complete)

## 📍 Current Status
**DONE.** Ingestion pipeline fully functional. `echoc ingest` writes to SQLite, queues jobs, creates CAS objects, and writes structured JSON logs. Root cause was CLI entry point using mock services instead of real ones.
