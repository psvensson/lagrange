# Design Document: Harness Strict Preload Readiness Recovery

## Overview

The current failure mode is a control-plane overload loop:

1. background writes and topology churn increase message-group and query load
2. CDC forward and system-table queries time out
3. readiness snapshots degrade to `routing_not_ready` and
   `schema_version_unknown`
4. strict pre-load gate fails before load phase

This design breaks that loop by:

1. running strict benchmark windows in quiet mode
2. reducing avoidable control-plane write pressure
3. using one lightweight canonical readiness snapshot
4. improving root-cause diagnostics and code modularity

## Design Principles

1. One strict readiness path only. No fallback branch ambiguity.
2. Optimize inside canonical paths. No alternate data-plane transport.
3. Fail closed with explicit reason codes.
4. Keep control-plane work bounded during benchmark windows.
5. Improve code ownership and module boundaries for faster iteration.

## Architecture Changes

### 1. Benchmark Quiet Mode

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. `src/rebalancer/*` and other periodic control-plane producers
3. `test/distributed/harness/constants.js`

#### Design

Add a benchmark quiet-mode session controlled by strict benchmark phases:

1. `quiet_mode_enter` at preflight start.
2. `quiet_mode_exit` after post-load verification.
3. Suppress non-critical control-plane periodic work while active.
4. Preserve safety-critical bypasses with explicit reason metadata.

Quiet-mode status is reported in scenario details:

1. enabled/disabled
2. start/end timestamps
3. suppressed subsystems
4. bypass count and reason histogram

### 2. Control-Plane Write Coalescing

#### Components

1. `src/node/heartbeat-service.js` and related node/system writers
2. `src/cdc/cdc-integration-service.js`
3. `src/message-group/message-group-service.js` metrics wiring

#### Design

Introduce bounded write policies for periodic control updates:

1. minimum write interval per writer class
2. skip unchanged writes
3. coalesce updates when multiple writes are pending

Expose pressure counters:

1. writes attempted
2. writes skipped as unchanged
3. writes coalesced
4. write failures/timeouts

### 3. Canonical Readiness Snapshot Provider

#### Components

1. `src/admin/admin-websocket-api.js`
2. `test/distributed/harness/node-client.js`
3. `test/distributed/scenarios/postgres-baseline-comparison.js`

#### Design

Use one compact snapshot contract for strict gating:

1. `routingReady`
2. `schemaReady`
3. `topologyReady`
4. `requiredSchemaVersion`
5. `appliedSchemaVersion`
6. `reasons[]`

The strict gate consumes this snapshot only. In strict mode, expensive fallback
queries are removed from gating logic.

### 4. Strict Gate Reason Precedence

#### Components

1. New dedicated strict-gate evaluator module in distributed scenario code
2. `test/distributed/harness/__tests__/postgres-baseline-comparison-scenario.test.js`

#### Design

Define deterministic reason precedence and dominant-cause selection:

1. control-plane availability (admin/queryability)
2. routing readiness
3. schema version known/lag
4. topology readiness

Per-node reasons are still preserved, but one dominant class is emitted for the
top-level failure envelope.

### 5. Saturation Diagnostics Pipeline

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. `test/distributed/harness/report-writer.js`
3. `scripts/compare-latest-baseline-runs.sh`

#### Design

Add first-class saturation fields:

1. `cdcForwardTimeoutCount`
2. `systemTableQueryTimeoutCount`
3. `snapshotCollectionErrorCount`
4. per-node readiness transition timeline

These fields are included in:

1. scenario details
2. failure artifact
3. compare script summary

### 6. Working-Condition Refactor

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. scenario-local helper modules in `test/distributed/scenarios/`

#### Design

Split large scenario logic into owned modules:

1. readiness snapshot adapter
2. strict gate evaluator
3. quiet-mode controller
4. saturation diagnostics collector

This reduces coupling and enables faster unit testing on individual modules.

### 7. Atomic Assignment Reservation Layer

#### Components

1. `src/bootstrap/bootstrap-api.js`
2. `src/bootstrap/message-group-assignment.js`
3. system-table persistence for assignment reservation state

#### Design

Add an explicit reservation phase before bootstrap returns `MOVE_REPLICA`:

1. Choose candidate replica from current cache state.
2. Persist reservation atomically with unique `(replicaId, active reservation)`
   semantics and lease expiry.
