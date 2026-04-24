# Priority Recovery Readiness And Workflow Convergence Closure

## Why

The publication-scoped harness grammar work moved `node-join-under-load` past
the stale strict-leader mismatch and exposed the next runtime blocker.

The representative run on April 23, 2026 failed with:

1. `failureClass = publication_convergence_blocked`
2. `dominantReason = priority_recovery_workflow_timeout_reconcile_due`
3. active priority recovery in readiness diagnostics while
   `serveEligible = true`
4. `replica_operations-p1` stuck in `CREATING` even though the target handler
   observed the requested replica as already active

This is a grammar problem, not a harness exception:

1. external traffic readiness must close while publication recovery is active
2. internal control-plane recovery admission must remain open
3. create-phase idempotent satisfaction must be canonical observed progress
4. workflow timeout reconciliation must use that same observed-progress
   grammar instead of waiting for a stale in-flight row to fail

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## Dominant Blocker

`node-join-under-load` now blocks in publication recovery because priority
control-plane partitions remain under-spread while the system still admits
external serve traffic and one critical REPLACE create phase is not reconciled
from already-active target evidence.

The first representative rerun after those fixes moved the blocker again:

1. `failureClass = publication_convergence_blocked`
2. `dominantReason = priority_recovery_operation_scheduling_event_driven`
3. priority partition first-wave operations reached active target state
4. no next-wave priority recovery operation was scheduled until the ordinary
   periodic rebalancer timer

That is the same grammar boundary: priority recovery progress must re-enter the
single owner-key rebalance queue immediately from coordinator progress events,
not through a parallel planner or a legacy periodic-only path.

The representative rerun after event-driven scheduling and active-target
workflow convergence moved the blocker again:

1. the old `replace_remove_safety_blocked` loop was gone
2. external serve traffic correctly remained closed during priority recovery
3. several priority replacement operations reached source removal
4. remaining priority operations failed to persist workflow transitions because
   publication recovery still routed its own `replica_operations` transition
   updates through the distributed transaction envelope

That is still one grammar problem: priority control-plane recovery partitions
must persist their own workflow transitions through the control-plane recovery
mutation lane, not through the transaction tables and serve-routed SQL path
they are repairing.

The representative rerun after classifier-owned transition persistence moved
the blocker again:

1. priority operations reached terminal states
2. priority service rows showed the missing partitions spread across enough
   distinct active nodes
3. the durable publication summary still reported stale blocked partitions

That is an owner-wakeup gap: terminal priority operation progress must wake the
membership publication owner so it can recompute and persist the canonical
priority spread summary from fresh service rows. Readiness reads must not
repair that stale summary directly.

The representative rerun after publication-owner wakeup moved the blocker
again:

1. the stale-summary-only failure was gone
2. priority operation progress exposed pending/stopping transitions on durable
   `replica_operations` rows
3. those rows used snake-case `partition_id`, so the transition persistence
   classifier fell back to the SQL-routed distributed envelope

That is the same persistence grammar expressed through the durable row shape:
priority transition persistence must normalize the operation row first, then
select the recovery-lane direct persist path once.

## In Scope

1. Make control-plane readiness expose one canonical decision where active
   priority recovery closes `serveEligible` but keeps recovery admission open.
2. Ensure readiness reasons and bootstrap health use an owned priority
   recovery pending reason, not an undefined or alternate route.
3. Make create-phase `ALREADY_EXISTS` / already-active target evidence drive
   the same owner-owned workflow progression from dispatch and timeout
   reconciliation.
4. Add focused tests for readiness dimensions, health reason projection, and
   stale `CREATING` recovery from cache-visible active target state.
5. Add focused proof that priority coordinator progress events enqueue exactly
   one priority partition planning pass through the owner queue.
6. Make replace source-removal safety use internal owner-read recovery
   admission, not external serve readiness.
7. Make priority control-plane operation transitions use one classifier-owned
   recovery persistence grammar.
8. Wake the membership publication owner from the same priority progress
   decision that wakes the priority partition rebalance queue.
9. Normalize camel-case operation objects and snake-case durable operation rows
   before selecting priority transition persistence.
10. Rerun the representative `node-join-under-load` scenario after all work
   packages in the sprint are implemented.

## Out Of Scope

1. Scenario-only harness exemptions.
2. Legacy alternate readiness routes that leave external serve open during
   active priority recovery.
3. Full harness matrix execution before the representative scenario is green.

## Canonical Grammar

1. `CONTROL_PLANE_RECOVERY_ELIGIBLE` means internal recovery may proceed.
2. `REPAIR_ELIGIBLE` means the node has enough runtime/control-plane evidence
   for owner repair work.
3. `SERVE_ELIGIBLE` means external traffic may be routed to the node.
4. Active priority control-plane recovery is a serve blocker, not an internal
   recovery blocker.
5. Already-active target replica evidence is create-phase satisfaction. It
   advances the operation through the operation workflow owner and must not be
   treated as a lost or legacy dispatch response.
6. Priority recovery operation progress is a scheduling signal for the owning
   priority partition. It may enqueue the shared rebalance owner queue, but it
   must not create a second planning route.
7. Replace source-removal safety is an internal control-plane recovery
   decision; external serve closure must not block source removal.
