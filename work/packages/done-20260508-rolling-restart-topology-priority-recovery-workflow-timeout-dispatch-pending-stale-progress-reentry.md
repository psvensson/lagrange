# Rolling Restart Topology Priority Recovery Workflow Timeout Dispatch Pending Stale Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z/rolling-restart/",
  "owner": "Startup active gate snapshot coverage after dispatch-pending timeout reclassification repair",
  "boundary": "Startup active gate owner / snapshot_coverage / startup readiness support",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The workflow-timeout dispatch-pending stale-progress repair is proved. The representative rerun no longer terminates on operation_workflow_owner/workflow_timeout; epoch 2 PUBLISHED now promotes startup_active_gate_owner / snapshot_coverage as the first frontier with coverage 3/5, two inactive nodes, and startup readiness support downstream only.",
  "nextAction": "Continue in work/packages/active-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md for the migrated startup active-gate snapshot-coverage seam.",
  "proof": [
    "Focused epoch-2 PUBLISHED workflow-timeout witness for sql_write_operations-p1 with supporting sql_transactions-p1 context",
    "Focused workflow-timeout regression for the selected dispatch-pending stale-progress seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md",
    "work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/packages/active-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Topology Priority Recovery Workflow Progress Dispatch Pending Reentry](./done-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md)
closes by migration. The focused workflow-progress repair is preserved, but
the representative rerun restores the direct blocker to
`sql_write_operations-p1` in epoch `2` `PUBLISHED`, where
`operation_stalled -> reconcile_stale_operation_progress` remained unresolved
under `operation_workflow_owner / workflow_timeout` with
`transition_deferred` actuation and workflow phase `dispatch_pending`. The
focused timeout repair is now closed by migration because the representative
rerun removes priority-recovery timeout from the first frontier and promotes
startup active-gate snapshot coverage instead.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z/rolling-restart/`.
3. Result: failed after `132.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. `npm run analyze:distributed-failure` now selects root cause class
   `startup` and dominant reason `BOOTSTRAP_PHASE_INCOMPLETE`.
6. `npm run analyze:topology-convergence` on the report and matching playback
   both select `startup_active_gate_owner / snapshot_coverage` as the first
   frontier, with evidence anchored under
   `publicationConvergence.activeGate.progress`.
7. The dominant frontier now reports `activeGateState=timed_out`,
   `snapshotCoverageComplete=false`, `snapshotCoverageNodeCount=3`,
   `expectedNodeCount=5`, and blockers `inactive_nodes=2,snapshot_coverage=3/5`.
8. `startup_readiness_owner / startup_support_evidence` is the next expected
   frontier after snapshot coverage improves.
9. `jq '.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary'`
   still shows supporting priority-recovery witnesses, but they no longer
   outrank the active-gate frontier.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed workflow-progress dispatch-pending reclassification
   repair from the predecessor package.
2. Extract the focused epoch-2 workflow-timeout witness set for
   `sql_write_operations-p1` with its supporting timeout context.
3. Add one focused workflow-timeout regression for the selected
   `operation_stalled / reconcile_stale_operation_progress` dispatch-pending
   seam.
4. Repair or reclassify the selected stale-progress timeout seam without
   reopening the closed workflow-progress or earlier authoritative-observation
   repairs.
5. Rerun focused tests, touched-file static guardrails, and one
   representative `rolling-restart` scenario.

## Out Of Scope

1. Reopening the predecessor workflow-progress package unless a fresh
   representative artifact restores `workflow_progress` above the timeout
   witness.
2. Broad matrix continuation before the representative five-node blocker
   closes or migrates again.
3. Harness-only timeout increases or blocker relabeling that hide the current
   workflow-timeout debt.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_timeout` owns the opening epoch `2`
   `PUBLISHED` `sql_write_operations-p1` stale-progress seam, but the final
   representative rerun clears that frontier and migrates the direct blocker
   to `startup_active_gate_owner / snapshot_coverage`.
2. `sql_transactions-p1` remains supporting timeout context only unless a
   fresh representative artifact promotes it back above the active-gate
   frontier.
3. `startup_active_gate_owner / snapshot_coverage` becomes the first frontier
   in the closing rerun, with `startup_readiness_owner /
   startup_support_evidence` downstream only.
4. `operation_workflow_owner / workflow_progress` dispatch-pending
   reclassification stays closed unless a fresh representative artifact
   restores that lower boundary above the timeout seam.
5. `rebalancer_leader / operation_scheduling` stays closed unless a fresh
   representative artifact restores `create_recovery_operation` as the direct
   lower owner.

Canonical contract shape:

1. For the opening epoch `2` `PUBLISHED` artifact, `sql_write_operations-p1`
   must either reconcile stale workflow progress or surface one canonical
   workflow-timeout reason why the transition remains deferred in
   `dispatch_pending`.
2. If the representative rerun clears the timeout seam and promotes
   `startup_active_gate_owner / snapshot_coverage` above priority recovery,
   this package closes by migration and the successor package takes ownership
   of the startup seam.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Gauss` (`019e0600-10dc-7bc0-a9b1-4f736f679618`) reviewed
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `James` (`019e0602-72ec-7020-87ea-5d66c58599fb`) fixed
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-progress-dispatch-pending-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `Peirce` (`019e0604-141d-7e83-86cf-f2a244ce2dce`) implemented
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md`.

## Commit And Push Ledger

- Focused package commit: `670c4bd0`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [x] Extract the focused epoch-2 workflow-timeout witness for
      `sql_write_operations-p1` and its supporting timeout context.
- [x] Add the focused regression for the selected workflow-timeout seam.
- [x] Repair the selected workflow-timeout boundary or migrate again with
      proof.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z.report.json`
   selected normalized dominant reason
   `priority_recovery_workflow_timeout_transition_deferred`.
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z.report.json`
   selected `operation_workflow_owner / workflow_timeout` as the first
   frontier while promoting `sql_write_operations-p1` to the dominant
   witness.
3. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z/rolling-restart/failure-bundle.json`
   matched the report-level workflow-timeout frontier and dominant witness.
4. `jq '.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary' test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-reclassify-20260508T000000Z.report.json`
   confirmed the epoch `2` `PUBLISHED` dominant witness for
   `sql_write_operations-p1` with `actuationState=transition_deferred`,
   `nextRequiredAction=reconcile_stale_operation_progress`,
   `blockingBoundary=workflow_timeout`, `waitMode=timeout_reconcile_due`,
   `workflowProgressPhaseId=dispatch_pending`, `latestOperationWorkflowStep=PENDING`,
   `stepAgeMs=59678`, and `stepTimeoutMs=30000`.
5. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` new literal-guideline violations before production edits.
6. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` decision-boundary violations before production edits.
7. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` runtime-grammar violations before production edits.
8. `git diff --check -- work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js work/model-ledger.jsonl`
   passed before production edits.
9. `node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   failed first on the new focused regression because the stale
   `sql_write_operations-p1` `dispatch_pending` `PENDING` row still surfaced
   `actuation.state=transition_deferred`,
   `nextAction=retry`,
   `nextRequiredAction=reconcile_stale_operation_progress`,
   `blockingBoundary=workflow_timeout`, and
   `waitMode=timeout_reconcile_due`.
10. `node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
    passed after the stage-5 reclassification repair with `13/13` subtests and
    `60/60` assertions green, including the new focused epoch-2
    `sql_write_operations-p1` dispatch-pending stale-progress regression.
11. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
    passed with `0` new literal-guideline violations after implementation.
12. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
    passed with `0` decision-boundary violations after implementation.
13. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-5-stage-5.js`
   passed with `0` runtime-grammar violations after implementation.
14. `git diff --check -- work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js work/model-ledger.jsonl`
   passed after implementation.
15. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json --fast-local --verbose`
    failed after `132.3s`, but the direct priority-recovery timeout frontier
    no longer leads the representative gate.
16. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json`
    selected root cause class `startup` and dominant reason
    `BOOTSTRAP_PHASE_INCOMPLETE`.
17. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json`
    selected `startup_active_gate_owner / snapshot_coverage` as the first
    frontier with coverage `3/5`.
18. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z/rolling-restart/failure-bundle.json`
    matched the report-level startup active-gate frontier and coverage state.

## Progress Notes

1. The predecessor package closed its local workflow-progress seam, but the
   representative owner boundary moved back to `workflow_timeout` on the same
   partition and workflow phase.
2. The focused witness remains narrower than the earlier timeout package:
   `sql_write_operations-p1` is still in epoch `2` `PUBLISHED`, but the stale
   timeout seam occurs on `dispatch_pending` with a `PENDING` workflow step
   rather than the earlier `target_creation` / `CREATING` witness.
3. The stage-5 dispatch-pending reclassification now covers both planning-only
   `persisted_not_dispatched` workflow waits and stale authoritative/cache
   `PENDING` rows that would otherwise reopen the same seam as
   `workflow_timeout`.
4. The representative rerun closes this timeout package by migration because
   startup active-gate snapshot coverage now outranks all remaining
   priority-recovery evidence.
