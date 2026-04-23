# Startup Runtime Handoff And Cleanup Single-Owner Cutover

## Status

Done on 2026-04-20.

This package depended on
`done-20260420-startup-authority-single-owner-consumer-cutover.md`.

Runtime handoff and cleanup now flow through the startup-owned handoff and
cleanup owners rather than service-local tails, with seed and join sharing the
same terminal-state semantics.

Focused proof is green:

1. `test/bootstrap/startup-runtime-handoff-owner.test.js`
2. `test/bootstrap/shared/startup-sql-runtime-handoff.test.js`
3. `test/bootstrap/bootstrap-failure-cleanup.test.js`
4. `test/bootstrap/join-cleanup.property.test.js`
5. `test/bootstrap/cleanup-ownership-order-characterization.test.js`
6. `test/bootstrap/startup-runtime-surface-owner.test.js`
7. `test/integration/move-replica-handoff.integration.test.js`

Shared metrics handoff:
`todo-20260420-duplication-ratchet-classification-and-boundary-reduction.md`.

## Why

Even after workflow durability and authority are unified, startup can still
fail in practice if success handoff and failure cleanup remain split across
several local tails. The current boundary already has useful extracted owners,
but runtime handoff, seed cleanup, and join cleanup still need one sequencing
story.

This package makes startup completion and startup failure each flow through one
explicit owner path.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Align runtime handoff sequencing under one startup-owned contract.
2. Align seed and join cleanup sequencing with workflow terminal states.
3. Preserve metadata publication gating and background-writer activation
   semantics under the unified handoff owner.
4. Make cleanup ordering and post-success runtime activation observable and
   testable from one owner story.

## Out Of Scope

1. New background work or replication features.
2. Broad bootstrap or join redesign outside handoff/cleanup sequencing.
3. Transport redesign outside direct handoff collaborators.

## Scenario Targets

1. `rolling-restart`
2. `seed-restart-under-load`
3. `node-join-under-load`

## Invariants

1. Runtime handoff must occur only after the startup workflow reaches its
   canonical successful terminal state.
2. Failure cleanup must derive from workflow terminal state and ordered cleanup
   rules, not from scattered caller-local tails.
3. Seed and join must share the same semantic meaning for successful handoff,
   failed cleanup, and deferred activation.
4. Background-writer activation and metadata publication gating must remain
   read-only consumers of canonical startup state, not alternate owners of
   startup completion.

## Shared Boundary Contract

- Semantic owner: startup runtime handoff owner plus workflow-aligned cleanup
  owners
- Canonical contract shape / vocabulary: one startup completion contract for
  success handoff, deferred activation, cleanup ordering, and terminal failure
  teardown
- Allowed consumers: `BootstrapService`, `NodeJoiningService`, entrypoint
  reporting, cleanup handlers, focused tests
- Prohibited reinterpretations: local service tails deciding independently when
  startup is complete or what cleanup ordering should run
- Primary diagnostics / proof surfaces: handoff owner tests, cleanup tests,
  startup/runtime integration proof

## Hotspots

1. `src/bootstrap/owners/startup-runtime-handoff-owner.js`
2. `src/bootstrap/shared/startup-sql-runtime-handoff.js`
3. `src/bootstrap/join-cleanup-handler.js`
4. `src/bootstrap/phases/seed-cleanup-handler.js`
5. `src/bootstrap/bootstrap-service.js`
6. `src/bootstrap/node-joining-service.js`
7. `src/index.js`
8. `test/bootstrap/startup-runtime-handoff-owner.test.js`
9. `test/bootstrap/shared/startup-sql-runtime-handoff.test.js`
10. `test/bootstrap/bootstrap-failure-cleanup.test.js`
11. `test/bootstrap/join-cleanup.property.test.js`
12. `test/bootstrap/cleanup-ownership-order-characterization.test.js`
13. `test/bootstrap/startup-runtime-surface-owner.test.js`
14. `test/integration/move-replica-handoff.integration.test.js`

## Detection / Analysis Tasks

- [ ] Inventory seed and join handoff/cleanup steps that still live outside
      the extracted owners.
- [ ] Map the current ordering dependencies between workflow success,
      metadata publication readiness, background-writer activation, and cleanup.
- [ ] Identify any direct callers that currently bypass the handoff or cleanup
      owners.

## Implementation Tasks

- [ ] Align runtime handoff on one startup-owned success contract.
- [ ] Align seed and join cleanup on workflow terminal state and ordered owner
      sequencing.
- [ ] Delete direct caller tails that duplicate handoff or cleanup decisions.
- [ ] Add focused regression coverage for deferred activation, cleanup order,
      and failure after partial startup.
- [ ] Preserve entrypoint-level reporting against the canonical handoff story.

## Residual Closure Inventory

- [ ] Runtime handoff has one owner path.
- [ ] Seed and join cleanup execute from the same semantic terminal-state
      contract.
- [ ] Local tail cleanup and handoff branches are deleted.
- [ ] Post-startup background activation no longer acts as a shadow startup
      completion owner.

## Validation

1. `test/bootstrap/startup-runtime-handoff-owner.test.js`
2. `test/bootstrap/shared/startup-sql-runtime-handoff.test.js`
3. `test/bootstrap/bootstrap-failure-cleanup.test.js`
4. `test/bootstrap/join-cleanup.property.test.js`
5. `test/bootstrap/cleanup-ownership-order-characterization.test.js`
6. `test/bootstrap/startup-runtime-surface-owner.test.js`
7. `test/integration/move-replica-handoff.integration.test.js`
8. `npm run test:metrics`

## Done When

1. Successful startup handoff is emitted by one owner path.
2. Seed and join cleanup follow one workflow-aligned sequencing story.
3. Deferred activation and cleanup failures classify to one owner contract
   rather than scattered service-local tails.
