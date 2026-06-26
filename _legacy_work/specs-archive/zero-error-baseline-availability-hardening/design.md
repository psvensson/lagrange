# Design Document: Zero-Error Baseline Availability Hardening

## Overview

This design addresses the current baseline failure pattern where a small number
of true timeouts trigger breaker-open cascades and large operation-error volume.

The design goal is to eliminate real operational faults, not to relabel them.

Key strategy:

1. isolate true data-path faults from failure-amplification behavior,
2. make discovery reflect workload-readiness (not endpoint presence only),
3. strengthen startup and topology stability gates,
4. validate behavior with explicit 3-node and 7-node acceptance tests.

## Current Failure Evidence

### Evidence Snapshot A

Source:
`test-output/reports/postgres-baseline-comparison-orchestrator-latest.report.json`
(timestamp in report: `2026-02-22T19:07:38.575Z`)

Observed values:

1. load: `total=3600`, `success=345`, `failed=3255`, `errors=3255`
2. load-channel telemetry: `errors=12`, `timeouts=12`, `breakerOpens=12`
3. effective SUT load nodes: 2
4. benchmark policy in run: `nodeFailureThreshold=1`, `cooldownMs=5000`

Interpretation:

1. true timeout count is small (`12`),
2. operation failure count is huge (`3255`),
3. failure-amplification behavior dominates over root fault count.

### Evidence Snapshot B

Source set:
multiple `postgres-baseline-7node-*.report.json` files.

Observed classes:

1. startup failures: nodes did not reach ACTIVE within timeout,
2. preflight failures: no discovered reachable `sys-postgres-wire` nodes,
3. convergence failures under high startup instability.

Interpretation:

1. readiness and discovery are unstable during startup/churn,
2. load correctness cannot be guaranteed until startup contract is stronger.

## Design Goals

1. Prevent breaker cascades from small timeout bursts.
2. Ensure discovery-selected nodes are actually workload-ready.
3. Ensure benchmark starts only when cluster is topology-stable.
4. Keep one owner per concern and remove dual code paths.

## Non-Goals

1. Replacing Raft implementation internals.
2. Replacing admin websocket transport protocol end-to-end.
3. Redefining SQL semantics.

## Architecture Changes

### 1. Load Failure Ownership and Semantics

#### Problem

LoadGenerator and NodeClient both influence fault behavior, creating layered
policies that can amplify faults.

#### Design

1. **NodeClient is sole owner of load-channel breaker policy.**
2. LoadGenerator remains responsible for pacing, dispatch, and failover routing,
   but not breaker decisions.
3. Metrics model remains:
   - `errors` and `failed`: operation-level failures,
   - `attemptErrors`: transient failed attempts.

#### Module Impacts

1. `test/distributed/harness/node-client.js`
2. `test/distributed/harness/load-generator.js`
3. `test/distributed/harness/constants.js`

#### Policy Defaults (Benchmark Profiles)

1. `load.circuitBreakerThreshold`: increase from fragile single-fault behavior
   to burst-tolerant behavior.
2. `load.cooldownMs`: reduce blackout duration.
3. `load.timeoutMs`: align with observed distributed latency envelope.

Exact values are finalized after reproduction tests; initial target values are
set in rollout tasks.

### 2. Transport-Level Channel Isolation

#### Problem

All channel traffic can share one node admin socket path, allowing control/snapshot
work to interfere with load responsiveness.

#### Design

1. Introduce channel-isolated request lanes in NodeHandle/NodeClient path.
2. Ensure load lane budget is independent of control/snapshot lane budget.
3. Preserve one canonical API surface in NodeClient.

#### Expected Outcome

1. Control-plane probe bursts do not raise load timeout rate.
2. Snapshot queries cannot starve load dispatch.

### 3. Discovery Readiness Contract Upgrade

#### Problem

Current discovery catalog primarily reflects endpoint presence and health.
That is insufficient for workload routing decisions.

#### Design

Extend local discovery snapshot with explicit readiness block per replica.

Proposed additive fields:

