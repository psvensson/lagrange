# Join Startup Durable Session Contract

## Status

Done on 2026-04-20.

This was the first child package under
`done-20260420-startup-workflow-durability-and-authority-unification-umbrella.md`.

Implemented durable join workflow persistence through
`src/bootstrap/startup-workflow-store.js`,
`src/bootstrap/join-session-store.js`,
`src/bootstrap/join-coordinator.js`, and the join resume path in
`src/bootstrap/node-joining-service-segment-2.js`.

Focused proof is green:

1. `test/bootstrap/join-session-store.test.js`
2. `test/bootstrap/join-coordinator.test.js`
3. `test/bootstrap/join-checkpoint-progression-characterization.test.js`
4. `test/integration/debug-join-flow.test.js`
5. isolated `test/integration/node-join-convergence-slo.integration.test.js`

Shared metrics handoff:
`todo-20260420-duplication-ratchet-classification-and-boundary-reduction.md`
tracks the broader duplication ratchet failure still reported by
`npm run test:metrics`.

## Why

`JoinCoordinator` already models startup as checkpoints, but the current
`JoinSessionStore` still uses a `Map` as its backing store. That makes resume
logic process-local and leaves restart recovery dependent on reconstructing
state from runtime context rather than reading one durable workflow record.

This package makes the join session contract real before any broader startup
unification begins.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Replace process-local join-session storage with a persisted session record.
2. Define one canonical durable join-session shape that includes checkpoint,
   phase, retryability, terminal outcome, attempt accounting, and timestamps.
3. Make `JoinCoordinator` and the join startup entry path load and advance
   that contract directly.
4. Add focused restart/resume proof for join startup.

## Out Of Scope

1. Shared startup workflow kernel extraction.
2. Seed bootstrap workflow changes.
3. Startup authority or readiness consumer changes.
4. Runtime handoff or cleanup redesign outside join-session persistence.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Invariants

1. Join checkpoint progression remains monotonic and cannot regress on resume.
2. Retryable and terminal failure meaning must be readable from the durable
   session record without caller-local reconstruction.
3. Restart recovery must not infer join progress from local phase fields when
   the durable session record is available.
4. One join attempt must have one session identity and one canonical failure
   record.

## Shared Boundary Contract

- Semantic owner: durable join-session store plus `JoinCoordinator`
- Canonical contract shape / vocabulary: one session record carrying session
  identity, plan version, checkpoint, phase, attempt count, retryability,
  terminal state, failure details, and timestamps
- Allowed consumers: `NodeJoiningService`, join recovery, diagnostics, focused
  tests
- Prohibited reinterpretations: rebuilding checkpoint state from local phase
  strings or ad hoc bootstrap response inspection when the durable session
  record is available
- Primary diagnostics / proof surfaces: join session store tests, coordinator
  tests, restart/resume integration proof

## Hotspots

1. `src/bootstrap/join-session-store.js`
2. `src/bootstrap/join-coordinator.js`
3. `src/bootstrap/node-joining-service-segment-2.js`
4. `src/bootstrap/node-joining-service.js`
5. `test/bootstrap/join-session-store.test.js`
6. `test/bootstrap/join-coordinator.test.js`
7. `test/bootstrap/join-checkpoint-progression-characterization.test.js`
8. `test/integration/debug-join-flow.test.js`
9. `test/integration/node-join-convergence-slo.integration.test.js`

## Detection / Analysis Tasks

- [ ] Inventory the current join-session fields and identify what is still
      reconstructable only from process-local state.
- [ ] Identify the persistence home for the durable join session record.
- [ ] Trace all join callers that currently treat the session store as an
      in-memory convenience rather than authoritative workflow state.

## Implementation Tasks

- [ ] Define the canonical durable join-session schema and versioning rule.
- [ ] Replace the in-memory-only storage implementation with durable reads and
      writes.
- [ ] Make `JoinCoordinator` resume from the durable contract rather than
      rebuilding semantic state from local service fields.
- [ ] Shape terminal failure and retry metadata through one persisted record.
- [ ] Add restart/resume regression coverage for checkpoint recovery.

## Residual Closure Inventory

- [ ] `JoinSessionStore` is authoritative workflow persistence, not a local
      `Map` wrapper.
- [ ] Join startup resume reads one canonical durable record.
- [ ] Retryable and terminal failure meaning are persisted rather than inferred.
- [ ] Ad hoc process-local reconstruction paths are deleted or fenced off from
      this boundary.

## Validation

1. `test/bootstrap/join-session-store.test.js`
2. `test/bootstrap/join-coordinator.test.js`
3. `test/bootstrap/join-checkpoint-progression-characterization.test.js`
4. `test/bootstrap/node-joining-service.test.js`
5. `test/integration/debug-join-flow.test.js`
6. `test/integration/node-join-convergence-slo.integration.test.js`
7. `npm run test:metrics`

## Done When

1. A process restart can resume a join from the durable session record without
   semantic drift.
2. The join path has one authoritative persisted answer for checkpoint,
   retryability, and terminal outcome.
3. Focused join restart/resume proof stays green without relying on local
   fallback reconstruction.
