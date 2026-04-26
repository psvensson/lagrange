# Rebalancer Admission And Planner-Coordinator Seam Closure

## Why

The rebalancer still carries too much mixed gating and seam logic across
planning, admission, cadence, and execution boundaries.

The current risks are:

1. readiness and topology blockers are blended with cadence decisions
2. planner/coordinator seam meaning is still broader than one explicit
   admission/execution contract
3. matrix-only failures can therefore arrive as mixed gate symptoms instead of
   one named runtime blocker

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Matrix readiness core grammar hardening sprint](../sprints/archived/done-2026-q2-matrix-readiness-core-grammar-hardening.md)

## In Scope

1. Introduce one clearer blocker/admission seam for touched rebalancer checks.
2. Reduce mixed gating/cadence logic on the touched `UnifiedRebalancer` path.
3. Keep planning on the planner side and admission/execution meaning on the
   coordinator side.
4. Add focused rebalancer proof plus representative harness confirmation.

## Out Of Scope

1. Full rebalancer redesign.
2. Startup/join checkpoint refactors outside the touched seam.
3. Harness artifact and presentation work outside the touched rebalancer path.

## Invariants

1. Planner assessment remains owned by `MovePlanner`.
2. Admission/execution meaning remains coordinated through the coordinator
   path.
3. Priority recovery and critical system partitions keep their fast retry
   cadence where required.

## Hotspots

1. `src/rebalancer/unified-rebalancer-segment-5.js`
2. `src/rebalancer/rebalance-coordinator.js`
3. `test/rebalancer/unified-rebalancer*.test*.js`
4. `test/rebalancer/planner-single-path-enforcement.test.js`

## Shared Boundary Contract

- Semantic owner:
  touched rebalancer blocker/admission seam between `UnifiedRebalancer` and
  coordinator-owned admission/execution logic
- Canonical contract shape / vocabulary:
  one explicit blocker/admission decision on the touched path, with planning,
  cadence, and execution roles kept distinct
- Allowed consumers:
  rebalancer periodic checks, coordinator ingress, diagnostics, focused tests
- Prohibited reinterpretations:
  mixed lane-local admission logic in planning surfaces, or cadence code
  becoming a second admission grammar
- Primary diagnostics / proof surfaces:
  focused rebalancer tests and representative matrix scenarios

## Detection / Analysis Tasks

- [x] Inventory touched blocker categories in `getCheckRebalanceBlocker()`.
- [x] Record which blocker fields belong to planning, admission, cadence, and
      diagnostics respectively.
- [x] Detect planner/coordinator overlap on the touched path.

## Implementation Tasks

- [x] Add focused proof for the touched seam contract.
- [x] Normalize touched blocker/admission handling into one explicit decision
      shape.
- [x] Remove or downgrade mixed seam logic on the touched path.
- [x] Update any touched owner map wording if the contract becomes durable.

## Residual Closure Inventory

- [x] The touched seam exposes one clearer blocker/admission contract.
- [x] Planner/coordinator overlap is reduced on the touched path.
- [x] Representative harness proof is complete.

## Execution Summary

Implemented:

1. the touched `UnifiedRebalancer` path now emits one explicit
   `RebalancePlanningGateDecision`
2. cluster readiness, start delay, stabilization, topology settling, traffic,
   local readiness, priority spread, and transport pressure now flow through
   one named gate contract instead of anonymous blocker closures
3. same-node dispatch readiness also gained one bounded local-handler
   capability contract to avoid self-deadlocking dispatch retries while local
   services rows lag
4. owner-map documentation now records the planning-gate and local-dispatch
   capability contracts

Representative scenario confirmation was completed at sprint level through the
fresh `node-join-under-load` rerun.
That rerun exposed a later leader-identity divergence after the touched gate
logic, now split to
[Publication-scoped consistency and node-join closure](./done-20260423-publication-scoped-consistency-and-node-join-closure.md).

## Validation

1. Focused rebalancer tests.
2. Representative harness scenario confirmation completed at sprint level;
   first rerun exposed a new later blocker outside this package scope.
3. `npm run test:metrics`

## Done When

1. The touched rebalancer seam is clearer than at package entry.
2. Planner/admission/execution meaning is less mixed on the touched path.
3. Focused proof and representative scenario proof are green.
