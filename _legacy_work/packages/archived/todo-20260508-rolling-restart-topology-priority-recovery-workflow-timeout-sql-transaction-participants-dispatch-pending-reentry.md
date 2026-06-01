# Rolling Restart Topology Priority Recovery Workflow Timeout Sql Transaction Participants Dispatch Pending Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z/rolling-restart/",
  "owner": "Priority recovery workflow-timeout reconciliation for sql_transaction_participants-p1 after stale planning visibility repair",
  "boundary": "operation_workflow_owner / workflow_timeout / dispatch_pending_transition",
  "dominantReason": "priority_recovery_workflow_timeout_transition_deferred",
  "currentState": "This stopped reactive package remains as todo residual context only. It captured the local workflow-timeout owner-path fix and the representative sql_transaction_participants-p1 witness, but the sprint moved active execution to the operation_workflow_owner / priority_recovery_progress / workflow_progress_timeout_contract rewrite before representative rerun proof or full guard proof completed.",
  "nextAction": "Use this file only as predecessor context while the active package runs the required review/fix/implementation subagent sequence, freezes representative evidence fixtures, and rewrites the priority-recovery operation-workflow progress/timeout contract before any further reactive rolling-restart rerun.",
  "proof": [
    "Focused epoch-2 PUBLISHED workflow-timeout witness for sql_transaction_participants-p1 with supporting replica_operations-p1, sql_transactions-p1, sql_write_operations-p1, and startup active-gate evidence",
    "Focused workflow-timeout regression or blocker probe for the selected operation_created_but_no_step_transitions seam",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/todo-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Startup Active Gate Snapshot Coverage Priority Recovery Stale Planning Visibility Reentry](./done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md)
closes by migration. The representative rerun no longer spends package effort
on stale planning-only `eligible_but_no_operation_created` reporting. The live
frontier has moved to `sql_transaction_participants-p1` in epoch `2`
`PUBLISHED`, where `operation_created_but_no_step_transitions ->
reconcile_stale_operation_progress` remains unresolved under
`operation_workflow_owner / workflow_timeout` and startup active-gate snapshot
coverage stays downstream only. This file now remains as residual `todo`
context only; the sprint's active execution moved to the structural
operation-workflow contract rewrite before rerun and guard proof closed this
reactive slice.

## Stopped Package Review Note

Agent `Pasteur` (`019e06a8-bbd7-73d3-adce-f38534b580d1`) reviewed
`work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md`;
result `clean`. No fix subagent was needed. This package was moved back to
`todo-...` before implementation because the sprint strategy changed from
reactive blocker repair to a structural operation-workflow and priority
recovery contract rewrite. The next worker should treat this file as stopped
predecessor context only and continue through
`work/packages/done-20260508-priority-recovery-operation-workflow-contract-rewrite.md`
rather than rerunning the representative rolling-restart path from this
package. This package remains unfinished because representative rerun proof
and complete guard proof are still missing.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Pasteur` (`019e06a8-bbd7-73d3-adce-f38534b580d1`) reviewed
      `work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md`;
      result `clean`.
- [x] Fix subagent recorded or explicitly not needed:
      `not-needed` because the predecessor review result was `clean`.
- [x] Implementation subagent recorded:
      Agent `Curie` (`019e07b5-89d4-7bf4-9f86-5c0d6a4c2f31`) implemented
      `work/packages/todo-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z/rolling-restart/`.
3. Result: failed after `132.0s`.
4. `npm run analyze:distributed-failure` classifies the rerun as
   `topology / priority_recovery_workflow_timeout_transition_deferred`.
5. `npm run analyze:topology-convergence --` on both the report and playback
   failure bundle selects `operation_workflow_owner / workflow_timeout` as the
   first frontier, with `startup_active_gate_owner / snapshot_coverage` as the
   next expected frontier.
6. The dominant witness is `sql_transaction_participants-p1` with
   `semanticState=operation_stalled`,
   `progressClass=operation_created_but_no_step_transitions`,
   `nextRequiredAction=reconcile_stale_operation_progress`,
   `workflowProgressPhaseId=dispatch_pending`,
   `waitMode=timeout_reconcile_due`, `stepAgeMs=39749`, and
   `stepTimeoutMs=30000`.
7. Supporting context keeps `replica_operations-p1` on
   `recovering_in_flight / workflow_progress`,
   `sql_transactions-p1` on `needs_operation / priority_operation_serial_wait`,
   and `sql_write_operations-p1` on the same serial-wait lane while startup
   active-gate coverage remains downstream at `3/5`.
8. The stale `sql_write_operations-p1`
   `eligible_but_no_operation_created` witness is absent from the current
   rerun, so the stale-planning-visibility package stays closed unless a fresh
   representative artifact restores that older seam above workflow timeout.
9. Focused local regression
   `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
   now reconstructs a restart-discovered remote-owned priority `REPLACE`
   operation for `sql_transaction_participants-p1` with a durable `PENDING`
   row aged past `pendingTimeoutMs` while the overall operation budget remains
   active.
10. The focused regression proves the timeout seam was not stale-planning
    visibility. The stale `dispatch_pending` row was already classifying onto
    the workflow-progress boundary, but `checkTimeouts()` still filtered the
    remote-owned priority operation through the priority-recovery drain
    owner gate and skipped the remote-owner wake-up required to re-enter the
    canonical `replica-dispatch` ingress.
