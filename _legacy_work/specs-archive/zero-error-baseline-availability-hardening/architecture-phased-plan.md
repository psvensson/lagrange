# Architecture Phased Plan: Startup, Join, and Readiness Stabilization

Date: 2026-02-23

## Purpose

Define a concrete architecture path to make 3-node and 7-node baseline runs
stable and repeatable under startup, join, and moderate churn.

This plan complements:

1. `requirements.md`
2. `design.md`
3. `tasks.md`

## Problem Summary

Current instability is dominated by control-plane coupling during startup:

1. readiness and ACTIVE probes use expensive distributed query paths,
2. joining nodes and rebalance activity overlap heavily,
3. control-plane write failures feed back into readiness and membership,
4. probe timeout budgeting is inconsistent and can amplify load on unhealthy
   paths.

## Architectural Goals

1. Make startup decisions from cheap, local, deterministic signals first.
2. Move from optimistic startup to staged startup with explicit barriers.
3. Ensure one owner per concern:
   1. membership progression,
   2. readiness projection,
   3. workload admission.
4. Keep one canonical read model for discovery/readiness, with no fallback path.

## Core Invariants

### Invariant A: Membership Safety

1. New replicas join as `learner` only.
2. Promotion to voting replica requires explicit promotable checks.
3. At most one promotion/demotion per partition group in flight.

### Invariant B: Startup Gating

1. Benchmark preflight cannot begin until all nodes pass startup gate.
2. Startup gate must require:
   1. `bootstrap join-ready` per node,
   2. control snapshot coverage barrier,
   3. bounded topology churn window.

### Invariant C: Readiness Semantics

1. `liveness` cannot depend on distributed SQL.
2. `join-ready` cannot depend on full distributed-query fanout.
3. `workload-ready` must depend on:
   1. routing readiness,
   2. schema readiness for workload table,
   3. topology readiness (`replica_operations` drained and leadership stable).

### Invariant D: Probe Budgeting

1. Probe timeout budget is single-source and propagated end-to-end.
2. No outer timeout may be shorter than the inner operation timeout.
3. Timed-out probes must cancel or close the underlying request path.

### Invariant E: Control-Plane Write Isolation

1. Heartbeat/lease/lifecycle writes must not hard-fail readiness projection.
2. Repeated control-plane write failure may degrade workload readiness, but
   must not flip process liveness.

## Canonical State Machines

## 1. Node Lifecycle State Machine

States:

1. `PROCESS_UP`
2. `BOOTSTRAP_CONTACTING`
3. `BOOTSTRAP_JOIN_READY`
4. `MEMBER_LEARNER`
5. `MEMBER_PROMOTABLE`
6. `MEMBER_VOTER`
7. `TRAFFIC_READY`
8. `WORKLOAD_READY`
9. `DRAINING`
10. `STOPPED`

Allowed transitions:

1. `PROCESS_UP -> BOOTSTRAP_CONTACTING`
2. `BOOTSTRAP_CONTACTING -> BOOTSTRAP_JOIN_READY`
3. `BOOTSTRAP_JOIN_READY -> MEMBER_LEARNER`
4. `MEMBER_LEARNER -> MEMBER_PROMOTABLE`
5. `MEMBER_PROMOTABLE -> MEMBER_VOTER`
6. `MEMBER_VOTER -> TRAFFIC_READY`
7. `TRAFFIC_READY -> WORKLOAD_READY`
8. `WORKLOAD_READY -> DRAINING`
9. `DRAINING -> STOPPED`

Non-forward transition policy:

1. Degrade from `WORKLOAD_READY` to `TRAFFIC_READY` on schema/topology failure.
2. Degrade from `TRAFFIC_READY` to `BOOTSTRAP_JOIN_READY` only on severe local
   dependency failure.
3. Do not jump directly from `MEMBER_LEARNER` to `WORKLOAD_READY`.

## 2. Replica Membership State Machine

States:

1. `ABSENT`
2. `ADDING_LEARNER`
3. `LEARNER_CATCHING_UP`
4. `PROMOTABLE`
5. `PROMOTING`
6. `VOTER_ACTIVE`
7. `DEMOTING`
8. `REMOVED`

Rules:

1. Promotion requires:
   1. catch-up threshold met,
   2. leader discovered and stable window met,
   3. no competing membership change in same group.
2. Rebalance coordinator enforces serialization by partition group.

## 3. Readiness Projection State Machine

