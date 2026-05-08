# Rolling Restart Topology Publication Missing-Active Operation Workflow Progress Dispatch Replay Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-replica-operations-remote-replay-wakeup-20260507T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-replica-operations-remote-replay-wakeup-20260507T000000Z/rolling-restart/",
  "owner": "Topology publication missing-active operation-workflow progress dispatch replay recovery after join-resume-budget closure",
  "boundary": "Operation workflow owner / workflow_progress",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The startup replay and remote-owned replica_operations replay gaps are closed. The representative rerun reaches epoch 5 PUBLISHED with three active nodes, the prior contacting_seed and publication-ACK seams stay closed, and the direct owner migrates again: sql_write_operations-p1 now blocks under rebalancer_leader / operation_scheduling with nextRequiredAction=create_recovery_operation while sql_transactions-p1 remains only supporting workflow-progress evidence.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md to extract the post-publication scheduling witness, repair the event-driven re-entry seam, and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused workflow-progress witness extraction",
    "Focused ReplicaDispatchService startup replay regression",
    "Focused remote-owned replica_operations replay wakeup regressions",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence frontier analysis"
  ],
  "touchedFiles": [
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-service-segment-3.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-ack-pending-convergence-reentry.md",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-operation-workflow-progress-dispatch-replay-reentry.md",
    "work/packages/active-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-ack-pending-convergence-reentry.md",
  "successor": "work/packages/active-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md"
}
-->
Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Publication ACK-Pending Convergence Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-publication-ack-pending-convergence-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Topology Priority Recovery Operation Scheduling Post-Publication Closure Reentry](./active-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md).

## Closure Summary

1. Added startup replay for already-ready nodes through the canonical
   `nodeReadyRetryQueue`, so restart recovery no longer waits for an incidental
   later heartbeat before rediscovering locally owned dispatchable rows.
2. Added remote-owner wakeup replay for dispatchable `replica_operations`
   visibility on both cache and CDC paths, so remote-owned `PENDING` rows do
   not stall when the target was already ready before the row became visible.
3. Focused dispatch-service regressions, touched-file guardrails, and diff
   whitespace checks passed after the repair.
4. The representative rerun
   `rolling-restart-after-replica-operations-remote-replay-wakeup-20260507T000000Z`
   removed the prior startup `contacting_seed` and publication-ACK barriers
   from the direct owner boundary and advanced publication to epoch `5`
   `PUBLISHED`.
5. The representative path still fails, but it no longer selects
   `operation_workflow_owner / workflow_progress` as the deepest blocker.
   The live owner migrated again to `rebalancer_leader / operation_scheduling`
   on `sql_write_operations-p1`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-replica-operations-remote-replay-wakeup-20260507T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-replica-operations-remote-replay-wakeup-20260507T000000Z/rolling-restart/`.
3. Result: failed after `129.6s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Publication convergence now reports epoch `5` `PUBLISHED` with
   `pendingAck=0` and `recoveryProtocolState=priority_spread_pending`.
6. The repaired workflow-progress seam is closed: `sql_transactions-p1` does
   leave `PENDING`, and target owner `11601...` logs
   `dispatch_sending`, `Handling CREATE_REPLICA request`, and later
   `dispatch_creating` for operation
   `f1fb35e4-aced-42d7-9a0e-8a46a78a4b7a`.
7. The representative failure now selects
   `rebalancer_leader / operation_scheduling` with dominant reason
   `priority_recovery_operation_scheduling_event_driven`.
8. The direct witness is `sql_write_operations-p1` under semantic state
   `needs_operation`, `nextRequiredAction=create_recovery_operation`,
   `blockingBoundary=operation_scheduling`, and
   `progressClass=eligible_but_no_operation_created`.
9. Supporting evidence retains one in-flight `sql_transactions-p1` recovery
   operation, but publication and startup join are no longer the deepest live
   owners.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed join auto-resume budget regression from the predecessor
   startup package.
2. Extract the focused `103600Z` lower workflow-progress witness for
   `sql_write_operations-p1`.
3. Add a focused regression proving startup replay re-enters already-ready
   nodes through the canonical ready-node queue and does not dispatch inline.
