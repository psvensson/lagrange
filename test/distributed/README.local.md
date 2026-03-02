# Distributed Harness Local README

## Purpose

This README documents local usage of the distributed test harness in `test/distributed/`.

## Prerequisites

1. Docker daemon running locally.
2. Node.js 22+.
3. Dependencies installed with `npm ci`.

## Main Entry Point

Run harness scenarios with:

```bash
node test/distributed/run.js --config <config-path> [--scenario <scenario-name>] [--output <report-path>] [--verbose]
```

Examples:

```bash
node test/distributed/run.js --config test/distributed/config/local-three-node.json --verbose
node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart.report.json --verbose
```

## Fast Local Defaults

For local Docker configs (no `docker.hosts`), fast-local mode is enabled by default.

Fast-local mode does all of the following:

1. Mounts host `src/` into node containers as `/app/src` (read-only).
2. Reuses deterministic local containers and network across runs.
3. Skips dirty-workspace image rebuilds when the image already exists.

Opt-out:

```bash
node test/distributed/run.js --config test/distributed/config/local-three-node.json --no-fast-local --verbose
```

Explicit opt-in (same behavior as default local mode):

```bash
node test/distributed/run.js --config test/distributed/config/local-three-node.json --fast-local --verbose
```

## Config Files

Common configs:

1. `test/distributed/config/local-three-node.json`
2. `test/distributed/config/local.json`
3. `test/distributed/config/local-memory-soak.json`
4. `test/distributed/config/local-benchmark.json`
5. `test/distributed/config/local-benchmark-3node.json`
6. `test/distributed/config/local-benchmark-5node.json`
7. `test/distributed/config/local-benchmark-7node.json`
8. `test/distributed/config/local-benchmark-3node-timeout180.json`
9. `test/distributed/config/local-benchmark-3node-timeout600.json`
10. `test/distributed/config/gcp-small.json`
11. `test/distributed/config/gcp-large.json`

## Scenario Names

Use these values with `--scenario`:

1. `admin-query-smoke`
2. `examples-catalog`
3. `network-partition-split-brain`
4. `node-failure-rebalance`
5. `node-join-under-load`
6. `partition-kill-heal-under-load`
7. `postgres-baseline-comparison`
8. `rolling-restart`
9. `seed-restart-under-load`
10. `seven-node-load-during-partitioning`
11. `seven-node-read-write-load-distribution`
12. `seven-node-table-partition-distribution`
13. `sustained-write-throughput`
14. `three-node-seed-rebalance`
15. `wasm-service-failover`
16. `write-ack-visibility`

## Benchmark And Migration Pipelines

Run standardized migration flows:

```bash
npm run migration:raft:benchmarks
npm run migration:raft:rollback-drill
npm run migration:raft:stage:dev
npm run migration:raft:stage:canary
npm run migration:raft:stage:limited
```

Reports are written under:

`.kiro/specs/raft-logic-migration/reports/`

Benchmark tuning notes (in `benchmark` config block):

1. `loadOpsPerSec`: target request rate for system-under-test load.
2. `loadMaxInFlight`: in-flight cap for harness load generation. Keep this
   high enough to avoid client-side throttling when latency increases.

## Canonical Benchmark Mode (Strict)

`postgres-baseline-comparison` now uses one canonical benchmark path in strict
mode:

1. Pre-load gating reads canonical discovery readiness (`benchmarkReady`,
   `routingReady`, `schemaReady`, `topologyReady`) and fails closed on missing
   data.
2. Strict profile fanout defaults to full cluster candidate count when
   `requiredSutLoadNodeCount` is not explicitly set.
3. Explicit strict fanout opt-out is still supported by setting
   `requiredSutLoadNodeCount` lower than cluster size; this is reported in
   benchmark details as `strictFanoutOptOut=true` with
   `strictFanoutOptOutReason`.
4. Sustained critical rebalancing in strict mode now fails verification via
   `internal_signal_threshold_breach` (`critical_rebalancing_state`).

Useful benchmark detail fields in each report:

1. `details.benchmark.strictMode`
2. `details.benchmark.clusterCandidateLoadNodeCount`
3. `details.benchmark.requestedSutLoadNodeCount`
4. `details.benchmark.requiredSutLoadNodeCount`
5. `details.benchmark.explicitRequiredSutLoadNodeCount`
6. `details.benchmark.strictFanoutOptOut`
7. `details.benchmark.strictFanoutOptOutReason`
8. `details.failure` (machine-readable failure envelope with `rootCauseClass`,
   `phase`, `affectedNodeIds`, `reasonCounts`)

