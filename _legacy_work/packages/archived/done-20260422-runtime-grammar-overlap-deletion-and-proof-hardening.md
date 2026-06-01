# Runtime-Grammar Overlap Deletion And Proof Hardening

## Why

The hierarchy sprint does not close by adding a cleaner path beside the old
one. It closes only when the touched overlapping grammar is deleted and the
pilot slice is proved end to end.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Runtime grammar hierarchy and actuation closure sprint](../../sprints/archived/done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

## In Scope

1. Delete touched overlapping grammar on the pilot slice.
2. Remove touched local reinterpretations made obsolete by the hierarchy.
3. Run focused proof for owner path, decision path, and consumer path.
4. Split deferred harness confirmation out cleanly once the implementation
   packages are structurally coherent.

## Out Of Scope

1. Repo-wide cleanup outside the touched pilot slice
2. Broad unrelated complexity reduction

## Hotspots

1. Touched priority-recovery runtime files
2. Touched admin/harness consumers
3. `architecture/current-owner-maps.md`
4. `architecture/runtime-grammar-hierarchy.md`

## Validation

1. Focused owner-path tests
2. Focused snapshot and consumer tests
3. Deferred `node-join-under-load` confirmation package
4. `npm run test:metrics`

## Execution Notes

1. Deleted the touched report-local reinterpretation path by making admin and
   harness consumers render the shared hierarchy contracts directly.
2. Hardened focused proof across snapshot, admin, and harness-unit suites
   after the actuation and pressure cutovers landed.
3. Separated the deferred harness rerun into its own follow-on package to
   honor the explicit instruction that no further harness run should happen
   until the implementation packages were complete.

## Done When

1. The pilot slice no longer carries parallel touched grammar.
2. Deferred harness confirmation is isolated from the implementation package
   and will test a narrowed runtime defect, not a grammar hole.
