# Rolling Restart Priority Recovery Operation Scheduling Sql Write Needs Operation Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z/rolling-restart/",
  "owner": "Priority recovery operation scheduling for sql_write_operations-p1 after publication ACK-pending canonicalization",
  "boundary": "Rebalancer leader / operation_scheduling / create_recovery_operation",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The direct sql_write_operations-p1 scheduling seam advanced during the closure-driving rerun. The report and failure bundle still classify rebalancer_leader / operation_scheduling because a stale dominant witness captured at 2026-05-08T07:24:42.298Z keeps sql_write_operations-p1 at needs_operation with operation_unknown, operationCount=0, and visibilityState=none, but playback shows the rebalancer started at 2026-05-08T07:24:53.480Z and executed a replace move at 2026-05-08T07:24:53.482Z while startup snapshot coverage remains 2/5 under PUBLISHED epoch 4.",
  "nextAction": "Review the just-closed operation-scheduling package, then extract one focused stale-planning visibility witness proving the failure bundle keeps a pre-move priority-recovery snapshot after move execution and repair or classify the planning-only reconstruction path that feeds startup snapshot coverage.",
  "proof": [
    "Focused direct operation-scheduling regression proving current needs_operation follow-up work is reclaimed",
    "Focused stale-planning visibility witness tying pre-move snapshot capture to post-move playback execution",
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
  "successor": "work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Topology Publication Convergence ACK Pending Reentry](./done-20260508-rolling-restart-topology-publication-convergence-ack-pending-reentry.md)
closes by migration. The focused regression repaired the direct scheduling seam
enough for the closure-driving rerun to execute a `sql_write_operations-p1`
`replace` move, but the report and failure bundle still present a stale
`needs_operation` witness captured about `11s` earlier. This package therefore
closes by migration to stale priority recovery visibility feeding startup
active-gate coverage, not by frontier replacement inside the report-level
artifact.

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

## Commit And Push Ledger

- Focused package commit: `1dcd59d1`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z/rolling-restart/`.
3. Result: failed after `143.1s`; report timestamp `2026-05-08T07:25:55.013Z`.
4. `npm run analyze:distributed-failure` still classifies the rerun as
   `topology / priority_recovery_operation_scheduling_event_driven`.
5. `npm run analyze:topology-convergence` on both the report and playback
   failure bundle still selects `rebalancer_leader / operation_scheduling` as
   the first frontier and `startup_active_gate_owner / snapshot_coverage` as
   the next expected frontier.
6. The dominant witness remains `sql_write_operations-p1` with
   `semanticState=needs_operation`,
   `nextRequiredAction=create_recovery_operation`,
   `actuationState=action_required`, `waitMode=event_driven`,
   `workflowState=none`, `visibilityState=none`, and
   `snapshotCapturedAt=1778225082298` (`2026-05-08T07:24:42.298Z`).
7. Supporting priority evidence changed shape: `sql_transactions-p1` is now
   `blocked_unclassified` under `rebalancer_handoff` with
   `nextRequiredAction=schedule_followup_rebalance` and
   `latestOperationStatus=removed`.
8. Supporting startup evidence remains downstream under
   `startup_active_gate_owner / snapshot_coverage` with coverage `2/5`,
   `inactive_nodes=2`, and blocker signature
   `inactive_nodes=2|snapshot_coverage=2/5|priority_recovery_progress_class=eligible_but_no_operation_created`.
9. Playback later advances beyond the stale witness: at
   `2026-05-08T07:24:53.480Z` the rebalancer starts `sql_write_operations-p1`
   with `moveCount=1`, then at `2026-05-08T07:24:53.482Z` it reaches
   `preExecutionHandoffState=ready_to_execute` and executes one `replace`
   move on node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Review the closed publication package before implementation resumes.
2. Extract one focused `PUBLISHED` operation-scheduling witness for
   `sql_write_operations-p1` together with the paired playback execution
   evidence from the same representative rerun.
3. Add one focused regression or classification proof for the selected
   `create_recovery_operation` seam.
4. Repair or classify that direct scheduling seam and, if the rerun only
   advances it in playback, record the explicit migration to stale planning
   visibility without reopening the closed publication package.
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
   `sql_write_operations-p1` `needs_operation` seam surfaced by the report and
   failure-bundle witnesses.
2. The stale planning and priority-recovery visibility readers own the
   follow-on truth repair once playback proves the same partition advanced
   beyond that stale witness in the same rerun.
3. `startup_active_gate_owner / snapshot_coverage` remains the named
   downstream consumer and successor frontier once the direct move execution
   exists.

Canonical contract shape:

1. If `sql_write_operations-p1` remains `needs_operation` in the report-level
   artifact, validation must still check whether playback for that same rerun
   later executed the missing recovery move.
2. When playback proves a later move on the same partition and epoch, this
   package may close by migration rather than frontier replacement, but the
   package record must name the stale-visibility successor boundary explicitly.
3. Supporting `sql_transactions-p1` evidence may change shape, but it must not
   erase the fact that the stale `sql_write_operations-p1` witness is what the
   report-level analyzer still classifies.
4. This package closes only after a representative rerun proves either the
   direct scheduling frontier still dominates without later move execution, or
   the later move execution exists and the named successor package owns the
   stale planning visibility residual.

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [x] Extract the focused operation-scheduling witness and its supporting
      workflow/startup evidence.
- [x] Add the focused regression or classification proof for the selected
      scheduling seam.
- [x] Repair the direct scheduling path or record the named stale-visibility
      migration with proof.

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

1. Focused regression proof now exists in
   `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` as
   `checkRebalance reclaims current needs_operation follow-up work when
   closure-witness surrogate progress only points at another partition`.
2. `npx tap test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
   passes, including
   `checkRebalance reclaims current needs_operation follow-up work when
   closure-witness surrogate progress only points at another partition`,
   after the regression neutralizes the rebalance timer armed by
   `scheduleNextCheck()`.
3. `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-2.js
   test/rebalancer/unified-rebalancer-part-5-2-stage-2.js
   work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md`,
   `node scripts/check-guideline-decision-boundaries.js
   src/rebalancer/unified-rebalancer-segment-4-stage-2.js
   test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`, and
   `node scripts/check-guideline-literals.js
   src/rebalancer/unified-rebalancer-segment-4-stage-2.js
   test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
   all pass on the touched files.
4. Representative rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json
   --scenario rolling-restart --output
   test-output/reports/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z.report.json
   --fast-local --verbose`
   failed after `143.1s`.
5. `npm run analyze:distributed-failure -- --report
   test-output/reports/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z.report.json`
   still classifies the failure as `topology /
   priority_recovery_operation_scheduling_event_driven`.
6. `npm run analyze:topology-convergence --` on both the report and playback
   failure bundle still selects `rebalancer_leader / operation_scheduling`,
   while `startup_active_gate_owner / snapshot_coverage` remains the next
   expected frontier.
7. The closure-driving rerun's dominant witness keeps
   `sql_write_operations-p1` on `semanticState=needs_operation`,
   `nextRequiredAction=create_recovery_operation`,
   `actuationState=action_required`, `waitMode=event_driven`,
   `workflowState=none`, and `visibilityState=none` at
   `snapshotCapturedAt=1778225082298`
   (`2026-05-08T07:24:42.298Z`).
8. The supporting witness shape changed:
   `sql_transactions-p1` is now `blocked_unclassified` under
   `rebalancer_handoff` with `nextRequiredAction=schedule_followup_rebalance`
   and `latestOperationStatus=removed`, not `recovering_in_flight`.
9. Direct playback logs show the `sql_write_operations-p1` rebalancer later
   advanced beyond the stale report witness: at `2026-05-08T07:24:53.480Z` it
   started rebalancing with `moveCount=1`, then at `2026-05-08T07:24:53.482Z`
   it reached `preExecutionHandoffState=ready_to_execute` and executed one
   `replace` move on node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
10. Because the closure-driving rerun still reports the stale
    `operation_unknown` witness while playback proves later move execution,
    this package closed by migration to
    `startup_active_gate_owner / snapshot_coverage /
    priority_recovery_progress_visibility`, not by raw frontier replacement in
    the report-level artifact.
