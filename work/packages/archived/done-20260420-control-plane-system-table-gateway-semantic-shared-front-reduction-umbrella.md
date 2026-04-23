# Control Plane System Table Gateway Semantic Shared Front Reduction Umbrella

## Status

Done on 2026-04-20.

This umbrella package is the next highest-signal internal duplication slice
under
`done-20260420-segmented-owner-internal-duplication-reduction-umbrella.md`.

## Why

The current top pair clone sits inside the control-plane system-table gateway
boundary between `control-plane-system-table-gateway.js` and
`control-plane-system-table-gateway-shared.js`. The goal is to reduce that
same-owner duplication semantically by shrinking the gateway ingress to its
actual dependency set and deleting any repeated same-owner helper front that no
longer needs to exist.

A direct lint pass against the gateway boundary already shows that this is not
one narrow package. Root facade exports, shared ingress shape, segment fronts,
read-contract helpers, mutation-ingress helpers, and cache-reconcile/visibility
helpers are currently mixed together. Splitting this boundary is necessary to
avoid another half-closed package.

## Scope

1. `src/control-plane/control-plane-system-table-gateway.js`
2. `src/control-plane/control-plane-system-table-gateway-shared.js`
3. `src/control-plane/control-plane-system-table-gateway-segment-*.js`

## Invariants

1. The shared gateway module remains the canonical helper surface through
   semantic named exports and named helper contracts.
2. No new synthetic numbered group objects or extra segmentation layers.
3. The reduction must leave the touched files lint-clean under the repo ESLint
   config.
4. Authoritative read mode, mutation submission, and read-repair semantics stay
   owned by the gateway boundary rather than being restated locally.

## Closure Strategy

1. Run the gateway boundary serially through focused child packages instead of
   one broad active package.
2. Use one short ingress-normalization pass first so later packages are not
   blocked by unrelated shared-front lint debt.
3. Split semantic work into read contract, mutation ingress, and cache
   reconcile/visibility packages.
4. This umbrella closes only when all four child packages are done and the
   measured duplication report confirms the gateway boundary no longer carries
   a remaining clone group.

## Child Packages

1. `done-20260420-control-plane-system-table-gateway-ingress-normalization.md`
2. `done-20260420-control-plane-system-table-gateway-read-contract-reduction.md`
3. `done-20260420-control-plane-system-table-gateway-mutation-ingress-reduction.md`
4. `done-20260420-control-plane-system-table-gateway-cache-reconcile-and-visibility-reduction.md`

## Validation

1. `npx eslint src/control-plane/control-plane-system-table-gateway.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/control-plane-system-table-gateway-segment-1.js src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-3.js`
2. `npx tap test/control-plane/control-plane-system-table-gateway.test.js`
3. `npx tap test/scripts/check-unified-system-metadata-gateway.test.js`
4. Focused consumer suites for any touched downstream read or mutation contract
   changes
5. `npm run test:duplication`
6. `npm run test:metrics`
