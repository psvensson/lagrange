# Control-Plane and Transport Cognitive-Complexity Reduction

## Why

The current report shows concentrated remaining complexity in control-plane and
transport owners, especially readiness and message routing.

These files sit on correctness-sensitive decision boundaries, so complexity
reduction here should be explicitly coupled to clearer adjudication paths.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reduce cognitive complexity in `src/control-plane/control-plane-readiness-service.js`
2. Reduce cognitive complexity in `src/transport/message-router.js`
3. Reduce directly related helper hotspots only where needed to preserve one
   owner path

## Out Of Scope

1. Broad transport redesign
2. Startup/publication feature work outside the touched owner paths
3. Duplication cleanup outside the directly touched files

## Invariants

1. Readiness and routing outcomes must still emit one canonical result and
   reasons.
2. Refactors must not introduce fallback paths or owner bypasses.
3. Focused control-plane/transport suites and `npm run test:metrics` must pass.

## Hotspots

1. `src/control-plane/control-plane-readiness-service.js`
2. `src/transport/message-router.js`

## Notes

1. The `src/transport/node-address-resolution.js` helper hotspot was reduced in
   [Node address resolution complexity reduction](done-20260413-node-address-resolution-complexity-reduction.md).
2. This package now focuses on the remaining readiness and message-router
   owners.

## Detection / Analysis Tasks

- [ ] Identify the top violating functions in readiness and routing.
- [ ] Classify each hotspot by decision-table need, snapshot need, or
      normalization/action separation.
- [ ] Define the smallest safe refactor slices.

## Implementation Tasks

- [ ] Refactor the highest-complexity functions first.
- [ ] Add focused regressions for readiness/routing owner behavior.
- [ ] Re-run the metrics and preserve zero cycles.

## Validation

1. Targeted control-plane tests
2. Targeted transport tests
3. `npm run test:metrics`

## Done When

1. The touched readiness and transport owners have measurably lower complexity.
2. Zero circular dependencies remain preserved.
3. Any remaining unresolved hotspots are split into a successor package.
