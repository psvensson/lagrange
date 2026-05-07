# Runtime Stability And Harness Determinism Closure Sprint (AGPL)

## Goal

Get the current harness instability to a stable and understandable state by
closing the runtime liveness seams exposed during the `node-join-under-load`
representative gate, then driving the first secondary gate,
`rolling-restart`, through one current owner boundary at a time.

## Compact Handoff

The current machine-readable blocker handoff is generated from the active
package metadata:

1. [current-blocker.md](./current-blocker.md)
2. [current-blocker.json](./current-blocker.json)

Regenerate it with `npm run work:current-blocker` after changing the active
representative package or its latest evidence.

The sprint target is:

1. keep the completed `node-join-under-load` gate as historical proof
2. use `rolling-restart` as the current representative re-entry gate
3. close the durable rejoin startup-authority blocker before broad matrix reruns
4. make failure bundles classify from owner contracts, not reconstructed
   publication/readiness fragments
5. re-enter the wider harness matrix only after the current representative path is
   stable

## Why This Sprint Exists

The publication-scoped work is still the dominant blocker, but the owner seam
has narrowed. Earlier artifacts showed:

1. publication gates reach ready or steady-published states
2. priority spread summaries no longer dominate the final blocker
3. readiness/planning same-epoch contradictions are closed
4. the remaining failures are runtime liveness and pressure failures

The latest May 6 representative rerun after the seed transport fairness repair
is
`test-output/reports/rolling-restart-after-seed-transport-fairness-20260506T155451Z.report.json`.
It failed after `131.4s`. The previous seed delivery-source saturation seam is
now closed by migration: the new failure bundle no longer selects transport
backpressure as the dominant blocker.

The latest May 7 representative rerun after the open selected-cohort repair is
`test-output/reports/rolling-restart-after-publication-membership-open-selected-cohort-20260507T002638Z.report.json`.
It failed after `126.9s`. The previous pending-ACK selected-membership seam is
now closed by migration: publication no longer remains `ACK_PENDING`, pending
ACK count is `0`, and the live blocker moved again.

The latest May 7 representative rerun after the exact-target observation
repair is
`test-output/reports/rolling-restart-after-exact-target-observation-20260507T013352Z.report.json`.
It failed after `131.2s`. The previous exact-target observation seam is now
closed by migration: the fresh artifact no longer terminates on
`replica_operations-p1` sibling fallback.

The latest May 7 representative rerun after the reservation-visibility repair
is
`test-output/reports/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z.report.json`.
It failed after `134.9s`. The previous reservation-visibility seam is now
closed by migration: the fresh artifact no longer terminates on defer-visible
orphan reservation release or workflow-progress / dispatch-pending actuation.

The latest May 7 representative rerun after the priority follow-up readiness
repair is
`test-output/reports/rolling-restart-after-priority-follow-up-readiness-20260507T021309Z.report.json`.
It failed after `133.8s`. The previous operation-scheduling seam is now
closed by migration: the fresh artifact no longer terminates on
`eligible_but_no_operation_created`, and `sql_write_operations-p1` advances to
`recovering_in_flight` behind operation
`f57d2c14-afae-4f6a-a626-897ff8934175`.

The latest May 7 representative rerun after the bootstrap admission precheck
repair is
`test-output/reports/rolling-restart-after-bootstrap-admission-precheck-pressure-20260507T023700Z.report.json`.
It failed after `132.6s`. The previous bootstrap admission precheck seam is
now closed by migration: the focused regression proves the bounded bootstrap
slot is claimed before MOVE_REPLICA reservation-refresh work, and the fresh
artifact no longer supports pre-admission stampede as the live owner.

The latest May 7 representative rerun after the bootstrap request
execution-timeout repair is
`test-output/reports/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z.report.json`.
It failed after `131.7s`. The previous admitted bootstrap request timeout seam
is now closed by migration: the focused regression proves one bounded request
budget flows through blocking-admission reads, reservation expiry, exclusion
filtering, and MOVE_REPLICA reservation persistence, and seed-side logs now
prepare canonical bootstrap responses during the rerun.

The latest May 7 representative rerun after the join-time recovery-routing
repair is
`test-output/reports/rolling-restart-after-join-select-recovery-routing-20260507T041947Z.report.json`.
It failed after `135.5s`. The previous distributed query-routing seam is now
closed by migration: the representative playback no longer depends on
falling back to steady-state `serveEligible` routing for join-time
authoritative reads.

The live representative blocker remains topology publication missing-active
reentry, but the semantic owner moved again. Publication convergence now
stalls much earlier at epoch `1` `PUBLISHED` with active `3/5`, snapshot
coverage `1/5`, published active `1/5`, and missing-published count `4`.
Fresh runtime evidence centers on `sql_transactions-p1` operation
`227d1172-3520-48bc-85d1-a7f2e9b54fe1`: the seed rejects target node
`11601...` as no longer being in the current eligible cohort while the same
partition's pre-execution handoff also marks the `11601...` remove leg
blocked on `node_ready_lease_incomplete`. Target-side playback shows the same
`REPLACE` already reached `SENDING` then `CREATING`, with repeated
`Replica creation already in progress` on `sql_transactions-p1-r4`.

The current unchecked package task is therefore a successor package on the
returned priority-recovery eligible-cohort / replace-safety boundary:
preserve the closed distributed recovery-routing regression, then repair the
selected coordinator/rebalancer admission or normalization seam so the live
runtime and canonical summaries agree on one explicit owner state.

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

The current active representative re-entry package is:

1. [Rolling Restart Topology Publication Missing-Active Priority Recovery Eligible-Cohort Replace-Safety Reentry](../packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md)

Retained predecessor context file:

