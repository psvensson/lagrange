# Active Membership And Recovery Cohort Unification

## Why

The same active-membership and recovery-cohort decisions were being derived in
projection, publication, readiness, admin, and bootstrap surfaces.

That made it possible for each local consumer to be internally coherent while
the system as a whole disagreed about who counted.

## Scope Basis

Phase 0.1 roadmap scope: control-plane correctness, rebalancing stability, and
failure-simulation robustness.

## In Scope

1. Define one canonical active-membership snapshot.
2. Define one canonical recovery cohort derived from that snapshot.
3. Make publication, readiness, admin, and bootstrap consume the snapshot
   instead of rebuilding adjacent truth.

## Out Of Scope

1. Priority admission unification.
2. Operation progression ingress collapse.
3. Transport late-response lifecycle cleanup.

## Invariants

1. Published membership remains steady-state authority when available.
2. Recovery-only projections may explain and defer, but must not create
   correctness drift across consumers.
3. Diagnostics must report the same cohort the runtime is using.

## Hotspots

1. `src/control-plane/active-node-projection.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `src/control-plane/control-plane-readiness-service.js`
4. `src/control-plane/priority-recovery-snapshot.js`
5. `src/admin/admin-control-snapshot.js`
6. `src/bootstrap/owners/bootstrap-cluster-view-owner.js`

## Implementation Tasks

- [x] Move recovery-cohort snapshot ownership into
      `src/control-plane/active-node-projection.js`.
- [x] Route membership publication, readiness, and admin consumers through the
      canonical active-membership snapshot owner.
- [x] Route bootstrap consumers through the same snapshot path.
- [x] Remove remaining publication/readiness/admin extraction code that only
      reshapes snapshot fields.
- [x] Tighten tests so the active-membership owner remains the only place that
      computes recovery cohorts.

## Outcome

Completed as the shared-cohort simplification batch. The remaining five-node
failures still show a larger publication/readiness/recovery coupling problem,
but that problem now sits above a shared cohort model instead of behind several
parallel cohort calculators.

## Validation

- [x] Active-node projection tests
- [x] Membership-publication coordinator tests
- [x] Control-plane readiness tests
- [x] Admin-control snapshot tests
- [x] Bootstrap readiness / bootstrap API tests
- [x] Partial distributed verification completed; residual publication and
      recovery deadlocks moved to the recovery-architecture sprint

## Done When

1. Active-membership and recovery cohort are owned by one canonical snapshot.
2. Publication, readiness, admin, and bootstrap consume that snapshot instead
   of rebuilding parallel verdicts.
3. Recovery diagnostics and runtime behavior align on the same node set.
4. Remaining system-level recovery failures, if any, are tracked separately.
