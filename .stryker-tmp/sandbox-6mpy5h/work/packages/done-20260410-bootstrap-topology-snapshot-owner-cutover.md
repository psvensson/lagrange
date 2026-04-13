# Bootstrap Topology Snapshot Owner Cutover

## Why

Bootstrap join/readiness logic still keeps secondary bridges for active-node
and leader-identity answers while owner rows or cache convergence catch up.

Those bridges may be temporarily necessary, but they should still collapse onto
one explicit bootstrap topology owner surface rather than remain scattered
across evaluators and routing helpers.

## Scope Basis

Phase 0.1 roadmap scope: bootstrap handoff completion and topology/readiness
correctness.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-BS-004`
2. `FB-CP-008`

## In Scope

1. Provide one bootstrap topology owner surface for ACTIVE node answers.
2. Provide one owner-ranked leader-identity surface during bootstrap
   convergence.
3. Remove evaluator-local and service-row bridge selection where it is no
   longer necessary.

## Out Of Scope

1. Peer-mesh/bootstrap-hint routing reduction.
2. Control-plane mutation ingress removal.
3. Query provisioning degraded cohort policy.

## Invariants

1. Bootstrap consumers ask one topology owner for active-node and leader
   answers.
2. Service-row leader bridges remain bounded and transitional.
3. Owner-row convergence outranks service-row inference.

## Hotspots

1. `src/bootstrap/join-readiness-evaluator.js`
2. `src/bootstrap/owners/bootstrap-topology-snapshot-owner.js`
3. `src/cache/leader-readiness-gate.js`
4. `src/query/query-router.js`
5. `src/query/query-executor.js`

## Detection / Analysis Tasks

- [x] Inventory bootstrap consumers of active-node and leader-identity answers.
- [x] Define the bootstrap topology owner surface those consumers should use.
- [x] Identify which service-row leader bridges can be removed immediately.

## Implementation Tasks

- [x] Route join readiness through the bootstrap topology owner.
- [x] Route bootstrap leader-identity consumers through one owner-ranked
      surface.
- [x] Add tests for owner-row missing, bootstrap fresh-window, and convergence
      completion cases.

## Validation

1. Join readiness and bootstrap topology snapshot unit tests.
2. Query router/executor tests for bootstrap leader identity.
3. Distributed startup and join scenarios.

## Done When

1. Bootstrap active-node and leader answers come from one owner surface.
2. Evaluator-local topology bridges are removed.
3. Remaining owner-row convergence bridges are explicit, bounded, and tested.
