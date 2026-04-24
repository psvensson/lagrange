# Publication Gate Consolidation And Load Convergence Closure

## Why

Repeated fixes on `node-join-under-load` keep landing at the same boundary:
publication convergence, readiness, admission, admin diagnostics, and harness
reporting all retain partially overlapping ways to say whether priority
recovery is still active.

The latest representative failure already proved that a stale closure-witness
bug was real and is now fixed, but the larger design problem remains:

1. one surface can say the publication gate is ready
2. another surface can still carry `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
3. a tail consumer can rebuild an older priority-spread-pending gate from
   mixed readiness and diagnostic evidence
4. runtime blockers such as control-plane writability can still be reported
   with the same vocabulary as publication-gate blockers

That is a porous boundary. The next step is not another local exemption.
The next step is to collapse the duplicate tracked state so publication-gate
ownership is singular and consumers mirror it instead of reconstructing it.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Make one canonical publication-gate contract the owner for:
   - publication pending
   - ack pending
   - priority spread pending
   - ready
2. Keep runtime blockers distinct from publication-gate blockers in
   readiness-owned recovery projections.
3. Cut direct consumers over so they consume the canonical gate instead of:
   - trusting stale embedded gate objects
   - rebuilding gate state from mixed `reasonCodes`
   - treating runtime blockers as reopened priority recovery
4. Prove the owner path and direct tail consumers with focused regressions.
5. Rerun `node-join-under-load` after the boundary consolidation is green and
   record blocker migration if the scenario still fails.

## Out Of Scope

1. Harness-only pass/fail exemptions.
2. Adding a second publication or readiness state machine.
3. New feature work outside the existing publication-scoped stability sprint.

## Shared Boundary Contract

- Semantic owner:
  publication convergence and its readiness-owned recovery projection.
- Canonical contract:
  one canonical publication gate says whether convergence is still pending;
  runtime blockers remain visible, but they do not reactivate publication
  recovery once the gate is ready.
- Allowed consumers:
  readiness owner, load-lane admission, rebalancer planning gates, startup
  authority consumers, admin diagnostics, and harness/reporting surfaces.
- Prohibited reinterpretations:
  trusting stale embedded `publicationRecoveryGate` objects, rebuilding the
  publication gate from mixed readiness `reasonCodes`, or treating ordinary
  runtime blockers as `priority_recovery_pending`.
- Primary proof:
  focused owner-path plus tail-consumer tests, then the representative
  scenario rerun.

## Hotspots

1. `src/control-plane/control-plane-readiness-service-segment-2.js`
2. `src/control-plane/control-plane-readiness-service-segment-4.js`
3. `src/control-plane/control-plane-mutation-readiness.js`
4. `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`
5. `src/rebalancer/unified-rebalancer-segment-3.js`
4. `src/rebalancer/unified-rebalancer-segment-1.js`
5. `test/control-plane/control-plane-readiness-service.test-part-4.js`
6. `test/control-plane/control-plane-mutation-readiness.test.js`
7. `test/admin/admin-control-snapshot.test.js`
8. `test/rebalancer/unified-rebalancer.test-part-6.js`
9. `test/distributed/harness/__tests__/failure-bundle.test.js`

## Status Update

Representative reruns on April 23, 2026 now show that the publication-scoped
boundary consolidation is complete:

1. `publicationRecoveryGate.ready = true`
2. `prioritySpreadPending = false`
3. blocked priority partitions = `0`
4. unresolved priority partitions = `0`
5. `priorityRecoveryProgressClassIds = []`
6. `priorityRecoverySemanticStateIds = []`

The latest `node-join-under-load` rerun still fails, but the failure has moved
off the old publication-closure seam:

1. `dominantReason = nodeAdmissionBlocked`
2. `failureClass = load_pressure`
3. top reasons are `nodeAdmissionBlocked = 477`,
   `retryableControlPlanePressure = 10`, and `timeoutWaits = 1`
4. retained spread-satisfied witness diagnostics no longer reopen priority
   recovery or dominate the harness classifier
5. the runtime seam now centers on `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`,
   write-unhealthy recovery-only nodes, repeated
   `replace_remove_safety_blocked` deferrals, and replacement leader ownership
   not becoming safe for source removal

This package's simplification exit condition is therefore met. The next work
is runtime stabilization on node-admission pressure and source-removal safety,
not more publication-gate reinterpretation.

## Detection / Analysis Tasks

- [x] Enumerate every consumer on this boundary that still trusts embedded
      gate state or mixed recovery `reasonCodes`.
- [x] Prove which blocker vocabulary belongs to the publication gate and which
      belongs to runtime readiness only.
- [x] Capture the next named blocker in the representative scenario after the
      shared boundary is consolidated.

## Implementation Tasks

- [x] Canonicalize the publication gate from current planning evidence instead
      of trusting stale embedded gates.
- [x] Keep runtime blocker reason codes separate from canonical publication
      gate reason codes.
- [x] Cut direct consumers over to the canonical gate contract.
- [x] Preserve the closure witness grammar and fresh-on-ineligible admission
      behavior while deleting duplicate interpretation.
- [x] Rerun the representative scenario and record blocker movement.

## Validation

1. `npx tap test/control-plane/control-plane-readiness-service.test-part-4.js`
2. `npx tap test/control-plane/control-plane-mutation-readiness.test.js`
3. `npx tap test/admin/admin-control-snapshot.test.js`
4. `npx tap test/rebalancer/unified-rebalancer.test-part-6.js`
5. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Done When

1. Publication convergence has one canonical gate owner across readiness,
   admin, rebalancer, and harness consumers.
2. Runtime blockers are still visible but no longer reopen publication
   recovery after the gate is ready.
3. The representative scenario is green, or the next blocker is explicitly
   recorded as blocker migration on a now-simplified boundary.
