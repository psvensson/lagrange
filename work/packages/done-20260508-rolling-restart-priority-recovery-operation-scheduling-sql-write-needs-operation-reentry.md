# Rolling Restart Priority Recovery Operation Scheduling Sql Write Needs Operation Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z/rolling-restart/",
  "owner": "Priority recovery operation scheduling for sql_write_operations-p1 after publication ACK-pending canonicalization",
  "boundary": "Rebalancer leader / operation_scheduling / create_recovery_operation",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The publication ACK-pending seam is closed by migration. The representative rerun now reaches epoch 2 PUBLISHED with pendingAckCount=0 and no direct publication debt, but the first frontier stalls on sql_write_operations-p1 under semantic state needs_operation with nextRequiredAction=create_recovery_operation while sql_transactions-p1 remains supporting recovering_in_flight workflow evidence and startup snapshot coverage 3/5 stays downstream.",
  "nextAction": "Review the just-closed publication package, then extract one focused epoch-2 PUBLISHED operation-scheduling witness for sql_write_operations-p1 and repair or classify why the rebalancer leader leaves it at needs_operation without reopening the closed publication package.",
  "proof": [
    "Focused epoch-2 PUBLISHED sql_write_operations-p1 operation-scheduling witness with supporting sql_transactions-p1 and startup active-gate evidence",
    "Focused operation-scheduling regression or classification proof for the selected create_recovery_operation seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-4-stage-2.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Topology Publication Convergence ACK Pending Reentry](./done-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md)
closes by migration. Publication convergence now reaches `PUBLISHED`, but the
representative rerun still fails earlier on `rebalancer_leader /
operation_scheduling`, where `sql_write_operations-p1` remains
`needs_operation` with no created recovery operation while
`sql_transactions-p1` only supplies supporting in-flight workflow evidence.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Mendel` (`019e064a-e08c-7cf2-bc5a-b6e700180dce`) reviewed
      `work/packages/done-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Gibbs` (`019e064d-b451-7a22-8cef-e821c564e4c2`) fixed
      `work/packages/done-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `Curie` (`019e066b-5469-7a12-8b63-0f4228f3bd24`) implemented
      `work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z/rolling-restart/`.
3. Result: failed after `130.0s`.
4. `npm run analyze:distributed-failure` selected root cause class
   `topology` and dominant reason
   `priority_recovery_operation_scheduling_event_driven`.
5. `npm run analyze:topology-convergence` on both report and playback selects
   `rebalancer_leader / operation_scheduling` as the first frontier.
6. The dominant witness is `sql_write_operations-p1` with semantic state
   `needs_operation`, `nextRequiredAction=create_recovery_operation`,
   `actuationState=action_required`, `waitMode=event_driven`, and
   `workflowState=none`.
7. Supporting priority evidence keeps `sql_transactions-p1` on
   `recovering_in_flight` under `operation_workflow_owner /
   workflow_progress`.
8. Supporting startup evidence remains downstream under
   `startup_active_gate_owner / snapshot_coverage` with coverage `3/5`,
   `inactive_nodes=1`, and blocker
   `priority_recovery_progress_class=eligible_but_no_operation_created`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Review the closed publication package before implementation resumes.
2. Extract one focused epoch `2` `PUBLISHED` operation-scheduling witness for
   `sql_write_operations-p1`.
3. Add one focused regression or classification proof for the selected
   `create_recovery_operation` seam.
4. Repair or classify that direct scheduling seam without reopening the closed
   publication package.
5. Run focused tests, touched-file static guardrails, and one representative
   `rolling-restart` rerun.

## Out Of Scope

1. Reopening the closed publication package unless a fresh representative
   artifact restores `topology_publication_owner / publication_convergence`
   above operation scheduling.
2. Reopening downstream startup or workflow-progress seams unless a fresh
   representative artifact promotes them above `rebalancer_leader /
   operation_scheduling`.
3. Broad recovery or harness refactors outside the direct
   `sql_write_operations-p1` scheduling path.
4. Harness timeout changes that hide the current scheduling blocker.

## Boundary Contract

Semantic owners:

1. `rebalancer_leader / operation_scheduling` owns the direct
   `sql_write_operations-p1` `needs_operation` seam in the fresh
   representative artifact.
2. `operation_workflow_owner / workflow_progress` remains supporting context
   while `sql_transactions-p1` continues recovering in flight.
3. `startup_active_gate_owner / snapshot_coverage` remains the next expected
   frontier only after operation scheduling advances or closes.

Canonical contract shape:

1. If `sql_write_operations-p1` remains `needs_operation`, the artifact must
   identify one canonical scheduling reason for why a recovery operation was
   not created.
2. Supporting `sql_transactions-p1` workflow evidence must not be promoted
   above the direct scheduling blocker while the dominant witness remains on
   `sql_write_operations-p1`.
3. This package closes only after a representative rerun proves either the
   operation-scheduling frontier closes or a new named owner boundary
   dominates.

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [x] Extract the focused epoch-2 PUBLISHED operation-scheduling witness and
      its supporting workflow/startup evidence.
- [x] Add the focused regression or classification proof for the selected
      scheduling seam.
- [x] Repair the direct scheduling path or migrate again with proof.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary:
      `node scripts/check-guideline-decision-boundaries.js
      src/rebalancer/unified-rebalancer-segment-4-stage-1.js
      src/rebalancer/unified-rebalancer-segment-4-stage-2.js
      test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`,
      `node scripts/check-guideline-literals.js
      src/rebalancer/unified-rebalancer-segment-4-stage-1.js
      src/rebalancer/unified-rebalancer-segment-4-stage-2.js
      test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`, and
      `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-1.js
      src/rebalancer/unified-rebalancer-segment-4-stage-2.js
      test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`.
- [x] File-scoped baseline recorded before production edits for the touched
      source and focused test files: decision-boundary `0` violations, diff
      hygiene clean, literal-owner `76` new violations limited to
      `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file decision-boundary, literal-owner, or diff hygiene
      violation remains.
- [x] Representative rerun proof completed before package closure.

## Validation

1. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json`
   selected root cause class `topology` and dominant reason
   `priority_recovery_operation_scheduling_event_driven`.
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z.report.json`
   selected `rebalancer_leader / operation_scheduling` as the first frontier
   with dominant witness `sql_write_operations-p1`.
3. `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-publication-ack-pending-canonicalization-20260508T000000Z/rolling-restart/failure-bundle.json`
   matched the report-level scheduling frontier and kept startup snapshot
   coverage as the next expected frontier.
4. Focused witness extraction from the current artifact keeps
   `sql_write_operations-p1` on `semanticState=needs_operation` with
   `nextRequiredAction=create_recovery_operation`, while supporting
   `sql_transactions-p1` remains `recovering_in_flight` under
   `workflow_progress` with an in-flight replacement operation.
5. Focused regression proof now exists in
   `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` as
   `checkRebalance reclaims current needs_operation follow-up work when
   closure-witness surrogate progress only points at another partition`.
6. `npx tap test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
   passes, including
   `checkRebalance reclaims current needs_operation follow-up work when
   closure-witness surrogate progress only points at another partition`,
   after the regression neutralizes the rebalance timer armed by
   `scheduleNextCheck()`.
7. `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-2.js
   test/rebalancer/unified-rebalancer-part-5-2-stage-2.js
   work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md`,
   `node scripts/check-guideline-decision-boundaries.js
   src/rebalancer/unified-rebalancer-segment-4-stage-2.js
   test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`, and
   `node scripts/check-guideline-literals.js
   src/rebalancer/unified-rebalancer-segment-4-stage-2.js
   test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
   all pass on the touched files.
8. Representative rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json
   --scenario rolling-restart --output
   test-output/reports/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z.report.json
   --fast-local --verbose`
   failed after `143.1s`.
9. `npm run analyze:distributed-failure -- --report
   test-output/reports/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z.report.json`
   still classifies the failure as `topology /
   priority_recovery_operation_scheduling_event_driven`.
10. `npm run analyze:topology-convergence --` on both the report and playback
    failure bundle still selects `rebalancer_leader / operation_scheduling`
    with dominant witness `sql_write_operations-p1`.
11. The new representative artifact changes the supporting witness shape:
    `sql_transactions-p1` is now `blocked_unclassified` under
    `rebalancer_handoff` with `nextRequiredAction=schedule_followup_rebalance`,
    not `recovering_in_flight`.
12. Direct playback logs show the `sql_write_operations-p1` rebalancer later
    advanced beyond the stale report witness: at `2026-05-08T07:24:53.480Z`
    it started rebalancing with `moveCount=1`, passed pre-execution handoff at
    `2026-05-08T07:24:53.482Z`, and executed one `replace` move on
    node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
13. The failure bundle’s dominant `sql_write_operations-p1` witness was
    captured earlier at `snapshotCapturedAt=1778225082298`
    (`2026-05-08T07:24:42.298Z`) and still reports `operation_unknown`,
    `operationCount=0`, and `visibilityState=none`, so the representative
    artifact currently lags the later move-execution evidence.
