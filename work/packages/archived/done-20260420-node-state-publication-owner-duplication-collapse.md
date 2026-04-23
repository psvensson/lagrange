# Node State Publication Owner Duplication Collapse

## Status

Done on 2026-04-20.

This child package executes the next internal owner-boundary reduction slice
under `done-20260420-segmented-owner-internal-duplication-reduction-umbrella.md`.

## Why

`NodeJoiningService` still carries a duplicated node-state-publication path
even though `segment-1` already instantiates `NodeStatePublicationOwner` and
delegates the main owner ingress to it. The remaining duplicated helpers and
shadowed prototype methods keep the owner boundary porous and account for one
of the largest in-scope clone clusters left in the umbrella.

## Scope

1. `src/bootstrap/node-joining-service-shared.js`
2. `src/bootstrap/node-joining-service-segment-1.js`
3. `src/bootstrap/node-joining-service-segment-3.js`
4. `src/bootstrap/node-joining-service-segment-4.js`
5. `src/bootstrap/shared/node-state-publication-owner.js`

## Invariants

1. `NodeStatePublicationOwner` remains the single semantic owner for deferred
   node-state publication policy and retry classification.
2. `NodeJoiningService` keeps the same public service surface for
   `sendControlPlaneNodeStateUpdate` and related delegation points.
3. No new segmentation layers or parallel helper bags.
4. Legacy duplicate prototype methods are deleted rather than left shadowed by
   constructor-time instance properties.

## Validation

1. `npm run test:duplication`
2. `npx tap test/bootstrap/node-joining-service.test-part-2.js test/bootstrap/node-joining-service.test-part-3.js test/bootstrap/node-joining-control-plane-heartbeat.test.js`
3. `npm run test:metrics`

## Landed

This package collapsed the duplicated node-state publication path back onto
`NodeStatePublicationOwner` by:

1. exporting the shared node-state publication helpers from
   `src/bootstrap/shared/node-state-publication-owner.js`
2. extending `src/bootstrap/node-joining-service-segment-1.js` constructor
   delegation so the compatibility surface still resolves through the real
   owner
3. deleting the shadowed duplicate publication methods from
   `src/bootstrap/node-joining-service-segment-3.js` and
   `src/bootstrap/node-joining-service-segment-4.js`
4. shrinking the stale `NODE_JOINING_SERVICE_SHARED` destructure fronts in the
   affected segments to their real dependencies

## Measured Reduction

1. incoming baseline: `36` clone groups / `2493` duplicated lines
2. after this package: `30` clone groups / `2125` duplicated lines

That is a reduction of `6` clone groups and `368` duplicated lines while also
removing a second owner path from the join control-plane publication boundary.

## Current Validation Evidence

1. `npx tap test/bootstrap/node-joining-service.test-part-2.js test/bootstrap/node-joining-service.test-part-3.js test/bootstrap/node-joining-control-plane-heartbeat.test.js`
2. `npm run test:duplication`
3. `npm run test:metrics`

## Residual Handoff

The next highest-signal residual clone groups under the umbrella now live in:

1. `src/partition/partition-service-segment-*`
2. `src/partition/partition-service-shared.js`
3. `src/query/sql-query-engine-segment-2.js`
4. `src/query/sql-query-engine-shared.js`
5. `src/rebalancer/operation-workflow-owner-segment-4.js`
6. `src/rebalancer/operation-workflow-owner-shared.js`

Those remain under
`done-20260420-segmented-owner-internal-duplication-reduction-umbrella.md`.

## Done When

1. `NodeStatePublicationOwner` is the single semantic owner for deferred
   node-state publication policy and retry classification.
2. `NodeJoiningService` preserves the expected publication entry points through
   delegation instead of shadowing the owner path.
3. The duplication ratchet is tightened to the measured post-package baseline.
