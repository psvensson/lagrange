# Cluster-Incarnation Fence And Existing-Owner Admission Cutover

## Status

Closed on 2026-04-23 after focused proof and the downstream admitted-cohort
cutover also landed.

This package was kept open too long, and its old `active-...` status suggested
the admission/incarnation seam was still on the critical path. The latest
2026-04-23 rerun no longer points there. The current blocker is later on the
priority-recovery runtime path, not at durable-rejoin or reintegration
admission.

This package is a closed incarnation-fence slice unless a later rerun shows
the surviving blocker is actually caused by stale admission/incarnation state
again.

## Why

The successor middle-layer sprint already isolates startup checkpoints, join
readiness, and rebalancer admission. The remaining blocker is not that the
code lacks owners. It is that durable rejoin, reintegration, readiness, and
startup authority can still make a node effectively active through partially
independent paths.

The latest focused evidence points at one concrete seam:

1. a duplicate or stale node incarnation can pass durable rejoin or
   reintegration logic
2. that node then appears in startup/publication/projection cohorts
3. priority-recovery planning treats that cohort as real

The important design constraint is to avoid building another parallel
admission system. Existing owners already exist for:

1. per-node readiness and runtime authority
2. startup authority
3. membership lifecycle and participation
4. recovery protocol observation

What is missing is one narrow incarnation fence and one admitted/not-admitted
answer carried through those existing owners.

This package therefore focuses on the first executable slice:

1. add a narrow `ClusterIncarnationFence`
2. thread it through durable rejoin and reintegration
3. extend existing readiness/startup-authority surfaces with admission-bearing
   evidence instead of creating a new top-level owner beside them

That slice is now landed. The remaining value in this document is to record
the exact boundary that was fixed and to make clear that current unresolved
runtime blockers are elsewhere.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

## In Scope

1. Define one narrow `ClusterIncarnationFence` that durable rejoin must
   satisfy before it can bypass fresh-join startup.
2. Extend the existing per-node readiness/runtime-authority and
   `StartupAuthoritySnapshot` surfaces with admission and incarnation-fence
   evidence instead of creating a parallel top-level node-admission owner.
3. Make durable rejoin reuse in `rejoin-hints` and
   `NodeRegistrationOwner` consume the incarnation fence.
4. Make node reintegration stop marking nodes `ACTIVE` through a local
   lifecycle flip when the shared admission/fence answer is blocked.
5. Add the admission-bearing evidence needed by the sequenced admitted-cohort
   cutover package.

## Out Of Scope

1. A brand-new `NodeAdmissionOwner` or parallel admission snapshot surface
   beside readiness and startup authority
2. Full projection/publication/priority-recovery cohort cutover beyond the
   sequenced follow-on package
3. Rebalancer lane admission or planner/coordinator seam redesign
4. Broad operator UX redesign outside the touched admission vocabulary
5. New harness reruns before focused proof is complete

## Invariants

1. A node must not count as admitted, publish-ready, or runtime-ready before
   the existing shared owners say it is admitted.
2. Durable rejoin must not rely only on node identity and peer-address hints.
   It must pass the cluster-incarnation fence.
3. A node that fails the incarnation fence must re-enter explicit fresh-start
   logic instead of drifting through partially-restored rejoin state.
4. Reintegration must not mark a node `ACTIVE` through a local lifecycle flip
   when the shared admission/fence answer says it is blocked.
5. Existing readiness, startup-authority, lifecycle, and recovery-protocol
   owners remain canonical. This package extends them; it does not fork them.

## Hotspots

1. `src/bootstrap/rejoin-hints.js`
2. `src/bootstrap/shared/node-registration-owner.js`
3. `src/node/node-reintegration-service.js`
4. `src/control-plane/startup-authority-snapshot-owner.js`
5. `src/control-plane/control-plane-readiness-service-segment-2.js`
6. `src/control-plane/control-plane-readiness-service-segment-3.js`
7. `src/bootstrap/join-readiness-evaluator.js`
8. `src/bootstrap/owners/bootstrap-cluster-view-owner.js`

## Shared Boundary Contract

- Semantic owner:
  one narrow cluster-incarnation fence plus the existing readiness,
  startup-authority, and reintegration owners after they carry admission
  evidence
- Canonical contract shape / vocabulary:
  `ClusterIncarnationFence { state, reasonCodes, clusterIncarnationId, localIdentityState, durableMembershipState, peerProofState }`
  plus
  admission-bearing extensions on the existing runtime-authority and
  startup-authority snapshots
- Allowed consumers:
  entrypoint startup-mode selection, `NodeRegistrationOwner`,
  `NodeReintegrationService`, `JoinReadinessEvaluator`,
  bootstrap cluster view, startup recovery, and the sequenced admitted-cohort
  cutover package
