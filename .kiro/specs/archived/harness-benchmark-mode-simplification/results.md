# Harness Benchmark Mode Simplification Results

## Status

- Spec status: `open`
- Last updated: `2026-02-26`

## Objective

Stabilize and simplify strict benchmark execution so 3-node and 7-node baseline
runs both reach load phase with full required SUT fanout and produce valid
Postgres parity metrics.

## Completion Gates

1. 3-node strict baseline reaches load with full required fanout.
2. 7-node strict baseline reaches load with full required fanout.
3. Compare script reports throughput and p99 ratios for both.

## Latest Evidence

Executed on `2026-02-26`:

1. 3-node strict baseline run
   - Report: `test-output/reports/postgres-baseline-3node-20260226T153151Z.report.json`
   - Result: `failed`
   - Failure: `strict_preload_readiness_failed` in `pre_load_gate`
   - Root cause class: `discovery`
   - Observed issue: only `1` ready load node; other required nodes reported
     `discovery_not_ready` (`readiness_missing` or
     `schema_table_missing=table "benchmark_events" not found`).
2. 7-node strict baseline run
   - Report: `test-output/reports/postgres-baseline-7node-20260226T153401Z.report.json`
   - Result: `failed`
   - Failure: `strict_preload_readiness_failed` in `pre_load_gate`
   - Root cause class: `discovery`
   - Observed issue: only `1` ready load node; 6 nodes failed readiness with
     the same `readiness_missing` / `schema_table_missing` pattern.

## Throughput and Latency Deltas

From `scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports`:

1. 3-node delta (`previous=20260226T152950Z`, `latest=20260226T153151Z`)
   - Throughput ratio delta: `0` (unavailable because load phase not reached)
   - p99-vs-PG-average ratio delta: `0` (unavailable because load phase not reached)
2. 7-node delta (`previous=20260226T142806Z`, `latest=20260226T153401Z`)
   - Throughput ratio delta: `0` (unavailable because load phase not reached)
   - p99-vs-PG-average ratio delta: `0` (unavailable because load phase not reached)

## Root-Cause Trend

1. 3-node: `discovery -> discovery` (stable class, persistent strict pre-load readiness failure).
2. 7-node: latest run reports `discovery` root cause in unified failure artifact.
3. Affected-node trend:
   - 3-node latest: 2 affected nodes
   - 7-node latest: 6 affected nodes

## Residual Risks

1. Strict readiness contract remains unmet on both profiles, so load-phase and
   parity measurements are blocked.
2. Discovery/readiness metadata propagation appears inconsistent under cluster
   startup churn (`readiness_missing`, table visibility drift).
3. CDC/topology churn warnings remain high during warmup, which may be delaying
   canonical readiness convergence.
4. Completion gates 1-3 are still unmet; spec remains open.
