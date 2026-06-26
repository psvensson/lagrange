# Raft Optimization Spec Closure Report (No Liferaft Changes)

Date: 2026-02-17
Spec: `.kiro/specs/raft-optimization-spec-no-liferaft-changes.md`

## Scope Closed in This Report

This report closes the remaining items previously identified:

1. WS5 queue/backpressure telemetry hardening.
2. Verification-matrix closure evidence for failover and convergence.
3. Phase-4 consolidated before/after report with recommended defaults.

## WS5 Completion: Bounded Pending Requests + Saturation Telemetry

### Changes

- Added a hard pending-request capacity with backpressure in:
  - `src/partition/pending-request-tracker.js`
  - `src/partition/partition-constants.js`
- Added queue telemetry counters:
  - `trackedTotal`, `resolvedTotal`, `rejectedTotal`
  - `timedOutTotal`, `staleCleanedTotal`
  - `backpressureRejectTotal`, `maxPendingObserved`
  - `pendingCount`, `maxPendingRequests`, `availableCapacity`, `saturationPercent`
- Exposed partition-level tracker stats:
  - `src/partition/partition-service.js` (`getStats()`)
- Aggregated tracker telemetry into existing diagnostics owner path:
  - `src/node/replica-handler.js` (`getStats().pendingRequestTracker`)

### New/Updated Tests

- Added: `test/partition/pending-request-tracker.test.js`
- Updated: `test/node/replica-handler.test.js`
- Re-ran related properties:
  - `test/partition/pending-request-round-trip.property.test.js`
  - `test/partition/timeout-cleanup.property.test.js`

All above passed in one targeted run.

## Verification Matrix Closure

### Idle Soak (30 minutes)

Artifact:
- `test-output/idle-soak30m-20260217T174557/summary-tail80.json`

Tail-window results (steady state):
- CPU avg: `1.7334%`
- Write rate avg: `26145.33 B/s` (`25.65 KB/s`)
- RSS growth trend (last): `431600.78 B/min` (`0.41 MB/min`)

These satisfy the target envelope in the spec.

### Convergence + Failover Integration Checks

Artifacts:
- `test-output/raft-optimization-verification-20260217/node-join-convergence-slo.tap`
- `test-output/raft-optimization-verification-20260217/failure-scenarios.tap`
- `test-output/raft-optimization-verification-20260217/verification-summary.json`
- `test-output/raft-optimization-verification-20260217/harness-summary.json`

Results:
- `node-join-convergence-slo.integration.test.js`: `7/7` pass (`29.3s`)
- `failure-scenarios.integration.test.js`: `57/57` pass (`12.8s`)

## Before/After Summary

### Baseline (pre-optimization)

Operator-observed baseline before these changes:
- Idle CPU: `~10%`
- Memory growth: `~100 MB/min`
- Disk writes: `~1 MB/s`

### After (current build)

From `summary-tail80.json`:
- Idle CPU: `1.7334%` (about `82.7%` lower)
- Memory growth trend: `0.41 MB/min` (about `99.6%` lower)
- Disk writes: `25.65 KB/s` (about `97.5%` lower)

## Throughput/Latency Tradeoffs (Against Replicated Postgres Baseline)

Artifacts:
- `test-output/postgres-baseline-size3-current-20260217.report.json`
- `test-output/postgres-baseline-size5-current-20260217.report.json`

3x cluster comparison:
- Throughput ratio (SUT/Baseline): `0.01828`
- P99 latency ratio (SUT vs baseline avg latency): `335.25`
- Convergence: `settledAfterMs=5166`, `leaderChanges=0`, `maxOverTargetMs=0`

5x cluster comparison:
- Throughput ratio (SUT/Baseline): `0.00552`
- P99 latency ratio (SUT vs baseline avg latency): `2083.11`
- Convergence: `settledAfterMs=5847`, `leaderChanges=0`, `maxOverTargetMs=0`

Interpretation:
- Idle-resource objectives are now met.
- Primary remaining bottlenecks are in write-path throughput and tail latency.

## Recommended Defaults

For low-idle-overhead production profile:

- `logging.persistMetricsLogs = false`
- `logging.metricsDefaultResolutionMs = 30000`
- `logging.metricsDetailedWindowEnabled = false`
- `logging.metricsDetailedWindowTtlMs = 300000`
- `controlPlane` endpoint refresh cadence remains coarse (current 5m refresh behavior)
- Pending request tracker capacity guardrail: `maxPendingRequests = 1024`

For controlled rollouts where faster idle-downshift is desired:

- Enable adaptive timing (`raft.adaptiveTimingEnabled = true`) with existing conservative hysteresis defaults (promote=2, demote=6, sample interval=5000ms) after cluster-specific soak validation.
