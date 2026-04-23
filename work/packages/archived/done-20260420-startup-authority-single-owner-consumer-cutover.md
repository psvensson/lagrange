# Startup Authority Single-Owner Consumer Cutover

## Status

Done on 2026-04-20.

This package depended on
`done-20260420-seed-startup-workflow-parity-and-durable-cutover.md`.

The startup boundary now consumes one readiness-owned startup-authority
contract. `JoinReadinessEvaluator` no longer keeps a competing canonical
startup snapshot grammar, and direct consumers read the shared authority
surface instead.

Focused proof is green:

1. `test/bootstrap/join-readiness-evaluator.test.js`
2. `test/bootstrap/join-readiness-startup-authority.test.js`
3. `test/bootstrap/startup-authority-consumption.test.js`
4. `test/control-plane/canonical-readiness-consumption.test.js`
5. `test/control-plane/startup-authority-snapshot.test.js`
6. `test/control-plane/control-plane-readiness-service.test.js`

Shared metrics handoff:
`todo-20260420-duplication-ratchet-classification-and-boundary-reduction.md`.

## Why

The startup boundary still has duplicated authority shaping. `JoinReadinessEvaluator`
builds its own startup snapshot and then also consults the control-plane
readiness boundary. That leaves two places capable of answering the same
semantic question about startup authority, stage, and blockers.

This package makes one owner authoritative and turns the rest of the startup
boundary into consumers of that contract only.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Pick one canonical startup-authority owner contract under the readiness
   boundary.
2. Move join and seed startup consumers to that one authority contract.
3. Delete duplicate startup-authority shaping in direct consumers.
4. Preserve canonical blocker reasons and staged readiness vocabulary through
   the cutover.

## Out Of Scope

1. New readiness features.
2. Broad control-plane redesign outside startup-authority ownership.
3. Transport or publication redesign beyond direct consumer alignment.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Invariants

1. One owner must emit the canonical startup-authority answer.
2. Consumers must not rebuild startup authority from local branch piles or
   adjacent snapshots.
3. Canonical reasons and stage vocabulary must stay typed and consistent
   across join, seed, diagnostics, and readiness consumers.
4. If the earlier readiness extraction package lands a smaller startup-authority
   owner, this package must reuse that owner rather than inventing another
   home.

## Shared Boundary Contract

- Semantic owner: one readiness-owned startup-authority contract
- Canonical contract shape / vocabulary: one startup-authority snapshot
  carrying canonical state, readiness stage, reasons, publication evidence,
  recovery evidence, and timestamps
- Allowed consumers: `JoinReadinessEvaluator`, bootstrap/readiness APIs,
  startup recovery, diagnostics, focused tests
- Prohibited reinterpretations: consumer-local snapshot builders that restate
  startup authority in adjacent but non-identical vocabularies
- Primary diagnostics / proof surfaces: readiness tests, startup authority
  consumer tests, join readiness tests

## Hotspots

1. `src/bootstrap/join-readiness-evaluator.js`
2. `src/control-plane/control-plane-readiness-service.js`
3. `src/bootstrap/startup-recovery-coordinator.js`
4. `test/bootstrap/join-readiness-evaluator.test.js`
5. `test/bootstrap/join-readiness-startup-authority.test.js`
6. `test/bootstrap/startup-authority-consumption.test.js`
7. `test/control-plane/canonical-readiness-consumption.test.js`
8. `test/control-plane/startup-authority-snapshot.test.js`
9. `test/control-plane/control-plane-readiness-service.test.js`

## Detection / Analysis Tasks

- [ ] Inventory every startup-authority field currently built in
      `JoinReadinessEvaluator`.
- [ ] Inventory the equivalent readiness-owned startup-authority fields and
      reason vocabularies.
- [ ] Mark all consumers that still reconstruct authority from multiple local
      sources.

## Implementation Tasks

- [ ] Choose the canonical startup-authority owner and document the contract.
- [ ] Cut `JoinReadinessEvaluator` and other direct consumers over to that
      contract.
- [ ] Delete duplicate startup-authority snapshot shaping from consumers.
- [ ] Add focused proof that join, bootstrap APIs, and diagnostics consume one
      canonical authority answer.
- [ ] Fence off any residual compatibility path until deletion can happen in
      the next package.

## Residual Closure Inventory

- [ ] Startup authority has one owner and one contract.
- [ ] `JoinReadinessEvaluator` no longer shapes a competing canonical snapshot.
- [ ] Readiness and startup diagnostics consume the same vocabulary.
- [ ] Direct consumers stop carrying local branch-pile startup reasoning.

## Validation

1. `test/bootstrap/join-readiness-evaluator.test.js`
2. `test/bootstrap/join-readiness-startup-authority.test.js`
3. `test/bootstrap/startup-authority-consumption.test.js`
4. `test/control-plane/canonical-readiness-consumption.test.js`
5. `test/control-plane/startup-authority-snapshot.test.js`
6. `test/control-plane/control-plane-readiness-service.test.js`
7. `npm run test:metrics`

## Done When

1. The startup boundary can point to one owner for the canonical authority
   answer.
2. Join, seed, and diagnostics consume that answer without rebuilding it.
3. Startup blocker reasoning no longer depends on competing consumer-local
   vocabularies.
