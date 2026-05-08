# Rolling Restart Priority Recovery Operation Scheduling Post Timeout Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-message-group-retry-metadata-20260508T173100Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-message-group-retry-metadata-20260508T173100Z/rolling-restart/",
  "owner": "rebalancer_leader",
  "boundary": "operation_scheduling / event_driven",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The operation_workflow_owner / workflow_timeout / transition_deferred frontier was cleared by the message-group retry metadata preservation fix. The representative rerun at 173100Z now fails first on rebalancer_leader / operation_scheduling with dominant reason priority_recovery_operation_scheduling_event_driven. Blocked partitions are replica_operations-p1, sql_transaction_participants-p1, and sql_transactions-p1. Publication is PUBLISHED, pendingAckCount=0, priorityRecoveryInvariants=passed.",
  "nextAction": "Identify why replica_operations-p1, sql_transaction_participants-p1, and sql_transactions-p1 still need or create or schedule recovery work after the timeout slice closed. Trace the operation_scheduling event_driven path in the rebalancer_leader to find the scheduling gap.",
  "proof": [
    "Representative rerun test-output/reports/rolling-restart-message-group-retry-metadata-20260508T173100Z.report.json shows rebalancer_leader / operation_scheduling as first frontier",
    "Focused regressions for retryable MESSAGE_GROUP_CREATE_FAILED in predecessor package",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun after scheduling fix"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-topology-priority-recovery-operation-scheduling-post-timeout-reentry.md",
    "work/sprints/active-2026-q2-phase-0-1-representative-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Topology Publication Convergence ACK Pending Missing Published Reentry](./done-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md)
cleared the `operation_workflow_owner / workflow_timeout / transition_deferred`
boundary via message-group retry metadata preservation.

## Why

The 173100Z representative rerun shows the `rolling-restart` scenario now
blocks first at `rebalancer_leader / operation_scheduling` with dominant
reason `priority_recovery_operation_scheduling_event_driven`. Three partitions
remain in the blocked set:

1. `replica_operations-p1`
2. `sql_transaction_participants-p1`
3. `sql_transactions-p1`

Publication is `PUBLISHED`, `pendingAckCount=0`, and
`priorityRecoveryInvariants=passed`. The scheduling gap must be isolated
within the event-driven operation-scheduling path of the rebalancer leader.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Trace why `replica_operations-p1`, `sql_transaction_participants-p1`, and
   `sql_transactions-p1` reach `operation_scheduling` after the timeout
   slice closed.
2. Identify the event-driven scheduling path gap.
3. Add focused regression proof for the scheduling boundary.
4. Rerun representative artifact after the fix.

## Out Of Scope

1. Reopening the closed timeout or publication-convergence boundaries.
2. Broad rebalancer rewrites not tied to the event-driven scheduling gap.
3. Harness timeout increases that hide the scheduling debt.

## Boundary Contract

Semantic owner: `rebalancer_leader / operation_scheduling / event_driven`.

Blocked partitions at start: `replica_operations-p1`,
`sql_transaction_participants-p1`, `sql_transactions-p1`.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Timeout Slice Review (timeout-slice-review) reviewed work/packages/done-20260508-rolling-restart-topology-publication-convergence-ack-pending-missing-published-reentry.md; result clean.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.

No implementation has started yet. The next runtime change must be recorded by
the first implementation subagent for this package.

## Residual Closure Inventory

- [ ] Operation-scheduling event_driven gap identified and fixed.
- [ ] Focused regression proof covers the blocked partitions.
- [ ] Touched-file static guardrails pass.
- [ ] Representative `rolling-restart --fast-local` rerun passes or migrates
      to one new named owner boundary.

## Static Drift Ledger

Preflight:

- [ ] Relevant touched-file guardrails selected for runtime edits.
- [ ] File-scoped baseline recorded by targeted focused regressions.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No decision-boundary, literal-owner, runtime-grammar, or diff hygiene
      violation remains.
- [ ] Commit and push ledger records one focused package-owned slice.

## Commit And Push Ledger

*(to be filled on closure)*

## Focused Evidence

1. Predecessor rerun:
   `test-output/reports/rolling-restart-message-group-retry-metadata-20260508T173100Z.report.json`
   shows `rebalancer_leader / operation_scheduling` as the first frontier
   with dominant reason `priority_recovery_operation_scheduling_event_driven`
   and blocked partitions `replica_operations-p1`,
   `sql_transaction_participants-p1`, and `sql_transactions-p1`.
