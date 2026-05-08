# Startup Checkpoint Contract And Orchestrator Cutover

## Why

The startup workflow durability umbrella closed the durable outer story, but
the seed and join middle layer still decides checkpoint progression through
local predicates such as `messageRouter` existence, `heartbeatService`
existence, or side effects hidden inside `buildSeedCheckpointSteps(...)` and
`buildJoinCheckpointSteps(...)`.

That leaves the workflow durable on paper while the middle layer still answers
"is this checkpoint complete?" from compatibility predicates and orchestrator
state bags.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Startup And Rebalancer Middle-Layer Closure Sprint](../sprints/todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)

## In Scope

1. Define one `StartupCheckpointSnapshot` contract for the seed and join
   middle layer.
2. Replace `hasSeedControlPlaneReady()`, `hasSeedRuntimeReady()`, and
   `hasJoinInfrastructureReady()` with owner-owned checkpoint answers.
3. Move post-phase work currently hidden inside startup step closures into
   named checkpoint helpers or owners.
4. Reduce seed and join delegate composition so checkpoint execution no longer
   depends on broad compatibility delegate bags.

## Out Of Scope

1. Join-readiness semantic redesign beyond the checkpoint seam
2. Rebalancer admission and plan/coordinator seam work
3. Broad file-size decomposition outside the touched startup files

## Invariants

1. Resume and rerun decisions must come from one checkpoint contract rather
   than local object existence checks.
2. Seed and join must not use different semantic meanings for checkpoint
   readiness when the checkpoint concern is shared.
3. Checkpoint completion must not depend on hidden side effects outside the
   checkpoint owner boundary.

## Hotspots

1. `src/bootstrap/bootstrap-service.js`
2. `src/bootstrap/node-joining-service-segment-1.js`
3. `src/bootstrap/node-joining-service-segment-2.js`
4. `src/bootstrap/pipeline/startup-pipeline-runner.js`
5. `src/bootstrap/pipeline/seed-startup-plan.js`
6. `src/bootstrap/pipeline/join-startup-plan.js`

## Shared Boundary Contract

- Semantic owner: startup checkpoint owner layer on top of
  `StartupPipelineRunner`
- Canonical contract shape / vocabulary:
  `StartupCheckpointSnapshot { checkpoint, state, ready, reasonCodes, retryAfterMs, evidence, missingOwners }`
- Allowed consumers: `StartupPipelineRunner`, seed/join checkpoint builders,
  startup finalization, and startup diagnostics
- Prohibited reinterpretations: answering checkpoint completion from raw local
  fields such as router, handler, or heartbeat object existence; hiding
  checkpoint-owned work in anonymous step closures
- Primary diagnostics / proof surfaces: checkpoint progression tests, startup
  sequencing tests, delegate-bundle tests, and named startup scenario lanes

## Detection / Analysis Tasks

- [ ] Inventory every checkpoint predicate still answered by local object
      existence.
- [ ] Inventory post-phase work that is executed in startup step closures but
      not represented as checkpoint-owned work.
- [ ] Trace which seed/join delegate-bundle entries still exist only to support
      compatibility checkpoint logic.

## Implementation Tasks

- [ ] Add guardrail tests that prove checkpoint progression consumes explicit
      checkpoint answers rather than object existence.
- [ ] Introduce `StartupCheckpointSnapshot` and its seed/join owner helpers.
- [ ] Cut `buildSeedCheckpointSteps(...)` and `buildJoinCheckpointSteps(...)`
      over to the checkpoint-owner contract.
- [ ] Move checkpoint-owned post-phase work out of anonymous step closures and
      into named helpers or owners.
- [ ] Remove superseded checkpoint predicates and shrink delegate-bundle
      surfaces to the remaining owner dependencies.

## Residual Closure Inventory

- [ ] Owner-path cutovers are complete for seed and join checkpoint decisions.
- [ ] Tail startup finalization and resume consumers use the checkpoint
      contract.
- [ ] Startup diagnostics and tests report the new checkpoint vocabulary.
- [ ] Superseded checkpoint predicates and compatibility delegate entries are
      deleted.
- [ ] Required proof layers are complete.

## Validation

1. `npx tap test/bootstrap/pipeline/startup-pipeline-runner.test.js test/bootstrap/bootstrap-sequence.test.js test/bootstrap/join-checkpoint-progression-characterization.test.js`
2. `npx tap test/bootstrap/join-session-store.test.js test/bootstrap/seed-startup-session-store.test.js test/bootstrap/join-delegate-bundles.test.js test/bootstrap/seed-delegate-bundles.test.js`
3. Named scenario evidence for `node-join-under-load`, `rolling-restart`, and
   `seed-restart-under-load`
4. `npm run test:metrics`

## Done When

1. Seed and join checkpoint progression no longer depends on raw local object
   existence predicates.
2. Post-phase checkpoint work is explicit and owner-shaped.
3. `StartupPipelineRunner`, startup finalization, and the touched
   orchestrators consume the checkpoint contract directly.
4. The touched orchestrators no longer preserve broad compatibility delegate
   surfaces only for checkpoint interpretation.
5. Focused proof is green and any remaining work is split into a new package
   before closure.
