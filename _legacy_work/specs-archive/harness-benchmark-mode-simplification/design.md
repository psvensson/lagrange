# Design Document: Harness Benchmark Mode Simplification and Unification

## Overview

This design simplifies benchmark execution around one invariant:

`one benchmark mode -> one readiness path -> one routing path -> one outcome contract`

Instead of layering more guards on top of mixed behaviors, we reduce the number
of code paths and make strict benchmark mode deterministic.

## Design Principles

1. Prefer deletion of duplicate paths over adding new fallback logic.
2. Fail closed on missing canonical readiness metadata.
3. Keep benchmark mode explicit, strict, and observable in reports.
4. Isolate benchmark stability from background topology churn.

## Architecture Changes

### 1. Canonical Benchmark Readiness API

#### Components

1. `src/admin/admin-websocket-api.js`
2. `test/distributed/harness/node-client.js`
3. `test/distributed/scenarios/postgres-baseline-comparison.js`

#### Change

Add one canonical readiness payload for benchmark gating (table-scoped):

1. `benchmarkReady`
2. `routingReady`
3. `schemaReady`
4. `topologyReady`
5. `reasons[]`

Harness pre-load gates use this readiness payload only in strict benchmark
mode.

### 2. Canonical Routing/Metadata Path

#### Components

1. `src/query/sql-query-engine.js`
2. `src/query/partition-resolver.js`
3. `src/cache/system-table-cache.js`
4. `src/partition/partition-service.js` (only where routing metadata is built)

#### Change

Ensure partition resolution does not depend on local-only metadata shortcuts:

1. remove benchmark-mode local-only table-routing shortcuts
2. route through canonical system metadata that is valid cluster-wide
3. fail with explicit class when canonical metadata is absent

### 3. Benchmark Topology Freeze

#### Components

1. `src/rebalancer/unified-rebalancer.js`
2. benchmark scenario controls in
   `test/distributed/scenarios/postgres-baseline-comparison.js`

#### Change

During benchmark warmup and load windows:

1. freeze non-critical rebalancing operations
2. allow only safety-critical operations with explicit reason code
3. record freeze/bypass decisions in scenario details

### 4. Strict Profile Unification

#### Components

1. `test/distributed/config/local-benchmark-3node.json`
2. `test/distributed/config/local-benchmark-7node.json`
3. `test/distributed/harness/constants.js`
4. compare script and README references

#### Change

Unify strict profile contract for both benchmark sizes:

1. required fanout defaults to cluster size
2. strict mode defaults enabled
3. explicit opt-out stays possible but reported

### 5. Failure Artifact Contract

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. `test/distributed/harness/report-writer.js`
3. `scripts/compare-latest-baseline-runs.sh`

#### Change

Emit one structured benchmark failure envelope:

1. `rootCauseClass`
2. `phase`
3. `affectedNodeIds[]`
4. `reasonCounts{}`
5. `strictMode`

## Data Contract (Target)

```json
{
  "benchmarkMode": "strict",
  "readinessGate": {
    "requiredNodeCount": 7,
    "readyNodeCount": 7,
    "status": "passed",
    "nodes": {
      "node-a": {
        "benchmarkReady": true,
        "routingReady": true,
        "schemaReady": true,
        "topologyReady": true,
        "reasons": []
      }
    }
  },
  "failure": {
    "rootCauseClass": "none",
    "phase": null,
    "affectedNodeIds": [],
    "reasonCounts": {}
  }
}
```

## Rollout Strategy

1. Introduce canonical readiness API with tests.
2. Migrate harness gate to canonical readiness path in strict mode.
3. Remove duplicate/fallback pre-load checks in strict mode.
4. Introduce topology freeze in benchmark windows.
5. Unify strict profile defaults and reporting contract.
6. Re-run 3-node and 7-node baselines and compare against prior runs.

## Risks And Mitigations

1. Risk: stricter fail-closed behavior increases short-term failures.
   Mitigation: root-cause class + per-node reasons are required deliverables.
2. Risk: freeze policy may hide real balancing defects.
   Mitigation: allow explicit safety-critical bypass with metrics.
3. Risk: migration touches many files.
   Mitigation: phase work; keep each phase gated by focused tests.

