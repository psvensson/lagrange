# Join Readiness Snapshot, Repair, And Waiter Owner Split

## Why

`JoinReadinessEvaluator` still carries several concerns at once:

1. snapshot assembly
2. repair triggering and throttling
3. wait-loop progression
4. timeout and diagnostic packaging
5. active-node/cohort fallback shaping

That keeps the boundary harder to reason about than the surrounding owner
model and makes it easy for side effects and weaker evidence to bleed into the
same semantic decision.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Startup And Rebalancer Middle-Layer Closure Sprint](../sprints/todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)

## In Scope

1. Split the current join-readiness middle layer into:
   `JoinReadinessSnapshotOwner`, `JoinReadinessRepairOwner`, and
   `JoinReadinessWaiter`.
2. Make the snapshot owner side-effect free.
3. Make repair scheduling consume one explicit repair decision contract.
4. Make the waiter consume snapshot and repair owners instead of rebuilding the
   boundary locally.
5. Remove active-node/cohort precedence that prefers partial cache-derived
   truth over the canonical startup-authority or readiness-owned cohort.
6. Normalize timeout and error packaging around one waiter result contract.

## Out Of Scope

1. Broad startup checkpoint/orchestrator redesign outside the touched
   integration seam
2. Broad transport redesign outside join-readiness inputs
3. Rebalancer admission or plan/coordinator seam work

## Invariants

1. Join-readiness snapshot assembly must be side-effect free.
2. Repair triggering must be explicit and owner-controlled rather than mixed
   into the waiter.
3. Active-node truth for join-readiness exclusion and warming-node handling
   must come from one declared authority surface.

## Hotspots

1. `src/bootstrap/join-readiness-evaluator.js`
2. `src/bootstrap/join-readiness-evaluator-tail-methods.js`
3. `src/control-plane/control-plane-readiness-service.js`
4. `src/control-plane/startup-authority-snapshot-owner.js`
5. `src/bootstrap/node-joining-service-segment-1.js`
6. `src/bootstrap/node-joining-service-segment-2.js`

## Shared Boundary Contract

- Semantic owner: join-readiness boundary
- Canonical contract shape / vocabulary:
  `JoinReadinessSnapshot`, `JoinReadinessRepairDecision`, and
  `JoinReadinessWaitResult`
- Allowed consumers: join checkpoint execution, timeout/error packaging,
  startup diagnostics, and focused join-readiness tests
- Prohibited reinterpretations: one class owning snapshot assembly, repair
  scheduling, wait progression, and timeout packaging together; preferring a
  merely non-empty cache-derived active-node set over the canonical startup or
  recovery cohort
- Primary diagnostics / proof surfaces: focused join-readiness tests,
  startup-authority consumption tests, readiness-service tests, and named join
  scenario lanes

## Detection / Analysis Tasks

- [ ] Inventory the mutable state in `JoinReadinessEvaluator` by concern:
      snapshot, repair, waiter, and timeout packaging.
- [ ] Trace where active-node authority still falls back from startup
      authority to weaker cache-local truth.
- [ ] Identify which tests currently prove multiple concerns through one class
      and need to be rebased to the new owner split.

## Implementation Tasks

- [ ] Add guardrail tests for side-effect-free snapshot assembly and explicit
      repair decisions.
- [ ] Extract `JoinReadinessSnapshotOwner`.
- [ ] Extract `JoinReadinessRepairOwner`.
- [ ] Extract `JoinReadinessWaiter` and cut `NodeJoiningService` over to it.
- [ ] Route active-node/cohort truth through one startup-authority or
      readiness-owned authority surface.
- [ ] Delete compatibility mutable state and weaker active-node precedence from
      the old evaluator surface.

## Residual Closure Inventory

- [ ] Owner-path cutovers are complete for snapshot, repair, and waiter logic.
- [ ] Tail diagnostics and timeout packaging consume the new contracts.
- [ ] Active-node/cohort truth is shared with the canonical startup-authority
      boundary.
- [ ] Superseded evaluator-local mutable state and compatibility paths are
      deleted.
- [ ] Required proof layers are complete.

## Validation

1. `npx tap test/bootstrap/join-readiness-evaluator.test.js test/bootstrap/join-readiness-startup-authority.test.js test/bootstrap/startup-convergence-gate.test.js`
2. `npx tap test/bootstrap/join-readiness-warming-node-exclusion.property.test.js test/bootstrap/join-readiness-warming-node-preservation.property.test.js test/bootstrap/node-joining-ready-signal-retry.test.js`
3. `npx tap test/control-plane/startup-authority-snapshot.test.js test/control-plane/control-plane-readiness-service.test.js`
4. Named scenario evidence for `node-join-under-load` and `rolling-restart`
5. `npm run test:metrics`

## Done When

1. Join-readiness snapshot, repair, and waiting are separate owners.
2. The snapshot owner is side-effect free.
3. Join-readiness active-node/cohort truth comes from one declared authority
   surface.
4. Focused proof is green and any residual concern is split explicitly before
   closure.
