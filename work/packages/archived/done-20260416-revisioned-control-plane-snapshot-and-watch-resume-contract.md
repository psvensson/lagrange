# Revisioned Control-Plane Snapshot And Watch-Resume Contract

## Why

The control-plane snapshot owner now gives startup, readiness, admin snapshot,
and discovery one explicit observation contract. That is the right direction,
but it still lacks the next capability mature control planes rely on:

1. one monotonic revision for shared control-plane truth
2. one bounded `snapshot -> resume/watch` contract instead of repeated full
   hydration and repair-driven polling
3. one explicit stale/missed-revision outcome when a caller falls behind

Without that, bootstrap and join still depend on full snapshot hydration plus
backfill repair, and readers still need to infer whether they are seeing
fresh truth or one best-effort replay boundary.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Add one monotonic control-plane snapshot revision, observed-at timestamp,
   and resume token contract to the shared snapshot owner.
2. Define one canonical `snapshot -> resume/watch` consumer contract for
   bootstrap hydration, join/rejoin convergence, admin snapshot, and service
   discovery.
3. Make stale snapshot, missed revision, and deferred refresh outcomes
   explicit rather than caller-inferred.
4. Replace full-snapshot re-hydration and broad repair polling with targeted
   revision resume where the owner can provide it.
5. Emit harness/admin diagnostics that name the observed revision and whether
   the caller is current, stale-but-usable, or behind.

## Out Of Scope

1. A new transport or subscription framework outside the current owner and CDC
   surfaces.
2. Product-level watch APIs beyond the control-plane/runtime needs of this
   repository.
3. Broad admin UX redesign.

## Invariants

1. Every shared control-plane snapshot returned to runtime consumers must carry
   an explicit revision and freshness classification.
2. Consumers must be able to resume from explicit owner evidence instead of
   depending on repeated full bootstrap snapshots.
3. Falling behind the owner retention window must be explicit and typed, never
   silent cache drift.
4. Revision mismatch must not degrade into absence-shaped truth.

## Hotspots

1. `src/control-plane/control-plane-snapshot-owner.js`
2. `src/control-plane/authoritative-control-plane-view.js`
3. `src/admin/admin-control-snapshot.js`
4. `src/admin/admin-service-discovery.js`
5. `src/bootstrap/phases/query-system-state-phase.js`
6. `src/bootstrap/node-joining-service.js`
7. `src/bootstrap/join-readiness-evaluator.js`
8. `test/control-plane/control-plane-snapshot-owner.test.js`
9. `test/admin/admin-control-snapshot-response-contract.test.js`
10. `test/bootstrap/node-joining-service.test.js`
11. `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`

## Analysis Tasks

- [ ] Inventory every bootstrap/join/admin/discovery consumer that still
  depends on full-snapshot hydration or broad repair polling.
- [ ] Define one canonical revision source, resume token shape, and stale-gap
  classification.
- [ ] Decide the retention window and missed-revision fallback behavior for
  control-plane consumers.
- [ ] Confirm how much of the current bootstrap backfill path becomes
  revision-resume work instead of one-off repair.

## Implementation Tasks

- [ ] Add revision, observed-at, and resume metadata to control-plane snapshot
  owner results.
- [ ] Route admin snapshot and service discovery contracts through the same
  revisioned observation schema.
- [ ] Teach join/bootstrap hydration to record and resume from owner revisions
  instead of depending only on full bootstrap snapshot replacement.
- [ ] Add explicit missed-revision and stale-usable outcomes.
- [ ] Update harness diagnostics and response contracts to display revision and
  lag state directly.

## Progress Notes

1. Shared snapshot-owner results now carry `snapshotRevision`,
   `snapshotRevisionState`, `snapshotExpectedMinimumRevision`,
   `snapshotRevisionGap`, and `snapshotResumeToken`, and the direct forced
   repair path preserves that metadata instead of dropping it.
2. Join readiness now records the highest observed snapshot revision and
   surfaces explicit `behind` state when later topology metadata regresses.
3. Harness control-snapshot normalization now preserves revision metadata
   through `NodeClient`, convergence assertions, and snapshot coverage probes,
   so late failures can distinguish stale-but-usable from behind snapshots.
4. The shared snapshot owner now carries the last observed revision forward for
   control snapshot and service-discovery callers when they omit explicit
   resume state, so repeated observations become explicit `current` versus
   `behind` transitions instead of one-shot metadata.
5. Join status, admin snapshot response rows, and harness diagnostics now all
   surface the same revision, gap, and resume-token vocabulary.

## Validation

1. `node test/control-plane/control-plane-snapshot-owner.test.js`
2. `node test/admin/admin-control-snapshot-response-contract.test.js`
3. `node test/admin/admin-service-discovery.test.js`
4. `node test/bootstrap/node-joining-service.test.js`
5. `node test/distributed/harness/__tests__/node-client.test.js`
6. `node test/distributed/harness/__tests__/assertions.test.js`
7. `npm run test:distributed:boundary:transition`

## Done When

1. Shared control-plane snapshot consumers observe one revisioned owner
   contract.
2. Join/rejoin/bootstrap no longer depend only on full-snapshot replacement
   when bounded revision resume is available.
3. Missed revision and stale-but-usable states are explicit in admin and
   harness artifacts.
4. Any remaining snapshot/readiness failures are no longer caused by lack of a
   revisioned owner contract.
