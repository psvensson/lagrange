# Distributed Harness Failure-Bundle Confirmation Path Repair

## Status

Done on 2026-04-20.

The harness failure-bundle/reporting path is repaired.

Focused proof is green, and the two scenarios that originally exposed this
path now fail cleanly with recorded scenario/run bundles instead of crashing in
teardown:

1. `node-join-under-load`
2. `rolling-restart`

Those reruns exposed new narrow confirmation blockers, but they no longer
belong to this package because the harness now records them correctly.

## Why

This package existed because the sprint-level confirmation pass could not be
trusted while the harness died during failure-bundle serialization. That
boundary is now stable again, so subsequent scenario failures can be triaged as
ordinary confirmation blockers instead of harness-path regressions.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under
`Failure simulations`.

## Completed Scope

1. Repaired the touched `failure-bundle-segment-*` owner boundaries so failed
   scenarios write deterministic scenario/run bundles instead of crashing in
   teardown.
2. Removed broken segment-local symbol assumptions across the touched
   failure-bundle/reporting path.
3. Restored green focused proof for failure-bundle and runner tests.
4. Re-ran the two scenarios that originally exposed this path and confirmed
   they now produce bundle/report artifacts cleanly.

## Out Of Scope

1. Reopening `Canonical Readiness Ladder And Admission Closure`.
2. Broad harness redesign outside the touched failure-bundle/reporting path.
3. The newly surfaced `node-join-under-load` and `rolling-restart`
   confirmation blockers.
4. Middle-layer startup/rebalancer work from the successor sprint.

## Detection / Analysis

- [x] Confirm the sprint-level confirmation pass failed on the harness
      failure-bundle/reporting path rather than on the readiness package.
- [x] Trace the first hard failure to missing path/fs bindings in
      `failure-bundle-segment-7.js`.
- [x] Confirm with focused harness tests that the segment chain still had
      additional broken symbol and helper boundaries.
- [x] Confirm the repaired path now writes scenario/run bundles for
      `node-join-under-load` and `rolling-restart` instead of dying in
      teardown.

## Implementation Tasks

- [x] Finish repairing the touched failure-bundle segment boundaries so the
      harness does not crash while serializing failed scenarios.
- [x] Restore green focused proof for
      `test/distributed/harness/__tests__/failure-bundle.test.js` and
      `test/distributed/harness/__tests__/run.test.js`.
- [x] Rerun the first affected confirmation scenarios:
      `node-join-under-load` and `rolling-restart`.
- [x] Hand off the newly surfaced confirmation blockers to a follow-up package
      instead of keeping this harness-repair package active.

## Validation

1. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js test/distributed/harness/__tests__/run.test.js`
2. `npm run test:metrics`
3. `node-join-under-load`
4. `rolling-restart`

## Done When

1. Failing scenarios no longer crash while writing failure bundles or triage
   markdown.
2. Focused failure-bundle and runner tests are green.
3. The sprint-level confirmation pass can continue on recorded results instead
   of dying in teardown.
