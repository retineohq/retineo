# RETINEO Core — Structured Logging Guide

RETINEO Core uses **Pino** for fast, structured JSON logging. Every log entry is JSON-parseable for production observability.

---

## Logger Interface

```typescript
export interface Logger {
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
  child(meta: LogMeta): Logger;
}
```

## LogMeta Fields

| Field | Description |
|-------|-------------|
| `traceId` | Correlation ID across request lifecycle |
| `nodeHash` | Content node SHA-256 |
| `sourceId` | Source record UUID |
| `jobId` | Background job UUID |
| `adapterId` | Adapter identifier |
| `providerId` | LLM/embedding provider identifier |
| `layer` | Subsystem: `adapter`, `ingestion`, `pipeline`, `worker`, `search`, `bridge`, `mcp` |

## Configuration

```yaml
logging:
  level: "info"        # debug | info | warn | error
  format: "json"       # json | pretty
  destination: "stdout" # stdout | file | both
  filePath: "~/.retineo/logs/retineo.log"
  redact: ["apiKey", "api_key", "password"]
```

## Trace ID Propagation

| Entry Point | Trace ID Source |
|-------------|-----------------|
| HTTP | `X-Trace-Id` header or generated UUID |
| CLI | Generated UUID at command start |
| MCP | Generated UUID per tool call |

Pass trace IDs through all service calls via `logger.child({ traceId })`.

## Logged Events

| Layer | Event | Level |
|-------|-------|-------|
| Adapter | `adapter.spawn`, `adapter.ingest.start`, `adapter.ingest.complete`, `adapter.kill` | info |
| Ingestion | `ingest.start`, `ingest.complete`, `ingest.duplicate`, `ingest.segment` | info |
| Pipeline | `pipeline.l1.start`, `pipeline.l2.start`, `pipeline.l3.start`, `pipeline.complete`, `pipeline.retry` | info / error |
| Worker | `job.acquire`, `job.heartbeat`, `job.complete`, `job.fail` | info / error |
| Search | `search.query`, `search.duration` | info |
| Bridge | `http.request`, `http.response` | info |
| MCP | `mcp.tool.call`, `mcp.tool.result` | info |
| Shutdown | `shutdown.initiate`, `shutdown.complete` | info |

## Redaction

Sensitive fields are automatically replaced with `[REDACTED]`:
- `apiKey`, `api_key`, `password`, `secret`, `token`

## Usage in Code

```typescript
import { getGlobalLogger } from './utils/logger.js';

const logger = getGlobalLogger().child({ layer: 'my-feature', traceId });
logger.info('operation.start', { nodeHash });
logger.error('operation.failed', { error: err.message });
```
