# ECHO Core — Health Checks & Metrics

## Overview

Phase 7 adds production-ready observability: liveness/readiness probes, operational metrics, and Prometheus-compatible export.

## Endpoints

### `GET /v1/health` — Liveness Probe

Returns 200 if the core process is alive and subsystems respond.

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

**Checks:**
- `sqlite` — `SELECT 1` query succeeds.
- `cas` — `objects/` directory is readable.
- `llmProvider` — `provider.validate()` returns true (lightweight ping).
- `worker` — Pending jobs < 10,000 (not flooded).

Returns 503 if any check fails. `status` = `"unhealthy"`.

### `GET /v1/ready` — Readiness Probe

Returns 200 only when ready to serve requests.

```json
{
  "ready": true,
  "indexLoaded": true,
  "queueHealthy": true
}
```

**Checks:**
- `indexLoaded` — `embeddings.jsonl` exists.
- `queueHealthy` — Pending jobs < 1,000.
- No shutdown in progress.

Returns 503 with `reason` if not ready.

### `GET /v1/metrics` — JSON Metrics

Operational snapshot:

```json
{
  "nodes": 1234,
  "sources": 1234,
  "jobs": { "pending": 10, "running": 2, "completed": 500, "failed": 1 },
  "index": { "vectorCount": 10000, "lastIndexed": "2024-01-01T00:00:00.000Z" },
  "adapters": { "text": 500, "pdf": 100 },
  "searches": { "total": 2000, "avgDurationMs": 45 },
  "llm": { "requests": 5000, "errors": 10, "avgLatencyMs": 120 }
}
```

Counters are in-memory and reset on restart (acceptable for MVP).

### `GET /v1/metrics/prometheus` — Prometheus Text Format

```text
# TYPE echo_nodes gauge
echo_nodes 1234
# TYPE echo_searches_total counter
echo_searches_total 2000
...
```

## Monitoring Guide

### Prometheus Scraping

Add scrape config:

```yaml
scrape_configs:
  - job_name: 'echo-core'
    static_configs:
      - targets: ['localhost:37891']
    metrics_path: /v1/metrics/prometheus
```

### Alerting Rules (Example)

```yaml
- alert: EchoUnhealthy
  expr: echo_nodes == 0
  for: 5m

- alert: EchoCircuitOpen
  expr: echo_llm_errors_total > 100
  for: 5m
```
