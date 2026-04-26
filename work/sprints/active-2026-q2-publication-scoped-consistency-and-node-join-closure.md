# Runtime Stability And Harness Determinism Closure Sprint (AGPL)

## Goal

Get the current harness instability to a stable and understandable state by
closing the runtime liveness seams exposed during the `node-join-under-load`
representative gate, then driving the first secondary gate,
`rolling-restart`, through one current owner boundary at a time.

The sprint target is:

1. keep the completed `node-join-under-load` gate as historical proof
2. use `rolling-restart` as the current representative re-entry gate
3. close the durable rejoin startup-authority blocker before broad matrix reruns
4. make failure bundles classify from owner contracts, not reconstructed
   publication/readiness fragments
5. re-enter the wider harness matrix only after the current representative path is
   stable

## Why This Sprint Exists

The previous publication-scoped work was useful, but it is no longer the
dominant blocker. Recent artifacts show that publication and readiness
contradictions have moved out of the terminal path:

1. publication gates reach ready or steady-published states
2. priority spread summaries no longer dominate the final blocker
3. readiness/planning same-epoch contradictions are closed
4. the remaining failures are runtime liveness and pressure failures

The active failure chain is now:

1. critical `REPLACE` operations remain in flight at convergence timeout
2. source removal waits on explicit replacement leader ownership
3. control-plane write pressure and transient transport churn delay progress
4. harness classification can still describe the symptom with stale
   publication-oriented labels

This sprint keeps the old filename for continuity with the active branch, but
the execution scope is now runtime stability and harness determinism.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Critical `REPLACE` source-removal and replacement-leader convergence.
2. Critical recovery pressure reserve and admission behavior under load.
3. Harness failure classification from canonical owner-state contracts.
4. A narrow representative stability gate before broader matrix reruns.

## Out Of Scope

1. Harness-only exemptions that make failing runtime behavior look green.
2. Increasing convergence timeouts before the owner path is deterministic.
3. Broad 7-node or full matrix execution while the 5-node representative path
   is still failing.
4. Pro or Enterprise features.

## Scenario Target

Primary:

1. `rolling-restart` with `test/distributed/config/local.json`

Historical proof:

1. `node-join-under-load` passed once and passed a no-code confirmation rerun.

Secondary after the primary path is stable:

1. `seven-node-read-write-load-transaction-recovery`
2. `seven-node-load-during-partitioning`

## Active Packages

1. [Publication recovery machine spec and preflight verification](../packages/active-20260426-publication-recovery-machine-spec-and-preflight-verification.md)

## Queued Packages

The post-active transition and quiescence packages are paused until the current
startup/active-gate publication recovery and heartbeat-status blocker closes
or migrates:

1. [Rolling restart operation transition pressure and over-target trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)
2. [Control plane quiescence owner snapshot](../packages/todo-20260426-control-plane-quiescence-owner-snapshot.md)

All final consistency recommendation packages are complete or queued outside
the current execution path.

Other secondary matrix failures become active packages only after the
`rolling-restart` gate passes or migrates to a new named owner boundary.

Queued convergence-grammar packages:

1. [Rolling restart post-active convergence timeout](../packages/todo-20260424-rolling-restart-post-active-convergence-timeout.md)
2. [Admin observation owner cutover and repair fencing](../packages/todo-20260424-admin-observation-owner-cutover-and-repair-fencing.md)
3. [Critical pressure workload taxonomy audit](../packages/todo-20260424-critical-pressure-workload-taxonomy-audit.md)
4. [Critical replace operation lifecycle convergence owner](../packages/todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md)
5. [Rolling restart in-flight operation drain and CDC pressure](../packages/todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md)

## Remaining Work Summary

1. Current execution blocker:
   The April 26 source-visibility, failed-`REPLACE` active-target, local
   mutation priority-creation, executor outcome, metadata gateway, successor
   leader safety, completed-row liveness, ACK-complete publication repair,
   heartbeat ACK probe, state-machine pressure preflight, replacement-target
   `NOT_FOUND`, and quiescence-classification slices are complete or paused.
   The latest pre-revival `test-output/report.json` rerun moved the blocker
   again and did not reach post-active trim or quiescence. Publication is now
   `PUBLISHED`, pending ACK is `0`, priority recovery is `none`, active
   diagnostics report `5/5`, but snapshot coverage is `4/5` because one active
   node is missing from published membership:
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
2. Next active investigation:
   close the active
   [Publication recovery machine spec and preflight verification](../packages/active-20260426-publication-recovery-machine-spec-and-preflight-verification.md)
   boundary. The immediate blocker is no longer post-active trim or
   quiescence. The ACK/published-active evidence normalization slice moved the
   failure to stale node-state publication: the missing node is direct-probe
   active/admin-ready while the durable control-plane node row still carries
   stale `stopped` status. READY heartbeat-only recovery now revives that row
   to active before membership publication repair; the representative rerun is
   intentionally pending.
