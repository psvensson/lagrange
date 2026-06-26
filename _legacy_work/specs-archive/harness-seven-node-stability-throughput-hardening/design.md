# Design Document: Harness Seven-Node Stability and Throughput Hardening

## Overview

This design turns benchmark validity and cluster stability into hard gates,
starting with seven-node profile behavior. It addresses the current state where
runs pass while using only one SUT load node and while emitting repeated
internal instability signals.

The design is structured as three phases:

1. `P0` strict benchmark truthfulness gates
2. `P1` CDC/subscription and rebalancing stability hardening
3. `P2` throughput-focused execution-path optimization

## Key Design Decisions

1. Strict benchmark mode has one code path: no partial discovery fallback.
2. Parity mismatch is a benchmark failure in strict mode.
3. Internal instability signals are promoted to explicit thresholded failures.
4. Readiness gate spans both data-plane and control-plane queryability.
5. CDC propagation reliability is explicit (handshake + catch-up), not implicit.

## Architecture Changes

### 1. Strict Discovery and Parity Gate (`P0`)

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. `test/distributed/harness/node-client.js`
3. `test/distributed/harness/report-writer.js`
4. `scripts/compare-latest-baseline-runs.sh`

#### Behavior

1. Replace best-effort partial-return behavior in strict benchmark mode with
   fail-on-insufficient-node discovery.
2. Keep full diagnostics payload for every source and every failed probe.
3. Enforce parity failure when `effective.sutLoadNodeCount` differs from
   required profile count.
4. Expose gate decision artifacts in phase timeline and top-level summary.

#### Config Additions

Add benchmark keys:

1. `strictDiscovery: boolean` (default `true` in benchmark profiles)
2. `requiredSutLoadNodeCount: number` (default `cluster.size`)
3. `strictParity: boolean` (default `true` in benchmark profiles)

### 2. Internal Signal Threshold Policy (`P0`)

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. `test/distributed/harness/log-analyzer.js`
3. `test/distributed/harness/assertion-policy.js`

#### Behavior

1. Classify and count internal warning/error signals into stable classes:
   - `operation_failed`
   - `cdc_safe_fallback`
   - `cdc_buffered_without_subscriber`
   - `critical_rebalancing_state`
2. Evaluate counts against strict thresholds before scenario success.
3. Emit class counts and threshold decisions in report details.

#### Config Additions

1. `internalSignalThresholds.errorsByClass`
2. `internalSignalThresholds.warningsByClass`
3. `internalSignalThresholds.failOnThresholdBreach`

### 3. Hard Pre-Load Cluster-Wide Readiness Barrier (`P0`)

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. `test/distributed/harness/gate-engine.js`
3. `src/admin/admin-websocket-api.js` (readiness source)

#### Behavior

1. Extend pre-load gate to require all required load nodes to satisfy:
   - admin queryability
   - discovery routing readiness
   - benchmark-table schema readiness
   - rebalancing below threshold
2. Require stable satisfaction window before transition to load phase.
3. Fail with per-node reason detail and latest diagnostics snapshot.

#### Config Additions

1. `strictPreloadReadiness: boolean`
2. `preloadRequiredStableMs`
3. `preloadMaxReplicaOpsInFlight`

### 4. CDC Handshake and Catch-Up Protocol (`P1`)

#### Components

1. CDC publish/subscribe path in runtime services
2. Admin diagnostics surfaces used by harness and integration tests
3. Metrics emission path in report and compare tooling

#### Behavior

1. Introduce explicit subscribe ack containing epoch/version position.
2. If subscriber gap is detected, trigger deterministic backfill from last
   acknowledged position.
3. Transition to steady stream only after catch-up complete.
4. Expose catch-up metrics and lag for each node.

### 5. Rebalancing Hysteresis and Benchmark Pinning (`P1`)

#### Components

1. Rebalance coordination logic
2. Benchmark scenario control hooks
3. Convergence and phase diagnostics

#### Behavior

1. Add ownership-move cooldown window and minimum-delta trigger.
2. Allow benchmark mode to pin ownership during load phase, except scenarios
   explicitly testing failure/rebalance.
3. Fail strict benchmarks on sustained critical rebalancing states.

### 6. Multi-Node System-Table Read Path Cleanup (`P2`)

#### Components

1. System-table read utilities and any local-only shortcuts
2. Integration tests for four-plus nodes

#### Behavior

1. Remove non-canonical local shortcut paths in multi-node benchmark mode.
2. Ensure one canonical path for system-table visibility checks.
3. Add integration assertions that each node can query expected admin/system
   surfaces under multi-node topology.

### 7. Admission/Queue Overload Policy (`P2`)

#### Components

1. `test/distributed/harness/load-generator.js`
2. `test/distributed/harness/node-client.js`
3. report writer and compare script

#### Behavior

1. Enforce bounded queue behavior with explicit early rejection reasons.
2. Export per-node queue pressure and reject metrics.
3. Keep reason-code stable for analysis and regression gates.

## Data Contracts

### Strict Gate Record

```json
{
  "strictBenchmarkGate": {
    "discovery": {
      "requiredNodes": 7,
      "reachableNodes": 1,
      "status": "failed",
      "reason": "insufficient_reachable_nodes"
    },
    "parity": {
      "status": "failed",
      "reasonCodes": [
        "load_fanout_mismatch",
        "per_node_budget_mismatch"
      ]
    },
    "internalSignals": {
      "status": "failed",
      "counts": {
        "operation_failed": 12,
        "critical_rebalancing_state": 5
      }
    }
  }
}
```

### CDC Stability Metrics

```json
{
  "cdc": {
    "nodeId": "...",
    "subscriberCount": 3,
    "bufferedEvents": 0,
    "catchupLagEvents": 0,
    "catchupThroughputEventsPerSec": 0,
    "mode": "steady"
  }
}
```

## Failure Policy

1. In strict benchmark mode, any strict gate failure marks scenario failed.
2. Soft mode can remain available for exploratory debugging but is not default
   for benchmark profiles.
3. Error and warning thresholds are part of the benchmark contract.

## Testing Strategy

1. Scenario tests for strict discovery failure and strict parity failure.
2. Scenario tests for internal signal threshold breaches.
3. Integration tests for four-plus node admin queryability and CDC catch-up.
4. Rebalancing tests for cooldown/pinning behavior under benchmark mode.
5. Compare-script tests for strict gate and CDC summary output.

## Rollout Strategy

1. Land strict-gate and reporting code paths first with tests.
2. Enable strict mode defaults for benchmark profiles.
3. Land CDC handshake/catch-up and rebalancing hysteresis.
4. Land P2 throughput path cleanup and admission policy tuning.
5. Re-run 3-node and 7-node baselines and record before/after deltas.
