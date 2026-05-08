# Rolling Restart Priority Recovery Serial-Wait Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "closed": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-stale-serial-wait-release-20260506T140814Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-stale-serial-wait-release-20260506T140814Z/rolling-restart/",
  "owner": "Operation workflow owner serial-wait release",
  "boundary": "Priority recovery serial-wait workflow progress",
  "dominantReason": "priority_operation_serial_wait",
  "currentState": "Later terminal predecessor evidence no longer keeps sql_write_operations-p1 latched behind serial wait; the representative blocker migrated back to startup publication convergence.",
  "nextAction": "Use successor startup publication owner-RPC repair package for the current representative blocker.",
  "proof": [
    "Focused stale serial-wait release regression",
    "Replay proof",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot.js",
    "test/control-plane/priority-recovery-snapshot.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-priority-recovery-operation-scheduling-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Priority Recovery Operation Scheduling Reentry](./done-20260506-rolling-restart-priority-recovery-operation-scheduling-reentry.md)
closed by migration. The representative rerun no longer terminates on
priority recovery operation scheduling. It now stalls after operation
creation on workflow progress: `sql_write_operations-p1` still reports
`needs_operation`, but the dominant blocker is now
`priority_operation_serial_wait` under `operation_workflow_owner`.

Closure update on May 6, 2026: the focused stale-serial-wait release
regression now proves later terminal predecessor evidence no longer keeps
`sql_write_operations-p1` latched behind
`priority_operation_serial_wait`, and the representative rerun
`test-output/reports/rolling-restart-after-priority-recovery-stale-serial-wait-release-20260506T140814Z.report.json`
no longer selects priority-recovery workflow progress as the dominant owner
seam. The live blocker migrated back to startup/publication convergence:
epoch `4` `ACK_PENDING`, pending ACK node
`11601fe0-72d6-5853-8590-ec2881853e72`, selected snapshot coverage `1/5`,
and owner-RPC `nodes` repair remains deferred/failing against seed
`7493b0ab-a054-5fad-a91b-5e331db29304`. That new representative boundary is
tracked in
[Rolling Restart Startup Publication ACK-Pending Owner-RPC Nodes Repair Reentry](./done-20260506-rolling-restart-startup-publication-ack-pending-owner-rpc-nodes-repair-reentry.md).

## Closing Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-stale-serial-wait-release-20260506T140814Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-stale-serial-wait-release-20260506T140814Z/rolling-restart/`.
3. Result: failed after `133.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `startup`.
6. Dominant reason: `pending_ack_nodes`.
7. Failure class: `publication_convergence_blocked`.
8. Priority recovery is closed predecessor context for this boundary:
   replayed closure is `closure_satisfied_fresh`, all tracked priority
   partitions are `converged` or `spread_satisfied_in_flight`, and
   `sql_write_operations-p1` is terminal-completed on operation
   `b3d55d51-363f-46cf-9ff2-f4aecfcf3de0` with no serial-wait witnesses.
9. Publication convergence is the live blocker: epoch `4` `ACK_PENDING`,
   pending ACK node `11601fe0-72d6-5853-8590-ec2881853e72`, blocked node count
   `0`, and recovery protocol state `publication_pending`.
10. Active-gate progress stalls at active `3/5`, selected snapshot coverage
    `1/5`, selected snapshot node `35a...` via `admin_health`, selected
    published active nodes `11601...` / `7493...`, and selected missing
    published nodes `35a...`, `8be8...`, and `ebc4...`.
11. The surfaced owner contract is explicit: selected snapshot observation is
    `available`, `repair_deferred`, and `stale_usable`, while the retained
    owner-RPC repair evidence keeps table `nodes` on `owner_rpc_lane` with
    `pressure_or_timeout` against seed `7493b0ab-a054-5fad-a91b-5e331db29304`.
12. Replay classification is `changed`: durable publication state remains
    epoch `4` `ACK_PENDING` with closure record `CL-003`, while replay keeps
    `publication_pending` on retained selected-snapshot evidence rather than
    reopening priority-recovery workflow debt.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Trace why workflow serial wait remains latched after the predecessor
   priority recovery operation reaches a terminal satisfied state.
2. Prove whether `sql_write_operations-p1` is blocked by stale serial-lane
   bookkeeping, stale operation visibility, or a stronger workflow-progress
   contract that has not been surfaced canonically.
3. Add focused owner-path regressions or fixtures before the next
   representative rerun.
4. Record blocker migration immediately if the representative path moves
   again.

## Out Of Scope

1. Reopening the closed operation-scheduling package unless the
   representative path re-enters `rebalancer_leader / operation_scheduling`.
2. Broad matrix continuation before the five-node representative path passes
   or migrates to a new named owner boundary.
3. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `operation_workflow_owner` serial-wait release and workflow progression for
   priority recovery add-like lifecycles.
2. `rebalancer_leader` only as predecessor context now that follow-up
   operation creation no longer dominates.

Canonical contract shape:

1. Once the predecessor priority recovery operation has reached a terminal
   satisfied state, serial wait must either clear and admit the next blocked
   partition or emit one explicit stronger blocker that outranks
   `priority_operation_serial_wait`.
2. `sql_write_operations-p1` must not remain `needs_operation` on a
   workflow-progress boundary while the predecessor partition only appears as
   historical satisfied context.
3. Failure bundle, replay, and sprint bookkeeping must agree on one canonical
   selected blocker for this rerun.

## Residual Closure Inventory

- [x] Capture the owner path that keeps `sql_write_operations-p1` on
      `priority_operation_serial_wait`.
- [x] Explain whether serial-wait state is stale bookkeeping from
      `sql_transaction_participants-p1` operation
      `7cfa5968-b992-4f93-80c5-f7127a3e345c` or a still-live workflow
      dependency.
- [x] Add focused tests or fixtures for the selected workflow-progress
      serial-wait boundary.
- [x] Run focused verification, replay, and one representative
      `rolling-restart` rerun.

## Validation

1. Focused workflow-progress owner-path tests pass.
2. Touched-file guardrails are rerun and recorded.
3. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit blocker migration notes.

## Done When

1. The representative path either clears the serial wait and advances the
   next priority recovery operation, or migrates to a different named owner
   boundary with replayable evidence.
2. Sprint bookkeeping points to the successor startup/publication ACK-pending
   owner-RPC repair package as the sole current representative owner.
