# Admin Discovery and Preflight Cognitive-Complexity Reduction

## Why

The first sprint slice needed a safe admin entry point that would materially
reduce hotspot counts without colliding with the existing heavy local edits in
`admin-control-snapshot.js`.

This package therefore landed the bounded admin discovery and preflight work
first, then split the remaining control-snapshot hotspot family into follow-on
work.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reduce cognitive-complexity hotspots in
   `src/admin/admin-service-discovery.js`
2. Reduce the preflight discovery hotspot in
   `src/admin/admin-preflight-snapshot.js`
3. Tighten metrics baselines only after validation passes

## Out Of Scope

1. Remaining `src/admin/admin-control-snapshot.js` hotspot cleanup
2. Query/partition/runtime refactors outside direct admin collaborators
3. Broad duplication work outside the touched admin owners

## Invariants

1. Admin observation stays read-only unless an existing owner already owns the
   mutation path.
2. Snapshot and discovery consumers must not recreate parallel truth models.
3. Focused admin suites and `npm run test:metrics` must pass.

## Hotspots

1. `src/admin/admin-service-discovery.js`
2. `src/admin/admin-preflight-snapshot.js`

## Detection / Analysis Tasks

- [x] Identify the top reported functions in the admin discovery/preflight
      files.
- [x] Classify each hotspot as owner confusion, branch pile, or mixed
      normalization/action flow.
- [x] Define the minimal owner-path refactor slices.

## Implementation Tasks

- [x] Refactor one hotspot function at a time into explicit snapshots/state
      tables or smaller owner-routed helpers.
- [x] Add targeted regressions for the touched admin owner paths.
- [x] Re-run the cognitive and duplication metrics for the touched area.

## Validation

1. `node --test test/admin/admin-preflight-snapshot.test.js test/admin/admin-service-discovery.test.js`
2. `npm run test:metrics`

## Done When

1. The targeted admin hotspot functions are simplified without parallel paths.
2. The cognitive-complexity report count drops measurably.
3. Follow-on admin work, if any, is split into a new package.

## Result

1. Reduced the preflight discovery summary branch pile in
   `src/admin/admin-preflight-snapshot.js` into explicit helper stages.
2. Reduced multiple discovery-owner hotspots in
   `src/admin/admin-service-discovery.js`, including replica-operation
   degradation, authoritative read request/error normalization, and readiness
   reason assembly.
3. Added focused regressions in
   `test/admin/admin-preflight-snapshot.test.js` and
   `test/admin/admin-service-discovery.test.js`.
4. Tightened the ratchets after validation:
   cognitive baseline `150 -> 149`
   duplication baseline `21 -> 20` clone groups and `648 -> 622` duplicated
   lines.
5. Split remaining `admin-control-snapshot.js` work into
   `todo-20260413-admin-control-snapshot-follow-on-cognitive-complexity-reduction.md`.
