# Rolling Restart Topology Publication Convergence ACK Pending Missing Published Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-workflow-contract-rewrite-20260508T095320Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-workflow-contract-rewrite-20260508T095320Z/rolling-restart/",
  "owner": "Topology publication convergence ACK pending after priority-recovery workflow contract rewrite",
  "boundary": "topology_publication_owner / publication_convergence / pending_ack_convergence",
  "dominantReason": "publication_pending",
  "currentState": "The priority-recovery workflow contract rewrite is now proved and no longer owns the first frontier. The latest representative rolling-restart rerun stops at topology_publication_owner / publication_convergence with publicationStatus=ACK_PENDING, pendingAckCount=1, missingPublishedCount=2, activeNodeCount=3/5, and startup/priority-recovery evidence downstream only.",
  "nextAction": "Start a fresh publication-convergence package only after the next review/fix/implementation subagent sequence is recorded. First isolate the direct pending-ack witness and separate publication-owned ACK debt from selected-snapshot timeout and downstream priority-recovery serial-wait support.",
  "proof": [
    "Focused epoch-4 ACK_PENDING publication-convergence witness with supporting selected-snapshot and priority-recovery context",
    "Focused publication-convergence regression or classification proof for pendingAckCount=1 and missingPublishedCount=2",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/todo-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/model-ledger.jsonl"
  ],
  "predecessor": "work/packages/done-20260508-priority-recovery-operation-workflow-contract-rewrite.md"
}
-->

Opened on May 8, 2026 after
[Priority Recovery Operation Workflow Contract Rewrite](./done-20260508-priority-recovery-operation-workflow-contract-rewrite.md)
proved the old workflow-progress/timeout contract seam and moved the direct
`rolling-restart` frontier to publication convergence.

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