3. Return `assignmentId` and lease metadata in bootstrap response.
4. Reject duplicate reservations when concurrent joiners contend for the same
   replica.

This removes the race where two joiners can start with the same replica
identity.

### 8. Assignment Token Handshake

#### Components

1. `src/bootstrap/bootstrap-api.js` (`/bootstrap`, `/register-service`)
2. `src/bootstrap/node-joining-service.js`
3. replica operation telemetry wiring

#### Design

Require register-service to prove assignment ownership:

1. Joiner stores `assignmentId` returned from bootstrap.
2. Joiner includes `assignmentId` in `register-service` payload for
   `MOVE_REPLICA`.
3. Seed validates token exists, is unexpired, matches `targetNodeId` and
   `replicaId`, and is still reserving the handoff.
4. Commit only on valid token; otherwise fail closed with stable error code.

### 9. Single-Owner Replica Invariant

#### Components

1. `src/bootstrap/bootstrap-api.js`
2. message-group lifecycle/reconciliation path
3. services metadata integrity checks

#### Design

Enforce that each message-group `replicaId` has one owner:

1. Reject service registration that would create conflicting active owner rows.
2. Add startup/reconciler guard that refuses to run replica service when
   conflicting ownership exists in metadata.
3. Emit deterministic diagnostics for ownership conflicts to simplify triage.

### 10. Join READY Convergence Alignment

#### Components

1. `src/bootstrap/node-joining-service.js`
2. `src/admin/admin-websocket-api.js`
3. shared strict readiness evaluator modules

#### Design

After CDC pipeline wiring is proven, add a convergence gate aligned with strict
preload semantics:

1. Query canonical readiness snapshot for benchmark table scope.
2. Require `routingReady && topologyReady` and
   `appliedSchemaVersion >= requiredSchemaVersion`.
3. Keep the gate snapshot-only and fail closed with stable reason codes.
4. Only then transition joiner to READY and admit load-node selection.

### 11. Race/Convergence Reproducers

#### Components

1. distributed integration suites under `test/distributed/`
2. strict readiness test helpers

#### Design

Add deterministic regression coverage:

1. Concurrent bootstrap/join race test validating unique assignment ownership.
2. Invalid token test validating register-service rejection path.
3. Strict convergence test validating non-null applied schema version on all
   required load nodes.

## Data Contracts

### Strict Readiness Snapshot (per node)

```json
{
  "nodeId": "node-2",
  "routingReady": true,
  "schemaReady": true,
  "topologyReady": true,
  "requiredSchemaVersion": "1772175358585",
  "appliedSchemaVersion": "1772175358585",
  "reasons": []
}
```

### Failure Artifact Extension

```json
{
  "rootCauseClass": "discovery",
  "phase": "pre_load_gate",
  "dominantReason": "schema_version_unknown",
  "reasonCounts": {
    "schema_version_unknown": 6,
    "routing_not_ready": 2
  },
  "saturation": {
    "cdcForwardTimeoutCount": 81,
    "systemTableQueryTimeoutCount": 24,
    "snapshotCollectionErrorCount": 0
  }
}
```

### Bootstrap MOVE_REPLICA Assignment Extension

```json
{
  "messageGroupAssignment": {
    "strategy": "move_replica",
    "replicaToMove": "mg-1-r2",
    "assignmentId": "a6f5b1e5-6a5f-4a58-8f13-4f7bd8f3904e",
    "assignmentLeaseExpiresAt": 1772190000000
  }
}
```

## Rollout Plan

1. Introduce quiet-mode contract and no-op instrumentation.
2. Add failing tests for coalescing and strict snapshot-only gate behavior.
3. Implement write-pressure reduction and strict gate precedence.
4. Add assignment reservation + token handshake for `MOVE_REPLICA`.
5. Enforce single-owner replica invariant in registration and startup paths.
6. Align join READY gating with canonical versioned readiness convergence.
7. Add saturation diagnostics and compare-script output.
8. Refactor scenario modules without behavior change.
9. Validate with focused unit/integration tests, then strict 3-node and 7-node
   baselines.

## Risks and Mitigations

1. Risk: quiet mode suppresses behavior needed for safety.
   Mitigation: bypass allowlist + explicit bypass reason telemetry.
2. Risk: coalescing hides liveness updates.
   Mitigation: enforce max staleness interval and coverage tests.
3. Risk: refactor introduces regressions.
   Mitigation: extract modules behind existing tests first, then change logic.
