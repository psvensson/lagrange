# Control Plane System Table Gateway Cache Reconcile And Visibility Reduction

## Status

Done on 2026-04-20.

## Why

The gateway boundary also owns cache reconcile intent, delete policy,
visibility-state shaping, canonical row comparison, and read-repair related
helpers. Those concerns should be modeled as one smaller owner surface instead
of repeated same-owner helper fronts.

## Scope

1. `src/control-plane/control-plane-system-table-gateway-shared.js`
2. Gateway segment files that own cache reconcile intent or visibility state
3. Direct consumers that rely on the canonical row or visibility contract

## Invariants

1. Cache reconcile and visibility semantics remain owned by the gateway
   boundary.
2. Canonical row normalization and visibility state are not redefined by
   downstream callers.
3. Read and mutation ingress semantics are only touched when required to delete
   duplicated helper fronts.

## Closure Criteria

1. One canonical reconcile/visibility contract remains.
2. Repeated same-owner row comparison, visibility, and reconcile helper fronts
   are removed.
3. Touched files stay ESLint-clean.

## Validation

1. `npx eslint` on all touched gateway files
2. `npx tap test/control-plane/control-plane-system-table-gateway.test.js`
3. `npx tap test/control-plane/authoritative-node-evidence-reconciler.test.js`
4. `npx tap test/control-plane/control-plane-readiness-service.test.js`
5. `npm run test:duplication`
6. `npm run test:metrics`
