# Segmented Owner Internal Duplication Reduction Umbrella

## Status

Done on 2026-04-20.

This umbrella is the explicit residual handoff from
`done-20260420-duplication-ratchet-classification-and-boundary-reduction.md`.

The wrapper-collapse package removed same-owner duplicate root surfaces, and
the next follow-on tranche removed the remaining root-level wrapper duplication
in query, rebalancer workflow, admin websocket, CDC integration, and
control-plane readiness. The ratchet is now tightened to the measured reduced
baseline:

1. before cleanup: `56` clone groups / `4725` duplicated lines
2. after wrapper collapse tranche 1: `45` clone groups / `3208` duplicated lines
3. after wrapper collapse tranche 2: `36` clone groups / `2493` duplicated lines
4. after node-state publication owner collapse: `30` clone groups / `2125` duplicated lines
5. after partition-service segment front reduction: `21` clone groups /
   `964` duplicated lines
6. after query-owner shared front and routing contract reduction: `18` clone
   groups / `715` duplicated lines
7. after rebalancer operation workflow owner semantic shared front reduction:
   `17` clone groups / `615` duplicated lines
8. after control-plane system-table gateway semantic shared front reduction:
   `16` clone groups / `529` duplicated lines

This umbrella is closed. Any further internal clone reduction should be opened
as a new umbrella instead of reopening this tranche.

## Why

The remaining duplication is concentrated inside owners that were previously
split for file size rather than semantic closure. Those clone groups should be
reduced by consolidating internal decision helpers, removing repeated
destructure/import fronts, and shrinking same-owner shared bags. They should
not be hidden behind the new ratchet baseline forever.

## In Scope

1. `src/partition/partition-service-segment-*`
2. `src/partition/partition-service-shared.js`
3. `src/bootstrap/node-joining-service-segment-3.js`
4. `src/bootstrap/node-joining-service-shared.js`
5. `src/cdc/cdc-integration-service.js`
6. `src/cdc/cdc-integration-service-shared.js`
7. `src/admin/admin-websocket-api.js`
8. `src/admin/admin-websocket-api-shared.js`
9. `src/rebalancer/operation-workflow-owner*.js`
10. `src/query/query-executor*.js`
11. `src/query/sql-query-engine*.js`
12. `src/control-plane/control-plane-readiness-service*.js`

## Out Of Scope

1. Reopening the already-closed wrapper-collapse package
2. Broad feature work
3. Ratchet resets without direct measured reduction inside the owners above

## Closure Strategy

1. Split this umbrella into one child package per owner boundary or per
   explicitly disjoint pair of owners.
2. Reduce internal clone groups semantically, not by adding more segments.
3. Ratchet the duplication baseline down after each child package when the
   measured report proves it.

## Child Packages

1. `done-20260420-segmented-owner-wrapper-collapse-tranche-2.md`
2. `done-20260420-node-state-publication-owner-duplication-collapse.md`
3. `done-20260420-partition-service-segment-front-reduction.md`
4. `done-20260420-query-owner-shared-front-and-routing-contract-reduction.md`
5. `done-20260420-rebalancer-operation-workflow-owner-semantic-shared-front-reduction.md`
6. `done-20260420-control-plane-system-table-gateway-semantic-shared-front-reduction-umbrella.md`

## Validation

1. `npm run test:duplication`
2. Focused owner-path suites for each touched owner
3. `npm run test:metrics`
