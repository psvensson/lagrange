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

May 4 serial-wait evidence continuation:

1. Inspected the final May 4 failure bundle and traced the
   `sql_transactions-p1` `operation_unknown` dominant witness back to
   coordinator serial-wait metadata on the related decision snapshot.
2. Preserved `serialWaitOperationIds` and `serialWaitPartitionIds` through
   priority-recovery observation snapshots and harness progress-summary
   normalization.
3. Kept serial-wait operation evidence separate from current-partition
   `operationIds` so freshness grouping does not collapse unrelated partitions
   that are merely waiting behind the same serial-lane owner.
4. Added focused regressions proving serial-wait blocker metadata survives
   normalization while current-partition `operationIds` remains empty.
5. This package remains active because the representative scenario has not
   been rerun after this diagnostic-evidence slice, and the publication
   summary versus active-gate missing-published disagreement remains open.

May 5 canonical serial-wait evidence rerun:

1. Fresh representative rerun:
   `test-output/reports/rolling-restart-serial-wait-evidence-rerun-20260505T042441Z.report.json`.
2. Companion log:
   `test-output/reports/rolling-restart-serial-wait-evidence-rerun-20260505T042441Z.log`.
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-serial-wait-evidence-rerun-20260505T042441Z/rolling-restart/failure-bundle.json`.
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-serial-wait-evidence-rerun-20260505T042441Z/rolling-restart/triage-summary.md`.
5. Result: failed, `0/1` passed after `189.4s`.
6. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
7. Root cause class migrated back to `startup`; dominant reason is
   `BOOTSTRAP_PHASE_INCOMPLETE`; failure class is
   `publication_convergence_blocked`.
8. Active gate progress is active `3/5`, selected snapshot coverage `2/5`,
   publication `ACK_PENDING`, pending ACK count `1`, missing published count
   `2`, priority spread pending with gap `9`, and no progress for six
   coordinator cycles.
9. Publication convergence reports epoch `3`, status `ACK_PENDING`,
   recovery protocol state `publication_pending`, pending ACK node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, blocked node count `0`, and
   normalized missing published count `0`.
10. Active-gate publication view still reports selected missing published
    nodes `8be8d30f-4499-5eed-865c-71b4d529a67a` and
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, with publication disagreement
    across three selected-snapshot reporters.
11. Stability gates remain open: failover on
    `pending_ack_nodes|startup_readiness_blocked`, convergence on
    `pending_ack_nodes|priority_spread_pending|startup_readiness_blocked`, and
    restart recovery on
    `pending_ack_nodes|priority_spread_pending|startup_readiness_blocked`.
12. Priority recovery blocked and unresolved partitions are now
    `replica_operations-p1` and `sql_write_operations-p1`.
13. `replica_operations-p1` is `blocked_unclassified`, cache-visible,
    terminal `FAILED`, owned by `rebalancer_leader`, and requires
    `schedule_followup_rebalance` at the `rebalancer_handoff` boundary.
14. `sql_write_operations-p1` is the serial-wait witness:
    semantic state `needs_operation`, progress class
    `priority_operation_serial_wait`, boundary `workflow_progress`, wait mode
    `event_driven`, no current operation IDs, correlation key
    `sql_write_operations-p1|3|operation_unknown`, serial-wait operation
    `1ba3f99e-e1e6-4c15-b09d-d65364b60e22`, and serial-wait partition
    `sql_transaction_participants-p1`.
15. `sql_transactions-p1`, the May 4 selected serial-wait partition, is now
    `spread_satisfied_in_flight` with operation
    `10b5432a-61f1-4b26-b735-7fc731b7997e`, workflow step `CREATING`, and
    target visibility `active_operational`.
16. The earlier duplicate timestamped rerun is not canonical evidence for this
    package. The canonical fresh evidence is the
    `20260505T042441Z` report and playback bundle above.
17. This package remains active. The post-active operation-transition loop is
    not proven closed because the representative path migrated earlier again:
    startup/publication pending ACK, selected-snapshot coverage `2/5`,
    active `3/5`, one pending ACK node, and the `replica_operations-p1`
    follow-up rebalance residual must be reconciled before broad matrix work.

May 5 harness publication-summary classification fix:

1. Reproduced the narrow harness presentation bug with
   `test/distributed/harness/__tests__/cluster.test-part-6.js`: a stale
   `publicationConvergenceGate.ready=true` record plus selected-snapshot
   `ACK_PENDING`, pending ACK `1`, and missing published `2` first formatted as
   `ready`.