## Versioned CDC Readiness Contract

In strict mode, benchmark load admission now requires schema-version
convergence across required load nodes:

1. Capture one `requiredSchemaVersion` at benchmark table creation time.
2. Require each node to report `appliedSchemaVersion >= requiredSchemaVersion`.
3. Require admin queryability and routing readiness on the same node snapshot.
4. Block load start until all required nodes satisfy the predicate over the
   stable window.

Canonical strict unmet reason codes:

1. `admin_not_queryable`
2. `routing_not_ready`
3. `schema_version_unknown`
4. `schema_version_lag`

When strict pre-load fails, use:

1. `scenarios[0].details.diagnostics.failure.versionConvergence`
2. `scenarios[0].details.diagnostics.failure.versionLagSummary`
3. `scenarios[0].details.diagnostics.failure.nodeReasonsByNodeId`

If strict pre-load fails, load is expected to remain blocked (no benchmark load
metrics).

## Join Readiness And Assignment Hardening

Joiners now enforce canonical join-readiness convergence before transitioning to
READY (when normal join hydration runs):

1. `routingReady=true`
2. `topologyReady=true`
3. `appliedSchemaVersion >= requiredSchemaVersion`

Useful join config knobs in `NodeJoiningService` config:

1. `joinReadinessTimeoutMs`
2. `joinReadinessPollIntervalMs`
3. `joinReadinessTableName` (defaults to `services`)

`MOVE_REPLICA` joins also use assignment-token handoff:

1. `/bootstrap` returns `assignmentId` and `assignmentLeaseExpiresAt`.
2. Joiner sends `assignment_id` to `/register-service`.
3. Seed rejects missing/unknown/expired/mismatched tokens
   (`ASSIGNMENT_TOKEN_REQUIRED`, `ASSIGNMENT_TOKEN_UNKNOWN`,
   `ASSIGNMENT_TOKEN_EXPIRED`, `ASSIGNMENT_TOKEN_MISMATCH`).
4. Replica ownership conflicts fail closed with `REPLICA_OWNER_CONFLICT`.

## Postgres Baseline Workflow

Treat any timeout, long stall, or discovery delay as a correctness bug. Do not
start a `3node` or `7node` strict baseline until the targeted checks below are
green.

### Required Before Any Strict Baseline

1. Shared readiness and guarded-mutation regressions:

```bash
npm test -- \
  test/admin/admin-websocket-api.test.js \
  test/control-plane/lease-sweep-serialization.test.js \
  test/raft/authoritative-row-mutation-helper.test.js
```

2. Deterministic convergence regressions:

```bash
npm test -- \
  test/convergence/deterministic-convergence-harness.test.js \
  test/convergence/baseline-discovered-regressions.test.js
```

3. Benchmark report and gate contract:

```bash
npm test -- \
  test/distributed/harness/__tests__/report-writer.test.js \
  test/distributed/harness/__tests__/run.test.js \
  test/scripts/compare-latest-baseline-runs.test.js
```

4. `postgres-baseline-comparison` control-path specs:

```bash
npm test -- \
  test/distributed/harness/__tests__/postgres-baseline-comparison-core.test.js \
  test/distributed/harness/__tests__/postgres-baseline-comparison-discovery.test.js \
  test/distributed/harness/__tests__/postgres-baseline-comparison-preload-readiness.test.js \
  test/distributed/harness/__tests__/postgres-baseline-comparison-strict-diagnostics.test.js \
  test/distributed/harness/__tests__/postgres-baseline-comparison-post-load.test.js
```

### Additional Gate Before `7node`

1. Run a strict `3node` baseline first and require a passing report before
   spending time on `7node`.
2. Re-run the targeted integration checks that have caught recent multi-node
   correctness bugs:

```bash
npm test -- \
  test/integration/convergence-control-snapshot.integration.test.js \
  test/integration/node-joining-rebalance.integration.test.js \
  test/integration/three-node-seed-rebalance.integration.test.js
```

3. Only after the checks above pass should you launch the strict `7node`
   baseline.

### Baseline Closure Rule

If a distributed baseline run finds a correctness bug, do not close that bug on
the strength of a later passing baseline alone.

Required closure steps:

1. Capture the failure in a targeted regression first.
2. Prefer the deterministic integration layer under `test/integration/` for
   replica instability, degraded admission, strict readiness, or fallback-path
   bugs.
