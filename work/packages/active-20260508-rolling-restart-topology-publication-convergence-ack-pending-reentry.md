# Rolling Restart Topology Publication Convergence ACK Pending Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-startup-active-gate-closure-carryover-clear-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-startup-active-gate-closure-carryover-clear-20260508T000000Z/rolling-restart/",
  "owner": "Topology publication convergence ACK pending after startup active-gate closure carryover repair",
  "boundary": "Topology publication owner / publication_convergence / startup active gate support",
  "dominantReason": "publication_pending",
  "currentState": "The startup active-gate seam is closed by migration. The representative rerun now stalls at epoch 5 ACK_PENDING with topology_publication_owner / publication_convergence as the first frontier, pendingAckCount=1, missingPublishedCount=2, and downstream startup active-gate and workflow-progress evidence only.",
  "nextAction": "Review the just-closed startup active-gate package, then extract one focused epoch-5 ACK_PENDING publication-convergence witness and repair or classify the direct publication seam without reopening the closed startup or priority-recovery work.",
  "proof": [
    "Focused epoch-5 ACK_PENDING publication-convergence witness with supporting startup and priority-recovery evidence",
    "Focused publication-convergence regression or classification proof for the selected ACK-pending seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Startup Active Gate Snapshot Coverage Readiness Support Reentry](./done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md)
closes by migration. The direct frontier now sits on
`topology_publication_owner / publication_convergence`, where epoch `5`
remains `ACK_PENDING` with `pendingAckCount=1`, `missingPublishedCount=2`,
and downstream startup active-gate and workflow-progress evidence only.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Poincare` (`019e0632-8b45-75a1-a46d-a0c13d1f9239`) reviewed
      `work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Godel` (`019e0634-9cff-7683-ac30-c54ac830e068`) fixed
      `work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md`.
- [ ] Implementation subagent recorded:
