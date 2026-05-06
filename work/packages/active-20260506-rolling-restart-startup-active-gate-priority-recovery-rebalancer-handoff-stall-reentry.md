# Rolling Restart Startup Active Gate Priority Recovery Rebalancer Handoff Stall Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z/rolling-restart/",
  "owner": "Startup active-gate priority-recovery rebalancer handoff stall and stale no-progress retention",
  "boundary": "Startup active-gate / priority-recovery rebalancer-handoff stall retention",
  "dominantReason": "priority_recovery_rebalancer_handoff_stalled",
  "currentState": "The publication-evidence stale serial-wait consumer seam is closed. The representative rerun now reaches epoch 4 PUBLISHED with startup active 3/5 and snapshot coverage 3/5 on selected snapshot ebc4..., while the current canonical priority-recovery view has sql_transactions-p1 recovering_in_flight and sql_write_operations-p1 blocked_unclassified on rebalancer_leader / rebalancer_handoff. Supporting no-progress retention still surfaces an older selected-snapshot operation_created_but_no_step_transitions witness, so the live owner must be separated between current handoff state and retained stale selected-snapshot evidence.",
  "nextAction": "Extract the 204812Z current-versus-retained priority-recovery fixture, decide whether the blocking owner is current rebalancer handoff, stale selected-snapshot/no-progress retention, or startup transport/query pressure, then repair only that selected boundary.",
  "proof": [
    "Focused 204812Z current-versus-retained priority-recovery fixture",
    "Owner regression for current handoff versus retained stale timeout evidence",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-8.js",
    "src/control-plane/priority-recovery-snapshot-stage-9.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-active-gate-publication-evidence-priority-recovery-consumer-alignment.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Active Gate Publication Evidence Priority Recovery Consumer Alignment](./done-20260506-rolling-restart-startup-active-gate-publication-evidence-priority-recovery-consumer-alignment.md)
closed by migration. The stale active-gate serial-wait class is gone, but the
representative rerun now exposes a later epoch-4 startup active-gate priority
recovery seam around follow-up handoff and retained stale no-progress evidence.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z/rolling-restart/`.
3. Result: failed after `131.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification now reports root cause class `topology`, failure
   class `priority_recovery_progress_blocked`, and dominant reason
   `priority_recovery_rebalancer_handoff_stalled`.
6. Publication convergence reaches epoch `4`, status `PUBLISHED`, pending ACK
   count `0`, missing published count `0`, and recovery protocol state
   `priority_spread_pending`.
7. Current startup active-gate progress stays at active `3/5`, snapshot
   coverage `3/5`, selected snapshot node `ebc4...`, and blocker signature
   `inactive_nodes=2|snapshot_coverage=3/5`.
8. The current canonical priority-recovery view now shows:
   - `sql_transaction_participants-p1`:
     `spread_satisfied_in_flight`
   - `sql_transactions-p1`:
     `recovering_in_flight` under
     `operation_workflow_owner / workflow_progress`
   - `sql_write_operations-p1`:
     `blocked_unclassified` under
     `rebalancer_leader / rebalancer_handoff` with next action
     `schedule_followup_rebalance`
9. Supporting retained no-progress evidence still reports an older selected
   snapshot witness with
   `priority_recovery_progress_class=operation_created_but_no_step_transitions`
   and semantic states `needs_operation|operation_stalled` for
   `sql_transactions-p1` and `sql_write_operations-p1`.
10. The selected snapshot node `ebc4...` still reports snapshot coverage `3/5`
    and missing published node ids `35a891...`, `8be8...`, and `ebc4...`.
11. Supporting node logs still show joiner query timeouts, websocket reconnect
    failures to seed `7493...`, and seed readiness probe timeouts, but those
    remain subordinate until the handoff-versus-retention owner is decided.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Build a focused `204812Z` fixture that preserves the difference between the
   current canonical priority-recovery handoff witness and the retained stale
   no-progress / selected-snapshot timeout witness.
2. Decide whether the current owner is rebalancer follow-up handoff,
   stale selected-snapshot retention, or startup transport/query pressure.
3. Repair only the selected owner path.
4. Preserve the closed publication-evidence stale serial-wait regression.

## Out Of Scope

1. Reopening the closed publication-evidence / active-gate serial-wait
   consumer repair unless the same `priority_operation_serial_wait`
   contradiction re-enters.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. The current canonical blocked follow-up state is owned by the normalized
   priority-recovery observation and decision snapshots.
2. Startup active-gate no-progress retention and selected-snapshot coverage
   may preserve earlier evidence, but they must not replace a newer canonical
   handoff witness when that current witness is available.
3. Transport/query pressure remains supporting evidence unless it directly
   explains why the current handoff witness cannot be observed or advanced.

Canonical contract shape:

1. Current active-gate progress and failure classification must agree on the
   selected blocked partition, current owner, and blocking boundary when a
   newer canonical priority-recovery witness exists.
2. `operation_created_but_no_step_transitions` must not remain the dominant
   current blocker once the current canonical witness has moved to
   `rebalancer_leader / rebalancer_handoff`.
3. Snapshot-coverage disagreement must still surface the exact selected
   missing published node ids from node `ebc4...`.
4. If transport/query pressure becomes the true owner, the replayable proof
   must show that it suppresses or invalidates the current handoff witness
   rather than merely coexisting with it.

## Residual Closure Inventory

- [ ] Extract the `204812Z` current-versus-retained priority-recovery fixture.
- [ ] Decide the owner boundary: rebalancer handoff, stale selected-snapshot
      retention, or startup transport/query pressure.
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

May 6 migration from the publication-evidence consumer-alignment package:

1. The focused tracked-snapshot regression now suppresses serial-wait source
   contexts that are already subordinated under a spread-satisfied sibling.
2. Focused owner proof, harness presentation proof, and touched-file
   guardrails passed after the stage-3 repair.
3. Representative rerun
   `rolling-restart-after-subordinated-serial-wait-suppression-20260506T204812Z`
   failed by migration: current active-gate progress no longer retains stale
   `priority_operation_serial_wait`, but the live representative seam moved to
   epoch `4` `PUBLISHED` startup active-gate recovery with
   `sql_write_operations-p1` on `rebalancer_handoff`.
4. The same artifact still retains an older selected-snapshot / no-progress
   witness with `operation_created_but_no_step_transitions`, so the next
   contraction package must decide whether that retained timeout evidence is a
   stale consumer artifact or still the real owner path.

## Validation

1. Focused `204812Z` current-versus-retained fixture passes.
2. Focused owner-boundary regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the epoch `4` startup active-gate rebalancer-handoff / retained
   selected-snapshot boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
