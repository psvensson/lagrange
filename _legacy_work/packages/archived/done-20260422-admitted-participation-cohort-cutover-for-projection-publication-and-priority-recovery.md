# Admitted Participation Cohort Cutover For Projection, Publication, And Priority Recovery

## Why

The first cluster-incarnation fence slice can stop stale or duplicate durable
rejoin and reintegration from creating new bad state, but it does not by
itself cut every downstream consumer over to one admitted cohort.

Today the remaining downstream consumers can still rebuild active membership
from:

1. `controlPlaneRecoveryEligible`
2. projected-serving fallbacks
3. published membership
4. recovery-active participation

That is still too much local truth once admission and incarnation fencing
exist.

This package turns the new admission-bearing evidence into the cohort consumed
by:

1. startup authority
2. active-node projection
3. membership publication planning
4. priority-recovery planning and diagnostics

The goal is to extend existing owners, not create another admission layer in
parallel.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Predecessor package:

1. [Cluster-incarnation fence and existing-owner admission cutover](./done-20260422-cluster-incarnation-fence-and-existing-owner-admission-cutover.md)

## In Scope

1. Extend `participationByNodeId` and related lifecycle summaries with
   admission and incarnation-fence evidence.
2. Make `StartupAuthoritySnapshot` derive `canonicalStartupNodeIds` from the
   admitted participation cohort instead of raw recovery-active projection.
3. Make active-node projection and membership-publication planning consume the
   admitted cohort instead of independently trusting
   `controlPlaneRecoveryEligible`, projected-serving fallback, or published
   membership alone.
4. Cut priority-recovery planning and diagnostics over to the admitted cohort
   on the touched path.
5. Delete touched local cohort reconstruction once the admitted path is
   canonical.

## Out Of Scope

1. Pre-cluster durable-rejoin selection and reintegration gating already owned
   by the predecessor package
2. Broad harness/reporting cutover outside the touched admitted-cohort path
3. New scenario reruns before focused proof is complete

## Invariants

1. Existing readiness, startup-authority, lifecycle, and recovery-protocol
   owners remain the canonical surfaces.
2. Downstream cohort consumers must not bypass admission and incarnation-fence
   evidence with raw recovery eligibility or published membership alone.
3. Diagnostics must show admitted-versus-observed participation explicitly
   instead of hiding the distinction in local booleans.

## Hotspots

1. `src/control-plane/recovery-protocol-snapshot.js`
2. `src/control-plane/membership-lifecycle-constants.js`
3. `src/control-plane/startup-authority-snapshot-owner.js`
4. `src/control-plane/active-node-projection.js`
5. `src/control-plane/membership-publication-planning.js`
6. `src/control-plane/priority-recovery-snapshot.js`
7. `src/control-plane/control-plane-readiness-service-segment-4.js`

## Shared Boundary Contract

- Semantic owner:
  existing readiness, startup-authority, lifecycle, and recovery-protocol
  owners after admission/incarnation evidence becomes part of their canonical
  participation vocabulary
- Canonical contract shape / vocabulary:
  extended lifecycle participation and startup-authority surfaces carrying one
  admitted participation answer plus one incarnation-fence state
- Allowed consumers:
  active-node projection, membership publication planning, priority-recovery
  planning/diagnostics, bootstrap cluster view, and join readiness
- Prohibited reinterpretations:
  rebuilding the admitted cohort from raw recovery-eligible projection,
  projected-serving fallback, or published membership without consulting the
  canonical participation/admission evidence

## Detection / Analysis Tasks

- [x] Inventory every touched cohort consumer still using raw
      `controlPlaneRecoveryEligible`, projected-serving fallback, or published
      membership as sufficient truth.
- [x] Trace where startup-authority and priority-recovery still derive active
      node ids directly from recovery-active projection rather than admitted
      participation.

## Implementation Tasks

- [x] Add or extend failing tests first for admitted participation in
      lifecycle, startup-authority, projection, publication planning, and
      priority-recovery snapshots.
- [x] Extend participation and lifecycle summaries with admission/incarnation
      evidence.
- [x] Cut `StartupAuthoritySnapshot` over to the admitted participation cohort.
- [x] Cut active-node projection and membership-publication planning over to
      the admitted participation cohort.
- [x] Delete touched local cohort fallback logic on the cut-over path.
- [x] Update [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
      in the same work cycle if the contract changes durably.

## Execution Notes

1. Extended canonical participation/recovery-protocol surfaces with
   admission-bearing evidence and cut startup authority, active-node
   projection, membership publication planning, and priority recovery over to
   the admitted cohort.
2. Removed the touched local active-cohort reconstruction paths that still
   trusted raw recovery eligibility or published membership alone.
3. Focused proof is green:
   - `npx tap test/control-plane/recovery-protocol-snapshot.test.js test/control-plane/startup-authority-snapshot.test.js`
   - `npx tap test/control-plane/active-node-projection.test.js test/control-plane/membership-publication-coordinator.test.js`
   - `npx tap test/control-plane/priority-recovery-snapshot.test.js test/bootstrap/join-readiness-startup-authority.test.js`
4. `npm run test:metrics` is currently red in the dirty worktree because the
   repo-wide cognitive-complexity ratchet is set to `144` while the current
   worktree reports `147` violations.

## Validation

1. `npx tap test/control-plane/recovery-protocol-snapshot.test.js test/control-plane/startup-authority-snapshot.test.js`
2. `npx tap test/control-plane/active-node-projection.test.js test/control-plane/membership-publication-coordinator.test.js`
3. `npx tap test/control-plane/priority-recovery-snapshot.test.js test/bootstrap/join-readiness-startup-authority.test.js`
4. `npm run test:metrics`

## Done When

1. Startup authority, projection, publication planning, and priority recovery
   consume one admitted cohort.
2. Touched downstream consumers no longer infer active membership directly from
   raw recovery eligibility or stale published membership.
3. Focused non-harness proof is green and any remaining residual is split
   explicitly.
