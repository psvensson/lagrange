# Segmented Owner Wrapper Collapse Tranche 2

## Status

Done on 2026-04-20.

This child package executes the next safe reduction slice under
`done-20260420-segmented-owner-internal-duplication-reduction-umbrella.md`.

## Why

Several remaining clone groups are still caused by root owner files that
duplicate large import/destructure fronts and hold only a small number of
owner-surface methods on top of an existing segmented class chain. These can
be collapsed safely before deeper internal segment/shared consolidation.

## Scope

1. `src/cdc/cdc-integration-service.js`
2. `src/cdc/cdc-integration-service-segment-3.js`
3. `src/admin/admin-websocket-api.js`
4. `src/admin/admin-websocket-api-segment-3.js`
5. `src/control-plane/control-plane-readiness-service.js`
6. `src/control-plane/control-plane-readiness-service-segment-4.js`
7. `src/query/query-executor.js`
8. `src/query/query-executor-segment-3-part-2.js`
9. `src/rebalancer/operation-workflow-owner.js`
10. `src/rebalancer/operation-workflow-owner-segment-7.js`

## Invariants

1. Public exports must remain compatible.
2. No new segmentation layers.
3. Root wrapper files become thin export surfaces after the moved methods land
   in the segmented class chain.
4. This package must not widen into deeper internal segment/shared clone
   refactors.

## Validation

1. `npm run test:duplication`
2. Focused owner-path suites for touched boundaries
3. `npm run test:metrics`

## Landed

This package moved the remaining root-owned methods into the segmented class
chain for:

1. `src/query/query-executor.js`
2. `src/rebalancer/operation-workflow-owner.js`
3. `src/admin/admin-websocket-api.js`
4. `src/cdc/cdc-integration-service.js`
5. `src/control-plane/control-plane-readiness-service.js`

Each root file is now a thin export surface, and the segment chain owns the
runtime methods directly.

## Measured Reduction

1. incoming baseline: `45` clone groups / `3208` duplicated lines
2. after this package: `36` clone groups / `2493` duplicated lines

That is a reduction of `9` clone groups and `715` duplicated lines without
adding new segment layers.

## Proof Notes

Focused owner-path validation passed for the touched admin, CDC,
control-plane-readiness, rebalancer workflow, and duplication/metrics lanes.

Two unrelated focused suites remained red during exploratory reruns and were
not widened into this package:

1. `test/query/query-executor.test.js` and
   `test/query/query-executor.test-part-5.js`
2. `test/cdc/cdc-integration-service.test-part-3.js`

Those failures were outside the moved root-wrapper methods in this package,
and the package scope stopped at the wrapper collapse boundary instead of
silently widening into separate behavioral fixes.

## Residual Handoff

The remaining highest-signal internal clone groups stay with
`done-20260420-segmented-owner-internal-duplication-reduction-umbrella.md`,
starting with the node-state-publication duplication boundary in
`active-20260420-node-state-publication-owner-duplication-collapse.md`.

## Done When

1. The duplication ratchet is tightened to the measured post-package baseline.
2. The touched root owners remain thin export surfaces.
3. Remaining internal clone drift is split explicitly instead of silently
   widened into this package.
