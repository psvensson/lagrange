# Rolling Restart Published Snapshot Coverage Priority Serial-Wait Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-publication-exclusion-filter-20260506T184523Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-publication-exclusion-filter-20260506T184523Z/rolling-restart/",
  "owner": "Startup snapshot coverage and priority workflow progress under published closure",
  "boundary": "Startup published snapshot-coverage / priority serial-wait workflow-progress reentry",
  "dominantReason": "priority_recovery_workflow_progress_transition_deferred",
  "currentState": "The publication ACK-pending admission blocker is closed: rolling-restart now reaches epoch 6 PUBLISHED with pending ACK count 0 and replica_operations-p1 spread-satisfied, but the active gate still times out at snapshot coverage 3/5 while sql_write_operations-p1 is held in priority serial wait behind sql_transaction_participants-p1 and the joiner at 8be8 repeatedly times out connecting to the seed and local parallel queries.",
  "nextAction": "Build the focused 184523Z published snapshot-coverage / priority serial-wait fixture, then decide whether the repair belongs to operation workflow progress visibility, startup snapshot reachability, or transport/query pressure.",
  "proof": [
    "Focused 184523Z published snapshot-coverage / serial-wait fixture",
    "Owner decision for workflow progress versus snapshot reachability",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-9.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-snapshot-stage-11.js",
    "src/transport/message-router-shared.js",
    "test/control-plane/priority-recovery-snapshot-core-08-test-cases.js",
    "test/control-plane/priority-recovery-snapshot.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-admission-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Publication ACK-Pending Rebalancer Handoff Admission Reentry](./done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-admission-reentry.md)
closed by migration. The publication-owned eligibility repair removed the epoch
`5` `ACK_PENDING` admission blocker, but the representative rerun now fails
later with `PUBLISHED` closure, incomplete snapshot coverage, and workflow-owned
serial wait still open.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-publication-exclusion-filter-20260506T184523Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-publication-exclusion-filter-20260506T184523Z/rolling-restart/`.
3. Result: failed after `132.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `topology`.
6. Failure class: `priority_recovery_progress_blocked`.
7. Dominant reason: `priority_recovery_workflow_progress_transition_deferred`.
8. Publication convergence now reaches epoch `6`, status `PUBLISHED`, pending
   ACK count `0`, blocked node count `0`, and
   `replica_operations-p1` / `sql_transactions-p1` are spread-satisfied.
9. The active gate still times out on blocker signature
   `snapshot_coverage=3/5|priority_recovery_progress_class=priority_operation_serial_wait`.
10. The selected snapshot node
    `8be8d30f-4499-5eed-865c-71b4d529a67a` reports published active count `2`
    and missing published node ids
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
    `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
11. Priority recovery witnesses now show `sql_write_operations-p1` in
    `needs_operation` with progress class `priority_operation_serial_wait`,
    serial-wait operation id `58a5b49b-c62c-4962-8a6c-789b0c50f148`, and serial
    wait partition `sql_transaction_participants-p1`.
12. `sql_transaction_participants-p1` remains
    `recovering_in_flight`, workflow-owned, `cache_visible`, and on
    `workflow_progress` with latest operation status `removed`.
13. Joiner logs on `8be8d30f-4499-5eed-865c-71b4d529a67a` show repeated
    websocket connection timeouts to seed
    `7493b0ab-a054-5fad-a91b-5e331db29304`, repeated
    `Failed to reconnect target node before delivery`, and parallel query
    timeouts on `SELECT * FROM nodes` / `services`.
14. The same joiner also reports
    `Missing canonical node_endpoints websocket address` for
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, suggesting snapshot-reachability
    debt beyond the closed publication ACK-pending boundary.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Build a focused `184523Z` fixture that preserves the `PUBLISHED`
   snapshot-coverage `3/5` active-gate signature plus the
   `sql_write_operations-p1` serial-wait witness.
2. Decide whether the canonical owner is operation workflow progress
   visibility, startup snapshot reachability, or transport/query pressure.
3. Repair only the selected owner path.
4. Preserve the closed publication ACK-pending admission exclusion regression.

## Out Of Scope

1. Reopening the epoch `5` `ACK_PENDING` admission blocker unless that exact
   signature re-enters.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Operation workflow progress owns the serial-wait boundary only while the
   predecessor workflow has current progress evidence and continues to explain
   the blocked priority spread.
2. Startup snapshot reachability owns the repair when the selected snapshot node
   cannot observe canonical published membership even after publication reaches
   `PUBLISHED`.
3. Transport/query pressure owns the repair only when connection timeouts or
   query timeouts explain the missing snapshot coverage or stalled workflow
   visibility.

Canonical contract shape:

1. Once publication reaches `PUBLISHED` with pending ACK count `0`, the closed
   admission blocker remains historical evidence only.
2. `priority_operation_serial_wait` must name one current predecessor operation
   and one serial-wait partition; it must not collapse back into an unqualified
   no-operation claim.
3. Snapshot-coverage disagreement must surface the exact missing published node
   ids from the selected snapshot node.
4. Transport/query failures must be named as transport/visibility evidence only
   when they explain the snapshot-coverage or workflow-progress boundary.

## Residual Closure Inventory

- [ ] Extract the `184523Z` published snapshot-coverage / serial-wait fixture.
- [ ] Decide the owner boundary: workflow progress, snapshot reachability, or
      transport/query pressure.
- [ ] Add the focused regression and repair the selected owner path.
- [ ] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Progress Notes

May 6 migration from publication ACK-pending admission:

1. Added a focused regression proving publication-owned fallback eligibility
   excludes projection-rejected pending-ACK nodes.
2. Repaired priority-recovery admission fallback eligibility in
   `src/control-plane/priority-recovery-snapshot-stage-9.js`,
   `src/control-plane/priority-recovery-snapshot-stage-10.js`, and
   `src/control-plane/priority-recovery-snapshot-stage-11.js`.
3. Focused proof and touched-file guardrails passed before the representative
   rerun.
4. Representative rerun
   `rolling-restart-after-priority-recovery-publication-exclusion-filter-20260506T184523Z`
   failed by migration: publication closed, but snapshot coverage remained
   `3/5` and priority recovery shifted to workflow-owned serial wait.

## Validation

1. Focused `184523Z` fixture passes.
2. Focused owner-boundary regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the `PUBLISHED` snapshot-coverage / priority serial-wait workflow
   boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