3. Keep the bug open if it is still reproducible only in the full baseline
   harness.
4. Treat the next passing baseline as confirmation, not as the primary proof of
   closure.

If a strict baseline fails correctness, its observed `loadMetrics` remain
diagnostic only. Report summaries and the compare script now label those runs
as `invalid_for_performance`, and they must not be used as throughput
baselines.

Run baseline-comparison scenario on local benchmark profiles:

```bash
TS="$(date -u +%Y%m%dT%H%M%SZ)"
node test/distributed/run.js \
  --config test/distributed/config/local-benchmark-3node.json \
  --scenario postgres-baseline-comparison \
  --output "test-output/reports/postgres-baseline-3node-${TS}.report.json" \
  --verbose

TS="$(date -u +%Y%m%dT%H%M%SZ)"
node test/distributed/run.js \
  --config test/distributed/config/local-benchmark-7node.json \
  --scenario postgres-baseline-comparison \
  --output "test-output/reports/postgres-baseline-7node-${TS}.report.json" \
  --verbose
```

Compare latest run against prior run for both `3node` and `7node` profiles:

```bash
scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports
```

To keep local artifact growth under control, prune stale `test-output/`
artifacts after debugging sessions:

```bash
npm run test-output:prune:dry
npm run test-output:prune
```

Default retention policy:
- keep pinned names such as `current`, `latest`, `acceptance`, `summary`, and
  `validation`
- keep anything newer than 3 days
- keep at least the latest 40 report JSON files
- keep at least the latest 24 report playback bundles
- keep at least the latest 16 legacy playback bundles under `test-output/.playback`
- keep at least the latest 12 other top-level scenario output directories
```

The comparison output includes:

1. Run-to-run deltas (pass/fail, duration, throughput, total ops, latency, queue delay).
2. Load execution details (`attempt_errors`, `dispatched_ops`,
   `undispatched_ops`, channel error counts).
3. Per-run SUT-vs-Postgres baseline comparison from the same report when
   available (`sut_vs_pg[...]`, throughput ratio, latency ratios).
4. Load parity and discovery summaries (`load_parity[...]`,
   `sut_discovery[...]`) and truncated error strings for fast triage.
5. Strict/non-strict fanout contract summaries (`fanout_contract[...]`,
   `fanout_delta`) including opt-out state.
6. Root-cause summaries (`root_cause[...]`, `root_cause_delta`) from the
   unified failure artifact.
7. Convergence summaries (`convergence[...]`, `convergence_delta`) including
   required schema version, lagging-node count, and per-node reason snippets.
8. Dominant strict reason summaries (`dominant_reason[...]`) and deltas.
9. Saturation summaries (`saturation[...]`, `saturation_delta`) for CDC forward
   timeout, system-table query timeout, and snapshot-collection errors.

The compare script requires report names matching:

1. `postgres-baseline-3node-*.report.json`
2. `postgres-baseline-7node-*.report.json`

Optional deep-dive analysis for one report:

```bash
npm run analyze:pg-baseline -- --report test-output/reports/<report>.report.json
```

## Artifacts

By default, harness artifacts go under:

`test-output/.playback/<report-basename>/`

Per-scenario artifacts include:

1. `<scenario>/_timeline.log`
2. `<scenario>/_analysis.json`
3. `<scenario>/playback-manifest.json`
4. `<scenario>/playback-viewer.html`
5. `<scenario>/events.ndjson`
6. `<scenario>/samples.ndjson`
7. `<scenario>/snapshots.ndjson`

## Local Reuse Resource Names

When fast-local container reuse is enabled:

1. Network name: `ddb-test-net-reuse-local-<cluster-size>`
2. Container names: `ddb-test-reuse-<cluster-size>-<node-index>`

## Reset Reused Local Resources

If you want a completely fresh local state:

```bash
docker ps -aq --filter "name=ddb-test-reuse-" | xargs -r docker rm -f
docker network ls --format '{{.Name}}' | rg '^ddb-test-net-reuse-local-' | xargs -r docker network rm
```

## Harness Test Commands

Run harness unit tests:

```bash
npx tap test/distributed/harness/__tests__/run.test.js test/distributed/harness/__tests__/config-parser.test.js test/distributed/harness/__tests__/cluster.test.js test/distributed/harness/__tests__/docker-provider.test.js
```

Run all non-integration fast tests:

```bash
npm run test:fast
```
