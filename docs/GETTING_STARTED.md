# ECHO Core — Getting Started

This tutorial walks through your first ingestion, search, and API call.

---

## 1. Initialize

Verify installation:

```bash
echo status
```

Expected output:

```json
{
  "version": "0.1.0",
  "nodeCount": 0,
  "sourceCount": 0,
  "jobCount": { "pending": 0, "running": 0, "completed": 0, "failed": 0 }
}
```

---

## 2. Ingest Your First Files

```bash
echo ingest ~/Documents/report.pdf
echo ingest ~/Documents/notes.md
echo ingest ~/Documents/podcast.mp3
echo ingest ~/Documents/meeting.mp4
```

> **Audio/video require:** `WHISPER_API_KEY` env var and `ffmpeg` (for video).
> Run `echo doctor` to verify dependencies.

Expected output:

```json
{
  "sourceId": "550e8400-e29b-41d4-a716-446655440000",
  "rootHash": "a1b2c3d4...",
  "status": "queued",
  "jobs": ["job-uuid-1"]
}
```

ECHO Core:
1. Reads the file via the matching adapter
2. Stores normalized content in CAS
3. Registers the source in SQLite
4. Queues `GENERATE_L1`, `GENERATE_L2`, `GENERATE_L3` jobs

---

## 3. Check Compilation

```bash
echo jobs
```

Watch for status changes:

```
PENDING → RUNNING → COMPLETED
```

Background pipeline:

| Job | What happens |
|-----|--------------|
| `GENERATE_L1` | Parse headings, build section tree |
| `GENERATE_L2` | LLM extracts summary, concepts, entities |
| `GENERATE_L3` | Generate embeddings, update HNSW index |

When all jobs show `COMPLETED`, the file is fully searchable.

---

## 4. Search

```bash
echo search "pricing objections"
```

Expected output:

```
Query: pricing objections
Language: en
Intent: informational
Results: 3

[1] report.pdf — Section 4.2
    "Common pricing objections include budget constraints..."
    Score: 0.87

[2] notes.md — Heading: Sales Playbook
    "When the prospect pushes back on price..."
    Score: 0.82
```

---

## 5. Try Multilingual

```bash
echo search "возражения по цене" --language ru
```

ECHO Core detects Russian, loads the `ruPack`, and searches the shared embedding space. English documents can match Russian queries via cross-lingual embeddings.

See [`MULTILINGUAL.md`](MULTILINGUAL.md) for language pack details.

---

## 6. Use HTTP API

Start the bridge (or it runs automatically in the background):

```bash
curl http://localhost:37891/v1/status
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
    "echo": {
      "command": "echo",
      "args": ["mcp"]
    }
  }
}
```

Available tools:

| Tool | Purpose |
|------|---------|
| `echo_search` | Search the knowledge base |
| `echo_ingest` | Ingest a file |
| `echo_status` | Check engine status |
| `echo_get_node` | Retrieve a node by hash |

---

## Next Steps

- Deep dive into search: [`docs/SEARCH.md`](SEARCH.md)
- Build a custom adapter: [`docs/ADAPTER_GUIDE.md`](ADAPTER_GUIDE.md)
- Explore the HTTP API: [`docs/API.md`](API.md)
- Add a new language: [`docs/MULTILINGUAL.md`](MULTILINGUAL.md)
