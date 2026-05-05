# Rolling Restart Topology Publication Snapshot Reachability Reentry

Opened on May 5, 2026 as the current representative split from
[Rolling Restart Operation Transition Pressure And Over-Target Trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
The fresh representative path migrated away from post-active
operation-transition / over-target trim and is now blocked earlier by topology
publication membership missing-active-node debt, selected snapshot coverage,
and priority-recovery serial-wait evidence, most recently on
`sql_transaction_participants-p1`.

## Current Evidence

1. Fresh representative rerun after the May 5 reconcile probe:
   `test-output/reports/rolling-restart-after-reconcile-probe-20260505T102455Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-reconcile-probe-20260505T102455Z/rolling-restart/`.
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-reconcile-probe-20260505T102455Z/rolling-restart/failure-bundle.json`.
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-reconcile-probe-20260505T102455Z/rolling-restart/triage-summary.md`.
5. Result: failed, `0/1` passed after `133.0s`.
6. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
7. Root cause class is `topology`; failure class is
   `publication_convergence_blocked`.
8. Dominant reason:
   `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
9. Publication epoch `2` is `PUBLISHED`, recovery protocol state is
   `publication_pending`, pending ACK count is `0`, missing published count is
   `3`, and missing published nodes are
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
10. Publication gate reasons include `priority_partitions_not_spread`,
    `snapshot_coverage=3/5`, and all three explicit
    `publication_missing_active_node=<node>` reasons.
11. Terminal active-gate progress is active `5/5` with selected snapshot
    coverage `3/5`; best progress was active `5/5` with selected snapshot
    coverage `4/5`.
12. Selected published active is `2/5`, priority spread gap is `5`, selected
    snapshot node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` is admin-ready through
    `admin_health`, and terminal readiness remains `no_progress_terminal`
    rather than selected snapshot reachability timeout.
13. The selected priority-recovery boundary is
    `sql_transaction_participants-p1`:
    progress class `priority_operation_serial_wait`, semantic state
    `needs_operation`, owner `operation_workflow_owner`, boundary
    `workflow_progress`, wait mode `event_driven`, correlation key
    `sql_transaction_participants-p1|2|operation_unknown`, serial-wait
    operation `74154dc2-e602-43a8-8dc7-58e32e3424b8`, and serial-wait partition
    `sql_transactions-p1`.
14. `replica_operations-p1` and `sql_write_operations-p1` remain blocked as
    `recovering_in_flight`; the previous `052328Z` `sql_write_operations-p1`
    PENDING dispatch-timeout residual is still historical and not the current
    selected representative blocker.

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

1. Reconcile the current after-reconcile-probe publication membership/snapshot
   coverage residual: publication epoch `2` is `PUBLISHED`, pending ACK count
   is `0`, recovery remains `publication_pending`, terminal active is `5/5`,
   terminal selected snapshot coverage is `3/5`, best selected snapshot coverage
   is `4/5`, selected published active is `2/5`, and selected missing published
   count is `3`.
2. Explain why the latest selected snapshot node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` is reachable through
   `admin_health` while explicit missing-active-node publication debt remains
   open for that node,
   `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
3. Keep the `074739Z` selected snapshot reachability timeout on
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` as historical evidence only; it no
   longer competes with the current terminal boundary.
4. Preserve and classify priority-recovery serial-wait evidence, most recently
   on `sql_transaction_participants-p1`, without collapsing it into
   current-partition operation identity or treating it as post-active trim.
5. Keep the failure bundle anchored to one canonical owner outcome across
   publication, active-gate, selected snapshot, and priority-recovery evidence.
6. Rerun the representative `rolling-restart --fast-local` scenario after the
   smallest owner fix and record whether the blocker closes or migrates.

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
3. Selected snapshot coverage and selected missing-published debt must be
   explained even when the selected node is reachable through `admin_health`;
   the `074739Z` reachability timeout remains historical unless a fresh
   artifact reintroduces it.
4. Serial-wait evidence remains owned by the operation workflow owner and must
   not replace topology missing-active-node evidence unless topology debt is
   first closed or deliberately made subordinate.

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
- [ ] Rerun the representative `rolling-restart --fast-local` gate after the
      deferred selected-snapshot observation probe and record whether the blocker
      closes, stays on publication missing-active-node evidence, or migrates to
      one newly named owner boundary.

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

## Validation

1. Focused owner or harness fixture for topology publication membership
   missing-active-node debt with selected snapshot coverage lag.
2. Focused priority-recovery fixture, if the selected owner decision depends on
   priority-recovery serial-wait classification.
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
   priority-recovery serial wait.
3. Priority-recovery serial-wait evidence is either resolved, deliberately made
   subordinate to topology publication debt, or promoted into its own named
   follow-up package after topology closure.
4. The prior post-publication operation-workflow timeout residual remains
   preserved for later revisit and is not mistaken for the current blocker.

## Residual Active Blocker

The current blocker is the after-reconcile-probe May 5 topology publication and
snapshot coverage failure recorded in the `20260505T102455Z` rerun: terminal
active `5/5`, terminal selected snapshot coverage `3/5`, best selected snapshot
coverage `4/5`, publication epoch `2` `PUBLISHED`, recovery protocol state
`publication_pending`, pending ACK count `0`, missing published count `3`,
selected published active `2/5`, priority spread gap `5`, and explicit
missing-active-node publication debt for
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
`8be8d30f-4499-5eed-865c-71b4d529a67a`, and
`ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.

The selected snapshot reachability timeout from `074739Z` remains historical.
The latest selected snapshot node
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7` is admin-ready through `admin_health`
with no selected reachability error, while failure classification remains
anchored to publication missing-active-node debt.

The supporting priority-recovery residual now selects
`sql_transaction_participants-p1` in `priority_operation_serial_wait` /
`needs_operation` at
`operation_workflow_owner / workflow_progress / event_driven`, with correlation
key `sql_transaction_participants-p1|2|operation_unknown`, serial-wait operation
`74154dc2-e602-43a8-8dc7-58e32e3424b8`, and serial-wait partition
`sql_transactions-p1`. `replica_operations-p1` and `sql_write_operations-p1`
remain blocked as `recovering_in_flight`.

The next unchecked task is to add the smallest runtime owner repair/probe that
The next unchecked task is to rerun the representative
`rolling-restart --fast-local` gate after the deferred selected-snapshot
observation probe and record whether the blocker closes, remains on publication
missing-active-node evidence, or migrates to one newly named owner boundary.
