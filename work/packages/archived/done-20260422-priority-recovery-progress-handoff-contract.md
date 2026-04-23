# Priority-Recovery Progress Handoff Contract

## Why

The latest `node-join-under-load` rerun changed the shape of the remaining
problem.

The system now already has a much better safety grammar for the
priority-recovery boundary:

1. completion state is explicit
2. workflow / visibility / convergence are explicit
3. admitted participation is explicit

But the same run still leaves one crucial question implicit:

1. who owns the next progress step right now
2. what exact action must happen next
3. what boundary is blocking that action
4. whether the wait is event-driven, retry-timed, deferred, or actually
   stalled

That gap is why a narrow handoff problem can still feel like archaeology
instead of one discussable contract.

This package closes that gap on the existing priority-recovery decision
snapshot path. It does not create a parallel subsystem.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

## In Scope

1. Define one canonical `PriorityRecoveryProgressContract` on the existing
   priority-recovery decision snapshot path.
2. Reuse the existing shared `OwnerContractOutcome` vocabulary for
   `contractState` and `nextAction`.
3. Reuse existing workflow timestamps, authoritative-operation visibility
   state, completion state, blocker reasons, and existing owner-path evidence
   instead of inventing a second progress model.
4. Emit one explicit liveness sentence for each priority partition:
   `currentOwner`,
   `nextRequiredAction`,
   `blockingBoundary`,
   `waitMode`,
   `lastProgressAtMs`,
   `retryAfterMs`,
   and `evidenceSourceIds`.
5. Preserve that contract through the canonical
   `PriorityRecoveryObservationSnapshot` partition witnesses so later consumers
   can cut over without rebuilding meaning locally.

## Out Of Scope

1. A new top-level progress owner or scheduler subsystem beside the current
   rebalancer, coordinator, and readiness owners
2. Broad rebalancer scheduling redesign beyond the explicit liveness grammar
   carried by the shared snapshots
3. Harness reruns before the consumer-cutover package lands
4. Report-writer, failure-bundle, and triage-surface rendering changes beyond
   preserving the shared contract on the observation path

## Invariants

1. The new grammar must extend the existing decision snapshot. It must not
   fork it.
2. `workflowState`, `visibilityState`, and `convergenceState` remain separate
   axes. The new contract explains ownership and wait semantics around them; it
   does not collapse them back together.
3. Deferred visibility must stay distinct from scheduled retry and from
   stalled handoff.
4. The latest progress timestamp must come from existing owner evidence
   (`updatedAt`, `completedAt`, captured-at provenance), not from new local
   timers.

## Hotspots

1. `src/control-plane/priority-recovery-diagnostics-constants.js`
2. `src/control-plane/priority-recovery-snapshot.js`
3. `src/control-plane/priority-recovery-observation-snapshot.js`
4. `src/control-plane/owner-contract-outcome.js`
5. `test/control-plane/priority-recovery-snapshot.test.js`
6. `architecture/current-owner-maps.md`

## Shared Boundary Contract

- Semantic owner:
  `PriorityRecoveryDecisionSnapshot` emitted from
  `src/control-plane/priority-recovery-snapshot.js`
- Canonical contract shape / vocabulary:
  `PriorityRecoveryProgressContract { contractState, nextAction, currentOwner, nextRequiredAction, blockingBoundary, waitMode, lastProgressAtMs, retryAfterMs, evidenceSourceIds }`
- Allowed consumers:
  priority-recovery observation snapshots, readiness/admin follow-on consumers,
  harness/reporting follow-on consumers, and focused contract tests
- Prohibited reinterpretations:
  consumer-local inference of owner handoff,
  collapsing deferred visibility into generic blocking,
  or encoding stalled handoff as empty/no-op state
- Primary diagnostics / proof surfaces:
  focused priority-recovery snapshot tests,
  priority-recovery observation snapshot consumers,
  and architecture owner-map updates

## Detection / Analysis Tasks

- [x] Identify the specific missing liveness questions from the latest harness
      failure.
- [x] Map those questions onto existing reusable owners instead of inventing a
      parallel system.
- [x] Trace the exact existing signals that can feed
      `currentOwner`,
      `nextRequiredAction`,
      `blockingBoundary`,
      and `lastProgressAtMs`
      on the touched path.

## Implementation Tasks

- [x] Add failing tests first for the new progress contract on the shared
      decision snapshot.
- [x] Add the canonical progress grammar constants and builder on the shared
      priority-recovery snapshot path.
- [x] Reuse `OwnerContractOutcome` for `contractState` and `nextAction`.
- [x] Preserve the new progress contract through
      `PriorityRecoveryObservationSnapshot` partition witnesses.
- [x] Update [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
      in the same work cycle.

## Residual Closure Inventory

- [x] Admin/control-snapshot rendering of the new progress contract is split to
      [Priority-recovery progress consumer cutover](./done-20260422-priority-recovery-progress-consumer-cutover.md).
- [x] Harness/reporting/triage rendering of the new progress contract is split
      to
      [Priority-recovery progress consumer cutover](./done-20260422-priority-recovery-progress-consumer-cutover.md).
- [x] Scheduler-specific fixes, if still needed after the new contract is
      visible end to end, stay outside this package until the deferred harness
      confirmation proves they are necessary.

## Execution Notes

1. Added the canonical `PriorityRecoveryProgressContract` on the existing
   decision-snapshot path in
   `src/control-plane/priority-recovery-snapshot.js`.
2. Reused the shared `OwnerContractOutcome` vocabulary for
   `contractState` and `nextAction` instead of introducing another public
   branch bag.
3. Preserved the new handoff/progress contract into
   `PriorityRecoveryObservationSnapshot` partition witnesses so later admin and
   harness consumers can render it without local reconstruction.
4. Focused proof is green:
   - `npx tap test/control-plane/priority-recovery-snapshot.test.js`
   - `npx tap test/control-plane/control-plane-readiness-service.test-part-4.js`
   - `npx tap test/distributed/harness/__tests__/failure-bundle.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js`
5. The deferred `node-join-under-load` rerun no longer hid the blocker behind
   admission or reporting ambiguity. The dominant reason moved to
   `priority_recovery_workflow_progress_event_driven` on
   `sql_transaction_participants-p1`, owned by
   `operation_workflow_owner` at the `workflow_progress` boundary.
6. That blocker is split explicitly to
   [Priority-recovery workflow-progress liveness and timeout cutover](./done-20260422-priority-recovery-workflow-progress-liveness-and-timeout-cutover.md)
   so this package can close cleanly on the contract/handoff slice it was
   meant to land.

## Validation

1. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
2. `npx tap test/control-plane/control-plane-readiness-service.test-part-4.js`
3. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js`
4. `npm run test:metrics`

## Done When

1. The shared decision snapshot emits one explicit progress/handoff contract
   for priority-recovery partitions.
2. The observation snapshot preserves that contract without consumer-local
   recomputation.
3. The owner map names the contract and its owner clearly enough that the
   remaining consumer cutover can reuse it instead of inventing another layer.
