# Runtime Duplication Hotspot Consolidation

## Why

The duplication report for `src/` and `scripts/` surfaces clear clusters in
runtime owners where similar logic still lives in parallel files.

This package targets the runtime duplication clusters before script cleanup so
the owner-path opportunities are handled first.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Duplicate logic in `src/cache/system-table-cache.js`
2. Duplicate logic across `src/partition/partition-sql-parser.js` and
   `src/partition/partition-cdc-generator.js`
3. Duplicate logic across paired service adapter files where the semantic owner
   can be shared safely

## Out Of Scope

1. Test-only duplication cleanup
2. Purely cosmetic extraction with no owner/semantic benefit
3. Metric tooling changes

## Invariants

1. Shared logic must still have one clear semantic owner.
2. Refactors must not increase cognitive complexity while removing duplication.
3. `npm run test:metrics` must pass after each slice.

## Hotspots

1. `src/cache/system-table-cache.js`
2. `src/partition/partition-sql-parser.js`
3. `src/partition/partition-cdc-generator.js`
4. `src/service/adapters/partition-service-adapter.js`
5. `src/service/adapters/message-group-service-adapter.js`

## Detection / Analysis Tasks

- [x] Classify each duplicate cluster as shared-owner extraction,
      same-file consolidation, or keep-as-is with explicit justification.
- [x] Identify the canonical owner for each duplicated concern.
- [x] Define the safest rollout order.

## Implementation Tasks

- [x] Collapse the partition parser/generator duplication where semantics
      align.
- [x] Collapse cache and adapter duplication without creating parallel utility
      layers.
- [x] Re-run duplication metrics and capture the delta.

## Outcome

1. Collapsed the paired service-adapter duplication behind
   `src/service/adapters/hook-backed-service-adapter.js`.
2. Moved the partition CDC generator’s literal SQL parsing paths onto the
   existing parser owner while preserving the generator’s tested public
   surface.
3. Reduced repo-owned duplication to `12` clone groups and `307` duplicated
   lines, then tightened the duplication ratchet to those values.

## Validation

1. `npm test -- test/service/adapters/adapter-conformance.test.js`
2. `npm test -- test/partition/partition-cdc-generator.test.js test/partition/partition-sql-parser.test.js`
3. `npm run test:metrics`

## Done When

1. The package reduces the `src/` + `scripts/` duplication baseline.
2. The extracted/shared logic has one clear owner.
3. Remaining duplication, if any, is split into a narrower successor package.
