---
audience: human
---

# Adaptive Timing + Resource Diagnostics Runbook

Use this runbook on a running node to isolate:

- Memory growth / leak suspects
- Idle CPU overhead
- Disk-write pressure from metrics log persistence

It is the step-by-step investigation companion to
[runtime-resource-diagnostics.md](runtime-resource-diagnostics.md), which
documents the diagnostics endpoint and fields this runbook polls.

## Prerequisites

- Admin API is reachable at `http://127.0.0.1:8081`
- `jq`, `watch`, and `lagrange-admin` are available

## 1. Start diagnostics polling (Terminal A)

```bash
watch -n 5 "curl -sS http://127.0.0.1:8081/api/admin/diagnostics/services | jq '{
  cpu_pct: .diagnostics.resources.latest.process.cpuPercent,
  rss_mb: ((.diagnostics.resources.latest.process.rssBytes // 0) / 1048576),
  rss_growth_mb_min: ((.diagnostics.resources.trend.rssGrowthPerMinBytes // 0) / 1048576),
  write_kb_s: ((.diagnostics.resources.latest.io.writeBytesPerSec // 0) / 1024),
  write_trend_kb_s: ((.diagnostics.resources.trend.writeRateBytesPerSec // 0) / 1024),
  top_growing: ((.diagnostics.resources.trend.topGrowingSignals // [])[0:8]),
  logging: .diagnostics.resources.latest.components.logging,
  logsTable: .diagnostics.resources.latest.components.logsTable
}'"
```

## 2. Config writes (Terminal B)

Configuration is written by its owner (`DynamicConfigService.set`, which
validates the value against the key's definition) through the admin config
operation. Raw `UPDATE config` statements are refused as client writes to a
system table (`SYSTEM_TABLE_WRITE_REFUSED`).

```bash
cfg() {
  curl -s -X PUT -H 'content-type: application/json' \
    -d "{\"value\": $2, \"updatedBy\": \"diag-runbook\"}" \
    "http://localhost:8081/api/admin/config/$1"; echo
}
```

Each call answers `{"success":true,"outcome":"applied",...}`, or a typed
refusal such as `CONFIG_VALUE_INVALID`. Values are typed JSON: `true`,
`false`, numbers. Reads stay SQL (`lagrange-admin localhost:8081`, press `6`).

## 3. Baseline capture (10 minutes)

```bash
cfg logging.persistMetricsLogs true
cfg raft.adaptiveTimingEnabled false
```

## 4. Isolate metrics logging persistence path (10 minutes)

```bash
cfg logging.persistMetricsLogs false
```

Signals that confirm this path is a contributor:

- `logging.metricsSuppressedFromPersistence` rises quickly
- `logsTable.pendingWrites` and/or `logsTable.writeCount` growth slows
- CPU, write-rate, or RSS-growth drops after the toggle

## 5. Enable adaptive raft timing with CPU-focused starter tuning

```bash
cfg raft.adaptiveTimingSampleIntervalMs 5000
cfg raft.adaptiveTimingPromoteSamples 2
cfg raft.adaptiveTimingDemoteSamples 8

cfg raft.adaptiveTimingHighCpuPercent 18
cfg raft.adaptiveTimingLowCpuPercent 10
cfg raft.adaptiveTimingHighWriteBytesPerSec 1500000
cfg raft.adaptiveTimingLowWriteBytesPerSec 1100000
cfg raft.adaptiveTimingHighRssGrowthBytesPerMin 200000000
cfg raft.adaptiveTimingLowRssGrowthBytesPerMin 120000000

cfg raft.adaptiveTimingActiveHeartbeatIntervalMs 75
cfg raft.adaptiveTimingActiveElectionTimeoutMinMs 1200
cfg raft.adaptiveTimingActiveElectionTimeoutMaxMs 3600

cfg raft.adaptiveTimingIdleHeartbeatIntervalMs 300
cfg raft.adaptiveTimingIdleElectionTimeoutMinMs 5000
cfg raft.adaptiveTimingIdleElectionTimeoutMaxMs 9000

cfg raft.adaptiveTimingEnabled true
```

## 6. Verify adaptive profile switching

Run:

```sql
SELECT config_key, config_value, updated_by, updated_at
FROM config
WHERE config_key IN (
  'raft.heartbeatIntervalMs',
  'raft.electionTimeoutMinMs',
  'raft.electionTimeoutMaxMs'
)
ORDER BY config_key;
```

Expected:

- `updated_by = 'raft-adaptive-timing-controller'` indicates active profile writes

## 7. Rollback

```bash
cfg raft.adaptiveTimingEnabled false
cfg logging.persistMetricsLogs true
cfg raft.heartbeatIntervalMs 50
cfg raft.electionTimeoutMinMs 1000
cfg raft.electionTimeoutMaxMs 3000
```