11. With the owner-gate repair in place, the local timeout scan now re-wakes
    the canonical remote owner exactly once, arms one follow-up retry timer,
    and preserves the durable row in `PENDING` with no timeout failure while
    the operation budget remains available.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Review the just-closed stale-planning-visibility package before
   implementation resumes.
2. Extract the focused epoch-2 PUBLISHED workflow-timeout witness for
   `sql_transaction_participants-p1` and its supporting partitions.
3. Add one focused workflow-timeout regression or blocker probe for the
   selected `operation_created_but_no_step_transitions /
   reconcile_stale_operation_progress` seam.
4. Repair or classify the direct workflow-timeout seam without reopening the
   closed stale-planning-visibility package.
5. Run focused tests, touched-file static guardrails, and one representative
   `rolling-restart` rerun.

## Out Of Scope

1. Reopening the closed stale-planning-visibility package unless a fresh
   representative artifact restores `startup_active_gate_owner /
   snapshot_coverage / priority_recovery_progress_visibility` above workflow
   timeout.
2. Broad startup or publication refactors outside the direct
   `sql_transaction_participants-p1` timeout-reconciliation path.
3. Harness timeout changes that hide the current workflow-timeout debt.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_timeout` owns the direct
   `sql_transaction_participants-p1` timeout-reconciliation seam in the fresh
   representative artifact.
2. `replica_operations-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1` remain supporting context unless a fresh
   representative artifact promotes one of them above
   `sql_transaction_participants-p1` without changing the owner boundary.
3. `startup_active_gate_owner / snapshot_coverage` remains the next expected
   frontier only after the direct workflow-timeout seam advances or closes.

Canonical contract shape:

1. If `sql_transaction_participants-p1` remains
   `operation_created_but_no_step_transitions`, the artifact must identify one
   canonical workflow-timeout reason for why the transition remains deferred.
2. Supporting priority partitions must not outrank the canonical
   `sql_transaction_participants-p1` workflow-timeout witness in the same
   artifact.
3. This package closes only after a representative rerun proves either the
   workflow-timeout frontier closes or a new named owner boundary dominates.

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [x] Extract the focused epoch-2 PUBLISHED workflow-timeout witness for
      `sql_transaction_participants-p1` and supporting
      `replica_operations-p1`, `sql_transactions-p1`, and
      `sql_write_operations-p1`.
- [x] Add the focused regression or blocker probe for the selected
      workflow-timeout seam.
- [x] Repair the selected workflow-timeout boundary or migrate again with
      proof.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file decision-boundary, literal-owner, or diff hygiene
      violation remains.
- [ ] Representative rerun proof completed before package closure.

## Implementation Notes

1. `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js` adds a
   distinct priority-recovery drain owner state for remote-owned operations
   that are still dispatch-retryable and therefore require a remote-owner
   wake-up instead of a local reconcile skip.
2. `src/rebalancer/operation-workflow-owner-segment-7-stage-4.js` maps that
   owner state to one canonical wake action and exposes
   `wakePriorityRecoveryRemoteOwnerFromDrainSnapshot(...)`, which reuses an
   already-armed handoff retry timer when present and otherwise re-sends the
   remote-owner wake-up through the existing coordinator-created handoff lane.
3. `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js` now runs
   that remote-owner wake path before the existing lifecycle-reentry gate in
   both the initial timeout scan and the visibility-refreshed timeout branch,
   so restart-discovered remote-owned stale `PENDING` rows are re-armed before
   they can fall through to local timeout failure.
4. `src/rebalancer/operation-workflow-owner-segment-7-stage-2.js` teaches the
   progress-reconcile path to wake a remote owner directly when
   `shouldRearmDispatchFromProgressReconcile(...)` is true for a remote-owned
   operation, instead of calling only the local execute path.
5. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
   covers the witness shape directly: remote-owned
   `sql_transaction_participants-p1`, durable `PENDING`, timeout overrun, one
   canonical remote wake-up, one follow-up timer, and no persisted step or
   failure mutation before remote progress is observed.

## Validation

1. Focused tests:
   - `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
     -> pass (`11` tests, `1` suite)
   - `node --test test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
     -> pass (`62` tests, `13` suites)
2. Touched-file baseline before edits:
   - `git show HEAD:src/rebalancer/operation-workflow-owner-segment-7-stage-2.js | wc -l`
     -> `547`
   - `git show HEAD:src/rebalancer/operation-workflow-owner-segment-7-stage-3.js | wc -l`
     -> `628`
   - `git show HEAD:src/rebalancer/operation-workflow-owner-segment-7-stage-4.js | wc -l`
     -> `529`
   - `git show HEAD:src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js | wc -l`
     -> `697`
3. Touched-file after-state:
   - `wc -l src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
     -> `558`, `644`, `566`, `703`, `266`
4. Static guardrails:
   - `npm run guard:guideline:constant-names:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
     -> pass (`0` opaque constant-name violations across `5` files)
   - `npm run guard:guidelines:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
     -> blocked by repository-local invalid API key (`401 invalid_api_key`)
   - `git diff --check -- src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
     -> pass
5. Broader timeout suite:
   - `node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
     -> fail (`167` pass, `7` fail subtests across `2` failing suites, `47`
        suites total)
     -> unrelated failing suites remain:
        `storage reservation cleanup reads opt into authoritative SQL fallback`
        and
        `canStartAddOperation can re-check authoritative in-flight count when priority recovery budget is saturated in cache`
6. Representative distributed rerun:
   - not yet completed after this owner-path fix
   - still required before package closure to confirm whether
     `sql_transaction_participants-p1` leaves the
     `operation_workflow_owner / workflow_timeout` frontier
