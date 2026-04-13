# Design Document: Harness Versioned CDC Readiness Convergence

## Overview

This design replaces probe-centric strict readiness with a versioned convergence
contract. The benchmark harness will acquire one required schema/version
watermark at benchmark-table creation, then require every load node to prove
its local CDC-fed system cache has applied at least that version before load
starts.

The design has one core flow:

1. Capture required schema/version watermark at table-create commit.
2. Track per-node per-table applied schema/version in local cache.
3. Evaluate one canonical readiness predicate from those values.
4. Enforce a cluster-wide stable convergence barrier before load.
5. Emit causal diagnostics for failed and successful convergence.

## Key Design Decisions

1. One readiness truth path in strict mode:
   required watermark + local applied watermark.
2. Readiness is version-aware and monotonic, not heuristic.
3. Barrier fail output is predicate- and version-specific per node.
4. Diagnostics capture causal timeline, not only terminal error strings.

## Architecture Changes

### 1. Required Watermark Capture

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. benchmark table creation path (same canonical path used today)

#### Behavior

1. On benchmark table creation, capture `requiredSchemaVersion`.
2. Persist watermark in benchmark scenario context and report details.
3. Strict mode fails immediately if required watermark is unavailable.

### 2. Applied-Version Tracking in CDC/Cache Path

#### Components

1. `src/cache/system-table-cache.js`
2. `src/message-group/cdc-handler.js`
3. related constants modules for version key/reason codes

#### Behavior

1. Maintain per-table `appliedSchemaVersion` watermark updated on CDC apply.
2. Enforce monotonic update semantics.
3. Keep this state as read-only output; no direct mutation outside CDC path.

### 3. Canonical Readiness Predicate

#### Components

1. readiness evaluator in benchmark scenario/harness gate logic
2. admin readiness payload source (`src/admin/admin-websocket-api.js`)

#### Behavior

1. Evaluate node readiness from:
   - admin queryability
   - routing readiness
   - `appliedSchemaVersion >= requiredSchemaVersion`
2. Produce stable reason codes:
   - `admin_not_queryable`
   - `routing_not_ready`
   - `schema_version_unknown`
   - `schema_version_lag`
3. Strict mode uses this predicate only for load-admission decisions.

### 4. Cluster-Wide Convergence Barrier

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. harness gate/polling utilities used by pre-load checks

#### Behavior

1. Poll all required load nodes for predicate status and versions.
2. Require all nodes to remain ready for configured stable window.
3. Timeout failure includes:
   - required version
   - per-node observed version
   - per-node unmet predicates

### 5. Convergence Timeline Diagnostics

#### Components

1. report details payload wiring
2. compare script: `scripts/compare-latest-baseline-runs.sh`

#### Behavior

1. Emit timeline events:
   - `table_create_committed`
   - `cdc_emitted`
   - `cdc_received`
   - `cache_applied_version`
   - `readiness_predicate_pass`
2. Add compact version-lag summary per node in failure diagnostics.
3. Extend compare script to print version convergence deltas when present.

## Data Contracts

### Convergence Inputs

```json
{
  "requiredSchemaVersion": "1740589945123:7",
  "tableName": "benchmark_events",
  "requiredLoadNodeIds": ["node-a", "node-b", "node-c"]
}
```

### Node Readiness Snapshot

```json
{
  "nodeId": "node-b",
  "adminQueryable": true,
  "routingReady": true,
  "requiredSchemaVersion": "1740589945123:7",
  "appliedSchemaVersion": "1740589945123:6",
  "schemaVersionReady": false,
  "unmetReasons": ["schema_version_lag"]
}
```

### Failure Artifact Extension

```json
{
  "rootCauseClass": "discovery",
  "phase": "pre_load_gate",
  "versionConvergence": {
    "tableName": "benchmark_events",
    "requiredSchemaVersion": "1740589945123:7",
    "nodes": {
      "node-a": {"appliedSchemaVersion": "1740589945123:7", "ready": true},
      "node-b": {"appliedSchemaVersion": "1740589945123:6", "ready": false}
    }
  }
}
```

## Failure Policy

1. Strict mode fails when any required node cannot prove required version.
2. Missing version data is treated as failure, not warning.
3. Load phase is blocked until barrier passes.

## Testing Strategy

1. Unit tests for monotonic applied-version tracking and out-of-order CDC.
2. Harness scenario tests for:
   - strict barrier pass on full convergence
   - strict barrier fail on one lagging node
3. Integration tests on four-plus nodes validating convergence contract.
4. Compare-script tests for convergence summary output.

## Rollout Plan

1. Land tracker + predicate with failing tests first.
2. Wire barrier into strict pre-load gate.
3. Add diagnostics timeline and compare output.
4. Run strict 3-node and 7-node baselines and record deltas.