External readiness classes:

1. `live`
2. `startup-ready`
3. `traffic-ready`
4. `workload-ready`

Projection source order:

1. local lifecycle controller snapshot,
2. local control snapshot cache,
3. local discovery snapshot cache.

Disallowed:

1. direct distributed query fanout in readiness endpoint path.

## Missing Capabilities to Implement

1. Learner-first replica lifecycle with explicit promotable barrier.
2. Serialized membership change scheduler per partition group.
3. Startup freeze window for non-critical background writers/services.
4. End-to-end cancellation-aware probe execution in harness and admin query path.
5. Readiness degradation policy that distinguishes:
   1. liveness impact,
   2. routing impact,
   3. workload impact.
6. Single canonical startup decision object in reports (reason histogram + phase).

## Phased Rollout Plan

## Phase 0: Instrument and Lock Semantics

Scope:

1. Add canonical startup/readiness decision record shape.
2. Add metrics for:
   1. probe overlap,
   2. timed-out requests still in flight,
   3. membership operations in flight by partition group.

Entry criteria:

1. Existing tests pass.

Exit criteria:

1. Every startup failure report includes deterministic reason classes.

Rollback:

1. Safe, additive only.

## Phase 1: Probe and Readiness Decoupling

Scope:

1. Make startup ACTIVE polling use lightweight bootstrap readiness first.
2. Bound snapshot probing and short-circuit on first complete coverage.
3. Enforce timeout budget propagation and cancellation behavior.

Entry criteria:

1. Phase 0 observability in place.

Exit criteria:

1. 7-node startup no longer fails due to probe-induced timeout cascades in smoke.

Rollback:

1. Re-enable prior probing path via feature flag for emergency only.

## Phase 2: Membership Serialization and Learner Promotion

Scope:

1. Introduce learner-first join lifecycle for replicated partition services.
2. Serialize promotion/demotion per partition group.
3. Add promotion safety checks and explicit retry with bounded backoff.

Entry criteria:

1. Probe/readiness path stabilized.

Exit criteria:

1. `leader_not_discovered` startup churn drops below agreed threshold.
2. Startup converges on 7-node under repeated runs.

Rollback:

1. Keep learner mode enabled, disable strict serialization if needed.

## Phase 3: Control-Plane Write Isolation

Scope:

1. Isolate heartbeat/lease non-critical write failures from liveness decisions.
2. Move background control writes behind startup freeze until cluster-active.
3. Convert repeated control-plane write faults into degraded workload readiness
   reasons, not process-down semantics.

Entry criteria:

1. Membership serialization in place.

Exit criteria:

1. Control-plane write failures do not collapse node readiness classes globally.

Rollback:

1. Disable freeze and restore prior eager background start ordering.

## Phase 4: Workload Admission Hardening

Scope:

1. Admission controller uses `workload-ready` plus channel health.
2. Scheduler prefers paced dispatch over guaranteed-failure dispatch.
3. Add hard SLO gates:
   1. 3-node: `errors=0`, `failed=0`
   2. 7-node: startup/preflight pass and load operation errors zero.

Entry criteria:

1. Stable startup and membership behavior.

Exit criteria:

1. Baseline harness acceptance passes on both profiles consistently.

Rollback:

1. Reduce admission strictness while keeping startup/membership architecture.

## Acceptance Criteria by Phase

1. Phase 1:
   1. new integration tests for timeout-budget propagation and probe cancellation.
   2. startup gate diagnostics include probe class distribution.
2. Phase 2:
   1. integration tests for learner promotion safety.
   2. no concurrent promotion per partition group in tests.
3. Phase 3:
   1. tests showing liveness stays true under isolated control write failures.
   2. readiness degrades with explicit reason code.
4. Phase 4:
   1. distributed acceptance runs meet SLOs.

## Mapping to Existing Task Plan

1. Phase 1 maps primarily to tasks `13`, `14`, and part of `19`.
2. Phase 2 requires extending tasks `15`, `16` with learner/promotion work.
3. Phase 3 extends tasks `14`, `16`, and `22` (remove fallback behavior).
4. Phase 4 maps to tasks `17`, `18`, `21`, `24`, `25`, `26`.

## Decision Log (Initial)

1. Preserve additive schema approach for discovery/readiness.
2. Prefer explicit lifecycle phases over implicit readiness booleans.
3. Optimize for deterministic failure classification before optimization tuning.
