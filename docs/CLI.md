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

Ingest a file into the knowledge base. With `--watch`, block until all queued jobs are `COMPLETED` (or any fails).

```bash
retineo ingest ./notes.md
retineo ingest ./doc.pdf --adapter pdf
retineo ingest ~/test.md --watch --timeout 600
```

**Idempotency:** `ingest` is idempotent.
- Same content hash + same path → prints `Skipped: already ingested (hash: ...)` and does **not** queue any jobs.
- Same content hash + different path → updates the source path in the registry, prints `Updated source path`, and does **not** queue any jobs.
- New content hash → full ingest + `GENERATE_L1` jobs queued as usual.

When `watch` is enabled, `ingest` checks if a background worker is running; if not, it starts an inline worker in the same process. It polls the jobs table every 5 seconds and exits with code `1` if any job fails or the timeout (default 1800s) elapses.

### `retineo search <query>`

Search the knowledge base.

```bash
retineo search "machine learning"
retineo search "deep learning" --language en --mode hybrid --top-k 10 --json
```

### `retineo status`

Show engine status.

```bash
retineo status
```

### `retineo compile [filePath] [--watch] [--timeout <sec>] [--provider <id>]`

Compile pending jobs or a specific file. Same `--watch` semantics as `ingest`.

```bash
retineo compile
retineo compile ./notes.md --layer l2 --watch
retineo compile ./notes.md --provider ollama   # override config provider for this run
retineo compile ./notes.md --provider mock     # explicitly use mock for testing
```

When run without a file path, `compile` also:
- **Recovers dead L3 jobs** — scans for `GENERATE_L3` jobs in `DEAD` status and re-queues them.
- **Queues missing L3 jobs** — finds nodes that have completed L2 but have no L3 job (pending, running, completed, or dead) and enqueues `GENERATE_L3`.

The `--provider` flag overrides the configured `llm.defaultProvider` for this compilation only. If the provider id is not found in `config.yaml`, the command exits with an error listing available providers.

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
