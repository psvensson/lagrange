# Rolling Restart Operation Transition Pressure And Over-Target Trim

April 26 pause: this package is no longer the current execution owner. Recent
local `rolling-restart` reruns moved earlier than post-active trim into
startup active-gate publication recovery evidence, then migrated again to
missing published membership from a stale stopped node-state row. Active
execution remains with
[Publication recovery machine spec and preflight verification](./active-20260426-publication-recovery-machine-spec-and-preflight-verification.md).
Re-enter this package only after that publication recovery /
heartbeat-status revival boundary closes or migrates.

April 26 update: The April 26 source-visibility and
priority-recovery operation-creation fixes moved `rolling-restart` back to
this package's post-active convergence barrier.

Latest representative evidence after the publication ACK closure fixes and
state-machine pressure preflight:

1. `test-output/report.json`
2. failure point: `waitForConvergence` timed out after `120000ms`
3. run duration: `417.8s`
4. failure bundle:
   `test-output/.playback/report/rolling-restart/failure-bundle.md`
5. failure class: `topology_unstable`
6. dominant reason: `convergence_timeout`
7. publication epoch `9` is `PUBLISHED` with pending ACK count `0`
8. blocked publication node count: `0`
9. priority recovery blocked and unresolved partition counts: `0`
10. in-flight replica operations: `0`
11. effective in-flight replica operations: `0`
12. in-flight operation status summary still sees `active=3` and `removed=1`
13. over-target durations:
    `control_plane_publications-p1=140636ms`,
    `replica_operations-p1=140636ms`,
    `sql_transaction_participants-p1=140636ms`, and
    `sql_transactions-p1=140636ms`
14. post-rebalance closure is open on `membership_trim_open` and
    `no_over_target_open`
15. the state-machine pressure preflight on the report reports warnings for
    completed-active operation rows, membership trim after operation drain
    closure, and over-target voter cleanup after operation drain closure

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

## April 26 Source-Visibility Update

The recommendation implemented in this slice prevents ordinary source-removal
stop-phase success responses from making a `REPLACE` operation terminal before
source membership visibility confirms the old source is absent:

1. `COMPLETED` and idempotent remove acknowledgements now advance the operation
   to `STOPPING` and return `IN_PROGRESS`.
2. only an absent-source response can terminalize the stop phase immediately.
3. the workflow keeps persisted metadata in `removing` while source visibility
   reconciliation remains outstanding.
4. focused replacement workflow coverage proves the completed stop-phase
   response stays non-terminal.

The fast-local validation rerun moved to a different earlier blocker:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-stop-phase-source-visibility.report.json`
2. the scenario failed during load readiness, before the restart and before the
   post-active convergence barrier.
3. `control_plane_publications-p1` carried a failed priority `REPLACE` whose
   target was already `active_operational`.
4. the classification still exposed `eligible_but_no_operation_created` /
   `blocked_unclassified` evidence, while logs showed message-router,
   CDC-forwarding, and system-table write pressure.

The residual is therefore not the original `sql_write_operations-p1` premature
source-removal terminalization. The next boundary is priority recovery handling
for a terminal failed `REPLACE` whose target is already visible and operational:
that state must either satisfy the recovery closure model or create one
canonical follow-up operation instead of remaining unclassified.

## April 26 Post-Active Re-Entry Update

The failed-`REPLACE` active-target and local mutation priority-creation slices
closed the load-readiness priority recovery blockers and moved the
representative path back to this package:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-failed-replace-active-target.report.json`
   moved `control_plane_publications-p1` to `spread_satisfied_in_flight`.
2. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-local-mutation-priority-creation.report.json`
   moved beyond `sql_write_operations-p1` `needs_operation` /
   `eligible_but_no_operation_created`.
3. the final report has no unresolved priority recovery partitions and no
   pending priority spread.
4. `sql_write_operations-p1` now creates replacement operation rows and the
   target reaches active state.
5. the remaining failure is post-rebalance closure: operation drain,
   membership trim, publication visibility, and over-target voter count.

The current owner boundary is therefore no longer missing priority operation
creation. It is operation lifecycle drain plus durable trim for over-target
system partitions under publication and control-plane pressure.

## April 26 Executor Outcome And Successor-Leader Safety Update

The executor outcome wiring and quorum safety recommendations are implemented
for this active path:

1. runtime bootstrap and node-join service handlers now pass executor outcomes
   through the shared setup lane instead of dropping them at the handler edge.
2. metadata gateway reads now own the unified rebalancer path instead of
   direct CDC owner reads.
3. source-follower evidence no longer makes a `REPLACE` source removal safe by
   itself; the owner must observe either a canonical partition leader away from
   the source or replacement leader ownership.
4. quorum-conditioned removal tests now cover the missing canonical successor
   leader path, stale source-leader rows, and authoritative rows with missing
   `raft_role`.

Representative migration:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-executor-outcome-wiring.report.json`
   moved the run through operation drain soft-closure, but still had missing
   final leaders for `control_plane_publications-p1` and
   `sql_write_operations-p1`.
2. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-source-follower-successor-leader.report.json`
   closes that missing-leader symptom. All expected partitions have leaders,
   priority recovery has no blocked or unresolved partitions, and publication
   is `PUBLISHED` with no pending ACK debt.
3. the remaining blocker is now post-active operation lifecycle drain,
   membership trim, and over-target voter cleanup.
4. replacement election nudges are not enough under this load: handlers return
   completed responses, but canonical ownership for the replacement remains
   unobserved on `control_plane_publications-p1` and
   `replica_operations-p1`.

The next owner boundary is therefore no longer unsafe source removal from
source-follower evidence. It is the contract for completed replacement-election
requests that do not produce canonical replacement leader ownership, plus the
stale in-flight operation drain rows that keep trim and no-over-target closure
open.

## April 26 Post-Review Continuation Update

The review recommendations implemented in this slice close two local owner
gaps and move the representative rerun to a narrower quiescence failure:

1. dynamic config seeding and updates now use the injected control-plane
   gateway without requiring a CDC integration service when a gateway is
   already available
2. non-archived work package status now comes from filenames instead of
   duplicate body `Status:` fields
3. completed `MOVE_ASSIGNMENT` rows with `completedAt` no longer count as
   in-flight drain candidates
4. completed replacement-election requests that do not produce canonical
   replacement leadership now retarget to another eligible follower after the
   retry-suppression window instead of retrying the same completed request

The continuation rerun
`test-output/report.json` fails before the old final convergence report path:

1. `waitForControlPlaneQuiescence` times out after `120000ms`
2. failover, convergence, and restart-recovery gates are already closed
3. publication epoch `4` is `PUBLISHED` with no pending ACK debt
4. priority recovery blocked and unresolved counts remain `0`
5. the five priority partitions remain `spread_satisfied_in_flight`
6. operation rows with `completedAt` are terminal `removed` rows with
   `latestTimelineInFlight=false`
7. the still-open quiescence evidence is in-flight operation snapshots,
   admin snapshot timeouts, and control-plane backpressure during node-state
   publication and discovery repair

The residual is therefore no longer stale completed `MOVE_ASSIGNMENT` rows or
completed replacement-election retry loops. The next active boundary is
control-plane quiescence while priority partitions still have live
`spread_satisfied_in_flight` operation evidence. That work is now split as
[Control plane quiescence owner snapshot](./todo-20260426-control-plane-quiescence-owner-snapshot.md).

## April 26 Quiescence-Owner Rerun Update

The quiescence owner-state implementation and failure-bundle wiring are in
place, but the next representative rerun migrated earlier:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
2. Result: failed, `0/1` passed after `389.5s`.
3. Terminal barrier: `Convergence timeout after 120000ms`.
4. The failure bundle now reports `publication_convergence_blocked` with
   dominant reason `control_plane_publication_pending`.
5. Publication epoch `11` remains `OPEN`, pending ACK count is `0`, and all
   five nodes are blocked on control-plane publication visibility.
6. Priority recovery now names `coordination_mismatch` for
   `control_plane_publications-p1` and
   `sql_transaction_participants-p1`, plus `recovering_in_flight` for
   `replica_operations-p1`.
7. Post-rebalance closure is open on operation drain, publication visibility,
   and no-over-target evidence.

The active blocker is therefore back in this package: publication-visible trim
and operation transition pressure must close before the quiescence owner gate
can be re-entered.

## April 26 Publication ACK Closure And Pressure Preflight Update

The publication-visible portion of this package has now moved forward:

1. metadata refresh closes ACK-complete non-terminal publication rows instead
   of preserving `OPEN` with pending ACK count `0`.
2. membership publication row construction now honors an ACK-complete
   candidate publication status.
3. heartbeat-only READY updates now probe the ACK owner when the local cache
   sees a `PUBLISHED_NODE_MISSING` publication gap.
4. the first rerun moved from impossible `OPEN` / pending ACK `0` to real
   `ACK_PENDING` publication debt.
5. the second rerun closed publication convergence entirely: publication is
   `PUBLISHED`, pending ACK count is `0`, and the failure class moved to
   `topology_unstable`.

The package now has a fast preflight guardrail:

1. `node scripts/check-state-machine-pressure-preflight.js`
2. `node scripts/check-state-machine-pressure-preflight.js --report test-output/report.json`
3. `npm run audit:state-machine-pressure`

The report-backed preflight classifies the current pressure points before a
full rerun: completed-active operation rows, membership trim still open after
operation drain closure, and over-target voter cleanup still open after
operation drain closure.

## April 26 Replacement Target Not-Found Update

The latest playback showed a narrower source-removal liveness failure inside
the post-active trim set:

1. `sql_transaction_participants-p1` had an ACTIVE `REPLACE` source-removal
   row for `81b6d58d-a50c-483d-aa9c-2ad85899af82`.
2. source removal was blocked on
   `replacement leader ownership pending before safe removal`.
3. the replacement election nudge targeted
   `sql_transaction_participants-p1-r4` on
   `11601fe0-72d6-5853-8590-ec2881853e72`.
4. that node answered `Replica not found for leader handoff`.
5. the row then remained active, which kept the partition above target instead
   of releasing the failed target for cleanup planning.

The workflow owner now models this as a terminal replacement-target proof:

1. source-removal safety records replacement-election `NOT_FOUND` evidence.
2. if the same replacement replica still lacks canonical leader ownership and
   no retarget candidate has been selected, the safety state becomes
   `fail_replacement_replica_not_found`.
3. the operation is failed instead of deferred indefinitely.
4. the existing failed-`REPLACE` target cleanup path can then remove the stale
   target placement and let the planner create fresh work.

Focused coverage:

1. `node --test test/rebalancer/quorum-conditioned-remove-safety.test.js`
2. `node --test test/rebalancer/replace-replica-workflow.test.js`

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

## Static Drift Ledger

Preflight on April 26, 2026:

1. `npm run test:metadata-gateway:audit`: failed with 12 inherited violations.
   Relevant touched-file risk includes
   `src/rebalancer/unified-rebalancer-segment-4.js`.
2. `npm run audit:guideline:decision-boundaries`: failed with 16 inherited
   violations. Relevant touched-file risk includes
   `src/rebalancer/operation-workflow-owner-segment-4.js`.
3. `npm run audit:guideline:literals`: failed with 6288 inherited violations
   before the literal baseline/ratchet package.
4. `npm run audit:runtime-grammar`: passed with 0 violations.
5. Current representative blocker:
   `runtime-stability-rolling-restart-20260426-codex-priority-recent-intent-reuse`
   fails post-active convergence with `sql_write_operations-p1` over target.

Guardrail closure on April 26, 2026:

1. `npm run test:metadata-gateway:audit`: passed.
2. `npm run audit:guideline:decision-boundaries`: passed.
3. `npm run audit:guideline:literals`: passed with 0 new violations and 6224
   matched inherited baseline violations.
4. `npm run audit:guideline:boundary-mode-contracts`: passed.
5. `npm run audit:runtime-grammar`: passed.

Closure requirements:

1. The metadata-gateway, decision-boundary, literal, boundary-mode, and
   runtime-grammar audits must stay green for any future touched file in this
   package.
2. The repo-wide literal audit now uses a baseline ratchet; new literal
   violations must fail this package while inherited debt remains recorded.
3. The next `rolling-restart` rerun must either pass post-active convergence
   or migrate to a newly named owner boundary.

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
- [x] Ordinary `REPLACE` source-removal stop-phase success waits for source
      visibility instead of marking the operation removed immediately.
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
- [x] Missing priority-spread recovery operation creation closed in the
      recent-intent rerun, proving the earlier
      `eligible_but_no_operation_created` gap was not still the active symptom.
- [ ] Any repeated `restart_recovery` /
      `priority_recovery_progress_blocked` regression becomes a newly named
      owner boundary instead of being counted as post-active over-target
      closure.
- [x] Terminal failed priority `REPLACE` rows with an `active_operational`
      target classify as closure or emit one canonical follow-up operation
      during load readiness.
- [x] Required priority recovery operation creation bypasses local mutation
      readiness deferral and reaches rebalance evaluation.
- [x] The latest representative rerun reaches the post-active convergence
      barrier again instead of failing load readiness on
      `eligible_but_no_operation_created`.
- [x] Focused regression covers active replacement source-removal progress
      after ordinary stop-phase success.
- [x] Source-follower evidence cannot authorize source removal unless a
      canonical successor leader or replacement leader ownership is observed.
- [x] The latest representative rerun closes the prior missing final leader
      symptom for `control_plane_publications-p1` and `sql_write_operations-p1`.
- [x] Completed replacement-election requests must either produce canonical
      replacement leader ownership or move to one explicit retry/retarget
      outcome.
- [x] Stale active rows with `completedAt` reconcile out of in-flight operation
      drain; the focused proof is closed in
      [MOVE_ASSIGNMENT liveness proof hardening](./done-20260426-move-assignment-liveness-proof-hardening.md).
- [x] The current quiescence blocker is split into a dedicated active work
      package.
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
102. `npx tap test/rebalancer/replace-replica-workflow.test.js`
103. Result: passed, `198/198`.
104. `npx tap test/scripts/check-guideline-literals.test.js`
105. Result: passed.
106. `npm run audit:guideline:decision-boundaries`
107. Result: passed.
108. `npm run audit:guideline:boundary-mode-contracts`
109. Result: passed.
110. `npm run audit:runtime-grammar`
111. Result: passed.
112. `npm run audit:guideline:literals`
113. Result: passed with 0 new violations and 6284 inherited baseline
     violations.
114. `npm run test:metadata-gateway:audit`
115. Result: passed.
116. `git diff --check`
117. Result: passed.
118. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260426-codex-stop-phase-source-visibility.report.json --verbose`
119. Result: failed during load readiness before the restart. The residual is
     `control_plane_publications-p1` priority recovery with a failed `REPLACE`,
     target visibility `active_operational`, and control-plane delivery/write
     pressure. This rerun does not prove the post-active over-target barrier
     closed.