3. Harness classification:
   terminal barrier evidence wins over stale playback reconstruction for
   active, restart-recovery, load-readiness, and convergence failures. The
   current representative failure classifies from the shared publication
   recovery machine so stale top-level publication summaries cannot hide
   active-gate ACK or missing-published evidence.
4. Final consistency:
   the final leader-map consistency package is complete for this sprint
   because the rerun moved to a freshly split non-final blocker.
5. Residual cleanup:
   fence or delete superseded local reconstruction and caller-local pressure
   exception paths through queued packages only after the current publication
   recovery / node-state revival blocker closes or migrates.
6. Matrix re-entry:
   after `rolling-restart` passes or moves to a stable named blocker,
   continue with `seven-node-read-write-load-transaction-recovery`, then
   `seven-node-load-during-partitioning`; any new failure must become a named
   package before broad matrix expansion.

## Completed Blocker-Migration Packages

These packages are no longer active. They remain relevant history because each
one removed an earlier interpretation or owner-path blocker and moved the
representative failure forward.

1. [Publication-scoped consistency and node-join closure](../packages/done-20260423-publication-scoped-consistency-and-node-join-closure.md)
2. [Priority recovery readiness and workflow convergence closure](../packages/done-20260423-priority-recovery-readiness-and-workflow-convergence-closure.md)
3. [Membership publication planning evidence union closure](../packages/done-20260423-membership-publication-planning-evidence-union-closure.md)
4. [Priority recovery persistence contract closure](../packages/done-20260423-priority-recovery-persistence-contract-closure.md)
5. [Priority recovery visibility wakeup and diagnostics closure](../packages/done-20260423-priority-recovery-visibility-wakeup-and-diagnostics-closure.md)
6. [Harness replay publication evidence tooling](../packages/done-20260423-harness-replay-publication-evidence-tooling.md)
7. [Idempotent source removal durable cleanup closure](../packages/done-20260423-idempotent-source-removal-durable-cleanup-closure.md)
8. [Priority source-removal leader closure witness](../packages/done-20260423-priority-source-removal-leader-closure-witness.md)
9. [Priority leader handoff re-election closure](../packages/done-20260423-priority-leader-handoff-reelection-closure.md)
10. [Load-lane serve-readiness freshness cutover](../packages/done-20260423-load-lane-serve-readiness-freshness-cutover.md)
11. [Node admission pressure and load convergence closure](../packages/done-20260423-node-admission-pressure-and-load-convergence-closure.md)
12. [Readiness planning runtime convergence under load](../packages/done-20260424-readiness-planning-runtime-convergence-under-load.md)
13. [Runtime grammar contract audit guardrail](../packages/done-20260423-runtime-grammar-contract-audit-guardrail.md)
14. [Publication evidence drift replay gate closure](../packages/done-20260423-publication-evidence-drift-replay-gate-closure.md)
15. [Publication recovery gate summary authority closure](../packages/done-20260423-publication-recovery-gate-summary-authority-closure.md)
16. [Priority recovery follow-up operation creation](../packages/done-20260424-priority-recovery-followup-operation-creation.md)
17. [Rolling restart recovery-ready and transport pressure](../packages/done-20260424-rolling-restart-recovery-ready-and-transport-pressure.md)
18. [Rolling restart post-restart ACTIVE gate and transport saturation](../packages/done-20260424-rolling-restart-post-restart-active-gate-and-transport-saturation.md)
19. [Rolling restart final leader-map consistency and CDC pressure](../packages/done-20260424-rolling-restart-final-leader-map-consistency-and-cdc-pressure.md)
20. [Final consistency barrier and decision table](../packages/done-20260424-final-consistency-barrier-and-decision-table.md)
21. [Control snapshot authority certificate](../packages/done-20260424-control-snapshot-authority-certificate.md)
22. [Admin observation mode and repair contract](../packages/done-20260424-admin-observation-mode-and-repair-contract.md)
23. [Final consistency failure classifier cutover](../packages/done-20260424-final-consistency-failure-classifier-cutover.md)
24. [Rolling restart durable rejoin admin reachability](../packages/done-20260425-rolling-restart-durable-rejoin-admin-reachability.md)
25. [Priority spread recovery operation creation under load](../packages/done-20260426-priority-spread-recovery-operation-creation-under-load.md)
26. [Priority failed replace active-target recovery closure under load](../packages/done-20260426-priority-failed-replace-active-target-recovery-closure-under-load.md)
27. [Priority operation creation local mutation gate under load](../packages/done-20260426-priority-operation-creation-local-mutation-gate-under-load.md)
28. [MOVE_ASSIGNMENT liveness proof hardening](../packages/done-20260426-move-assignment-liveness-proof-hardening.md)
29. [State machine pressure preflight](../packages/done-20260426-state-machine-pressure-preflight.md)

