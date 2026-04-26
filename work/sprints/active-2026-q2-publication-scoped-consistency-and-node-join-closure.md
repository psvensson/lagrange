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

1. [Priority spread recovery operation creation under load](../packages/active-20260426-priority-spread-recovery-operation-creation-under-load.md)

## Queued Packages

All final consistency recommendation packages are now complete or queued outside
the current execution path.

Other secondary matrix failures become active packages only after the
`rolling-restart` gate passes or migrates to a new named owner boundary.

Queued convergence-grammar packages:

1. [Rolling restart post-active convergence timeout](../packages/todo-20260424-rolling-restart-post-active-convergence-timeout.md)
2. [Admin observation owner cutover and repair fencing](../packages/todo-20260424-admin-observation-owner-cutover-and-repair-fencing.md)
3. [Critical pressure workload taxonomy audit](../packages/todo-20260424-critical-pressure-workload-taxonomy-audit.md)
4. [Critical replace operation lifecycle convergence owner](../packages/todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md)
5. [Rolling restart in-flight operation drain and CDC pressure](../packages/todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md)
6. [Rolling restart operation transition pressure and over-target trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

## Remaining Work Summary

1. Current execution blocker:
   The April 26 cleanup-budget rerun no longer has membership publication ACK
   debt or the earlier `sql_transactions-p1` over-target blocker. It fails
   during load readiness with publication epoch `4` `PUBLISHED`,
   `pendingAckCount=0`, `prioritySpreadPending=true`, and
   `sql_write_operations-p1` still classified as
   `eligible_but_no_operation_created`.
2. Next active investigation:
   close priority-spread recovery operation creation/progression under
   `query:update:replica_operations` delivery-source saturation. The current
   blocker has `needs_operation` on `sql_write_operations-p1`, while
   `sql_transactions-p1` is recovering in flight after reaching
   `currentCount=3,targetCount=3`.
3. Harness classification:
   terminal barrier evidence wins over stale playback reconstruction for
   active, restart-recovery, and convergence failures. The current
   representative failure is owner-visible priority recovery progress, not
   stale startup or a membership publication ACK artifact.
4. Final consistency:
   the final leader-map consistency package is complete for this sprint
   because the rerun moved to a freshly split non-final blocker.
5. Residual cleanup:
   fence or delete superseded local reconstruction and caller-local pressure
   exception paths through queued packages only after the current operation
   transition blocker closes or migrates.
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
    [Priority spread recovery operation creation under load](../packages/active-20260426-priority-spread-recovery-operation-creation-under-load.md)
    package.

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
   canonical owner-state contracts. Status: implemented for final consistency;
   the next `rolling-restart` rerun should now identify authority divergence,
   observer/cache lag, CDC lag, or the next runtime blocker from structured
   diagnostics.
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
