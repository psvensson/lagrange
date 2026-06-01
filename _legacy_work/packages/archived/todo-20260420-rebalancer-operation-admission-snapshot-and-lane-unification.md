# Rebalancer Operation Admission Snapshot And Lane Unification

## Why

`RebalanceCoordinator` still evaluates add, priority-add, and remove admission
through parallel helpers that repeat the same middle-layer logic:

1. local pressure pause
2. cache read
3. empty-query delay
4. authoritative recheck on saturation
5. deferred observation handling
6. lane-specific count comparison

That is one semantic decision spread across three branch families.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Startup And Rebalancer Middle-Layer Closure Sprint](../sprints/todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)

## In Scope

1. Introduce one `OperationAdmissionSnapshot` for all rebalancer lanes.
2. Introduce one `OperationAdmissionDecision` vocabulary for
   `allowed`, `deferred`, and `blocked` outcomes.
3. Collapse `canStartAddOperation(...)`,
   `canStartPriorityAddOperation(...)`, and `canStartRemoveOperation(...)`
   onto the shared admission snapshot plus small lane-specific policy.
4. Normalize deferred visibility, owner-RPC recheck, empty-query delay, and
   pressure pause diagnostics around the shared contract.

## Out Of Scope

1. Move-planner target-state or placement-policy redesign
2. Full planner/coordinator seam closure beyond exposing the common admission
   contract
3. Replica workflow owner changes unrelated to admission

## Invariants

1. All rebalancer lanes must consume the same snapshot semantics for
   visibility, deferral, and retry.
2. Deferred observation must not be interpreted differently per lane.
3. Priority-lane exceptions must remain explicit and bounded rather than
   hidden inside cloned lane logic.

## Hotspots

1. `src/rebalancer/rebalance-coordinator-segment-5.js`
2. `src/rebalancer/rebalance-coordinator-segment-3.js`
3. `src/rebalancer/rebalance-coordinator.js`
4. `src/rebalancer/replica-operation-repository.js`
5. `src/rebalancer/replica-operation-repository-read-methods.js`

## Shared Boundary Contract

- Semantic owner: `RebalanceCoordinator` admission boundary
- Canonical contract shape / vocabulary:
  `OperationAdmissionSnapshot { visibilityState, pressureState, cachedCounts, authoritativeCounts, retryAfterMs, laneClass, reasonCodes }`
  plus
  `OperationAdmissionDecision { state, allowed, retryAfterMs, reasonCodes }`
- Allowed consumers: lane-specific coordinator admission helpers,
  coordinator diagnostics, and later plan/coordinator seam work
- Prohibited reinterpretations: per-lane local empty-query backoff logic,
  per-lane authoritative recheck branches, or caller-local deferred visibility
  grammar outside the shared admission owner
- Primary diagnostics / proof surfaces: coordinator admission tests,
  visibility/deferred observation tests, and named rebalancer scenario lanes

## Detection / Analysis Tasks

- [ ] Build the concern inventory for add, priority-add, and remove admission.
- [ ] Build the semantic-question matrix for cache count, authoritative count,
      deferred observation, pressure pause, and lane policy.
- [ ] Detect duplicate ownership between lane helpers and repository
      observation logic.
- [ ] Detect implicit admission state machines in the current lane-local
      branches.
- [ ] Detect branch lattices that differ only by lane-specific count policy.

## Implementation Tasks

- [ ] Add guardrail tests first for a shared admission snapshot and decision
      contract.
- [ ] Introduce `OperationAdmissionSnapshot`.
- [ ] Introduce `OperationAdmissionDecision`.
- [ ] Collapse add, priority-add, and remove helpers to lane-specific policy
      over the shared snapshot.
- [ ] Express the lane differences through small lane descriptors or a policy
      table rather than cloned lane branches.
- [ ] Tighten coordinator diagnostics so they emit the new admission
      vocabulary directly.

## Residual Closure Inventory

- [ ] Owner-path cutovers are complete for all three coordinator admission
      lanes.
- [ ] Tail coordinator diagnostics consume the shared admission vocabulary.
- [ ] Superseded lane-local admission branches are deleted.
- [ ] Required proof layers are complete.

## Validation

1. `npx tap test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js test/rebalancer/replica-operation-observation-contract.test.js`
2. `npx tap test/rebalancer/rebalance-coordinator-owner-path-convergence.test.js test/rebalancer/coordinator-shared-readiness-policy.test.js test/rebalancer/rebalance-budget-enforcement.property.test.js`
3. `npx tap test/rebalancer/rebalance-coordinator-diagnostics.test.js test/rebalancer/provisioning-admission-policy.test.js`
4. Named scenario evidence for `node-join-under-load`,
   `seven-node-load-during-partitioning`, and
   `seven-node-postgres-baseline-partition-split`
5. `npm run test:metrics`

## Done When

1. Add, priority-add, and remove admission consume one shared snapshot and one
   shared decision grammar.
2. Lane-specific code is reduced to small policy differences over the shared
   snapshot.
3. Deferred visibility, empty-query delay, authoritative recheck, and pressure
   pause use one admission vocabulary.
4. Coordinator diagnostics report the new admission vocabulary directly.
5. Focused proof is green and any residual non-admission concern is split
   explicitly before closure.
