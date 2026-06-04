# ECHO Core — Operations Guide

## Graceful Shutdown

On `SIGTERM` / `SIGINT`, ECHO Core executes a 12-step clean shutdown:

```
1. Receive SIGTERM
2. Set state = "shutting_down"
3. Stop accepting new HTTP requests (return 503)
4. Stop QueueWorker (finish current job, don't acquire new ones)
5. Wait for current job to complete (timeout: 30s)
6. Release all leased jobs → status = PENDING (resume on next start)
7. Kill all adapter child_processes
8. Close SQLite connection
9. Close HTTP server
10. Close MCP server
11. Flush logs
12. Exit process (0 = clean, 1 = forced/timeout)
```

### Registry Integration

- `registry.releaseAllLeases(workerId)` — sets all `RUNNING` jobs for this worker to `PENDING`
- `registry.getRunningJobs(workerId)` — lists running jobs for logging

### Worker Shutdown

`DefaultQueueWorker` checks `shutdownManager.isShuttingDown()` before acquiring new jobs. The current job continues to completion.

### HTTP 503

`FastifyBridgeServer` returns `503 Service Unavailable` for new requests during shutdown via an `onRequest` hook.

## Health Checks

| Check | Method | Endpoint |
|-------|--------|----------|
| HTTP alive | `GET /v1/status` | Basic engine status |
| Liveness | `GET /v1/health` | SQLite, CAS, LLM, worker probes |
| Readiness | `GET /v1/ready` | Index loaded, queue healthy, not shutting down |
| Worker alive | Heartbeat timestamp in registry | — |
| SQLite | `PRAGMA integrity_check` | — |

### Kubernetes Probe Example

```yaml
livenessProbe:
  httpGet:
    path: /v1/health
    port: 37891
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /v1/ready
    port: 37891
  initialDelaySeconds: 2
  periodSeconds: 5
```

## Monitoring

All logs are JSON. Key metrics to alert on:

| Metric | Log Field | Threshold |
|--------|-----------|-----------|
| Job failures | `job.fail` | > 5% in 5 min |
| Search latency | `search.duration.durationMs` | > 2000 ms |
| Lease expiry | `releaseExpiredLeases` result | > 0 (stuck workers) |
| Shutdown forced | `shutdown.complete.exitCode` | 1 |
| LLM circuit open | `echo_llm_errors_total` | > 100 |

Prometheus scraping:

```yaml
scrape_configs:
  - job_name: 'echo-core'
    static_configs:
      - targets: ['localhost:37891']
    metrics_path: /v1/metrics/prometheus
```

## Deployment Notes

- Docker: use `STOPSIGNAL SIGTERM` (default)
- Kubernetes: `terminationGracePeriodSeconds` should be ≥ 35s
- systemd: `TimeoutStopSec=35`
- Set `ECHO_MASTER_KEY` for production secrets encryption
- Restrict `~/.echo/` permissions to `0700`
