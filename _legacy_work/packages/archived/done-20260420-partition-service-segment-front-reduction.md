# Partition Service Segment Front Reduction

## Status

Done on 2026-04-20.

This child package executes the next highest-signal internal duplication slice
under `done-20260420-segmented-owner-internal-duplication-reduction-umbrella.md`.

## Why

The remaining top clone groups are concentrated in `partition-service`
segment/shared fronts. Those files still destructure an oversized shared bag
almost line-for-line even though each segment only uses a subset of those
dependencies. The right reduction is to trim each segment to its real
dependencies rather than creating another synthetic helper layer.

This package is complete. Each segment front now destructures only the symbols
it actually uses, and the touched files were brought into compliance with the
repo ESLint profile instead of leaving the reduction in a partially lint-broken
 state.

## Scope

1. `src/partition/partition-service-segment-1-part-1.js`
2. `src/partition/partition-service-segment-1-part-2.js`
3. `src/partition/partition-service-segment-1-part-3.js`
4. `src/partition/partition-service-segment-2-part-1.js`
5. `src/partition/partition-service-segment-2-part-2.js`
6. `src/partition/partition-service-segment-3-part-1.js`
7. `src/partition/partition-service-segment-3-part-2.js`
8. `src/partition/partition-service-segment-4-part-1.js`
9. `src/partition/partition-service-shared.js`

## Invariants

1. `PARTITION_SERVICE_SHARED` remains the only shared dependency ingress for
   the segmented owner in this package.
2. No new segmentation layers, synthetic bucket objects, or parallel helper
   bags.
3. The reduction comes from shrinking each segment to its actual dependency
   set, not from relocating the same duplicate list into another file.

## Validation

1. `npx eslint src/partition/partition-service-segment-1-part-1.js src/partition/partition-service-segment-1-part-2.js src/partition/partition-service-segment-1-part-3.js src/partition/partition-service-segment-2-part-1.js src/partition/partition-service-segment-2-part-2.js src/partition/partition-service-segment-3-part-1.js src/partition/partition-service-segment-3-part-2.js src/partition/partition-service-segment-4-part-1.js`
2. `npx tap test/partition/partition-service.test.js test/partition/partition-service-shutdown-timers.test.js test/partition/table-partition-structure.property.test.js`
3. `npm run test:duplication`
4. `npm run test:metrics`

## Outcome

1. Duplicate segment/shared fronts were collapsed across the partition owner
   without adding synthetic helper buckets or new segmentation layers.
2. The duplication ratchet moved from `30` clone groups / `2125` duplicated
   lines to `21` clone groups / `964` duplicated lines.
3. The cognitive complexity ratchet also tightened from `146` to `144`
   violations after the owner-front reduction.
