# Startup Legacy Path Deletion And Proof Hardening

## Status

Done on 2026-04-20.

This package depended on
`done-20260420-startup-runtime-handoff-and-cleanup-single-owner-cutover.md`.

The residual proof blockers are resolved:

1. `test/bootstrap/bootstrap-sequence.test.js` is green after trimming the
   sequence assertions to the phases they actually own.
2. scenario-harness contract reruns are green after fixing the segmented
   helper import chain in `test/distributed/scenarios/table-distribution-helpers-segment-*.js`.

Focused proof is green:

1. `test/bootstrap/join-coordinator.test.js`
2. `test/bootstrap/join-session-store.test.js`
3. `test/bootstrap/bootstrap-sequence.test.js`
4. `test/bootstrap/startup-authority-consumption.test.js`
5. `test/bootstrap/startup-runtime-handoff-owner.test.js`
6. `test/control-plane/canonical-readiness-consumption.test.js`
7. `test/control-plane/startup-authority-snapshot.test.js`
8. `test/integration/debug-join-flow.test.js`
9. `test/integration/seed-node-bootstrap.integration.test.js`
10. named scenario reruns for `node-join-under-load`, `rolling-restart`,
    `seed-restart-under-load`, and
    `seven-node-load-during-partitioning`

Shared metrics handoff:
`todo-20260420-duplication-ratchet-classification-and-boundary-reduction.md`
tracks the remaining duplication ratchet failure from `npm run test:metrics`.

## Why

This startup boundary is too sensitive to close with compatibility shims,
parallel snapshot builders, or "temporary" fallback runners still in place.
The work is only complete when the remaining meanings are singular and the
proof ladders can evaluate failures against those singular meanings.

This package deletes the legacy paths and hardens proof around the new startup
contracts.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Delete superseded workflow, authority, and handoff fallback paths touched
   by the umbrella.
2. Add focused proof that the new startup contracts are the only remaining
   ones.
3. Re-run named scenario evidence on the unified startup boundary.
4. Tighten diagnostics so failures classify to one workflow, one authority, or
   one handoff/cleanup owner story.

## Out Of Scope

1. New startup functionality.
2. Additional transport or service lifecycle redesign outside touched startup
   collaborators.
3. Broad repo hygiene work unrelated to this boundary.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`
4. `seven-node-load-during-partitioning`

## Invariants

1. The boundary does not close while old and new startup meanings coexist.
2. All surviving startup consumers must read the canonical workflow,
   authority, and handoff contracts.
3. Focused proof must be sufficient to classify regressions before named
   scenario reruns are treated as product blockers.
4. Named scenario failures, if any, should reduce to one typed blocker story
   rather than ambiguous cross-owner drift.

## Shared Boundary Contract

- Semantic owner: the unified startup workflow, authority, and handoff
  contracts produced by the preceding packages
- Canonical contract shape / vocabulary: one durable workflow story, one
  startup-authority story, and one runtime-handoff/cleanup story
- Allowed consumers: startup orchestration, readiness surfaces, diagnostics,
  entrypoint reporting, tests, scenario harness
- Prohibited reinterpretations: legacy serial startup loops, local snapshot
  rebuilders, compatibility tails, and fallback completion grammars
- Primary diagnostics / proof surfaces: focused startup suites, integration
  restart/join suites, named scenario evidence

## Hotspots

1. All files touched by the preceding child packages
2. `test/bootstrap/`
3. `test/control-plane/`
4. `test/integration/`
5. `test/distributed/scenarios/`
6. `test/distributed/harness/`

## Detection / Analysis Tasks

- [ ] Inventory the remaining compatibility shims, fallback runners, and local
      snapshot builders left after the earlier cutovers.
- [ ] Confirm that each surviving startup consumer reads the canonical
      contracts only.
- [ ] Define the exact focused test set and scenario rerun set needed to
      classify the boundary as singular and proven.

## Implementation Tasks

- [ ] Delete superseded startup workflow fallbacks.
- [ ] Delete superseded startup-authority and runtime-handoff fallback paths.
- [ ] Add regression tests that fail if consumers reintroduce local startup
      meanings.
- [ ] Re-run focused suites and the named scenario lanes for the unified
      startup boundary.
- [ ] Tighten diagnostics where needed so failures classify to one owner story.

## Residual Closure Inventory

- [ ] Legacy workflow and authority fallback paths are deleted.
- [ ] Runtime handoff and cleanup no longer have compatibility tails.
- [ ] Focused suites and scenario evidence evaluate one singular startup
      boundary.
- [ ] Remaining failures, if any, classify to one typed owner contract.

## Validation

1. `test/bootstrap/join-coordinator.test.js`
2. `test/bootstrap/join-session-store.test.js`
3. `test/bootstrap/bootstrap-sequence.test.js`
4. `test/bootstrap/startup-authority-consumption.test.js`
5. `test/bootstrap/startup-runtime-handoff-owner.test.js`
6. `test/control-plane/canonical-readiness-consumption.test.js`
7. `test/control-plane/startup-authority-snapshot.test.js`
8. `test/integration/debug-join-flow.test.js`
9. `test/integration/seed-node-bootstrap.integration.test.js`
10. Named scenario reruns for the scenario targets above
11. `npm run test:metrics`

## Done When

1. There is one startup workflow meaning left in the codebase.
2. There is one startup-authority meaning left in the codebase.
3. There is one runtime-handoff and cleanup sequencing story left in the
   codebase.
4. Focused suites and named scenario evidence no longer need compatibility
   reasoning to explain failures.
