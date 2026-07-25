# Distributed Harness Local README

## Purpose

This README documents local usage of the distributed test harness in `test/distributed/`.

It is also the home for distributed-harness local procedures that do not belong
in repo-wide steering policy.

## Prerequisites

1. Docker daemon running locally.
2. Node.js 22+.
3. Dependencies installed with `npm ci`.

## Main Entry Point

Run harness scenarios with:

```bash
node test/distributed/run.js --config <config-path> [--scenario <scenario-name>] [--output <report-path>] [--verbose]
```

## Live Monitoring Dashboard

To simplify running and triaging local distributed scenarios, Lagrange provides a browser-based UI dashboard.

### Standalone Local Mode (Recommended)

Launch the userland test control dashboard on port `8181`:

```bash
npm run start:test-dashboard
```

Then open `http://127.0.0.1:8181/` in your browser.

### Key Dashboard Features:
1. **Interactive Controls**: Select any scenario-config combination and launch runs dynamically.
2. **Real-time Log Streaming**: Uses Server-Sent Events (SSE) to stream combined stdout/stderr logs from all active container nodes.
3. **Historical Run List**: View past executions complete with git commit hashes, execution durations, and final outcomes.
4. **Examples Visualizer**: For scenarios reporting discrete data assertions (like `examples-catalog`), the dashboard lists individual passed/failed criteria with details.

## Failure Triage

After a distributed harness failure, artifact-first triage is mandatory. Start
from the auto-generated triage summary before sampling logs by hand. These
files are written under the run artifact directory (typically
`test-output/reports/.playback/<report-basename>/<scenario>/`):

1. `triage-summary.md`
2. `triage-summary.json`

Required order after a failure:

1. Read `triage-summary.md`.
2. Read `triage-summary.json`.
3. Run the consolidated diagnostics script if you need deeper cross-scenario
   analysis.
4. Only then sample raw node logs.

For deeper cross-scenario analysis, use the consolidated diagnostics script:

```bash
npm run analyze:distributed-failure -- --report test-output/reports/<report>.report.json
```

### Canonical Convergence Diagnostics

Recent harness artifacts now emit canonical convergence state directly instead
of only symptom counters.

Useful partitioning fields in `triage-summary.json`, `triage-summary.md`, and
the scenario `failure-bundle.json`:

1. `localPrimaryNodeIds`
2. `routedSupportNodeIds`
3. `dispatchContributionHistogram`
4. `degradationStateHistogram`
5. `criticalControlPlaneStability`
6. `convergenceEvaluations`

Read them in this order:

1. `selectedNodeIds` and `readyReplicaNodeIds` tell you what the harness could
   actually drive.
2. `localPrimaryNodeIds` versus `routedSupportNodeIds` tells you whether
   usable spread exists or whether the system only has routed support.
3. `criticalControlPlaneStability` tells you whether the harness is
   intentionally holding benchmark growth on a shared control-plane gate and
   why.
4. `convergenceEvaluations` gives the per-node canonical state:
   `ready_replica`, `replica_blocked`, `routed_admission_only`, or `absent`,
   plus dispatch contribution, blocker reasons, and `retryAfterMs`.

This should be your first stop before sampling raw node logs.

### Stability Gates

Recent triage artifacts also emit explicit stability gates under
`summary.stabilityGates` in `triage-summary.json`, `triage-summary.md`, and
the scenario `failure-bundle.json`.

Read them as the top-level bar check for this workstream:

1. `failover`
2. `convergence`
3. `restart_recovery`

Interpretation:

1. `closed` means repo-owned evidence currently satisfies that bar.
2. `open` means typed blockers are still present; read the `blockers` list
   before sampling logs.
3. `not_applicable` means the scenario did not exercise that lane.

Current AGPL-scoped production bars for this sprint:

1. `failover` should close once the cluster can route/repair without
   publication or readiness blockers.
2. `convergence` should close only after publication, pending-ack, blocked-node,
   and priority-spread blockers are gone.
3. `restart_recovery` should close for rolling-restart and seed-restart
   scenarios before a checkpoint rerun counts as acceptance evidence.

## Validation Ladder

For control-plane and topology work, use this order by default:

1. targeted owner-path tests
2. boundary-transition scenarios
3. shared unit-only gate when the shared TAP boundary or broad cross-cutting
   package surface is involved
4. one full `7node` checkpoint rerun

Do not use repeated full distributed reruns as the normal debugging loop.
Checkpoint reruns should happen only after the earlier surfaces are green.

