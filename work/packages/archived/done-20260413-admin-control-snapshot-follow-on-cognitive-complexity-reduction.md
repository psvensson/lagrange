# Admin Observability and Discovery Predictability

## Status

Completed on 2026-04-18 for the admin slice that feeds this sprint.

Delivered outcomes:

1. `src/admin/admin-control-snapshot.js`,
   `src/admin/admin-service-discovery.js`, and
   `src/admin/admin-websocket-api.js` now keep one canonical admin
   story for discovery readiness, authoritative repair diagnostics, and
   load-lane/query-result emission on the touched paths.
2. Admin hotspot cleanup reduced the repo cognitive report from `146` to
   `133` violations while removing all remaining `/src/admin/` entries from
   the current report.
3. Focused admin validation passed:
   `npm test -- test/admin/admin-control-snapshot.test.js test/admin/admin-control-snapshot-response-contract.test.js`,
   `npm test -- test/admin/admin-service-discovery.test.js`,
   and `npm test -- test/admin/admin-websocket-api.test.js`.

## Why

The admin lane is the first place the harness and the operator look when a
distributed scenario goes red. If control snapshot, discovery, and websocket
surfaces tell different stories about readiness, membership, or replica work,
the system becomes hard to understand before the real bug is even isolated.

This package turns the remaining admin hotspot cleanup into one diagnostic
goal: `admin-query-smoke` and `diag-admin-discovery` should see one canonical
story for control-snapshot evidence, discovery state, and replica-operation
summaries.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Simplify the remaining control-snapshot owner paths in
   `src/admin/admin-control-snapshot.js`
2. Touch `src/admin/admin-service-discovery.js` and
   `src/admin/admin-websocket-api.js` only when needed to keep one canonical
   admin diagnostic vocabulary on the touched path
3. Add or extend unit and response-contract coverage for the admin evidence
   emitted by the touched path

## Out Of Scope

1. New admin features or websocket feature expansion
2. Broad admin redesign outside the touched diagnostic lane
3. Query, partition, or transport behavior changes unless a direct admin
   boundary dependency forces a narrow follow-on edit

## Scenario Targets

1. `admin-query-smoke`
2. `diag-admin-discovery`

## Invariants

1. Admin surfaces must describe the same runtime state with one canonical
   vocabulary and authority story.
2. Replica-operation, readiness, and discovery evidence must be normalized
   before presentation.
3. Refactors must reduce branch piles without creating parallel answerers for
   the same diagnostic question.

## Validation

1. Targeted admin unit and response-contract tests
2. Focused scenario evidence for `admin-query-smoke` and
   `diag-admin-discovery` when the touched path feeds those scenarios
3. `npm run test:metrics`

## Done When

1. The touched admin surfaces emit one readable, consistent diagnostic story
   for membership, readiness, and replica-operation evidence.
2. `admin-query-smoke` and `diag-admin-discovery` are either green on the
   touched lane or fail with one obvious blocker story.
3. `npm run test:metrics` stays green on the tightened baselines.
