# Rolling Restart Topology Publication Convergence ACK Pending Missing Published Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-workflow-timeout-remote-wake-fix-20260508T130500Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-workflow-timeout-remote-wake-fix-20260508T130500Z/rolling-restart/",
  "owner": "Priority recovery workflow timeout after serial-wait operation scheduling fix",
  "boundary": "operation_workflow_owner / workflow_timeout / timeout_reconcile_due",
  "dominantReason": "priority_recovery_workflow_timeout_transition_deferred",
  "currentState": "The stale remote dispatch-pending wake fix passed focused proof but did not close the representative frontier. priorityRecoveryInvariants still pass and publication remains PUBLISHED with pendingAckCount=0. The first frontier remains operation_workflow_owner / workflow_timeout: the dominant witness is sql_write_operations-p1 with cache-visible PENDING operation 773b4aca-bd05-4788-8126-d7d8f12d3270, workflowProgressPhaseId=dispatch_pending, stepAgeMs=77003 over stepTimeoutMs=30000, actuationState=transition_deferred, and nextRequiredAction=reconcile_stale_operation_progress.",
  "nextAction": "Start the next implementation slice for operation_workflow_owner / workflow_timeout. The next proof surface is why the remote-owner wake/retry path still leaves stale dispatch_pending PENDING priority recovery operations transition_deferred at timeout_reconcile_due in the representative run.",
  "proof": [
    "First-package-in-sprint review-not-needed validation and work-context coverage",
    "Focused epoch-4 ACK_PENDING publication-convergence witness with supporting selected-snapshot and priority-recovery context",
    "Focused publication-convergence regression or classification proof for pendingAckCount=1 and missingPublishedCount=2",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "AGENTS.md",
    "roadmap.md",
    "scripts/work-context.js",
    "scripts/work-tracker.js",
    "test/scripts/work-context.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/README.md",
    "work/templates/work-package-template.md",
    "work/packages/active-20260507-work-model-ledger-and-steering-policy.md",
    "work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md",
    "work/packages/todo-20260507-work-model-ledger-and-steering-policy.md",
    "work/packages/todo-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md",
    "work/packages/done-20260508-priority-recovery-operation-workflow-contract-rewrite.md",
    "work/sprints/active-2026-q2-phase-0-1-representative-gate-closure.md",
    "work/sprints/archived/done-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "src/node/replica-handler-class-part-1.js",
    "test/node/replica-handler.test.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/unified-rebalancer-segment-2.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-1.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-4.js",
    "test/rebalancer/priority-recovery-stale-planning-visibility.test.js",
    "test/rebalancer/rebalance-coordinator-outcome-routing.test.js",
    "work/model-ledger.jsonl"
  ],
  "predecessor": "work/packages/done-20260508-priority-recovery-operation-workflow-contract-rewrite.md"
}
-->

Opened on May 8, 2026 after
[Priority Recovery Operation Workflow Contract Rewrite](./done-20260508-priority-recovery-operation-workflow-contract-rewrite.md)
proved the old workflow-progress/timeout contract seam and moved the direct
`rolling-restart` frontier to publication convergence.

## Migration Note

The file name still reflects the publication-convergence slice that started
this package. The live blocker first migrated to
`operation_workflow_owner / workflow_progress`, then the dispatch-pending
handoff repair moved the representative frontier to
`rebalancer_leader / operation_scheduling`. The implementation slice records
the real implementation subagent required by the package tracker. The dispatch
handoff slice and commit/push ledger have been committed and pushed.

## Why

The representative gate no longer fails because priority-recovery workflow
consumers reinterpret planning-backed `dispatch_pending` state. The new direct
frontier is now publication-owned:

1. `npm run analyze:distributed-failure -- --report ...20260508T095320Z.report.json`
   selects dominant reason `pending_ack_nodes`.
2. `npm run analyze:topology-convergence -- ...20260508T095320Z.report.json`
   selects `topology_publication_owner / publication_convergence` as the first
   frontier with dominant reason `publication_pending`.
3. Startup active-gate snapshot coverage and priority-recovery progress still
   contribute supporting blockers, but they no longer outrank publication
   convergence.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Freeze the epoch `4` `ACK_PENDING` publication witness from the latest
   representative rerun.
2. Identify whether the direct owner bug is ACK-retention, missing-published
   node accounting, or selected-snapshot timeout interaction inside the
   publication boundary.
3. Keep startup active-gate and downstream priority-recovery evidence as
   supporting context unless a fresh representative artifact promotes them back
   above publication convergence.

