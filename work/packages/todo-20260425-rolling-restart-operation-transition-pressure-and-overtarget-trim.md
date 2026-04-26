# Rolling Restart Operation Transition Pressure And Over-Target Trim

Status: queued on April 26, 2026. The seed-contact startup-authority fix moved
`rolling-restart` back to this post-active topology convergence boundary, but
the April 25 ACK-complete-trim rerun failed earlier during load readiness.
Post-active over-target trim resumes after priority-spread recovery operation
creation/progression closes.

## Why

The April 25 `rolling-restart` operation-lifecycle rerun kept the post-active
convergence barrier honest, but moved the runtime blocker again:

1. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json`
2. the scenario still fails with `Convergence timeout after 120000ms`
3. failover, publication convergence, and restart recovery gates are closed
4. `sql_transactions-p1` now reaches the target voter count
5. `replica_operations-p1` also reaches the target voter count, but carries a
   failed `REPLACE` with `Timeout in STOPPING step after 81688ms`
6. the new over-target set is `control_plane_publications-p1`, `logs-p1`,
   `sql_transaction_participants-p1`, and `replica_operations-p1`
7. logs now emphasize owner-query and transition pressure:
   `In-flight operation owner query indicates control-plane pressure`,
   retryable transition failures, `Message timeout`, and a system-table
   `Raft write commit timed out after 30000ms`

This is no longer the previous restart-recovery or priority-spread blocker. It
is a transition-progress and over-target trim problem after the owner gates
close.

## April 25 Execution Update

The first execution slice implemented critical STOPPING source-removal
visibility pressure as a deferred owner retry instead of a terminal timeout.
The rerun
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-stopping-visibility-defer.report.json`
still failed at `Convergence timeout after 120000ms`, but moved the concrete
symptom:

1. every expected partition reached voter count `3`
2. `Max over-target` was `0ms`
3. over-target durations were empty
4. failover, publication convergence, and restart recovery gates remained
   closed
5. the remaining blocker was current operation drain: pending `SENDING` rows,
   `ACTIVE` replacement rows, and CDC/control-plane transition pressure

The next execution slice is
[Rolling restart in-flight operation drain and CDC pressure](./todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md).
As part of that split, create admission now fences duplicate add-like
replacements when authoritative entity visibility is deferred but a
cache-visible source-removal conflict already exists.

## April 25 Re-Activation Update

The seed-contact startup-authority slice closed the restart-readiness blocker.
The representative rerun
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-seed-startup-authority.report.json`
failed later at `topology_unstable` / `convergence_timeout`:

1. failover, publication convergence, and restart recovery gates were closed
2. admin diagnostics were reachable on the restarted nodes
3. the terminal barrier was `waitForConvergence`
4. `In-flight replica operations` was `6`
5. in-flight statuses were `active=4`, `removing=1`, `creating=2`, and
   `pending=1`
6. `control_plane_publications-p1` was over target for `61512ms`
7. `service_timers-p1` was over target for `35054ms`
8. priority recovery invariants passed, with no unresolved priority-recovery
   semantic states

The blocker is therefore no longer durable rejoin reachability. The active
boundary is again operation transition pressure and bounded over-target trim,
now including `service_timers-p1`.

## April 25 Load-Stable Publication Fallback Update

The latest diagnostics slice fixed two stale-evidence paths before continuing
the runtime loop:

1. playback control-plane fallback now admits `scenario.load-readiness.stable`
   as post-active publication evidence, so a later closed priority-recovery
   snapshot supersedes stale `setup.cluster.waiting-active` priority-spread
   evidence
2. convergence timeout barriers now treat closed publication/recovery evidence
   as authoritative even when the report only has readiness failed-phase
   artifacts and no explicit `diagnostics.failure`

The representative rerun
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-load-stable-publication-fallback.report.json`
failed at `topology_unstable` / `convergence_timeout`, not restart recovery:

1. failover, convergence, and restart recovery gates are closed
2. publication epoch `5` is `steady_published`
3. priority spread is closed with `closure_satisfied_fresh`
4. all previous priority-recovery progress blockers are empty
5. `service_timers-p1` and `sql_transaction_participants-p1` reached voter
   count `3`
6. `sql_write_operations-p1` remained at voter count `2`
7. one `sql_write_operations-p1` `REPLACE` remained `syncing`, with target
   visibility `active_non_operational`
