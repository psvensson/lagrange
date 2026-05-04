# Rolling Restart Operation Workflow Publication ACK Reentry

Opened on May 4, 2026 after
[Rolling Restart Priority Recovery Actuation Active Gate Reentry](./done-20260504-rolling-restart-priority-recovery-actuation-active-gate-reentry.md)
closed the active-gate no-operation actuation presentation bug and the fresh
representative path migrated to operation workflow progress followed by
publication ACK reentry.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-priority-actuation-active-gate-reentry-final-20260504-codex.report.json`.
2. Failure bundle:
   `test-output/reports/.playback/rolling-restart-priority-actuation-active-gate-reentry-final-20260504-codex/rolling-restart/failure-bundle.json`.
3. Result: failed, `0/1` passed after `130.0s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Terminal progress moved past `eligible_but_no_operation_created` and
   reported `priorityRecovery=operation_created_but_no_step_transitions` with
   semantic states `operation_stalled|recovering_in_flight`.
6. Active-gate partition witnesses identify `operation_workflow_owner`,
   `workflow_progress`, and `wait_for_operation_progress` for
   `replica_operations-p1` and `sql_write_operations-p1`.
7. Publication reentered epoch `4` with status `OPEN`, pending ACK `2`, and
   pending ACK nodes:
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
8. The active-gate selected snapshot still has `snapshot_coverage=3/5` and a
   selected snapshot reachability timeout.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
topology workflow stabilization, failure simulations, and production
guarantees.

## In Scope

1. Decide whether epoch `4` publication ACK reentry is current runtime debt or
   selected-snapshot projection debt after operation workflow progress.
2. Trace why operation workflow progress does not carry a terminal owner
   classification when publication is `OPEN`.
3. Preserve the fixed active-gate no-operation actuation classification.
4. Keep startup seed-contact and publication closure regressions covered.

## Out Of Scope

1. Harness timeout increases.
2. Post-active over-target trim until the representative path reaches that
   boundary again.
3. Pro or Enterprise behavior.

## Validation

1. Focused fixture for operation workflow progress plus publication ACK reentry.
2. Failure-bundle playback/regeneration for the final representative report.
3. Static guardrails for touched files.
4. One representative `rolling-restart --fast-local` rerun.

## Done When

1. The final representative path either reaches ACTIVE convergence or reports
   one canonical owner boundary for the epoch `4` reentry without regressing
   active-gate no-operation actuation classification.
