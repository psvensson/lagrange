# Rolling Restart Operation Workflow Publication ACK Reentry

Opened on May 4, 2026 after
[Rolling Restart Priority Recovery Actuation Active Gate Reentry](./done-20260504-rolling-restart-priority-recovery-actuation-active-gate-reentry.md)
closed the active-gate no-operation actuation presentation bug and the fresh
representative path migrated to operation workflow progress followed by
publication ACK reentry.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-priority-op-workflow-ack-reentry-fastlocal-20260504-codex2.report.json`.
2. Failure bundle:
   `test-output/reports/.playback/rolling-restart-priority-op-workflow-ack-reentry-fastlocal-20260504-codex2/rolling-restart/failure-bundle.json`.
3. Result: failed, `0/1` passed after `130.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Active-gate and publication state moved to:
   publication `PUBLISHED` with `pendingAckCount=0`, selected snapshot coverage
   `3/5`, and dominant priority recovery witness
   `sql_write_operations-p1` at
   `operation_workflow_owner / workflow_progress / wait_for_operation_progress`.
6. Failure class: `priority_recovery_progress_blocked`.
7. Root cause class: `topology`.
8. Dominant reason:
   `priority_recovery_workflow_progress_event_driven`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
topology workflow stabilization, failure simulations, and production
guarantees.

## In Scope

1. Decide whether epoch `4` publication ACK reentry is current runtime debt or
   selected-snapshot projection debt after operation workflow progress.
2. Preserve the fixed active-gate no-operation actuation classification while
   operation workflow progress is active.
3. Keep startup seed-contact and publication closure regressions covered.

## Out Of Scope

1. Harness timeout increases.
2. Post-active over-target trim until the representative path reaches that
   boundary again.
3. Pro or Enterprise behavior.

## Validation

1. Focused fixture for operation workflow progress plus publication ACK reentry.
2. Failure-bundle playback/regeneration for the final representative report.
3. Static guardrails for touched files.
4. One representative `rolling-restart --fast-local` rerun.

## Closure Evidence

1. Added focused regression coverage in
   `test/distributed/harness/__tests__/failure-bundle.test.js`.
2. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
   passed `74/74`.
3. `node --check test/distributed/harness/__tests__/failure-bundle.test.js` passed.
4. Representative rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-op-workflow-ack-reentry-fastlocal-20260504-codex2.report.json --fast-local --verbose`
   failed `0/1` after `130.9s` and closed the ACK reentry path while reporting a
   terminal `snapshot_reachability_timeout` startup readiness blocker with
   `priorityRecoveryOwner=operation_workflow_owner` and
   `priorityRecoveryBoundary=workflow_progress`.
5. Review follow-up playback artifact check:
   `jq -e '.summary.failureClassification.failureClass == "priority_recovery_progress_blocked" and .summary.dominantReason == "priority_recovery_workflow_progress_event_driven" and .summary.readinessFailure.classCode == "snapshot_reachability_timeout" and .summary.publicationConvergence.publicationStatus == "PUBLISHED" and .summary.publicationConvergence.pendingAckCount == 0 and (.summary.failureClassification.signals | index("priorityRecoveryOwner=operation_workflow_owner") != null) and (.summary.failureClassification.signals | index("priorityRecoveryBoundary=workflow_progress") != null)' test-output/reports/.playback/rolling-restart-priority-op-workflow-ack-reentry-fastlocal-20260504-codex2/rolling-restart/failure-bundle.json`
   returned `true`.
6. The review follow-up did not rerun the full representative scenario or
   regenerate playback; it verified the existing final playback bundle because
   this review scope is package metadata and tracker links only.

## Static Drift Ledger

Retrospective ledger added on May 4, 2026 because the closed package did not
carry a dedicated static-drift section.

Preflight:

- [x] Relevant guardrails were selected for the declared touched test surface:
      literal ownership, decision-boundary audit, runtime grammar, syntax check,
      and diff whitespace.
- [x] No package-specific pre-implementation static baseline was recorded in
      this file before the already-closed implementation edits.

Closure:

- [x] `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
      passed as recorded above.
- [x] `node scripts/check-guideline-literals.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      `0` new literal-guideline violations and `0` inherited baseline
      violations.
- [x] `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      `0` decision-boundary guideline violations.
- [x] `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      `0` runtime-grammar-contract violations.
- [x] `git diff --check` passed before these metadata edits.

## Residual Closure Inventory

- [x] Publication ACK bleed from stale epoch-4 reentry is suppressed when active
  operation workflow progress is dominant and snapshot coverage is incomplete.
- [x] Active-gate no-operation actuation classification was preserved while
  operation-workflow evidence moved the failure boundary.
- [x] Representative path still times out on `snapshot_reachability_timeout` with
  `sql_write_operations-p1` in `recovering_in_flight`; follow-up package
  boundary is split to
  [Rolling Restart Startup Snapshot Reachability Operation Workflow Progress Reentry](./done-20260504-rolling-restart-startup-snapshot-reachability-operation-workflow-progress-reentry.md).

## Done When

1. The final representative path either reaches ACTIVE convergence or reports
   one canonical owner boundary for publication reentry without regressing
   active-gate no-operation actuation classification.