8. Priority control-plane workflow transitions are recovery-lane mutations for
   every priority control-plane partition. A hand-maintained subset of
   partitions is not allowed.
9. Priority operation progress wakes the canonical membership publication
   owner; stale publication summaries are refreshed by that owner, not by a
   readiness read or harness-side exception.
10. Operation workflow persistence normalizes one operation-row snapshot before
   deciding the persistence lane. Casing differences must not create a legacy
   SQL-routed path for priority partitions.

## Hotspots

1. `src/control-plane/control-plane-readiness-constants.js`
2. `src/control-plane/control-plane-readiness-service-segment-2.js`
3. `src/control-plane/control-plane-readiness-service-segment-3.js`
4. `src/control-plane/control-plane-readiness-service-segment-4.js`
5. `src/rebalancer/operation-workflow-owner-segment-7.js`
6. `src/rebalancer/operation-workflow-owner-segment-2.js`
7. `src/rebalancer/operation-workflow-owner-shared.js`
8. `src/rebalancer/unified-rebalancer-segment-1.js`
9. `src/rebalancer/unified-rebalancer-segment-5.js`
10. `src/workflow/reconcile-queue-constants.js`
11. `test/control-plane/control-plane-readiness-service.test-part-4.js`
12. `test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-more-test-cases.js`
13. `test/rebalancer/quorum-conditioned-remove-safety.test.js`
14. `test/rebalancer/rebalance-coordinator-atomic-transitions-tail-test-cases.js`
15. `test/rebalancer/unified-rebalancer.test.js`
16. `test/control-plane/membership-publication-coordinator-tail-more-test-cases.js`

## Detection / Analysis Tasks

- [x] Prove readiness dimensions currently allow `serveEligible` during active
      priority recovery.
- [x] Prove bootstrap recovery health returns an owned reason code.
- [x] Prove stale `CREATING` create phases reconcile from active target
      replica evidence without waiting for terminal timeout failure.
- [x] Prove priority recovery operation progress was only waking the next wave
      through the ordinary periodic timer.
- [x] Prove replace source-removal safety was blocked by external serve
      readiness while internal recovery admission was open.
- [x] Prove publication recovery transitions still required the distributed
      transaction envelope.
- [x] Prove terminal priority progress did not wake the membership
      publication owner.
- [x] Prove membership publication reconciliation refreshes stale blocked
      priority spread metadata to satisfied from terminal service rows.
- [x] Prove snake-case durable operation rows still bypass the distributed
      transaction envelope for priority transition persistence.

## Implementation Tasks

- [x] Add the missing owned priority recovery pending readiness reason.
- [x] Move priority-recovery serve admission into the canonical readiness
      dimension decision.
- [x] Emit a readiness reason when serve closes specifically due to priority
      recovery.
- [x] Extend operation timeout reconciliation proof for stale `CREATING`
      REPLACE with cache-visible active target evidence.
- [x] Fix owner workflow progression if the focused proof exposes a gap.
- [x] Add one typed priority recovery progress reconcile reason.
- [x] Bind coordinator progress events only for priority partition rebalancers.
- [x] Route spread-changing coordinator progress back into the shared
      owner-key rebalance queue.
- [x] Move replace source-removal safety to
      `CONTROL_PLANE_RECOVERY_ELIGIBLE`.
- [x] Replace the transition-persistence partition allowlist with the canonical
      `isPriorityControlPlanePartition` classifier.
- [x] Route priority coordinator progress into membership publication
      reconciliation through the same typed progress reason.
- [x] Normalize transition operation partition identity before applying the
      priority partition classifier.

## Validation

1. `npx tap test/control-plane/control-plane-readiness-service.test-part-4.js`
2. `npx tap test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
3. `npx tap test/bootstrap/bootstrap-api.test-part-2.js test/bootstrap/bootstrap-api.test-part-3.js`
4. `npx tap test/rebalancer/unified-rebalancer.test.js`
5. `npx tap test/control-plane/membership-publication-coordinator.test.js`
6. `npx tap test/rebalancer/quorum-conditioned-remove-safety.test.js`
7. `npx tap test/rebalancer/rebalance-coordinator-atomic-transitions.test.js`
8. `npm run test:metrics`
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Latest Focused Validation

1. `npx tap test/rebalancer/quorum-conditioned-remove-safety.test.js`:
   `158/158` passing.
2. `npx tap test/rebalancer/rebalance-coordinator-atomic-transitions.test.js`:
   `133/133` passing.
3. `npx tap test/rebalancer/unified-rebalancer.test.js`: `90/90` passing.
4. `npx tap test/control-plane/membership-publication-coordinator.test.js --grep "terminal service rows"`:
   focused publication refresh proof passing.
5. Expanded recovery/readiness/rebalancer/publication focused suite before
   durable row-shape closure: `986/986` passing.
6. `npx tap test/rebalancer/rebalance-coordinator-atomic-transitions.test.js`:
   `135/135` passing.
7. Expanded recovery/readiness/rebalancer/publication focused suite after
   durable row-shape closure: `988/988` passing.
8. `npm run test:metrics`: passing.
9. Representative rerun on April 23, 2026 now reaches publication gate
   readiness with blocked and unresolved priority partitions both at `0`.
   The scenario still fails later on `nodeAdmissionBlocked`, which confirms
   this package's readiness and workflow convergence boundary is no longer the
   terminal blocker.
