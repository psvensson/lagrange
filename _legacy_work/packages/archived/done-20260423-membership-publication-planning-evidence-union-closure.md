# Membership Publication Planning Evidence Union Closure

## Why

The latest `node-join-under-load` representative run on April 23, 2026 moved
past priority transition row-shape persistence and exposed a publication-owner
evidence gap:

1. the failure summary still reported priority partitions blocked at
   `readyDistinctNodeCount = 2`
2. the final topology snapshot showed fresh service rows where
   `control_plane_publications-p1` and `replica_operations-p1` were already
   spread across three active nodes
3. publication planning can currently stop at a successful authoritative read
   and skip fresher cache-projection rows

That is a grammar defect. Membership publication planning needs one canonical
evidence snapshot. It must not choose between authoritative and projected
metadata as alternate routes when both are owner-owned observations of the same
topology tables.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## Dominant Blocker

`node-join-under-load` now blocks with:

1. `failureClass = publication_convergence_blocked`
2. `dominantReason = priority_recovery_operation_scheduling_event_driven`
3. `priorityRecovery.progressClass = eligible_but_no_operation_created`
4. stale publication priority spread metadata for partitions that have fresher
   service-row evidence in the final snapshot

## In Scope

1. Define membership publication planning evidence as a merge of compatible
   topology table observations for planning reads.
2. Keep diagnostics reads strict where they explicitly require authoritative
   owner RPC behavior.
3. Add failing proof where stale authoritative service rows are advanced by
   fresher cache-projection service rows.
4. Preserve the publication owner as the only place that refreshes durable
   priority spread summaries.

## Out Of Scope

1. A new metadata read subsystem.
2. Harness-side correction of stale publication summaries.
3. Full harness matrix execution before the sprint work packages are complete.

## Shared Boundary Contract

- Semantic owner:
  `MembershipPublicationCoordinator` planning snapshot construction.
- Canonical contract:
  planning reads for membership publication build one evidence union for
  topology tables with stable primary keys, selecting the freshest row per key.
- Allowed consumers:
  membership publication candidate derivation, metadata-only publication
  refresh, readiness-triggered publication reconciliation, and focused tests.
- Prohibited reinterpretations:
  caller-local fallback from authoritative rows to cache rows, diagnostics
  rewriting publication summaries, or treating projection evidence as a second
  planning route.
- Primary diagnostics / proof:
  membership publication coordinator tests, owner-map documentation, focused
  publication/rebalancer suites, metrics, and the later representative harness
  rerun at sprint level.

## Progress Grammar

1. `fresh` means the selected row has the highest observed freshness value for
   its stable key.
2. `merged` means authoritative and projection rows were normalized into one
   row set before planning.
3. `deferred` means no compatible owner-owned evidence source is available.
4. `ready` means derived priority spread summary is satisfied from the merged
   evidence snapshot.
5. `blocked` means merged evidence still proves a priority partition spread
   gap.

## Hotspots

1. `src/control-plane/membership-publication-coordinator.js`
2. `src/control-plane/membership-publication-planning.js`
3. `src/control-plane/system-row-normalizers.js`
4. `test/control-plane/membership-publication-coordinator-tail-more-test-cases.js`
5. `architecture/current-owner-maps.md`

## Detection / Analysis Tasks

- [x] Prove a successful but stale authoritative services read currently hides
      fresher projection service rows from publication planning.
- [x] Prove the canonical derivation already computes the correct priority
      summary when fresh service rows are present.
- [x] Identify which tables have stable planning primary keys and may be
      merged safely.

## Implementation Tasks

- [x] Add one focused membership publication test for stale authoritative rows
      plus fresher projection rows.
- [x] Add one planning evidence merge helper owned by the publication
      coordinator.
- [x] Use the merge only for planning reads of key-stable topology tables.
- [x] Keep diagnostics and strict authoritative publication reads on their
      existing contracts.
- [x] Update owner-map documentation if the boundary is materially sharper.

## Residual Closure Inventory

- [x] Owner-path cutover: planning snapshot table reads use the canonical
      evidence union where safe.
- [x] Tail consumers: candidate derivation and metadata-only publication
      refresh consume the merged snapshot without local fallbacks.
- [x] Diagnostics/reporting: no harness or readiness read repairs stale
      priority summaries outside the publication owner.
- [x] Superseded path: successful authoritative planning reads no longer
      suppress fresher projection evidence for mergeable topology tables.
- [x] Proof: focused coordinator test, focused publication suite, metrics, and
      sprint-level representative harness rerun after all packages complete.

## Progress Notes

1. Added the stale-authoritative/fresher-projection regression to
   `membership-publication-coordinator.test.js` coverage.
2. Added a coordinator-owned planning evidence union for key-stable topology
   tables.
3. Focused proof run:
   `npx tap test/control-plane/membership-publication-coordinator.test.js --grep "merges stale authoritative"`.
4. Remaining proof is the package-level focused suite, metrics, and sprint
   representative harness rerun after all packages are implemented.
5. Fresh representative rerun after publication recovery gate summary
   authority closure still failed with durable summary blocked on
   `sql_transactions-p1` while replayed runtime derivation reported
   `steady_published`, satisfied priority spread, and no blocked partitions.
   This package remains the active owner for that durable publication
   evidence-refresh blocker.
6. Full focused validation, metrics, and the representative April 23 rerun
   now confirm that stale durable planning evidence is no longer the dominant
   blocker. Publication gate readiness is `true`, and blocked or unresolved
   priority partitions are `0`.

## Validation

1. `npx tap test/control-plane/membership-publication-coordinator.test.js`
2. Expanded focused recovery/readiness/rebalancer/publication suite from the
   sprint.
3. `npm run test:metrics`
4. Sprint-level `node-join-under-load` rerun after all work packages are
   implemented.

## Done When

1. Publication planning recomputes priority spread from one merged owner-owned
   evidence snapshot.
2. Stale authoritative service rows cannot keep a durable priority spread
   summary blocked when fresher projection rows prove progress.
3. No diagnostics or harness alternate route is needed to repair publication
   metadata.
