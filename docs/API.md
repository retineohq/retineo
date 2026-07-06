# RETINEO Core HTTP API Reference

Base URL: `http://127.0.0.1:37891` (configurable via `bridge.port` in `config.yaml`).

## Endpoints

### `POST /v1/search`

Search the knowledge base.

**Request body:**
```json
{
  "query": "string, required",
  "options": {
    "topK": 100,
    "threshold": 0.75,
    "mode": "semantic"
  },
  "sessionId": "optional"
}
```

**Response:**
```json
{
  "query": "hello world",
  "language": "en",
  "intent": "vague",
  "results": { ... },
  "assembled": { ... },
  "citations": [],
  "durationMs": 42
}
```

### `POST /v1/search/stream`

Stream search assembly events via SSE.

Events:
- `query_analyzed` — language and intent detected
- `candidates_found` — number of candidates
- `context_ready` — token and citation count
- `complete` — final assembled context
- `error` — on failure

### `POST /v1/ingest`

Ingest a file.

**Request body:**
```json
{
  "sourcePath": "/absolute/path/to/file.txt",
  "mimeType": "optional",
  "adapterId": "optional"
}
```

**Response:**
```json
{
  "sourceId": "uuid",
  "rootHash": "sha256",
  "status": "queued",
  "jobs": []
}
```

### `GET /v1/status`

Engine status.

**Response:**
```json
{
  "version": "0.5.0",
  "nodeCount": 1234,
  "sourceCount": 567,
  "jobCount": { "pending": 12, "running": 0, "completed": 0, "failed": 0 },
  "indexStatus": { "vectorCount": 1234, "lastIndexed": "2026-06-04T10:00:00Z" }
}
```

### `GET /v1/health`

Liveness probe. Returns 200 if healthy, 503 if any subsystem check fails.

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "sqlite": true,
    "cas": true,
    "llmProvider": true,
    "worker": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### `GET /v1/ready`

Readiness probe. Returns 200 only when the engine is ready to serve requests.

**Response:**
```json
{
  "ready": true,
  "indexLoaded": true,
  "queueHealthy": true
}
```

### `GET /v1/metrics`

Operational metrics as JSON.

**Response:**
```json
{
  "nodes": 1234,
  "sources": 1234,
  "jobs": { "pending": 10, "running": 2, "completed": 500, "failed": 1 },
  "index": { "vectorCount": 10000, "lastIndexed": "2024-01-01T00:00:00Z" },
  "adapters": { "text": 500, "pdf": 100 },
  "searches": { "total": 2000, "avgDurationMs": 45 },
  "llm": { "requests": 5000, "errors": 10, "avgLatencyMs": 120 }
}
```

### `GET /v1/metrics/prometheus`

Prometheus-compatible text format export.

### `GET /v1/nodes/:hash`

Get node by content hash.

### `GET /v1/sources/:id`

Get source by ID.

### `GET /v1/jobs/:id`

Get job by ID.

### `GET /v1/jobs/:id/events`

SSE stream of job progress.

## Errors

All errors return structured JSON:
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "...",
    "details": {}
  }
}
```

Codes:
- `INVALID_REQUEST` — 400
- `NOT_FOUND` — 404
- `INGEST_FAILED` — 422
- `SEARCH_FAILED` — 500
- `INTERNAL_ERROR` — 500
- `ADAPTER_SPAWN_FAILED` — 500
- `ADAPTER_UNSUPPORTED_MIME` — 400
- `INGEST_CAS_WRITE_FAILED` — 500
- `LLM_TIMEOUT` — 504
- `LLM_CIRCUIT_OPEN` — 503
- `LLM_RATE_LIMITED` — 429
- `SEARCH_EMPTY` — 404
- `SEARCH_TIMEOUT` — 504
- `CONFIG_SECRET_NOT_FOUND` — 400
- `BRIDGE_SHUTDOWN` — 503
