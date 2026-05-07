# Rolling Restart Topology Priority Recovery Workflow Progress Event-Driven Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z/rolling-restart/",
  "owner": "Priority recovery workflow progress no-dispatch behind topology publication PUBLISHED priority-spread convergence",
  "boundary": "Operation workflow owner / workflow_progress",
  "dominantReason": "priority_recovery_workflow_progress_event_driven",
  "currentState": "The bounded retryable seed-contact probe repair closes the previous startup no-progress seam. The representative rerun now reaches epoch 4 PUBLISHED with pending ACK count 0 and moves the live blocker to sql_write_operations-p1, where operation 0e957d74-4bae-4a33-90b0-ccf53e765d01 remains durable PENDING on target 35a... with target visibility absent and no workflow-step transitions.",
  "nextAction": "Extract the 072145Z sql_write_operations-p1 witness set, add a focused reproduction around remote-owned priority REPLACE wake-up and dispatch progression, repair the selected workflow-progress seam, and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused 072145Z workflow-progress witness fixture or blocker probe",
    "Focused remote-owned priority REPLACE wake-up or dispatch regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/control-plane/replica-dispatch-atomic-claim.integration.test.js",
    "work/packages/active-20260507-rolling-restart-topology-priority-recovery-workflow-progress-event-driven-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Publication Convergence Open Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md)
closed by migration. The representative rerun no longer selects startup
`contacting_seed` timeout no-progress as the direct lower owner. The bounded
seed-contact probe change collapsed repeated retry wall-clock loss, `35a...`
now reaches active, and the representative failure moved forward into
priority-recovery workflow progression after publication closure.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z/rolling-restart/`.
3. Result: failed after `131.8s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Triage summary reports root cause class `topology`, dominant reason
   `priority_recovery_workflow_progress_event_driven`, and failure class
   `priority_recovery_progress_blocked`.
6. Publication convergence is epoch `4` `PUBLISHED` with pending ACK count
   `0`, blocked partition count `1`, unresolved partition count `1`, and
   recovery protocol state `priority_spread_pending`.
7. The selected blocked partition is `sql_write_operations-p1`; the report
   names owner `operation_workflow_owner`, boundary `workflow_progress`,
   wait mode `event_driven`, next action `wait_for_operation_progress`, and
   actuation state `persisted_not_dispatched`.
8. The selected recovery operation is
   `0e957d74-4bae-4a33-90b0-ccf53e765d01`, created on `7493...` for target
   `35a...`; the durable row remains `PENDING`, operation age is `2570ms`,
   target visibility is `absent`, and there are no workflow-step transitions
   beyond the initial durable `PENDING`.
9. Runtime logs agree with the report snapshot: `7493...` logs creation of the
   `sql_write_operations-p1` REPLACE row and storage reservation, but there is
   no corresponding step transition or operation log for `0e957...` on
   `35a...` before scenario teardown.
10. The three remaining inactive nodes (`11601...`, `8be8...`, `ebc4...`)
    remain supporting startup fallout, not the direct owner. Publication has
    already closed at the selected epoch, and the failure bundle points at the
    blocked priority partition rather than missing publication ACKs or startup
    authority collapse.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `072145Z` workflow-progress witness set for
   `sql_write_operations-p1` and operation
   `0e957d74-4bae-4a33-90b0-ccf53e765d01`.
2. Add a focused reproduction for remote-owned priority REPLACE wake-up and
   dispatch progression after durable operation creation.
3. Repair only the selected `operation_workflow_owner / workflow_progress`
   seam that leaves the recovery operation durable `PENDING`.
4. Preserve the closed startup seed-contact retryability regressions from the
   predecessor package.

## Out Of Scope

1. Reopening the closed startup seed-contact package unless a fresh rerun
   again selects `contacting_seed` as the direct owner.
2. Harness-only timeout increases or relaxed failure classification that hide
   the named workflow-progress debt.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner / workflow_progress` owns the boundary when the
   selected publication epoch is already `PUBLISHED`, pending ACK count is
   `0`, and one blocked priority partition carries a durable active operation
   with no step transitions.
2. Direct remote dispatch or wake-up transport is subordinate until the proof
   shows that the selected durable `PENDING` row fails to reach or advance
   through the canonical target-owner ingress.
3. Startup `contacting_seed` failures are supporting evidence only when the
   blocked priority partition remains the direct cause after publication
   closure.

Canonical contract shape:

1. Failure bundle, triage summary, publication convergence, and focused tests
   must agree on one direct owner for `sql_write_operations-p1`.
2. The focused proof must show why operation
   `0e957d74-4bae-4a33-90b0-ccf53e765d01` remains durable `PENDING` rather
   than relying on stale missing-active or snapshot-coverage presentation.
3. If the next focused proof selects a lower transport or dispatch owner, this
   package must either narrow to that lower owner or split a successor package
   in the same work cycle.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `019e0168-d047-7541-8357-3cff88712095` / `Lovelace` reviewed
      `work/packages/done-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md`
      on the shared rolling-restart topology publication/workflow-progress
      boundary; result `fixes-required` for package bookkeeping before
      TopologyConvergenceGraph implementation starts.
- [x] Fix subagent recorded or explicitly not needed:
      `Codex package-bookkeeping fix session 2026-05-07T09:53:31+02:00`
      performed the scoped bookkeeping repair: add this ledger, remove the
      predecessor's invalid historical ledger, and close or reword predecessor
      checklist entries for validation.
- [x] Implementation subagent recorded:
      `current active rolling-restart package session` remains the
      implementation session for this active workflow-progress package after
      the review/fix ledger is clean; no TopologyConvergenceGraph
      implementation started in this bookkeeping-fix turn.

## Residual Closure Inventory

- [ ] Extract the `072145Z` workflow-progress witness fixture or narrow blocker
      probe for `sql_write_operations-p1`.
- [ ] Add the focused reproduction for remote-owned priority REPLACE wake-up or
      dispatch progression.
- [ ] Repair the selected workflow-progress seam without reopening the closed
      startup seed-contact path.
- [ ] Rerun focused proof, touched-file guardrails, and one representative
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

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-bounded-retryable-seed-contact-probe-20260507T072145Z.report.json --fast-local --verbose`
   failed after `131.8s` and selected
   `priority_recovery_workflow_progress_event_driven`.
2. The failure bundle, triage summary, and report snapshot agree on one blocked
   partition, `sql_write_operations-p1`, and one durable recovery operation,
   `0e957d74-4bae-4a33-90b0-ccf53e765d01`, still at workflow step `PENDING`.
