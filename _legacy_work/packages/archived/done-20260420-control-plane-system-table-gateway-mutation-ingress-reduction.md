# Control Plane System Table Gateway Mutation Ingress Reduction

## Status

Done on 2026-04-20.

## Why

The gateway’s mutation boundary currently mixes operation normalization, merge
policy, pressure admission, readiness gating, pending visibility, and deferred
outcome shaping through a broad shared ingress. This package exists to collapse
that into one tighter mutation-ingress contract.

## Scope

1. `src/control-plane/control-plane-system-table-gateway.js`
2. `src/control-plane/control-plane-system-table-gateway-shared.js`
3. Gateway segment files that own mutation submission, deferred mutation
   shaping, or pending-visibility tracking

## Invariants

1. Mutation submission remains centralized at the gateway boundary.
2. Pressure and readiness policies remain expressed through canonical gateway
   outcomes, not caller-local reinterpretation.
3. Read-only helpers are not broadened in this package.

## Closure Criteria

1. One mutation-ingress contract remains for insert, update, upsert, and delete
   submission.
2. Duplicate mutation normalization and deferred-outcome helper fronts are
   removed.
3. Touched files stay ESLint-clean.

## Validation

1. `npx eslint` on all touched gateway files
2. `npx tap test/control-plane/control-plane-system-table-gateway.test.js`
3. `npx tap test/config/control-plane-gateway-mutation-guardrails.test.js`
4. `npx tap test/query/sql-query-engine.test-part-3.js`
5. `npm run test:duplication`
6. `npm run test:metrics`
