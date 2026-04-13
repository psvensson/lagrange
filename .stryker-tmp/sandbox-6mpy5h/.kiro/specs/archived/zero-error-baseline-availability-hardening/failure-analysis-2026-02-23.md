# Failure Analysis: Baseline Harness Availability

Date: 2026-02-23

## Purpose

Document observed failure classes behind baseline harness errors and map them to
concrete tactical, strategic, and architectural actions.

## Evidence Reviewed

### Primary passing-but-error-heavy run

- File:
  `test-output/reports/postgres-baseline-comparison-orchestrator-latest.report.json`
- Scenario pass state: `passed=true`
- Load metrics:
  - `total=3600`
  - `success=345`
  - `failed=3255`
  - `errors=3255`
- Load channel metrics:
  - `errors=12`
  - `timeouts=12`
  - `breakerOpens=12`
- Profile values in report:
  - `loadQueryTimeoutMs=2000`
  - `loadNodeMaxInFlight=2`
  - `nodeFailureThreshold=1`
  - `nodeFailureCooldownMs=5000`

Interpretation:

1. real fault count is small (`12` timeouts),
2. breaker-open behavior amplifies into thousands of operation failures,
3. this is an availability-control defect, not a pure data correctness defect.

### 7-node failure set (recent)

Examples:

1. `postgres-baseline-7node-fast-gatescale.report.json`
2. `postgres-baseline-7node-fast-parallelstatus.report.json`
3. `postgres-baseline-7node-fast-discovery-retry.report.json`

Observed failure classes:

1. `Not all nodes reached ACTIVE state within timeout`
2. `No discovered reachable sys-postgres-wire nodes available`
3. convergence timeout before benchmark load in some runs

Interpretation:

1. startup readiness and discovery are unstable under larger cluster boot/churn,
2. load-phase correctness cannot be guaranteed without stronger startup barriers.

## Elephants in the Room

### 1) Breaker Cascade (Immediate Tactical and Architectural)

Symptoms:

1. tiny timeout burst causes long blackout windows,
2. operation errors become mostly synthetic fast rejects.

Why this is critical:

1. it hides true fault magnitude,
2. it creates unstable benchmark behavior unrelated to core partitioning health,
3. it can starve progress on small clusters (2 effective load nodes in run).

Actions:

1. single breaker owner on load path,
2. burst-tolerant threshold and shorter cooldown,
3. half-open recovery probe and backpressure-first behavior.

### 2) Discovery vs Workload-Readiness Gap (Strategic)

Symptoms:

1. discovered replicas can still fail benchmark table queryability (`table not found`),
2. endpoint health alone is insufficient for routing.

Why this is critical:

1. external and internal consumers need canonical readiness,
2. partition/replication readiness has multiple dimensions not represented today.

Actions:

1. additive readiness contract in discovery API,
2. schema visibility + topology safety signals,
3. harness selection based only on canonical readiness fields.

### 3) Startup/ACTIVE Convergence Fragility at 7 Nodes (Architectural)

Symptoms:

1. repeated ACTIVE timeout failures before scenario preflight,
2. discovery failures coupled with control-plane query instability.

Why this is critical:

1. benchmark cannot reliably exercise partition/replication behavior,
2. invalidates confidence in load-path test outcomes.

Actions:

1. stronger startup barrier (ACTIVE + snapshot coverage),
2. improved reason-coded diagnostics,
3. staged startup retries with bounded backoff and clearer failure classes.

### 4) Topology Churn During Benchmark Windows (Strategic)

Symptoms:

1. pre-load reasons frequently include non-zero in-flight replica operations,
2. load and stabilization windows can overlap.

Why this is critical:

1. partition move/rebalance churn injects latency spikes and timeouts,
2. can trigger breaker cascade even when core write path is otherwise healthy.

Actions:

1. explicit topology lock before load,
2. leadership stability bound in lock window,
3. fail-fast when lock cannot be achieved.

## Related Opportunities Along the Same Path

1. Channel transport isolation (load vs control/snapshot) to reduce head-of-line
   blocking under probe pressure.
2. Admission control with queue-delay observability to turn overload into
   throughput degradation instead of timeout storms.
3. Per-node breaker state export in reports for faster root-cause attribution.
4. 3-node and 7-node acceptance SLOs with mandatory repeated-run consistency.

## Tactical vs Strategic vs Architectural Summary

### Tactical (short-term, high leverage)

1. safer breaker defaults in benchmark profiles,
2. tighter hard-fail policy on operation errors,
3. runbook thresholds for timeout and breaker-open anomaly detection.

### Strategic (mid-term)

1. canonical discovery readiness schema with table-aware readiness,
2. topology-lock and startup gate strengthening,
3. reproducible integration tests for current failure classes.

### Architectural (long-term)

1. single owner per load failure concern,
2. channel-isolated transport lanes,
3. complete removal of fallback/dual logic in readiness and breaker paths.

## Proposed Spec Package

The implementation details are captured in this spec package:

1. `requirements.md`
2. `design.md`
3. `tasks.md`
4. `rollout-and-rollback-notes.md`

