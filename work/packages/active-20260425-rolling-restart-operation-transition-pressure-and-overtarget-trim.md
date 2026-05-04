# Rolling Restart Operation Transition Pressure And Over-Target Trim

Activated on May 4, 2026 after
[Rolling Restart Operation Transition Status Authority Review Followup](./done-20260504-rolling-restart-operation-transition-status-authority-review-followup.md)
closed its status-authority slice and the representative path migrated earlier
into startup active-gate selected-snapshot evidence.

## Current Evidence

This package is the executable re-entry owner for the post-active
operation-transition / over-target boundary.

The last post-active evidence before later migrations was:

1. `test-output/reports/rolling-restart-next-work-package-20260504-codex.report.json`
2. Result: failed, `0/1` passed after `504.7s`.
3. Terminal barrier: `Convergence timeout after 120000ms`.
4. Publication epoch `32` was `PUBLISHED`.
5. Pending ACK count was `0`.
6. Missing published count was `0`.
7. Priority recovery had blocked partition count `0` and unresolved partition
   count `0`.
8. Dominant witness was `sql_write_operations-p1` with operation
   `68e99f1c-4414-4273-a241-36d21a53b623`, latest workflow step `CREATING`,
   latest status `creating`, `transition_deferred`, `workflow_timeout`, wait
   mode `timeout_reconcile_due`, and next action
   `reconcile_stale_operation_progress`.
9. Max over-target duration was `142226ms`.
10. Over-target voters remained on `control_plane_publications-p1`,
    `replica_operations-p1`, `sql_transaction_participants-p1`,
    `sql_transactions-p1`, and `sql_write_operations-p1`.

The representative path reached this boundary again on May 4 after
[Rolling Restart Priority Recovery Workflow Transition Deferred Reentry](./done-20260504-rolling-restart-priority-recovery-workflow-transition-deferred-reentry.md)
closed:

1. `test-output/reports/rolling-restart-priority-recovery-transition-deferred-reentry-fastlocal-20260504-codex.report.json`
2. Result: failed, `0/1` passed after `134.9s`.
3. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
4. Publication remains closed in the normalized failure bundle:
   `PUBLISHED`, pending ACK count `0`, blocked node count `0`, missing
   published count `0`, and `prioritySpreadPending=false`.
5. All five nodes reached active node diagnostics.
6. Active-gate selected snapshot coverage is `4/5`; terminal readiness reports
   `snapshot_reachability_timeout`, while best progress still had
   `admin_health` selected-snapshot reachability.
7. The only unresolved priority-recovery partition is `sql_transactions-p1`.
8. Dominant reason:
   `priority_recovery_workflow_timeout_transition_deferred`.
9. Dominant witness:
   `operation_workflow_owner / workflow_timeout / timeout_reconcile_due` with
   next action `reconcile_stale_operation_progress`, workflow step `PENDING`,
   status `pending`, and progress class
   `operation_created_but_no_step_transitions`.
10. `replica_operations-p1`, `sql_write_operations-p1`,
    `control_plane_publications-p1`, and `sql_transaction_participants-p1` are
    `spread_satisfied_in_flight`.

May 4 execution attempt:

