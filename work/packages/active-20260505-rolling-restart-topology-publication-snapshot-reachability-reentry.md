# Rolling Restart Topology Publication Snapshot Reachability Reentry

Opened on May 5, 2026 as the current representative split from
[Rolling Restart Operation Transition Pressure And Over-Target Trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
The fresh representative path migrated away from post-active
operation-transition / over-target trim and is now blocked earlier by startup
active-gate publication, selected snapshot reachability, and missing published
active-node evidence. The latest representative rerun after the `132033Z`
replay fixture migrated again on `20260505T140646Z`.

## Current Evidence

1. Fresh representative rerun after the `132033Z` post-ACK replay fixture:
   `test-output/reports/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z/rolling-restart/`.
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z/rolling-restart/failure-bundle.json`.
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z/rolling-restart/triage-summary.md`.
5. Command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z.report.json --fast-local --verbose`.
6. Result: failed, `0/1` passed after `130.3s`.
7. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
8. Triage root cause class is `topology`, dominant reason is
   `publication_epoch_pending`, and failure class remains
   `publication_convergence_blocked`.
9. Terminal readiness failure is `no_progress_terminal` in startup mode with
   terminal reason `stalled_no_progress`, attempts since progress `3`, and no
   selected-snapshot reachability error; the selected witness is reachable by
   `admin_health`.
10. Publication epoch `5` is `OPEN`, recovery protocol state is
    `publication_pending`, pending ACK count is `2`, pending ACK nodes are
    `11601fe0-72d6-5853-8590-ec2881853e72` and
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and missing published count is
    `0`.
11. Publication gate reasons are `priority_partitions_not_spread`,
    `publication_epoch_pending`, and `snapshot_coverage=3/5`. The unresolved
    priority partitions are `sql_transactions-p1` and
    `sql_write_operations-p1`.
12. Terminal active-gate progress is active `5/5`, inactive `0`, selected
    snapshot coverage `3/5`, selected witness
    `8be8d30f-4499-5eed-865c-71b4d529a67a` reachable through `admin_health`,
    selected published active `5/5`, pending ACK `2`, missing published `0`,
    CDC replay lag `0`, publication disagreement nodes `4`, priority spread
    pending with gap `7`, priority blocked partition count `2`, and blockers
    `snapshot_coverage=3/5` plus
    `priority_recovery_progress_class=priority_operation_serial_wait`.
13. Best progress in the same run was active `5/5`, selected coverage `4/5`,
    selected witness `11601fe0-72d6-5853-8590-ec2881853e72` reachable through
    `admin_health`, publication epoch `5` `OPEN`, pending ACK `2`, selected
    published active `3/5`, selected missing published nodes
    `11601fe0-72d6-5853-8590-ec2881853e72` and
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, priority spread gap `7`, and
    blockers `snapshot_coverage=4/5` plus
    `priority_recovery_progress_class=priority_operation_serial_wait`.
14. Last meaningful progress still captured the prior-style epoch `3`
    `PUBLISHED` shape with pending ACK `0`, selected coverage `4/5`, selected
    missing published nodes `11601fe0-72d6-5853-8590-ec2881853e72` and
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, priority spread gap `10`, and
    `priority_recovery_progress_class=operation_created_but_no_step_transitions`;
    terminal evidence moved forward to epoch `5` `OPEN`.
15. Probe witnesses explain terminal coverage: the selected witness
    `8be8d30f-4499-5eed-865c-71b4d529a67a` is admin-ready, reachable through
    `admin_health`, and observed `3/5` from an `OPEN` publication; the seed
    observed `3/5` but timed out for reachability; nodes
    `11601fe0-72d6-5853-8590-ec2881853e72` and
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` were admin-ready `3/5`
    `PUBLISHED` witnesses; `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` was an
    admin-ready `1/5` `PUBLISHED` witness.
16. The selected snapshot observation remains explicit owner-contract evidence:
    `repair_deferred` / `stale_usable`, contract state `pending`, refresh state
    `idle`, next action `wait`, repair deferred `true`, and reason codes
    `cache_stale_watermark`, `discovery_node_coverage_gap`, and
    `stale_replica_operations_in_flight`.
17. Priority recovery migrated to explicit workflow-timeout and serial-wait
    evidence: `sql_transactions-p1` is `recovering_in_flight`, operation
    `0c78d9d7-3672-490e-87af-3b9acebd5801`, latest step `SENDING`, latest
    status `pending`, boundary `workflow_timeout`, wait mode
    `timeout_reconcile_due`, next action `reconcile_stale_operation_progress`;
    `sql_write_operations-p1` is `needs_operation` with
    `priority_operation_serial_wait`, `operation_unknown`, boundary
    `workflow_progress`, wait mode `event_driven`, next action
    `wait_for_operation_progress`, serial-waiting behind
    `sql_transactions-p1`.
18. Playback replay passed and stayed `replayed_blocked` with row counts
    `nodes=5`, `nodeEndpoints=0`, `partitions=33`, and `services=102`; durable
    and replayed evidence both remain epoch `5` / `OPEN`, priority spread
    pending, and replayed recovery protocol state `publication_pending` with
    reason codes `priority_partitions_not_spread` and
    `publication_epoch_pending`.
19. Replay preserved selected snapshot observation `repair_deferred` /
    `stale_usable` and owner-RPC/cache-repair deferral on `nodes` through
    `owner_rpc_lane` under `control_plane_backpressure` /
    `query_timeout`; matching deferral count is `2`, selected witness deferral
    count is `1`, latest retry-after is `16000ms`, and the deferral nodes are
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
    `8be8d30f-4499-5eed-865c-71b4d529a67a`.
20. Outcome: the post-ACK `PUBLISHED` selected-snapshot/cache-repair boundary
    did not close. It migrated to a new epoch `5` `OPEN` publication-pending
    boundary with pending ACK `2`, selected snapshot coverage `3/5`, priority
    spread pending, and operation-workflow timeout/serial-wait evidence.

## May 5 `074739Z` Evidence Trace

The first package task traced the failure bundle into one normalized evidence
snapshot:

1. Classification is `topology` /
   `publication_convergence_blocked`, with dominant reason
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`.
2. Publication epoch `3` is `PUBLISHED`, but accepted convergence evidence
   remains `publication_pending` with pending ACK count `0`, missing published
   count `2`, and missing published nodes
   `8be8d30f-4499-5eed-865c-71b4d529a67a` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
3. Publication gate reasons are `priority_partitions_not_spread`,
   `snapshot_coverage=4/5`, and the two explicit
   `publication_missing_active_node=<node>` reasons.
4. Terminal active-gate progress is active `2/5`, selected snapshot coverage
   `4/5`, selected published active `3/5`, selected missing published nodes
   matching the publication convergence summary, priority spread gap `10`, and
   a blocker signature made from `inactive_nodes=3`,
   `snapshot_coverage=4/5`, and
   `priority_recovery_progress_class=priority_operation_serial_wait`.
5. Best active-gate progress was active `3/5` with the same selected snapshot
   coverage `4/5`, the same selected missing published nodes, and selected
   snapshot node `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` reachable by
   `admin_health`.
6. Terminal selected snapshot reachability is the terminal readiness failure:
   `snapshot_reachability_timeout` from `selectedSnapshotReachabilityError`
   against `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, recoverability
   `terminal`, attempts since progress `3`, terminal reason
   `stalled_no_progress`.
7. Structured priority-recovery summary selects `sql_write_operations-p1` as
   `needs_operation` with progress class `priority_operation_serial_wait`,
   owner `operation_workflow_owner`, boundary `workflow_progress`, wait mode
   `event_driven`, next action `wait_for_operation_progress`, correlation key
   `sql_write_operations-p1|3|operation_unknown`, and current operation
   `57aa5679-15ad-4ea9-84f6-c6e5f906abf0`.
8. Serial-wait evidence is behind operations
   `4c37459a-ceb9-4745-a10a-0169ca521f50` and
   `f4cadbdd-f27f-4660-b1a8-556e19ec4271` on partitions
   `sql_transaction_participants-p1` and `sql_transactions-p1`.
9. Stability gates keep failover open on `publication_missing_active_node`;
   convergence and restart recovery are open on
   `publication_missing_active_node|priority_spread_pending`.
10. The canonical next owner question is why the publication/topology owner
    accepts `PUBLISHED` plus pending ACK count `0` while still carrying
    `publication_pending`, explicit missing-active-node debt, and selected
    snapshot reachability debt. The priority serial-wait witness is supporting
    pressure evidence unless that topology debt is first closed or made
    subordinate by the owner path.

## May 5 Missing-Active Owner Path

The second package task traced the publication missing-active-node path without
runtime edits:

1. Runtime publication candidates are assembled in
   `src/control-plane/membership-publication-planning.js` by
   `deriveMembershipPublicationCandidate(...)`. The candidate passes
   publication status, published active membership, ACK lists, priority
   recovery summary, and membership lifecycle projection evidence into
   `buildRecoveryProtocolSnapshot(...)`, then carries the durable snapshot
   fields actually returned on the publication row:
   `missingPublishedRecoveryActiveNodeIds`,
   `recoveryProtocolState`, and `priorityRecoveryReasonCodes`.
   `publicationRecoveryGate` is built and exposed by
   `buildRecoveryProtocolSnapshot(...)` as part of the recovery protocol
   snapshot, not carried back as a publication row field.
2. `src/control-plane/recovery-protocol-snapshot.js` owns the durable
   publication/recovery snapshot. For a `PUBLISHED` membership row, durable
   membership is `publishedActiveNodeIds`; recovery-active membership is
   resolved from explicit recovery-active IDs, locally eligible or projected
   serving nodes, and recovery-eligible projection evidence. Any
   recovery-active node outside durable published membership becomes
   `missingPublishedRecoveryActiveNodeIds`.
3. `src/control-plane/publication-recovery-gate.js` owns the publication gate
   decision. `missingPublishedNodeIds` and `missingPublishedCount` keep
   `publicationPending` true before priority-spread state is considered, so
   `PUBLISHED` plus pending ACK count `0` can still produce a gate state of
   `publication_pending`. That is separate from ACK closure and is the
   intended owner path for missing published active members.
4. The `074739Z` artifact follows that path: the control-plane publication
   convergence gate reports `state=publication_pending`,
   `publicationStatus=PUBLISHED`, `pendingAckCount=0`,
   `missingPublishedCount=2`, missing nodes
   `8be8d30f-4499-5eed-865c-71b4d529a67a` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, and
   `prioritySpreadPending=true`. Its recovery protocol state is
   `priority_spread_pending`, while the top-level failure summary reports the
   open gate as `publication_pending`.
5. The active-gate harness in
   `test/distributed/harness/cluster-segment-2.js` consumes the selected
   publication convergence gate. It compares expected nodes to
   `publishedActiveNodeIds`, merges the gate's `missingPublishedNodeIds`, and
   emits `publication_missing_active_node=<node>` reasons independently from
   pending ACK reasons.
6. The failure-bundle owner in
   `test/distributed/harness/failure-bundle-segment-4.js` preserves canonical
   missing-published debt during active-gate coverage lag and promotes the
   first explicit `publication_missing_active_node=<node>` reason as the
   dominant reason. In the `074739Z` artifact that reason is
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`.

Conclusion: the open missing-active-node publication debt is not an ACK owner
bug. The next runtime question is why the selected topology snapshot remains
at coverage `4/5` and why
`ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` moves from best-progress
`admin_health` reachability to terminal `snapshot_reachability_timeout` while
the publication gate still carries the two missing published active nodes.

## May 5 Selected Snapshot Coverage And Reachability Owner Path

The third package task traced selected snapshot coverage and reachability
without runtime edits:

1. `test/distributed/harness/cluster-segment-7-class-5.js` owns selected
   control-snapshot coverage through `_probeControlSnapshotCoverage(...)`.
   It probes the seed first, then probes the remaining nodes when the seed
   snapshot is incomplete. Coverage is the selected control snapshot's observed
   expected-node count, not the publication row's durable active membership.
2. Selection is coverage-first. The harness selects the result with the lowest
   `missingExpectedNodeCount`, then breaks ties with observed count,
   control-plane diagnostics availability, admin readiness, reachability,
   healthy readiness count, missing-published count, pending ACK count,
   published-active count, and captured timestamp.
3. In the `074739Z` artifact, the terminal
   `controlPlane.activeGateSnapshotCoverage.probeWitnesses` explain the
   selected `4/5` coverage:
   - `7493b0ab-a054-5fad-a91b-5e331db29304`: snapshot query failed,
     observed `0/5`, reachability timed out.
   - `11601fe0-72d6-5853-8590-ec2881853e72`: snapshot query succeeded,
     observed `3/5`, reachability timed out.
   - `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`: snapshot query succeeded,
     observed `3/5`, reachability timed out.
   - `8be8d30f-4499-5eed-865c-71b4d529a67a`: snapshot query failed,
     observed `0/5`, reachable only by `bootstrap_health`, admin lane refused.
   - `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`: snapshot query succeeded,
     observed `4/5`, reachability timed out.
4. `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` is therefore selected because it
   has the best expected-node coverage. Its selected observed nodes are
   `11601fe0-72d6-5853-8590-ec2881853e72`,
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   `7493b0ab-a054-5fad-a91b-5e331db29304`, and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, so the only missing observed
   expected node is `8be8d30f-4499-5eed-865c-71b4d529a67a`.
5. The selected snapshot's publication row still has durable published active
   membership of only `11601fe0-72d6-5853-8590-ec2881853e72`,
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and
   `7493b0ab-a054-5fad-a91b-5e331db29304`. That is why selected snapshot
   coverage is `4/5` while selected published active remains `3/5`, and why
   selected missing published nodes remain
   `8be8d30f-4499-5eed-865c-71b4d529a67a` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
6. `test/distributed/harness/cluster-segment-2.js` owns the active-gate
   projection via `buildActiveWaitProgressSnapshot(...)`. It carries the
   selected coverage fields into the active-gate progress snapshot, emits
   `snapshot_coverage=4/5`, and preserves
   `selectedSnapshotReachabilityError` separately from snapshot query success.
7. `test/distributed/harness/startup-readiness-evidence.js` owns readiness
   delay classification. In startup mode,
   `classifyActiveGateReadinessDelay(...)` treats a timeout-shaped
   `selectedSnapshotReachabilityError` as terminal
   `snapshot_reachability_timeout`.
8. The terminal selected snapshot query itself succeeded and exposed
   control-plane diagnostics. The reachability timeout comes from the separate
   `getReachabilityDiagnostics(...)` probe after the snapshot query. The same
   selected node was `admin_health` reachable at best progress, then timed out
   at terminal progress.
9. The selected node log points at owner-RPC/cache-repair pressure rather than
   an isolated selected-snapshot selection bug: repeated message-router
   reconnects to `7493b0ab-a054-5fad-a91b-5e331db29304` timed out, the
   terminal `control_snapshot` cache repair failed on the `nodes` table with
   `control_plane_backpressure`, and a default-lane admin client connected
   shortly after the failure.

Conclusion: selected snapshot coverage `4/5` is explained by the harness
selecting the best observed expected-node snapshot, while selected published
active `3/5` is the durable publication membership from that same selected
snapshot. The reachability timeout on
`ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` is a terminal active-gate probe symptom
on the selected witness, but it is subordinate to the open topology debt:
missing published active nodes and priority spread/serial-wait pressure remain
unclosed. No small runtime or harness fix is indicated from this slice alone;
the next task should trace the `sql_write_operations-p1` serial-wait owner path
and the owner-RPC pressure around `7493b0ab-a054-5fad-a91b-5e331db29304`.

## May 5 Serial-Wait Witness Owner Path

The fourth package task traced the `sql_write_operations-p1` serial-wait
witness without runtime edits:

1. `src/control-plane/priority-recovery-snapshot.js` owns the runtime priority
   recovery decision snapshots. `buildPriorityRecoveryDecisionSnapshots(...)`
   builds operation contexts, computes ordinary serial-lane operation contexts
   for tracked non-emergency priority partitions, then emits one decision
   snapshot per tracked partition and operation.
2. `buildPriorityRecoveryPartitionAssessment(...)` is the decision point for
   `priority_operation_serial_wait`: when a partition is eligible, not spread,
   has no current active/completed placement operation in that snapshot, and
   another ordinary serial-lane operation exists, it emits
   `priority_operation_serial_wait`. The progress contract maps that state to
   `operation_workflow_owner`, `workflow_progress`, `event_driven`, and
   `wait_for_operation_progress`.
3. The `074739Z` artifact has two `sql_write_operations-p1` decision snapshots.
   The operation-specific snapshot is keyed by
   `sql_write_operations-p1|3|57aa5679-15ad-4ea9-84f6-c6e5f906abf0` and shows
   operation `57aa5679-15ad-4ea9-84f6-c6e5f906abf0` as a `REPLACE` for
   `sql_write_operations-p1-r4`, moving from
   `7493b0ab-a054-5fad-a91b-5e331db29304` to
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`. It is `pending` / `PENDING`,
   `persisted_not_dispatched`, `dispatch_pending`, age `9078ms` against a
   `30000ms` step timeout, target visibility `absent`, and
   `timeoutReconcileDue=false`.
4. The later selected-current snapshot is keyed by
   `sql_write_operations-p1|3|operation_unknown`. It sees planner spread gap
   `2`, ready distinct node count `1/3`, no current operation context, and
   emits `needs_operation` with blocker `priority_operation_serial_wait`.
   Its serial-wait operation ids are
   `4c37459a-ceb9-4745-a10a-0169ca521f50` and
   `f4cadbdd-f27f-4660-b1a8-556e19ec4271`; its serial-wait partition ids are
   `sql_transaction_participants-p1` and `sql_transactions-p1`.
5. `src/control-plane/priority-recovery-observation-snapshot.js` owns the
   witness roll-up. It selects the latest related partition snapshot for the
   visible state, but preserves related `operationIds`,
   `serialWaitOperationIds`, `serialWaitPartitionIds`, and `witnessIds`. That
   is why the report-side witness correlation key is
   `sql_write_operations-p1|3|operation_unknown` while the same witness still
   carries operation `57aa5679-15ad-4ea9-84f6-c6e5f906abf0`.
6. `sql_transaction_participants-p1` is no longer the selected current blocker
   in the failure bundle. Its final decision snapshot is
   `spread_satisfied_in_flight` with operation
   `4c37459a-ceb9-4745-a10a-0169ca521f50` at `CREATING`, target visibility
   `active_operational`, `target_creation`, event-driven workflow progress,
   and no blocker reason. The timeline still records supporting pressure:
   the target handled `CREATE_REPLICA`, reported the replica already active,
   and later released the orphan reservation during reconciliation.
7. `sql_transactions-p1` is also no longer the selected current blocker. Its
   final decision snapshot is `spread_satisfied_in_flight` with operation
   `f4cadbdd-f27f-4660-b1a8-556e19ec4271` terminal at `REMOVED`, target
   visibility `active_operational`, and ready progress. Its timeline records
   the earlier `CREATING -> ACTIVE` step, an authoritative-operation visibility
   warning, a deferred retryable `ACTIVE` dispatch failure with message
   timeout, and source-removal handling on
   `7493b0ab-a054-5fad-a91b-5e331db29304`.
8. `test/distributed/harness/priority-recovery-summary-normalization.js`
   classifies this final witness shape as a supporting workflow serial-wait
   deferral. The failure bundle and triage summary therefore select
   `sql_write_operations-p1` as the current priority-recovery witness and keep
   `priorityRecoveryOwner=operation_workflow_owner`,
   `priorityRecoveryBoundary=workflow_progress`,
   `priorityRecoveryWaitMode=event_driven`, and
   `priorityRecoveryNextAction=wait_for_operation_progress`.
9. The older active-gate blocker history still preserves the previous
   `operation_created_but_no_step_transitions` pressure around
   `sql_transaction_participants-p1`, but the canonical terminal
   `publicationConvergence`, `controlPlane.activeGateProgress`, failure
   classification signals, and triage summary all agree on the current
   `sql_write_operations-p1` serial-wait witness.

Conclusion: this slice does not indicate a small runtime owner fix or a
current harness classification bug. The serial-wait evidence is supporting
operation-workflow pressure under the already-open topology publication debt:
in the historical `074739Z` artifact, publication remains
`publication_pending` with missing published active nodes, selected snapshot
coverage remains `4/5`, and selected snapshot reachability times out. The
latest `093109Z` artifact supersedes that terminal reachability boundary with
`no_progress_terminal` and no selected reachability error. If topology
publication debt closes and this witness persists, the next smallest runtime
question is whether the operation-workflow owner keeps
`57aa5679-15ad-4ea9-84f6-c6e5f906abf0` moving out of
`persisted_not_dispatched` without relying on stale or lower-coverage
operation visibility.

## May 5 Focused Owner Regression

The fifth package task added a focused harness regression in
`test/distributed/harness/__tests__/failure-bundle.test.js`:
`keeps missing-active publication debt canonical over reachability and serial wait`.

The fixture locks the `074739Z` owner shape without adding a broad distributed
scenario:

1. Publication epoch `3` is `PUBLISHED` with pending ACK count `0`.
2. Publication recovery remains `publication_pending` with missing published
   active nodes
   `8be8d30f-4499-5eed-865c-71b4d529a67a` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
3. Selected startup active-gate progress is active `2/5`, selected snapshot
   coverage `4/5`, selected published active `3/5`, and selected snapshot
   reachability times out through `selectedSnapshotReachabilityError`.
4. The `sql_write_operations-p1` witness remains
   `priority_operation_serial_wait` / `needs_operation` with
   `operation_workflow_owner`, `workflow_progress`, `event_driven`, and
   `wait_for_operation_progress`, plus the serial-wait operation and partition
   ids.

Expected canonical outcome:

1. Failure class remains `publication_convergence_blocked`.
2. Dominant reason remains
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`.
3. Failure-bundle and triage-summary outputs preserve the missing-published
   node list.
4. Failover, convergence, and restart-recovery stability gates keep
   `publication_missing_active_node` open, with convergence and
   restart-recovery also retaining `priority_spread_pending`.
5. Serial-wait evidence is preserved in the publication convergence witness
   fields and in failure-bundle / triage failure-class signals:
   `priorityRecoveryOwner=operation_workflow_owner`,
   `priorityRecoveryBoundary=workflow_progress`,
   `priorityRecoveryWaitMode=event_driven`, and
   `priorityRecoveryNextAction=wait_for_operation_progress`. These signals do
   not replace the topology/publication owner while missing-active publication
   debt is open.

The focused regression was corrected after review to match the real `074739Z`
diagnostic contract: the canonical owner remains topology/publication
missing-active-node, and the subordinate priority-recovery owner, boundary,
wait-mode, and next-action signals remain present in both the failure bundle
and triage summary.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Reconcile the current deferred selected-snapshot observation publication
   membership/snapshot coverage residual: publication epoch `5` is `OPEN`,
   pending ACK count is `2`, recovery remains `publication_pending`, terminal
   active is `5/5`, terminal selected snapshot coverage is `3/5`, selected
   published active is `5/5`, selected missing published count is `0`, and
   selected snapshot observation reports `repair_deferred` / `stale_usable`.
2. Explain why the latest selected snapshot node
   `8be8d30f-4499-5eed-865c-71b4d529a67a` is reachable through
   `admin_health` while pending ACK remains open for
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, selected snapshot coverage remains
   `3/5`, and priority spread remains pending.
3. Keep the `074739Z` selected snapshot reachability timeout on
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` as historical evidence only; it no
   longer competes with the current terminal boundary.
4. Preserve and classify subordinate priority-recovery workflow-progress
   evidence, most recently `sql_transactions-p1` as `recovering_in_flight`
   under `workflow_timeout` / `timeout_reconcile_due` and
   `sql_write_operations-p1` as `needs_operation` with
   `priority_operation_serial_wait`, without treating it as post-active trim
   while topology debt remains open.
5. Keep the failure bundle anchored to one canonical owner outcome across
   publication, active-gate, selected snapshot, and priority-recovery evidence.
6. Rerun the representative `rolling-restart --fast-local` scenario after the
   smallest owner slice and record whether the blocker closes or migrates.

## Out Of Scope

1. Post-active operation-transition timeout reconciliation and over-target trim
   until the representative path reaches that boundary again.
2. Closing the prior `052328Z` `sql_write_operations-p1` PENDING
   dispatch-timeout residual except as supporting historical context.
3. Harness-only exemptions or timeout increases that make current runtime debt
   look green.
4. Broad matrix continuation before this five-node representative boundary
   closes or migrates.
5. Pro or Enterprise behavior.

## Invariants

1. Publication convergence, active-gate selected-snapshot progress, and
   priority-recovery evidence must normalize to one canonical topology outcome.
2. Pending ACK count `0` does not prove publication closure when the accepted
   evidence still reports `publication_pending` and explicit
   `publication_missing_active_node=<node>` reasons.
3. Selected snapshot coverage, pending ACK debt, and priority-spread debt must
   be explained even when the selected node is reachable through
   `admin_health`; the `074739Z` reachability timeout and `132033Z`
   post-ACK missing-active boundary remain historical unless a fresh artifact
   reintroduces them.
4. Workflow-timeout and serial-wait evidence remain owned by the operation
   workflow owner and must not replace topology publication-pending evidence
   unless topology debt is first closed or deliberately made subordinate.

## Implementation Tasks

- [x] Trace the `074739Z` failure bundle from active-gate progress,
      publication convergence, selected snapshot reachability, and
      priority-recovery summaries into one normalized evidence snapshot.
- [x] Identify the owner path for inactive nodes and explicit
      missing-active-node publication debt when publication status is
      `PUBLISHED` and pending ACK count is `0`.
- [x] Reconcile selected snapshot coverage `4/5` and the reachability timeout
      for `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
- [x] Trace the `sql_write_operations-p1` serial-wait witness through operation
      `57aa5679-15ad-4ea9-84f6-c6e5f906abf0` and serial-wait partitions
      `sql_transaction_participants-p1` and `sql_transactions-p1`.
- [x] Add the smallest focused runtime or harness regression needed for the
      selected owner decision.
- [x] Run touched-file syntax, relevant focused tests, non-literal guardrails,
      and `git diff --check`.
- [x] Rerun the representative `rolling-restart --fast-local` gate and record
      closure or the next migrated named boundary.
- [x] Trace the post-`e274126c` publication membership owner path for epoch
      `3` when best progress reaches active `5/5` but terminal selected
      publication remains published-active `3/5` with missing nodes
      `11601fe0-72d6-5853-8590-ec2881853e72` and
      `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
- [x] Add the smallest membership-publication reconcile probe or fixture that
      proves why the candidate after active-gate best progress still carries
      published-active `3/5`: capture baseline, projected recovery membership,
      publication target, candidate `changed`, and refresh/persist decision for
      epoch `3` without raising timeouts or broadening the matrix.
- [x] Rerun the representative `rolling-restart --fast-local` gate after the
      reconcile probe and record whether the blocker closes, stays on
      membership-publication owner rows/transport/service evidence, or migrates
      to one newly named owner boundary.
- [x] Trace the `20260505T102455Z` after-reconcile-probe artifact through
      membership-publication owner-row, transport, and service evidence for why
      active-gate progress reaches active `5/5` while selected publication epoch
      `2` remains published-active `2/5` with three missing published nodes.
- [x] Add the smallest selected-snapshot/replay fixture for the `102455Z` shape
      to decide whether same-coverage active-gate selection should prefer the
      stronger publication witness over an admin-ready but stale publication
      witness, or document the runtime owner repair that must make the
      admin-ready witness catch up.
- [x] Add the smallest runtime owner repair/probe that makes an admin-ready
      selected control-snapshot witness catch up to the stronger seed
      publication evidence, or emit an explicit deferred stale-observation
      outcome, when owner-row/service evidence is partial and owner-RPC repair
      is backpressured.
- [x] Rerun the representative `rolling-restart --fast-local` gate after the
      deferred selected-snapshot observation probe and record whether the blocker
      closes, stays on publication missing-active-node evidence, or migrates to
      one newly named owner boundary.
- [x] Trace the `20260505T114859Z` deferred-observation artifact through
      active-gate selected snapshot observation, publication gate, and
      owner-RPC/cache-repair evidence for why `repair_deferred` /
      `stale_usable` still leaves publication epoch `3` at published-active
      `3/5`, missing nodes `11601fe0-72d6-5853-8590-ec2881853e72` and
      `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, and closure witness
      `CL-006` / `startup_active_publication_lag`.
- [x] Add the smallest owner-RPC/cache-repair replay fixture or probe for the
      `20260505T114859Z` shape: selected admin-ready snapshot witness
      `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` remains
      `repair_deferred` / `stale_usable`, final owner-row replay still has
      only three node rows and no node endpoints, authoritative discovery
      repair keeps deferring after `nodes` repair fails through
      `owner_rpc_lane` / `control_plane_backpressure`, and publication epoch
      `3` stays published-active `3/5` with the two expected active nodes
      missing from durable publication.
- [x] Rerun the representative `rolling-restart --fast-local` gate after the
      owner-RPC/cache-repair replay probe and record whether the blocker closes,
      stays on deferred repair plus publication missing-active-node debt, or
      migrates to one newly named runtime owner boundary.
- [x] Trace the `20260505T123850Z` post-owner-RPC/cache-repair rerun through
      `ACK_PENDING` publication convergence, selected snapshot reachability
      timeout on `11601fe0-72d6-5853-8590-ec2881853e72`, pending ACK on
      `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, active-gate coverage `2/5`,
      and the split priority-recovery witnesses
      `sql_transaction_participants-p1` / operation scheduling and
      `sql_write_operations-p1` / workflow timeout.
- [x] Add the smallest focused ACK-pending operation-workflow timeout
      probe/fixture for the `20260505T123850Z` shape: preserve publication
      epoch `3` `ACK_PENDING`, required-ACK pending node
      `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, selected snapshot reachability
      timeout on target node `11601fe0-72d6-5853-8590-ec2881853e72`,
      selected coverage `2/5`, `sql_transaction_participants-p1` as
      operation-scheduling action-required evidence, and
      `sql_write_operations-p1` operation
      `df4f18e8-6b08-46b5-ba02-c770936ede32` as workflow-timeout
      `timeout_reconcile_due` evidence; prove whether the operation workflow
      owner enqueues or performs `reconcile_stale_operation_progress` without
      raising timeouts or broadening the distributed matrix.
- [x] Rerun the representative `rolling-restart --fast-local` gate after the
      ACK-pending operation-workflow timeout fixture and record whether the
      blocker stays on ACK-pending startup reachability, closes ACK debt and
      promotes `sql_write_operations-p1` workflow timeout, or migrates again.
- [x] Trace the `20260505T132033Z` post-ACK `PUBLISHED`
      missing-active selected-snapshot boundary through active-gate coverage,
      selected snapshot observation, owner-RPC/cache-repair deferral, and the
      subordinate workflow-progress witnesses on `control_plane_publications-p1`
      and `sql_write_operations-p1`, then decide the next smallest runtime
      owner/probe.
- [x] Add the smallest focused post-ACK `PUBLISHED` selected-snapshot /
      owner-RPC-cache-repair replay fixture or probe for the `20260505T132033Z`
      shape: terminal active `5/5`, selected coverage `3/5`, publication epoch
      `3` `PUBLISHED`, pending ACK `0`, active-gate missing published nodes
      `11601fe0-72d6-5853-8590-ec2881853e72` and
      `8be8d30f-4499-5eed-865c-71b4d529a67a`, selected witness
      `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` timing out for reachability while
      `repair_deferred` / `stale_usable`, owner-RPC/cache-repair deferral on
      `nodes`, and subordinate `spread_satisfied_in_flight`
      workflow-progress witnesses on `control_plane_publications-p1` and
      `sql_write_operations-p1`.
- [x] Rerun the representative `rolling-restart --fast-local` gate after the
      `132033Z` replay fixture and record whether the blocker closes, stays on
      post-ACK `PUBLISHED` selected-snapshot coverage / owner-RPC cache-repair
      deferral, or migrates to one newly named owner boundary.
- [ ] Trace the `20260505T140646Z` epoch `5` `OPEN` publication-pending
      artifact through pending ACK, selected-snapshot coverage, priority
      spread, owner-RPC/cache-repair deferral, and priority-recovery
      workflow-timeout / serial-wait evidence, then decide the next smallest
      focused fixture or runtime owner probe.

## May 5 Regression Validation

The corrected focused regression asserts that the subordinate
`priorityRecoveryOwner`, `priorityRecoveryBoundary`,
`priorityRecoveryWaitMode`, and `priorityRecoveryNextAction` failure-class
signals are retained while `publication_convergence_blocked` and the first
`publication_missing_active_node=<node>` remain canonical.

Passed:

1. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
2. `node --test --test-name-pattern "keeps missing-active publication debt canonical over reachability and serial wait" test/distributed/harness/__tests__/failure-bundle.test.js`
3. `node --test --test-name-pattern "keeps startup snapshot reachability subordinate to workflow progress" test/distributed/harness/__tests__/failure-bundle.test.js`
4. `node --test --test-name-pattern "classifies publication-closed priority actuation as workflow progress" test/distributed/harness/__tests__/failure-bundle.test.js`
5. `node scripts/check-guideline-literals.js test/distributed/harness/__tests__/failure-bundle.test.js`
   reported `0` new and `0` inherited literal-guideline violations.
6. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/__tests__/failure-bundle.test.js`
   reported `0` decision-boundary guideline violations.
7. `node scripts/check-guideline-boundary-mode-contracts.js test/distributed/harness/__tests__/failure-bundle.test.js`
   reported `0` boundary-mode-contract hotspot violations.
8. `git diff --check`

Blocked/inherited:

1. `node scripts/check-guidelines-llm.js test/distributed/harness/__tests__/failure-bundle.test.js`
   is blocked by the local OpenAI API key with `401 invalid_api_key`.
2. `npx eslint test/distributed/harness/__tests__/failure-bundle.test.js`
   remains pre-existing red on unused constants later in the file; the new
   regression did not add those unused constants.

## May 5 Representative Rerun After Diagnostic Contract

Executed after the corrected regression was pushed:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-topology-publication-snapshot-reachability-reentry-after-diagnostic-contract-20260505T093109Z.report.json --fast-local --verbose`
2. Report:
   `test-output/reports/rolling-restart-topology-publication-snapshot-reachability-reentry-after-diagnostic-contract-20260505T093109Z.report.json`
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-topology-publication-snapshot-reachability-reentry-after-diagnostic-contract-20260505T093109Z/rolling-restart/failure-bundle.json`
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-topology-publication-snapshot-reachability-reentry-after-diagnostic-contract-20260505T093109Z/rolling-restart/triage-summary.md`

Outcome: failed `0/1` after `130.1s`. The failure bundle and triage summary
keep `publication_convergence_blocked` canonical with dominant reason
`publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`.
They also retain subordinate priority-recovery diagnostics:
`priorityRecoveryOwner=operation_workflow_owner`,
`priorityRecoveryBoundary=workflow_progress`,
`priorityRecoveryWaitMode=event_driven`, and
`priorityRecoveryNextAction=wait_for_operation_progress`.

The selected snapshot reachability timeout from the `074739Z` run did not
remain terminal. The current residual boundary is topology publication
membership plus snapshot coverage: terminal active `2/5`, best active `5/5`,
selected snapshot coverage `4/5`, publication epoch `3` `PUBLISHED`, pending
ACK count `0`, missing published count `2`, selected published active `3/5`,
and priority spread gap `10`. The subordinate priority-recovery witness is
`sql_write_operations-p1` in `priority_operation_serial_wait` / `needs_operation`
at `operation_workflow_owner / workflow_progress / event_driven`, waiting on
serial operation `209eb9f7-3c77-4a0f-ad17-675e37681201` for
`sql_transactions-p1`.

## May 5 Post-`e274126c` Publication Membership Owner Path

The latest `093109Z` artifact traces to a membership publication owner path,
not an ACK owner or selected-snapshot reachability boundary:

1. The report, failure bundle, and triage summary agree on
   `publication_convergence_blocked` with publication epoch `3` `PUBLISHED`,
   pending ACK count `0`, missing published count `2`, and missing published
   nodes `11601fe0-72d6-5853-8590-ec2881853e72` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
2. Active-gate best progress and terminal progress both select control
   snapshot node `11601fe0-72d6-5853-8590-ec2881853e72`. Best progress reaches
   active `5/5`, but selected snapshot coverage remains `4/5`, selected
   published active remains `3/5`, selected missing published remains the same
   two nodes, and selected reachability remains `admin_health`.
3. The active count is harness readiness evidence from
   `buildActiveWaitProgressSnapshot(...)`, while selected publication
   membership is the selected control snapshot's
   `publicationConvergence.publishedActiveNodeIds`. Active `5/5` therefore
   does not itself promote durable publication membership to `5/5`.
4. Runtime membership publication ownership starts at
   `MembershipPublicationCoordinator.reconcileClusterMembership(...)`, which
   runs through the publication reconcile lane and the workflow coordinator's
   owner key. It derives a candidate through
   `deriveMembershipPublicationCandidate(...)`, then persists row fields through
   `buildMembershipPublicationRow(...)`.
5. `deriveMembershipPublicationCandidate(...)` carries the latest durable
   publication baseline into `publishedActiveNodeIds`, `requiredAckNodeIds`,
   and `acknowledgedNodeIds`, then passes the candidate through
   `buildRecoveryProtocolSnapshot(...)`. For a `PUBLISHED` row, the durable
   published membership is the row's `published_active_node_ids`.
6. `buildRecoveryProtocolSnapshot(...)` and
   `buildPublicationRecoveryGateSnapshot(...)` keep missing published members
   as publication-pending evidence when recovery-active or target-node evidence
   is outside durable published membership. In the selected `093109Z` control
   snapshot, the runtime `publishedMembershipObservation` itself reports
   recovery-active source `published_membership` and no runtime
   `missingPublishedRecoveryActiveNodeIds`; the harness computes the selected
   missing-published list by comparing expected nodes to the selected durable
   published-active list while snapshot coverage remains incomplete.
7. `_probeControlSnapshotCoverage(...)` owns that selected snapshot view. It
   extracts selected publication diagnostics from each reachable control
   snapshot, selects the best witness by coverage and diagnostics tie-breaks,
   and emits `selectedPublishedActiveNodeIds` plus
   `selectedMissingPublishedNodeIds`. `buildActiveWaitProgressSnapshot(...)`
   then combines those selected publication fields with per-node readiness
   probe counts into one active-gate progress snapshot.
8. The `093109Z` logs show the adjacent runtime pressure on the same owner
   area: `control_plane_publications-p1-r4` is created and reaches active on
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, while control-snapshot
   authoritative cache repair on `nodes` repeatedly fails through
   `owner_rpc_lane` with `control_plane_backpressure` when contacting
   `7493b0ab-a054-5fad-a91b-5e331db29304`. This explains stale selected
   membership/coverage pressure but does not prove which reconcile input kept
   the candidate at published-active `3/5`.

Conclusion: the owner path is runtime membership publication candidate
derivation and row persistence, observed by the active-gate selected snapshot
path. The bounded evidence does not justify a harness exemption or a timeout
change. The next smallest runtime task is to add a focused reconcile probe or
fixture for the post-best-progress membership candidate: record
`publishedBaselineNodeIds`, projected recovery membership, publication target
node ids, candidate `changed`, and whether `reconcileClusterMembership(...)`
refreshes or persists after active-gate best progress reaches `5/5`.

## May 5 Reconcile Probe Fixture

The next package task added a focused owner fixture in
`test/control-plane/membership-publication-coordinator.test.js`:
`reconcileClusterMembership keeps epoch 3 published-active 3/5 when active-gate best progress observes 5/5`.

Fixture shape:

1. Latest durable membership row is epoch `3`, `PUBLISHED`, acknowledged, and
   has published-active baseline `node-1`, `node-2`, and `node-3`.
2. Readiness planning input exposes five active-gate-ready nodes:
   `node-1` through `node-5`.
3. Membership-publication owner rows expose publishable node and service rows
   only for the durable baseline `node-1`, `node-2`, and `node-3`; endpoint and
   connected-node evidence are absent.

Expected owner outcome:

1. The candidate remains epoch `3` / `PUBLISHED`.
2. Publication target, projected serving membership, and recovery-active
   membership all remain the durable baseline `3/5`.
3. Recovery-active source remains `published_membership`, with no
   missing-published recovery-active nodes.
4. Candidate `changed` is `false`, priority metadata refresh is not requested,
   and `reconcileClusterMembership(...)` performs no persistence.

Conclusion: active-gate readiness observation by itself does not widen durable
publication membership. The runtime owner still requires publishable owner-row,
service, endpoint, connected-node, recovery-eligible, or liveness-fallback
evidence before epoch `3` can advance beyond published-active `3/5`.

## May 5 Reconcile Probe Validation

Passed:

1. `node --check test/control-plane/membership-publication-coordinator.test.js`
2. `node --test --test-name-pattern "reconcileClusterMembership keeps epoch 3 published-active 3/5 when active-gate best progress observes 5/5" test/control-plane/membership-publication-coordinator.test.js`
   ran the full file under the local TAP bridge and passed: `224` tests,
   `70` suites.
3. `node scripts/check-guideline-literals.js test/control-plane/membership-publication-coordinator.test.js`
   reported `0` new literal-guideline violations.
4. `node scripts/check-guideline-decision-boundaries.js test/control-plane/membership-publication-coordinator.test.js`
   reported `0` decision-boundary guideline violations.
5. `node scripts/check-runtime-grammar-contracts.js test/control-plane/membership-publication-coordinator.test.js`
   reported `0` runtime-grammar-contract violations.
6. `git diff --check` passed.

Inherited / unchanged:

1. `node scripts/check-guideline-literals.js --include-tests test/control-plane/membership-publication-coordinator.test.js`
   remains red with `171` whole-file test-literal violations. A comparison
   against the `HEAD` copy of the same file also reported `171`, so this probe
   did not increase test-inclusive literal debt.

## May 5 Representative Rerun After Reconcile Probe

Executed after the reconcile probe review fix was pushed:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-reconcile-probe-20260505T102455Z.report.json --fast-local --verbose`
2. Report:
   `test-output/reports/rolling-restart-after-reconcile-probe-20260505T102455Z.report.json`
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-reconcile-probe-20260505T102455Z/rolling-restart/failure-bundle.json`
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-reconcile-probe-20260505T102455Z/rolling-restart/triage-summary.md`

Outcome: failed `0/1` after `133.0s`. The terminal barrier is still
`Not all nodes reached ACTIVE state within 120000ms`, even though the terminal
progress snapshot reports active `5/5`. The canonical failure stays
`publication_convergence_blocked` with root cause class `topology` and dominant
reason
`publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.

The rerun did not close or migrate the package. It stays on the
membership-publication owner-row, transport, and service evidence boundary:
publication epoch `2` is `PUBLISHED`, pending ACK count is `0`, selected
published active remains `2/5`, missing published count is `3`, and missing
published nodes are `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
`8be8d30f-4499-5eed-865c-71b4d529a67a`, and
`ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`. Terminal selected snapshot coverage is
`3/5`; best progress reached selected snapshot coverage `4/5`.

The selected snapshot node
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7` is reachable through `admin_health` with
no selected reachability error. Subordinate priority-recovery evidence now
selects `sql_transaction_participants-p1` as `priority_operation_serial_wait` /
`needs_operation` under `operation_workflow_owner`, `workflow_progress`, and
`event_driven`, with correlation key
`sql_transaction_participants-p1|2|operation_unknown`, serial-wait operation
`74154dc2-e602-43a8-8dc7-58e32e3424b8`, and serial-wait partition
`sql_transactions-p1`.

## May 5 102455Z Owner-Row, Transport, And Service Trace

The `20260505T102455Z` artifact traces to a stale selected publication witness
under partial owner-row, transport, and service evidence:

1. Active `5/5` is active-gate readiness evidence from the harness
   process/bootstrap/status probes, not durable publication membership. The
   terminal event has all five nodes counted active while the selected
   publication view remains published-active `2/5`.
2. The active-gate selected control snapshot is
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`. It is admin-ready through
   `admin_health`, observes `3/5`, and carries publication epoch `2`
   `PUBLISHED` with published-active nodes
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `7493b0ab-a054-5fad-a91b-5e331db29304`. Its missing published nodes are
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
3. The probe witnesses disagree. The seed
   `7493b0ab-a054-5fad-a91b-5e331db29304` has the stronger publication view:
   epoch `3` `PUBLISHED`, published-active `3/5`, and only two missing
   published nodes. It is not selected because its reachability probe times
   out and it is not admin-ready. The admin-ready witnesses carry the stale
   epoch `2` / published-active `2/5` view.
4. The selected owner row is internally consistent rather than ACK-stuck:
   published-active and recovery-active membership contain only
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `7493b0ab-a054-5fad-a91b-5e331db29304`, participation evidence exists only
   for those two nodes, required ACK and acknowledged node lists match those two
   nodes, pending ACK count is `0`, and the row-local
   `missingPublishedCount` is `0`. The harness missing-published count of `3`
   comes from comparing expected five-node membership to that selected durable
   published-active list.
5. Playback replay from the failure bundle produced durable row counts of
   `nodes=3`, `nodeEndpoints=0`, `partitions=33`, and `services=103`. The
   replayed candidate advanced to epoch `3` `OPEN`, but stayed blocked with
   `driftClassification=replayed_blocked`; it did not produce all-five
   published membership.
6. The final raw snapshot has node rows for
   `7493b0ab-a054-5fad-a91b-5e331db29304`,
   `11601fe0-72d6-5853-8590-ec2881853e72`, and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`. Service rows exist only on the
   seed and `11601fe0-72d6-5853-8590-ec2881853e72`: the seed has `99` active
   rows, and `11601fe0-72d6-5853-8590-ec2881853e72` has `3` active rows plus
   `1` syncing learner. There are no final service rows for
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, or
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
7. Transport evidence explains why admin-ready witnesses can stay behind the
   seed publication view. Nodes `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` repeatedly reconnect to the seed,
   then fail `control_snapshot` cache repair on `nodes` through
   `owner_rpc_lane` / `control_plane_backpressure`. Node
   `8be8d30f-4499-5eed-865c-71b4d529a67a` later fails authoritative repair on
   `service_endpoints` through the same owner-RPC pressure.
8. Routing and service evidence points at priority recovery pressure rather
   than a closed publication path. Node
   `8be8d30f-4499-5eed-865c-71b4d529a67a` logs
   `all_services_filtered_by_readiness` for `config-p1`; the canonical leader
   is the seed, and the route is denied by
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.
9. Conclusion: active-gate progress reaching active `5/5` does not make the
   selected durable publication view publish all five nodes. The selected
   admin-ready witness is stale relative to the seed and replayed candidate,
   while the runtime owner-row/service evidence remains partial. The next
   smallest task is a selected-snapshot/replay fixture that decides whether the
   same-coverage selector should prefer stronger publication evidence over an
   admin-ready stale witness, or whether the runtime owner repair must first
   make admin-ready witnesses catch up.

Trace validation:

1. `node test/distributed/harness/publication-evidence-replay.js test-output/reports/.playback/rolling-restart-after-reconcile-probe-20260505T102455Z/rolling-restart`
   passed and reported `driftClassification=replayed_blocked`.

## May 5 Selected-Snapshot/Replay Fixture

The next package task added two narrow fixtures without a broad distributed
scenario:

1. `test/distributed/harness/__tests__/cluster.test-part-5.js` now pins the
   `102455Z` same-coverage selector shape. The seed witness has snapshot
   coverage `3/5`, publication epoch `3`, published-active `3/5`, and two
   missing published nodes, but is not admin-ready and has a reachability
   timeout. The selected admin-ready witness has the same snapshot coverage,
   publication epoch `2`, published-active `2/5`, and three missing published
   nodes.
2. Expected selector outcome: when coverage and diagnostics availability tie,
   active-gate selection keeps the admin-ready authority witness. The stronger
   seed publication witness remains preserved in `probeWitnesses`, but does not
   become the selected active-gate authority.
3. `test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   now pins the row-replay side of the same shape: `nodes=3`,
   `nodeEndpoints=0`, `partitions=33`, and `services=103`. The service rows
   preserve the partial artifact shape: priority partition services are
   present, the seed owns the broad active evidence, the published baseline
   contributes only three active priority rows plus one syncing learner, and
   the third replay node has no service rows.
4. Expected replay outcome: the replayed candidate advances to epoch `3`
   `OPEN`, but remains `replayed_blocked` with
   `recoveryProtocolState=publication_pending`; it does not prove all-five
   publication closure from the partial owner-row/service evidence.

Conclusion: the small fixtures do not indicate a harness selector policy bug.
Preferring the non-admin-ready seed would trade an authority/reachability
weaker selected witness for only a partially stronger publication view, while
runtime replay still remains blocked. The next owner step is a runtime repair
probe at the control-snapshot/membership-publication boundary: an admin-ready
selected witness must either catch up to the stronger seed publication evidence
through owned row/cache repair, or expose an explicit deferred stale-observation
outcome instead of silently carrying epoch `2` publication state.

## May 5 Selected-Snapshot/Replay Fixture Validation

Passed:

1. `node --check test/distributed/harness/__tests__/cluster.test-part-5.js`
2. `node --check test/distributed/harness/__tests__/publication-evidence-replay.test.js`
3. `npx tap --grep "keeps admin-ready authority over stronger publication|prefers the strongest publication witness when coverage ties|prefers authoritative admin-ready witnesses when coverage ties" test/distributed/harness/__tests__/cluster.test-part-5.js`
   ran the TAP-backed cluster shard fixture and adjacent selector tests. The
   cluster shard must not use `node --test` as validation proof because its
   tests are registered through the repo TAP bridge.
4. `node --test --test-name-pattern "keeps the 102455Z partial owner-row replay blocked" test/distributed/harness/__tests__/publication-evidence-replay.test.js`
5. `node --test test/distributed/harness/__tests__/publication-evidence-replay.test.js`
6. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` decision-boundary guideline violations.
7. `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` runtime-grammar-contract violations.
8. `node scripts/check-guideline-boundary-mode-contracts.js test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` boundary-mode-contract hotspot violations.
9. `git diff --check`

Inherited / unchanged:

1. `node scripts/check-guideline-literals.js test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   remains red with `438` existing test-literal violations in
   `cluster.test-part-5.js`.
2. `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   remains red with `440` whole-file test-literal violations. A comparison
   against the `HEAD` copies of the same two files also reported `440`, so this
   fixture did not increase test-inclusive literal debt.

## May 5 Deferred Selected-Snapshot Observation Probe

The next owner slice added the smallest active-gate probe for the deferred
observation path instead of changing same-coverage selector policy:

1. `test/distributed/harness/cluster-segment-7-class-5.js` now carries
   control-snapshot owner observation evidence from the selected snapshot row
   into active-gate coverage: `observationMode`, `snapshotObservation.state`,
   contract state, next action, refresh state, reason codes, retry hint, and the
   admin repair-deferred bit.
2. `test/distributed/harness/__tests__/cluster.test-part-5.js` pins the
   `102455Z` shape where the selected admin-ready witness remains older than the
   seed publication witness, but now emits
   `selectedSnapshotObservationMode=repair_deferred` and
   `selectedSnapshotObservationState=deferred_refresh`.
3. The seed's stronger publication evidence remains preserved in
   `probeWitnesses`; the selected admin-ready witness is no longer silent about
   deferred owner repair/backpressure.
4. The propagated snapshot/admin observation field names are file-private to
   the active-gate coverage extractor because no other harness owner consumes
   them yet.

Validation:

1. Red-first probe:
   `npx tap --grep "exposes deferred owner observation" test/distributed/harness/__tests__/cluster.test-part-5.js`
   initially failed because `selectedSnapshotObservationMode` was `undefined`.
2. `node --check test/distributed/harness/cluster-segment-7-class-5.js`
3. `node --check test/distributed/harness/__tests__/cluster.test-part-5.js`
4. `npx tap --grep "exposes deferred owner observation" test/distributed/harness/__tests__/cluster.test-part-5.js`
   passed after the active-gate observation extraction.
5. `npx tap --grep "exposes deferred owner observation|keeps admin-ready authority over stronger publication|prefers the strongest publication witness when coverage ties|prefers authoritative admin-ready witnesses when coverage ties" test/distributed/harness/__tests__/cluster.test-part-5.js`
   passed the deferred-observation probe and the adjacent selector fixtures.
6. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js`
   reported `0` decision-boundary guideline violations.
7. `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js`
   reported `0` runtime-grammar-contract violations.
8. `node scripts/check-guideline-boundary-mode-contracts.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js`
   reported `0` boundary-mode-contract hotspot violations.
9. `node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js`
   remains red with `449` inherited file-scoped literal violations.
10. `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js`
    remains red with `449`; the same two `HEAD` files also reported `449`, so
    this slice did not increase literal debt.
11. `git diff --check`

## May 5 Deferred Selected-Snapshot Observation Rerun

The next representative gate was:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-deferred-snapshot-observation-20260505T114859Z.report.json --fast-local --verbose`
2. Report:
   `test-output/reports/rolling-restart-after-deferred-snapshot-observation-20260505T114859Z.report.json`
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-deferred-snapshot-observation-20260505T114859Z/rolling-restart/failure-bundle.json`
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-deferred-snapshot-observation-20260505T114859Z/rolling-restart/triage-summary.md`
5. Result: failed, `0/1` passed after `132.3s`.

Outcome: the blocker remains on publication missing-active-node evidence. It
did not close and did not migrate to a new top-level owner boundary.

The terminal evidence keeps `topology` /
`publication_convergence_blocked` with dominant reason
`publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`.
Publication epoch `3` is `PUBLISHED`, recovery protocol state is
`publication_pending`, pending ACK count is `0`, missing published count is
`2`, and missing published nodes are
`11601fe0-72d6-5853-8590-ec2881853e72` and
`ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`. Publication gate reasons are
`priority_partitions_not_spread`, `snapshot_coverage=4/5`, and both explicit
`publication_missing_active_node=<node>` reasons.

Active-gate progress reaches active `5/5` with selected snapshot coverage
`4/5`, selected published active `3/5`, priority spread gap `10`, and selected
snapshot node `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` reachable through
`admin_health`. The selected snapshot reachability timeout remains historical.

The deferred observation probe is now visible in the control-plane diagnostics:
the selected snapshot reports `selectedSnapshotObservationMode=repair_deferred`,
`selectedSnapshotObservationState=stale_usable`,
`selectedSnapshotObservationContractState=pending`,
`selectedSnapshotObservationRefreshState=idle`,
`selectedSnapshotObservationNextAction=wait`, and repair deferred `true`.
Reason codes are `cache_stale_watermark`, `discovery_node_coverage_gap`, and
`stale_replica_operations_in_flight`.

The subordinate priority-recovery witness changed from the prior
`sql_transaction_participants-p1` serial wait to `sql_write_operations-p1` as
`recovering_in_flight`: owner `operation_workflow_owner`, boundary
`workflow_progress`, wait mode `event_driven`, actuation
`persisted_not_dispatched`, workflow phase `dispatch_pending`, latest workflow
step `PENDING`, latest status `pending`, operation
`b4e4c126-7b34-42dc-9234-ee9b7e3b6af2`, correlation key
`sql_write_operations-p1|3|b4e4c126-7b34-42dc-9234-ee9b7e3b6af2`, and next
action `wait_for_operation_progress`.

## May 5 114859Z Deferred Observation Trace

The latest artifact now traces to a deferred owner-RPC/cache-repair boundary,
not to an ACK owner bug, selected-snapshot selector bug, or fresh
priority-recovery owner migration.

Evidence:

1. The active-gate selected snapshot is
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`. It is admin-ready through
   `admin_health`, has no selected snapshot query error, no selected
   reachability error, observes `4/5` expected nodes, and carries
   publication epoch `3` / `PUBLISHED` with published-active nodes
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   `7493b0ab-a054-5fad-a91b-5e331db29304`, and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`.
2. The same selected witness explicitly reports owner observation
   `repair_deferred` / `stale_usable`: contract state `pending`, refresh state
   `idle`, next action `wait`, repair deferred `true`, and reason codes
   `cache_stale_watermark`, `discovery_node_coverage_gap`, and
   `stale_replica_operations_in_flight`.
3. The selected witness's row-local publication recovery gate is internally
   ACK-complete for its three durable published-active nodes: required ACK,
   acknowledged, and pending ACK counts are `3`, `3`, and `0`; row-local
   missing-published count is `0`; row-local gate state is
   `priority_spread_pending`.
4. The harness publication gate remains open because active-gate expected
   membership is five nodes while the selected durable publication contains
   only three. `buildActiveWaitProgressSnapshot(...)` therefore carries
   selected published active `3/5`, selected missing published nodes
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, selected snapshot coverage `4/5`,
   pending ACK count `0`, priority spread gap `10`, and blocker
   `snapshot_coverage=4/5`.
5. The failure-bundle publication convergence summary promotes that
   expected-node debt into canonical topology evidence: root cause class
   `topology`, failure class `publication_convergence_blocked`, dominant
   reason
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`,
   recovery protocol state `publication_pending`, publication gate reasons
   `priority_partitions_not_spread`, `snapshot_coverage=4/5`, and both
   explicit `publication_missing_active_node=<node>` reasons.
6. `CL-006` is explained by the active-gate closure classifier: startup mode
   has active `5/5`, inactive `0`, incomplete snapshot coverage, no gate
   reasons on the progress snapshot, `PUBLISHED` publication, pending ACK
   count `0`, missing published count greater than zero, no timeout-shaped
   selected snapshot error, and a strong admin witness. That produces
   `startup_active_publication_lag`.
7. Artifact replay stays blocked at the same owner boundary:
   `node test/distributed/harness/publication-evidence-replay.js
   test-output/reports/.playback/rolling-restart-after-deferred-snapshot-observation-20260505T114859Z/rolling-restart`
   passed with row counts `nodes=3`, `nodeEndpoints=0`, `partitions=33`,
   `services=103`, durable epoch `3` / `PUBLISHED`, durable
   `CL-006` / `startup_active_publication_lag`, replayed epoch `3` /
   `PUBLISHED`, `recoveryProtocolState=priority_spread_pending`, and
   `driftClassification=replayed_blocked`.
8. The terminal raw owner rows match the selected stale publication shape:
   final snapshot timestamp `1777981883760` has node rows only for
   `7493b0ab-a054-5fad-a91b-5e331db29304`,
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`; service rows are `99` active on
   the seed, `3` active on `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and `1`
   active on `8be8d30f-4499-5eed-865c-71b4d529a67a`; there are no final node
   rows or service rows for
   `11601fe0-72d6-5853-8590-ec2881853e72` or
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
9. The owner-RPC/cache-repair logs explain why the selected admin-ready
   witness can remain stale: `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` failed
   `control_snapshot` authoritative discovery repair on table `nodes` through
   `owner_rpc_lane` with `control_plane_backpressure`, failure class
   `pressure_or_timeout`, failure count `4`, and retry after `32000ms`.
   The selected node
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` later failed the same repair on
   table `nodes` through `owner_rpc_lane` with `control_plane_backpressure`,
   failure class `pressure_or_timeout`, failure count `1`, and retry after
   `8000ms`, while repeated message-router reconnects to the seed timed out or
   closed.
10. `src/control-plane/control-plane-snapshot-owner.js` owns the
    observation contract: when authoritative repair is unavailable, already in
    flight, scheduled, failed, or deferred, it attaches a stale/deferred
    `snapshotObservation` with owner-contract state and next action instead of
    silently treating the snapshot as fresh.
    `src/admin/admin-service-discovery-repair-methods.js` owns the
    non-blocking repair schedule decision and
    records recent repair failures as deferred repair windows. The artifact is
    on that path.
11. The priority-recovery witness remains subordinate context. The canonical
    witness is `sql_write_operations-p1` as `recovering_in_flight` with
    `persisted_not_dispatched`, owner `operation_workflow_owner`, boundary
    `workflow_progress`, wait mode `event_driven`, operation
    `b4e4c126-7b34-42dc-9234-ee9b7e3b6af2`, correlation key
    `sql_write_operations-p1|3|b4e4c126-7b34-42dc-9234-ee9b7e3b6af2`, latest
    workflow step `PENDING`, and latest status `pending`. It does not replace
    the topology publication owner while selected durable publication still
    omits two expected active nodes.

Conclusion: `repair_deferred` / `stale_usable` is now an explicit owner
contract for a stale selected admin-ready witness. It does not by itself close
publication, because the selected durable publication and final replayable
owner rows still contain only three publishable nodes and no node endpoints.
The next smallest runtime slice is an owner-RPC/cache-repair replay fixture or
probe for this shape: prove whether recent `owner_rpc_lane` /
`control_plane_backpressure` repair deferral should retry and converge the
selected witness after pressure clears, or whether the active-gate/failure
bundle should surface a more specific deferred-repair closure witness while
keeping `publication_missing_active_node` canonical.

Trace validation:

1. `node test/distributed/harness/publication-evidence-replay.js test-output/reports/.playback/rolling-restart-after-deferred-snapshot-observation-20260505T114859Z/rolling-restart`
   passed with `driftClassification=replayed_blocked`.

## May 5 Owner-RPC/Cache-Repair Replay Fixture

The next owner slice added a bounded replay probe in
`test/distributed/harness/publication-evidence-replay.js` and a synthetic
`114859Z` fixture in
`test/distributed/harness/__tests__/publication-evidence-replay.test.js`.

Implementation:

1. The replay summary now carries selected active-gate snapshot observation
   evidence from the failure bundle: selected witness
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, admin-ready
   `admin_health`, `repair_deferred` / `stale_usable`, contract state
   `pending`, refresh state `idle`, next action `wait`, repair deferred
   `true`, expected `5`, selected coverage `4`, selected published active
   `3`, and missing published nodes
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
2. The replay probe parses failure-bundle log excerpts for authoritative
   discovery cache-repair deferrals where `nodes` repair failed through
   `owner_rpc_lane` with `control_plane_backpressure`. On the real
   `114859Z` playback it reports four matching deferrals, including two on the
   selected witness, selected-witness retry after `16000ms`, and max retry
   after `32000ms`.
3. The replay summary now preserves the subordinate priority-recovery witness:
   `sql_write_operations-p1` as `recovering_in_flight` with operation
   `b4e4c126-7b34-42dc-9234-ee9b7e3b6af2`, correlation key
   `sql_write_operations-p1|3|b4e4c126-7b34-42dc-9234-ee9b7e3b6af2`,
   owner `operation_workflow_owner`, boundary `workflow_progress`, wait mode
   `event_driven`, actuation `persisted_not_dispatched`, workflow phase
   `dispatch_pending`, latest step `PENDING`, latest status `pending`, and
   next action `wait_for_operation_progress`.
4. The synthetic replay fixture keeps the final owner-row shape at three node
   rows, zero node endpoint rows, thirty-three partition rows, and one hundred
   three service rows. Replay remains blocked at publication epoch `3` /
   `PUBLISHED`, `priority_spread_pending`, selected published active `3/5`,
   closure witness `CL-006` / `startup_active_publication_lag`, and drift
   classification `replayed_blocked`.

Outcome: the probe preserves the current owner-RPC/cache-repair boundary
without widening timeouts or the distributed matrix. It does not close the
runtime blocker; it proves the selected admin-ready witness remains explicitly
stale/deferred while durable publication still omits the two expected active
nodes. The next package task is the representative `rolling-restart
--fast-local` rerun after this replay probe to see whether the blocker stays
on deferred repair plus publication missing-active-node debt or migrates.

Validation:

1. `node --check test/distributed/harness/publication-evidence-replay.js`
2. `node --check test/distributed/harness/__tests__/publication-evidence-replay.test.js`
3. `node --test --test-name-pattern "keeps the 114859Z owner-RPC cache-repair replay blocked" test/distributed/harness/__tests__/publication-evidence-replay.test.js`
4. `node --test test/distributed/harness/__tests__/publication-evidence-replay.test.js`
5. `node test/distributed/harness/publication-evidence-replay.js test-output/reports/.playback/rolling-restart-after-deferred-snapshot-observation-20260505T114859Z/rolling-restart`
   passed and now prints `selectedSnapshotObservation`, `ownerRpcCacheRepair`,
   and `supportingPriorityRecoveryWitness` sections alongside the existing
   `replayed_blocked` comparison.
6. `npx eslint test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
7. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` decision-boundary guideline violations.
8. `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` runtime-grammar-contract violations.
9. `node scripts/check-guideline-boundary-mode-contracts.js test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` boundary-mode-contract hotspot violations.
10. `node scripts/check-guideline-literals.js test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
    reported `0` new literal-guideline violations.
11. `git diff --check`

Inherited / unchanged:

1. `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   remains red with `2` test-inclusive literal-guideline findings in
   `publication-evidence-replay.test.js`. The same command reported `2`
   before this slice, so the fixture did not increase test-inclusive literal
   debt.

## May 5 Owner-RPC/Cache-Repair Probe Rerun

The representative gate after the replay probe was:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-owner-rpc-cache-repair-probe-20260505T123850Z.report.json --fast-local --verbose`
2. Report:
   `test-output/reports/rolling-restart-after-owner-rpc-cache-repair-probe-20260505T123850Z.report.json`
3. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-owner-rpc-cache-repair-probe-20260505T123850Z/rolling-restart/`
4. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-owner-rpc-cache-repair-probe-20260505T123850Z/rolling-restart/failure-bundle.json`
5. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-owner-rpc-cache-repair-probe-20260505T123850Z/rolling-restart/triage-summary.md`
6. Result: failed, `0/1` passed after `132.1s`.

Outcome: the blocker did not close. It migrated from the previous
`PUBLISHED` deferred-repair plus publication missing-active-node boundary to an
`ACK_PENDING` startup active-gate boundary.

Evidence:

1. Triage reports root cause class `startup`, dominant reason
   `BOOTSTRAP_PHASE_INCOMPLETE`, failure class
   `publication_convergence_blocked`, and readiness failure
   `snapshot_reachability_timeout`.
2. Publication epoch `3` is `ACK_PENDING`; recovery protocol state is
   `publication_pending`; pending ACK count is `1`; pending ACK node is
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
3. Publication convergence gate reasons are
   `priority_partitions_not_spread`, `publication_epoch_pending`, and
   `snapshot_coverage=2/5`.
4. Terminal active-gate progress is active `3/5`, inactive `2`, selected
   snapshot coverage `2/5`, selected published active `3/5`, selected missing
   published count `2`, and priority spread gap `2`.
5. Selected terminal snapshot witness
   `11601fe0-72d6-5853-8590-ec2881853e72` is not admin-ready and carries
   `Control snapshot reachability probe timed out for
   11601fe0-72d6-5853-8590-ec2881853e72`; best progress had the same selected
   node reachable through `admin_health`.
6. Selected snapshot observation remains `repair_deferred` / `stale_usable`
   with contract state `pending`, refresh state `idle`, next action `wait`,
   repair deferred `true`, and reason codes `cache_stale_watermark` and
   `discovery_node_coverage_gap`.
7. Active-gate selected missing published nodes are
   `8be8d30f-4499-5eed-865c-71b4d529a67a` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`; triage's top-level publication
   convergence summary reports missing published count `0`, so the next trace
   must keep those two evidence surfaces separate.
8. Priority recovery has two unresolved witnesses: `sql_transaction_participants-p1`
   as `needs_operation` / `eligible_but_no_operation_created` owned by
   `rebalancer_leader` at `operation_scheduling`, and
   `sql_write_operations-p1` as `operation_stalled` /
   `operation_created_but_no_step_transitions` owned by
   `operation_workflow_owner` at `workflow_timeout`.
9. The `sql_write_operations-p1` operation is
   `df4f18e8-6b08-46b5-ba02-c770936ede32`, latest workflow step `PENDING`,
   latest status `pending`, step age `77931ms` against timeout `30000ms`, wait
   mode `timeout_reconcile_due`, and next required action
   `reconcile_stale_operation_progress`.

Trace validation:

1. `node test/distributed/harness/publication-evidence-replay.js test-output/reports/.playback/rolling-restart-after-owner-rpc-cache-repair-probe-20260505T123850Z/rolling-restart`
   passed and reported `driftClassification=replayed_blocked`, row counts
   `nodes=3`, `nodeEndpoints=0`, `partitions=33`, and `services=102`.
2. Replay printed selected snapshot observation
   `repair_deferred` / `stale_usable`, owner-RPC/cache-repair
   `deferralState=repair_deferred`, one matching `nodes` deferral through
   `owner_rpc_lane` / `control_plane_backpressure`, and supporting priority
   recovery witness `sql_transaction_participants-p1` at
   `operation_scheduling`.
3. `git diff --check` passed for the documentation update.

Conclusion: this was a migrated runtime boundary, not a closure. The follow-up
trace below records the `20260505T123850Z` ACK-pending publication, selected
snapshot reachability timeout, and split priority-recovery witnesses before any
runtime change.

## May 5 123850Z ACK-Pending Publication And Recovery Trace

The trace task completed with bounded artifact inspection, replay CLI output,
focused `jq` extraction, log searches, and code-owner reads. No broad
distributed scenario was rerun and no runtime files were changed.

Evidence:

1. The report, failure bundle, failure-bundle markdown, and triage summary all
   point at the same terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`. The failure class is
   `publication_convergence_blocked`, root cause class is `startup`, dominant
   reason is `BOOTSTRAP_PHASE_INCOMPLETE`, and readiness failure is
   `snapshot_reachability_timeout` from `selectedSnapshotReachabilityError`.
2. The selected publication row is epoch `3` / `ACK_PENDING`. Its selected
   publication recovery gate is `ack_pending`, with required ACK nodes
   `11601fe0-72d6-5853-8590-ec2881853e72`,
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and
   `7493b0ab-a054-5fad-a91b-5e331db29304`; acknowledged nodes
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `7493b0ab-a054-5fad-a91b-5e331db29304`; pending ACK node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`; and
   `pendingAckEvidenceState=required_ack_node_list`.
3. The selected row-local missing-published recovery-active list is empty:
   published-active, recovery-active, and concrete-eligible membership are all
   the three-node set
   `11601fe0-72d6-5853-8590-ec2881853e72`,
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and
   `7493b0ab-a054-5fad-a91b-5e331db29304`. The active-gate selected
   expected-node surface separately reports missing published nodes
   `8be8d30f-4499-5eed-865c-71b4d529a67a` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` because the harness still expects
   five nodes while the selected durable publication contains three.
4. The top-level stability gates therefore stay open on pending ACK and
   startup readiness, not on top-level missing-published row debt: failover is
   open on `pending_ack_nodes|startup_readiness_blocked`; convergence and
   restart recovery are open on
   `pending_ack_nodes|priority_spread_pending|startup_readiness_blocked`.
5. Terminal active-gate progress is active `3/5`, inactive `2`, selected
   snapshot coverage `2/5`, selected published active `3/5`, pending ACK
   count `1`, selected missing-published count `2`, priority spread gap `2`,
   and blocker signature
   `inactive_nodes=2|snapshot_coverage=2/5|priority_recovery_progress_class=eligible_but_no_operation_created|priority_recovery_progress_class=operation_created_but_no_step_transitions`.
6. Best progress did not improve active count or coverage. It was still
   active `3/5` and selected coverage `2/5`, with the same selected node
   `11601fe0-72d6-5853-8590-ec2881853e72`, but that node was then reachable
   through `admin_health`. Terminal progress later selected the same node with
   `adminReady=false` and
   `Control snapshot reachability probe timed out for
   11601fe0-72d6-5853-8590-ec2881853e72`.
7. Probe witnesses explain the selected coverage. The seed
   `7493b0ab-a054-5fad-a91b-5e331db29304`,
   `11601fe0-72d6-5853-8590-ec2881853e72`, and
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` each returned a snapshot with
   observed `2/5` and reachability timeout. The remaining expected nodes
   `8be8d30f-4499-5eed-865c-71b4d529a67a` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` were reachable only by
   `bootstrap_health`; their admin snapshot queries failed with
   `ECONNREFUSED`.
8. The selected witness remains explicitly stale/deferred owner-contract
   evidence: `selectedSnapshotObservationMode=repair_deferred`,
   `selectedSnapshotObservationState=stale_usable`, contract state `pending`,
   refresh state `idle`, next action `wait`, repair deferred `true`, and reason
   codes `cache_stale_watermark` and `discovery_node_coverage_gap`.
9. `test/distributed/harness/cluster-segment-7-class-5.js` owns the selected
   coverage extraction and records the snapshot query, reachability,
   publication gate, and snapshot observation fields.
   `test/distributed/harness/cluster-segment-2.js` owns
   `buildActiveWaitProgressSnapshot(...)`, where selected publication,
   pending ACK, missing-published, reachability, and priority-recovery classes
   are normalized into one active-gate progress snapshot.
10. `test/distributed/harness/startup-readiness-evidence.js` owns the startup
    readiness delay contract. In startup mode, the timeout-shaped
    `selectedSnapshotReachabilityError` maps to terminal
    `snapshot_reachability_timeout`; it is not treated as a recoverable
    load-mode delay.
11. `src/control-plane/recovery-protocol-snapshot.js` and
    `src/control-plane/publication-recovery-gate.js` own the runtime
    publication recovery gate. The `ACK_PENDING` row remains active because
    pending ACK count is greater than zero, while priority spread remains open
    from the closure witness on
    `sql_transaction_participants-p1` and `sql_write_operations-p1`.
12. Priority recovery is split in the canonical failure bundle and report:
    `sql_transaction_participants-p1` is `needs_operation` /
    `eligible_but_no_operation_created` with planner ready distinct
    `1/2`, spread gap `1`, no active operation, owner
    `rebalancer_leader`, blocking boundary `operation_scheduling`, wait mode
    `event_driven`, and next required action `create_recovery_operation`.
13. `sql_write_operations-p1` is `operation_stalled` /
    `operation_created_but_no_step_transitions`, with cache-visible operation
    `df4f18e8-6b08-46b5-ba02-c770936ede32`. The operation is a `REPLACE` for
    `sql_write_operations-p1-r4` from
    `7493b0ab-a054-5fad-a91b-5e331db29304` to the selected snapshot node
    `11601fe0-72d6-5853-8590-ec2881853e72`; latest workflow step `PENDING`,
    status `pending`, target visibility `absent`, no timeline transitions,
    step age `77931ms` against timeout `30000ms`,
    `timeoutReconcileDue=true`, owner `operation_workflow_owner`, boundary
    `workflow_timeout`, wait mode `timeout_reconcile_due`, and next action
    `reconcile_stale_operation_progress`.
14. `src/control-plane/priority-recovery-snapshot.js` owns both witness
    shapes. `buildPriorityRecoveryDecisionSnapshots(...)` constructs the
    partition and operation contexts; `buildPriorityRecoveryPartitionAssessment(...)`
    emits `eligible_but_no_operation_created` when a spread gap has eligible
    placement but no active/completed operation, and emits
    `operation_created_but_no_step_transitions` when an active blocking
    operation has no owned transitions past its timeout. The in-flight progress
    contract maps timeout-due workflow-owned work to
    `operation_workflow_owner` / `workflow_timeout` /
    `reconcile_stale_operation_progress`.
15. Replay validation preserved the row shape and confirmed this was not a
    closed publication path. The command
    `node test/distributed/harness/publication-evidence-replay.js
    test-output/reports/.playback/rolling-restart-after-owner-rpc-cache-repair-probe-20260505T123850Z/rolling-restart`
    passed with row counts `nodes=3`, `nodeEndpoints=0`, `partitions=33`,
    `services=102`, durable and replayed epoch `3` / `ACK_PENDING`,
    `recoveryProtocolState=publication_pending`, and
    `driftClassification=replayed_blocked`.
16. Replay also preserved selected snapshot observation
    `repair_deferred` / `stale_usable` and reported one owner-RPC/cache-repair
    deferral on table `nodes`, through `owner_rpc_lane` /
    `control_plane_backpressure`, on
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`. The replay helper's single
    `supportingPriorityRecoveryWitness` selected
    `sql_transaction_participants-p1`; the complete report and failure bundle
    still carry both split witnesses, including the `sql_write_operations-p1`
    workflow timeout.
17. Log evidence matches the replay pressure shape. The
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` log has repeated
    authoritative discovery cache-repair failures on `nodes` through
    `owner_rpc_lane` / `control_plane_backpressure`, ending with retry after
    `32000ms`. The selected node
    `11601fe0-72d6-5853-8590-ec2881853e72` has an authoritative discovery
    cache-repair failure on `services` through
    `query_timeout|control_plane_backpressure`, an in-flight operation owner
    query pressure warning, orphan reservation release for operation
    `df4f18e8-6b08-46b5-ba02-c770936ede32`, and
    `control_plane_publications-p1` source-removal deferral while publication
    remains `ACK_PENDING`.
18. `test/distributed/harness/publication-evidence-replay.js` owns the bounded
    replay proof and now prints `selectedSnapshotObservation`,
    `ownerRpcCacheRepair`, and a supporting priority-recovery witness. It is
    useful validation, but it is not the complete priority witness set for this
    artifact.

Conclusion: the `123850Z` trace is complete and the package is not done. The
current runtime boundary is ACK-pending startup active-gate convergence with
terminal selected-snapshot reachability timeout and selected coverage `2/5`.
The priority-recovery evidence is subordinate but actionable: the next smallest
fixture/probe should focus on the current `sql_write_operations-p1`
workflow-timeout operation and prove whether the operation workflow owner
drives `reconcile_stale_operation_progress` while publication is still
`ACK_PENDING`, preserving the `sql_transaction_participants-p1`
operation-scheduling witness as separate pressure evidence.

## May 5 ACK-Pending Operation-Workflow Timeout Fixture

The next package task added a focused replay fixture without a distributed
scenario rerun:

1. `test/distributed/harness/publication-evidence-replay.js` now preserves the
   full `priorityRecoveryWitnesses` array in replay output while retaining the
   existing `supportingPriorityRecoveryWitness` compatibility field. It also
   carries `selectedSnapshotReachabilityError` through selected snapshot
   observation evidence.
2. `test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   adds `keeps the 123850Z ACK-pending workflow-timeout replay blocked`.
   The fixture pins publication epoch `3` / `ACK_PENDING`, pending ACK node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, selected terminal snapshot node
   `11601fe0-72d6-5853-8590-ec2881853e72`, selected reachability timeout,
   selected snapshot observation `repair_deferred` / `stale_usable`, selected
   coverage `2/5`, row counts `nodes=3`, `nodeEndpoints=0`, `partitions=33`,
   and `services=102`.
3. The fixture preserves both split priority-recovery witnesses:
   `sql_transaction_participants-p1` remains `needs_operation` at
   `rebalancer_leader / operation_scheduling / event_driven` with next action
   `create_recovery_operation`, while `sql_write_operations-p1` operation
   `df4f18e8-6b08-46b5-ba02-c770936ede32` remains `operation_stalled` at
   `operation_workflow_owner / workflow_timeout / timeout_reconcile_due` with
   next action `reconcile_stale_operation_progress`, step age `77931ms`, and
   step timeout `30000ms`.
4. Replay of the real `123850Z` playback now prints both witnesses. The single
   supporting witness is still the scheduling witness, while the workflow
   timeout witness is retained as subordinate operation-owner evidence.
5. Outcome: the operation workflow timeout is not the canonical top-level
   boundary while publication remains `ACK_PENDING` with pending ACK,
   selected reachability timeout, and selected coverage `2/5`. It is preserved
   as the candidate next runtime owner boundary once ACK/startup publication
   debt closes; the existing publication-closed priority-actuation regression
   still covers that later classification path.

Validation:

1. Red-first:
   `node --test --test-name-pattern "keeps the 123850Z ACK-pending workflow-timeout replay blocked" test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   failed before the replay helper exposed `priorityRecoveryWitnesses`.
2. `node --check test/distributed/harness/publication-evidence-replay.js`
3. `node --check test/distributed/harness/__tests__/publication-evidence-replay.test.js`
4. `node --test --test-name-pattern "keeps the 123850Z ACK-pending workflow-timeout replay blocked" test/distributed/harness/__tests__/publication-evidence-replay.test.js`
5. `node --test test/distributed/harness/__tests__/publication-evidence-replay.test.js`
6. `node test/distributed/harness/publication-evidence-replay.js test-output/reports/.playback/rolling-restart-after-owner-rpc-cache-repair-probe-20260505T123850Z/rolling-restart`
   passed and printed `priorityRecoveryWitnesses` for both
   `sql_transaction_participants-p1` and `sql_write_operations-p1`.
7. `npx eslint test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
8. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` decision-boundary guideline violations.
9. `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` runtime-grammar-contract violations.
10. `node scripts/check-guideline-boundary-mode-contracts.js test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
    reported `0` boundary-mode-contract hotspot violations.
11. `node scripts/check-guideline-literals.js test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
    reported `0` new and `0` inherited literal-guideline violations.
12. `node scripts/check-guideline-literals.js --include-tests test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
    reported `0` new and `0` inherited literal-guideline violations after the
    moved suite/test strings were assigned named constants.

## May 5 Representative Rerun After ACK-Pending Workflow Fixture

The representative gate after the focused ACK-pending operation-workflow
timeout fixture was:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z.report.json --fast-local --verbose`
2. Report:
   `test-output/reports/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z.report.json`
3. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z/rolling-restart/`
4. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z/rolling-restart/failure-bundle.json`
5. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z/rolling-restart/triage-summary.md`
6. Result: failed, `0/1` passed after `131.2s`; the command exited `1`.

Outcome: ACK-pending startup debt closed, but the gate did not pass and the
old `sql_write_operations-p1` workflow timeout did not become canonical. The
representative path migrated again to a post-ACK `PUBLISHED` missing-active
publication and selected-snapshot coverage boundary.

Evidence:

1. Triage reports root cause class `topology`, dominant reason
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`,
   failure class `publication_convergence_blocked`, and terminal readiness
   failure `snapshot_reachability_timeout`.
2. Publication epoch `3` is `PUBLISHED`; recovery protocol state is
   `steady_published`; pending ACK count is `0`; missing published count is
   `2`; missing published nodes are
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`.
3. Publication gate reasons are `snapshot_coverage=3/5`,
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`,
   and `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`.
4. Terminal active-gate progress is active `5/5`, inactive `0`, selected
   snapshot coverage `3/5`, selected published active `3/5`, pending ACK `0`,
   priority spread ready with gap `0`, owner queue pending writes `9`, and
   readiness delay `snapshot_reachability_timeout` from the selected witness
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
5. Best progress was active `5/5` with selected coverage `4/5`; selected
   witness `11601fe0-72d6-5853-8590-ec2881853e72` was reachable through
   `admin_health`; priority spread was still open with gap `10`; the blocker
   signature was `snapshot_coverage=4/5` plus
   `priority_recovery_progress_class=operation_created_but_no_step_transitions`.
6. Terminal probe witnesses explain the selected `3/5` coverage:
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` returned the selected epoch `3`
   snapshot with observed `3/5`, `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`
   returned an admin-ready stale epoch `1` snapshot with observed `1/5`, and
   the seed plus `11601fe0-72d6-5853-8590-ec2881853e72` and
   `8be8d30f-4499-5eed-865c-71b4d529a67a` timed out during snapshot
   reachability or query.
7. The selected snapshot observation remains `repair_deferred` /
   `stale_usable` with contract state `pending`, refresh state `idle`, next
   action `wait`, repair deferred `true`, and reason codes
   `cache_stale_watermark` and `discovery_node_coverage_gap`.
8. Terminal priority recovery is subordinate workflow-progress evidence, not a
   workflow-timeout promotion. `control_plane_publications-p1` and
   `sql_write_operations-p1` are both `spread_satisfied_in_flight` at
   `operation_workflow_owner` / `workflow_progress` / `event_driven`, next
   action `wait_for_operation_progress`; `control_plane_publications-p1`
   operation `d762a1d8-0271-481a-a170-25e63cb80694` is at latest step
   `ACTIVE` / status `active`, and `sql_write_operations-p1` operation
   `df7c307a-2e59-4ec4-8c2a-55cd39b2d87e` is at latest step `STOPPING` /
   status `removing`.
9. Stability gates `failover`, `convergence`, and `restart_recovery` remain
   open on `publication_missing_active_node`; pending ACK and blocked-node
   counts are `0`.
10. Log evidence keeps owner-RPC/cache-repair pressure visible: nodes
    `11601fe0-72d6-5853-8590-ec2881853e72` and
    `8be8d30f-4499-5eed-865c-71b4d529a67a` report `nodes` repair failures
    through `owner_rpc_lane` / `control_plane_backpressure`, while selected
    witness `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` reports `nodes` repair
    failure through `query_timeout|control_plane_backpressure`.

Replay validation:

1. `node test/distributed/harness/publication-evidence-replay.js test-output/reports/.playback/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z/rolling-restart`
   passed.
2. Replay reported row counts `nodes=3`, `nodeEndpoints=0`, `partitions=33`,
   and `services=104`.
3. Durable replay input is epoch `3` / `PUBLISHED` with priority spread
   satisfied. The replayed candidate remains epoch `3` / `PUBLISHED` with
   `recoveryProtocolState=priority_spread_pending`,
   `priorityRecoveryReasonCodes=["priority_partitions_not_spread"]`, all five
   priority partitions blocked at spread gap `1`, and
   `driftClassification=replayed_blocked`.
4. Replay preserved selected snapshot observation `repair_deferred` /
   `stale_usable`, selected snapshot reachability timeout on
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, matching owner-RPC/cache-repair
   deferral count `2`, selected witness deferral count `0`, and both
   subordinate priority-recovery workflow-progress witnesses.

Validation:

1. `git diff --check` passed for this documentation-only update.

Conclusion: the representative rerun task is recorded and complete, but the
package is not done. The follow-up trace below closes the post-ACK
`PUBLISHED` missing-active selected-snapshot trace task and names the next
smallest focused replay fixture/probe.

## May 5 132033Z Post-ACK Published Selected-Snapshot Trace

The trace task completed with bounded artifact inspection, the replay CLI,
focused `jq` extraction, targeted log searches, and code-owner reads. No broad
distributed scenario was rerun and no runtime files were changed.

Artifact paths:

1. Report:
   `test-output/reports/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z/rolling-restart/`.
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z/rolling-restart/failure-bundle.json`.
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z/rolling-restart/triage-summary.md`.
5. Timeline:
   `test-output/reports/.playback/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z/rolling-restart/_timeline.log`.

Evidence:

1. The report, failure bundle, failure-bundle markdown, and triage summary all
   agree on the terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`. The failure class is
   `publication_convergence_blocked`, root cause class is `topology`, and the
   dominant reason is
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`.
2. Publication epoch `3` is `PUBLISHED`, recovery protocol state is
   `steady_published`, `publicationPending=true`, pending ACK count is `0`,
   missing published count is `2`, and the missing published nodes are
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`.
3. Publication gate reasons are exactly `snapshot_coverage=3/5`,
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`,
   and `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`.
   Priority spread is not pending, blocked partition count is `0`, and
   unresolved priority-recovery count is `0`.
4. Terminal active-gate progress is active `5/5`, inactive `0`, selected
   snapshot coverage `3/5`, publication epoch `3` `PUBLISHED`, selected
   published active `3/5`, pending ACK `0`, missing published `2`, priority
   spread ready with gap `0`, owner queue pending writes `9`, and blocker
   signature `snapshot_coverage=3/5`.
5. Terminal selected witness
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` returned a snapshot but was not
   admin-ready and failed reachability with a control-snapshot probe timeout
   naming `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`. Startup readiness
   classification maps that selected-snapshot reachability error to
   `snapshot_reachability_timeout`, recoverability `terminal`, terminal
   reason `stalled_no_progress`, attempts since progress `5`.
6. Best progress had already reached active `5/5`, but with selected coverage
   `4/5` from witness `11601fe0-72d6-5853-8590-ec2881853e72`, reachable
   through `admin_health`. At that point priority spread was still pending
   with gap `10` and the blocker signature was `snapshot_coverage=4/5` plus
   `priority_recovery_progress_class=operation_created_but_no_step_transitions`.
7. Terminal probe witnesses explain the selected coverage drop:
   the seed `7493b0ab-a054-5fad-a91b-5e331db29304`,
   `11601fe0-72d6-5853-8590-ec2881853e72`, and
   `8be8d30f-4499-5eed-865c-71b4d529a67a` all timed out for snapshot query /
   reachability and observed `0/5`; `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`
   was admin-ready but stale at epoch `1`, observed `1/5`, and was missing
   four expected nodes; selected witness
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` was the best terminal witness,
   epoch `3` `PUBLISHED`, observed `3/5`, and still missed
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`.
8. The selected witness is internally steady for the three published nodes:
   its selected publication convergence gate is `ready`, pending ACK `0`,
   required ACK count `3`, acknowledged count `3`, missing published count
   `0`, and priority spread satisfied. The active-gate expected-node surface
   keeps the blocker open because the expected cluster is five nodes while the
   selected durable publication contains only the three published-active nodes.
9. Selected snapshot observation remains explicit owner-contract evidence:
   mode `repair_deferred`, state `stale_usable`, contract state `pending`,
   refresh state `idle`, next action `wait`, repair deferred `true`, and
   reason codes `cache_stale_watermark` and `discovery_node_coverage_gap`.
10. `test/distributed/harness/cluster-segment-7-class-5.js` owns the selected
    coverage and observation extraction through `_probeControlSnapshotCoverage(...)`.
    It records snapshot query success/failure, reachability, selected
    observation fields, selected publication evidence, and `probeWitnesses`.
11. `test/distributed/harness/cluster-segment-2.js` owns
    `buildActiveWaitProgressSnapshot(...)`, where selected snapshot coverage,
    selected missing-published node ids, pending ACK count,
    selected-snapshot reachability error, and priority-recovery classes are
    normalized into one active-gate progress snapshot.
12. `test/distributed/harness/startup-readiness-evidence.js` owns the startup
    readiness delay classification. In startup mode, the timeout-shaped
    selected reachability error is terminal rather than a recoverable
    load-mode delay.
13. Replay validation passed with row counts `nodes=3`, `nodeEndpoints=0`,
    `partitions=33`, and `services=104`. Durable replay input is epoch `3` /
    `PUBLISHED` with priority spread satisfied; replay reconstruction remains
    epoch `3` / `PUBLISHED` but `recoveryProtocolState=priority_spread_pending`,
    `priorityRecoveryReasonCodes=["priority_partitions_not_spread"]`, all five
    priority partitions blocked at spread gap `1`, and
    `driftClassification=replayed_blocked`.
14. Replay preserved selected snapshot observation `repair_deferred` /
    `stale_usable`, selected snapshot reachability timeout on
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, and owner-RPC/cache-repair
    deferral on table `nodes`: matching deferral count `2`, selected witness
    deferral count `0`, latest retry-after `16000ms`, nodes
    `11601fe0-72d6-5853-8590-ec2881853e72` and
    `8be8d30f-4499-5eed-865c-71b4d529a67a`, read source `owner_rpc_lane`,
    cause chain `control_plane_backpressure`, failure class
    `pressure_or_timeout`.
15. Raw timeline/log searches add supporting pressure beyond the replay
    failure-bundle excerpt: the selected witness
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` also logged a `nodes` repair
    failure through `owner_rpc_lane` with
    `query_timeout|control_plane_backpressure` and retry-after `32000ms`,
    while the two missing published nodes each logged `nodes` repair failures
    through `owner_rpc_lane` / `control_plane_backpressure` ending at
    retry-after `16000ms`.
16. `test/distributed/harness/publication-evidence-replay.js` owns the
    bounded replay proof. It summarizes selected snapshot observation,
    owner-RPC/cache-repair deferrals from failure-bundle log excerpts, and the
    full `priorityRecoveryWitnesses` array.
17. Terminal priority recovery is subordinate workflow-progress evidence, not
    a promoted workflow-timeout blocker. `control_plane_publications-p1` and
    `sql_write_operations-p1` are both `spread_satisfied_in_flight` at
    `operation_workflow_owner` / `workflow_progress` / `event_driven`, next
    action `wait_for_operation_progress`, actuation
    `dispatched_waiting_progress`, workflow phase `source_removal`, pressure
    `write_backlog`, pending writes `9`, and no progress class ids.
18. The `control_plane_publications-p1` witness is operation
    `d762a1d8-0271-481a-a170-25e63cb80694`, latest workflow step `ACTIVE`,
    latest status `active`, step age `44102ms`, step timeout `0`, and last
    progress at `1777987332493`. Logs show it moved `CREATING -> ACTIVE` and
    then repeatedly deferred source removal under
    `replace_remove_safety_blocked` while publication was still `OPEN`.
19. The `sql_write_operations-p1` witness is operation
    `df7c307a-2e59-4ec4-8c2a-55cd39b2d87e`, latest workflow step `STOPPING`,
    latest status `removing`, step age `11170ms` against timeout `60000ms`,
    and last progress at `1777987365425`. Logs show
    `SENDING -> CREATING -> ACTIVE -> STOPPING`, replica creation completion,
    and authoritative-visibility warnings, so this is workflow progress rather
    than the prior timeout shape.
20. `src/control-plane/priority-recovery-snapshot.js` owns the runtime
    decision snapshots through `buildPriorityRecoveryDecisionSnapshots(...)`
    and `buildPriorityRecoveryPartitionAssessment(...)`.
    `test/distributed/harness/priority-recovery-summary-normalization.js`
    preserves the witness owner, boundary, wait mode, next action, workflow
    phase, age, timeout, pressure, and pending write fields used by the failure
    bundle and triage summary.

Trace validation:

1. `node test/distributed/harness/publication-evidence-replay.js test-output/reports/.playback/rolling-restart-after-ack-pending-workflow-timeout-probe-20260505T132033Z/rolling-restart`
   passed and printed the selected snapshot observation, owner-RPC/cache-repair
   deferral summary, both priority-recovery workflow-progress witnesses, and
   `driftClassification=replayed_blocked`.
2. `git diff --check` passed for this documentation-only update.

Conclusion: ACK-pending startup debt is closed and the prior
`sql_write_operations-p1` workflow timeout did not promote. The current
runtime owner boundary is post-ACK `PUBLISHED` selected-snapshot coverage and
missing-active publication debt: all five expected nodes are active at the
startup gate, but the selected terminal epoch `3` snapshot is only `3/5`, its
publication membership is the same three-node cohort, owner-RPC repair is
deferred on `nodes`, and selected reachability times out. Priority recovery is
supporting pressure only. The follow-up fixture below locks this exact
`132033Z` shape before the next representative rerun.

## May 5 132033Z Post-ACK Published Replay Fixture

The next package task added a focused replay fixture in
`test/distributed/harness/__tests__/publication-evidence-replay.test.js`:
`keeps the 132033Z post-ACK PUBLISHED selected-snapshot replay blocked`.

The fixture preserves the current post-ACK owner shape without running a broad
distributed scenario:

1. Terminal active-gate progress remains active `5/5`, inactive `0`, selected
   snapshot coverage `3/5`, publication epoch `3` `PUBLISHED`, recovery
   protocol state `steady_published`, pending ACK count `0`, priority spread
   ready with gap `0`, and publication gate reasons
   `snapshot_coverage=3/5`,
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`,
   and
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`.
2. The selected terminal witness is
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, admin not ready, with
   `selectedSnapshotReachabilityError` carrying the snapshot reachability
   timeout. Its selected observation remains `repair_deferred` /
   `stale_usable`, contract state `pending`, refresh state `idle`, next action
   `wait`, repair deferred `true`, and reason codes
   `cache_stale_watermark` and `discovery_node_coverage_gap`.
3. The synthetic replay rows match the artifact row shape:
   `nodes=3`, `nodeEndpoints=0`, `partitions=33`, `services=104`, and the
   replayed candidate remains epoch `3` / `PUBLISHED` but
   `priority_spread_pending`, with
   `priorityRecoveryReasonCodes=["priority_partitions_not_spread"]`, all five
   priority partitions blocked at spread gap `1`, and
   `driftClassification=replayed_blocked`.
4. Owner-RPC/cache-repair evidence is preserved from failure-bundle log
   excerpts: `nodes` repair defers through `owner_rpc_lane` /
   `control_plane_backpressure`, matching deferral count is `2`, selected
   witness deferral count is `0`, latest retry-after is `16000ms`, and the
   deferral nodes are `11601fe0-72d6-5853-8590-ec2881853e72` and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`.
5. Subordinate priority-recovery witnesses stay
   `spread_satisfied_in_flight` workflow-progress evidence. The fixture keeps
   `control_plane_publications-p1` operation
   `d762a1d8-0271-481a-a170-25e63cb80694` at `ACTIVE` / `active`, and
   `sql_write_operations-p1` operation
   `df7c307a-2e59-4ec4-8c2a-55cd39b2d87e` at `STOPPING` / `removing`, both
   under `operation_workflow_owner` / `workflow_progress` / `event_driven`,
   next action `wait_for_operation_progress`.

Outcome: the fixture proves the replay owner surface keeps the current
post-ACK `PUBLISHED` selected-snapshot / owner-RPC-cache-repair boundary
blocked, with priority recovery preserved as supporting workflow-progress
pressure rather than a promoted workflow-timeout blocker. The package remains
active; the next unchecked task is the representative
`rolling-restart --fast-local` rerun after this fixture.

Validation:

1. `node --check test/distributed/harness/__tests__/publication-evidence-replay.test.js`
2. `node --check test/distributed/harness/publication-evidence-replay.js`
3. `node --test --test-name-pattern "keeps the 132033Z post-ACK PUBLISHED selected-snapshot replay blocked" test/distributed/harness/__tests__/publication-evidence-replay.test.js`
4. `node --test test/distributed/harness/__tests__/publication-evidence-replay.test.js`
5. `node scripts/check-guideline-literals.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` new and `0` inherited literal-guideline violations.
6. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` decision-boundary guideline violations.
7. `node scripts/check-guideline-boundary-mode-contracts.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` boundary-mode-contract hotspot violations.
8. `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   reported `0` runtime-grammar-contract violations.
9. `git diff --check`
   passed.

## May 5 Representative Rerun After 132033Z Replay Fixture

The representative gate after the focused `132033Z` replay fixture was:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z.report.json --fast-local --verbose`
2. Report:
   `test-output/reports/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z.report.json`
3. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z/rolling-restart/`
4. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z/rolling-restart/failure-bundle.json`
5. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z/rolling-restart/triage-summary.md`
6. Result: failed, `0/1` passed after `130.3s`; the command exited `1`.

Outcome: the blocker did not close and did not stay on the post-ACK
`PUBLISHED` selected-snapshot / owner-RPC-cache-repair boundary. It migrated
to a fresh epoch `5` `OPEN` publication-pending boundary with pending ACK
debt, selected snapshot coverage `3/5`, priority spread pending, and
operation-workflow timeout / serial-wait evidence.

Evidence:

1. Triage reports root cause class `topology`, dominant reason
   `publication_epoch_pending`, failure class
   `publication_convergence_blocked`, and readiness failure
   `no_progress_terminal` with terminal reason `stalled_no_progress`.
2. Publication epoch `5` is `OPEN`, recovery protocol state is
   `publication_pending`, pending ACK count is `2`, pending ACK nodes are
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, published active is `5/5`, and
   missing published count is `0`.
3. Publication gate reasons are `priority_partitions_not_spread`,
   `publication_epoch_pending`, and `snapshot_coverage=3/5`; stability gates
   `failover`, `convergence`, and `restart_recovery` remain open on
   `pending_ack_nodes`, `priority_spread_pending`, and
   `startup_readiness_blocked` as applicable.
4. Terminal active-gate progress is active `5/5`, inactive `0`, selected
   snapshot coverage `3/5`, selected witness
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, admin-ready and reachable through
   `admin_health`, selected published active `5/5`, pending ACK `2`, missing
   published `0`, priority spread pending with gap `7`, and blockers
   `snapshot_coverage=3/5` plus
   `priority_recovery_progress_class=priority_operation_serial_wait`.
5. Best progress in the same run was active `5/5`, selected coverage `4/5`,
   selected witness `11601fe0-72d6-5853-8590-ec2881853e72` reachable through
   `admin_health`, publication epoch `5` `OPEN`, pending ACK `2`, selected
   published active `3/5`, selected missing published nodes
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, priority spread gap `7`, and the
   same `priority_operation_serial_wait` blocker.
6. Last meaningful progress still captured an epoch `3` `PUBLISHED` shape
   with pending ACK `0`, selected coverage `4/5`, missing published nodes
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, priority spread gap `10`, and
   `priority_recovery_progress_class=operation_created_but_no_step_transitions`;
   terminal evidence moved forward to epoch `5` `OPEN`.
7. Probe witnesses explain terminal coverage: the selected
   `8be8d30f-4499-5eed-865c-71b4d529a67a` witness observed `3/5` from an
   `OPEN` publication and was admin-ready; the seed observed `3/5` but timed
   out for reachability; `11601fe0-72d6-5853-8590-ec2881853e72` and
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` were admin-ready `3/5`
   `PUBLISHED` witnesses; `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` was an
   admin-ready `1/5` `PUBLISHED` witness.
8. Selected snapshot observation remains `repair_deferred` / `stale_usable`,
   contract state `pending`, refresh state `idle`, next action `wait`, repair
   deferred `true`, and reason codes `cache_stale_watermark`,
   `discovery_node_coverage_gap`, and `stale_replica_operations_in_flight`.
9. Priority recovery now has two explicit unresolved witnesses:
   `sql_transactions-p1` is `recovering_in_flight` on operation
   `0c78d9d7-3672-490e-87af-3b9acebd5801`, latest step `SENDING`, latest
   status `pending`, boundary `workflow_timeout`, wait mode
   `timeout_reconcile_due`, and next action
   `reconcile_stale_operation_progress`; `sql_write_operations-p1` is
   `needs_operation` with `priority_operation_serial_wait`, `operation_unknown`,
   boundary `workflow_progress`, wait mode `event_driven`, next action
   `wait_for_operation_progress`, and serial-wait dependency on
   `sql_transactions-p1`.
10. Replay validation passed and stayed `replayed_blocked` with row counts
    `nodes=5`, `nodeEndpoints=0`, `partitions=33`, and `services=102`.
    Durable and replayed evidence both remain epoch `5` / `OPEN` with priority
    spread pending; replayed recovery protocol state is `publication_pending`
    with reason codes `priority_partitions_not_spread` and
    `publication_epoch_pending`.
11. Replay preserved owner-RPC/cache-repair deferral on `nodes`: matching
    deferral count `2`, selected witness deferral count `1`, latest
    retry-after `16000ms`, deferral nodes
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` and
    `8be8d30f-4499-5eed-865c-71b4d529a67a`, read source `owner_rpc_lane`,
    cause chain `control_plane_backpressure` / `query_timeout`, and failure
    class `pressure_or_timeout`.

Replay validation:

1. `node test/distributed/harness/publication-evidence-replay.js test-output/reports/.playback/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z/rolling-restart`
   passed.

Validation:

1. `git diff --check` passed for this documentation-only update.

Conclusion: the representative rerun task is recorded and complete, but the
package remains active. The next unchecked task is to trace the
`20260505T140646Z` epoch `5` `OPEN` publication-pending artifact through
pending ACK, selected-snapshot coverage, priority spread,
owner-RPC/cache-repair deferral, and priority-recovery workflow-timeout /
serial-wait evidence, then decide the next smallest focused fixture or runtime
owner probe.

## Validation

1. Focused owner or harness fixture for topology publication membership
   missing-active-node debt with selected snapshot coverage lag.
2. Focused priority-recovery fixture, if the selected owner decision depends on
   priority-recovery workflow-progress or serial-wait classification.
3. Touched-file syntax checks and relevant focused tests.
4. Non-literal static guardrails for touched runtime or harness files; document
   any inherited file-scoped literal debt separately.
5. `git diff --check`.
6. Representative `rolling-restart --fast-local` rerun after the owner slice.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates to one
   newly named owner boundary after topology publication membership and
   selected snapshot coverage debt are explained.
2. The failure bundle emits one canonical outcome for publication state,
   missing-active-node debt, selected snapshot coverage, and
   priority-recovery evidence.
3. Priority-recovery workflow-progress or serial-wait evidence is either
   resolved, deliberately made subordinate to topology publication debt, or
   promoted into its own named follow-up package after topology closure.
4. The prior post-publication operation-workflow timeout residual remains
   preserved for later revisit and is not mistaken for the current blocker.

## Residual Active Blocker

The current blocker is the post-`132033Z` replay-fixture May 5 rerun recorded
in
`test-output/reports/rolling-restart-after-132033z-selected-snapshot-replay-fixture-20260505T140646Z.report.json`.
It failed after `130.3s` with terminal active `5/5`, inactive `0`, selected
snapshot coverage `3/5`, publication epoch `5` `OPEN`, recovery protocol
state `publication_pending`, pending ACK count `2`, selected published active
`5/5`, active-gate selected missing published count `0`, priority spread
pending with gap `7`, and priority blocked partition count `2`.

The selected terminal snapshot node
`8be8d30f-4499-5eed-865c-71b4d529a67a` is admin-ready and reachable through
`admin_health`. The terminal selected snapshot observation is
`repair_deferred` / `stale_usable` with pending contract state, idle refresh,
next action `wait`, repair deferred `true`, and reason codes
`cache_stale_watermark`, `discovery_node_coverage_gap`, and
`stale_replica_operations_in_flight`.

The post-ACK `PUBLISHED` selected-snapshot/cache-repair boundary migrated.
Priority recovery now carries explicit unresolved operation-workflow evidence:
`sql_transactions-p1` is `recovering_in_flight` on operation
`0c78d9d7-3672-490e-87af-3b9acebd5801`, latest step `SENDING` / status
`pending`, under `workflow_timeout` / `timeout_reconcile_due`, next action
`reconcile_stale_operation_progress`; `sql_write_operations-p1` is
`needs_operation` with `priority_operation_serial_wait`, `operation_unknown`,
under `workflow_progress` / `event_driven`, next action
`wait_for_operation_progress`, serial-waiting behind `sql_transactions-p1`.

The `20260505T123850Z` trace, focused ACK-pending operation-workflow timeout
fixture, `20260505T132033Z` representative rerun, `20260505T132033Z`
post-ACK `PUBLISHED` missing-active selected-snapshot trace and replay fixture,
and `20260505T140646Z` representative rerun are complete. The current next
unchecked task is to trace the `20260505T140646Z` epoch `5` `OPEN`
publication-pending artifact through pending ACK, selected-snapshot coverage,
priority spread, owner-RPC/cache-repair deferral, and priority-recovery
workflow-timeout / serial-wait evidence, then decide the next smallest focused
fixture or runtime owner probe.
