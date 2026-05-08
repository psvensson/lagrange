# Rolling Restart Startup Active Gate Snapshot Coverage Readiness Support Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-startup-active-gate-closure-carryover-clear-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-startup-active-gate-closure-carryover-clear-20260508T000000Z/rolling-restart/",
  "owner": "Startup active gate snapshot coverage readiness support after priority-recovery timeout closure",
  "boundary": "Startup active gate owner / snapshot_coverage / readiness support",
  "dominantReason": "BOOTSTRAP_PHASE_INCOMPLETE",
  "currentState": "The startup active-gate closure-carryover repair is proved. The representative rerun no longer terminates on startup_active_gate_owner/snapshot_coverage; epoch 5 ACK_PENDING now promotes topology_publication_owner / publication_convergence as the first frontier with pendingAckCount=1 and missingPublishedCount=2, while startup active-gate and workflow-progress evidence move downstream only.",
  "nextAction": "Continue in work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md for the migrated publication-to-operation-scheduling successor chain.",
  "proof": [
    "Focused epoch-2 PUBLISHED startup active-gate snapshot-coverage witness for coverage 3/5 with supporting readiness evidence",
    "Focused startup active-gate regression or classification proof for the selected coverage seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md",
    "work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js",
    "work/model-ledger.jsonl",
    "work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md"
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
10. The extracted direct witness from both report and playback carries
    `closureRecordId=CL-003` and
    `closureWitnessClass=publication_converged_priority_spread_pending`
    inside `publicationConvergence.activeGate.progress` even though
    `prioritySpreadSatisfied=true`, `gateReasonCount=0`, and
    `snapshotCoverageComplete=false`.
11. That direct-witness mismatch points at stale closure carryover in the
    canonical active-gate merge path rather than a live priority-spread
    blocker.

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

- [x] Review subagent recorded:
      Agent `Avicenna` (`019e0612-38a8-7201-b343-8a4183fb7609`) reviewed
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Noether` (`019e0614-5ad9-7aa3-8d34-d5b417924930`) fixed
      `work/packages/done-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-dispatch-pending-stale-progress-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `Aquinas` (`019e061a-2026-7ad2-95d7-12380b3092e7`) implemented
      `work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md`.

## Commit And Push Ledger

- Focused package commit: `7bf8a526`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [x] Extract the focused epoch-2 active-gate snapshot-coverage witness and
      startup support evidence.
- [x] Add the focused regression or classification proof for the selected
      snapshot-coverage seam.
- [x] Repair the selected startup active-gate boundary or migrate again with
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

1. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json`
   selected root cause class `startup` and dominant reason
   `BOOTSTRAP_PHASE_INCOMPLETE`.
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z.report.json`
   selected `startup_active_gate_owner / snapshot_coverage` as the first
   frontier with coverage `3/5`.
3. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-priority-recovery-dispatch-pending-timeout-reclassify-20260508T000000Z/rolling-restart/failure-bundle.json`
   matched the report-level startup active-gate frontier and coverage state.
4. `node --test --test-name-pattern="clears stale priority-spread closure from the direct startup active-gate witness once snapshot coverage owns the blocker|does not classify startup-only active-gate witness in load-mode playback details" test/distributed/harness/__tests__/failure-bundle.test.js`
   passed `2/2` targeted subtests after the publication-evidence carryover
   repair.
5. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js`
   reported `0` decision-boundary guideline violations.
6. `git diff --check -- test/distributed/harness/publication-evidence-contract.js test/distributed/harness/__tests__/failure-bundle-core-10-test-cases.js work/packages/active-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md`
   passed.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-startup-active-gate-closure-carryover-clear-20260508T000000Z.report.json --fast-local --verbose`
   failed after `138.4s`, but the direct frontier moved above startup
   active-gate coverage.
8. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-startup-active-gate-closure-carryover-clear-20260508T000000Z.report.json`
   selected root cause class `topology` and dominant reason
   `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
9. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-startup-active-gate-closure-carryover-clear-20260508T000000Z.report.json`
   and the matching playback failure bundle both selected
   `topology_publication_owner / publication_convergence` as the first
   frontier with `publicationStatus=ACK_PENDING`, `pendingAckCount=1`, and
   `missingPublishedCount=2`.

## Progress Notes

1. The predecessor timeout package removed priority-recovery timeout from the
   first frontier; startup active-gate snapshot coverage is now the direct
   blocker.
2. The direct startup witness was not misclassified by
   `classifyActiveGateClosureWitness()`; the stale CL-003 was being merged back
   into canonical `activeGate` and `activeGateProgress` records by
   `publication-evidence-contract.js`.
3. The local repair now clears that inherited CL-003 carryover when the direct
   startup active-gate witness has `prioritySpreadSatisfied=true`,
   `gateReasons=[]`, and incomplete snapshot coverage.
4. The representative rerun closes this startup package by migration because
   publication convergence at epoch `5` `ACK_PENDING` now outranks startup
   active-gate coverage.