## Out Of Scope

1. Reopening the closed priority-recovery workflow contract package unless a
   fresh artifact restores that boundary as the first frontier.
2. Broad startup or rebalancer changes before the direct publication witness is
   isolated.
3. Harness timeout changes that hide publication ACK debt.

## Boundary Contract

Semantic owners:

1. `topology_publication_owner / publication_convergence` owns the direct
   pending-ack frontier.
2. `startup_active_gate_owner / snapshot_coverage` remains supporting context
   while publication is still the first frontier.
3. `operation_workflow_owner / workflow_progress` remains downstream unless a
   fresh artifact promotes it above publication convergence again.

Canonical contract shape:

1. `publicationStatus=ACK_PENDING`, `pendingAckCount=1`, and
   `missingPublishedCount=2` must remain direct publication evidence rather
   than being collapsed into a generic startup or priority-recovery blocker.
2. Selected-snapshot timeout and missing-published node ids must stay preserved
   as supporting evidence even when the direct owner remains publication.

## Subagent Sequencing Ledger

User instruction on May 8, 2026 explicitly waived the initial predecessor
review step for this first work package. After the first focused implementation
slice was committed, the normal continuation review/fix sequence resumed before
the next runtime implementation slice.

- [x] Review subagent recorded:
      Agent Hume (019e074b-b93a-7be0-ae00-996b33ca7ffb) reviewed work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Bacon (019e074f-ebb1-72b1-b8fd-876e1a69287c) fixed work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md.
- [x] Implementation subagent recorded:
      Agent Nietzsche (019e0756-ea0e-7490-89e3-c8b65542c4a7) implemented work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md;
      result clean with bounded coordinator-created remote handoff delivery
      and dispatch-pending retry regression proof.
- [x] Continuation review subagent recorded:
      Agent Pascal (019e0764-d263-7f53-b50b-192f0a6916bb) reviewed work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md; result fixes-required.
- [x] Continuation fix subagent recorded:
      Agent Locke (019e0767-463c-75e2-af90-18ced40b2fc7) fixed work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md.
- [x] Continuation implementation subagent recorded:
      Agent Leibniz (019e076a-2cc4-7881-95bc-792482d53fda) implemented work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md;
      result clean with priority recovery operation-scheduling reentry and
      focused recovery-operation creation regression proof.
- [x] Next-slice review subagent recorded:
      Agent Laplace (019e077a-9693-7d10-b4fb-af9ff3c11409) reviewed work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md; result clean.
- [x] Next-slice fix subagent recorded or explicitly not needed:
      not-needed.
- [x] Next-slice implementation subagent recorded:
      Agent Bernoulli (019e077f-a701-74d3-953f-cf5fded3490e) implemented work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md;
      result clean with multi-candidate priority recovery operation scheduling
      and focused regression proof.
- [x] Post-slice review subagent recorded:
      Agent Linnaeus (019e0792-80c2-7373-bc03-150bee8a0a26) reviewed work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md; result fixes-required.
- [x] Post-slice fix subagent recorded:
      Agent Anscombe (019e0797-475b-7402-9ae1-fdfdbbc1dbff) fixed work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md; result clean with residual serial-wait no-operation surrogate retention covered.
- [x] Workflow-timeout implementation subagent recorded:
      Agent Harvey (019e07a2-de90-7a10-b95f-230ccdc393e8) implemented work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md;
      result bounded stale dispatch-pending timeout remote-owner wake handling
      with focused workflow-timeout regression proof.
- [x] Workflow-timeout review subagent recorded:
      Agent Huygens (019e07b5-6694-7b02-a694-8d6d086bf0fb) reviewed work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md; result fixes-required.
- [x] Workflow-timeout fix subagent recorded:
      Agent Bohr (019e07bd-3bfa-72d2-a723-de402c87850e) fixed work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md;
      result clean with explicit remote drain re-arm owner action and
      deferred handoff retry reentry proof.

## Residual Closure Inventory

- [x] Required implementation subagent proof is recorded for the implementation
      slice.
- [x] Epoch `4` `ACK_PENDING` publication witness is frozen into a focused
      fixture or package evidence block.
- [x] Direct publication ACK debt is separated from selected-snapshot timeout
      and downstream priority-recovery progress support.
- [x] Focused publication-convergence regression or classification proof
      covers `pendingAckCount=1` and `missingPublishedCount=2`.
