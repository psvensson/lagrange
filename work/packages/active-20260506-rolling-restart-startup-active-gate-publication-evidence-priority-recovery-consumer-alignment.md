# Rolling Restart Startup Active Gate Publication Evidence Priority Recovery Consumer Alignment

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z/rolling-restart/",
  "owner": "Startup active-gate publication-evidence priority-recovery consumer alignment",
  "boundary": "Startup active-gate / publication-convergence priority-recovery consumer alignment",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The stage-3 serial-wait source seam is closed, but the representative rerun still times out at startup snapshot coverage 3/5 on selected snapshot 8be8... because publicationConvergence.activeGate.progress retains stale priority_operation_serial_wait even though canonical decision snapshots now show sql_transaction_participants-p1 spread_satisfied_in_flight, sql_transactions-p1 recovering_in_flight on its own pending replace, and sql_write_operations-p1 back on eligible_but_no_operation_created.",
  "nextAction": "Build the focused 200801Z consumer divergence fixture, decide whether the stale class is owned by publication-evidence current-summary selection, active-gate normalization, or a retained diagnostics merge, then repair only that consumer path.",
  "proof": [
    "Focused 200801Z publication-evidence / active-gate consumer divergence fixture",
    "Owner consumer regression",
    "Affected presentation tests",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "test/distributed/harness/publication-evidence-contract.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/distributed/harness/__tests__/failure-bundle-core-11-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Snapshot Coverage Priority Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md)
closed by migration. The mixed-summary stage-3 repair landed, but the
representative rerun still classifies the startup active gate from stale
consumer data.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-mixed-summary-spread-satisfied-sibling-20260506T200801Z/rolling-restart/`.
3. Result: failed after `131.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification still reports root cause class `topology`,
   failure class `priority_recovery_progress_blocked`, and dominant reason
   `priority_recovery_workflow_progress_transition_deferred`.
6. Publication convergence reaches epoch `2`, status `PUBLISHED`, pending ACK
   count `0`, blocked node count `0`, and recovery protocol state
   `priority_spread_pending`.
7. Canonical decision snapshots now show:
   - `sql_transaction_participants-p1`:
     `spread_satisfied_in_flight`
   - `sql_transactions-p1`:
     `recovering_in_flight` on pending operation
     `1755aa39-c33e-4758-9567-bac16566b522`
   - `sql_write_operations-p1`:
     `needs_operation` / `eligible_but_no_operation_created`
8. `publicationConvergence.activeGate.progress.priorityRecoveryProgressClasses`
   still reports unresolved class `priority_operation_serial_wait` and keeps
   blocker signature
   `snapshot_coverage=3/5|priority_recovery_progress_class=priority_operation_serial_wait`.
9. The selected snapshot node is now `8be8...`; it reports snapshot coverage
   `3/5` and selected missing published node ids `35a891...`, `8be8...`, and
   `ebc4...`.
10. Supporting node `8be8...` logs show repeated `SELECT * FROM nodes` query
    timeouts, authoritative discovery repair failures, and websocket reconnect
    timeouts to seed `7493...`, but those signals are still subordinate until
    the consumer alignment seam is resolved.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Build a focused `200801Z` fixture that preserves the divergence between
   canonical decision snapshots and
   `publicationConvergence.activeGate.progress.priorityRecoveryProgressClasses`.
2. Decide whether the selected owner is publication-evidence current-summary
   selection, active-gate normalization, or a retained diagnostics merge.
3. Repair only the selected consumer path.
4. Preserve the closed mixed-summary stage-3 regression.

## Out Of Scope

1. Reopening the closed stage-3 serial-wait source repair unless the same raw
   decision snapshot contradiction re-enters.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Canonical priority-recovery current summary is owned by the normalized
   decision snapshots and priority-recovery observation.
2. Startup active-gate and publication-convergence consumers may summarize that
   owner state, but they must not retain stale progress classes once the
   canonical summary changes.
3. Transport/query pressure remains supporting evidence unless it directly
   changes the canonical current summary or selected snapshot coverage owner.

Canonical contract shape:

1. `publicationConvergence.activeGate.progress.priorityRecoveryProgressClasses`
   must align with the canonical current summary for unresolved classes,
   semantic states, and blocked partition ids.
2. `priority_operation_serial_wait` must not survive in active-gate progress
   once the canonical decision snapshot owner clears it.
3. Snapshot-coverage disagreement must still surface the selected missing
   published node ids for node `8be8...`.
4. Retained best-progress or publication-evidence merges may preserve stronger
   coverage evidence, but they must not restore a stale priority-recovery
   blocker class.

## Residual Closure Inventory

- [ ] Extract the `200801Z` active-gate / publication-evidence consumer
      divergence fixture.
- [ ] Decide the owner boundary: publication-evidence current-summary
      selection, active-gate normalization, or retained diagnostics merge.
- [ ] Add the focused regression and repair the selected consumer path.
- [ ] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Progress Notes

May 6 migration from the stage-3 mixed-summary serial-wait package:

1. The new stage-3 regression proves the canonical decision snapshot owner now
   clears the removed-row serial-wait contradiction correctly.
2. The representative rerun still fails at startup snapshot coverage `3/5`,
   but the surviving `priority_operation_serial_wait` class is no longer
   supported by canonical decision snapshots.
3. The new representative seam is therefore consumer alignment between
   canonical priority-recovery owner state and
   `publicationConvergence.activeGate.progress`.

## Validation

1. Focused `200801Z` consumer divergence fixture passes.
2. Focused owner-consumer regression passes.
3. Affected presentation tests pass.
4. Touched-file guardrails are rerun and recorded.
5. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. `publicationConvergence.activeGate.progress` no longer restores stale
   `priority_operation_serial_wait` after canonical decision snapshots clear
   that class.
2. The representative path either reaches ACTIVE convergence or migrates away
   from this publication-evidence / active-gate consumer boundary with
   replayable evidence.
3. Sprint bookkeeping points to this package as the sole current
   representative owner.