1. [Rolling Restart Topology Publication Missing-Active Control-Plane Publication Workflow Progress Reentry](../packages/done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md)
2. [Rolling Restart Topology Publication Missing-Active Startup Bootstrap Request Execution Timeout Reentry](../packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md)
3. [Rolling Restart Topology Publication Missing-Active Startup Bootstrap Admission Precheck Pressure Reentry](../packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-admission-precheck-pressure-reentry.md)
4. [Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Reentry](../packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md)
5. [Rolling Restart Topology Publication Missing-Active Workflow Progress Reentry](../packages/done-20260507-rolling-restart-topology-publication-missing-active-workflow-progress-reentry.md)
6. [Rolling Restart Startup Steady-Published Selected Membership Deficit Readiness Timeout Reentry](../packages/done-20260506-rolling-restart-startup-steady-published-selected-membership-deficit-readiness-timeout-reentry.md)
7. [Rolling Restart Publication ACK-Pending Selected Membership Deficit Owner Reentry](../packages/done-20260506-rolling-restart-publication-ack-pending-selected-membership-deficit-owner-reentry.md)
8. [Rolling Restart Startup Active Gate Snapshot Coverage Selected-Snapshot Timeout Bootstrap Readiness Reentry](../packages/done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-selected-snapshot-timeout-bootstrap-readiness-reentry.md)
9. [Rolling Restart Published Snapshot Coverage Priority Spread Serial-Wait Workflow Progress Reentry](../packages/done-20260506-rolling-restart-published-snapshot-coverage-priority-spread-serial-wait-workflow-progress-reentry.md)
10. [Rolling Restart Startup Active Gate Publication Evidence Priority Recovery Consumer Alignment](../packages/done-20260506-rolling-restart-startup-active-gate-publication-evidence-priority-recovery-consumer-alignment.md)
11. [Rolling Restart Startup Active Gate Snapshot Coverage Priority Serial-Wait Workflow Progress Reentry](../packages/done-20260506-rolling-restart-startup-active-gate-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md)
12. [Rolling Restart Startup Active Gate Priority Operation Creation Snapshot Coverage Reentry](../packages/done-20260506-rolling-restart-startup-active-gate-priority-operation-creation-snapshot-coverage-reentry.md)
13. [Rolling Restart Published Snapshot Coverage Priority Serial-Wait Workflow Progress Reentry](../packages/done-20260506-rolling-restart-published-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md)
14. [Rolling Restart Publication ACK-Pending Rebalancer Handoff Admission Reentry](../packages/done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-admission-reentry.md)
15. [Rolling Restart Startup Seed Transport Delivery-Source Saturation Reentry](../packages/done-20260506-rolling-restart-startup-seed-transport-delivery-source-saturation-reentry.md)
16. [Rolling Restart Startup Publication ACK-Pending Owner-RPC Nodes Repair Reentry](../packages/done-20260506-rolling-restart-startup-publication-ack-pending-owner-rpc-nodes-repair-reentry.md)
17. [Rolling Restart Topology Publication Snapshot Reachability Reentry](../packages/done-20260505-rolling-restart-topology-publication-snapshot-reachability-reentry.md)
18. [Rolling Restart Operation Transition Pressure And Over-Target Trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

## Queued Packages

The operation-transition status-authority follow-up, the startup active-gate
presentation reentry, the startup rejoin seed-contact package, the active-gate
priority-recovery actuation package, the operation-workflow ACK reentry
package, and the startup snapshot reachability workflow-progress package
executed. The priority recovery workflow transition-deferred package then
closed by migration into operation workflow timeout reconciliation. The
topology publication/snapshot re-entry package then owned the May 5 to May 6
publication missing-active, selected-snapshot, owner-RPC repair, and
publication owner-read/remove-safety slices, and it closed with the
`20260506T123000Z` publication owner-read/remove-safety proof. A later
representative rerun then moved again: the fresh
`20260506T121614Z` artifact no longer supports the interim operation-progress
handoff, and the later `20260506T124254Z` rerun no longer supports the
startup-authority topology-settling seam either. The current representative
failure no longer sits in bootstrap join-time `MOVE_REPLICA`
assignment-token handling either. The later `20260506T131802Z` rerun moved
again: `35a...` reaches `ACTIVE`, `mg-1-r2` becomes leader on `ebc4...`, and
the representative failure now stalls after publication closure on priority
recovery operation scheduling. The new current representative package
therefore owns the `sql_write_operations-p1` `needs_operation` /
`create_recovery_operation` boundary, with
`sql_transaction_participants-p1` `coordination_mismatch` retained as
supporting evidence. The dormant operation-transition file retains only its
direct owner-regression gap and the older `052328Z` timeout residual as
adjacent context.
The follow-up `20260506T133734Z` rerun then moved again: priority recovery
follow-up moves now persist through the coordinator, the
`rebalancer_leader / operation_scheduling` blocker is closed, and the live
representative seam is now `operation_workflow_owner / workflow_progress`.
`sql_write_operations-p1` still reports `needs_operation`, but it now waits on
`priority_operation_serial_wait` behind serial-wait operation
`7cfa5968-b992-4f93-80c5-f7127a3e345c`, while `sql_transaction_participants-p1`
has moved forward into `spread_satisfied_in_flight` predecessor context.
The follow-up `20260506T140814Z` rerun moved again: the serial-wait
workflow-progress seam closed, all tracked priority partitions satisfied
closure, and the representative boundary returned to startup/publication
convergence. That seam is now closed as well: the focused authoritative
fallback repair moved the next representative rerun,
`20260506T150932Z`, through epoch `5` `PUBLISHED` with selected snapshot
coverage `4/5`. The live representative boundary is now startup seed
transport pressure on `7493...`, surfaced as joiner `8be8...`
`contacting_seed`, selected `nodes` repair participant failure on
`7493.../partition/nodes-p1-r3`, and repeated delivery-source saturation on
`target:11601.../partition/sql_transactions-p1-r4`. The follow-up
`20260506T155451Z` rerun then moved again after the transport fairness slice:
delivery-source saturation is no longer dominant, and the current
representative boundary is epoch `3` `ACK_PENDING` publication with pending
ACK node `11601...`, `sql_transactions-p1` waiting on workflow progress, and
`sql_write_operations-p1` back at operation scheduling.
The follow-up `20260506T200801Z` rerun then moved again after the
mixed-summary spread-satisfied sibling repair: canonical decision snapshots no
longer support `priority_operation_serial_wait`, `sql_transaction_participants-p1`
is `spread_satisfied_in_flight`, `sql_transactions-p1` is back to its own
pending `recovering_in_flight` operation, and `sql_write_operations-p1`
returns to `eligible_but_no_operation_created`. The live representative seam
is now consumer alignment: `publicationConvergence.activeGate.progress` still
retains stale `priority_operation_serial_wait` under startup snapshot
coverage `3/5` on selected snapshot `8be8...`.
The follow-up `20260506T215236Z` rerun then moved again after the retained
carrier release slice: the stale serial-wait seam is closed, `sql_transactions-p1`
is `spread_satisfied_in_flight`, and the live representative boundary is now
epoch `5` `ACK_PENDING` publication with `sql_transaction_participants-p1`
terminal `rebalancer_handoff`, `replica_operations-p1`
`operation_created_but_no_step_transitions`, and `sql_write_operations-p1`
still `recovering_in_flight`.
The follow-up `20260506T230547Z` rerun then moved again after the direct
source-versus-carrier owner repair: supporting serial-wait carriers no longer
outrank their direct source blockers, terminal published priority-spread
workflow debt is closed, and the live representative boundary is now startup
selected-snapshot timeout on `11601...` plus three `fresh_join`
bootstrap-incomplete nodes (`35a...`, `8be8...`, `ebc4...`).
The follow-up `20260506T232850Z` rerun then moved again after the startup
guidance slice: the failure bundle no longer terminates on selected-snapshot
timeout guidance, but epoch `5` remains `ACK_PENDING` with pending ACK node
`35a...`, selected snapshot `ebc4...`, and a new selected-membership deficit
inconsistency where summary error text still records `missingPublished=2`
while normalized publication convergence falls back to
`missingPublishedCount=0`.
The follow-up `20260507T002638Z` rerun then moved again after the open
selected-cohort repair: the pending-ACK seam is closed, publication reaches
epoch `3` `PUBLISHED` / `steady_published`, and the live blocker is now a
startup disagreement where current active-gate progress and
`priorityRecoveryObservation` still carry four selected missing-published
nodes while top-level `publicationConvergence` and `lastMeaningfulProgress`
collapse parts of that deficit back to `0` under readiness-timeout fallback.
The follow-up `20260507T005730Z` rerun then moved again after the
steady-published timeout-alignment slice: top-level publication convergence
now preserves `missingPublishedCount=3` with explicit
`publication_missing_active_node=<node>` reasons, timeout progress keeps the
same three-node deficit, and the live representative boundary is now topology
publication missing-active node with supporting
`operation_workflow_owner / workflow_progress / event_driven` evidence on
`replica_operations-p1`, including repeated `replace_remove_safety_blocked`
deferrals.
The follow-up `20260507T021000Z` rerun then moved again after the
reservation-visibility slice: target-node orphan reservation release is no
longer the selected seam, and the live representative boundary is now
`rebalancer_leader / operation_scheduling`. Three priority partitions return
to actionable `needs_operation` / `eligible_but_no_operation_created`, while
rebalancer logs on `7493...` show one planned add-like move per partition
being dropped at pre-execution on target `11601...` with readiness skip detail
`repair_ineligible`. The new active package therefore owns priority follow-up
target-readiness defer normalization.
The follow-up `20260507T021309Z` rerun then moved again after the priority
follow-up readiness slice: planner-created current-entity follow-up moves now
persist through pre-execution and `sql_write_operations-p1` advances to
`recovering_in_flight`, so the rebalancer operation-scheduling seam is closed.
The live representative boundary is now startup/bootstrap admission precheck
pressure: `8be8...` and `ebc4...` remain in `contacting_seed` / bootstrap
`INIT` after the seed already reached `seed_join_ready`, and seed-side logs
show control-plane query pressure during concurrent bootstrap requests before
the bounded admission slot appears to take effect.

All final consistency recommendation packages are complete or queued outside
the current execution path.

Other secondary matrix failures become active packages only after the
`rolling-restart` gate passes or migrates to a new named owner boundary.

Current re-entry package:

1. [Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Reentry](../packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md)

Queued convergence-grammar packages:

1. [Rolling restart post-active convergence timeout](../packages/todo-20260424-rolling-restart-post-active-convergence-timeout.md)
2. [Admin observation owner cutover and repair fencing](../packages/todo-20260424-admin-observation-owner-cutover-and-repair-fencing.md)
3. [Critical pressure workload taxonomy audit](../packages/todo-20260424-critical-pressure-workload-taxonomy-audit.md)
4. [Critical replace operation lifecycle convergence owner](../packages/todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md)
5. [Rolling restart in-flight operation drain and CDC pressure](../packages/todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md)

Queued cleanup packages:

1. [Structural bookkeeping semantic source names](../packages/todo-20260429-structural-bookkeeping-semantic-source-names.md)

## Remaining Work Summary

1. Current execution blocker:
   The latest May 7 representative rerun after the exact-target observation
   repair used
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-exact-target-observation-20260507T013352Z.report.json --fast-local --verbose`.
   Report:
   `test-output/reports/rolling-restart-after-exact-target-observation-20260507T013352Z.report.json`.
   Result: failed after `131.2s`; terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
   The current report classifies as root cause class `topology`, failure class
   `publication_convergence_blocked`, dominant reason
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`,
   and supporting signals for
   `priorityRecoveryPartition=sql_write_operations-p1`,
   `priorityRecoveryOwner=operation_workflow_owner`,
   `priorityRecoveryBoundary=workflow_progress`, and
   `priorityRecoveryNextAction=wait_for_operation_progress`. Top-level
   publication convergence reaches epoch `5` `ACK_PENDING` with pending ACK
   count `1`, blocked-node count `0`, and `missingPublishedCount=2` on nodes
   `8be8...|ebc4...`. Current active-gate progress on selected snapshot
   `35a...` reports `selectedPublishedActiveCount=3`, the same selected
   missing-published set, and `missingPublishedCount=2`. The failure bundle
   also records `sql_write_operations-p1` as `recovering_in_flight` under
   `operation_workflow_owner / workflow_progress`, with correlation key
   `sql_write_operations-p1|5|21206e66-4f05-46cf-b439-714de9440cf3`,
   `dispatch_pending` / `persisted_not_dispatched` evidence, and target-node
   log lines that release reservation
   `res-21206e66-4f05-46cf-b439-714de9440cf3` as orphaned during
   reconciliation.
2. Completed trace, fixture, and next active task:
   the
   [Rolling Restart Topology Publication Snapshot Reachability Reentry](../packages/done-20260505-rolling-restart-topology-publication-snapshot-reachability-reentry.md)
   package and its May 6 successor slices have now completed the
   selected-snapshot repair probe, publication owner-RPC repair, stale
   `MOVE_REPLICA` reservation refresh, multiple priority-recovery owner
   reclassifications, transport fairness, mixed-summary witness cleanup,
   retained-carrier release, and the direct source-versus-carrier owner
   repair. Each slice ended in a replayable representative rerun and moved the
   live blocker forward. The latest closed slice proves the exact-target
   observation seam is no longer the terminal owner. The current unchecked
   task is therefore the next slice inside the same active topology
   publication-missing-active package: preserve that focused regression, then
   repair the `sql_write_operations-p1` reservation-visibility or deferred
   owner-read seam that can stall a coordinator-created critical `REPLACE`
   inside `operation_workflow_owner / workflow_progress`.
3. Harness classification:
   terminal barrier evidence continues to win over stale playback
   reconstruction for active, restart-recovery, load-readiness, convergence,
   and quiescence failures. The latest harness slice now also preserves open
   selected publication-membership deficit through top-level publication
   convergence and timeout progress, so the current package can decide whether
   the remaining blocker is direct topology publication debt or a stronger
   workflow-progress actuation seam. Earlier publication ACK, transport,
   publication owner-read/remove-safety, and startup-fallback normalization
   fixes remain historical proof only.
4. Final consistency:
   the final leader-map consistency package is complete for this sprint
   because the rerun moved to a freshly split non-final blocker.
5. Residual cleanup:
   fence or delete superseded local reconstruction and caller-local pressure
   exception paths through queued packages only after the current
   topology publication missing-active blocker closes or migrates; keep the
   previous `052328Z` `sql_write_operations-p1`
   operation-workflow timeout as a prior residual, not the current blocker.
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
30. [Publication recovery machine spec and preflight verification](../packages/done-20260426-publication-recovery-machine-spec-and-preflight-verification.md)
31. [Restart recovery control-plane pressure and admin reachability](../packages/done-20260426-restart-recovery-control-plane-pressure-and-admin-reachability.md)
32. [Rolling restart priority follow-up under transport pressure](../packages/done-20260427-rolling-restart-priority-follow-up-under-transport-pressure.md)
33. [Rolling restart startup readiness snapshot gating](../packages/done-20260427-rolling-restart-startup-readiness-snapshot-gating.md)
34. [Rolling restart load readiness stable window after CDC closure](../packages/done-20260430-rolling-restart-load-readiness-stable-window-after-cdc-closure.md)
35. [Rolling restart control plane quiescence critical spread after load readiness closure](../packages/done-20260430-rolling-restart-control-plane-quiescence-critical-spread-after-load-readiness-closure.md)
36. [Rolling restart load readiness no progress fast fail and publication gate closure](../packages/done-20260430-rolling-restart-load-readiness-no-progress-fast-fail-and-publication-gate-closure.md)
37. [Rolling restart pre load priority recovery operation creation under load readiness](../packages/done-20260430-rolling-restart-pre-load-priority-recovery-operation-creation-under-load-readiness.md)
38. [Rolling restart startup publication epoch pending operation stalled](../packages/done-20260430-rolling-restart-startup-publication-epoch-pending-operation-stalled.md)
39. [Rolling restart quiescence stale in flight canonical blocker](../packages/done-20260430-rolling-restart-quiescence-stale-inflight-canonical-blocker.md)
40. [Rolling restart restart recovery admin reachability regression](../packages/done-20260430-rolling-restart-restart-recovery-admin-reachability-regression.md)
41. [Rolling restart active publication missing node convergence](../packages/done-20260430-rolling-restart-active-publication-missing-node-convergence.md)
42. [Priority recovery actuation contract under load](../packages/done-20260430-priority-recovery-actuation-contract-under-load.md)
43. [Rolling restart publication ACK snapshot reachability regression](../packages/done-20260430-rolling-restart-publication-ack-snapshot-reachability-regression.md)
44. [Rolling restart restart recovery control snapshot authority](../packages/done-20260504-rolling-restart-restart-recovery-control-snapshot-authority.md)
45. [Rolling Restart Startup Publication Membership Priority Recovery Coordination](../packages/done-20260504-rolling-restart-startup-publication-membership-priority-recovery-coordination.md)
46. [Rolling Restart Readiness Gate Priority Operation Creation Reentry](../packages/done-20260504-rolling-restart-readiness-gate-priority-operation-creation-reentry.md)
47. [Rolling Restart Startup Snapshot Coverage And Serial Priority Progress](../packages/done-20260504-rolling-restart-startup-snapshot-coverage-serial-priority-progress.md)
48. [Rolling Restart Startup Rejoin Seed Contact Snapshot Coverage](../packages/done-20260504-rolling-restart-startup-rejoin-seed-contact-snapshot-coverage.md)
49. [Rolling Restart Priority Recovery Actuation Active Gate Reentry](../packages/done-20260504-rolling-restart-priority-recovery-actuation-active-gate-reentry.md)
50. [Rolling Restart Operation Workflow Publication ACK Reentry](../packages/done-20260504-rolling-restart-operation-workflow-publication-ack-reentry.md)
51. [Rolling Restart Startup Snapshot Reachability Operation Workflow Progress Reentry](../packages/done-20260504-rolling-restart-startup-snapshot-reachability-operation-workflow-progress-reentry.md)
52. [Rolling Restart Priority Recovery Workflow Transition Deferred Reentry](../packages/done-20260504-rolling-restart-priority-recovery-workflow-transition-deferred-reentry.md)

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
    [Control plane quiescence owner snapshot](../packages/done-20260426-control-plane-quiescence-owner-snapshot.md).
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
    [Publication recovery machine spec and preflight verification](../packages/done-20260426-publication-recovery-machine-spec-and-preflight-verification.md).
47. The publication recovery evidence fix moved the latest
    `test-output/report.json` rerun again. Publication is `PUBLISHED`,
    `pendingAck=0`, priority recovery is `none`, and active diagnostics report
    `5/5`, but published active membership is `4/5` with missing node
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`. The root cause is stale durable
    node-state status: direct node diagnostics are active/admin-ready, while
    the control-plane node row still says `stopped` despite READY/fresh
    heartbeat evidence. The current code slice revives stale stopped rows on
    READY heartbeat-only recovery updates.
48. The post-revival continuation closed the stale terminal-cache ACK owner gap:
    terminal cached publication rows now force an authoritative refresh before
    node ACK handling, so a newer `ACK_PENDING` publication cannot be hidden by
    a stale `PUBLISHED` cache row. Focused tests and static guardrails pass. The
    representative `rolling-restart --fast-local` rerun failed after `269.1s`
    with publication recovery closed: publication epoch `4` is `PUBLISHED`,
    `pendingAck=0`, missing published membership is `0`, and priority recovery
    blocked count is `0`. The new active blocker is restarted-node recovery
    readiness for node `11601fe0-72d6-5853-8590-ec2881853e72`, with bootstrap
    health reachable, admin API refused, `control_snapshot_authority_unavailable`,
    and pressure on `control_plane_publications`. The active package is
    [Restart recovery control-plane pressure and admin reachability](../packages/done-20260426-restart-recovery-control-plane-pressure-and-admin-reachability.md).
49. The restart-recovery pressure repair made publication mutation work
    critical and deferrable through the shared workload profile and propagated
    workload resource keys through routed SQL writes. The representative rerun
    then closed restart recovery and migrated back to post-active convergence:
    failover, convergence, restart recovery, and publication were closed, but
    four replica operations remained in flight and post-rebalance closure stayed
    open on operation drain, membership trim, and no-over-target evidence. The
    active package is again
    [Rolling restart operation transition pressure and over-target trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
50. The April 30 fast-fail continuation changed the failure shape from an outer
    load-readiness timeout to owner-state no-progress. The representative run
    `test-output/reports/runtime-stability-rolling-restart-20260430-codex-fast-fail-load-readiness.report.json`
    now fails after `110.8s` with active gate state `stalled`,
    `stalled_no_progress`, publication status `ACK_PENDING`, pending ACK count
    `2`, priority spread gap `8`, and priority recovery
    `eligible_but_no_operation_created` on
    `sql_transaction_participants-p1` and `sql_transactions-p1`.
51. The pre-load operation-creation continuation then moved the path to
    startup publication epoch convergence:
    `test-output/reports/runtime-stability-rolling-restart-20260430-codex-priority-authoritative-service-evidence.report.json`
    failed after `130.0s` with active nodes `5/5`, publication `PUBLISHED`,
    pending ACK count `0`, selected snapshot coverage `3/5`, and a
    cache-visible young pending recovery operation for
    `sql_write_operations-p1`.
52. The pending-operation stalled package closed the false stalled
    interpretation for young workflow-owned work. The next representative run
    `test-output/reports/runtime-stability-rolling-restart-20260430-codex-pending-owner-state.report.json`
    fails after `131.3s` with no `operation_stalled` partitions. The remaining
    evidence is publication epoch `4` `ACK_PENDING`, pending ACK count `1`,
    empty pending ACK node ids, selected snapshot coverage `4/5`, selected
    snapshot reachability timeout on
    `7493b0ab-a054-5fad-a91b-5e331db29304`, and
    `eligible_but_no_operation_created` for `sql_write_operations-p1`.
53. The startup publication epoch operation-creation package moved the path
    past the prior publication blocker. The representative run
    `test-output/reports/runtime-stability-rolling-restart-20260430-codex-operation-snapshot-reachability.report.json`
    fails after `507.0s`, but publication epoch `7` is `PUBLISHED`, pending ACK
    count is `0`, priority spread is satisfied, blocked and unresolved priority
    partition counts are `0`, and `needs_operation` is empty.
54. The active package is now
    [Rolling Restart Quiescence Stale In Flight Canonical Blocker](../packages/done-20260430-rolling-restart-quiescence-stale-inflight-canonical-blocker.md).
55. The May 4 operation-transition package re-entry and owner fixtures moved
    the representative path through transition-deferred timeout evidence and
    then exposed serial-wait metadata gaps. Those slices are recorded in
    [Rolling Restart Operation Transition Pressure And Over-Target Trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
56. The canonical May 5 rerun after serial-wait metadata preservation is
    `test-output/reports/rolling-restart-serial-wait-evidence-rerun-20260505T042441Z.report.json`.
    It failed after `189.4s` at startup ACTIVE convergence with active `3/5`,
    selected snapshot coverage `2/5`, publication epoch `3` `ACK_PENDING`,
    pending ACK node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, priority spread
    gap `9`, and no progress for six coordinator cycles.
57. Priority recovery residuals in that May 5 bundle are
    `replica_operations-p1` as terminal `FAILED` /
    `blocked_unclassified` requiring `schedule_followup_rebalance`, and
    `sql_write_operations-p1` as `needs_operation /
    priority_operation_serial_wait` waiting behind serial-lane operation
    `1ba3f99e-e1e6-4c15-b09d-d65364b60e22` on
    `sql_transaction_participants-p1`.
58. The representative path has since split to
    [Rolling Restart Topology Publication Snapshot Reachability Reentry](../packages/done-20260505-rolling-restart-topology-publication-snapshot-reachability-reentry.md)
    for topology publication/snapshot-reachability and serial-wait ownership.
    [Rolling Restart Operation Transition Pressure And Over-Target Trim](../packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)
    remains active as the retained post-publication operation-workflow timeout
    residual plus its documented package-local guardrail and adjacent sweep
    debt, and does not own the current representative topology blocker.
59. May 5 terminal publication evidence review fix:
    `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep "timeout publication summary uses terminal progress evidence"`
    passed, `node --test test/distributed/harness/__tests__/cluster.test-part-6.js`
    passed with the existing file-level skip behavior, and file-scoped
    decision-boundary and runtime-grammar guardrails reported `0` violations
    across the two touched JS files. The exact touched-file literal guard
    remains red with `319` existing whole-file fixture violations and `0`
    inherited baseline violations, while diff-aware added-line filtering
    reports `0` literal violations.
60. May 5 terminal priority-recovery witness review fix:
    `node --check test/distributed/harness/cluster-segment-7.js`;
    `node --check test/distributed/harness/__tests__/cluster.test-part-6.js`;
    `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep "operation-stalled terminal progress"`;
    `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js`;
    `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/cluster-segment-7.js test/distributed/harness/__tests__/cluster.test-part-6.js`;
    `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/cluster-segment-7.js test/distributed/harness/__tests__/cluster.test-part-6.js`;
    `git diff --check`
    passed. The exact touched-file literal guard remains red with `319`
    existing whole-file fixture violations and `0` inherited baseline
    violations; diff-aware added-line filtering reports `0` literal
    violations. The fix prevents a lower-coverage terminal
    `needs_operation` / `eligible_but_no_operation_created` reconstruction
    from replacing the earlier same-partition `operation_stalled` /
    `operation_created_but_no_step_transitions` witness.
61. Post-`c17c23a9` May 5 representative rerun:
    `test-output/reports/rolling-restart-after-terminal-witness-rerun-20260505T060935Z.report.json`
    failed after `130.5s`; companion log:
    `test-output/reports/rolling-restart-after-terminal-witness-rerun-20260505T060935Z.log`;
    failure bundle:
    `test-output/reports/.playback/rolling-restart-after-terminal-witness-rerun-20260505T060935Z/rolling-restart/failure-bundle.json`;
    triage summary:
    `test-output/reports/.playback/rolling-restart-after-terminal-witness-rerun-20260505T060935Z/rolling-restart/triage-summary.md`.
    The failure migrated back to startup/publication convergence: active `3/5`,
    selected snapshot coverage `2/5`, publication epoch `3` `ACK_PENDING`,
    pending ACK count `1`, selected missing published count `2`, priority
    spread gap `6`, and `sql_transactions-p1` recovering in flight with
    operation `e588045c-356c-473a-b553-752423aebc07` at
    `operation_workflow_owner / workflow_progress / event_driven`.
62. Documentation-only evidence ledger update touched no JS files. Required
    whitespace verification `git diff --check` passed.
63. May 5 failure-bundle missing-published coverage-lag fix:
    `node --check test/distributed/harness/failure-bundle-segment-4.js`;
    `node --check test/distributed/harness/__tests__/failure-bundle.test.js`;
    `node --test --test-name-pattern "keeps canonical missing published debt during active-gate coverage lag" test/distributed/harness/__tests__/failure-bundle.test.js`;
    `node --test --test-name-pattern "lets current selected active-gate coverage clear stale missing publication nodes|keeps canonical missing published debt during active-gate coverage lag|keeps startup active-gate snapshot coverage from restoring stale publication debt" test/distributed/harness/__tests__/failure-bundle.test.js`;
    `node scripts/check-guideline-decision-boundaries.js --include-tests test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle.test.js`;
    `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle.test.js`;
    `git diff --check`
    passed. The exact touched-file literal guard remains red:
    `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle.test.js`
    reports `1242` new literal-guideline violations, all in
    `failure-bundle.test.js`, and `0` inherited baseline violations;
    diff-aware added-line filtering reports `0` literal violations. The fix
    keeps canonical publication-gate missing-published debt visible during
    active-gate snapshot coverage lag while preserving stale selected
    active-gate debt and stale closure replay suppression. No representative
    scenario rerun was run for this harness-only slice.
64. May 5 diagnostic-contract regression correction and representative rerun:
    `node --check test/distributed/harness/__tests__/failure-bundle.test.js`,
    the focused missing-active publication regression, the adjacent
    reachability and workflow regressions, file-scoped literal,
    decision-boundary, and boundary-mode-contract guardrails, `git diff --check`,
    and `git diff --cached --check` passed. The representative rerun
    `test-output/reports/rolling-restart-topology-publication-snapshot-reachability-reentry-after-diagnostic-contract-20260505T093109Z.report.json`
    failed after `130.1s` with failure class
    `publication_convergence_blocked`, dominant reason
    `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`,
    publication epoch `3` `PUBLISHED`, pending ACK count `0`, missing
    published count `2`, selected snapshot coverage `4/5`, terminal active
    `2/5`, best active `5/5`, and priority spread gap `10`. The selected
    snapshot reachability timeout from `074739Z` is no longer terminal; the
    residual is publication missing-active membership/snapshot coverage with
    subordinate `sql_write_operations-p1` serial wait at
    `operation_workflow_owner / workflow_progress / event_driven`.
65. May 5 after-reconcile-probe representative rerun:
    `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-reconcile-probe-20260505T102455Z.report.json --fast-local --verbose`
    failed after `133.0s` with failure class
    `publication_convergence_blocked`, dominant reason
    `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
    publication epoch `2` `PUBLISHED`, pending ACK count `0`, missing published
    count `3`, terminal active `5/5`, terminal selected snapshot coverage
    `3/5`, best selected snapshot coverage `4/5`, selected published active
    `2/5`, and priority spread gap `5`. The blocker did not close or migrate:
    it remains on membership-publication owner-row, transport, and service
    evidence, with subordinate `sql_transaction_participants-p1` serial wait at
    `operation_workflow_owner / workflow_progress / event_driven`.

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
113. Terminal stale-cache ACK refresh validation:
     `node --test test/control-plane/membership-publication-coordinator.test.js`
114. Result: passed, `208/208`; a stale terminal cached publication now forces
     authoritative refresh before node ACK handling.
115. Post-revival focused publication and restart-readiness validations:
     `node --test test/control-plane/publication-recovery-state-machine.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
116. Result: passed, `103/103`.
117. Post-revival active-node and membership-coordinator validations:
     `node --test test/control-plane/active-node-projection.test.js test/control-plane/membership-publication-coordinator.test.js`
118. Result: passed, `261/261`.
119. Post-revival replica dispatch validation:
     `node --test test/control-plane/replica-dispatch-node-state-update.test.js`
120. Result: passed, `97/97`.
121. Post-revival harness validations:
     `node --test test/distributed/harness/__tests__/state-machine-pressure-preflight.test.js test/distributed/harness/__tests__/failure-bundle.test.js`
122. Result: passed, `62/62`.
123. Post-revival static guardrails:
     `npm run audit:state-machine-pressure`;
     `npm run audit:runtime-grammar`;
     `npm run audit:guideline:decision-boundaries`;
     `npm run audit:guideline:literals`
124. Result: passed. Runtime grammar and decision-boundary audits reported
     `0` violations; literal guardrail reported `0` new violations against the
     inherited baseline.
125. Post-revival representative `rolling-restart` rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
126. Result: failed after `269.1s`, but the publication recovery blocker closed.
     Publication epoch `4` was `PUBLISHED`, pending ACK count was `0`, missing
     published membership was `0`, and the failure migrated to
     `restart_recovery_timeout` for node
     `11601fe0-72d6-5853-8590-ec2881853e72`.
127. Quiescence candidate classification validation:
     `node --test test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js test/distributed/harness/__tests__/failure-bundle.test.js`
128. Result: passed, `60/60`; a terminal `quiescence_candidate` timeout now
     classifies as topology stability evidence instead of `unknown`.
129. Quiescence timeout diagnostics validation:
     `node --test test/distributed/harness/__tests__/cluster.test-part-6.js`
130. Result: passed under the existing harness skip gate, `24/24` skipped; the
     timeout diagnostic object now carries effective and stale operation counts.
131. Quiescence classification static guardrails:
     `npm run audit:guideline:literals`;
     `npm run audit:guideline:decision-boundaries`;
     `npm run audit:runtime-grammar`;
     `npm run test:metadata-gateway:audit`;
     `git diff --check`
132. Result: passed. Literal, decision-boundary, runtime-grammar, and
     state-machine pressure checks reported `0` violations/issues.
133. Post-quiescence-classification representative rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
134. Result: failed, `0/1` passed after `273.6s`. The run did not reach
     quiescence; it migrated back to restart-recovery readiness for node
     `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, with `adminReady=false`,
     `controlPlaneRecoveryReady=false`, readiness phase `INIT`, and
     `bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`.
135. Restart-recovery stale priority-spread classifier validation:
     `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
136. Result: passed, `53/53`; stale `priority_spread_pending` protocol state
     no longer overrides closed priority-recovery blocker evidence on
     restart-recovery timeouts.
137. Failure-bundle regeneration for the post-repair `test-output/report.json`
138. Result: `failureClass=startup_recovery_blocked`,
     `rootCauseClass=startup`, dominant reason `restart_recovery_timeout`, and
     signal `startupMode=durable_rejoin`.
139. Load-readiness stable-window owner validation:
     `node --check test/distributed/harness/cluster-segment-7.js`;
     `node --check test/distributed/harness/__tests__/cluster.test-part-6.js`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-4.js`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/post-rebalance-closure-contract.test.js`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/assertions.test.js`.
140. Result: passed. The harness now closes load-readiness stable-window from
     canonical selected-snapshot capture time when that snapshot already
     satisfies the configured window.
141. Load-readiness static guardrails:
     `npm run audit:guideline:literals`;
     `npm run audit:guideline:decision-boundaries`;
     `npm run audit:runtime-grammar`;
     `git diff --check`.
142. Result: passed. Literal, decision-boundary, runtime-grammar, and diff
     whitespace checks reported no issues.
143. Post-load-readiness representative `rolling-restart` rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-load-readiness-stable-window.report.json --verbose`
144. Result: failed, `0/1` passed after `411.7s`, but the
     load-readiness stable-window blocker closed. The run recorded
     `scenario.load-readiness.stable` with `state=closed`, `reason=ready`,
     `source=selected_snapshot`, and `stableElapsedMs=5866`.
145. The active representative blocker migrated to
     `critical_system_spread_open` under control-plane quiescence:
     root cause class `topology`, quiescence state `critical_spread_open`,
     `inFlightCount=3`, `effectiveInFlightCount=0`,
     `staleInFlightCount=2`, and critical-system distribution `0/3` for the
     critical system tables due to snapshot-lane admin timeouts.
146. The migrated quiescence boundary was captured as
     [Rolling Restart Control Plane Quiescence Critical Spread After Load Readiness Closure](../packages/done-20260430-rolling-restart-control-plane-quiescence-critical-spread-after-load-readiness-closure.md).
147. Quiescence critical-spread owner validation:
     `node --check test/distributed/harness/control-plane-quiescence-snapshot.js`;
     `node --check test/distributed/harness/cluster-segment-7-class-5.js`;
     `node --check test/distributed/harness/cluster-segment-7-class-3.js`;
     `node --check test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`;
     `node --check test/distributed/harness/__tests__/cluster.test-part-6.js`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js`.
148. Result: passed. The quiescence snapshot now separates true critical spread
     debt from snapshot-lane critical-system observation gaps; the focused TAP
     suites passed `12/12` and `30/30`.
149. Quiescence critical-spread static guardrails:
     `npm run audit:guideline:literals`;
     `npm run audit:guideline:decision-boundaries`;
     `npm run audit:runtime-grammar`;
     `git diff --check`.
150. Result: passed. Literal, decision-boundary, runtime-grammar, and diff
     whitespace checks reported no issues.
151. Post-quiescence representative `rolling-restart` rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-quiescence-critical-spread.report.json --verbose`
152. Result: failed, `0/1` passed after `469.1s`, but the
     `critical_system_spread_open` blocker closed. Terminal priority spread
     evidence reports `prioritySpreadSatisfied=true`, `prioritySpreadGap=0`,
     `priorityBlockedPartitionCount=0`, and no unresolved priority-recovery
     classes.
153. The active representative blocker migrated to post-restart load readiness:
     dominant reason `publication_epoch_pending`, publication epoch `29`,
     publication status `PUBLISHED`, pending ACK count `0`, missing published
     node `7493b0ab-a054-5fad-a91b-5e331db29304`, active gate mode `load`,
     elapsed `121604ms`, stable window `15000ms`, and snapshot reachability
     timeout on selected snapshot node
     `11601fe0-72d6-5853-8590-ec2881853e72`.
154. The migrated post-restart load-readiness publication gate activated
     [Rolling Restart Load Readiness No Progress Fast Fail And Publication Gate Closure](../packages/done-20260430-rolling-restart-load-readiness-no-progress-fast-fail-and-publication-gate-closure.md).
155. Load-readiness no-progress fast-fail reproduction:
     `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep "waitForLoadReadinessStability fails fast"`
156. Result before the fix: failed through the outer
     `Cluster load readiness did not stabilize within 6000ms` timeout, proving
     that unchanged owner-state evidence was not failing through the
     no-progress budget.
157. Load-readiness no-progress fast-fail and stable-window regression validation:
     `node --check test/distributed/harness/cluster-segment-7.js`;
     `node --check test/distributed/scenarios/rolling-restart.js`;
     `node --check test/distributed/harness/__tests__/cluster.test-part-6.js`;
     `node --check test/distributed/harness/__tests__/rolling-restart-scenario.test.js`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep "backdate complete snapshot|waitForLoadReadinessStability fails fast"`;
     `node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js`.
158. Result: passed. The focused TAP grep covered both the no-progress
     fast-fail behavior and the stable-window backdating regression, the full
     cluster harness suite passed `32/32`, and the rolling restart scenario
     unit coverage passed `5/5`.
159. Load-readiness no-progress static guardrails:
     `npm run audit:guideline:literals`;
     `npm run audit:guideline:decision-boundaries`;
     `npm run audit:runtime-grammar`;
     `git diff --check`.
160. Result: passed. Literal, decision-boundary, runtime-grammar, and diff
     whitespace checks reported no issues.
161. Fast-fail representative `rolling-restart` rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-fast-fail-load-readiness.report.json --verbose`
162. Result: failed, `0/1` passed after `110.8s`. The run now stops in the
     pre-load readiness gate on `stalled_no_progress` after `8` no-progress
     attempts instead of waiting for the outer load-readiness timeout. The
     terminal evidence names `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`,
     publication status `ACK_PENDING`, pending ACK count `2`, priority spread
     gap `8`, and `eligible_but_no_operation_created` for
     `sql_transaction_participants-p1` and `sql_transactions-p1`.
163. The load-readiness fast-fail package is closed as
     [Rolling Restart Load Readiness No Progress Fast Fail And Publication Gate Closure](../packages/done-20260430-rolling-restart-load-readiness-no-progress-fast-fail-and-publication-gate-closure.md).
164. The migrated pre-load priority recovery operation-creation boundary is
     closed as
     [Rolling Restart Pre Load Priority Recovery Operation Creation Under Load Readiness](../packages/done-20260430-rolling-restart-pre-load-priority-recovery-operation-creation-under-load-readiness.md).
165. Priority recovery operation-creation validation:
     `node --check src/rebalancer/operation-workflow-owner-segment-5.js`;
     `node --check test/rebalancer/rebalance-coordinator-operation-ownership-tail-test-cases.js`;
     `./node_modules/.bin/tap test/rebalancer/rebalance-coordinator-operation-ownership.test.js --grep "planning-owned priority spread completion"`;
     `./node_modules/.bin/tap test/rebalancer/rebalance-coordinator-operation-ownership.test.js`;
     `node --check src/rebalancer/unified-rebalancer-segment-4.js`;
     `node --check test/rebalancer/unified-rebalancer.test.js`;
     `./node_modules/.bin/tap test/rebalancer/unified-rebalancer.test.js --grep "closure-witness needs_operation"`;
     `./node_modules/.bin/tap test/rebalancer/unified-rebalancer.test.js`.
166. Result: passed. Raw operation rows now preserve priority partition
     identity across repository boundaries, and closure-witness operation
     creation advances an unblocked `needs_operation` candidate when the
     current owner partition is topology-blocked.
167. Authoritative service evidence validation:
     `node --check src/control-plane/membership-publication-coordinator.js`;
     `node --check test/control-plane/membership-publication-coordinator-tail-final-test-cases.js`;
     `./node_modules/.bin/tap test/control-plane/membership-publication-coordinator.test.js --grep "owner-rpc service evidence"`;
     `./node_modules/.bin/tap test/control-plane/membership-publication-coordinator.test.js`;
     `./node_modules/.bin/tap test/rebalancer/unified-rebalancer.test.js --grep "closure-witness|owner-rpc service evidence|priority recovery active service visibility|terminal operation visibility|service cache visibility"`.
168. Result: passed. Published priority spread gaps now read service evidence
     with `OWNER_RPC_PREFERRED`, so stale cache rows no longer hide active
     authoritative priority service placement.
169. Post-operation-creation representative `rolling-restart` rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-priority-authoritative-service-evidence.report.json --verbose`
170. Result: failed, `0/1` passed after `130.0s`, but the
     `eligible_but_no_operation_created` blocker is closed. Publication is
     `PUBLISHED`, pending ACK count is `0`, active nodes are `5/5`, selected
     snapshot coverage is `3/5`, and the remaining priority recovery blocker is
     `operation_created_but_no_step_transitions` for
     `sql_write_operations-p1` with cache-visible pending operation
     `dbbc250c-aec0-40eb-9637-8194f955bfea`.
171. The migrated startup publication epoch and pending-operation boundary is
     closed as
     [Rolling Restart Startup Publication Epoch Pending Operation Stalled](../packages/done-20260430-rolling-restart-startup-publication-epoch-pending-operation-stalled.md).
172. Operation-creation closure static guardrails:
     `npm run audit:guideline:literals`;
     `npm run audit:guideline:decision-boundaries`;
     `npm run audit:runtime-grammar`;
     `git diff --check -- <touched files>`.
173. Result: passed. Literal, decision-boundary, runtime-grammar,
     state-machine pressure, and scoped whitespace checks reported no issues.
174. Pending-operation stalled focused validation:
     `node --check src/control-plane/priority-recovery-snapshot.js`;
     `node --check test/control-plane/priority-recovery-snapshot.test.js`;
     `node --check test/distributed/harness/failure-bundle-segment-1.js`;
     `node --check test/distributed/harness/failure-bundle-segment-2.js`;
     `node --check test/distributed/harness/priority-recovery-summary-normalization.js`;
     `node --check test/distributed/harness/__tests__/failure-bundle.test.js`;
     `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js --grep "young pending work|workflow-owned event-driven progress|timeout-reconcile-due"`;
     `node --test test/distributed/harness/__tests__/failure-bundle.test.js --test-name-pattern "preserves priority-recovery operation ids|replays playback snapshot priority-recovery evidence"`.
175. Result: passed. Young no-transition operations inside their step timeout
     remain workflow-owned `recovering_in_flight`, and failure-bundle
     normalization preserves progress and actuation owner-state fields.
176. Pending-operation stalled full focused validation:
     `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`;
     `node --test test/distributed/harness/__tests__/failure-bundle.test.js`;
     `./node_modules/.bin/tap test/control-plane/membership-publication-coordinator.test.js`;
     `./node_modules/.bin/tap test/control-plane/replica-dispatch-atomic-claim.integration.test.js`.
177. Result: passed. The selected suites reported `219/219`, `53/53`,
     `215/215`, and `28/28` passing.
178. Pending-operation stalled static guardrails:
     `npm run audit:guideline:literals`;
     `npm run audit:guideline:decision-boundaries`;
     `npm run audit:runtime-grammar`;
     `git diff --check -- <touched files>`.
179. Result: passed. Literal, decision-boundary, runtime-grammar, and scoped
     whitespace checks reported no new issues.
180. Pending-owner-state representative `rolling-restart` rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-pending-owner-state.report.json --verbose`
181. Result: failed, `0/1` passed after `131.3s`, but the false
     `operation_stalled` blocker is closed. The latest blocker is publication
     epoch `4` `ACK_PENDING` with pending ACK count `1`, selected snapshot
     coverage `4/5`, selected snapshot reachability timeout on
     `7493b0ab-a054-5fad-a91b-5e331db29304`, and
     `eligible_but_no_operation_created` for `sql_write_operations-p1`.
182. The migrated operation-creation and snapshot-reachability boundary is
     complete as
     [Rolling Restart Startup Publication Epoch Operation Creation And Snapshot Reachability](../packages/done-20260430-rolling-restart-startup-publication-epoch-operation-creation-and-snapshot-reachability.md).
183. Operation snapshot and ACK-target focused checks:
     `git diff --check -- <touched files>`;
     `./node_modules/.bin/eslint <touched runtime and focused test files>`;
     `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js --grep 'caller timeout budgets|young pending work'`;
     `./node_modules/.bin/tap test/control-plane/replica-dispatch-node-state-update.test-part-4.js --grep 'authoritative CREATING|CREATING system-table rows'`;
     `./node_modules/.bin/tap test/control-plane/publication-recovery-evidence.test.js --grep 'pending ACK targets|count-only ACK debt|explicit empty required ACK list|retires stale closure diagnostics'`;
     `./node_modules/.bin/tap test/control-plane/membership-publication-coordinator.test.js --grep 'refreshes stale priority spread metadata'`.
184. Result: passed.
185. Operation snapshot and reachability representative `rolling-restart`
     rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-operation-snapshot-reachability.report.json --fast-local --verbose`
186. Result: failed, `0/1` passed after `507.0s`, but the startup
     publication blocker migrated. The latest blocker is control-plane
     quiescence with `inFlightCount=2`, `effectiveInFlightCount=0`,
     `staleInFlightCount=2`, `quiescenceState=quiescent`,
     `canonicalBlocker=none`, and candidate-window reset `leadership_churn`.
187. The migrated quiescence boundary is active as
     [Rolling Restart Quiescence Stale In Flight Canonical Blocker](../packages/done-20260430-rolling-restart-quiescence-stale-inflight-canonical-blocker.md).
188. ACK evidence follow-up fixes:
     stale explicit pending ACK node ids no longer override a complete required
     ACK list, and rebuilt publication gates preserve count-only ACK debt.
189. Quiescence stale-in-flight focused proof:
     `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep 'discounted stale in-flight work'`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep 'waitForControlPlaneQuiescence'`;
     `./node_modules/.bin/tap test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`.
190. Result: passed. The quiescence wait loop now uses canonical
     `effectiveInFlightCount` for progress accounting and no longer lets the
     no-progress watchdog preempt a closed quiescence stable window.
191. Quiescence stale-in-flight static guardrails:
     `./node_modules/.bin/eslint <touched runtime and focused test files> --no-ignore`;
     `npm run audit:guideline:literals`;
     `npm run audit:guideline:decision-boundaries`;
     `npm run audit:runtime-grammar`.
192. Result: passed. Literal, decision-boundary, runtime-grammar,
     state-machine pressure, and scoped lint checks reported no issues.
193. Quiescence stale-in-flight representative `rolling-restart` rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-quiescence-stale-inflight-closure.report.json --fast-local --verbose`
194. Result: failed, `0/1` passed after `353.9s`, but the quiescence blocker
     migrated. The failure bundle has `quiescence=null`; the new dominant
     reason is `restart_recovery_timeout` for node
     `11601fe0-72d6-5853-8590-ec2881853e72`, with bootstrap health reachable
     but admin/control-plane recovery readiness false and admin probe
     `ECONNREFUSED 172.19.0.4:8081`.
195. The migrated recovery-readiness boundary was completed as
     [Rolling Restart Restart Recovery Admin Reachability Regression](../packages/done-20260430-rolling-restart-restart-recovery-admin-reachability-regression.md).
196. Restart recovery admin reachability regression checks:
     `node --test test/distributed/harness/__tests__/failure-bundle.test.js --test-name-pattern 'admin refusal'`;
     `node --test test/distributed/harness/__tests__/failure-bundle.test.js --test-name-pattern 'admin refusal|stale restart-recovery priority spread'`.
197. Review-fix checks carried in the same validation:
     `./node_modules/.bin/tap test/control-plane/control-plane-readiness-service.test-part-4.js --grep 'count-only ACK debt'`;
     `node --test test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js --test-name-pattern 'critical spread observation gaps'`.
198. Restart recovery admin reachability static guardrails:
     `node --check <touched runtime and focused test files>`;
     `git diff --check -- <touched files>`;
     `npx eslint <touched files> --no-ignore`;
     `npm run audit:guideline:literals`;
     `npm run audit:guideline:decision-boundaries`;
     `npm run audit:runtime-grammar`;
     `npm run test:metadata-gateway:audit`.
199. Result: passed. The failure bundle now gives admin-refused restart
     recovery one canonical `admin_reachability_refused` owner state and keeps
     stale priority-spread protocol vocabulary coherent when the gate is not
     active.
200. Restart recovery admin reachability representative `rolling-restart`
     rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-admin-reachability-owner-state.report.json --fast-local --verbose`
201. Result: failed, `0/1` passed after `398.2s`, but the restart-recovery
     admin reachability blocker migrated. The terminal error is now
     `Cluster ACTIVE wait stalled with no meaningful progress for 8 attempts`;
     dominant reason is `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, failure
     class is `publication_convergence_blocked`, and the active publication
     gate is missing published node
     `8be8d30f-4499-5eed-865c-71b4d529a67a` with `PUBLISHED`,
     `pendingAck=0`, `recoveryProtocolState=steady_published`, and
     `prioritySpreadPending=false`.
202. The migrated ACTIVE publication boundary is active as
     [Rolling Restart Active Publication Missing Node Convergence](../packages/done-20260430-rolling-restart-active-publication-missing-node-convergence.md).
203. Review-fix and missing-node owner focused validation:
     `node --check src/control-plane/active-node-projection.js`;
     `node --check src/control-plane/recovery-protocol-snapshot.js`;
     `node --check src/control-plane/control-plane-readiness-service-segment-4.js`;
     `node --check test/control-plane/control-plane-readiness-service.test-part-4.js`;
     `node --check test/distributed/harness/failure-bundle-segment-1.js`;
     `node --check test/distributed/harness/failure-bundle-segment-2.js`;
     `node --check test/distributed/harness/failure-bundle-segment-3.js`;
     `node --check test/distributed/harness/failure-bundle-segment-4.js`;
     `node --check test/distributed/harness/failure-bundle-segment-5.js`;
     `node --check test/distributed/harness/failure-bundle-segment-6.js`;
     `node --check test/distributed/harness/failure-bundle-segment-7.js`;
     `node --check test/distributed/harness/__tests__/failure-bundle.test.js`;
     `./node_modules/.bin/tap test/control-plane/control-plane-readiness-service.test-part-4.js --grep 'count-only ACK debt|direct count-only ACK debt'`;
     `node --test test/distributed/harness/__tests__/failure-bundle.test.js`.
204. Result: passed. Count-only ACK debt survives publication projection and
     direct/provided planning merges, stale priority-spread playback remains
     open only with real ACK debt, and failure bundles now classify terminal
     missing published-active membership as
     `publication_missing_active_node=<node>` instead of stale priority or
     generic publication-pending vocabulary.
205. Missing-node owner scoped guardrails:
     `node scripts/check-guideline-literals.js ./test/distributed/harness/failure-bundle-segment-1.js ./test/distributed/harness/failure-bundle-segment-4.js ./test/distributed/harness/failure-bundle-segment-5.js ./test/distributed/harness/__tests__/failure-bundle.test.js ./src/control-plane/active-node-projection.js ./src/control-plane/recovery-protocol-snapshot.js ./src/control-plane/control-plane-readiness-service-segment-4.js ./test/control-plane/control-plane-readiness-service.test-part-4.js`;
     `node scripts/check-guideline-decision-boundaries.js ./test/distributed/harness/failure-bundle-segment-4.js ./test/distributed/harness/failure-bundle-segment-5.js ./src/control-plane/active-node-projection.js ./src/control-plane/recovery-protocol-snapshot.js ./src/control-plane/control-plane-readiness-service-segment-4.js`;
     `node scripts/check-guideline-boundary-mode-contracts.js ./test/distributed/harness/failure-bundle-segment-4.js ./test/distributed/harness/failure-bundle-segment-5.js ./src/control-plane/active-node-projection.js ./src/control-plane/recovery-protocol-snapshot.js ./src/control-plane/control-plane-readiness-service-segment-4.js`.
206. Result: passed with `0` new literal, decision-boundary, or
     boundary-mode-contract violations.
207. Missing-node representative `rolling-restart` rerun:
     `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-active-publication-missing-node-owner-state.report.json --fast-local --verbose`.
208. Result: failed, `0/1` passed after `132.1s`, but the missing-node blocker
     migrated. Terminal evidence now reports publication epoch `4`,
     `PUBLISHED`, `publishedActive=5/5`, `pendingAck=0`,
     `missingPublished=0`, selected snapshot coverage `5/5`, and a genuine
     priority-recovery workflow-progress blocker for `sql_transactions-p1`.
209. The migrated operation-transition boundary was re-entered through
     [Rolling Restart Operation Transition Status Authority Review Followup](../packages/done-20260504-rolling-restart-operation-transition-status-authority-review-followup.md).
210. Dispatch-wake progress focused validation passed, and the representative
     rerun
     `test-output/reports/rolling-restart-after-dispatch-wake-progress-20260504-codex.report.json`
     failed by migration after `132.4s`. Publication epoch `2` is
     `PUBLISHED`, pending ACK count is `0`, but startup active-gate evidence
     has active `2/5`, selected-snapshot coverage `2/5`, priority spread gap
     `5`, `sql_write_operations-p1` still
     `eligible_but_no_operation_created`, and `sql_transactions-p1` still
     `recovering_in_flight`. The startup package later closed by migration:
     [Rolling Restart Startup Active Gate Priority Operation Creation Snapshot Coverage](../packages/done-20260504-rolling-restart-startup-active-gate-priority-operation-creation-snapshot-coverage.md).
