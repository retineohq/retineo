# ECHO Core HTTP API Reference

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
  "version": "0.1.0",
  "nodeCount": 1234,
  "sourceCount": 567,
  "jobCount": { "pending": 12, "running": 0, "completed": 0, "failed": 0 },
  "indexStatus": { "vectorCount": 1234, "lastIndexed": "2026-06-04T10:00:00Z" }
}
```

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