1. Added focused owner coverage in
   `test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
   for stale priority `PENDING` timeout reconciliation when the target replica
   is cache-visible `ACTIVE` and the over-target source row remains
   cache-visible.
2. The fixture proves the owner path reconciles trustworthy target progress to
   `ACTIVE`, does not set a timeout failure, and does not dispatch unsafe
   source removal while source evidence remains cache-visible.
3. No production runtime change was made for this slice. The owner behavior was
   already correct for trustworthy cache-visible target progress and safe
   over-target trim deferral.
4. Representative rerun:
   `test-output/reports/rolling-restart-operation-transition-pressure-overtarget-trim-20260504-codex.report.json`.
5. Result: failed, `0/1` passed after `130.9s`.
6. Failure bundle:
   `test-output/reports/.playback/rolling-restart-operation-transition-pressure-overtarget-trim-20260504-codex/rolling-restart/failure-bundle.json`.
7. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
8. Dominant reason remains
   `priority_recovery_workflow_timeout_transition_deferred`.
9. Normalized publication section reports epoch `4`, status `ACK_PENDING`,
   pending ACK count `0`, and blocked node count `0`; active-gate progress
   still reports `pendingAck=1`, `missingPublished=1`, active `4/5`, and
   selected snapshot coverage `3/5`.
10. Blocked and unresolved priority partitions are `sql_transactions-p1` and
    `sql_write_operations-p1`.
11. Dominant witness remains `sql_transactions-p1` at
    `operation_workflow_owner / workflow_timeout / timeout_reconcile_due`,
    latest workflow step `PENDING`, latest status `pending`, progress class
    `operation_created_but_no_step_transitions`, and next action
    `reconcile_stale_operation_progress`.
12. Playback logs later show the same operation
    `2f8487ab-b5be-4ca4-86ad-33cd9cba49fb` advanced to workflow step
    `SENDING` and then deferred a retryable dispatch failure at
    `coordinator_created_remote_handoff` because the target node connection
    closed.

This package remains active. The closure inventory is not complete because the
representative path still selects a stale workflow-timeout witness while
startup publication, selected-snapshot coverage, and retryable remote-handoff
evidence are also present.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
topology workflow stabilization, failure simulations, and production
guarantees.

## In Scope

1. Timeout reconciliation must drive cache-visible trustworthy target progress
   out of stale operation rows.
2. Authoritative terminal target status must not be overridden by stale
   cache-observed target progress.
3. Durable trim must remove remaining over-target voters once operation
   lifecycle evidence has converged.
4. The package must rerun the representative scenario and record whether the
   blocker closes or migrates.

## Out Of Scope

1. Startup active-gate selected-snapshot recovery before the representative
   path reaches post-active convergence.
2. Broad matrix continuation before this five-node representative boundary
   closes or migrates.
3. Pro or Enterprise behavior.

## Invariants

1. Operation lifecycle progress stays owned by the operation workflow owner.
2. Cache-observed progress may not outrank authoritative terminal status.
3. Over-target trim must not remove voters until operation lifecycle evidence
   has converged enough to preserve quorum and priority-spread safety.

## Static Drift Ledger

Preflight:

- [x] `node --check src/rebalancer/operation-workflow-owner-segment-7.js`
      passed.
- [x] `node --check src/rebalancer/operation-workflow-owner-segment-6.js`
      passed.
- [x] `node --check test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
      passed.
- [x] `node --check test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-final-test-cases.js`
      passed.
- [x] `node scripts/check-guideline-literals.js --include-tests src/rebalancer/operation-workflow-owner-segment-7.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-final-test-cases.js`
      reported 148 existing new literal-guideline violations across the two
      rebalancer test files and 0 inherited baseline violations.
- [x] `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-final-test-cases.js`
      reported 0 decision-boundary guideline violations.
- [x] `node scripts/check-runtime-grammar-contracts.js src/rebalancer/operation-workflow-owner-segment-7.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-final-test-cases.js`
      reported 0 runtime-grammar-contract violations.
- [x] `git diff --check` passed.

Closure:

- [x] Reran the same guardrails after implementation.
- [x] No relevant guardrail count increased. The literal guard still reports
      the same 148 existing new literal-guideline violations across the
      rebalancer test files and 0 inherited baseline violations.
- [x] No touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] The inherited literal debt is unchanged and outside this owner slice.

## Implementation Tasks

- [x] Add the smallest owner or playback fixture for the current post-active
      operation-transition / over-target shape when this package reactivates.
- [x] Ensure timeout reconciliation consumes trustworthy target progress
      through the canonical operation workflow path.
- [x] Ensure durable over-target trim runs only after lifecycle evidence is
      converged enough for safe voter removal.
- [ ] Close or migrate the residual representative blocker after the stale
      workflow-timeout selected snapshot, startup publication ACK, selected
      snapshot coverage, and retryable remote-handoff evidence are reconciled.

## Validation

1. Focused operation workflow owner timeout tests:
   `node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
   passed.
2. Focused over-target trim or rebalancer planner tests:
   `node --test test/rebalancer/move-planner-inflight-cleanup.test.js`
   passed.
3. Review-fix harness coverage preserved:
   `node --test test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
   passed.
4. Static guardrails for touched files passed or remained unchanged as recorded
   in the static drift ledger.
5. Representative `rolling-restart --fast-local` rerun failed by residual
   blocker and kept this package active.

## Done When

1. The post-active operation workflow emits one canonical outcome for
   transition pressure, failed or removed terminal targets, source-removal
   progress, and over-target voter trim.
2. The representative path either passes convergence or migrates to one newly
   named owner boundary with this transition-pressure loop closed.

## Residual Active Blocker

The current blocker is not closed. The next continuation should reconcile why
the failure bundle selects stale `PENDING / workflow_timeout /
timeout_reconcile_due` evidence for `sql_transactions-p1` while playback logs
show the same operation later reached `SENDING` and deferred on retryable
`coordinator_created_remote_handoff`. It must also preserve the existing
publication ACK closure and startup selected-snapshot reachability closure
instead of reopening those as implementation scope unless new owner evidence
requires it.
