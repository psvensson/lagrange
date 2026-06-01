# Rolling Restart Startup Active Gate Snapshot Coverage Priority Serial-Wait Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z/rolling-restart/",
  "owner": "Startup active-gate snapshot coverage and priority workflow progress under serial wait",
  "boundary": "Startup active-gate snapshot-coverage / priority serial-wait workflow-progress reentry",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The stage-3 mixed-summary serial-wait source seam is closed. The representative rerun still times out at startup snapshot coverage 3/5, but canonical decision snapshots now show sql_transaction_participants-p1 spread_satisfied_in_flight, sql_transactions-p1 recovering_in_flight on its own pending replace, and sql_write_operations-p1 back on eligible_but_no_operation_created. publicationConvergence.activeGate.progress still retains stale priority_operation_serial_wait consumer data, so the representative owner migrated away from snapshot-stage-3 workflow-progress synthesis.",
  "nextAction": "Continue in work/packages/done-20260506-rolling-restart-startup-active-gate-publication-evidence-priority-recovery-consumer-alignment.md to lock the 200801Z consumer divergence fixture and repair publication-evidence / active-gate consumption.",
  "proof": [
    "Focused mixed-summary spread-satisfied sibling regression",
    "Touched-file static guardrails",
    "Affected failure-bundle presentation test",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "test/control-plane/priority-recovery-snapshot.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-priority-operation-creation-snapshot-coverage-reentry.md",
  "successor": "work/packages/done-20260506-rolling-restart-startup-active-gate-publication-evidence-priority-recovery-consumer-alignment.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Priority Operation Creation Snapshot Coverage Reentry](./done-20260506-rolling-restart-startup-active-gate-priority-operation-creation-snapshot-coverage-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Startup Active Gate Publication Evidence Priority Recovery Consumer Alignment](./done-20260506-rolling-restart-startup-active-gate-publication-evidence-priority-recovery-consumer-alignment.md).

## Closure Summary

1. Added a focused regression proving mixed-summary serial-wait normalization
   must ignore a removed summary row when the sibling live operation already
   satisfies spread on an eligible target.
2. Repaired
   `src/control-plane/priority-recovery-snapshot-stage-3.js`
   so workflow-owned mixed-summary source selection can reuse the sibling
   snapshot keyed by `latestOperationId` instead of inheriting target
   visibility from the removed summary row.
3. Focused owner proof, presentation proof, and touched-file guardrails passed.
4. The representative rerun
   `rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z`
   closed the stage-3 serial-wait seam but exposed a follow-on consumer seam:
   canonical decision snapshots cleared `priority_operation_serial_wait`,
   while `publicationConvergence.activeGate.progress` still retained that
   stale class.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z/rolling-restart/`.
3. Result: failed after `131.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Publication convergence reaches epoch `2`, status `PUBLISHED`, pending ACK
   count `0`, blocked node count `0`, and recovery protocol state
   `priority_spread_pending`.
6. Canonical decision snapshots now show:
   - `sql_transaction_participants-p1`:
     `spread_satisfied_in_flight`
   - `sql_transactions-p1`:
     `recovering_in_flight` on pending operation
     `1755aa39-c33e-4758-9567-bac16566b522`
   - `sql_write_operations-p1`:
     `needs_operation` / `eligible_but_no_operation_created`
7. The selected startup active-gate view still reports snapshot coverage `3/5`
   on selected snapshot node `8be8...` and retains stale
   `priority_operation_serial_wait` inside
   `publicationConvergence.activeGate.progress.priorityRecoveryProgressClasses`.
8. Supporting node `8be8...` logs show repeated `SELECT * FROM nodes` query
   timeouts, authoritative discovery repair failures, and websocket reconnect
   timeouts to seed `7493...`, but those are still supporting evidence rather
   than the repaired owner boundary.

## Residual Closure Inventory

- [x] Extract the focused mixed-summary spread-satisfied sibling regression.
- [x] Repair the selected snapshot-stage-3 owner path.
- [x] Preserve the earlier mixed-summary serial-wait retention regression.
- [x] Rerun touched-file guardrails, presentation proof, and the
      representative scenario.
- [x] Split the follow-on publication-evidence / active-gate consumer seam
      into a new active package before closure.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, or runtime-grammar
      violation remains.
- [x] Follow-on consumer drift is split into the successor package above.

## Validation

1. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`
2. `./node_modules/.bin/tap test/distributed/harness/__tests__/failure-bundle.test.js`
3. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
4. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
5. `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z.report.json --verbose`
