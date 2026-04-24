# Publication-Scoped Consistency And Node-Join Closure

## Why

The matrix-readiness grammar hardening sprint completed its planned scope and
then reran:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

That representative probe failed on a new blocker:

1. final scenario error:
   `Leader identities disagree between 7493b0ab-a054-5fad-a91b-5e331db29304 and 11601fe0-72d6-5853-8590-ec2881853e72`
2. the control snapshot contract itself shows the final consistency gate is
   still inside publication recovery:
   - `publicationConvergenceGate.ready = false`
   - `publicationStatus = OPEN`
   - `recoveryProtocolState = publication_pending`
     or `priority_spread_pending`
3. the current harness consistency gate still compares observer-local leader
   maps directly before the publication-recovery owner says the cluster is
   ready for strict leader agreement
4. the strict control-snapshot path also still allows leader inference from
   `replicaRoles` and `replicaRoleDiagnostics` when the canonical `leaders`
   map is absent

This is no longer the stale-artifact, presentation, startup checkpoint,
join-readiness grammar, or rebalancer planning-gate problem that drove the
previous sprint.
It is now a publication-scoped consistency grammar blocker:
the harness must consume one canonical publication/leader contract instead of
mixing canonical publication truth with observer-local leader fallbacks.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Split from:

1. [Matrix readiness core grammar hardening sprint](../sprints/archived/done-2026-q2-matrix-readiness-core-grammar-hardening.md)

## Dominant Blocker

`node-join-under-load` on April 23, 2026 now fails at the final consistency
gate because the harness still enforces strict leader identity before the
publication-recovery owner says publication convergence is ready.

The current evidence points at a seam between:

1. publication/member convergence truth
2. leader/partition ownership visibility across observers
3. final harness consistency verification
4. legacy leader inference from non-canonical control-snapshot fields

## In Scope

1. Reframe the final harness consistency boundary around one
   publication-scoped control-snapshot contract.
2. Make strict leader comparison depend on canonical publication-recovery
   readiness instead of observer-local timing.
3. Remove control-snapshot leader inference from `replicaRoles` and
   `replicaRoleDiagnostics` on the strict path.
4. Add focused proof and the representative `node-join-under-load` rerun
   needed to prove the fix.

## Out Of Scope

1. Reopening the matrix-readiness grammar sprint work already completed.
2. Tactical one-off scenario exemptions that leave mixed consistency logic in
   place.
3. Full harness matrix execution before this blocker is resolved or explicitly
   reclassified.

## Hotspots

1. `test/distributed/harness/assertions-segment-1.js`
2. `test/distributed/harness/assertions-segment-3.js`
3. `test/distributed/harness/__tests__/assert-consistency.test.js`
4. `test/distributed/scenarios/node-join-under-load.js`
5. `architecture/current-owner-maps.md`

## Detection / Analysis Tasks

- [x] Capture the exact partitions and nodes involved in the fresh mismatch.
- [x] Prove whether the final consistency path is comparing leaders before
      publication recovery is ready.
- [x] Identify every alternate leader-observation route still reachable on the
      strict control-snapshot path.
- [x] Decide the single allowed special case, if any, for legacy snapshots that
      predate the publication-recovery gate contract.

## Implementation Tasks

- [x] Add one canonical publication-scoped consistency comparison contract for
      both live node queries and pre-collected snapshots.
- [x] Make strict leader agreement depend on publication-recovery readiness on
      that contract.
- [x] Remove control-snapshot leader inference from `replicaRoles` and
      `replicaRoleDiagnostics` on the strict comparison path.
- [x] Rerun the representative scenario after the fix and update blocker
      movement explicitly.

## Residual Closure Inventory

- [x] The final consistency gate now uses one publication-scoped owner
      contract.
- [x] Strict leader agreement no longer runs ahead of publication-recovery
      readiness.
- [x] Control-snapshot leader comparison no longer uses alternate inference
      paths.
- [x] Focused proof is green.
- [x] The representative `node-join-under-load` rerun either passes or exposes
      the next blocker explicitly.

## Blocker Migration

The representative rerun after this package's implementation migrated from
strict leader disagreement to runtime priority-recovery convergence:

1. `failureClass = publication_convergence_blocked`
2. `dominantReason = priority_recovery_workflow_timeout_reconcile_due`
3. active priority recovery still had `serveEligible = true`
4. a critical create phase saw the target replica already active but remained
   in `CREATING`

The follow-on package is:

1. [Priority recovery readiness and workflow convergence closure](./active-20260423-priority-recovery-readiness-and-workflow-convergence-closure.md)

The current April 23 rerun still confirms this package remains closed:
publication gate readiness is `true`, there is no strict leader-mismatch
failure, and the scenario now fails later on `nodeAdmissionBlocked`.

## Validation

1. Focused owner-path tests for the chosen seam.
2. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
3. `npm run test:metrics`