The reusable local helper is:

`node scripts/run-distributed-validation-ladder.js`

Example:

`node scripts/run-distributed-validation-ladder.js --owner "node test/control-plane/control-plane-system-table-gateway.test.js" --owner "node test/admin/admin-websocket-api.test.js" --boundary "npm run test:distributed:boundary:transition" --checkpoint "npm run test:distributed:checkpoint:7node:transaction-recovery"`

## Boundary-Transition Scenario Layer

Use the middle-layer boundary-transition scenarios when a bug is too coupled
for a tiny unit test but not yet ready for another full `7node` rerun.

Run the focused scenario layer with:

```bash
node test/distributed/harness/__tests__/boundary-transition-scenarios.test.js
```

The first scenarios cover:

1. usable spread versus raw spread
2. authority-establishment deferred outcomes during benchmark table
   preparation
3. dispatch contribution under sustained slot pressure

Prefer this layer before another full distributed rerun when the active work
package names one of those boundaries.

## Scenario Policy SQL Ownership Guard

Distributed scenario code routes `tables.table_policies` mutations through the
canonical helper in `test/distributed/scenarios/table-distribution-helpers.js`.

When changing distributed scenarios, run:

```bash
npm run guard:scenario-policy:file
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
4. Resets each reusable node's `/data` through a host-managed
   `.tmp/reuse-data/<container>` bind before startup; it does not require a
   shell in the runtime image.

Opt-out:

```bash
node test/distributed/run.js --config test/distributed/config/local-three-node.json --no-fast-local --verbose
```

Explicit opt-in (same behavior as default local mode):

```bash
node test/distributed/run.js --config test/distributed/config/local-three-node.json --fast-local --verbose
```

Stop all local Docker containers and local Node.js processes created by the
distributed harness:

```bash
npm run distributed:stop-containers
```

Preview without stopping, or also remove the containers:

```bash
npm run distributed:stop-containers -- --dry-run
npm run distributed:stop-containers -- --remove
```

Scope the cleanup to only containers or only local processes:

```bash
npm run distributed:stop-containers -- --containers-only
npm run distributed:stop-containers -- --processes-only
```

Fast-local runs may start the reusable containers again. Use `--no-fast-local`
on the scenario runner when you want a run to avoid reusable containers.
The rolling-restart statistical gate passes `--no-fast-local` automatically so
gate evidence exercises the built runtime image entrypoint and command directly.

## Config Files

Common configs:

1. `test/distributed/config/local-three-node.json`
2. `test/distributed/config/local.json`
3. `test/distributed/config/local-memory-soak.json`
4. `test/distributed/config/local-benchmark.json`
5. `test/distributed/config/local-benchmark-3node.json`
6. `test/distributed/config/local-benchmark-5node.json`
7. `test/distributed/config/local-benchmark-7node.json`
8. `test/distributed/config/local-benchmark-7node-partition-split.json`
9. `test/distributed/config/local-benchmark-3node-timeout180.json`
10. `test/distributed/config/local-benchmark-3node-timeout600.json`
11. `test/distributed/config/gcp-small.json`
12. `test/distributed/config/gcp-large.json`

## Scenario Names

Only modules exporting `run(cluster)` are runnable scenarios. Helper files under
`test/distributed/scenarios/` are not scheduled by the runner.

When you omit `--scenario`, `node test/distributed/run.js` now runs the
canonical scenarios registered for the selected config instead of every `.js`
file under `test/distributed/scenarios/`.

Use these values with `--scenario`:

### Canonical 3-node matrix (`local-three-node.json`)

1. `admin-query-smoke`
2. `examples-catalog`
3. `network-partition-split-brain`
4. `node-failure-rebalance`
5. `rolling-restart`
6. `three-node-seed-rebalance`
7. `wasm-service-failover`
8. `write-ack-visibility`

### Canonical 5-node matrix

1. `node-join-under-load` (`local.json`)
2. `partition-kill-heal-under-load` (`local.json`)
3. `rolling-restart` (`local.json`)
4. `seed-restart-under-load` (`local.json`)
5. `sustained-write-throughput` (`local.json`)
6. `postgres-baseline-comparison` (`local-benchmark-5node.json`)

### Canonical 7-node matrix

1. `diag-admin-discovery` (`local-benchmark-7node.json`)
2. `seven-node-load-during-partitioning` (`local-benchmark-7node.json`)
3. `seven-node-read-write-load-distribution` (`local-benchmark-7node.json`)
4. `seven-node-read-write-load-transaction-recovery` (`local-benchmark-7node.json`)
5. `seven-node-table-partition-distribution` (`local-benchmark-7node.json`)
6. `seven-node-postgres-baseline-partition-split` (`local-benchmark-7node-partition-split.json`)

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

`solve/specs/raft-logic-migration/reports/`

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
  test/distributed/harness/__tests__/postgres-baseline-comparison-benchmark-provisioning-and-schema-watermark.test.js \
  test/distributed/harness/__tests__/postgres-baseline-comparison-discovery-fanout-and-strict-parity.test.js \
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

TS="$(date -u +%Y%m%dT%H%M%SZ)"
node test/distributed/run.js \
  --config test/distributed/config/local-benchmark-7node-partition-split.json \
  --scenario seven-node-postgres-baseline-partition-split \
  --output "test-output/reports/postgres-baseline-7node-partition-split-${TS}.report.json" \
  --verbose
```

