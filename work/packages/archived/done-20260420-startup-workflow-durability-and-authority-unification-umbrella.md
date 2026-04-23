# Startup Workflow Durability And Authority Unification Umbrella

## Status

Done on 2026-04-20.

The startup boundary now closes with one durable workflow story, one
startup-authority story, and one runtime-handoff/cleanup story.

Closure evidence:

1. focused startup suites are green across join durability, seed workflow
   parity, startup authority consumption, runtime handoff, cleanup ownership,
   and legacy-proof lanes
2. named scenario reruns are green:
   `node-join-under-load`,
   `rolling-restart`,
   `seed-restart-under-load`,
   `seven-node-load-during-partitioning`
3. `npm run test:metrics` passes cognitive complexity and circular dependency
   gates
4. `npm run test:metrics` still fails the duplication ratchet on broader clone
   groups spanning startup-adjacent and unrelated oversized owners; explicit
   handoff:
   `todo-20260420-duplication-ratchet-classification-and-boundary-reduction.md`

Additional runner note:

1. `test/integration/node-join-convergence-slo.integration.test.js` is green
   in isolation. One aggregate multi-file run hit `EADDRINUSE`, which
   classifies as a shared TAP concurrency concern rather than a startup
   workflow regression.

## Why

The current startup boundary has the right architectural direction, but it
still carries two design gaps that are unsafe to leave half-finished:

1. `join` has a checkpoint model, but the session store is still process-local
   and therefore not truly durable.
2. `seed` startup, startup authority, and runtime handoff still live across
   adjacent owners, which makes restart, diagnostics, and cleanup harder to
   reason about than comparable control-plane systems in the wild.

This umbrella closes those gaps as one bounded program of work so the system
ends with one durable startup workflow story, one startup-authority story, and
one runtime-handoff story.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

These rows are AGPL-scoped in `edition-matrix.md`.

## In Scope

1. Make join startup workflow state genuinely durable across process restart.
2. Extract one reusable startup workflow kernel from the proven join path.
3. Move seed bootstrap onto the same durable workflow model and eliminate
   hidden post-pipeline cutover work.
4. Collapse startup authority to one canonical owner contract.
5. Collapse runtime handoff and cleanup sequencing to one startup-owned cut.
6. Delete superseded local fallback paths and add focused plus scenario proof.

## Out Of Scope

1. Broad transport redesign in `src/transport/message-router.js`.
2. Repo-wide file-size decomposition beyond the startup boundary.
3. New operator, deployment, or product-facing features.
4. New control-plane capabilities unrelated to startup durability and
   authority closure.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`
4. `seven-node-load-during-partitioning`

## Invariants

1. No package in this umbrella may close while two owners can both answer the
   same startup-authority question.
2. No package in this umbrella may close while `seed` and `join` use different
   semantic definitions of checkpoint, retryability, terminal failure, or
   finalization.
3. Startup durability does not count as complete while workflow state remains
   reconstructable only from in-memory runtime fields.
4. File splitting does not count as closure unless semantic owner count goes
   down and legacy meaning is deleted.
5. Every child package must name direct owner paths, legacy paths to delete,
   and explicit proof lanes before implementation starts.

## Hotspots

1. `src/bootstrap/join-session-store.js`
2. `src/bootstrap/join-coordinator.js`
3. `src/bootstrap/pipeline/join-startup-plan.js`
4. `src/bootstrap/pipeline/seed-startup-plan.js`
5. `src/bootstrap/pipeline/startup-pipeline-runner.js`
6. `src/bootstrap/bootstrap-service.js`
7. `src/bootstrap/join-readiness-evaluator.js`
8. `src/control-plane/control-plane-readiness-service.js`
9. `src/bootstrap/owners/startup-runtime-handoff-owner.js`
10. `src/bootstrap/join-cleanup-handler.js`
11. `src/bootstrap/phases/seed-cleanup-handler.js`
12. `src/bootstrap/startup-recovery-coordinator.js`

## Child Package Order

1. `done-20260420-join-startup-durable-session-contract.md`
2. `done-20260420-startup-workflow-kernel-extraction-and-join-cutover.md`
3. `done-20260420-seed-startup-workflow-parity-and-durable-cutover.md`
4. `done-20260420-startup-authority-single-owner-consumer-cutover.md`
5. `done-20260420-startup-runtime-handoff-and-cleanup-single-owner-cutover.md`
6. `done-20260420-startup-legacy-path-deletion-and-proof-hardening.md`

## Execution Rules

1. Child package `2` may not start until child package `1` has restart/resume
   proof on the real join contract.
2. Child package `3` may not start until child package `2` has cut join to the
   shared workflow kernel without a compatibility fallback runner.
3. Child package `4` may not start until child package `3` proves seed
   workflow state and finalization are checkpointed rather than implicit.
4. Child package `5` may not start until child package `4` removes duplicate
   startup-authority shaping from direct consumers.
5. Child package `6` is mandatory. This umbrella does not close on "new path
   added"; it closes only after the old startup meanings are deleted.

## Validation

1. Focused join workflow unit and characterization tests.
2. Focused seed bootstrap sequencing and cleanup tests.
3. Focused startup authority and readiness consumer tests.
4. Focused runtime handoff and cleanup ownership tests.
5. Named scenario evidence for the scenario targets above.
6. `npm run test:metrics`

## Done When

1. `join` and `seed` both run on one durable startup workflow substrate.
2. Startup authority is emitted by one canonical owner and consumed everywhere
   else.
3. Runtime handoff and cleanup sequencing have one owner story rather than
   split local tail logic.
4. Legacy workflow, authority, and finalization fallback paths are deleted.
5. Focused suites stay green and the named scenario lanes are either green or
   fail with one obvious typed blocker story.
