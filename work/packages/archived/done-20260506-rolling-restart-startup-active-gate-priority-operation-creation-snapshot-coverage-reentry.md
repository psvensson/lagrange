# Rolling Restart Startup Active Gate Priority Operation Creation Snapshot Coverage Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-stale-serial-wait-source-filter-20260506T204900Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-stale-serial-wait-source-filter-20260506T204900Z/rolling-restart/",
  "owner": "Startup active-gate snapshot coverage and priority operation scheduling",
  "boundary": "Startup active-gate snapshot-coverage / priority operation scheduling reentry",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The mixed-summary operation-scheduling seam is closed: sql_transaction_participants-p1 no longer reopens as an actionable needs-operation gap when sql_transactions-p1 still has live workflow-owned progress. The representative rerun moved to epoch 4 PUBLISHED with active 5/5 but snapshot coverage 3/5 on selected snapshot 11601..., and the live blocker reverted to workflow-owned serial wait on sql_transactions-p1 and sql_write_operations-p1 under reconnect/query pressure.",
  "nextAction": "Use the successor startup active-gate snapshot-coverage / priority serial-wait workflow-progress package for the current representative blocker.",
  "proof": [
    "Focused 204900Z epoch-2 startup active-gate / operation-scheduling fixture",
    "Owner decision for operation scheduling versus snapshot coverage versus transport/query pressure",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "work/packages/done-20260506-rolling-restart-startup-active-gate-priority-operation-creation-snapshot-coverage-reentry.md"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-published-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/active-20260506-rolling-restart-startup-active-gate-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Published Snapshot Coverage Priority Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-published-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md)
closed by migration. The stale workflow-progress promotion is fixed, but the
representative rerun moved earlier into startup active-gate recovery with
selected-snapshot coverage still open and priority operation creation
incomplete.

Closure update on May 6, 2026: the focused mixed-summary serial-wait repair
now preserves live workflow-owned source context when the latest summary row is
keyed by a newer removed operation. The representative rerun
`test-output/reports/rolling-restart-after-mixed-summary-serial-wait-source-overlay-20260506T194741Z.report.json`
no longer selects `sql_transaction_participants-p1` as an actionable
`eligible_but_no_operation_created` gap. The live blocker migrated to epoch
`4` `PUBLISHED` startup active-gate recovery with active `5/5`, snapshot
coverage `3/5`, selected snapshot `11601...`, and workflow-owned
`priority_operation_serial_wait` on `sql_transactions-p1` and
`sql_write_operations-p1`. That new owner boundary is tracked in
[Rolling Restart Startup Active Gate Snapshot Coverage Priority Serial-Wait Workflow Progress Reentry](./active-20260506-rolling-restart-startup-active-gate-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md).

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-stale-serial-wait-source-filter-20260506T204900Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-stale-serial-wait-source-filter-20260506T204900Z/rolling-restart/`.
3. Result: failed after `130.5s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `topology`.
6. Failure class: `priority_recovery_progress_blocked`.
7. Dominant reason:
   `priority_recovery_operation_scheduling_event_driven`.
8. Active-gate terminal state is startup `timed_out` with active `1/5`,
   snapshot coverage `2/5`, selected snapshot node `8be8...`, and blocker
   signature
   `inactive_nodes=4|snapshot_coverage=2/5|priority_recovery_progress_class=eligible_but_no_operation_created`.
9. Publication convergence is predecessor context only for this boundary:
   terminal epoch `2`, status `PUBLISHED`, pending ACK count `0`, and recovery
   protocol state `priority_spread_pending`.
10. The selected actionable priority witness is
    `sql_transaction_participants-p1` with semantic state `needs_operation`,
    progress class `eligible_but_no_operation_created`, owner
    `rebalancer_leader`, boundary `operation_scheduling`, next action
    `create_recovery_operation`, and correlation key
    `sql_transaction_participants-p1|2|operation_unknown`.
11. Supporting priority evidence keeps `sql_transactions-p1`
    `recovering_in_flight`, workflow-owned, and on
    `wait_for_operation_progress` with operation ids
    `242cec9e-5752-4d91-af72-258dd9ba590b` and
    `53813528-f436-4fe8-84ed-2f47ecab0f88`.
12. `sql_write_operations-p1` is now `spread_satisfied_in_flight` with latest
    operation status `removed`; the stale workflow serial-wait witness is
    historical evidence only.
13. The selected snapshot node `8be8...` reports published active node ids
    `7493...` and `ebc4...`, but still misses published nodes
    `11601...`, `35a891...`, and `8be8...`.