8. `control_plane_publications-p1` was still briefly over target for `8444ms`
9. logs still show control-plane pressure around owner queries, CDC forwarding,
   canonical partition leader lookup, and authoritative cache repair

The active blocker has narrowed again: close the post-active operation
transition for the `sql_write_operations-p1` syncing replacement, and keep
`control_plane_publications-p1` overflow bounded to zero.

## April 25 Remote Priority Drain Update

The resampled representative report
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-syncing-outcome-resample.report.json`
showed that the post-active voter-count and over-target symptoms are no longer
dominant:

1. failover, publication convergence, and restart recovery gates are closed
2. publication epoch `5` is `PUBLISHED`
3. every expected priority voter count is `3`
4. `Max over-target` is `0ms`
5. priority-recovery unresolved counts are all `0`
6. the remaining failure is five effective in-flight priority `REPLACE`
   operations whose completion snapshots are already `converged`

The execution slice in this package therefore moved the local-owner boundary:

1. incomplete-operation owner reads now expose local-owner operations plus a
   narrow priority-recovery drain candidate cohort
2. the operation workflow owner builds one priority-drain owner snapshot and
   only lets remote-owned rows reconcile when the canonical drain action is
   terminal completion
3. ordinary remote operations still remain outside timeout/recovery
   reconciliation
4. converged stale priority `SENDING`, `CREATING`, `ACTIVE`, and `STOPPING`
   replacement metadata can drain without redispatching target/source work

The representative rerun
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-remote-priority-drain.report.json`
proved that this closes the in-flight operation drain in the harness, but moved
the remaining blocker back to sustained over-target voters:

1. failover, publication convergence, and restart recovery gates are closed
2. publication epoch `5` is `PUBLISHED`
3. priority recovery unresolved counts remain `0`
4. in-flight replica operations are `0`
5. `control_plane_publications-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1` each have voter count `4`
6. `Max over-target` is `121272ms`, with all three over-target partitions at
   `121272ms`
7. replica membership diagnostics report `none`

The active boundary is now terminal operation drain followed by durable
over-target voter trim for those three partitions.

## April 25 Publication Closure And Admission Update

The next execution slice treated the repeated publication/recovery regressions
as one boundary issue rather than isolated final bugs:

1. newer membership publication revisions now replace stale published active
   and required-ACK lists instead of unioning old published members back into
   the desired state
2. post-rebalance closure diagnostics now expose operation drain, membership
   trim, publication visibility, CDC projection visibility, and over-target
   dimensions together
3. local ready nodes now retry membership publication ACK writes after
   transient publication-owner pressure and wake on both CDC and cache-visible
   publication rows
4. bootstrap admission now uses expiring leases so a stalled seed-contact
   request cannot hold the only in-flight admission slot indefinitely
5. membership publication planning now treats a trim candidate with carried
   complete ACK evidence as `PUBLISHED`, and aligns the recovery-active cohort
   with the settled trim target so removed stale members do not become
   artificial `missingPublishedRecoveryActiveNodeIds`

Representative migration:

1. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-membership-trim.report.json`
   reached target voters for `control_plane_publications-p1`, but left
   publication ACK debt visible.
2. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-publication-ack.report.json`
   isolated ACK write failures under participant pressure.
3. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-publication-ack-retry.report.json`
   closed publication ACK debt and moved the blocker to restarted-node
   recovery readiness.
4. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-bootstrap-admission-lease.report.json`
   moved beyond bootstrap admission, then exposed publication epoch `51` stuck
   `OPEN` with `pendingAckCount=0`, `repair_only` publication mode, and
   blocked nodes reporting `control_plane_publication_pending`.
5. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-ack-complete-trim.report.json`
   no longer shows the zero-pending-ACK `OPEN` publication. It fails earlier
   during load readiness: publication epoch `4` is `PUBLISHED`,
   `pendingAckCount=0`, `publicationPending=false`, and the active blocker is
   `priority_control_plane_spread_pending` /
   `priority_recovery_progress_blocked` with `needs_operation` on
   `sql_transaction_participants-p1` and `sql_transactions-p1`.

The residual is therefore no longer membership-publication ACK closure or
bootstrap admission. The current systemic boundary is priority-spread recovery
operation creation/progression during load readiness, before the scenario
reaches the post-active over-target convergence barrier.


## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling restart convergence timeout truth and classification](./done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md)
2. [Critical replace operation lifecycle convergence owner](./todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md)
3. [Critical recovery pressure reserve and admission contract](./done-20260424-critical-recovery-pressure-reserve-and-admission-contract.md)

## In Scope

1. Define one operation-transition pressure snapshot for post-active
   convergence.
2. Distinguish retryable owner-query or transition pressure from terminal
   operation failure.
3. Ensure active `REPLACE` rows in `remove_phase` either complete source
   removal, retry with a bounded deferred state, or become terminal with a
   follow-up action.
4. Trim bounded over-target voters for `control_plane_publications-p1`,
   `logs-p1`, `sql_transaction_participants-p1`, `replica_operations-p1`, and
   `service_timers-p1`.
5. Add focused proof for failed `STOPPING` recovery and source-removal
   progress under retryable owner query/write pressure.
6. Rerun `rolling-restart` and record whether the blocker closes or migrates.

## Out Of Scope

1. Increasing convergence timeout budgets.
2. Harness-only classification changes.
3. Broad matrix continuation before this post-active blocker has a named
   outcome.
4. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  operation workflow owner, with pressure/admission evidence supplied by the
  control-plane pressure owner.
- Canonical contract:
  one post-active transition snapshot names operation visibility, transition
  health, source-removal progress, voter-count convergence, pressure state,
  and the next required action.
- Allowed consumers:
  priority recovery observation, rebalancer follow-up planning, partition
  promotion admission, pressure diagnostics, and harness reporting.
- Prohibited reinterpretations:
  treating target voter count alone as operation lifecycle closure, ignoring
  failed `STOPPING` rows, or letting retryable owner-query pressure disappear
  into generic convergence timeout evidence.

## Progress Grammar

1. `transition_pressure_deferred` means owner reads or writes are retryable but
   delayed by pressure.
2. `source_removal_pending` means the replacement is active, but old-source
   removal has not completed.
3. `stopping_terminal_failure` means a `STOPPING` operation exceeded its owner
   timeout and needs a canonical follow-up action.
4. `over_target_trim_pending` means the partition is above target voters after
   spread is satisfied.
5. `closed` means voter count, operation lifecycle, and source-removal
   evidence are all converged.

## Residual Closure Inventory

- [ ] Owner snapshot names retryable owner-query pressure separately from
      terminal operation failure.
- [ ] Failed `STOPPING` `REPLACE` rows reconcile into one canonical follow-up
      action.
- [ ] Active replacements in `remove_phase` continue source removal after
      transient control-plane pressure.
- [x] Critical STOPPING source-removal visibility pressure defers instead of
      becoming a terminal timeout.
- [ ] The representative rerun reconfirms the over-target voter symptom is
      closed after failed-target cleanup. Earlier reruns reached target voter
      counts, but the remote-priority-drain rerun closed in-flight operations
      and regressed to sustained over-target voters on
      `control_plane_publications-p1`, `sql_transactions-p1`, and
      `sql_write_operations-p1`.
- [x] Cache-visible source-removal conflicts keep the entity add-like lane
      closed while authoritative entity visibility is deferred.
- [ ] `control_plane_publications-p1` trims bounded voter overflow on the next
      post-active rerun instead of regressing to restart recovery.
- [x] `service_timers-p1` trims bounded voter overflow on the next post-active
      rerun instead of regressing to restart recovery.
- [x] Non-priority `logs-p1` reached target voter count in the
      `system-replace-target-owner` rerun.
- [x] Terminal failed `REPLACE` targets are surfaced as planner cleanup removals
      before they can hold a partition above target indefinitely.
- [x] `sql_transaction_participants-p1` failed-target cleanup reaches the
      post-active convergence barrier and proves terminal target cleanup in the
      representative run.
- [ ] `sql_write_operations-p1` reaches target voter count and closes the
      remaining `SYNCING` replacement whose target visibility is
      `active_non_operational`.
- [x] Remote-owned stale priority `REPLACE` rows drain when priority recovery
      placement is already converged.
- [x] Fully acknowledged membership trim candidates publish immediately instead
      of creating an `OPEN` epoch with no pending ACK debt.
- [ ] Priority-spread recovery operation creation/progression closes during
      load readiness so the scenario can reach the post-active over-target
      barrier again.
- [ ] Any repeated `restart_recovery` /
      `priority_recovery_progress_blocked` regression becomes a newly named
      owner boundary instead of being counted as post-active over-target
      closure.
- [ ] Focused regression covers failed `STOPPING` plus active replacement
      source-removal progress under retryable pressure.
- [ ] `rolling-restart` passes or moves to a newly named owner boundary with
      the post-active transition-pressure loop closed.

## Validation

1. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js`
2. `npm test -- test/rebalancer/replace-replica-workflow.test.js`
3. `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
4. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`