2. `formatPublicationConvergenceGate()` now builds one normalized summary
   evidence snapshot from the gate record plus active-gate/snapshot progress
   context, then uses one decision table where explicit reasons and open
   publication debt block before `ready`.
3. ACTIVE and load-readiness timeout formatting now pass the current poll
   result into the formatter, so same-boundary progress evidence can prevent
   stale `publicationConvergence=ready` summaries.
4. Review follow-up tightened the ACTIVE timeout path further: when the final
   poll regresses to stale `ready` evidence after a meaningful terminal
   progress snapshot still carries `ACK_PENDING` and missing-published debt,
   timeout formatting now passes the selected terminal progress snapshot into
   the publication-convergence formatter.
5. Focused regressions now expect
   `blocked#status=ACK_PENDING#recovery=publication_pending#pendingAck=1#missingPublished=2`.
6. This is a harness classification fix only. The package remains active
   because the startup/publication pending ACK owner blocker, selected-snapshot
   coverage `2/5`, active `3/5`, serial-wait witness, and
   `replica_operations-p1` follow-up rebalance residual remain open.

May 5 terminal publication evidence rerun after classification fixes:

1. Fresh representative rerun after `8fd72452` and `a3c34d27`:
   `test-output/reports/rolling-restart-terminal-publication-evidence-rerun-20260505T052328Z.report.json`.
2. Companion log:
   `test-output/reports/rolling-restart-terminal-publication-evidence-rerun-20260505T052328Z.log`.
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-terminal-publication-evidence-rerun-20260505T052328Z/rolling-restart/failure-bundle.json`.
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-terminal-publication-evidence-rerun-20260505T052328Z/rolling-restart/triage-summary.md`.
5. Result: failed, `0/1` passed after `131.7s`.
6. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
7. The timeout summary now preserves terminal publication debt instead of
   reporting stale `publicationConvergence=ready`: the scenario error reports
   `publicationConvergence=blocked#recovery=priority_spread_pending#missingPublished=2`.
8. The runtime blocker migrated forward from the canonical `042441Z`
   startup/publication pending ACK shape. All five nodes report active,
   publication epoch `3` is `PUBLISHED`, pending ACK count is `0`, and
   publication recovery protocol state is `steady_published`.
9. Active-gate progress remains not closed: selected snapshot coverage is
   `3/5` at the terminal poll, best progress was `4/5`, selected published
   active is `3/5`, selected missing published count is `2`, and selected
   missing published nodes are `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
10. Root cause class is now `topology`; dominant reason is
    `priority_recovery_workflow_timeout_transition_deferred`; failure class is
    `priority_recovery_progress_blocked`.
11. Priority recovery narrowed to one blocked and unresolved partition:
    `sql_write_operations-p1`.
12. Dominant witness:
    `operation_workflow_owner / workflow_timeout / timeout_reconcile_due` with
    next action `reconcile_stale_operation_progress`, progress class
    `operation_created_but_no_step_transitions`, semantic state
    `operation_stalled`, workflow phase `dispatch_pending`, operation
    `1a2d029d-5c00-45a8-bd71-ac4e34b318eb`, workflow step `PENDING`, status
    `pending`, step age `56239ms`, step timeout `30000ms`, target visibility
    `absent`, and no serial-wait blockers.
13. `control_plane_publications-p1`, `replica_operations-p1`,
    `sql_transaction_participants-p1`, and `sql_transactions-p1` are now
    `spread_satisfied_in_flight`.
14. This package remains active. The pending ACK owner blocker is no longer
    the dominant terminal evidence in this rerun, but the representative path
    still fails on selected snapshot coverage, selected missing-published
    disagreement, and the `sql_write_operations-p1` PENDING dispatch timeout
    owner boundary.

May 5 terminal priority-recovery witness classification fix:

1. Verified the review/execution handoff issue in the ACTIVE timeout terminal
   progress selector: a later lower-coverage poll can report the same
   partition as `needs_operation` /
   `eligible_but_no_operation_created` after the last meaningful selected
   snapshot reported `operation_stalled` /
   `operation_created_but_no_step_transitions`.
2. `_waitForAllActive()` terminal progress selection now compares canonical
   priority-recovery progress-class partition ids and semantic-state partition
   ids, detects same-partition regression from operation-stalled evidence to
   needs-operation evidence, and keeps the last meaningful stalled witness
   when selected snapshot coverage also regressed.
3. Added focused part-6 harness regression coverage proving the timeout
   summary and diagnostics retain `operation_stalled` and
   `operation_created_but_no_step_transitions`, and do not replace them with
   `needs_operation` or `eligible_but_no_operation_created`.
4. This is a harness classification fix only. The package remains active
   because the representative runtime owner blocker recorded above is still
   `sql_write_operations-p1` PENDING dispatch timeout after publication
   closure, plus selected snapshot coverage and selected missing-published
   disagreement.

May 5 representative rerun after terminal priority-recovery witness fix:

1. Fresh representative rerun after `c17c23a9`:
   `test-output/reports/rolling-restart-after-terminal-witness-rerun-20260505T060935Z.report.json`.
2. Companion log:
   `test-output/reports/rolling-restart-after-terminal-witness-rerun-20260505T060935Z.log`.
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-terminal-witness-rerun-20260505T060935Z/rolling-restart/failure-bundle.json`.
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-terminal-witness-rerun-20260505T060935Z/rolling-restart/triage-summary.md`.
5. Result: failed, `0/1` passed after `130.5s`.
6. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
7. The representative path migrated back from the `052328Z` post-publication
   operation timeout shape to startup/publication convergence. Root cause class
   is `startup`, dominant reason is `BOOTSTRAP_PHASE_INCOMPLETE`, and failure
   class is `publication_convergence_blocked`.
8. Publication epoch `3` is `ACK_PENDING`, pending ACK count is `1`, pending ACK
   node is `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, blocked node count is `0`,
   normalized missing published count is `0`, and recovery protocol state is
   `publication_pending`.
