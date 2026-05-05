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
- [ ] Identify the owner path for inactive nodes and explicit
      missing-active-node publication debt when publication status is
      `PUBLISHED` and pending ACK count is `0`.
- [ ] Reconcile selected snapshot coverage `4/5` and the reachability timeout
      for `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
- [ ] Trace the `sql_write_operations-p1` serial-wait witness through operation
      `57aa5679-15ad-4ea9-84f6-c6e5f906abf0` and serial-wait partitions
      `sql_transaction_participants-p1` and `sql_transactions-p1`.
- [ ] Add the smallest focused runtime or harness regression needed for the
      selected owner decision.
- [ ] Run touched-file syntax, relevant focused tests, non-literal guardrails,
      and `git diff --check`.
- [ ] Rerun the representative `rolling-restart --fast-local` gate and record
      closure or the next migrated named boundary.

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
