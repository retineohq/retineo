# RETINEO Core — Getting Started

This tutorial walks through your first ingestion, search, and API call.

> `retineo` is also available as an alias for `retineo`.

---

## 1. Run the Setup Wizard

```bash
retineo init
```

The wizard walks you through:

1. **LLM model** — auto-detects Ollama on `localhost:11434` and lists installed models. Pick one (or use the cloud fallback).
2. **Embedding model** — picks from embedding-capable models.
3. **Data directory** — defaults to `~/.retineo`.
4. **HTTP API port** — defaults to `37891`.

It writes `~/.retineo/config.yaml`, initializes the SQLite database, creates the directory structure, and offers to start a background worker.

For CI / scripts:

```bash
retineo init --non-interactive
# Honours env vars: RETINEO_DATA_DIR, RETINEO_LLM_MODEL, RETINEO_EMBED_MODEL,
#                    RETINEO_BRIDGE_PORT, OLLAMA_BASE_URL
```

---

## 2. Verify It's Running

```bash
retineo worker status
```

Expected output (Ollama detected, worker started by the wizard):

```
worker: running
  PID: 12345
  Started: 2026-06-07T10:00:00.000Z
  Uptime: 1m 23s
  Log: /home/user/.retineo/logs/worker.log
  Jobs: pending=0 running=0 completed=0 failed=0 dead=0
```

Check the engine status:

```bash
retineo status
```

---

## 3. Ingest Your First File

```bash
retineo ingest ~/Documents/notes.md --watch
```

`--watch` blocks until all `GENERATE_L1` / `GENERATE_L2` / `GENERATE_L3` jobs are `COMPLETED` (or any fails). The worker processes them in the background.

Expected output:

```
Source registered: notes.md → a1b2c3d4...
Job abc-... queued for L1 generation
Job def-... queued for L2 generation
Job ghi-... queued for L3 generation
⏳ Waiting for compilation...
  [1/3] compilation progress
  [2/3] compilation progress
  [3/3] compilation progress
✅ All 3 job(s) compiled in 12s
```

Without `--watch`, `ingest` returns immediately and jobs process in the background:

```bash
retineo ingest ~/Documents/report.pdf
retineo jobs                            # see pending jobs
```

RETINEO Core pipeline:

| Job | What happens |
|-----|--------------|
| `GENERATE_L1` | Parse headings, build section tree |
| `GENERATE_L2` | LLM extracts summary, concepts, entities |
| `GENERATE_L3` | Generate embeddings, update HNSW index |

---

## 4. Search

```bash
retineo search "pricing objections"
```

Expected output:

```
Query: "pricing objections" (detected: en, intent: informational)
───────────────────────────────
[1] [[a1b2c3d4]]
    L2: Common pricing objections include budget constraints...
    Citation: lines 42-58
───────────────────────────────
Context: 320 tokens, 1 citations
```

---

## 5. Try Multilingual

```bash
retineo search "возражения по цене" --language ru
```

RETINEO Core detects Russian, loads the `ruPack`, and searches the shared embedding space. English documents can match Russian queries via cross-lingual embeddings.

See [`MULTILINGUAL.md`](MULTILINGUAL.md) for language pack details.

---

## 6. Use the HTTP API

Start the bridge (or use `retineo daemon start` for bridge + worker in one process):

```bash
retineo bridge start
curl http://localhost:37891/v1/health
```

Search via HTTP:

```bash
curl -X POST http://localhost:37891/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pricing objections","options":{"topK":5}}'
```

Response:

```json
{
  "query": "pricing objections",
  "language": "en",
  "intent": "informational",
  "results": { ... },
  "citations": [...],
  "durationMs": 42
}
```

See [`API.md`](API.md) for all endpoints.

---

## 7. Use MCP

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "retineo": {
      "command": "retineo",
      "args": ["mcp"]
    }
  }
}
```

Available tools:

| Tool | Purpose |
|------|---------|
| `retineo_search` | Search the knowledge base |
| `retineo_ingest` | Ingest a file |
| `retineo_status` | Check engine status |
| `retineo_get_node` | Retrieve a node by hash |

---

## Next Steps

- Deep dive into search: [`docs/SEARCH.md`](SEARCH.md)
- Build a custom adapter: [`docs/ADAPTER_GUIDE.md`](ADAPTER_GUIDE.md)
- Explore the HTTP API: [`docs/API.md`](API.md)
- Add a new language: [`docs/MULTILINGUAL.md`](MULTILINGUAL.md)
- Troubleshoot common issues: [`docs/TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