4. Repair only the selected dispatch replay owner path in
   `ReplicaDispatchService`.
5. Rerun focused tests, touched-file guardrails, and one representative
   `rolling-restart` scenario.

## Out Of Scope

1. Reopening the closed startup `contacting_seed` package unless a fresh rerun
   selects it again as the direct owner.
2. Broad publication-owner rewrites while publication remains supporting
   evidence only for this artifact.
3. Harness-only timeout increases or blocker relabeling that hides the lower
   workflow-progress seam.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_progress` owns the boundary when the
   same artifact that carries top-level publication symptoms also shows one
   unresolved partition-level workflow witness below recovery closure.
2. `topology_publication_owner / publication_convergence` is supporting
   evidence only when publication closure names `sql_write_operations-p1` as
   the only blocked recovery partition.
3. `ReplicaDispatchService` may wake existing replayable operations, but it
   must do so only by re-entering the canonical per-node and per-operation
   reconcile queues.

Canonical contract shape:

1. Startup rediscovery must reuse the existing ready-node retry path rather
   than inventing a second dispatch owner path.
2. Already-ready nodes observed at dispatch-service startup must be replayed
   through the same queue contract as later ready-node cache/CDC triggers.
3. The regression must prove enqueue-only startup replay and must not allow
   inline dispatch work during initialization.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Codex local review session 2026-05-07` reviewed
      `work/packages/active-20260507-rolling-restart-topology-publication-missing-active-publication-ack-pending-convergence-reentry.md`
      on the shared rolling-restart topology-publication boundary and found no
      predecessor closure fixes blocking continuation, but confirmed the
      `103600Z` artifact migrates the direct owner below publication
      convergence to `operation_workflow_owner / workflow_progress`.
- [x] Fix subagent recorded or explicitly not needed:
      `Codex local fix session 2026-05-07` was `not-needed` because the
      predecessor package itself remained correct for its recorded migration;
      only the current blocker boundary changed.
- [x] Implementation subagent recorded:
      `Codex local implementation session 2026-05-07` opened this successor
      package only after the review/fix ledger was clean and will limit work to
      focused startup replay regression, bounded dispatch-service repair, and
      representative rerun bookkeeping for the workflow-progress boundary.

## Residual Closure Inventory

- [x] Extract the lower workflow-progress witness fixture in package form.
- [x] Add the focused startup replay regression for already-ready nodes.
- [x] Repair initialize-time ready-node rediscovery through the canonical
      dispatch queue.
- [x] Add focused remote-owned `replica_operations` cache and CDC replay
      wakeup regressions.
- [x] Rerun focused tests and touched-file static guardrails.
- [x] Rerun representative `rolling-restart` scenarios and record blocker
      migration.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npx tap test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
   passed.
2. `node scripts/check-guideline-decision-boundaries.js src/control-plane/replica-dispatch-service-segment-1.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js`
   returned `0 decision-boundary guideline violations`.
3. `node scripts/check-runtime-grammar-contracts.js src/control-plane/replica-dispatch-service-segment-1.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js`
   returned `0 runtime-grammar-contract violations`.
4. `git diff --check -- src/control-plane/replica-dispatch-service-segment-1.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
   passed.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-dispatch-startup-replay-20260507T000000Z.report.json --fast-local --verbose`
   failed, but moved the direct owner away from startup `contacting_seed` and
   publication `ACK_PENDING`.
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-remote-owner-ready-wakeup-20260507T000000Z.report.json --fast-local --verbose`
   failed, but exposed the missing remote-owned `replica_operations` replay
   wakeup seam.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-replica-operations-remote-replay-wakeup-20260507T000000Z.report.json --fast-local --verbose`
   failed after `129.6s`, but reached epoch `5` `PUBLISHED` and migrated the
   direct owner to `rebalancer_leader / operation_scheduling`.

## Migration

This package closes by migration. The repaired boundary was dispatch replay
re-entry for restart-visible workflow-progress rows. The successor package is
[Rolling Restart Topology Priority Recovery Operation Scheduling Post-Publication Closure Reentry](./active-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md),
which owns the epoch `5` `PUBLISHED` post-closure `sql_write_operations-p1`
`needs_operation` / `create_recovery_operation` stall.
