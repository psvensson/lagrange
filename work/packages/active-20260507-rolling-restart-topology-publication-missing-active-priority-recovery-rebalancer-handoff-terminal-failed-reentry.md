# Rolling Restart Topology Publication Missing-Active Priority Recovery Rebalancer Handoff Terminal-Failed Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z/rolling-restart/",
  "owner": "Topology publication missing-active node over priority recovery rebalancer-handoff terminal-failed stalled follow-up progress after eligible-cohort replace-safety closure",
  "boundary": "Topology publication missing-active node / priority recovery rebalancer-handoff terminal-failed owner",
  "dominantReason": "priority_recovery_rebalancer_handoff_terminal_failed",
  "currentState": "The prior eligible-cohort replace-safety seam is closed. The representative rerun now reaches epoch 4 PUBLISHED with active 2/5, snapshot coverage 3/5, pending ACK count 0, and recovery protocol state priority_spread_pending. The dominant reason moved to priority_recovery_rebalancer_handoff_terminal_failed: triage selects owner rebalancer_leader, boundary rebalancer_handoff, wait mode stalled, and nextAction schedule_followup_rebalance while sql_transactions-p1 remains recovering_in_flight, sql_write_operations-p1 returns to needs_operation, and replica_operations-p1 stays blocked_unclassified.",
  "nextAction": "Extract the 044845Z rebalancer-handoff witnesses for replica_operations-p1 operation 6c0118c8-21a7-41f6-9f8c-57ecb2801c1d and sql_transactions-p1 operation 2ac8218e-15db-467f-8d23-eb483c72b427; add a focused stalled follow-up regression for the selected rebalancer/workflow handoff boundary; repair only that owner path; and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused 044845Z rebalancer-handoff stalled-follow-up witness fixture",
    "Focused priority recovery rebalancer-handoff terminal-failed regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-4-stage-4.js",
    "src/rebalancer/rebalance-coordinator-segment-5.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js",
    "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-rebalancer-handoff-terminal-failed-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Priority Recovery Eligible-Cohort Replace-Safety Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md)
closed by migration. The materialized-target superseded-cohort seam is now
closed, but the representative rerun still fails on a new priority-recovery
handoff boundary.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-eligible-cohort-materialized-preserve-20260507T044845Z/rolling-restart/`.
3. Result: failed after `132.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Triage summary now reports root cause class `topology`, dominant reason
   `priority_recovery_rebalancer_handoff_terminal_failed`, failure class
   `priority_recovery_progress_blocked`, and recovery protocol state
   `priority_spread_pending`.
6. Publication convergence reaches epoch `4`, status `PUBLISHED`, pending ACK
   count `0`, blocked-node count `0`, and progress
   `active=2/5, coverage=3/5`.
7. The new selected owner is explicit in the triage signals:
   `priorityRecoveryOwner=rebalancer_leader`,
   `priorityRecoveryBoundary=rebalancer_handoff`,
   `priorityRecoveryWaitMode=stalled`, and
   `priorityRecoveryNextAction=schedule_followup_rebalance`.
8. Priority recovery still blocks three partitions:
   `replica_operations-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`.
9. `sql_transactions-p1` is no longer a replace-safety failure. The seed
   creates operation `2ac8218e-15db-467f-8d23-eb483c72b427`, the target owner
   `35a891...` persists `SENDING`, and target-side playback handles
   `CREATE_REPLICA` for `sql_transactions-p1-r5`, but no later canonical step
   transition becomes the selected dominant progress witness.
10. `replica_operations-p1` still carries operation
    `6c0118c8-21a7-41f6-9f8c-57ecb2801c1d`; target-side playback shows
    `CREATE_REPLICA` failing with
    `Operational message-group ingress not ready for replica_operations CDC subscription`.
11. `sql_write_operations-p1` falls back to `needs_operation` with gap `1`
    and blocker `eligible_but_no_operation_created`, so the successor package
    must decide whether the true owner is rebalancer follow-up scheduling,
    operation-workflow handoff persistence, or startup inability to accept the
    created follow-up under bootstrap pressure.
12. Supporting runtime evidence includes seed-side outbound queue saturation
    for `sql_transaction_participants-p1-r4` on `35a891...` and two joiners
    (`8be8...`, `ebc4...`) still failing in `contacting_seed`, but those are
    supporting conditions until the selected handoff boundary is disproved.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `044845Z` rebalancer-handoff witness set for
   `replica_operations-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`.
2. Decide whether the direct owner is rebalancer follow-up scheduling,
   operation-workflow handoff persistence, or startup-side acceptability of
   the created follow-up.
3. Add a focused regression for the selected handoff/step-transition owner
   path before the next representative rerun.
4. Preserve the closed eligible-cohort replace-safety regressions from the
   predecessor package.

## Out Of Scope

1. Reopening the closed materialized-target superseded-cohort seam unless the
   same rejection reappears directly in the fresh playback.
2. Harness-only timeout increases or publication/readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Rebalancer handoff owns the boundary if priority recovery has eligible
   spread debt, creates or resumes a follow-up operation, and then fails to
   schedule the next actuation step or selected owner transition.
2. Operation workflow ownership owns the boundary if target-side actuation
   begins, but the canonical `REPLACE` or `ADD` step transitions do not
   persist or reconcile into one explicit progress state.
3. Startup/bootstrap readiness is supporting evidence unless the focused
   witness set proves the created follow-up could not progress only because
   the target bootstrap owner could not accept the handoff.
4. Top-level publication missing-active remains the scenario carrier, not the
   implementation owner, unless no lower direct seam can explain the live
   failure.

Canonical contract shape:

1. One canonical path must take priority recovery from spread debt to either
   `needs_operation`, `recovering_in_flight`, or one explicit terminal
   failure, without oscillating between created-follow-up and absent-progress
   states.
2. If an operation is created, the authoritative workflow and playback
   witnesses must agree on whether it advanced, stalled, or terminally failed.
3. Failure bundle classification, triage summary, and owner-path logs must
   converge on one selected handoff boundary before this package can close.

## Residual Closure Inventory

- [ ] Extract the `044845Z` rebalancer-handoff / stalled-follow-up witness
      fixture.
- [ ] Decide the direct owner boundary: rebalancer follow-up scheduling,
      workflow handoff persistence, or startup-side acceptability of the
      created follow-up.
- [ ] Add the focused regression and repair the selected owner path.
- [ ] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. Focused `044845Z` rebalancer-handoff / stalled-follow-up fixture passes.
2. Focused owner-path regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / priority recovery
   rebalancer-handoff terminal-failed boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
