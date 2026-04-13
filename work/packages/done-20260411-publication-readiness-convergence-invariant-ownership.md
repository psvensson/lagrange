# Publication and Readiness Convergence Invariant Ownership

## Why

At least one focused rerun reaches startup and load, then fails on published
active-node disagreement during drain and verification. That means publication,
readiness, and recovery still do not share one runtime invariant once the
system is under load and repair pressure.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Convergence Ownership and Stability Sprint](../sprints/done-2026-q2-runtime-convergence-ownership-and-stability.md)

## In Scope

1. Define one convergence invariant linking published active set, readiness
   active set, and recovery cohort.
2. Ensure startup, load, drain, rebalance, and verification consume that same
   invariant instead of adjacent local truth.
3. Detect publication disagreement early and deterministically.
4. Add one owner path for repair, quarantine, or fail-fast when publication and
   readiness diverge.
5. Surface convergence-invariant evidence in harness artifacts.

## Out Of Scope

1. Replacing publication entirely with a new subsystem.
2. Scenario-specific patch logic that bypasses the invariant.
3. Feature work unrelated to convergence correctness.

## Invariants

1. Publication and readiness cannot disagree silently.
2. Recovery cohort and published active set come from one canonical invariant.
3. Divergence is detected before post-load verification becomes the first place
   that notices.

## Hotspots

1. `src/control-plane/active-node-projection.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `src/control-plane/priority-recovery-snapshot.js`
4. `test/distributed/harness/failure-bundle.js`
5. `test/distributed/scenarios/`

## Status

Closed on 2026-04-11 after the exploratory owner pass. The useful remaining
work is now carried by the active planning-snapshot simplification package
under the runtime-completion sprint, so this package no longer needs to remain
open separately.

Implemented:

1. in-flight membership publications now force authoritative membership-table
   and readiness reads when deriving the next cluster membership candidate
2. focused regression coverage now pins that authoritative-read preference

Observed outcome:

1. the previous post-load partition-split failure did not reproduce in the same
   drain/verify shape during this sprint rerun
2. `seven-node-postgres-baseline-partition-split` still fails, but now earlier
   in startup ACTIVE convergence, so the publication/readiness invariant still
   needs direct owner work after startup authority is stabilized
3. `seven-node-read-write-load-distribution` now fails on split-policy visibility
   under participant-failure pressure rather than the previous pure publication
   disagreement symptom

## Detection / Analysis Tasks

- [x] Map the current owner paths for published active set, readiness active set,
      and recovery cohort.
- [x] Identify where post-load drain and verify read a different truth than
      publication repair.
- [x] Confirm which subsystem should own convergence disagreement detection.

## Implementation Tasks

- [ ] Define one publication and readiness convergence invariant with explicit
      owner, version, and evidence.
- [x] Route publication, readiness, and recovery consumers through that
      invariant.
- [ ] Add early invariant-breach detection before post-load verify.
- [x] Add focused regression coverage for the post-load divergence family.

## Validation

1. The partition-split rerun family no longer reaches verify with disagreeing
   published active-node sets.
2. Divergence is either repaired through one owner path or failed explicitly as
   an invariant breach.
3. Publication and readiness evidence share one source in harness output.

## Done When

1. Publication and readiness convergence share one canonical invariant.
2. Post-load verification is no longer the first consumer to discover
   divergence.
3. Runtime disagreement is attributable to one owner-owned breach path.
