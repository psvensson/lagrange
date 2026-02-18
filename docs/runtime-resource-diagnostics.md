# Runtime Resource Diagnostics

Use the admin diagnostics endpoint to inspect process memory/CPU/disk-write
trends and subsystem growth signals on a running node.

## Endpoint

`GET /api/admin/diagnostics/services`

The response now includes:

- `diagnostics.resources.latest`
  - Current process RSS/heap/CPU%, event-loop utilization, and write rate.
  - Current component stats (`logging`, `logsTable`, `messageRouter`, etc.).
- `diagnostics.resources.trend`
  - RSS and heap growth rates over recent samples.
  - Top-growing numeric component signals (`topGrowingSignals`).

## Example Polling Command

```bash
watch -n 5 "curl -sS http://127.0.0.1:8081/api/admin/diagnostics/services | jq '.diagnostics.resources'"
```

## Metrics Log Persistence Toggle

High-volume `metrics.*` logs can increase logs-table write load. To isolate this
path, set:

- `logging.persistMetricsLogs = false`

This keeps normal logs but suppresses `metrics.*` entries from logs-table
persistence while still counting them in logging diagnostics.

## Default Observability Policy

Default logging/metrics policy is tuned for low idle overhead:

- `logging.persistMetricsLogs = false`
- `logging.metricsDefaultResolutionMs = 30000`
- `logging.metricsDetailedWindowEnabled = false`

Detailed instrumentation remains opt-in. Use dynamic config toggles only for a
bounded diagnostics window.

The logging pipeline also drops self-referential logging metrics namespaces
(`metrics.logging.*`, `metrics.logs_table.*`, `metrics.log_retention.*`,
`metrics.log_query.*`) to prevent recursive log-generation loops.