Executed before activation:

1. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js`
2. Result: passed, `207/207`.
3. `npm test -- test/rebalancer/replace-replica-workflow.test.js`
4. Result: passed, `177/177`.
5. `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
6. Result: passed, `187/187`.
7. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
8. Result: passed, `44/44`.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json --fast-local --verbose`
10. Result: failed with `topology_unstable` / `convergence_timeout`; blocker
    moved to operation transition pressure and over-target trim.
11. `node --check src/rebalancer/operation-workflow-owner-segment-7.js`
12. Result: passed.
13. `node --check src/rebalancer/operation-workflow-owner-shared.js`
14. Result: passed.
15. `npm test -- test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`
16. Result: passed, `13/13`.
17. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-stopping-visibility-defer.report.json --fast-local --verbose`
18. Result: failed with `topology_unstable` / `convergence_timeout`, but
    over-target voters closed; all voter counts are target and current
    operation drain is now the named blocker.
19. `node --check src/rebalancer/rebalance-coordinator-segment-3.js`
20. Result: passed.
21. `node --check test/rebalancer/coordinator-dedup-gap.test.js`
22. Result: passed.
23. `npm test -- test/rebalancer/coordinator-dedup-gap.test.js`
24. Result: passed, `43/43`.
25. `npm test -- test/rebalancer/rebalance-coordinator-topology-guard.test.js`
26. Result: passed, `13/13`.
27. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-seed-startup-authority.report.json --fast-local --verbose`
28. Result: failed with `topology_unstable` / `convergence_timeout` after
    restart readiness closed; active evidence is in-flight replica operation
    drain plus bounded over-target durations on `control_plane_publications-p1`
    and `service_timers-p1`.
29. `npm test -- test/rebalancer/replica-operation-repository.test.js test/rebalancer/rebalance-coordinator-operation-ownership.test.js test/rebalancer/move-planner-inflight-cleanup.test.js test/rebalancer/unified-rebalancer.test.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
30. Result: passed, `654/654`.
31. `node --check src/rebalancer/move-planner.js && node --check src/rebalancer/unified-rebalancer-segment-3.js && node --check src/rebalancer/replica-operation-repository.js && node --check src/rebalancer/operation-workflow-owner-segment-7.js && node --check test/rebalancer/move-planner-inflight-cleanup.test.js && node --check test/rebalancer/replica-operation-repository.test.js && node --check test/rebalancer/rebalance-coordinator-operation-ownership-tail-more-test-cases.js`
32. Result: passed.
33. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-system-replace-target-owner.report.json --fast-local --verbose`
34. Result: failed with `topology_unstable` / `convergence_timeout`, but
    current in-flight replica operations drained to `0`; `service_timers-p1`,
    `control_plane_publications-p1`, and `logs-p1` reached target voter count.
    The remaining over-target partition was `sql_transaction_participants-p1`
    with failed terminal `REPLACE` target rows.
35. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-failed-target-cleanup.report.json --fast-local --verbose`
36. Result: failed earlier at `restart_recovery` with
    `priority_spread_pending`; regenerated classifier evidence has no
    unresolved priority-recovery operation state and places the priority
    partitions under `spread_satisfied_in_flight`. This rerun did not reach the
    post-active over-target convergence barrier.
37. State correction after review: the post-active over-target and operation
    transition claims are not closed by the latest representative evidence.
    They require either a rerun that reaches the post-active barrier or a new
    named restart-recovery owner boundary if the regression repeats.
