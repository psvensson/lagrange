# Control Plane System Table Gateway Read Contract Reduction

## Status

Done on 2026-04-20.

## Why

The gateway currently mixes read profile, authoritative read mode, SQL
fallback, owner-local reads, and projection reads across the root facade and
shared helpers. This package exists to collapse that into one smaller read
contract surface.

## Scope

1. `src/control-plane/control-plane-system-table-gateway.js`
2. `src/control-plane/control-plane-system-table-gateway-shared.js`
3. Gateway segment files that own `executeRead`, `readRows`,
   `readAuthoritativeRows`, or related read strategy/profile helpers

## Invariants

1. Read profile, strategy, and authoritative mode remain owned by the gateway
   boundary.
2. Callers keep using the canonical gateway read surfaces instead of rebuilding
   read strategy locally.
3. Mutation behavior is not broadened in this package.

## Closure Criteria

1. One canonical read contract remains for authoritative, projection, and cache
   reads.
2. Repeated read-strategy/profile helper fronts are deleted or collapsed into
   one owner surface.
3. Touched files stay ESLint-clean.

## Validation

1. `npx eslint` on all touched gateway files
2. `npx tap test/control-plane/control-plane-system-table-gateway.test.js`
3. `npx tap test/control-plane/authoritative-control-plane-view.test.js`
4. `npx tap test/control-plane/lease-sweep-serialization.test.js`
5. `npm run test:duplication`
6. `npm run test:metrics`
