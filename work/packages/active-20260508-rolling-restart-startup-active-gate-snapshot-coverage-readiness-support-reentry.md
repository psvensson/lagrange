# Rolling Restart Startup Active Gate Snapshot Coverage Readiness Support Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z/rolling-restart/",
  "owner": "Startup active gate snapshot coverage after dispatch-pending timeout reclassification repair",
  "boundary": "Startup active gate owner / snapshot_coverage / startup readiness support",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The priority-recovery timeout seam is closed by migration. The representative rerun now stalls at epoch 2 PUBLISHED with startup_active_gate_owner / snapshot_coverage as the first frontier, coverage 3/5, two inactive nodes, and startup_readiness_owner support evidence downstream only.",
  "nextAction": "Review the just-closed workflow-timeout package, then extract one focused epoch-2 PUBLISHED startup active-gate snapshot-coverage witness for coverage 3/5 with the two inactive nodes and repair or classify the direct startup seam without reopening the closed priority-recovery work.",
  "proof": [
    "Focused epoch-2 PUBLISHED startup active-gate snapshot-coverage witness for coverage 3/5 with supporting readiness evidence",
    "Focused startup active-gate regression or classification proof for the selected coverage seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Topology Priority Recovery Workflow Timeout Dispatch Pending Stale Progress Reentry](./done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md)
closes by migration. The focused timeout repair is preserved, but the
representative rerun no longer spends the direct frontier on priority
recovery. The live blocker now sits on `startup_active_gate_owner /
snapshot_coverage`, where epoch `2` `PUBLISHED` remains stalled at coverage
`3/5` with two inactive nodes and startup readiness support evidence only
downstream.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z/rolling-restart/`.
3. Result: failed after `132.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. `npm run analyze:distributed-failure` selected root cause class `startup`
   and dominant reason `BOOTSTRAP_PHASE_INCOMPLETE`.
6. `npm run analyze:topology-convergence` on the report and matching playback
   both select `startup_active_gate_owner / snapshot_coverage` as the first
   frontier, with evidence anchored under
   `publicationConvergence.activeGate.progress`.
7. The dominant frontier reports `activeGateState=timed_out`,
   `snapshotCoverageComplete=false`, `snapshotCoverageNodeCount=3`,
   `expectedNodeCount=5`, and blockers `inactive_nodes=2,snapshot_coverage=3/5`.
8. `startup_readiness_owner / startup_support_evidence` is the next expected
   frontier once snapshot coverage improves.
9. `priorityRecoveryProgressSummary` still contains supporting operation
   workflow evidence, but it no longer outranks the active-gate frontier.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed workflow-timeout dispatch-pending repair from the
   predecessor package.
2. Extract the focused epoch-2 active-gate snapshot-coverage witness set and
   the supporting startup readiness evidence.
3. Add one focused regression or classification proof for the selected
   snapshot-coverage seam.
4. Repair or classify the selected startup active-gate seam without reopening
   the closed priority-recovery packages.
5. Rerun focused tests, touched-file static guardrails, and one
   representative `rolling-restart` scenario.

## Out Of Scope

1. Reopening the predecessor workflow-timeout package unless a fresh
   representative artifact restores that boundary above the active-gate
   frontier.
2. Broad matrix continuation before the representative five-node blocker
   closes or migrates again.
3. Harness-only timeout increases or blocker relabeling that hide the current
   startup active-gate debt.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `startup_active_gate_owner / snapshot_coverage` owns the direct epoch `2`
   `PUBLISHED` active-gate seam.
2. `startup_readiness_owner / startup_support_evidence` remains downstream
   context unless a fresh representative artifact promotes it above snapshot
   coverage.
3. `operation_workflow_owner / workflow_timeout` stays closed unless a fresh
   representative artifact restores priority-recovery timeout above the
   active-gate frontier.
4. `operation_workflow_owner / workflow_progress` and
   `rebalancer_leader / operation_scheduling` stay closed unless a fresh
   representative artifact restores those lower owners above the active-gate
   seam.

Canonical contract shape:

1. For the live epoch `2` `PUBLISHED` artifact, startup active-gate snapshot
   coverage must either advance beyond `3/5` or surface one canonical active
   gate reason why the remaining two nodes cannot join coverage.
2. If a fresh representative rerun moves the direct frontier below active-gate
   coverage, this package closes by migration and the successor package takes
   ownership of that seam.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded:
- [ ] Fix subagent recorded or explicitly not needed:
- [ ] Implementation subagent recorded:

## Residual Closure Inventory

- [ ] Review the just-closed predecessor package on the same sprint boundary.
- [ ] Fix any predecessor-review findings before implementation resumes.
- [ ] Extract the focused epoch-2 active-gate snapshot-coverage witness and
      startup support evidence.
- [ ] Add the focused regression or classification proof for the selected
      snapshot-coverage seam.
- [ ] Repair the selected startup active-gate boundary or migrate again with
      proof.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json`
   selected root cause class `startup` and dominant reason
   `BOOTSTRAP_PHASE_INCOMPLETE`.
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json`
   selected `startup_active_gate_owner / snapshot_coverage` as the first
   frontier with coverage `3/5`.
3. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z/rolling-restart/failure-bundle.json`
   matched the report-level startup active-gate frontier and coverage state.

## Progress Notes

1. The predecessor timeout package removed priority-recovery timeout from the
   first frontier; startup active-gate snapshot coverage is now the direct
   blocker.
