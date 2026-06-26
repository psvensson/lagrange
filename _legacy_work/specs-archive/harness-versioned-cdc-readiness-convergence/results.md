# Harness Versioned CDC Readiness Convergence Results

## Spec Status

- `OPEN` (strict baseline gates remain unmet)

## Run Window

- Date: 2026-02-26 (UTC)
- Scenario: `postgres-baseline-comparison`
- Profiles executed:
  - `test/distributed/config/local-benchmark-3node.json`
  - `test/distributed/config/local-benchmark-7node.json`

## Latest Strict Baseline Runs

1. 3-node:
   - report: `test-output/reports/postgres-baseline-3node-20260226T184342Z.report.json`
   - `passed=false`
   - failure phase: `pre_load_gate` (`rootCauseClass=discovery`)
   - required schema/version: `tbl-e4f388a7-1494-4e39-90f0-5b893ee97fde`
   - node convergence summary: `3/3` required nodes lagging, observed schema versions all `null`
   - dominant unmet reasons: `schema_version_unknown` (3), `routing_not_ready` (1)
   - load admission: blocked before load start (`loadMetrics` absent)

2. 7-node:
   - report: `test-output/reports/postgres-baseline-7node-20260226T184614Z.report.json`
   - `passed=false`
   - failure phase: `pre_load_gate` (`rootCauseClass=discovery`)
   - required schema/version: `tbl-4d1c1856-636a-4a65-b0a8-8201503b4050`
   - node convergence summary: `7/7` required nodes lagging, observed schema versions all `null`
   - dominant unmet reasons: `schema_version_unknown` (7), `routing_not_ready` (4)
   - load admission: blocked before load start (`loadMetrics` absent)

## Compare Script Snapshot

Command:

```bash
scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports
```

Observed summary:

1. 3-node: previous `postgres-baseline-3node-20260226T171856Z.report.json` -> latest `postgres-baseline-3node-20260226T184342Z.report.json`; `passed=false -> false`, duration `+8306ms`.
2. 7-node: previous `postgres-baseline-7node-20260226T172048Z.report.json` -> latest `postgres-baseline-7node-20260226T184614Z.report.json`; `passed=false -> false`, duration `-1933ms`.
3. Throughput delta: `0 -> 0 ops/s` for both profiles (no load admitted).
4. p99 delta: `0 -> 0ms` for both profiles (no load admitted).
5. Convergence delta summary:
   - 3-node latest exposes convergence failure (`lagging_nodes=3`, `required_changed=true`).
   - 7-node latest exposes convergence failure (`lagging_nodes=7`, `required_changed=true`).

## Convergence Diagnostics Summary

1. Timeline events emitted:
   - `details.benchmark.convergenceTimeline` is empty in both failed reports.
   - Playback `events.ndjson` captures cluster/topology stages but not the convergence timeline event types.
2. Nodes with version lag:
   - 3-node: all required nodes (`3/3`) classify as lagging with `observedSchemaVersion=null`.
   - 7-node: all required nodes (`7/7`) classify as lagging with `observedSchemaVersion=null`.
3. Dominant unmet readiness predicates:
   - `schema_version_unknown` on every required node.
   - `routing_not_ready` appears on a subset of non-seed nodes (1/3 in 3-node, 4/7 in 7-node).

## Residual Risks / Blockers

1. Strict baselines still fail in `pre_load_gate`, so throughput-to-Postgres parity cannot yet be measured.
2. Required nodes report `appliedSchemaVersion=null` at gate timeout, indicating unresolved CDC/schema-version visibility lag.
3. Causal convergence timeline fields are not present in failed final reports, reducing direct report-level debugging fidelity.