- [x] Touched-file static guardrails pass.
- [x] Representative `rolling-restart --fast-local` rerun either passes or
      migrates to one new named owner boundary.

## Static Drift Ledger

Preflight:

- [x] Existing dirty priority-recovery timeout residual edits remain outside the
      newly added owner/handler progress slice.
- [x] Relevant touched-file guardrails are selected for the runtime edits.
- [x] File-scoped baseline is recorded by the pre-existing migration evidence
      and targeted focused regressions.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No touched-file decision-boundary, literal-owner, runtime-grammar, or
      diff hygiene violation remains.
- [x] Commit and push ledger records one focused package-owned slice.

## Commit And Push Ledger

- Focused package commit: ef78c22ac07488962714e279413cc92520281f57
- Pushed to: origin/codex/pending-ack-eligibility-filter
- Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Focused Evidence

1. Artifact witness:
   `test-output/reports/rolling-restart-after-priority-recovery-workflow-contract-rewrite-20260508T095320Z.report.json`
   still reports direct publication debt with `dominantReason=pending_ack_nodes`
   while startup and priority-recovery remain supporting context.
2. Focused regression:
   `keeps direct ACK-pending publication blockers canonical over missing-published startup support`
   in
   `test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
   now starts from a stale incoming `startup` root-cause class and proves the
   bundle canonicalizes `diagnostics.failure.rootCauseClass`,
   `summary.rootCauseClass`, and
   `summary.failureClassification.rootCauseClass` to `topology`.
3. Representative rerun:
   `test-output/reports/rolling-restart-after-publication-root-cause-classification-20260508T122500Z.report.json`
   no longer terminates on publication convergence. The updated frontier is
   `operation_workflow_owner / workflow_progress` with dominant reason
   `priority_recovery_workflow_progress_transition_deferred`, while
   publication is `PUBLISHED` with `pendingAckCount=0` and startup snapshot
   coverage remains downstream.
4. Operation-owner regression:
   `priority recovery in-progress create dispatch reconciles observed target progress`
   in `test/rebalancer/rebalance-coordinator-outcome-routing.test.js` proves an
   idempotent `CREATE_REPLICA` `IN_PROGRESS` response advances a `CREATING`
   priority-recovery operation to observed `SYNCING` instead of leaving serial
   wait carriers blocked behind stale workflow progress.
5. Target-handler regression:
   `handleCreateReplica - emits syncing outcome for syncing replica` in
   `test/node/replica-handler.test.js` proves a target retry that finds the
   local replica already `syncing` emits canonical `REPLICA_CREATE_SYNCING`
   workflow progress, while the adjacent `creating` regression proves no
   unearned progress outcome is emitted before the target crosses that boundary.
6. Representative rerun after the owner/handler progress fix:
   `test-output/reports/rolling-restart-operation-workflow-progress-repair-20260508T110700Z.report.json`
   still fails, but the failure moved. `priorityRecoveryInvariants=passed`,
   publication remains `PUBLISHED`, `sql_transaction_participants-p1` now shows
   `latestOperationWorkflowStep=SYNCING`, and the remaining first frontier is
   `operation_workflow_owner / workflow_progress` with a serial-wait pair:
   `sql_transaction_participants-p1` waits on the `sql_transactions-p1`
   operation while `sql_transactions-p1` remains `PENDING` and waits on the
   participants operation.
7. Dispatch-pending handoff regression:
   `coordinator-created remote handoff uses bounded priority delivery for
   dispatch-pending PENDING rows` in
   `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
   proves remote-owned coordinator-created priority operations use bounded
   delivery metadata and preserve retry response details for reentry.
8. Representative rerun after the dispatch-pending handoff fix:
   `test-output/reports/rolling-restart-dispatch-pending-handoff-repair-20260508T112000Z.report.json`
   still fails, but the previous serial-wait dispatch-pending witness no longer
   dominates. The first frontier is now
   `rebalancer_leader / operation_scheduling` with dominant reason
   `priority_recovery_operation_scheduling_event_driven`; blocked partitions
   `replica_operations-p1`, `sql_transactions-p1`, and `sql_write_operations-p1`
   are classified as `needs_operation` /
   `eligible_but_no_operation_created`, with
   `nextRequiredAction=create_recovery_operation`.