120. `node --check src/rebalancer/operation-workflow-owner-segment-5.js`
121. Result: passed.
122. `node --check test/rebalancer/quorum-conditioned-remove-safety-tail-more-test-cases.js`
123. Result: passed.
124. `node --check test/rebalancer/quorum-conditioned-remove-safety-tail-test-cases.js`
125. Result: passed.
126. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js --grep "source follower without canonical successor leader"`
127. Result: passed.
128. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js --grep "source follower evidence outruns partition leader ownership"`
129. Result: passed.
130. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js --grep "authoritative service rows with missing raft_role"`
131. Result: passed.
132. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js`
133. Result: passed, `229/229`.
134. `npm test -- test/rebalancer/replace-replica-workflow.test.js`
135. Result: passed, `198/198`.
136. `npm test -- test/rebalancer/unified-rebalancer.test.js --grep "priority operation creation bypass local"`
137. Result: passed.
138. `npm test -- test/bootstrap/shared/control-plane-setup.test.js test/bootstrap/shared/replica-handler-setup.test.js`
139. Result: passed, `30/30`.
140. `npm run audit:guideline:decision-boundaries`
141. Result: passed.
142. `npm run audit:guideline:literals`
143. Result: passed with 0 new violations and 6224 inherited baseline
     violations.