- Prohibited reinterpretations:
  peer-address-only rejoin decisions, durable-identity-only rejoin reuse, or
  marking a node `ACTIVE` / startup-authority ready before the shared
  admission-bearing owners allow it
- Primary diagnostics / proof surfaces:
  focused bootstrap/join/rejoin tests, startup-authority tests, reintegration
  tests, and the sequenced admitted-cohort package proof before any harness
  rerun

## Detection / Analysis Tasks

- [x] Inventory every path where durable rejoin is selected without an
      explicit cluster-incarnation proof.
- [x] Inventory every path where a node becomes `ACTIVE` or startup-authority
      ready without shared admission/fence evidence.
- [x] Trace which existing readiness/startup-authority fields can carry the
      admission/fence answer without creating a parallel top-level owner.

## Implementation Tasks

- [x] Add characterization tests first for durable rejoin, reintegration, and
      startup-authority outcomes that should fail when the incarnation fence is
      not satisfied.
- [x] Introduce the narrow `ClusterIncarnationFence`.
- [x] Cut auto-rejoin selection over to the cluster-incarnation fence before
      durable rejoin can proceed.
- [x] Make `NodeRegistrationOwner` durable rejoin reuse consume the fence
      result instead of identity/address evidence alone.
- [x] Extend existing readiness/runtime-authority and startup-authority
      snapshots with admission-bearing evidence needed on the touched path.
- [x] Delete touched lifecycle bypass paths, especially reintegration-to-active
      without shared admission/fence approval.
- [x] Update [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
      in the same work cycle if the admission boundary changes durably.

## Residual Closure Inventory

- [x] Durable rejoin selection consumes the cluster-incarnation fence.
- [x] Reintegration stops using a local `ACTIVE` lifecycle flip when blocked by
      the shared admission/fence answer.
- [x] Existing readiness and startup-authority owners expose the admission
      evidence needed by touched consumers.
- [x] The downstream admitted-cohort cutover is split explicitly to
      [Admitted participation cohort cutover for projection, publication, and priority recovery](./done-20260422-admitted-participation-cohort-cutover-for-projection-publication-and-priority-recovery.md).
- [x] Superseded local admission predicates and rejoin heuristics are deleted
      on the touched path.
- [x] Required focused proof layers are complete.

## Execution Notes

1. Added the narrow `ClusterIncarnationFence` and threaded it through
   durable-rejoin startup selection, join registration reuse, and
   reintegration gating on the existing owner path.
2. Preserved the shared readiness/startup-authority authority surface instead
   of creating a parallel node-admission subsystem.
3. Fixed the final join-registration seam by passing the already-resolved
   `clusterIncarnationFence` into `QuerySystemStatePhase` so durable-rejoin
   registration no longer re-derives fence state from the local data dir.
4. Focused proof is green:
   - `npx tap test/bootstrap/rejoin-hints.test.js test/bootstrap/register-node-in-cluster.test.js`
   - `npx tap test/node/node-reintegration-service.test.js test/control-plane/startup-authority-snapshot.test.js`
   - `npx tap test/bootstrap/join-readiness-startup-authority.test.js test/control-plane/control-plane-readiness-service.test-part-5.js test/control-plane/control-plane-readiness-service.test-part-6.js`
5. The downstream admitted-participation cohort cutover is also landed, so
   the admission/incarnation handoff this package opened is no longer pending
   in another still-open cohort package.
6. The latest 2026-04-23 runtime confirmation did not name a new blocker at
   this seam. Current unresolved work remains on rebalancer scheduling under
   pressure and on the separate workflow-owner path.
7. `npm run test:metrics` is currently red in the dirty worktree because the
   repo-wide cognitive-complexity ratchet is set to `144` while the current
   worktree reports `147` violations.

## Validation

1. `npx tap test/bootstrap/rejoin-hints.test.js test/bootstrap/register-node-in-cluster.test.js`
2. `npx tap test/node/node-reintegration-service.test.js test/control-plane/startup-authority-snapshot.test.js`
3. `npx tap test/bootstrap/join-readiness-startup-authority.test.js test/control-plane/control-plane-readiness-service.test-part-5.js test/control-plane/control-plane-readiness-service.test-part-6.js`
4. `npm run test:metrics`

## Done When

1. Auto-rejoin selection uses the cluster-incarnation fence rather than hints
   and peer reachability alone.
2. Durable rejoin reuse and reintegration no longer bypass the shared
   admission/fence answer through local lifecycle flips.
3. Existing readiness and startup-authority owners expose the admission-bearing
   evidence needed on the touched path, and the admitted-cohort successor is
   already landed.
4. No current scenario evidence points at an unresolved admission/incarnation
   seam inside this package.
5. The package is closed and any new blocker at this boundary would require a
   new follow-on package instead of reopening this one implicitly.
