# Admin Control Snapshot Follow-On Cognitive-Complexity Reduction

## Why

The initial admin sprint slice safely reduced discovery/preflight hotspots and
tightened the ratchets, but `src/admin/admin-control-snapshot.js` still
contains the largest remaining admin hotspot cluster.

That file is already carrying substantial local edits, so it needs its own
bounded follow-on package instead of being mixed into the completed discovery
slice.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reduce the remaining cognitive-complexity hotspots in
   `src/admin/admin-control-snapshot.js`
2. Add targeted regressions for any touched control-snapshot owner paths
3. Preserve the tightened cognitive and duplication ratchets

## Out Of Scope

1. Additional `admin-service-discovery.js` refactors unless required by a
   direct control-snapshot dependency
2. Query/partition/control-plane hotspot work outside control snapshot
3. Broad duplication work outside touched admin files

## Validation

1. Targeted admin unit tests for touched snapshot paths
2. `npm run test:metrics`

## Done When

1. The remaining control-snapshot hotspot family is reduced without introducing
   parallel state models
2. `npm run test:metrics` stays green on the tightened baselines
