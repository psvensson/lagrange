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
2. The fixture proves the owner path reconciles trustworthy cache-visible
   target progress to `ACTIVE` after authoritative `services` reads return no
   rows, does not set a timeout failure, and does not dispatch unsafe source
   removal while source evidence remains cache-visible.
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
13. Final confirmation rerun:
    `test-output/reports/rolling-restart-operation-transition-pressure-overtarget-trim-20260504-final.report.json`.
14. Result: failed, `0/1` passed after `134.1s`.
15. Failure bundle:
    `test-output/reports/.playback/rolling-restart-operation-transition-pressure-overtarget-trim-20260504-final/rolling-restart/failure-bundle.json`.
16. Terminal barrier:
    `Not all nodes reached ACTIVE state within 120000ms`.
17. Dominant reason remains
    `priority_recovery_workflow_progress_transition_deferred`, but the
    selected witness has migrated from stale workflow timeout to
    `priority_operation_serial_wait`.
18. Publication summary reports epoch `3`, status `PUBLISHED`,
    pending ACK count `0`, missing published count `0`, and
    `prioritySpreadPending=true`.
19. Active-gate progress still reports active `4/5`, selected snapshot
    coverage `4/5`, selected published active `3/5`, missing published count
    `2`, and per-node publication disagreements across four nodes.
20. The dominant priority-recovery witness is `sql_transactions-p1` with
    semantic state `needs_operation`, boundary `workflow_progress`, wait mode
    `event_driven`, next action `wait_for_operation_progress`, correlation key
    `sql_transactions-p1|3|operation_unknown`, no operation IDs, workflow
    source `none`, latest workflow step `unavailable`, and latest status
    `unavailable`.
21. Playback logs retain retryable operation-dispatch deferral witnesses for
    other priority partitions, including `control_plane_publications-p1` and
    `sql_transaction_participants-p1`, but those are not the final dominant
    selected partition.

This package remains active. The closure inventory is not complete because the
representative path still exposes contradictory publication/active-gate
evidence and a priority recovery `operation_unknown` serial-wait witness for
`sql_transactions-p1`.

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

- [x] Reran the non-literal guardrails after implementation.
- [ ] Full file-scoped literal guard closure is still red. The earlier
      rebalancer-slice literal run still reports the same 148 file-scoped
      new literal-guideline violations across the rebalancer test files and
      0 inherited baseline violations; that is open package guardrail debt,
      not passed literal closure.
- [x] No touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Literal guardrail debt remains in the active package because the
      touched-file literal guard is file-scoped red; only the diff-aware
      added-line slice is clean.
- [x] `node --check` passed for the touched harness and rebalancer test files:
      `test/distributed/harness/priority-recovery-summary-normalization.js`,
      `test/distributed/harness/failure-bundle-segment-1.js`,
      `test/distributed/harness/failure-bundle-segment-3.js`,
      `test/distributed/harness/failure-bundle-segment-4.js`,
      `test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js`,
      `test/distributed/harness/__tests__/failure-bundle.test.js`,
      `test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`,
      and
      `test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`.
- [x] `node scripts/check-guideline-decision-boundaries.js ...` passed with
      `0` violations across those eight touched JS files after resolving an
      inherited guidance-helper decision-boundary hit in
      `test/distributed/harness/failure-bundle-segment-1.js`.
- [x] `node scripts/check-runtime-grammar-contracts.js ...` passed with `0`
      violations across those eight touched JS files.
- [ ] Exact touched-file literal guard remains red after scoped literal-owner
      cleanup:
      `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js test/distributed/harness/__tests__/failure-bundle.test.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js test/distributed/harness/failure-bundle-segment-1.js test/distributed/harness/failure-bundle-segment-3.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/priority-recovery-summary-normalization.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
      reports `1954` new literal-guideline violations and `0` inherited
      baseline violations. Top residual files are whole-file test/harness
      fixture debt: `failure-bundle.test.js` `1242`,
      `failure-bundle-playback-test-cases.js` `549`, and
      `rebalance-coordinator-timeout-cache-visibility.test.js` `78`.
- [x] Diff-aware filtering of that exact guard report against currently added
      lines reports `0` literal-guideline violations on added lines. The
      checker is file-scoped but not diff-scoped, and the literal baseline has
      no inherited entries for these test/harness paths. This proves the
      added-line slice is clean only; it does not close the full file-scoped
      literal guard.
- [ ] Review-fix rerun for the six currently touched harness JS files:
      `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/priority-recovery-summary-normalization.js test/distributed/harness/failure-bundle-segment-3.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js test/distributed/harness/__tests__/failure-bundle.test.js`
      remains file-scoped red with `1817` new literal-guideline violations
      and `0` inherited baseline violations. Top residual files are
      `failure-bundle.test.js` `1242`,
      `failure-bundle-playback-test-cases.js` `549`, and
      `failure-bundle-segment-3.js` `26`.

## Implementation Tasks

- [x] Add the smallest owner or playback fixture for the current post-active
      operation-transition / over-target shape when this package reactivates.
- [x] Ensure timeout reconciliation consumes trustworthy target progress
      through the canonical operation workflow path.
- [x] Ensure durable over-target trim runs only after lifecycle evidence is
      converged enough for safe voter removal.
- [ ] Close or migrate the residual representative blocker after the
      `sql_transactions-p1` `operation_unknown` serial-wait witness,
      publication summary versus active-gate missing-published disagreement,
      and retained retryable dispatch evidence are reconciled.

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
4. Harness failure-bundle coverage:
   `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
   passed.
5. Rebalancer cache-visible target proof:
   `node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
   passed.
6. Non-literal static guardrails for touched files passed as recorded in the
   static drift ledger; full file-scoped literal guard closure remains open
   with a clean diff-aware added-line slice.
7. Representative `rolling-restart --fast-local` rerun failed by residual
   blocker and kept this package active.

## Done When

1. The post-active operation workflow emits one canonical outcome for
   transition pressure, failed or removed terminal targets, source-removal
   progress, and over-target voter trim.
2. The representative path either passes convergence or migrates to one newly
   named owner boundary with this transition-pressure loop closed.

## Residual Active Blocker

The current blocker is not closed. The final May 4 rerun fails at startup
ACTIVE convergence with active `4/5`, snapshot coverage `4/5`, and one
degraded node reporting `OBSERVABILITY_BACKLOG` plus
`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`. Normalized publication reports epoch
`3` as `PUBLISHED`, pending ACK count `0`, and missing published count `0`,
while active-gate progress reports selected published active `3/5`, missing
published count `2`, and publication disagreement across four nodes.

The dominant priority-recovery witness is now `sql_transactions-p1` as
`needs_operation / priority_operation_serial_wait` at
`operation_workflow_owner / workflow_progress / event_driven`, with next action
`wait_for_operation_progress`, correlation key
`sql_transactions-p1|3|operation_unknown`, no operation IDs, workflow source
`none`, latest workflow step `unavailable`, and latest status `unavailable`.
The next continuation must reconcile why this partition has no operation row
while four sibling priority partitions are either `spread_satisfied_in_flight`
or represented by retryable operation-dispatch deferral logs. It must also
reconcile the publication summary versus active-gate missing-published
disagreement before recording publication or selected-snapshot closure.
