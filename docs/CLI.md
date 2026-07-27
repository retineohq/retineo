# RETINEO Core CLI Guide

## Installation

```bash
npm install -g retineo
# or run locally:
node bin/retineo.js <command>
```

> `retineo` is also available as an alias for `retineo`.

## First-Run Setup

Before any ingest or search, run the interactive setup wizard once:

```bash
retineo init
```

The wizard detects Ollama (or lets you enter a cloud API key), picks a chat model and embedding model, chooses a data directory and bridge port, writes `~/.retineo/config.yaml`, initializes the SQLite database, and offers to start a background worker. See [`GETTING_STARTED.md`](GETTING_STARTED.md) for the full first-run flow.

For CI / scripted installs, use:

```bash
retineo init --non-interactive --llm-model gemma4:31b-cloud --embed-model nomic-embed-text-v2-moe:latest
# Honours: RETINEO_DATA_DIR, RETINEO_LLM_MODEL, RETINEO_EMBED_MODEL,
# RETINEO_BRIDGE_PORT, OLLAMA_BASE_URL
```

> **Note:** `--non-interactive` requires explicit `--llm-model` and `--embed-model` flags. If omitted, it prints an error and exits with code 1.

## Commands

### `retineo init [--non-interactive --llm-model <m> --embed-model <m>]`

Run the interactive setup wizard (or non-interactive with explicit model flags).

```bash
retineo init                          # interactive wizard
retineo init --non-interactive --llm-model gemma4:31b-cloud --embed-model nomic-embed-text-v2-moe:latest
```

### `retineo ingest <filePath> [--watch] [--timeout <sec>]`

Ingest a file or directory into the knowledge base via `FileSystemSourceAdapter`. Files are normalized through the document `AdapterManager` by extension (PDF, image, audio, video) or read as raw text. With `--watch`, block until all queued jobs are `COMPLETED` (or any fails).

```bash
retineo ingest ./notes.md
retineo ingest ./doc.pdf
retineo ingest ~/test.md --watch --timeout 600
retineo ingest ./docs            # sync whole directory
```

**Idempotency:** `ingest` is idempotent.
- Same content hash + same `externalId` → `action: unchanged`, no pipeline run.
- New content hash → `action: updated`, full ingest + `GENERATE_L1` jobs queued.
- Same content at a different path → new `RegistryEntry` for that path; the original path becomes a ghost on the next source sync.

When `watch` is enabled, `ingest` checks if a background worker is running; if not, it starts an inline worker in the same process. It polls the jobs table every 5 seconds and exits with code `1` if any job fails or the timeout (default 1800s) elapses.

### `retineo health <path>`

Analyze the health of an ingested directory and print a diagnostic JSON report.

```bash
retineo health ./docs
retineo health /tmp/test-vault
```

**Report fields:**
- `score` — integer 0–100 (weighted UX score, not a scientific metric).
- `strong` — list of healthy aspects (e.g., `good connectivity`, `few duplicates`).
- `attention` — concrete findings with `type`, `severity`, `documents`, and `reason`.
  - `documents` is an array of `{ "contentHash": "sha256", "sourcePath": "/path/to/doc.md" }` objects. `sourcePath` is omitted when the Registry cannot resolve one (e.g. unresolved ghosts).
- `recommendations` — actionable next steps. Findings of the same type are grouped into one recommendation when there are more than 3 of that type; otherwise each finding gets its own recommendation using the readable `sourcePath`.
- `advancedMetrics` — Pro/Enterprise metrics (`fragmentation`, `contradictions`, `topicDistribution`) not implemented in Core.

The command first syncs the directory via `FileSystemSourceAdapter`, waits for pending jobs to drain, then runs `HealthAnalyzer.analyze(sourceId)`. Progress logging (`synced N changed, M ghosts`) is emitted on `stderr`; `stdout` is the JSON report only. Exit code is `1` if `score < 50` (useful for CI gates).

### `retineo search <query>`

Search the knowledge base.

```bash
retineo search "machine learning"
retineo search "deep learning" --language en --mode hybrid --top-k 10 --json
```

### `retineo similar <hash>`

Find documents semantically similar to a given document.

```bash
retineo similar <hash>
retineo similar <hash> --top-k 10 --threshold 0.8
retineo similar <hash> --json
```

Default output is a table of `contentHash | similarity | sourcePath`. Use `--json` for raw `SimilarDocument[]`. Exit code is `0` for empty results, `1` if the index is empty (run `retineo ingest <path>` first).

### `retineo status`

Show engine status.

```bash
retineo status
```

### `retineo compile [filePath] [--watch] [--timeout <sec>] [--provider <id>] [--rebuild-l1] [--rebuild-l2] [--rebuild-l3]`

Compile pending jobs or a specific file. Same `--watch` semantics as `ingest`.

