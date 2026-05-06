# Rolling Restart Startup Active Gate Publication Evidence Priority Recovery Consumer Alignment

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z/rolling-restart/",
  "owner": "Startup active-gate publication-evidence priority-recovery consumer alignment",
  "boundary": "Startup active-gate / publication-convergence priority-recovery consumer alignment",
  "dominantReason": "priority_recovery_rebalancer_handoff_stalled",
  "currentState": "The stale publication-evidence serial-wait consumer seam is closed. The representative rerun now reaches epoch 4 PUBLISHED with startup active 3/5 and snapshot coverage 3/5 on selected snapshot ebc4..., while the current canonical priority-recovery view has sql_transactions-p1 recovering_in_flight and sql_write_operations-p1 blocked_unclassified on rebalancer_leader / rebalancer_handoff. The live owner migrated away from publication-evidence current-summary consumption into a new startup active-gate rebalancer-handoff / retained stale no-progress boundary.",
  "nextAction": "Continue in work/packages/active-20260506-rolling-restart-startup-active-gate-priority-recovery-rebalancer-handoff-stall-reentry.md to separate current canonical handoff state from retained stale selected-snapshot timeout evidence.",
  "proof": [
    "Focused subordinated serial-wait regression",
    "Touched-file static guardrails",
    "Affected failure-bundle presentation test",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "test/control-plane/priority-recovery-snapshot.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-startup-active-gate-priority-recovery-rebalancer-handoff-stall-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Snapshot Coverage Priority Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Startup Active Gate Priority Recovery Rebalancer Handoff Stall Reentry](./active-20260506-rolling-restart-startup-active-gate-priority-recovery-rebalancer-handoff-stall-reentry.md).

## Closure Summary

1. Added a focused regression proving tracked serial-wait normalization must
   ignore a source partition that is already subordinated under a
   spread-satisfied sibling.
2. Repaired
   `src/control-plane/priority-recovery-snapshot-stage-3.js`
   so synthetic serial-wait source extraction skips partition ids already
   consumed by spread-progress sibling evidence.
3. Focused owner proof, failure-bundle presentation proof, and touched-file
   guardrails passed.
4. The representative rerun
   `rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z`
   closed the stale `priority_operation_serial_wait` consumer seam but exposed
   a follow-on epoch-4 startup active-gate seam around current
   rebalancer-handoff state versus retained stale selected-snapshot timeout
   evidence.

## Final Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z/rolling-restart/`.
3. Result: failed after `131.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Publication convergence reaches epoch `4`, status `PUBLISHED`, pending ACK
   count `0`, and missing published count `0`.
6. Current startup active-gate progress now reports no unresolved
   `priorityRecoveryProgressClasses`; the stale
   `priority_operation_serial_wait` class is gone from the current consumer
   view.
7. Current canonical priority-recovery evidence now shows:
   - `sql_transaction_participants-p1`:
     `spread_satisfied_in_flight`
   - `sql_transactions-p1`:
     `recovering_in_flight`
   - `sql_write_operations-p1`:
     `blocked_unclassified` on
     `rebalancer_leader / rebalancer_handoff`
8. Supporting retained no-progress evidence still surfaces an older selected
   snapshot witness with
   `priority_recovery_progress_class=operation_created_but_no_step_transitions`,
   so the representative owner migrated away from publication-evidence current
   summary consumption.

## Residual Closure Inventory

- [x] Extract the `200801Z` active-gate / publication-evidence consumer
      divergence fixture.
- [x] Decide the owner boundary: publication-evidence current-summary
      selection, active-gate normalization, or retained diagnostics merge.
- [x] Add the focused regression and repair the selected consumer path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.
- [x] Split the follow-on epoch-4 startup active-gate handoff / retention seam
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
- [x] Follow-on runtime migration is split into the successor package above.

## Validation

1. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`
2. `./node_modules/.bin/tap test/distributed/harness/__tests__/failure-bundle.test.js`
3. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-3.js`
4. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-3.js`
5. `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-3.js`
6. `git diff --check`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z.report.json --fast-local --verbose`