38. `node --check test/distributed/harness/failure-bundle-segment-1.js`
39. Result: passed.
40. `node --check test/distributed/harness/failure-bundle-segment-2.js`
41. Result: passed.
42. `node --check test/distributed/harness/failure-bundle-segment-3.js`
43. Result: passed.
44. `node --check test/distributed/harness/failure-bundle-segment-4.js`
45. Result: passed.
46. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
47. Result: passed.
48. `node --check test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js`
49. Result: passed.
50. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
51. Result: passed, `46/46`.
52. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-load-stable-publication-fallback.report.json --fast-local --verbose`
53. Result: failed with `topology_unstable` / `convergence_timeout`.
    Corrected evidence shows failover, convergence, and restart recovery gates
    closed; publication epoch `5` is `steady_published`; priority spread is
    closed; `sql_write_operations-p1` is still at voter count `2` with one
    `REPLACE` in `SYNCING`; `control_plane_publications-p1` was over target for
    `8444ms`.
54. Reprocessed the latest report through `writeFailureBundlesForReport` after
    the classifier fix.
55. Result: saved report and bundle now classify the failure as
    `topology_unstable` / `convergence_timeout` with
    `failureBarrier=convergence`.
56. `node --check src/rebalancer/operation-workflow-owner-segment-7.js`
57. Result: passed.
58. `node --check src/rebalancer/replica-operation-repository-read-methods.js`
59. Result: passed.
60. `node --check src/rebalancer/replica-operation-repository.js`
61. Result: passed.
62. `node --check test/rebalancer/rebalance-coordinator-operation-ownership-tail-more-test-cases.js`
63. Result: passed.
64. `node --check test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-more-test-cases.js`
65. Result: passed.
66. `npm test -- test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`
67. Result: passed, `23/23`.
68. `npm test -- test/rebalancer/replica-operation-repository.test.js`
69. Result: passed, `280/280`.
70. `npm test -- test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
71. Result: passed, `108/108`.
72. `npm test -- test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
73. Result: passed, `144/144`.
74. `npm test -- test/rebalancer/replace-replica-workflow.test.js`
75. Result: passed, `177/177`.
76. `git diff --check -- src/rebalancer/operation-workflow-owner-segment-7.js src/rebalancer/replica-operation-repository-read-methods.js src/rebalancer/replica-operation-repository.js test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js test/rebalancer/rebalance-coordinator-operation-ownership-tail-more-test-cases.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-more-test-cases.js`
77. Result: passed.
78. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-remote-priority-drain.report.json --fast-local --verbose`
79. Result: failed with `topology_unstable` / `convergence_timeout`.
    Failover, publication convergence, restart recovery, and in-flight
    operation drain are closed. The blocker moved to sustained over-target
    voters: `control_plane_publications-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1` are at voter count `4` for `121272ms`.
80. `node --check src/bootstrap/bootstrap-api-constants.js`
81. Result: passed.
82. `node --check src/bootstrap/bootstrap-api.js`
83. Result: passed.
84. `node --check src/bootstrap/owners/bootstrap-request-owner.js`
85. Result: passed.
86. `node --check test/bootstrap/bootstrap-api.test-part-3.js`
87. Result: passed.
88. `npm test -- test/bootstrap/bootstrap-api.test-part-3.js`
89. Result: passed, `81/81`.
90. `npm test -- test/control-plane/replica-dispatch-node-state-update.test.js test/control-plane/control-plane-publication-merge.test.js test/control-plane/membership-publication-coordinator.test.js test/distributed/harness/__tests__/post-rebalance-closure-contract.test.js`
91. Result: passed, `276/276`.
92. `node --check src/control-plane/membership-publication-planning.js`
93. Result: passed.
94. `node --check test/control-plane/membership-publication-coordinator.test.js`
95. Result: passed.
96. `npm test -- test/control-plane/membership-publication-coordinator.test.js`
97. Result: passed, `181/181`.
98. `npm test -- test/control-plane/control-plane-publication-merge.test.js test/control-plane/membership-publication-coordinator.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
99. Result: passed, `261/261`.
100. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-ack-complete-trim.report.json --fast-local --verbose`
101. Result: failed during load readiness, not at the previous zero-pending-ACK
     `OPEN` publication. Publication epoch `4` is `PUBLISHED`,
     `pendingAckCount=0`, `publicationPending=false`, and priority spread is
     pending with `eligible_but_no_operation_created` /
     `priority_recovery_progress_blocked`.

## Done When

1. The post-active operation workflow emits one canonical outcome for
   transition pressure, failed `STOPPING`, source-removal progress, and
   over-target voter trim.
2. `rolling-restart` either passes convergence or migrates to a newly named
   owner boundary with this transition-pressure loop closed.
