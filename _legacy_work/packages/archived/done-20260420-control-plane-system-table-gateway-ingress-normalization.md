# Control Plane System Table Gateway Ingress Normalization

## Status

Done on 2026-04-20.

This is the first child under
`done-20260420-control-plane-system-table-gateway-semantic-shared-front-reduction-umbrella.md`.

## Why

The gateway boundary currently mixes semantic duplication with broad shared-front
lint drift. This package exists to normalize the ingress first: trim unused
destructures, normalize touched gateway files to repo ESLint style, and remove
same-owner shared-front noise that would otherwise obscure later semantic work.

## Scope

1. `src/control-plane/control-plane-system-table-gateway.js`
2. `src/control-plane/control-plane-system-table-gateway-shared.js`
3. `src/control-plane/control-plane-system-table-gateway-segment-1.js`
4. `src/control-plane/control-plane-system-table-gateway-segment-2.js`
5. `src/control-plane/control-plane-system-table-gateway-segment-3.js`

## Invariants

1. The shared gateway module remains the canonical helper surface through
   semantic named exports instead of a bag-shaped ingress object.
2. This package does not change gateway semantics on purpose. It only removes
   unused ingress breadth, shared-front duplication, and style drift that block
   the later semantic packages.
3. The touched gateway files must be ESLint-clean when this package closes.

## Closure Criteria

1. The touched gateway files pass ESLint.
2. Each touched segment destructures only the shared names it actually uses.
3. Root exports and helper wrappers remain behaviorally stable.
4. Any residual semantic duplication is explicitly handed to the later read,
   mutation, or visibility child package rather than left ambiguous.

## Validation

1. `npx eslint src/control-plane/control-plane-system-table-gateway.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/control-plane-system-table-gateway-segment-1.js src/control-plane/control-plane-system-table-gateway-segment-2.js src/control-plane/control-plane-system-table-gateway-segment-3.js`
2. `npx tap test/control-plane/control-plane-system-table-gateway.test.js`
3. `npx tap test/scripts/check-unified-system-metadata-gateway.test.js`
4. `npm run test:duplication`
5. `npm run test:metrics`