144. `npm run audit:runtime-grammar`
145. Result: passed.
146. `npm run audit:guideline:boundary-mode-contracts`
147. Result: passed.
148. `git diff --check`
149. Result: passed.
150. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260426-codex-source-follower-successor-leader.report.json --verbose`
151. Result: failed with `topology_unstable` / `convergence_timeout`. The
     previous missing final leader symptom is closed; the active blockers are
     now `operation_drain_open`, `membership_trim_open`, and
     `no_over_target_open`.
152. `npm test -- test/config/dynamic-config-service.test.js test/rebalancer/replica-operation-liveness.test.js test/rebalancer/quorum-conditioned-remove-safety.test.js`
153. Result: passed, `625/625`.
154. `npx eslint src/config/dynamic-config-service.js src/rebalancer/replica-operation-liveness.js src/rebalancer/operation-workflow-owner-segment-6.js test/config/dynamic-config-service.test.js test/rebalancer/replica-operation-liveness.test.js test/rebalancer/quorum-conditioned-remove-safety.test.js`
155. Result: passed.
156. `npm run audit:guideline:literals`
157. Result: passed with 0 new violations and 6219 inherited baseline
     violations.
158. `npm run audit:guideline:decision-boundaries`
159. Result: passed.
160. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
161. Result: failed, `0/1` passed after `418.2s`. The report is
     `test-output/report.json`. The terminal error is
     `Control plane did not quiesce within 120000ms`, with
     `spread_satisfied_in_flight` priority partitions and no stale active
     `completedAt` drain rows in the final priority snapshot.
162. `rg -n '^Status:' work/packages work/sprints -g '!work/packages/archived/**'`
163. Result: no matches.
164. `git diff --check`
165. Result: passed.
166. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
167. Result: failed, `0/1` passed after `389.5s`. The report is
     `test-output/report.json`. The terminal error is
     `Convergence timeout after 120000ms`; the failure bundle classifies the
     current blocker as `publication_convergence_blocked` /
     `control_plane_publication_pending` with publication epoch `11` still
     `OPEN`, pending ACK count `0`, blocked node count `5`, and over-target
     durations on `control_plane_publications-p1`, `replica_operations-p1`,
     and `sql_transactions-p1`.

## Done When

1. The post-active operation workflow emits one canonical outcome for
   transition pressure, failed `STOPPING`, source-removal progress, and
   over-target voter trim.
2. `rolling-restart` either passes convergence or migrates to a newly named
   owner boundary with this transition-pressure loop closed.
