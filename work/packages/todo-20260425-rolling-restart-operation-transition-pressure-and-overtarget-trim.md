# Rolling Restart Operation Transition Pressure And Over-Target Trim

Queued on May 4, 2026 after
[Rolling Restart Operation Transition Status Authority Review Followup](./done-20260504-rolling-restart-operation-transition-status-authority-review-followup.md)
closed its status-authority slice and the representative path migrated earlier
into startup active-gate selected-snapshot evidence.

## Current Evidence

This package is the executable re-entry owner for the post-active
operation-transition / over-target boundary. It is queued until the
representative `rolling-restart --fast-local` path reaches that boundary again.

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

This package is now the queued re-entry owner for the current
operation-transition workflow-timeout boundary.

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

- [ ] Record file-scoped literal, decision-boundary, runtime-grammar, and
      diff-whitespace status before reactivation edits.

Closure:

- [ ] Rerun the same guardrails after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any inherited out-of-scope violation has a linked follow-on package.

## Implementation Tasks

- [ ] Add the smallest owner or playback fixture for the current post-active
      operation-transition / over-target shape when this package reactivates.
- [ ] Ensure timeout reconciliation consumes trustworthy target progress
      through the canonical operation workflow path.
- [ ] Ensure durable over-target trim runs only after lifecycle evidence is
      converged enough for safe voter removal.

## Validation

1. Focused operation workflow owner timeout tests.
2. Focused over-target trim or rebalancer planner tests.
3. Static guardrails for touched files.
4. One representative `rolling-restart --fast-local` rerun.

## Done When

1. The post-active operation workflow emits one canonical outcome for
   transition pressure, failed or removed terminal targets, source-removal
   progress, and over-target voter trim.
2. The representative path either passes convergence or migrates to one newly
   named owner boundary with this transition-pressure loop closed.
