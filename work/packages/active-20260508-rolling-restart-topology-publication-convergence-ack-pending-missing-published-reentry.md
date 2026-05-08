# Rolling Restart Topology Publication Convergence ACK Pending Missing Published Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-operation-workflow-progress-repair-20260508T110700Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-operation-workflow-progress-repair-20260508T110700Z/rolling-restart/",
  "owner": "Operation workflow progress transition-deferred after publication convergence root-cause-classification repair",
  "boundary": "operation_workflow_owner / workflow_progress / event_driven_wait",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The owner/handler progress repair advanced the previous target create witness to SYNCING and priorityRecoveryInvariants now pass in the representative rerun. The gate still fails on operation_workflow_owner / workflow_progress with dominant reason priority_recovery_workflow_progress_transition_deferred; the latest frontier is a two-partition serial-wait pair where sql_transaction_participants-p1 has latestOperationWorkflowStep=SYNCING and sql_transactions-p1 has latestOperationWorkflowStep=PENDING.",
  "nextAction": "Commit the focused owner/handler progress slice, then run the next sequencing loop to isolate why the sql_transactions-p1 priority-recovery operation remains PENDING while serial-wait carriers keep event-driven wait_for_operation_progress. Check whether the PENDING row is dispatch-suppressed by mutual serial-wait evidence, owner handoff, or stale planning reconstruction.",
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
    "src/rebalancer/operation-workflow-owner-segment-4.js",
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
this package. The live blocker has now migrated to
`operation_workflow_owner / workflow_progress`. The implementation slice now
records the real implementation subagent required by the package tracker; the
commit/push ledger remains open until the focused slice is committed and
pushed.

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

User instruction on May 8, 2026 explicitly waived the review step for this
first work package. `scripts/work-tracker.js` still requires real review/fix
proof for strict validation, so package closure remains blocked on policy/tool
alignment even though the local implementation slice is complete.

- [x] Review subagent recorded:
      `not-needed` (`first-package-in-sprint`).
- [x] Fix subagent recorded or explicitly not needed:
      `not-needed`.
- [x] Implementation subagent recorded:
      Agent Sagan (019e0739-6888-7a73-b578-e50a695954b6) implemented work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md;
      result clean with owner-side `IN_PROGRESS` dispatch progress
      reconciliation and focused regression proof.

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

- Focused package commit: 0845c4add40617810db60718f93243f505d8db75
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
