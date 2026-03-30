# Runtime Resource Diagnostics

Use the admin diagnostics endpoint to inspect process memory/CPU/disk-write
trends and subsystem growth signals on a running node.

These diagnostics are an operational projection. They summarize node-local
resource behavior and owner-path telemetry, but they do not replace canonical
owner rows or readiness reason codes when diagnosing placement or serving
state.

## Endpoint

`GET /api/admin/diagnostics/services`

The response now includes:

- `diagnostics.resources.latest`
  - Current process RSS/heap/CPU%, event-loop utilization, and write rate.
  - Current component stats (`logging`, `logsTable`, `messageRouter`, etc.).
- `diagnostics.resources.trend`
  - RSS and heap growth rates over recent samples.
  - Top-growing numeric component signals (`topGrowingSignals`).

Interpretation rules:

- Use this endpoint to answer whether a node is accumulating local pressure or
  a subsystem is growing abnormally.
- Use readiness probes and readiness diagnostics to answer whether the node may
  admit traffic.
- Use canonical owner rows plus service diagnostics to answer placement,
  leader, and replica-role questions.
- Treat `messageRouter` and related transport metrics as health evidence that
  can explain readiness changes while cache propagation catches up, not as an
  alternate ownership source.

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