14. Supporting runtime logs on `8be8...` show repeated target-connection
    quarantine, `SELECT * FROM nodes` query timeouts after `1500ms`, and
    websocket reconnect timeouts to seed `7493...`. Seed `7493...` also times
    out readiness probes in the terminal error bundle.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Build a focused `204900Z` fixture that preserves the epoch `2`
   `PUBLISHED` startup active-gate signature plus the
   `sql_transaction_participants-p1` actionable operation-scheduling witness.
2. Decide whether the canonical owner is priority operation scheduling,
   selected-snapshot coverage consumption, or startup transport/query pressure.
3. Repair only the selected owner path.
4. Preserve the closed stale serial-wait workflow-progress regression.

## Out Of Scope

1. Reopening the closed epoch `6` serial-wait workflow-progress boundary unless
   that exact signature re-enters.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Priority operation scheduling owns the boundary while the selected blocked
   partition is actionable `needs_operation` under `rebalancer_leader`.
2. Startup selected-snapshot coverage owns the boundary when the chosen
   snapshot node cannot observe canonical published membership even though the
   terminal publication state is `PUBLISHED`.
3. Transport/query pressure owns the boundary only when reconnect or query
   failures explain the missing snapshot coverage or suppress current
   operation-scheduling visibility.

Canonical contract shape:

1. `eligible_but_no_operation_created` must identify the selected blocked
   partition and keep the owner on `rebalancer_leader / operation_scheduling`
   unless stronger current evidence outranks it.
2. Supporting `recovering_in_flight` partitions may remain historical or
   subordinate evidence; they must not mask the selected actionable gap.
3. Snapshot-coverage disagreement must surface the exact selected missing
   published node ids from the chosen startup snapshot.
4. Transport/query failures may only become the dominant owner when they
   directly explain the selected snapshot-coverage or owner-visibility debt.

## Residual Closure Inventory

- [x] Extract the `204900Z` epoch-2 startup active-gate / operation-scheduling fixture.
- [x] Decide the owner boundary: operation scheduling, snapshot coverage, or
      transport/query pressure.
- [x] Add the focused regression and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for
      `src/control-plane/priority-recovery-snapshot-stage-3.js` and
      `test/control-plane/priority-recovery-snapshot.test.js`.
      Baseline result on May 6, 2026:
      `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
      -> `0 new literal-guideline violations`;
      `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
      -> `0 decision-boundary guideline violations`;
      `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-3.js test/control-plane/priority-recovery-snapshot.test.js`
      -> `0 runtime-grammar-contract violations`;
      `git diff --check` -> clean.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Progress Notes

May 6 migration from the serial-wait workflow-progress package:

1. The stale serial-wait normalization repair now uses the latest tracked
   source snapshot per partition.
2. Focused proof keeps stale source-partition workflow evidence from promoting
   a synthetic no-operation snapshot into `priority_operation_serial_wait`.
3. Representative rerun
   `rolling-restart-after-priority-recovery-stale-serial-wait-source-filter-20260506T204900Z`
   failed by migration: the live blocker moved earlier to epoch `2`
   `PUBLISHED` startup active-gate recovery with snapshot coverage `2/5`,
   `sql_transaction_participants-p1` actionable operation scheduling, and
   subordinate joiner reconnect/query pressure.
4. Current owner probe: the raw `204900Z` decision snapshots still carry a
   live `sql_transactions-p1` in-flight operation on target `ebc4...`, but
   the serial-wait normalizer reads only the latest summary row's
   `coordinator.operation`. Because the latest row for `sql_transactions-p1`
   is keyed by a newer removed operation while progress ownership still points
   at the live `242c...` add, `sql_transaction_participants-p1` is demoted
   from target-occupied serial wait back to actionable
   `eligible_but_no_operation_created`.
5. Added a tracked-snapshot regression proving mixed summary rows must retain
   live workflow-owned source context when `actuation.latestOperationId`
   points at a non-terminal operation but `coordinator.operation` is keyed by
   a newer removed row.
6. Repaired `src/control-plane/priority-recovery-snapshot-stage-3.js` so
   synthetic serial-wait source extraction overlays canonical summary
   workflow evidence onto mixed summary rows instead of dropping them as
   terminal.
7. Focused proof and touched-file guardrails passed after the repair.
8. Representative rerun
   `rolling-restart-after-mixed-summary-serial-wait-source-overlay-20260506T194741Z`
   failed by migration: the selected actionable operation-scheduling seam
   closed, and the live blocker reverted to startup active-gate snapshot
   coverage `3/5` plus workflow-owned serial wait on `sql_transactions-p1`
   and `sql_write_operations-p1`.

## Validation

1. Focused `204900Z` fixture passes.
2. Focused owner-boundary regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the epoch `2` startup active-gate snapshot-coverage / priority
   operation scheduling boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
