# Seed Checkpoint Snapshot And Join-Readiness Boundary Closure

## Why

Seed startup and join readiness still rely on mixed local state and side-effect
signals in places where one explicit lifecycle snapshot should exist.

The visible problems are:

1. seed startup checkpoint rerun guards still look at local object existence
   and post-phase side effects
2. join readiness still mixes snapshot assembly, repair, waiter behavior, and
   timeout shaping inside one owner boundary

That is exactly the kind of lifecycle grammar drift that broad matrix runs
surface late and expensively.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Matrix readiness core grammar hardening sprint](../sprints/archived/done-2026-q2-matrix-readiness-core-grammar-hardening.md)

## In Scope

1. Introduce one explicit seed startup checkpoint snapshot for touched seed
   rerun/finalization guards.
2. Move touched seed bootstrap workflow rerun decisions onto that snapshot.
3. Tighten the join-readiness boundary so snapshot collection, repair decision,
   and waiting/progress behavior are more explicit on the touched path.
4. Add focused bootstrap/join proof for the new contract.

## Out Of Scope

1. Full startup/join rewrite beyond the touched checkpoint and readiness seams.
2. Rebalancer admission and planner/coordinator work.
3. Harness/report artifact work outside the touched lifecycle boundary.

## Invariants

1. Durable workflow checkpoint progression stays owned by the startup workflow
   session store and runner.
2. Join readiness must not regress toward raw node-row fallback logic.
3. The touched boundary must expose explicit progress meaning for blocked,
   retryable, deferred, and ready states.

## Hotspots

1. `src/bootstrap/bootstrap-service.js`
2. `src/bootstrap/seed-startup-session-store.js`
3. `src/bootstrap/pipeline/startup-pipeline-runner.js`
4. `src/bootstrap/join-readiness-evaluator.js`
5. `test/bootstrap/seed-startup-session-store.test.js`
6. `test/bootstrap/join-readiness-evaluator.test.js`

## Shared Boundary Contract

- Semantic owner:
  seed startup checkpoint and join-readiness owner paths in bootstrap
- Canonical contract shape / vocabulary:
  `SeedStartupCheckpointSnapshot` for touched seed rerun guards and explicit
  join-readiness snapshot/repair/wait decisions on the touched join path
- Allowed consumers:
  bootstrap workflow steps, join orchestration, readiness diagnostics, focused
  bootstrap tests
- Prohibited reinterpretations:
  rerun truth from raw object existence alone, or join-progress meaning rebuilt
  from one mixed waiter/repair boundary
- Primary diagnostics / proof surfaces:
  seed workflow tests, join-readiness evaluator tests, and representative
  restart/join harness scenarios

## Detection / Analysis Tasks

- [x] Inventory every touched seed checkpoint rerun predicate.
- [x] Record the explicit fields required for one checkpoint snapshot.
- [x] Identify the touch points where join readiness still mixes snapshot,
      repair, wait, and timeout roles.

## Implementation Tasks

- [x] Add focused proof for the checkpoint snapshot and touched join-readiness
      contract.
- [x] Route touched seed rerun decisions through one explicit snapshot.
- [x] Split or normalize the touched join-readiness boundary roles.
- [x] Update any touched owner-map wording if the contract becomes durable.

## Residual Closure Inventory

- [x] Seed checkpoint truth on the touched path comes from one snapshot.
- [x] Join-readiness snapshot/repair/wait roles are clearer than at package
      entry.
- [x] Representative restart/join proof is complete.

## Execution Summary

Implemented:

1. `BootstrapService` now builds one explicit `SeedStartupCheckpointSnapshot`
   used by rerun and finalization guards
2. touched seed progression no longer branches on raw object-existence checks
   alone
3. `JoinReadinessEvaluator` now groups snapshot, evaluation, blocked-action,
   and timeout shaping under one explicit attempt contract
4. owner-map documentation now records both contracts as durable shared
   building blocks

Representative scenario confirmation was completed at sprint level through the
fresh `node-join-under-load` rerun.
That probe reached the post-join phase and exposed a later leader-identity
divergence outside this package scope, now split to
[Publication-scoped consistency and node-join closure](./active-20260423-publication-scoped-consistency-and-node-join-closure.md).

## Validation

1. Focused bootstrap workflow tests.
2. Focused join-readiness evaluator tests.
3. Representative harness scenario confirmation completed at sprint level;
   first rerun exposed a new later blocker outside this package scope.
4. `npm run test:metrics`

## Done When

1. Touched seed checkpoint rerun guards stop depending on raw object-existence
   checks alone.
2. The touched join-readiness boundary exposes clearer role separation.
3. Focused proof and representative scenario proof are green.
