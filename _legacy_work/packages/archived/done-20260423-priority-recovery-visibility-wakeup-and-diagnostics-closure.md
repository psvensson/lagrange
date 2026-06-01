# Priority Recovery Visibility Wakeup And Diagnostics Closure

## Why

The latest harness artifacts show two related visibility problems:

1. final service rows can satisfy priority spread before every operation has a
   clean terminal presentation
2. the failure bundle can still report `eligible_but_no_operation_created` and
   `operationIds = []` while final snapshots contain relevant operation rows

Publication planning and harness diagnostics must consume the same canonical
owner evidence rather than creating parallel interpretations of priority
recovery progress.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Confirm whether service-row visibility progress already wakes membership
   publication reconciliation through an owner queue.
2. If not, route that visibility progress through the same typed publication
   reconcile seam used by priority operation progress.
3. Align failure-bundle priority recovery operation evidence with the
   canonical operation rows used by planning and diagnostics.
4. Add focused tests before any implementation fix.

## Out Of Scope

1. Harness-side semantic repair that changes runtime state.
2. New priority recovery vocabulary outside the existing decision snapshot.
3. Full harness matrix execution before the representative scenario is green.

## Shared Boundary Contract

- Semantic owner:
  priority recovery visibility and publication reconciliation handoff.
- Canonical contract:
  spread-changing visibility progress wakes publication reconciliation through
  one typed owner queue, and diagnostics report operation evidence from the
  same normalized priority recovery snapshot used by runtime decisions.
- Allowed consumers:
  unified rebalancer progress events, membership publication coordinator,
  priority recovery snapshot composition, and harness failure bundles.
- Prohibited reinterpretations:
  periodic-timer-only convergence, diagnostics inventing operation absence
  from partial rows, or readiness reads repairing publication summaries.
- Primary proof:
  unified rebalancer tests, priority recovery snapshot tests, harness
  failure-bundle tests, and the sprint-level representative harness rerun.

## Hotspots

1. `src/rebalancer/unified-rebalancer-segment-1.js`
2. `src/rebalancer/unified-rebalancer-segment-5.js`
3. `src/control-plane/priority-recovery-snapshot.js`
4. `src/control-plane/priority-recovery-observation-snapshot.js`
5. `test/rebalancer/unified-rebalancer.test.js`
6. `test/control-plane/priority-recovery-snapshot.test.js`
7. `test/distributed/harness/__tests__/failure-bundle.test.js`

## Detection / Analysis Tasks

- [x] Prove whether service-row visibility progress has an owner-owned
      publication reconcile wakeup.
- [x] Prove diagnostics consume the same operation rows as the canonical
      priority recovery snapshot.
- [x] Identify any remaining `operationIds = []` presentation path when
      normalized operation evidence exists.

## Implementation Tasks

- [x] Add focused tests for visibility-progress publication wakeup if the seam
      is missing.
- [x] Add focused diagnostics proof for operation evidence alignment.
- [x] Fix any discovered owner-wakeup or diagnostics drift inside the touched
      boundary.

## Residual Closure Inventory

- [x] Owner path: spread-changing priority recovery progress wakes publication
      reconciliation without relying on the periodic timer.
- [x] Tail consumers: failure bundles and observation snapshots consume the
      canonical priority recovery operation evidence.
- [x] Superseded path: diagnostics do not report operation absence when
      normalized operation evidence exists.
- [x] Proof: focused rebalancer/snapshot/harness tests, metrics, and
      sprint-level representative harness rerun.

## Progress Notes

1. Added priority-recovery operation evidence tests for normalized operation
   objects in both observation snapshots and failure bundles.
2. Added service-row visibility wakeup proof and runtime wakeup through the
   typed priority-recovery progress reconcile seam.
3. Focused proof runs:
   `npx tap test/control-plane/priority-recovery-snapshot.test.js --grep "operation ids from normalized operation objects"`.
4. Focused proof runs:
   `npx tap test/distributed/harness/__tests__/failure-bundle.test.js --grep "operation ids from normalized decision operation objects"`.
5. Full local proof already passed:
   `npx tap test/rebalancer/unified-rebalancer.test.js`.
6. Added harness replay cutover and stale synthetic no-operation merge
   filtering so replayed in-flight snapshots win over stale direct
   `needs_operation` snapshots for the same partition.
7. Full local proof passed:
   `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`.
8. Sprint representative rerun still fails, but no longer on the stale
   `eligible_but_no_operation_created` / `needs_operation` boundary. The
   latest `node-join-under-load` bundle shows priority recovery in
   `spread_satisfied_in_flight` or `converged` with empty unresolved
   partition witnesses, and the scenario now fails later on
   `dominantReason = nodeAdmissionBlocked`.
9. Full non-harness sprint validation and `npm run test:metrics` passed on the
   current branch before the final representative rerun.
10. The April 23 representative rerun still reports
    `dominantReason = nodeAdmissionBlocked`, `failureClass = load_pressure`,
    publication gate readiness `true`, and blocked or unresolved priority
    partitions `0`. That confirms the touched visibility and diagnostics
    boundary remains closed while the next blocker lives elsewhere.

## Validation

1. `npx tap test/rebalancer/unified-rebalancer.test.js`
2. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
3. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`
4. Expanded focused recovery/readiness/rebalancer/publication suite from the
   sprint.
5. `npm run test:metrics`
6. Sprint-level `node-join-under-load` rerun after all work packages are
   implemented.

## Done When

1. Publication reconciliation is woken by spread-changing priority recovery
   visibility through one owner seam.
2. Harness diagnostics no longer lose operation evidence that the canonical
   runtime snapshot can see.
3. No periodic-only or report-only alternate route remains in the touched
   boundary.