Compare latest run against prior run for both `3node` and `7node` profiles:

```bash
scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports
```

To keep local artifact growth under control, prune stale local generated
artifacts after debugging sessions:

```bash
npm run test-output:prune:dry
npm run test-output:prune
```

Default retention policy:
- keep pinned names such as `current`, `latest`, `acceptance`, `summary`, and
  `validation`
- scope includes `test-output/`, `.tmp/`, `.playback/`, `.tap/test-results/`,
  `data/partitions/logs-p1`, `data3/partitions/logs-p1`, and
  `data/examples/movielens-lagrange-node/partitions/logs-p1`
- defaults are count-based; `--keep-days` defaults to `0`
- keep at least the latest `4` report JSON files
- keep at least the latest `4` report playback bundles
- keep at least the latest `4` legacy playback bundles under
  `test-output/.playback`, `.tmp/.playback`, and `.playback/.playback`
- keep at least the latest `4` other run-like entries in each scoped artifact
  directory, or the latest `4` replica file sets in each `logs-p1` directory
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

Required triage summary after any harness failure:

```bash
npm run analyze:distributed-failure -- --report test-output/reports/<report>.report.json
```

When to use it:

1. Immediately after a failing harness run, before making code changes.
2. When comparing repeated failing runs to confirm whether the dominant failure
   signature changed.
3. During closure checks to verify that timeout/error counts and mismatch
   classes actually moved in the expected direction.

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
rm -rf .tmp/reuse-data
```

## Running All Distributed Scenarios

Run every distributed Docker scenario sequentially (3-node, 5-node, 7-node):

```bash
bash scripts/run-all-distributed-scenarios.sh --verbose
```

Reports are written to `test-output/reports/<scenario>-<timestamp>.report.json`.
The script prints a pass/fail summary and exits with the number of failures.

Extra flags are forwarded to `run.js`:

```bash
bash scripts/run-all-distributed-scenarios.sh --fast-local --verbose
bash scripts/run-all-distributed-scenarios.sh --no-fast-local
```

## Re-running Only Failed Scenarios

After a full run (or any run that produced reports), re-run only the scenarios
whose latest report shows a failure:

```bash
bash scripts/rerun-failed-distributed-scenarios.sh --verbose
```

The script scans `test-output/reports/` for `*.report.json` files, finds the
most recent report per scenario, and re-runs those that failed. Rerun reports
are written with a `rerun-` prefix.

Options:

```bash
# Preview which scenarios would be re-run without executing them
bash scripts/rerun-failed-distributed-scenarios.sh --dry-run

# Use a different report directory
bash scripts/rerun-failed-distributed-scenarios.sh --report-dir path/to/reports --verbose
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

## Memory Leak Detection

The harness includes a memory leak analyzer that samples RSS across nodes
during scenario execution. Configuration lives in the `memoryLeak` block of
each config file.

Key settings:

1. `enabled` — collect memory samples (default `true`).
2. `failOnDetection` — fail the scenario when a leak is detected (default
   `true`).
3. `requireSamples` — fail when insufficient samples are collected (default
   `false`).

### Local Profile Enforcement

`local.json` (5-node) and `local-three-node.json` (3-node) collect leak
diagnostics but set `failOnDetection: false` and `requireSamples: false`.
Results from those profiles do not certify leak freedom. The report summarizer
prints a `!` warning when a non-enforcing run detects growth.

Use `local-memory-soak.json` for leak certification. That profile sets both
`failOnDetection: true` and `requireSamples: true`, so a detection or an
insufficient sample set fails the run.