```bash
retineo compile
retineo compile ./notes.md --layer l2 --watch
retineo compile ./notes.md --provider ollama   # override config provider for this run
retineo compile ./notes.md --provider mock     # explicitly use mock for testing
retineo compile --rebuild-l1                   # regenerate L1, L2 and L3 for all sources
retineo compile --rebuild-l2                   # regenerate L2 and L3 for all sources
retineo compile --rebuild-l3                   # rebuild the global L3 index from existing L2 artifacts
```

When run without a file path, `compile` also:
- **Recovers dead L3 jobs** — scans for `GENERATE_L3` jobs in `DEAD` status and re-queues them.
- **Queues missing L3 jobs** — finds nodes that have completed L2 but have no L3 job (pending, running, completed, or dead) and enqueues `GENERATE_L3`.

The `--provider` flag overrides the configured `llm.defaultProvider` for this compilation only. If the provider id is not found in `config.yaml`, the command exits with an error listing available providers.

Rebuild flags affect the whole collection and cannot be combined with a `filePath`:
- `--rebuild-l1` deletes cached `L1.md` / `L1.index.json` and re-queues L1→L2→L3 for every source.
- `--rebuild-l2` deletes cached `L2.json` and re-queues L2→L3 for every source.
- `--rebuild-l3` deletes the global `index/` directory and re-queues L3 for every node that already has L2.

### `retineo rebuild [--force]`

Full collection rebuild. Use after schema changes (for example, when `schemaVersion` changes), to recover from a corrupted SQLite database, or when you want a clean recompile.

```bash
retineo rebuild
retineo rebuild --force            # wipe data dir before rebuilding
```

What it does:
1. With `--force`, wipes the entire data directory first.
2. Clears Registry, CAS, and the global `index/` directory (`embeddings.jsonl`, `hnsw.bin`, `hnsw.manifest.json`, `bm25.json`).
3. Re-syncs every registered filesystem source; new/changed files are ingested, deleted files become ghosts.
4. The pipeline naturally chains `L1` → `L2` → `L3`.

> **Note:** This is a destructive local operation. It only affects compiled artifacts and the registry in the data directory; original source files are untouched.

### `retineo config set|get|list`

Read or write config values.

```bash
retineo config list                          # show full config
retineo config get search.defaultLanguage    # read one key
retineo config set search.defaultLanguage ru # write one key
```

### `retineo jobs`

List recent jobs.

```bash
retineo jobs
```

### `retineo recover <hash>`

Recover a file from CAS storage back to its original source path, or update the registry to point to an existing copy. Accepts either the content hash (`rootHash`) or the raw file hash (`rawHash`).

```bash
retineo recover deadbeef...
```

**Behavior:**
- Looks up the source by `rootHash` first, then falls back to `rawHash`.
- If the file already exists at the registered path and its SHA-256 matches → prints `Already valid: <hash> → <path>`.
- If the file is missing but CAS content exists → restores `content.md` from the object store to the source path (creating parent directories if needed) and prints `Recovered: <hash> → <path> (file restored from CAS)`.
- If the file exists at a different registered path with the same hash → updates the registry `sourcePath` and prints `Recovered: <hash> → <path> (path updated to existing file)`.
- If CAS content is missing → prints `Recover failed: <hash> — content not found in CAS storage`.

### `retineo key set/get/delete/list`

Manage API keys stored encrypted in `~/.retineo/secrets.json`.

```bash
retineo key set openai sk-xxxxxxxx
retineo key get openai        # masked
retineo key delete openai
retineo key list
```

### `retineo doctor`

Check external dependencies (ffmpeg, tesseract, whisper.cpp, Ollama).

## Service Lifecycle

RETINEO Core runs long-lived background services that are normally spawned by the daemon. Each service uses a PID file in `~/.retineo/` for liveness tracking.

### `retineo worker start|stop|status|logs`

Manage the background compilation worker. The worker drains the `jobs` table and runs L1 → L2 → L3 generation.

```bash
retineo worker start              # spawn detached, write ~/.retineo/worker.pid
retineo worker status             # running/stopped + PID + job counts
retineo worker stop               # SIGTERM, wait 5s, SIGKILL if needed
retineo worker logs -n 100        # last 100 lines
retineo worker logs -f            # tail -f
```

If no worker is running, `retineo ingest --watch` starts one inline.

### `retineo bridge start|stop|status|logs`

Manage the HTTP API bridge (Fastify on `127.0.0.1:37891` by default).

```bash
retineo bridge start
retineo bridge status
curl http://localhost:37891/v1/health   # verify
retineo bridge stop
```

### `retineo daemon start|stop|status|logs`

Run the worker and bridge in a single process. Graceful shutdown order on SIGTERM: bridge → worker → registry.

```bash
retineo daemon start
retineo daemon status
retineo daemon logs -f
retineo daemon stop
```

The PID file is written immediately when `start` spawns the process, so `stop` and `status` can always locate the daemon. If the daemon exits immediately after start, the PID file is cleaned up automatically.

This is the recommended way to run RETINEO Core in production / for desktop use.