9. Active-gate progress is active `3/5`, selected snapshot coverage `2/5`,
   selected missing published count `2`, selected missing published nodes
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, selected published active `3/5`,
   per-node publication disagreement across one reporter, and priority spread
   gap `6`.
10. Stability gates remain open on `pending_ack_nodes` and
    `startup_readiness_blocked` for failover, convergence, and
    restart-recovery.
11. Priority recovery no longer selects the previous `sql_write_operations-p1`
    operation timeout witness in this rerun. The blocked and unresolved
    partition is `sql_transactions-p1`, semantic state `recovering_in_flight`,
    with witness operation `e588045c-356c-473a-b553-752423aebc07`.
12. The `sql_transactions-p1` witness is cache-visible, spread gap `2`, ready
    distinct node count `1`, required distinct node count `3`,
    `operation_workflow_owner / workflow_progress / event_driven`, workflow
    phase `dispatch_pending`, actuation state `persisted_not_dispatched`, next
    action `wait_for_operation_progress`, workflow step `PENDING`, status
    `pending`, step age `11225ms`, step timeout `30000ms`, and no serial-wait
    blockers.
13. This rerun does not close the earlier `052328Z` `sql_write_operations-p1`
    PENDING dispatch timeout residual. It shows the representative path is still
    nondeterministically gated earlier by startup publication ACK, inactive
    nodes, selected-snapshot coverage, selected missing-published disagreement,
    and priority-spread recovery in flight. The package remains active.

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
- [x] May 4 serial-wait evidence slice `node --check` passed for
      `src/control-plane/priority-recovery-observation-snapshot.js`,
      `test/distributed/harness/priority-recovery-summary-normalization.js`,
      `test/control-plane/priority-recovery-snapshot.test.js`, and
      `test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`.
- [x] May 4 serial-wait evidence slice focused tests passed:
      `node --test test/control-plane/priority-recovery-snapshot.test.js`
      and
      `node --test test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`.
- [x] May 4 serial-wait evidence slice harness regression check passed:
      `node --test test/distributed/harness/__tests__/failure-bundle.test.js`.
- [x] May 4 serial-wait evidence slice non-literal guardrails passed:
      `node scripts/check-guideline-decision-boundaries.js ...` and
      `node scripts/check-runtime-grammar-contracts.js ...` both reported
      `0` violations across the four touched JS files.
