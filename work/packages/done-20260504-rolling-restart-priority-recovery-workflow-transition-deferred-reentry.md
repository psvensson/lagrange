# Rolling Restart Priority Recovery Workflow Transition Deferred Reentry

Opened on May 4, 2026 as the migrated blocker from
[Rolling Restart Startup Snapshot Reachability Operation Workflow Progress Reentry](./done-20260504-rolling-restart-startup-snapshot-reachability-operation-workflow-progress-reentry.md).

Closed May 4, 2026 by migration back into
[Rolling Restart Operation Transition Pressure And Over-Target Trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-startup-snapshot-workflow-progress-reentry-fastlocal-20260504-codex.report.json`.
2. Failure bundle:
   `test-output/reports/.playback/rolling-restart-startup-snapshot-workflow-progress-reentry-fastlocal-20260504-codex/rolling-restart/failure-bundle.json`.
3. Result: failed, `0/1` passed after `133.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Startup selected snapshot is reachable by `admin_health`; readiness failure is
   `no_progress_terminal`, not `snapshot_reachability_timeout`.
6. Publication remains closed:
   `PUBLISHED`, pending ACK count `0`, blocked node count `0`, and missing
   published count `0` in the normalized bundle.
7. Active-gate selected snapshot coverage remains incomplete at `2/5`.
8. Dominant failure classification:
   `priority_recovery_progress_blocked` with dominant reason
   `priority_recovery_workflow_progress_transition_deferred`.
9. Dominant witness:
   `sql_transactions-p1` at
   `operation_workflow_owner / workflow_progress / wait_for_operation_progress`
   with actuation state `transition_deferred`.
10. Supporting unresolved partitions include `replica_operations-p1` at
    `operation_scheduling / create_recovery_operation` and
    `sql_write_operations-p1` at
    `workflow_progress / wait_for_operation_progress`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Determine whether `transition_deferred` workflow progress is the current
   owner boundary or supporting evidence for operation scheduling.
2. Preserve publication ACK closure and active-gate snapshot coverage
   classification.
3. Keep `priority_operation_serial_wait`, `eligible_but_no_operation_created`,
   `needs_operation`, and `operation_stalled` evidence normalized through one
   canonical priority-recovery progress outcome.
4. Decide whether `sql_transactions-p1` and `sql_write_operations-p1` should
   wait, dispatch, or reconcile without increasing harness timeouts.

## Out Of Scope

1. Harness timeout increases.
2. Post-active over-target trim until the representative path reaches that
   boundary again.
3. Reopening publication ACK or startup selected-snapshot reachability unless
   new evidence shows they are current debt.
4. Pro or Enterprise behavior.

## Residual Closure Inventory

- [x] Classify `transition_deferred` workflow progress as dominant owner
      evidence or supporting operation-scheduling evidence.
- [x] Trace `sql_transactions-p1` and `sql_write_operations-p1` serial-wait
      witnesses through dispatch, wait, or timeout reconciliation.
- [x] Trace `replica_operations-p1` `eligible_but_no_operation_created` through
      operation scheduling without reopening publication debt.
- [x] Prove the failure bundle reports one canonical owner state for the
      migrated priority-recovery blocker.
- [x] Run focused owner/static checks and one representative
      `rolling-restart --fast-local` rerun.

## Closure Evidence

1. Added focused regression coverage in
   `test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
   for mixed `transition_deferred` serial-wait and actionable
   `operation_scheduling / create_recovery_operation` witnesses.
2. The focused fixture failed before implementation because the dominant
   witness was `sql_transactions-p1` at
   `operation_workflow_owner / workflow_progress / transition_deferred`
   instead of the actionable `replica_operations-p1` operation-scheduling
   witness.
3. Updated
   `test/distributed/harness/priority-recovery-summary-normalization.js` so
   actionable `rebalancer_leader / operation_scheduling /
   create_recovery_operation / action_required` evidence outranks supporting
   workflow serial-wait deferrals, while same-boundary actuation specificity
   remains unchanged.
4. Runtime priority-recovery decision behavior did not need a change:
   `priority_operation_serial_wait` still reports a workflow-owner wait and
   `eligible_but_no_operation_created` still reports rebalancer-owned
   operation scheduling.
5. Representative rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-transition-deferred-reentry-fastlocal-20260504-codex.report.json --fast-local --verbose`
   failed `0/1` after `134.9s`, but the blocker migrated. The rerun had all
   five nodes active, publication `PUBLISHED`, pending ACK count `0`, blocked
   node count `0`, normalized missing-published count `0`, and priority spread
   no longer pending in the failure bundle.
6. The final normalized priority-recovery state no longer contains
   `priority_operation_serial_wait` or `eligible_but_no_operation_created`.
   `replica_operations-p1`, `sql_write_operations-p1`,
   `control_plane_publications-p1`, and `sql_transaction_participants-p1` are
   `spread_satisfied_in_flight`.
7. The new canonical owner boundary is
   `priority_recovery_workflow_timeout_transition_deferred` for
   `sql_transactions-p1`, with progress class
   `operation_created_but_no_step_transitions`, boundary `workflow_timeout`,
   wait mode `timeout_reconcile_due`, next action
   `reconcile_stale_operation_progress`, workflow step `PENDING`, and status
   `pending`.
8. Startup selected-snapshot reachability remains supporting evidence, not the
   dominant owner. The terminal sample reports
   `snapshot_reachability_timeout`, while best progress still had
   `admin_health` reachability; the failure bundle keeps the canonical
   priority-recovery workflow-timeout owner.
9. The migrated operation-transition timeout owner is handed off to
   [Rolling Restart Operation Transition Pressure And Over-Target Trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).

## Static Drift Ledger

Preflight:

- [x] `node --check test/distributed/harness/priority-recovery-summary-normalization.js`
      passed before implementation.
- [x] `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
      passed before implementation.
- [x] `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      2 files scanned, 1250 existing new literal-guideline violations
      (`failure-bundle.test.js`: 1243,
      `priority-recovery-summary-normalization.js`: 7) and 0 inherited
      baseline violations before implementation.
- [x] `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      0 decision-boundary guideline violations before implementation.
- [x] `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      0 runtime-grammar-contract violations before implementation.

Closure:

- [x] `node --check test/distributed/harness/priority-recovery-summary-normalization.js`
      passed.
- [x] `node --check test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
      passed.
- [x] `./node_modules/.bin/eslint --no-warn-ignored test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
      passed.
- [x] `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`:
      2 files scanned, 7 existing literal-guideline violations in
      `priority-recovery-summary-normalization.js`, 0 in the new focused test
      file. This did not increase the preflight count for the edited summary
      file.
- [x] `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`:
      0 new literal-guideline violations and 0 inherited baseline violations.
- [x] `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`:
      0 decision-boundary guideline violations.
- [x] `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`:
      0 runtime-grammar-contract violations.
- [x] `git diff --check` passed.

## Validation

1. Focused fixture for priority recovery workflow `transition_deferred` plus
   operation scheduling:
   `node --test test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
   failed before the implementation and passed after it.
2. Existing dominant-witness tie-break coverage:
   `node --test --test-name-pattern "breaks same-rank dominant witness ties" test/distributed/harness/__tests__/failure-bundle.test.js`
   passed.
3. Active-gate serial priority coverage:
   `node --test --test-name-pattern "separates active-gate snapshot coverage from serial priority recovery progress" test/distributed/harness/__tests__/failure-bundle.test.js`
   passed.
4. Full failure-bundle coverage:
   `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
   passed `75/75`.
5. Runtime owner contract coverage:
   `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
   passed.
6. Static guardrails for touched files: passed or unchanged as recorded in the
   static drift ledger.
7. Representative `rolling-restart --fast-local` rerun: failed by migration to
   `priority_recovery_workflow_timeout_transition_deferred`.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates to one
   newly named owner boundary.
2. Publication ACK closure remains closed, startup selected-snapshot
   reachability remains supporting rather than dominant owner evidence, and
   priority recovery progress is classified through one canonical outcome.
