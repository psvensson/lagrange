# Rebalancer Plan, Admission, And Execution Seam Closure

## Why

The conceptual split is already clear:

1. `UnifiedRebalancer` should decide cadence and planning
2. `RebalanceCoordinator` should decide admission and execution

The middle layer still leaks across that seam. `UnifiedRebalancer.rebalance()`
still performs budget math, priority bypass, membership-publication epoch
binding, and move limiting before delegating back to the coordinator.

That keeps one semantic decision split across both sides of the boundary.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Startup And Rebalancer Middle-Layer Closure Sprint](../sprints/todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)

## In Scope

1. Define one `RebalancePlan` contract emitted by `UnifiedRebalancer`.
2. Define one `RebalancePlanExecutionDecision` contract emitted by
   `RebalanceCoordinator`.
3. Move budget binding, priority-bypass evaluation, publication-epoch binding,
   and execution admission behind the coordinator ingress.
4. Keep `UnifiedRebalancer` responsible for state assessment, cadence, and
   plan submission only.
5. Align seam diagnostics so one contract answers why a plan executed,
   deferred, blocked, or skipped.

## Out Of Scope

1. Move-planner heuristic or placement-policy redesign
2. Rebalancer admission lane unification beyond consuming the shared contract
   from the predecessor package
3. Startup/join middle-layer changes

## Invariants

1. `UnifiedRebalancer` must not rebuild coordinator admission semantics after
   the seam contract exists.
2. Publication-epoch binding must happen once per plan through one owner
   ingress.
3. Execution-blocked and execution-deferred outcomes must use one seam
   vocabulary.

## Hotspots

1. `src/rebalancer/unified-rebalancer-segment-4.js`
2. `src/rebalancer/unified-rebalancer-segment-5.js`
3. `src/rebalancer/unified-rebalancer.js`
4. `src/rebalancer/rebalance-coordinator-segment-3.js`
5. `src/rebalancer/rebalance-coordinator-segment-5.js`
6. `src/rebalancer/rebalance-coordinator.js`

## Shared Boundary Contract

- Semantic owner: planner/coordinator seam between `UnifiedRebalancer` and
  `RebalanceCoordinator`
- Canonical contract shape / vocabulary:
  `RebalancePlan` plus
  `RebalancePlanExecutionDecision { state, moveLimit, publicationEpoch, retryAfterMs, reasonCodes }`
- Allowed consumers: `UnifiedRebalancer`, `RebalanceCoordinator`, seam
  diagnostics, and focused rebalancer tests
- Prohibited reinterpretations: local budget math, local priority bypass, or
  local publication-epoch binding in `UnifiedRebalancer` once the seam owner
  contract exists
- Primary diagnostics / proof surfaces: unified-rebalancer tests,
  coordinator-operation ownership tests, seam diagnostics, and named scenario
  lanes

## Detection / Analysis Tasks

- [ ] Build the semantic-question matrix for the current planner/coordinator
      seam.
- [ ] Identify every admission or execution decision still made in
      `UnifiedRebalancer.rebalance(...)`.
- [ ] Identify which diagnostics currently describe plan execution from the
      wrong side of the seam.

## Implementation Tasks

- [ ] Add guardrail tests first for a plan-submission seam and coordinator
      execution decision contract.
- [ ] Introduce `RebalancePlan`.
- [ ] Introduce `RebalancePlanExecutionDecision`.
- [ ] Move budget, priority bypass, move limiting, and publication-epoch
      binding behind the coordinator ingress.
- [ ] Rework `UnifiedRebalancer.rebalance(...)` to submit a canonical plan and
      consume one coordinator answer instead of rebuilding admission locally.
- [ ] Remove superseded local seam logic from `UnifiedRebalancer`.

## Residual Closure Inventory

- [ ] Owner-path cutovers are complete for plan submission and execution
      admission.
- [ ] Tail diagnostics now consume the seam contract.
- [ ] Superseded local planner-side admission logic is deleted.
- [ ] Required proof layers are complete.

## Validation

1. `npx tap test/rebalancer/unified-rebalancer.test.js test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
2. `npx tap test/rebalancer/rebalance-coordinator-diagnostics.test.js test/rebalancer/rebalance-budget-enforcement.property.test.js`
3. `npx tap test/rebalancer/coordinator-created-operation-progress.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
4. Named scenario evidence for `node-join-under-load` and
   `seven-node-postgres-baseline-partition-split`
5. `npm run test:metrics`

## Done When

1. `UnifiedRebalancer` emits plans and cadence decisions only.
2. `RebalanceCoordinator` owns plan admission and execution decisions.
3. Publication-epoch binding and move limiting happen once through the seam
   owner.
4. `UnifiedRebalancer` no longer performs planner-local budget or admission
   math after the seam cutover.
5. Focused proof is green and any remaining non-seam concern is split
   explicitly before closure.
