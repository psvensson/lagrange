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

## 2. Open SQL control (Terminal B)

1. Run: `lagrange-admin localhost:8081`
2. Press `6` for SQL view
3. Run each SQL statement with `Ctrl+Enter`

## 3. Baseline capture (10 minutes)

```sql
UPDATE config
SET config_value = 'true', updated_by = 'diag-runbook',
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE config_key = 'logging.persistMetricsLogs';

UPDATE config
SET config_value = 'false', updated_by = 'diag-runbook',
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE config_key = 'raft.adaptiveTimingEnabled';
```

## 4. Isolate metrics logging persistence path (10 minutes)

```sql
UPDATE config
SET config_value = 'false', updated_by = 'diag-runbook',
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE config_key = 'logging.persistMetricsLogs';
```

Signals that confirm this path is a contributor:

- `logging.metricsSuppressedFromPersistence` rises quickly
- `logsTable.pendingWrites` and/or `logsTable.writeCount` growth slows
- CPU, write-rate, or RSS-growth drops after the toggle

## 5. Enable adaptive raft timing with CPU-focused starter tuning

```sql
UPDATE config SET config_value='5000', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingSampleIntervalMs';
UPDATE config SET config_value='2', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingPromoteSamples';
UPDATE config SET config_value='8', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingDemoteSamples';

UPDATE config SET config_value='18', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingHighCpuPercent';
UPDATE config SET config_value='10', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingLowCpuPercent';
UPDATE config SET config_value='1500000', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingHighWriteBytesPerSec';
UPDATE config SET config_value='1100000', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingLowWriteBytesPerSec';
UPDATE config SET config_value='200000000', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingHighRssGrowthBytesPerMin';
UPDATE config SET config_value='120000000', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingLowRssGrowthBytesPerMin';

UPDATE config SET config_value='75', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingActiveHeartbeatIntervalMs';
UPDATE config SET config_value='1200', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingActiveElectionTimeoutMinMs';
UPDATE config SET config_value='3600', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingActiveElectionTimeoutMaxMs';

UPDATE config SET config_value='300', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingIdleHeartbeatIntervalMs';
UPDATE config SET config_value='5000', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingIdleElectionTimeoutMinMs';
UPDATE config SET config_value='9000', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingIdleElectionTimeoutMaxMs';

UPDATE config
SET config_value = 'true', updated_by = 'diag-runbook',
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE config_key = 'raft.adaptiveTimingEnabled';
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

```sql
UPDATE config SET config_value='false', updated_by='diag-runbook'
WHERE config_key='raft.adaptiveTimingEnabled';
UPDATE config SET config_value='true', updated_by='diag-runbook'
WHERE config_key='logging.persistMetricsLogs';
UPDATE config SET config_value='50', updated_by='diag-runbook'
WHERE config_key='raft.heartbeatIntervalMs';
UPDATE config SET config_value='1000', updated_by='diag-runbook'
WHERE config_key='raft.electionTimeoutMinMs';
UPDATE config SET config_value='3000', updated_by='diag-runbook'
WHERE config_key='raft.electionTimeoutMaxMs';
```