## Parked Work

These packages remain valid backlog but are not on the current critical path:

1. [Priority recovery publication closure witness contract](../packages/todo-20260423-priority-recovery-publication-closure-witness-contract.md)
2. [Priority recovery closure consumer cutover and guardrails](../packages/todo-20260423-priority-recovery-closure-consumer-cutover-and-guardrails.md)
3. [Rolling-restart load-pressure follow-up](../packages/todo-20260421-rolling-restart-load-pressure-follow-up.md)
4. [Startup and rebalancer middle-layer closure](./todo-2026-q2-startup-and-rebalancer-middle-layer-closure.md)

## Current Dominant Blocker

The representative `node-join-under-load` path is stable as of April 24, 2026.
It passed once and then passed a no-code confirmation rerun:

1. `test-output/reports/runtime-stability-node-join-20260424-codex-completed-replace-placement.report.json`
2. `test-output/reports/runtime-stability-node-join-20260424-codex-completed-replace-placement-confirmation.report.json`

The active blocker has moved to the first secondary matrix re-entry scenario:
`rolling-restart`.

Current secondary evidence:

1. `rolling-restart` first failed publication-scoped readiness because priority
   spread was genuinely pending, not because of stale harness publication
   reconstruction.
2. The next reruns exposed terminal failed `REPLACE` visibility wake,
   superseded stale in-flight rows, and finally a `needs_operation` follow-up
   creation gap for `replica_operations-p1`; those owner-path blockers are now
   implemented and focused-tested.
3. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-priority-followup-created.report.json`
   moved beyond `needs_operation`; priority recovery decisions had no
   unresolved semantic states, and the next failure was a final leader map
   comparison after load-mode soft active success.
4. The scenario now requires strict/default active convergence after load has
   stopped and before final consistency.
5. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-final-active.report.json`
   now fails earlier at restarted-node recovery readiness: the restarted node
   is reachable by `bootstrap_health`, but `adminReady=false`,
   `controlPlaneRecoveryReady=false`, and the admin API probe reports
   `ECONNREFUSED`.
6. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-recovery-readiness-owner-blocker.report.json`
   moved beyond per-restart recovery readiness and failed later at strict
   post-restart ACTIVE convergence: `snapshotCoverage=5/5`,
   `publicationConvergence=ready`, `priorityRecoveryInvariants=passed`,
   `active=3/5`, one node readiness probe timed out, and one node remained
   `warming`.
7. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-post-restart-active-classified.report.json`
   moved beyond strict post-restart ACTIVE convergence and failed during final
   leader-map consistency. Final active evidence was ready:
   `activeNodeCount=5/5`, `snapshotCoverage=5/5`,
   `publicationStatus=PUBLISHED`, `pendingAck=0`,
   `prioritySpreadSatisfied=true`, and all priority recovery unresolved counts
   were zero.
8. The final-consistency secondary blocker was therefore
   [Rolling restart final leader-map consistency and CDC pressure](../packages/done-20260424-rolling-restart-final-leader-map-consistency-and-cdc-pressure.md).
9. The four execution splits under that blocker are complete:
   [Final consistency barrier and decision table](../packages/done-20260424-final-consistency-barrier-and-decision-table.md),
   [Control snapshot authority certificate](../packages/done-20260424-control-snapshot-authority-certificate.md),
   [Admin observation mode and repair contract](../packages/done-20260424-admin-observation-mode-and-repair-contract.md),
   and
   [Final consistency failure classifier cutover](../packages/done-20260424-final-consistency-failure-classifier-cutover.md).
10. The inactive-node blocker migrated again in
    `test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-restart-admin-ready.report.json`.
    Strict ACTIVE is closed, but `waitForConvergence` times out after
    `120000ms` with over-target voter durations and active replacement
    operation history.
11. Later reruns moved back inside the per-node restart readiness barrier.
    In
    `test-output/reports/runtime-stability-rolling-restart-20260424-codex-phase-adoption.report.json`,
    the restarted node is reachable by `bootstrap_health`, but
    `adminReady=false`, `controlPlaneRecoveryReady=false`, and readiness
    remains degraded on `LEADER_METADATA_INCOMPLETE` plus
    `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.
12. That restart-recovery blocker is now superseded by later evidence:
    [Rolling restart restart-recovery priority spread pending](../packages/superseded-20260424-rolling-restart-restart-recovery-priority-spread-pending.md).
13. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-restart-recovery-followup-action.report.json`
    kept the restart-recovery barrier open, but moved the `needs_operation`
    partition to `replica_operations-p1` and created follow-up operations for
    the earlier `sql_write_operations-p1` gap.
14. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-system-yields-priority-spread.report.json`
    moved beyond restart recovery: failover, publication convergence, and
    `restart_recovery` are closed; publication is `PUBLISHED`; pending ACK
    count is `0`; priority spread is satisfied; and priority recovery
    unresolved counts are `0`.
15. That secondary blocker was closed as
    [Rolling restart convergence timeout truth and classification](../packages/done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md),
    and handed dormant runtime closure to
    [Critical replace operation lifecycle convergence owner](../packages/todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md).
16. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json`
    kept the same post-active convergence barrier but moved the concrete
    runtime blocker: `sql_transactions-p1` now reaches target voter count,
    `replica_operations-p1` reaches target while retaining a failed
    `STOPPING` replace, and the over-target set is now
    `control_plane_publications-p1`, `logs-p1`,
    `sql_transaction_participants-p1`, and `replica_operations-p1`.
17. That execution split is now queued as
    [Rolling restart operation transition pressure and over-target trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
18. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-stopping-visibility-defer.report.json`
    moved the blocker again after the STOPPING visibility-pressure fix: all
    voter counts are target, `Max over-target` is `0ms`, over-target durations
    are empty, and the remaining evidence is operation drain under CDC and
    control-plane transition pressure.
19. That execution split is now queued as
    [Rolling restart in-flight operation drain and CDC pressure](../packages/todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md).
20. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-cache-visible-source-removal-fence.report.json`
    moved the blocker back to restarted-node readiness after the
    duplicate-admission fence: bootstrap health was reachable, but
    `adminReady=false`, `controlPlaneRecoveryReady=false`, and admin probing
    failed with `ECONNREFUSED`.
21. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-bootstrap-join-projection-diagnostics.report.json`
    kept the same restart-readiness barrier, but now names the canonical
    projection blocker:
    `bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`.
22. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-seed-startup-authority.report.json`
    closed the restart-readiness blocker and moved the failure back to
    `topology_unstable` / `convergence_timeout` after admin diagnostics,
    publication convergence, and restart recovery were available.
23. The queued post-active execution split is
    [Rolling restart operation transition pressure and over-target trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
24. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-system-replace-target-owner.report.json`
    moved the post-active blocker forward again: current in-flight replica
    operations drained to `0`; `service_timers-p1`,
    `control_plane_publications-p1`, and `logs-p1` reached target voter count;
    the remaining over-target partition was
    `sql_transaction_participants-p1` with failed terminal `REPLACE` target
    rows.
25. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-failed-target-cleanup.report.json`
    did not confirm that post-active closure. It failed earlier at
    `restart_recovery` with `priority_spread_pending`; regenerated classifier
    evidence has no unresolved priority-recovery operation state and places
    `control_plane_publications-p1`, `replica_operations-p1`,
    `sql_transaction_participants-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1` under `spread_satisfied_in_flight`.
26. The post-active split therefore remains queued for confirmation. The next
    rerun must first close or migrate the active load-readiness
    priority-spread blocker, then either reach the post-active barrier and
    prove failed-target cleanup, or name the repeated restart-recovery
    regression as its own owner boundary.
27. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-bootstrap-admission-lease.report.json`
    moved past the stale bootstrap admission lease, then exposed publication
    epoch `51` stuck `OPEN` despite `pendingAckCount=0`; the diagnostics also
    showed `repair_only` publication mode and blocked nodes reporting
    `control_plane_publication_pending`.
28. The membership publication owner now closes fully acknowledged trim
    candidates immediately and aligns the recovery-active cohort with the
    settled trim target. Focused publication planning/gate tests pass.
29. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-ack-complete-trim.report.json`
    confirms that the zero-pending-ACK `OPEN` publication is gone in the
    representative path. The run fails earlier during load readiness:
    publication is `PUBLISHED`, pending ACK count is `0`, publication pending is
    false, and priority spread recovery is blocked by `needs_operation` on
    `sql_transaction_participants-p1` and `sql_transactions-p1`.
30. The post-active split remains queued, and the dominant systemic boundary
    has moved from membership publication closure to the active
    [Priority spread recovery operation creation under load](../packages/done-20260426-priority-spread-recovery-operation-creation-under-load.md)
    package.
31. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-failed-replace-active-target.report.json`
    confirms that `control_plane_publications-p1` no longer owns missing
    operation creation after a failed priority `REPLACE` with an
    `active_operational` target. That partition is
    `spread_satisfied_in_flight`.
32. The current load-readiness blocker is now
    `sql_write_operations-p1` with semantic state `needs_operation`, blocker
    `eligible_but_no_operation_created`, no operation row, and next action
    `create_recovery_operation`.
33. That migrated load-readiness boundary was split as
    [Priority operation creation local mutation gate under load](../packages/done-20260426-priority-operation-creation-local-mutation-gate-under-load.md).
34. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-local-mutation-priority-creation.report.json`
    moved beyond load readiness and through the restart cycle. Priority
    recovery blocked and unresolved counts are `0`,
    `eligible_but_no_operation_created` is empty, `needs_operation` is empty,
    and priority spread is not pending.
35. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-executor-outcome-wiring.report.json`
    wires executor outcomes through bootstrap and node-join runtime handlers,
    but still leaves missing final leaders for `control_plane_publications-p1`
    and `sql_write_operations-p1`.
36. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-source-follower-successor-leader.report.json`
    closes the missing-leader symptom after source-follower evidence stopped
    authorizing source removal without a canonical successor leader.
37. The current blocker is post-restart convergence: in-flight replica
    operations are `6`, stale active rows with `completedAt` remain in drain,
    replacement election requests complete without canonical replacement leader
    ownership for `control_plane_publications-p1` and
    `replica_operations-p1`, and post-rebalance closure is open on operation
    drain, membership trim, and no-over-target evidence.
38. The active package is again
    [Rolling restart operation transition pressure and over-target trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
39. The post-review continuation run in `test-output/report.json` moves the
    blocker again. It fails in `waitForControlPlaneQuiescence` after
    `120000ms`, with failover, convergence, restart recovery, and publication
    ACK gates closed.
40. The prior stale active `completedAt` drain symptom is closed in the final
    priority snapshot. Completed rows are terminal `removed` rows with
    `latestTimelineInFlight=false`, and completed replacement-election
    requests now have an explicit retarget outcome.
41. The remaining dominant evidence is quiescence instability:
    `replica_operations_in_flight` samples, one snapshot timeout on
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, node-state publication write
    pressure, discovery repair timeouts, and five priority partitions still
    classified as `spread_satisfied_in_flight`.
42. The quiescence boundary is now active as
    [Control plane quiescence owner snapshot](../packages/todo-20260426-control-plane-quiescence-owner-snapshot.md).
    Its first implementation slice added an explicit snapshot resolver and
    wired `waitForControlPlaneQuiescence` through that resolver.
43. The quiescence continuation added progressing/stalled operation-drain
    states, snapshot/admin timeout pressure classification, structured
    quiescence timeout diagnostics, and failure-bundle owner-state
    classification.
44. The `MOVE_ASSIGNMENT` proof-hardening split is complete. Active assignment
    rows without durable completion remain in flight, while report-shaped
    completed assignment rows drain from the liveness summary.
45. The next `rolling-restart` rerun did not reach quiescence. It failed at
    `waitForConvergence` after `389.5s` with publication epoch `11` still
    `OPEN`, pending ACK count `0`, blocked node count `5`,
    `control_plane_publication_pending`, priority recovery
    `coordination_mismatch` / `recovering_in_flight`, and over-target durations
    on `control_plane_publications-p1`, `replica_operations-p1`, and
    `sql_transactions-p1`.
46. A startup active-gate rerun moved the blocker earlier than post-active
    convergence and quiescence. The regenerated playback classified
    `publication_convergence_blocked` /
    `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, publication epoch `91` was
    `ACK_PENDING`, top-level pending ACK was stale at `0`, active-gate
    progress reported `pendingAck=1`, and priority recovery carried
    `coordination_mismatch` / `blocked_unclassified` evidence. The active
    package became
    [Publication recovery machine spec and preflight verification](../packages/active-20260426-publication-recovery-machine-spec-and-preflight-verification.md).
47. The publication recovery evidence fix moved the latest
    `test-output/report.json` rerun again. Publication is `PUBLISHED`,
    `pendingAck=0`, priority recovery is `none`, and active diagnostics report
    `5/5`, but published active membership is `4/5` with missing node
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`. The root cause is stale durable
    node-state status: direct node diagnostics are active/admin-ready, while
    the control-plane node row still says `stopped` despite READY/fresh
    heartbeat evidence. The current code slice revives stale stopped rows on
    READY heartbeat-only recovery updates; the post-fix representative rerun
    has not been run.

## Progress Grammar

This sprint uses one ordered grammar for the representative path:

1. `source_handoff_required` means the source replica may still own leadership
   or source-side evidence is insufficient.
2. `source_handoff_observed` means the source side has yielded or reported
   explicit handoff evidence.
3. `replacement_election_requested` means the replacement replica has been
   nudged through the canonical handoff/election lane.
4. `replacement_leader_observed` means owner-visible evidence names a
   non-source replacement leader.
5. `safe_remove` means source removal may dispatch.
6. `critical_progress_deferred` means progress is delayed by an explicit
   pressure, transport, or owner-read deferred outcome.
7. `terminal_failure` means owner evidence proves the operation cannot recover
   without a new operation.

## Entry Gate

This sprint stays active until all of the following are true:

1. 5-node `node-join-under-load` passes after the critical replace/remove
   owner path is fixed. Status: complete.
2. A second representative rerun without code changes also passes or fails
   with a newly named blocker that is explicitly split. Status: complete.
3. Critical recovery traffic has an explicit pressure/admission contract so
   diagnostics and background work cannot starve source handoff, replacement
   election, replica operation transitions, node-state publication, or
   membership publication. Status: implemented for the representative path;
   memory and queue pressure remain residual risks.
4. Harness triage and failure bundles classify the final blocker from
   canonical owner-state contracts. Status: implemented for final consistency
   and quiescence owner-state failures; the next `rolling-restart` rerun should
   now identify `control_plane_pressure`, `operation_drain_stalled`,
   `leadership_churn`, critical spread, authority divergence, observer/cache
   lag, CDC lag, or the next runtime blocker from structured diagnostics.
5. Broad matrix reruns are reintroduced only through the representative
   stability package. Status: started with `rolling-restart`.

## Validation Ladder

Use this order:

1. focused owner-path tests for the active package
2. boundary-transition or harness unit tests for classification/reporting
3. one `rolling-restart` representative rerun
4. one no-code representative confirmation rerun when `rolling-restart` passes
5. broader scenarios only after the `rolling-restart` gate is stable

Do not use repeated full distributed reruns as the primary debugging loop.

Executed on April 24, 2026:

1. `npm test -- test/rebalancer/unified-rebalancer.test.js test/control-plane/priority-recovery-snapshot.test.js`
2. Result: `289/289` assertions passing after priority follow-up creation.
3. `node-join-under-load` representative run: passed.
4. `node-join-under-load` no-code confirmation run: passed.
5. `rolling-restart` re-entry run:
   `test-output/reports/runtime-stability-rolling-restart-20260424-codex-superseded-stale-operation.report.json`
6. Result: failed with the named remaining blocker
   `replica_operations-p1` / `needs_operation`.
7. `node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
8. Result: passed.
9. `rolling-restart` follow-up creation proof run:
   `test-output/reports/runtime-stability-rolling-restart-20260424-codex-priority-followup-created.report.json`
10. Result: moved past `needs_operation`; exposed final leader comparison
    after load-mode soft active success.
11. `rolling-restart` strict final active run:
    `test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-final-active.report.json`
12. Result: failed at restarted-node recovery readiness with admin API
    `ECONNREFUSED`.
13. `rolling-restart` recovery-readiness owner blocker run:
    `test-output/reports/runtime-stability-rolling-restart-20260424-codex-recovery-readiness-owner-blocker.report.json`
14. Result: moved past per-restart recovery readiness and failed at strict
    post-restart ACTIVE convergence under transport saturation.
15. `node test/distributed/harness/__tests__/failure-bundle.test.js`
16. Result: passed.
17. `node test/distributed/harness/__tests__/cluster.test-part-6.js`
18. Result: passed.
19. `node test/distributed/harness/__tests__/cluster.test.js`
20. Result: passed.
21. `rolling-restart` post-restart ACTIVE classified run:
    `test-output/reports/runtime-stability-rolling-restart-20260424-codex-post-restart-active-classified.report.json`
22. Result: moved past strict post-restart ACTIVE convergence and failed at
    final leader-map consistency for `sql_transactions-p1`.
23. Final consistency harness continuation:
    `node test/distributed/harness/__tests__/assert-consistency.test.js`
24. Result: passed, `34/34`; final consistency mismatches now carry
    owner-backed `finalConsistency` diagnostics and escalate to authoritative
    snapshot repair after the convergence force-repair threshold.
25. Failure bundle continuation:
    `node test/distributed/harness/__tests__/failure-bundle.test.js`
26. Result: passed, `35/35`; leader-map mismatches after closed ACTIVE
    readiness classify as topology/final-consistency blockers instead of stale
    startup readiness blockers.
27. Final consistency barrier split:
    `node test/distributed/harness/__tests__/assert-consistency.test.js`
28. Result: passed, `35/35`; revision-bearing leader mismatches now classify
    as observer revision lag with all-observer partition evidence.
29. Failure bundle barrier split:
    `node test/distributed/harness/__tests__/failure-bundle.test.js`
30. Result: passed, `36/36`; structured observer revision lag now maps to
    cache-stale classification while comparable leader mismatches remain
    topology instability.
31. Control snapshot authority certificate split:
    `node test/admin/admin-control-snapshot-response-contract.test.js`
32. Result: passed, `6/6`; admin control snapshots now emit
    `partitionLeaderAuthority` certificates and preserve snapshot revisions on
    owner-resolved snapshots.
33. Authority-backed final consistency split:
    `node test/distributed/harness/__tests__/assert-consistency.test.js`
34. Result: passed, `37/37`; final consistency now distinguishes
    certificate-backed observer authority visibility lag from authority
    divergence.
35. Authority-backed failure bundle split:
    `node test/distributed/harness/__tests__/failure-bundle.test.js`
36. Result: passed, `37/37`; authority visibility lag maps to cache-stale
    classification.
37. Admin observation mode split:
    `node test/admin/admin-control-snapshot-response-contract.test.js`
38. Result: passed, `10/10`; control snapshot rows now name local-cache,
    fresh-owner, scheduled-repair, forced-repair, and deferred repair
    observation modes.
39. Final consistency observation-mode split:
    `node test/distributed/harness/__tests__/assert-consistency.test.js`
40. Result: passed, `37/37`; final consistency diagnostics now include
    observation modes by node and per-partition leader evidence.
41. Failure-bundle compatibility check:
    `node test/distributed/harness/__tests__/failure-bundle.test.js`
42. Result: passed, `37/37`.
43. Final consistency classifier cutover:
    `node test/distributed/harness/__tests__/failure-bundle.test.js`
44. Result: passed, `40/40`; structured `finalConsistency` diagnostics now
    classify topology, cache visibility lag, CDC lag, and unknown final states
    before the legacy message compatibility path is considered.
45. Rolling-restart final-consistency rerun:
    `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-final-consistency-rerun.report.json --fast-local --verbose`
46. Result: failed before final consistency at strict ACTIVE convergence:
    `active=4/5`, `snapshotCoverage=5/5`, `publication=PUBLISHED`,
    `recoveryProtocolState=steady_published`, priority recovery blocked count
    `0`, terminal blocker `inactive_nodes=1`.
47. Terminal active-gate classification repair:
    `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
48. Result: passed, `41/41`; failure bundles now prefer terminal report-level
    active-gate diagnostics over stale playback priority-recovery evidence.
49. Latest rolling-restart failure bundle/triage regeneration.
50. Result: regenerated bundle and triage classify the run as
    `topology_unstable` with dominant reason `inactive_nodes=1`.
51. Latest rolling-restart analysis:
    `test-output/reports/runtime-stability-rolling-restart-20260424-codex-phase-adoption.report.json`
52. Result: failed at restarted-node recovery readiness with
    `priority_spread_pending`; this superseded blocker was wired through
    [Rolling restart restart-recovery priority spread pending](../packages/superseded-20260424-rolling-restart-restart-recovery-priority-spread-pending.md).
53. Later rolling-restart analysis:
    `test-output/reports/runtime-stability-rolling-restart-20260424-codex-system-yields-priority-spread.report.json`
54. Result: failed after closed restart recovery and priority spread with
    `Convergence timeout after 120000ms`, over-target voters for
    `replica_operations-p1` and `sql_transactions-p1`, and in-flight
    operation history; pre-fix harness classification reported stale
    `startup_recovery_blocked`, then handed closure to
    [Rolling restart convergence timeout truth and classification](../packages/done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md).
55. Harness barrier-precedence execution:
    `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
56. Result: passed, `44/44`; replaying the latest
    `system-yields-priority-spread` report now classifies `rolling-restart`
    as `topology_unstable` / `convergence_timeout` with
    `failureBarrier=convergence` and
    `failureBarrierReason=convergence_timeout`.
57. Focused operation-lifecycle validation:
    `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js`
58. Result: passed, `207/207`.
59. Focused replacement workflow validation:
    `npm test -- test/rebalancer/replace-replica-workflow.test.js`
60. Result: passed, `177/177`.
61. Priority recovery snapshot validation:
    `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
62. Result: passed, `187/187`.
63. Rolling-restart operation-lifecycle rerun:
    `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json --fast-local --verbose`
64. Result: failed with the same `Convergence timeout after 120000ms`, but
    moved the blocker to operation transition pressure and the over-target set
    `control_plane_publications-p1`, `logs-p1`,
    `sql_transaction_participants-p1`, and `replica_operations-p1`.
65. Fresh artifact classification regeneration:
    `writeFailureBundlesForReport` for
    `test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json`
66. Result: canonical playback now reports `topology_unstable` /
    `convergence_timeout` with `failureBarrier=convergence`.
67. STOPPING visibility-pressure validation:
    `npm test -- test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`
68. Result: passed, `13/13`; critical STOPPING source-removal visibility
    pressure defers instead of failing terminally.
69. Rolling-restart STOPPING visibility-pressure rerun:
    `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-stopping-visibility-defer.report.json --fast-local --verbose`
70. Result: failed with `topology_unstable` / `convergence_timeout`, but
    closed over-target voters: all expected partitions had voter count `3`,
    `Max over-target` was `0ms`, and over-target durations were empty.
71. Cache-visible source-removal duplicate-admission fence:
    `npm test -- test/rebalancer/coordinator-dedup-gap.test.js`
72. Result: passed, `43/43`.
73. Related create-admission validation:
    `npm test -- test/rebalancer/rebalance-coordinator-topology-guard.test.js`
74. Result: passed, `13/13`.
75. Bootstrap join projection diagnostic validation:
    `npm test -- test/bootstrap/bootstrap-api.test.js`
76. Result: passed, `125/125`.
77. Restart-readiness projection diagnostic validation:
    `npm test -- test/distributed/harness/__tests__/cluster.test-part-2.js`
78. Result: passed, `27/27`.
79. Rolling-restart bootstrap join projection diagnostic rerun:
    `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-bootstrap-join-projection-diagnostics.report.json --fast-local --verbose`
80. Result: failed at restart readiness, now with
    `bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`
    in the terminal error and failure bundle.
81. Seed-contact startup authority validation:
    `npm test -- test/bootstrap/bootstrap-api.test.js`
82. Result: passed, `125/125`.
83. Rolling-restart seed startup authority rerun:
    `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-seed-startup-authority.report.json --fast-local --verbose`
84. Result: failed later at `topology_unstable` / `convergence_timeout`;
    restart readiness closed, and the active blocker returned to operation
    transition pressure plus over-target trim.
85. Focused operation ownership and cleanup validation:
    `npm test -- test/rebalancer/replica-operation-repository.test.js test/rebalancer/rebalance-coordinator-operation-ownership.test.js test/rebalancer/move-planner-inflight-cleanup.test.js test/rebalancer/unified-rebalancer.test.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
86. Result: passed, `654/654`.
87. Rolling-restart system replace target owner rerun:
    `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-system-replace-target-owner.report.json --fast-local --verbose`
88. Result: failed with `topology_unstable` / `convergence_timeout`, but
    in-flight replica operations drained to `0`; `service_timers-p1`,
    `control_plane_publications-p1`, and `logs-p1` reached target voter count;
    `sql_transaction_participants-p1` remained over target with failed terminal
    `REPLACE` target rows.
89. Rolling-restart failed-target cleanup rerun:
    `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-failed-target-cleanup.report.json --fast-local --verbose`
90. Result: failed earlier at `restart_recovery` with
    `priority_spread_pending`; regenerated classifier evidence has no
    unresolved priority-recovery operation state and places the priority
    partitions under `spread_satisfied_in_flight`. This did not reach the
    post-active over-target convergence barrier.
91. Quiescence owner-state continuation:
    `node --test test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`
92. Result: passed, `6/6`.
93. Failure-bundle quiescence classification:
    `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
94. Result: passed, `48/48`.
95. Runner diagnostics propagation:
    `node --test test/distributed/harness/__tests__/run.test.js`
96. Result: passed, `68/68`.
97. Harness quiescence compatibility:
    `node --test test/distributed/harness/__tests__/cluster.test-part-6.js`
98. Result: passed, `22/22` skipped by the existing harness skip gate.
99. Static and guideline checks:
    `node --check test/distributed/harness/control-plane-quiescence-snapshot.js`,
    `node --check test/distributed/harness/cluster-segment-7-class-3.js`,
    `node --check test/distributed/run-runtime-helpers.js`,
    `node --check test/distributed/harness/failure-bundle-segment-4.js`,
    `node --check test/distributed/harness/failure-bundle-segment-5.js`,
    `node --check test/distributed/harness/failure-bundle-segment-6.js`,
    `node --check test/distributed/harness/__tests__/failure-bundle.test.js`,
    `npm run audit:guideline:literals`,
    `npm run audit:guideline:decision-boundaries`, and `git diff --check`.
100. Result: passed; literal audit reported `0` new violations and `6219`
     inherited baseline violations, and decision-boundary audit reported `0`
     violations.
101. Rolling-restart quiescence-owner rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
102. Result: failed, `0/1` passed after `389.5s`. The failure migrated earlier
     than quiescence to `waitForConvergence`: publication epoch `11` is
     `OPEN`, pending ACK count is `0`, blocked node count is `5`, the failure
     bundle dominant reason is `control_plane_publication_pending`, and
     post-rebalance closure remains open on operation drain, publication
     visibility, and no-over-target evidence.
103. Publication recovery machine focused validation:
     `node --test test/control-plane/publication-recovery-state-machine.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
104. Result: passed, `103/103`; active-gate pending-ACK and
     missing-published evidence now survives stale top-level summaries.
105. Membership publication and active-node projection validation:
     `node --test test/control-plane/active-node-projection.test.js test/control-plane/membership-publication-coordinator.test.js`
106. Result: passed, `255/255`.
107. Harness publication evidence validation:
     `node --test test/distributed/harness/__tests__/state-machine-pressure-preflight.test.js test/distributed/harness/__tests__/failure-bundle.test.js`
108. Result: passed, `62/62`.
109. Pre-revival rolling-restart publication recovery rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
110. Result: failed after the ACK contradiction moved. Publication was
     `PUBLISHED`, pending ACK was `0`, active diagnostics were `5/5`, and the
     remaining startup active-gate blocker was missing published membership for
     node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
111. Heartbeat-only node-state revival validation:
     `node --test test/control-plane/replica-dispatch-node-state-update.test.js`
112. Result: passed, `97/97`; READY heartbeat-only recovery now revives stale
     stopped durable node rows before membership publication repair.
113. Post-revival guardrails and the representative `rolling-restart` rerun:
     pending by request.
