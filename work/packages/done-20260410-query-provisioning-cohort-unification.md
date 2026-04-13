# Query Provisioning Cohort Unification

## Why

Query-driven provisioning and managed split admission still widen their node
cohort under low-node or partial-readiness conditions by mixing strict
readiness with weaker service/discovery evidence.

That may be necessary in some cases, but it should be adjudicated once by one
topology-admission evidence contract rather than separately in several
planners.

## Scope Basis

Phase 0.1 roadmap scope: topology workflow stabilization, readiness
stratification, and slower-under-pressure correctness.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-QR-001`
2. `FB-PT-001`

## In Scope

1. Define one topology-admission evidence contract for degraded cohort
   selection.
2. Route query provisioning through that contract.
3. Route managed split target admission through that contract.

## Out Of Scope

1. Critical-partition classifier replacement.
2. Bootstrap leader-identity and topology snapshot bridges.
3. Transport reconnect authority cleanup.

## Invariants

1. Degraded cohort widening is adjudicated once.
2. Strict readiness and weaker service/discovery evidence are ranked
   explicitly.
3. Query provisioning and managed split do not keep divergent fallback logic.

## Hotspots

1. `src/query/sql-query-engine.js`
2. `src/rebalancer/unified-rebalancer.js`
3. `src/partition/managed-split-workflow.js`

## Detection / Analysis Tasks

- [x] Inventory the current cohort-widening rules in query provisioning and
      managed split admission.
- [x] Define the evidence model and ranking for degraded cohort selection.
- [x] Identify which callers can consume one shared snapshot/contract.

## Implementation Tasks

- [x] Introduce the shared topology-admission evidence contract.
- [x] Route query provisioning through it.
- [x] Route managed split admission through it.
- [x] Add tests for strict, degraded, and low-node cohort decisions.

## Validation

1. Sql query engine and managed split unit tests.
2. Rebalancer/query integration tests for provisioning under constrained
   cohorts.
3. Distributed scenarios: `seed-restart-under-load`, `node-join-under-load`.

## Done When

1. Query provisioning and managed split use one cohort decision contract.
2. Degraded cohort widening is explicit and single-owned.
3. The old planner-local fallback logic is removed.
