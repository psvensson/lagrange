# Harness Seven-Node Hardening Results

## Run Window

- Date: 2026-02-25 (UTC)
- Scenario: `postgres-baseline-comparison`
- Profiles executed:
  - `test/distributed/config/local-benchmark-3node.json`
  - `test/distributed/config/local-benchmark-7node.json`

## Latest Strict Baseline Runs

1. `postgres-baseline-3node-20260225T194155Z.report.json`
   - `passed=false`
   - failed phase: `preflight`
   - strict gate reason: `insufficient_reachable_nodes`
   - required/reachable: `3 / 0`
   - discovery attempts: `58`

2. `postgres-baseline-7node-20260225T194947Z.report.json`
   - `passed=false`
   - failed phase: `preflight`
   - strict gate reason: `insufficient_reachable_nodes`
   - required/reachable: `7 / 0`
   - discovery attempts: `86`

## Compare Script Snapshot

Command:

```bash
scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports
```

Observed summary:

1. `3node` previous->latest: failed->failed, duration increased.
2. `7node` previous->latest: failed->failed, duration increased.
3. Throughput and latency deltas are unavailable because both runs fail preflight before load.
4. Parity/CDC/queue-admission sections are unavailable for the same reason.

## Discovery Behavior Change Applied

- Updated strict discovery behavior to stop using the "stalled improvement" early-exit shortcut.
- In strict mode, discovery now waits until timeout before returning failure.
- Evidence:
  - 3-node attempts increased from `6` to `58`
  - 7-node attempts increased from `6` to `86`

## Residual Risks / Blockers

1. Strict benchmark runs still fail before load generation, so throughput-parity evidence cannot be collected.
2. The blocking condition is unresolved: joiner nodes remain non-admin-ready/non-query-ready in discovery preflight.
3. Because no strict run succeeds, "successful run uses full required SUT load fanout" remains unverified.
