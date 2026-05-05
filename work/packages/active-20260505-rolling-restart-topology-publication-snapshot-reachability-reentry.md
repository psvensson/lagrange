# Rolling Restart Topology Publication Snapshot Reachability Reentry

Opened on May 5, 2026 as the current representative split from
[Rolling Restart Operation Transition Pressure And Over-Target Trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
The fresh representative path migrated away from post-active
operation-transition / over-target trim and is now blocked earlier by topology
publication missing-active-node debt, selected snapshot coverage/reachability,
and a `sql_write_operations-p1` priority serial-wait witness.

## Current Evidence

1. Fresh representative rerun after `e0344113`:
   `test-output/reports/rolling-restart-after-missing-published-reason-source-rerun-20260505T074739Z.report.json`.
2. Companion log:
   `test-output/reports/rolling-restart-after-missing-published-reason-source-rerun-20260505T074739Z.log`.
3. Failure bundle:
   `test-output/reports/.playback/rolling-restart-after-missing-published-reason-source-rerun-20260505T074739Z/rolling-restart/failure-bundle.json`.
4. Triage summary:
   `test-output/reports/.playback/rolling-restart-after-missing-published-reason-source-rerun-20260505T074739Z/rolling-restart/triage-summary.md`.
5. Result: failed, `0/1` passed after `132.4s`.
6. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
7. Root cause class is `topology`; failure class is
   `publication_convergence_blocked`.
8. Dominant reason:
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`.
9. Publication epoch `3` is `PUBLISHED`, recovery protocol state is
   `publication_pending`, pending ACK count is `0`, missing published count is
   `2`, and missing published nodes are
   `8be8d30f-4499-5eed-865c-71b4d529a67a` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
10. Publication gate reasons include `priority_partitions_not_spread`,
    `snapshot_coverage=4/5`, and both explicit
    `publication_missing_active_node=<node>` reasons.
11. Terminal active-gate progress is active `2/5`; best progress was active
    `3/5`.
12. Selected snapshot coverage is `4/5`, selected published active is `3/5`,
    priority spread gap is `10`, and terminal readiness failed on
    `snapshot_reachability_timeout` for selected snapshot node
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
13. The selected priority-recovery boundary is `sql_write_operations-p1`:
    progress class `priority_operation_serial_wait`, semantic state
    `needs_operation`, owner `operation_workflow_owner`, boundary
    `workflow_progress`, wait mode `event_driven`, correlation key
    `sql_write_operations-p1|3|operation_unknown`, operation id
    `57aa5679-15ad-4ea9-84f6-c6e5f906abf0`, and serial-wait partition ids
    `sql_transaction_participants-p1` and `sql_transactions-p1`.
14. The previous `052328Z` `sql_write_operations-p1` PENDING dispatch-timeout
    residual is not closed. It remains recorded in the prior
    operation-transition package for later revisit, but it is not the current
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
publication remains `publication_pending` with missing published active nodes,
selected snapshot coverage remains `4/5`, and selected snapshot reachability
still times out. If topology publication debt closes and this witness persists,
the next smallest runtime question is whether the operation-workflow owner
keeps `57aa5679-15ad-4ea9-84f6-c6e5f906abf0` moving out of
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

1. Reconcile why publication epoch `3` is `PUBLISHED` with pending ACK count
   `0` while recovery remains `publication_pending` with explicit
   missing-active-node debt.
2. Explain terminal active `2/5`, best active `3/5`, selected snapshot coverage
   `4/5`, selected published active `3/5`, and selected missing published
   count `2` as one topology owner outcome.
3. Determine whether the selected snapshot reachability timeout on
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` is causal owner evidence or
   subordinate topology evidence.
4. Preserve and classify the `sql_write_operations-p1`
   `priority_operation_serial_wait` witness without collapsing it into
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
3. Selected snapshot reachability cannot be marked closed while selected
   coverage or selected missing-published debt remains unexplained.
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
- [ ] Rerun the representative `rolling-restart --fast-local` gate and record
      closure or the next migrated named boundary.

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

## Validation

1. Focused owner or harness fixture for topology publication missing-active-node
   debt with selected snapshot coverage/reachability lag.
2. Focused priority-recovery fixture, if the selected owner decision depends on
   `sql_write_operations-p1` serial-wait classification.
3. Touched-file syntax checks and relevant focused tests.
4. Non-literal static guardrails for touched runtime or harness files; document
   any inherited file-scoped literal debt separately.
5. `git diff --check`.
6. Representative `rolling-restart --fast-local` rerun after the owner slice.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates to one
   newly named owner boundary after topology publication and selected snapshot
   reachability debt is explained.
2. The failure bundle emits one canonical outcome for publication state,
   missing-active-node debt, selected snapshot coverage/reachability, and
   priority-recovery serial wait.
3. `sql_write_operations-p1` serial-wait evidence is either resolved,
   deliberately made subordinate to topology publication debt, or promoted into
   its own named follow-up package after topology closure.
4. The prior post-publication operation-workflow timeout residual remains
   preserved for later revisit and is not mistaken for the current blocker.

## Residual Active Blocker

The current blocker is the post-`e0344113` May 5 topology publication and
selected snapshot reachability failure recorded in the `074739Z` rerun:
terminal active `2/5`, best active `3/5`, selected snapshot coverage `4/5`,
publication epoch `3` `PUBLISHED`, recovery protocol state
`publication_pending`, pending ACK count `0`, missing published count `2`,
priority spread gap `10`, explicit missing-active-node publication debt, and
selected snapshot reachability timeout on
`ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.

The supporting priority-recovery residual is `sql_write_operations-p1` in
`priority_operation_serial_wait` / `needs_operation` at
`operation_workflow_owner / workflow_progress / event_driven`, with operation
`57aa5679-15ad-4ea9-84f6-c6e5f906abf0`, correlation key
`sql_write_operations-p1|3|operation_unknown`, and serial-wait partition ids
`sql_transaction_participants-p1` and `sql_transactions-p1`.