9. Operation-scheduling reentry regressions:
   `UnifiedRebalancer current priority follow-up snapshot keeps planning
   operation creation when coordinator visibility has no operation` and
   `UnifiedRebalancer checkRebalance schedules recovery work when coordinator
   visibility has no operation` in
   `test/rebalancer/priority-recovery-stale-planning-visibility.test.js` prove
   planning `needs_operation` / `create_recovery_operation` evidence can
   re-enter the recovery operation creation lane when coordinator visibility has
   no authoritative operation.
10. Representative rerun after the operation-scheduling reentry fix:
    `test-output/reports/rolling-restart-operation-scheduling-repair-20260508T120500Z.report.json`
    still fails on `rebalancer_leader / operation_scheduling`, but the blocker
    reduced from three partitions to two. `replica_operations-p1` now appears in
    `spread_satisfied_in_flight` with `control_plane_publications-p1` and
    `sql_transaction_participants-p1`; the remaining `needs_operation` /
    `eligible_but_no_operation_created` partitions are `sql_transactions-p1`
    and `sql_write_operations-p1`, with dominant witness
    `sql_transactions-p1|8|operation_unknown`.
11. Multi-candidate operation-scheduling regression:
    `rebalance continues surrogate priority recovery scheduling after a repaired
    priority partition is already in flight` in
    `test/rebalancer/unified-rebalancer-part-5-2-stage-4.js` proves surrogate
    priority recovery continues creating operations for multiple remaining
    eligible priority partitions after the first candidate is already
    `spread_satisfied_in_flight`.
12. Representative rerun after the multi-candidate operation-scheduling fix:
    `test-output/reports/rolling-restart-multi-candidate-operation-scheduling-repair-20260508T123000Z.report.json`
    still fails on `rebalancer_leader / operation_scheduling`, but the blocker
    reduced again. `sql_write_operations-p1` now has operation
    `ece0b2f2-397f-47f2-9c79-1292740f54fa`, is cache-visible, and is classified
    `recovering_in_flight` / `workflow_progress`; the remaining operation
    scheduling witness is `sql_transactions-p1|2|operation_unknown`, with
    `needs_operation`, `eligible_but_no_operation_created`, no `operationIds`,
    and `nextRequiredAction=create_recovery_operation`.
13. Linnaeus review fix:
    `rebalance continues surrogate priority recovery scheduling after a
    repaired priority partition is already in flight` now models the residual
    event-driven reentry shape: one adjacent priority operation is already in
    flight, the serial gate is present, and the remaining `sql_transactions-p1`
    surrogate snapshot is raw `priority_operation_serial_wait` /
    `wait_for_operation_progress` with no operation IDs. The surrogate loop
    normalizes that raw wait-shaped snapshot back to the reconstructed
    operation-required snapshot and creates the missing recovery operation.
14. Representative rerun after the serial-wait no-operation fix:
    `test-output/reports/rolling-restart-serial-wait-operation-scheduling-fix-20260508T124500Z.report.json`
    removes the `rebalancer_leader / operation_scheduling` frontier. The first
    frontier is now `operation_workflow_owner / workflow_timeout` with dominant
    reason `priority_recovery_workflow_timeout_transition_deferred`. The
    dominant witness is `sql_write_operations-p1` with cache-visible PENDING
    operation `9d8d9432-cbc6-411f-a343-8ad9ab99df5b`,
    `workflowProgressPhaseId=dispatch_pending`, `stepAgeMs=75457`,
    `stepTimeoutMs=30000`, and
    `nextRequiredAction=reconcile_stale_operation_progress`.
15. Workflow-timeout remote-wake regression:
    `checkTimeouts re-wakes restart-discovered remote-owned priority
    dispatch-pending PENDING rows while the operation budget is still active`
    in
    `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
    proves stale remote-owned timeout witnesses route through
    `wake_remote_owner`, arm the bounded handoff retry lane, and do not fail or
    mutate the remote-owned PENDING row before remote progress is observed.
16. Representative rerun after the stale remote dispatch-pending wake fix:
    `test-output/reports/rolling-restart-workflow-timeout-remote-wake-fix-20260508T130500Z.report.json`
    still fails on `operation_workflow_owner / workflow_timeout` with dominant
    reason `priority_recovery_workflow_timeout_transition_deferred`. The
    dominant witness remains `sql_write_operations-p1`, now operation
    `773b4aca-bd05-4788-8126-d7d8f12d3270`, cache-visible PENDING,
    `workflowProgressPhaseId=dispatch_pending`, `stepAgeMs=77003`,
    `stepTimeoutMs=30000`, `actuationState=transition_deferred`, and
    `nextRequiredAction=reconcile_stale_operation_progress`.
