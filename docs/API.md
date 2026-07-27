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

### `POST /v1/similar`

Find documents semantically similar to a given document by `contentHash`.

**Request body:**
```json
{
  "hash": "sha256 contentHash, required",
  "topK": 5,
  "threshold": 0.75,
  "includeGhosts": false
}
```

**Response:**
```json
{
  "results": [
    {
      "contentHash": "sha256",
      "sourcePath": "/path/to/doc.md",
      "similarity": 0.9123,
      "matchedChunks": 2
    }
  ]
}
```

Returns `400` when `hash` is missing.

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
  "version": "0.5.5",
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

### `POST /v1/health`

Start an asynchronous memory-health analysis job for a source.

**Request body:**
```json
{
  "sourceId": "filesystem:/path/to/vault"
}
```

For filesystem paths you may pass `path` instead:
```json
{
  "path": "/path/to/vault"
}
```

**Response:**
```json
{
  "jobId": "uuid"
}
```

The job runs `syncSource` + `HealthAnalyzer.analyze(sourceId)` in the background.

### `GET /v1/health/:jobId`

Poll health job status.

**Response:**
```json
{
  "jobId": "uuid",
  "status": "pending" | "running" | "completed" | "failed"
}
```

### `GET /v1/report/:jobId`

Fetch the completed `HealthReport` for a job.

**Response:**
```json
{
  "score": 76,
  "strong": ["good connectivity", "few duplicates"],
  "attention": [
    {
      "type": "duplicate",
      "severity": "warning",
      "documents": [
        { "contentHash": "hashA", "sourcePath": "/path/to/a.md" },
        { "contentHash": "hashB", "sourcePath": "/path/to/b.md" }
      ],
      "reason": "..."
    }
  ],
  "recommendations": ["Merge or deduplicate documents: /path/to/a.md, /path/to/b.md"],
  "advancedMetrics": [
    { "metric": "fragmentation", "availableIn": "pro" }
  ]
}
```

Returns `404` if the job does not exist or is not yet completed.

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

## Programmatic API

You can embed Core directly in Node.js via `createCore` from `@retineo/core`.

```ts
import { createCore } from '@retineo/core';

const core = await createCore({
  dataDir: '/path/to/.retineo',
  // optional config overrides (same shape as config.yaml)
  config: { logging: { level: 'info' } },
});

const ingestResult = await core.ingest('/vault', { force: false });
const report = await core.health();
const docs = await core.listDocuments();
const similar = await core.findSimilar(contentHash, { topK: 5, threshold: 0.8 });
const node = await core.getNode(contentHash);
await core.close();
```

### `createCore(options)`

Returns a `Promise<CoreHandle>`.

**Options:**

| Field    | Type                 | Required | Description                                                              |
|----------|----------------------|----------|--------------------------------------------------------------------------|
| `dataDir`| `string`             | yes      | Path to the Retineo data directory (CAS, registry, indexes, config).     |
| `config` | `Partial<RetineoConfig>` | no   | Config overrides merged with the existing `config.yaml` (or defaults).   |
| `logger` | `Logger`             | no       | Pino-compatible logger. Defaults to a logger built from `config.logging`.|

### `CoreHandle`

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `ingest` | `ingest(path: string, opts?: { force?: boolean })` | `Promise<IngestResult>` | Syncs a file or directory and runs the L1→L2→L3 pipeline. Pending jobs are drained before returning. |
| `health` | `health()` | `Promise<HealthReport>` | Runs the memory-health analyzer on the most recently ingested source. |
| `findSimilar` | `findSimilar(contentHash: string, opts?: SimilarOptions)` | `Promise<SimilarDocument[]>` | Finds semantically similar documents using the L3/HNSW index. Unknown hashes return `[]`; ghosts excluded by default. |
| `listDocuments` | `listDocuments(opts?: { includeGhosts?: boolean })` | `Promise<DocumentSummary[]>` | Enumerates documents from the Registry. Set `includeGhosts: true` to include deleted sources. |
| `getNode` | `getNode(contentHash: string)` | `Promise<NodeArtifacts \| null>` | Loads L0/L1/L2 artifacts for a content hash. Returns `null` for unknown or unreadable hashes. |
| `close` | `close()` | `Promise<void>` | Closes SQLite handles and releases resources. Idempotent. |

### Types

```ts
interface IngestResult {
  discovered: number;
  ingested: number;
  skipped: number;
  failed: Array<{ path: string; error: string }>;
}

interface DocumentSummary {
  contentHash: string;
  sourcePath?: string;
  status: 'active' | 'ghost';
  createdAt?: string;
  lastSeenAt?: string;
}

interface NodeArtifacts {
  contentHash: string;
  sourcePath?: string;
  l0Excerpt?: string;   // first ~500 chars of L0 body
  l1?: unknown;         // parsed L1 artifact if present
  l2Summary?: string;   // L2 essence text if present
}
```

`HealthReport` is the same type used by `retineo health` and the `/v1/report/:jobId` endpoint. `SimilarOptions` and `SimilarDocument` match `SimilarityService`.

`SimilarOptions` supports an optional `mode` field:
- `'approx'` (default) — uses the HNSW approximate nearest-neighbor index. Fast on large corpora, but results may vary slightly between index rebuilds.
- `'exact'` — uses brute-force cosine similarity (scan all vectors). Slower but fully deterministic: same embeddings always produce identical rankings. Recommended when reproducibility matters (diagnostics, test suites, small-to-medium corpora).

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
