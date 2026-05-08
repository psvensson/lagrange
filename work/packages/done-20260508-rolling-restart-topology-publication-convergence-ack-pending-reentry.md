# Rolling Restart Topology Publication Convergence ACK Pending Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z/rolling-restart/",
  "owner": "Topology publication convergence ACK pending after startup active-gate closure carryover repair",
  "boundary": "Topology publication owner / publication_convergence / startup active gate support",
  "dominantReason": "publication_pending",
  "currentState": "The direct ACK-pending publication classification seam is repaired and proved. The representative rerun no longer stops on topology_publication_owner/publication_convergence: publication reaches epoch 2 PUBLISHED with pendingAckCount=0, and the first frontier migrates to rebalancer_leader / operation_scheduling on sql_write_operations-p1 while startup active-gate snapshot coverage remains downstream support.",
  "nextAction": "Continue in work/packages/active-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md for the migrated sql_write_operations-p1 operation-scheduling seam.",
  "proof": [
    "Focused epoch-5 ACK_PENDING publication-convergence witness with supporting startup and priority-recovery evidence",
    "Focused publication-convergence regression or classification proof for the selected ACK-pending seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md",
    "work/packages/done-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md",
    "work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "work/packages/active-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md"
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
- [x] Implementation subagent recorded:
      Agent `Tesla` (`019e0636-7674-7101-8a51-c19077af073e`) implemented
      `work/packages/done-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md`.

## Commit And Push Ledger

- Focused package commit: `6020e71d`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Package Bookkeeping Note

`6020e71d` remains the focused implementation and closure slice for this
package. Commit `c56ba7dc` later amended only this closed package markdown to
fill the Commit And Push Ledger, so the ledger cannot be read as "the last
commit that touched this file".

Under the current tracker convention, the truthful interpretation is narrower:
the ledger proves which focused package slice closed and was pushed, while
later bookkeeping-only edits may still amend the closed package file. This
repair keeps that interpretation explicit and aligns `touchedFiles` with what
`6020e71d` actually changed.

## Current Evidence

1. The focused direct witness is still the epoch `5` `ACK_PENDING`
   publication-convergence frontier from
   `test-output/reports/rolling-restart-after-startup-active-gate-closure-carryover-clear-20260508T000000Z.report.json`,
   with `pendingAckCount=1`, `blockedNodeCount=0`,
   `missingPublishedCount=2`, `recoveryProtocolState=publication_pending`,
   and `prioritySpreadPending=true`.
2. The supporting startup witness remains under
   `publicationConvergence.activeGate.progress` in that predecessor artifact
   with coverage `2/5`, `inactive_nodes=4`, and missing-published startup
   support only.
3. The local repair keeps `pending_ack_nodes` canonical in
   `summary.failureClassification` and `diagnostics.failure.reasonCounts`
   while preserving `publication_missing_active_node=...` evidence as
   supporting convergence context.
4. The representative rerun after the repair is
   `test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json`.
5. That rerun failed after `130.0s`, but publication no longer owns the first
   frontier: the fresh artifact reaches epoch `2` `PUBLISHED` with
   `pendingAckCount=0`, `missingPublishedCount=0`, and the dominant witness
   migrates to `rebalancer_leader / operation_scheduling` on
   `sql_write_operations-p1`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract one focused epoch `5` ACK-pending publication-convergence witness.
2. Add one focused regression or classification proof for the direct
   publication seam.
3. Repair or classify that direct publication seam without reopening the
   closed startup active-gate or priority-recovery packages.
4. Run focused tests and touched-file static guardrails.
5. Leave the package open until representative rerun proof is complete.

## Out Of Scope

1. Reopening the closed startup active-gate package unless a fresh
   representative artifact restores `startup_active_gate_owner /
   snapshot_coverage` above publication convergence.
2. Reopening closed priority-recovery workflow packages unless a fresh
   representative artifact restores those owners above publication
   convergence.
3. Broad failure-bundle triage refactors outside the direct ACK-pending
   classification path.
4. Harness timeout changes that hide the current publication blocker.

## Boundary Contract

Semantic owners:

1. `topology_publication_owner / publication_convergence` owns the direct
   epoch `5` ACK-pending seam.
2. `startup_active_gate_owner / snapshot_coverage` remains supporting context
   while the direct publication frontier is still open.
3. `operation_workflow_owner / workflow_progress` remains downstream context
   unless a fresh representative artifact promotes it back above publication
   convergence.

Canonical contract shape:

1. While `pendingAckCount > 0`, the direct publication failure
   classification must stay on ACK debt rather than promoting supporting
   `publication_missing_active_node=...` startup evidence above the direct
   frontier.
2. Missing-published node ids and snapshot-coverage blockers must remain
   preserved as supporting evidence and convergence blockers.
3. This package closes only after a representative rerun proves either the
   publication frontier closes or a new named owner boundary dominates.

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [x] Extract the focused epoch-5 ACK-pending publication witness and its
      supporting startup evidence.
- [x] Add the focused classification proof for the direct publication seam.
- [x] Repair the local publication classification path without reopening the
      closed startup or priority-recovery seams.
- [x] Run the representative rerun and record that the direct frontier
      migrates away from publication convergence.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary.
- [x] File-scoped baseline recorded before production edits for the touched
      harness source and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file decision-boundary, literal-owner, or diff hygiene
      violation remains.
- [x] Representative rerun proof completed before package closure.

## Validation

1. `node --test --test-name-pattern="keeps direct ACK-pending publication blockers canonical over missing-published startup support|keeps current active-gate ACK closure ahead of stale best-progress debt|separates active-gate snapshot coverage from serial priority recovery progress|keeps startup active-gate snapshot coverage from restoring stale publication debt" test/distributed/harness/__tests__/failure-bundle.test.js`
   passed `4/4` targeted subtests after the direct ACK-pending classification
   repair.
2. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
   reported `0` decision-boundary guideline violations.
3. `node scripts/check-guideline-literals.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`
   reported `0` new literal-guideline violations.
4. `git diff --check -- test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js work/packages/active-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md`
   passed before the package rename.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json --fast-local --verbose`
   failed after `130.0s`, but publication no longer remained the first
   frontier.
6. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json`
   selected root cause class `topology` and dominant reason
   `priority_recovery_operation_scheduling_event_driven`.
7. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json`
   selected `rebalancer_leader / operation_scheduling` as the first frontier
   with dominant witness `sql_write_operations-p1` under semantic state
   `needs_operation`.
8. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z/rolling-restart/failure-bundle.json`
   matched the report-level scheduling frontier and kept
   `startup_active_gate_owner / snapshot_coverage` only as the next expected
   frontier.
9. `npm run work:validate -- work/packages/done-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-readiness-support-reentry.md`
   passed after the bookkeeping repair for closure-proof interpretation,
   predecessor `touchedFiles`, and live successor-chain handoff metadata.

## Progress Notes

1. The live report/playback pair already proved that startup active-gate
   coverage is no longer the first frontier; publication convergence owns the
   next direct seam.
2. The focused local bug was not in canonical publication evidence merging.
   It was in the failure-bundle classification path, where supporting
   `publication_missing_active_node=...` evidence still outranked direct ACK
   debt.
3. The harness repair now keeps `pending_ack_nodes` canonical in
   `summary.failureClassification` and `diagnostics.failure.reasonCounts`
   while preserving missing-published node evidence and convergence blockers.
4. `topFailures.topReasons` still reflects the raw source report reasonCounts,
   so this package intentionally proves the repaired seam through
   `summary.failureClassification` and `diagnostics.failure`.
5. The representative rerun proves the publication frontier is closed by
   migration rather than by scenario success.
6. The successor seam is now narrower and earlier: `sql_write_operations-p1`
   under `rebalancer_leader / operation_scheduling`, with
   `nextRequiredAction=create_recovery_operation` and
   `waitMode=event_driven`.
