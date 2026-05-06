# Rolling Restart Startup Active Gate Snapshot Coverage Priority Serial-Wait Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-mixed-summary-serial-wait-source-overlay-20260506T194741Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-mixed-summary-serial-wait-source-overlay-20260506T194741Z/rolling-restart/",
  "owner": "Startup active-gate snapshot coverage and priority workflow progress under serial wait",
  "boundary": "Startup active-gate snapshot-coverage / priority serial-wait workflow-progress reentry",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The mixed-summary operation-scheduling seam is closed. The representative rerun now reaches epoch 4 PUBLISHED with active 5/5 but snapshot coverage 3/5 on selected snapshot 11601..., while sql_transactions-p1 and sql_write_operations-p1 both wait on workflow-owned serial wait behind sql_transaction_participants-p1 and selected-snapshot coverage still disagrees on 11601... / 8be8... / ebc4... under reconnect and query-timeout pressure.",
  "nextAction": "Build the focused 194741Z epoch-4 startup active-gate / serial-wait workflow-progress fixture, then decide whether the repair belongs to workflow progress visibility, selected-snapshot coverage consumption, or startup transport/query pressure.",
  "proof": [
    "Focused 194741Z epoch-4 startup active-gate / serial-wait workflow-progress fixture",
    "Owner decision for workflow progress versus snapshot coverage versus transport/query pressure",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/distributed/harness/__tests__/failure-bundle-core-11-test-cases.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-priority-operation-creation-snapshot-coverage-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Priority Operation Creation Snapshot Coverage Reentry](./done-20260506-rolling-restart-startup-active-gate-priority-operation-creation-snapshot-coverage-reentry.md)
closed by migration. The mixed-summary operation-scheduling regression is
fixed, but the representative rerun moved back to workflow-owned serial wait
under startup active-gate snapshot-coverage disagreement.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-mixed-summary-serial-wait-source-overlay-20260506T194741Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-mixed-summary-serial-wait-source-overlay-20260506T194741Z/rolling-restart/`.
3. Result: failed after `133.6s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `topology`.
6. Failure class: `priority_recovery_progress_blocked`.
7. Dominant reason:
   `priority_recovery_workflow_progress_transition_deferred`.
8. Publication convergence reaches epoch `4`, status `PUBLISHED`, pending ACK
   count `0`, blocked node count `0`, and recovery protocol state
   `priority_spread_pending`.
9. Active-gate terminal state is startup `timed_out` with active `5/5`,
   snapshot coverage `3/5`, selected snapshot node `11601...`, selected
   published active count `2/5`, and blocker signature
   `snapshot_coverage=3/5|priority_recovery_progress_class=priority_operation_serial_wait`.
10. The selected snapshot node `11601...` reports missing published node ids
    `11601...`, `8be8...`, and `ebc4...`, while `7493...` and `35a891...`
    remain the only selected published active nodes.
11. The dominant workflow-progress witness is `sql_transactions-p1` with
    semantic state `needs_operation`, progress class
    `priority_operation_serial_wait`, owner
    `operation_workflow_owner / workflow_progress`, next action
    `wait_for_operation_progress`, serial-wait operation id
    `963ff775-ae80-499a-b3af-69efc4007fb6`, and serial-wait partition
    `sql_transaction_participants-p1`.
12. `sql_write_operations-p1` now matches the same
    `priority_operation_serial_wait` workflow-owned blocker and serial-wait
    witness ids.
13. `sql_transaction_participants-p1` is predecessor context only for this
    boundary: it is `spread_satisfied_in_flight`, and its workflow identity is
    no longer the selected actionable seam.
14. Supporting runtime logs on `11601...` show repeated `SELECT * FROM nodes`
    and `services` query timeouts, authoritative discovery cache repair
    failures, and websocket reconnect timeouts to seed `7493...`.
15. Supporting runtime logs on `8be8...` still show `Missing canonical
    node_endpoints websocket address` for `11601...`, websocket connection
    timeouts to seed `7493...`, and `SELECT * FROM nodes` query timeouts after
    `1500ms`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Build a focused `194741Z` fixture that preserves the epoch `4`
   `PUBLISHED` startup active-gate signature plus the workflow-owned
   `priority_operation_serial_wait` witnesses on `sql_transactions-p1` and
   `sql_write_operations-p1`.
2. Decide whether the canonical owner is workflow progress visibility,
   selected-snapshot coverage consumption, or startup transport/query pressure.
3. Repair only the selected owner path.
4. Preserve the closed mixed-summary operation-scheduling regression.

## Out Of Scope

1. Reopening the closed epoch `2` operation-scheduling seam unless that exact
   signature re-enters.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Workflow progress owns the boundary while the selected blocked partitions
   remain on `priority_operation_serial_wait` under
   `operation_workflow_owner / workflow_progress`.
2. Startup selected-snapshot coverage owns the boundary when the chosen
   snapshot cannot observe canonical published membership even though
   publication reaches `PUBLISHED`.
3. Transport/query pressure owns the boundary only when reconnect or query
   failures explain the selected snapshot-coverage or workflow-visibility
   debt.

Canonical contract shape:

1. `priority_operation_serial_wait` must identify the selected blocked
   partitions and preserve one canonical predecessor operation / partition
   witness set unless stronger current evidence outranks it.
2. `operation_unknown` correlation keys and `latestOperationStatus` /
   `latestOperationWorkflowStep` `unavailable` fields must not fabricate
   workflow progress without corroborating source evidence.
3. Snapshot-coverage disagreement must surface the exact selected missing
   published node ids from node `11601...`.
4. Query or reconnect failures may become dominant only when they directly
   explain the selected snapshot-coverage or workflow-progress debt.

## Residual Closure Inventory

- [ ] Extract the `194741Z` epoch-4 startup active-gate / serial-wait
      workflow-progress fixture.
- [ ] Decide the owner boundary: workflow progress, snapshot coverage, or
      transport/query pressure.
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

## Progress Notes

May 6 migration from the startup active-gate operation-scheduling package:

1. Added a tracked-snapshot regression proving mixed summary rows must retain
   live workflow-owned source context when the latest summary row is keyed by a
   newer removed operation.
2. Repaired synthetic serial-wait source extraction in
   `src/control-plane/priority-recovery-snapshot-stage-3.js` so mixed summary
   rows preserve canonical workflow-owned source context instead of reopening
   an actionable no-operation gap.
3. Focused proof and touched-file guardrails passed after the repair.
4. Representative rerun
   `rolling-restart-after-mixed-summary-serial-wait-source-overlay-20260506T194741Z`
   failed by migration: the selected operation-scheduling seam closed, and the
   live blocker reverted to startup active-gate snapshot coverage `3/5` plus
   workflow-owned serial wait on `sql_transactions-p1` and
   `sql_write_operations-p1`.

## Validation

1. Focused `194741Z` fixture passes.
2. Focused owner-boundary regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the epoch `4` startup active-gate snapshot-coverage / priority
   serial-wait workflow-progress boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