- [ ] May 4 serial-wait evidence slice exact touched-file literal guard
      remains file-scoped red:
      `node scripts/check-guideline-literals.js --include-tests src/control-plane/priority-recovery-observation-snapshot.js test/distributed/harness/priority-recovery-summary-normalization.js test/control-plane/priority-recovery-snapshot.test.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
      reports `373` new literal-guideline violations and `0` inherited
      baseline violations, all in
      `test/control-plane/priority-recovery-snapshot.test.js`. Diff-aware
      added-line filtering for this slice reports `0` literal-guideline
      violations on added lines.
- [x] May 4 serial-wait evidence slice `git diff --check` passed.
- [x] May 5 harness classification `node --check` passed for
      `test/distributed/harness/cluster-segment-2.js`,
      `test/distributed/harness/cluster-segment-7.js`, and
      `test/distributed/harness/__tests__/cluster.test-part-6.js`.
- [x] May 5 harness classification focused regression was red before the fix
      (`ready` instead of the expected blocked summary), then passed:
      `node --test test/distributed/harness/__tests__/cluster.test-part-6.js --test-name-pattern "formatPublicationConvergenceGate"`.
- [x] May 5 harness classification non-literal guardrails passed:
      `node scripts/check-guideline-decision-boundaries.js ...` and
      `node scripts/check-runtime-grammar-contracts.js ...` both reported `0`
      violations across the three touched JS files.
- [ ] May 5 harness classification exact touched-file literal guard remains
      file-scoped red:
      `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/cluster-segment-2.js test/distributed/harness/cluster-segment-7.js test/distributed/harness/__tests__/cluster.test-part-6.js`
      reports `374` new literal-guideline violations and `0` inherited
      baseline violations. Top residual files are existing whole-file harness
      fixture debt: `cluster.test-part-6.js` `289`,
      `cluster-segment-2.js` `55`, and `cluster-segment-7.js` `30`.
- [x] May 5 harness classification `git diff --check` passed.
- [x] May 5 terminal publication evidence review fix `node --check` passed for
      `test/distributed/harness/cluster-segment-7.js` and
      `test/distributed/harness/__tests__/cluster.test-part-6.js`.
- [x] May 5 terminal publication evidence focused regression passed:
      `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep "timeout publication summary uses terminal progress evidence"`.
      The selected TAP subtest uses Node assertions and reports `ok` with
      `1..0`.
- [x] May 5 terminal publication evidence full file check passed:
      `node --test test/distributed/harness/__tests__/cluster.test-part-6.js`
      reported `37` tests, `1` pass, `36` skipped under the existing
      TAP/Node skip behavior for this file.
- [x] May 5 terminal publication evidence non-literal guardrails passed:
      `node scripts/check-guideline-decision-boundaries.js ...` and
      `node scripts/check-runtime-grammar-contracts.js ...` both reported `0`
      violations across the two touched JS files.
- [ ] May 5 terminal publication evidence exact touched-file literal guard
      remains file-scoped red:
      `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/cluster-segment-7.js test/distributed/harness/__tests__/cluster.test-part-6.js`
      reports `319` new literal-guideline violations and `0` inherited
      baseline violations. Top residual files are existing whole-file
      test/harness fixture debt: `cluster.test-part-6.js` `289` and
      `cluster-segment-7.js` `30`.
- [x] Diff-aware added-line filtering for the May 5 terminal publication
      evidence review fix reports `0` literal-guideline violations on added
      lines.
- [x] May 5 terminal publication evidence `git diff --check` passed.
- [x] May 5 terminal priority-recovery witness review fix `node --check`
      passed for `test/distributed/harness/cluster-segment-7.js` and
      `test/distributed/harness/__tests__/cluster.test-part-6.js`.
- [x] May 5 terminal priority-recovery witness focused regression passed:
      `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep "operation-stalled terminal progress"`.
      The selected TAP subtest uses Node assertions and reports `ok` with
      `1..0`.
- [x] May 5 terminal priority-recovery witness full TAP check passed:
      `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js`
      reported `38` tests passed.
- [x] May 5 terminal priority-recovery witness non-literal guardrails passed:
      `node scripts/check-guideline-decision-boundaries.js ...` and
      `node scripts/check-runtime-grammar-contracts.js ...` both reported `0`
      violations across the two touched JS files.
- [ ] May 5 terminal priority-recovery witness exact touched-file literal
      guard remains file-scoped red:
      `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/cluster-segment-7.js test/distributed/harness/__tests__/cluster.test-part-6.js`
      reports `319` new literal-guideline violations and `0` inherited
      baseline violations. Top residual files are existing whole-file
      test/harness fixture debt: `cluster.test-part-6.js` `289` and
      `cluster-segment-7.js` `30`.
- [x] Diff-aware added-line filtering for the May 5 terminal
      priority-recovery witness review fix reports `0` literal-guideline
      violations on added lines.
- [x] May 5 terminal priority-recovery witness `git diff --check` passed.

## Implementation Tasks

- [x] Add the smallest owner or playback fixture for the current post-active
      operation-transition / over-target shape when this package reactivates.
- [x] Ensure timeout reconciliation consumes trustworthy target progress
      through the canonical operation workflow path.
- [x] Ensure durable over-target trim runs only after lifecycle evidence is
      converged enough for safe voter removal.
- [x] Preserve serial-wait operation and partition evidence without folding it
      into current-partition operation identity.
- [x] Rerun the representative path after serial-wait metadata preservation and
      record the migrated owner evidence.
- [x] Preserve open publication debt in ACTIVE/load-readiness timeout
      publication summaries when the gate record is stale-ready.
- [x] Preserve the selected terminal ACTIVE progress snapshot as publication
      summary evidence when the final timeout poll regresses to stale-ready
      publication state.
- [x] Preserve operation-stalled terminal priority-recovery evidence when a
      later same-partition needs-operation poll regresses with lower selected
      snapshot coverage.
- [x] Rerun the representative path after the terminal publication evidence
      review fix and record whether the blocker closes or migrates.
- [x] Rerun the representative path after the terminal priority-recovery witness
      review fix and record whether the blocker closes or migrates.
- [ ] Reconcile the latest May 5 migrated startup/publication owner blocker:
      active `3/5`, selected snapshot coverage `2/5`, pending ACK count `1`,
      selected missing published count `2`, priority spread gap `6`, and
      `sql_transactions-p1` operation
      `e588045c-356c-473a-b553-752423aebc07` in `PENDING/pending` at
      `operation_workflow_owner / workflow_progress / event_driven`.
- [ ] Revisit the prior May 5 post-publication operation-workflow timeout
      residual once startup/publication convergence reaches that boundary
      again: `sql_write_operations-p1` operation
      `1a2d029d-5c00-45a8-bd71-ac4e34b318eb` at
      `operation_workflow_owner / workflow_timeout / timeout_reconcile_due`.

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
7. Representative `rolling-restart --fast-local` reruns failed by residual
   blockers and kept this package active.
8. Serial-wait evidence slice checks passed as recorded in the static drift
   ledger. The representative path has been rerun with canonical May 5
   evidence and migrated back to startup/publication pending ACK.
9. Harness publication-summary classification coverage passed as recorded in
   the static drift ledger. The fix prevents the May 5 same-boundary
   `publicationConvergence=ready` contradiction from hiding open ACK or
   missing-published debt.
10. Terminal publication evidence review-fix coverage passed as recorded in the
    static drift ledger. The fix prevents stale final ready probes from
    overriding the selected terminal ACTIVE progress snapshot in timeout
    publication summaries.
11. Post-review representative rerun
    `test-output/reports/rolling-restart-terminal-publication-evidence-rerun-20260505T052328Z.report.json`
    failed by the migrated runtime owner blocker recorded above. No production
    code was changed for this documentation-only evidence update.
12. Terminal priority-recovery witness review-fix coverage passed as recorded
    in the static drift ledger. The fix prevents a lower-coverage terminal
    `needs_operation` reconstruction from overriding same-partition
    `operation_stalled` terminal progress evidence.
13. Post-`c17c23a9` representative rerun
    `test-output/reports/rolling-restart-after-terminal-witness-rerun-20260505T060935Z.report.json`
    failed by the migrated startup/publication pending ACK blocker recorded
    above. No production code was changed for this documentation-only evidence
    update.
14. Documentation-only evidence ledger update touched no JS files. Required
    whitespace verification `git diff --check` passed.

## Done When

1. The post-active operation workflow emits one canonical outcome for
   transition pressure, failed or removed terminal targets, source-removal
   progress, and over-target voter trim.
2. The representative path either passes convergence or migrates to one newly
   named owner boundary with this transition-pressure loop closed.

## Residual Active Blocker

The current blocker is not closed. The fresh post-`c17c23a9` May 5 rerun failed
after `130.5s` and migrated back to startup/publication convergence:
publication epoch `3` is `ACK_PENDING`, pending ACK count is `1`, pending ACK
node is `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, and recovery protocol state is
`publication_pending`.

Active-gate progress reports active `3/5`, selected snapshot coverage `2/5`,
selected published active `3/5`, selected missing published count `2`, selected
missing published nodes `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
`8be8d30f-4499-5eed-865c-71b4d529a67a`, and priority spread gap `6`.

The latest selected runtime owner boundary is `sql_transactions-p1`:
operation `e588045c-356c-473a-b553-752423aebc07` remains `PENDING/pending`,
semantic state `recovering_in_flight`, cache-visible, workflow phase
`dispatch_pending`, step age `11225ms`, step timeout `30000ms`, and required
action `wait_for_operation_progress`. The previous `052328Z`
`sql_write_operations-p1` PENDING dispatch timeout residual is not closed; this
rerun did not reach that post-publication boundary.

The next continuation must not broaden the matrix or raise timeouts. It must
choose the smallest owner slice that reconciles startup pending ACK, inactive
nodes, selected snapshot coverage, selected missing-published disagreement, and
the `sql_transactions-p1` in-flight workflow progress witness.
