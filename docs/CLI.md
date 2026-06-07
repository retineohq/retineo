# ECHO Core CLI Guide

## Installation

```bash
npm install -g echo-core
# or run locally:
node bin/echo-core.js <command>
```

> `echo-core` is also available as an alias for `echoc`.

## First-Run Setup

Before any ingest or search, run the interactive setup wizard once:

```bash
echoc init
```

The wizard detects Ollama (or lets you enter a cloud API key), picks a chat model and embedding model, chooses a data directory and bridge port, writes `~/.echo/config.yaml`, initializes the SQLite database, and offers to start a background worker. See [`GETTING_STARTED.md`](GETTING_STARTED.md) for the full first-run flow.

For CI / scripted installs, use:

```bash
echoc init --non-interactive
# Honours: ECHO_DATA_DIR, ECHO_LLM_MODEL, ECHO_EMBED_MODEL,
# ECHO_BRIDGE_PORT, OLLAMA_BASE_URL
```

## Commands

### `echoc init [--non-interactive]`

Run the interactive setup wizard (or non-interactive with `--non-interactive`).

```bash
echoc init                          # interactive wizard
echoc init --non-interactive        # use env vars, no prompts
```

### `echoc ingest <filePath> [--watch] [--timeout <sec>]`

Ingest a file into the knowledge base. With `--watch`, block until all queued jobs are `COMPLETED` (or any fails).

```bash
echoc ingest ./notes.md
echoc ingest ./doc.pdf --adapter pdf
echoc ingest ~/test.md --watch --timeout 600
```

When `watch` is enabled, `ingest` checks if a background worker is running; if not, it starts an inline worker in the same process. It polls the jobs table every 5 seconds and exits with code `1` if any job fails or the timeout (default 1800s) elapses.

### `echoc search <query>`

Search the knowledge base.

```bash
echoc search "machine learning"
echoc search "deep learning" --language en --mode hybrid --top-k 10 --json
```

### `echoc status`

Show engine status.

```bash
echoc status
```

### `echoc compile [filePath] [--watch] [--timeout <sec>]`

Compile pending jobs or a specific file. Same `--watch` semantics as `ingest`.

```bash
echoc compile
echoc compile ./notes.md --layer l2 --watch
```

### `echoc config [key] [value]`

Read or write config values.

```bash
echoc config
echoc config search.defaultLanguage
echoc config search.defaultLanguage ru
```

### `echoc jobs`

List recent jobs.

```bash
echoc jobs
```

### `echoc recover <hash>`

Recover an orphaned node.

```bash
echoc recover deadbeef...
```

### `echoc key set/get/delete/list`

Manage API keys stored encrypted in `~/.echo/secrets.json`.

```bash
echoc key set openai sk-xxxxxxxx
echoc key get openai        # masked
echoc key delete openai
echoc key list
```

### `echoc doctor`

Check external dependencies (ffmpeg, tesseract, whisper.cpp, Ollama).

## Service Lifecycle

ECHO Core runs long-lived background services that are normally spawned by the daemon. Each service uses a PID file in `~/.echo/` for liveness tracking.

### `echoc worker start|stop|status|logs`

Manage the background compilation worker. The worker drains the `jobs` table and runs L1 → L2 → L3 generation.

```bash
echoc worker start              # spawn detached, write ~/.echo/worker.pid
echoc worker status             # running/stopped + PID + job counts
echoc worker stop               # SIGTERM, wait 5s, SIGKILL if needed
echoc worker logs -n 100        # last 100 lines
echoc worker logs -f            # tail -f
```

If no worker is running, `echoc ingest --watch` starts one inline.

### `echoc bridge start|stop|status|logs`

Manage the HTTP API bridge (Fastify on `127.0.0.1:37891` by default).

```bash
echoc bridge start
echoc bridge status
curl http://localhost:37891/v1/health   # verify
echoc bridge stop
```

### `echoc daemon start|stop|status|logs`

Run the worker and bridge in a single process. Graceful shutdown order on SIGTERM: bridge → worker → registry.

```bash
echoc daemon start
echoc daemon status
echoc daemon logs -f
echoc daemon stop
```

This is the recommended way to run ECHO Core in production / for desktop use.
