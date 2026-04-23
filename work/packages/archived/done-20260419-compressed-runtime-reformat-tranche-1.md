# Compressed Runtime Reformat Tranche 1

## Status

Complete on 2026-04-19.

## Why

Several runtime files are harder to work on because imports, constant-owner
declarations, and helper bodies are visibly compressed instead of following
normal repo formatting. That blocks safe review even when the underlying logic
is not large.

This first housekeeping slice takes the smallest confirmed compressed runtime
files first so the repo gets an immediate readability win without mixing in
larger boundary extraction.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reformat the following files into normal repo style without semantic
   change:
   `src/control-plane/pressure-governor.js`
   `src/bootstrap/owners/service-registration-visibility-owner.js`
   `src/runtime/native-js-driver.js`
   `src/rebalancer/storage-admission-service.js`
2. Restore readable import blocks, constant-owner declarations, and helper
   layout.
3. Keep the pass behavior-preserving and avoid structural redesign.

## Out Of Scope

1. Larger owner extraction or lifecycle redesign
2. Any `>1500` line decomposition work
3. Broader compressed-file cleanup outside this tranche

## Invariants

1. No runtime behavior change.
2. The touched files must end the package in readable, consistently formatted
   shape.
3. The pass must not introduce new domain literals or boundary contract drift.

## Validation

1. `npm test -- test/control-plane/pressure-governor.test.js`
2. `npm test -- test/runtime/native-js-driver.test.js test/runtime/native-js-driver-lifecycle.test.js test/runtime/native-js-driver.property.test.js`
3. `npm test -- test/rebalancer/storage-admission-service.test.js`
4. `npm run test:metrics`

## Residual Closure Inventory

- [x] `pressure-governor.js` is readable and no longer compressed.
- [x] `service-registration-visibility-owner.js` is readable and no longer
      compressed.
- [x] `native-js-driver.js` is readable and no longer compressed.
- [x] `storage-admission-service.js` is readable and no longer compressed.
- [x] Focused runtime-owner tests stay green.
