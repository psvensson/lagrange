# Middle-Layer Legacy Surface Deletion And Proof Hardening

## Why

The sprint does not count as complete when new middle-layer owners exist beside
old ones. The startup and rebalancer boundaries have repeatedly regressed when
compatibility predicates, delegate bags, local grammars, or stale docs remain
alive after the new contract lands.

This package is the mandatory closure pass for the middle layer.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Startup And Rebalancer Middle-Layer Closure Sprint](../sprints/todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)

## In Scope

1. Delete superseded startup checkpoint predicates and checkpoint-local
   compatibility wrappers.
2. Delete superseded join-readiness evaluator-local mutable state, fallback
   precedence, and timeout-shaping compatibility surfaces.
3. Delete superseded rebalancer lane-local admission clones and planner-side
   admission logic once the new seam contracts exist.
4. Update `architecture/current-owner-maps.md` for the surviving middle-layer
   boundaries.
5. Update touched static guardrails and focused proof bundles in the same
   closure cycle.

## Out Of Scope

1. New product or operator-facing functionality
2. Broad duplication cleanup unrelated to the sprint-owned middle layer
3. Broad transport or query redesign outside the touched boundaries

## Invariants

1. The sprint does not close with old and new middle-layer meanings live in
   parallel.
2. Architecture and guardrail records must match the surviving runtime
   boundary.
3. Closure proof must include the named scenario lanes, not only focused unit
   proof.

## Hotspots

1. `architecture/current-owner-maps.md`
2. `src/bootstrap/bootstrap-service.js`
3. `src/bootstrap/node-joining-service-segment-1.js`
4. `src/bootstrap/node-joining-service-segment-2.js`
5. `src/bootstrap/join-readiness-evaluator.js`
6. `src/bootstrap/join-readiness-evaluator-tail-methods.js`
7. `src/rebalancer/rebalance-coordinator-segment-3.js`
8. `src/rebalancer/rebalance-coordinator-segment-5.js`
9. `src/rebalancer/unified-rebalancer-segment-4.js`
10. `src/rebalancer/unified-rebalancer-segment-5.js`
11. `test/config/architecture-ownership-guardrails.test.js`
12. `test/scripts/check-guideline-decision-boundaries.test.js`

## Shared Boundary Contract

- Semantic owner: closure package over the sprint-owned startup checkpoint,
  join-readiness, admission, and seam contracts
- Canonical contract shape / vocabulary: the package inherits the new
  `StartupCheckpointSnapshot`, `JoinReadinessSnapshot`,
  `JoinReadinessRepairDecision`, `JoinReadinessWaitResult`,
  `OperationAdmissionSnapshot`, `OperationAdmissionDecision`,
  `RebalancePlan`, and `RebalancePlanExecutionDecision` as the only legal
  middle-layer vocabulary
- Allowed consumers: touched startup, readiness, rebalancer, diagnostics, and
  guardrail surfaces
- Prohibited reinterpretations: keeping compatibility booleans, delegate bags,
  or planner-local admission logic alive beside the new contract surfaces
- Primary diagnostics / proof surfaces: owner maps, guardrail tests, focused
  startup and rebalancer suites, and named scenario lanes

## Detection / Analysis Tasks

- [ ] Build the residual closure inventory from packages `1` through `4`.
- [ ] Detect every remaining compatibility predicate, fallback ladder, or
      duplicated middle-layer grammar on the touched boundaries.
- [ ] Detect stale owner-map or static-guardrail text that still names the
      superseded paths.

## Implementation Tasks

- [ ] Delete the superseded startup checkpoint compatibility surfaces.
- [ ] Delete the superseded join-readiness compatibility surfaces.
- [ ] Delete the superseded rebalancer admission and seam compatibility
      surfaces.
- [ ] Update `architecture/current-owner-maps.md`.
- [ ] Update touched guardrail tests and focused proof bundles.

## Residual Closure Inventory

- [ ] Owner-path cutovers from packages `1` through `4` are complete.
- [ ] Tail consumers and diagnostics use only the surviving middle-layer
      contracts.
- [ ] Architecture records and static guardrails match the surviving owner
      boundaries.
- [ ] Superseded paths, booleans, wrappers, and vocabulary are deleted.
- [ ] Required proof layers are complete.

## Validation

1. `npx tap test/bootstrap/pipeline/startup-pipeline-runner.test.js test/bootstrap/join-readiness-evaluator.test.js test/bootstrap/startup-authority-consumption.test.js`
2. `npx tap test/rebalancer/unified-rebalancer.test.js test/rebalancer/rebalance-coordinator-operation-ownership.test.js test/rebalancer/rebalance-coordinator-diagnostics.test.js`
3. `npx tap test/config/architecture-ownership-guardrails.test.js test/scripts/check-guideline-decision-boundaries.test.js`
4. Named scenario evidence for `node-join-under-load`, `rolling-restart`,
   `seed-restart-under-load`, `seven-node-load-during-partitioning`, and
   `seven-node-postgres-baseline-partition-split`
5. `npm run test:metrics`

## Done When

1. No legacy middle-layer compatibility surface remains live beside the new
   startup or rebalancer contracts.
2. `architecture/current-owner-maps.md` names the surviving owner boundaries.
3. Guardrail tests and focused proof are updated and green.
4. The named scenario lanes are rerun for closure.
5. The sprint-owned middle-layer vocabulary is the only live vocabulary on the
   touched boundaries.