```json
{
  "replicas": [
    {
      "nodeId": "...",
      "healthStatus": "healthy",
      "readiness": {
        "workloadReady": true,
        "routingReady": true,
        "schemaReady": true,
        "replicaOpsInFlight": 0,
        "leadershipStable": true,
        "reasons": []
      }
    }
  ]
}
```

Design rules:

1. Additive schema only; existing fields remain.
2. Readiness computed from canonical cache/system tables only.
3. No ad hoc caches or parallel state stores.

### 4. Schema Readiness as Discovery Input

#### Problem

`Table not found` appears during pre-load in some runs; discovery does not encode
that readiness dimension.

#### Design

1. Add optional table-scoped readiness query input:
   `tableName` / `tableId` context for readiness evaluation.
2. For benchmark scenario, include `benchmark_events` readiness in discovery
   selection.
3. Preserve current pre-load gate, but source readiness from canonical discovery
   response rather than separate bespoke logic where possible.

### 5. Startup and ACTIVE-State Gate Strengthening

#### Problem

7-node runs frequently fail before load due ACTIVE/readiness probe timeouts.

#### Design

1. Tighten startup gate diagnostics and retry policy.
2. Require combined ACTIVE + control-snapshot coverage barrier before scenario
   preflight transitions.
3. Make startup failure reasons machine-readable for report aggregation.

### 6. Topology Lock Before Load

#### Problem

Load is sensitive to in-flight replica operations and leadership churn.

#### Design

Introduce explicit topology lock condition in pre-load gate:

1. `replica_operations.inFlightCount == 0`,
2. leadership churn below threshold within stable window,
3. discovery workload-ready set stable for stable window.

If not met, fail fast with diagnostics; do not start load.

### 7. Admission Control and Backpressure

#### Problem

Timeouts should be last-resort, but current behavior can enter timeout then
breaker-open storm quickly.

#### Design

1. Add effective dispatch-capacity checks using channel health and breaker state.
2. Prefer delayed dispatch/backpressure over dispatch into guaranteed failure.
3. Emit queue delay metrics so throughput loss is measurable.

### 8. Observability Contract

Report additions (additive):

1. `loadMetrics.attemptErrors`
2. `details.systemUnderTest.metrics.attemptErrors`
3. per-node channel breaker state snapshots
4. readiness exclusion reasons by node
5. topology-lock diagnostics

## Sequence Flows

### Run Flow (Target)

```text
startup_gate -> discovery_readiness -> topology_lock -> load -> drain -> verify
```

### Failure Handling Flow (Load)

```text
timeout burst -> NodeClient breaker state update -> bounded backpressure
-> half-open recovery probe -> resumed traffic
```

No second breaker implementation participates in this path.

## Data Model Changes

### Discovery Snapshot (Additive)

1. `services[*].replicas[*].readiness.workloadReady`
2. `services[*].replicas[*].readiness.schemaReady`
3. `services[*].replicas[*].readiness.replicaOpsInFlight`
4. `services[*].replicas[*].readiness.leadershipStable`
5. `services[*].replicas[*].readiness.reasons[]`

### Harness Metrics (Additive)

1. `loadMetrics.attemptErrors`
2. per-node/per-channel breaker counters
3. dispatch queue delay histogram

## Compatibility and Migration

1. Discovery/readiness fields are additive and optional for existing consumers.
2. Harness scenario code reads new fields when present and fails closed when
   required readiness data is missing.
3. During migration, one temporary compatibility adapter may map old discovery
   rows to new readiness schema, but must be removed before completion.

## Risks and Mitigations

1. **Risk:** Overly strict readiness can block valid runs.
   - Mitigation: reason-coded diagnostics + staged policy rollout.
2. **Risk:** Channel isolation increases complexity.
   - Mitigation: test-first per-channel invariants and single NodeClient API.
3. **Risk:** Additional readiness queries add overhead.
   - Mitigation: local cache-only computation and bounded polling intervals.

## Validation Strategy

1. Reproduce current breaker-cascade failure in integration test.
2. Apply single-owner breaker fix and confirm operation errors drop to zero
   under same synthetic burst.
3. Reproduce discovery/schema mismatch and confirm canonical readiness prevents
   load start.
4. Run 3-node and 7-node benchmark profiles with acceptance criteria from
   requirements.

