# Rolling Restart Startup Publication Membership Priority Recovery Coordination

Opened on May 4, 2026 after
[Rolling Restart Restart Recovery Control Snapshot Authority](./done-20260504-rolling-restart-restart-recovery-control-snapshot-authority.md)
closed by migration.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-restart-recovery-control-snapshot-authority-20260504-codex.report.json`
2. Result: failed, `0/1` passed after `130.5s`.
3. Root cause class: `topology`.
4. Dominant reason:
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`.
5. Failure class: `publication_convergence_blocked`.
6. Active gate mode: `startup`.
7. Active gate state: `timed_out`.
8. Terminal progress: active `4/5`, snapshot coverage `3/5`,
   publication `PUBLISHED`, pending ACK `0`, missing published active nodes
   `3`, priority spread pending, and priority recovery blocked partition count
   `4`.
9. Best progress: active `5/5`, snapshot coverage `3/5`, publication
   `PUBLISHED`, pending ACK `0`, missing published active nodes `2`, and
   priority recovery blocked partition count `4`.
10. Priority recovery semantic state:
    `coordination_mismatch` for `replica_operations-p1`,
    `sql_transactions-p1`, and `sql_write_operations-p1`.
11. Priority recovery blocker:
    `publication_recovery_eligible_but_coordinator_excludes_node` for
    `replica_operations-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1`.
12. Secondary blocker:
    `operation_created_but_no_step_transitions` for `sql_transactions-p1`.
13. Readiness delay: terminal selected-snapshot reachability timeout on
    `11601fe0-72d6-5853-8590-ec2881853e72`.
14. The previous `control_snapshot_authority_unavailable` /
    `admin_reachability_refused` restart-recovery blocker is not the terminal
    owner state in this artifact.

## Closure Evidence

Closed by migration on May 4, 2026.

1. Representative rerun:
   `test-output/reports/rolling-restart-startup-publication-membership-priority-recovery-coordination-20260504-codex.report.json`
2. Result: failed, `0/1` passed after `174.7s`.
3. The package blocker migrated: no terminal
   `publication_recovery_eligible_but_coordinator_excludes_node`,
   no `coordination_mismatch`, no pending ACK debt, and no missing published
   active node debt.
4. Publication was `PUBLISHED`, published active membership was `5/5`,
   pending ACK count was `0`, missing published active nodes were `0`, and
   selected snapshot coverage was `5/5`.
5. New owner boundary:
   `publication_converged_priority_spread_pending`, with
   `sql_write_operations-p1` in `eligible_but_no_operation_created` /
   `needs_operation` at the operation-scheduling boundary.
6. Follow-up package:
   [Rolling Restart Readiness Gate Priority Operation Creation Reentry](./done-20260504-rolling-restart-readiness-gate-priority-operation-creation-reentry.md).

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Make priority recovery admission/coordinator evidence agree for startup
   publication recovery instead of emitting
   `publication_recovery_eligible_but_coordinator_excludes_node`.
2. Preserve canonical operation-workflow ownership for operations that exist
   but have not yet stepped.
3. Keep publication missing-active diagnostics tied to the authoritative
   selected snapshot rather than stale top-level reconstruction.
4. Separate selected-snapshot reachability timeout from priority recovery
   coordination mismatch in the active-gate owner state.
5. Re-run focused priority recovery publication/coordinator tests and the
   representative `rolling-restart --fast-local` scenario.

## Out Of Scope

1. Reopening the restart-recovery control-snapshot authority fix.
2. Treating pending ACK `0` as publication closure while missing published
   active nodes remain.
3. Operation-transition or over-target voter trim.
4. Broad matrix reruns before the representative path passes or migrates.
5. Pro or Enterprise behavior.

## Shared Boundary Contract

Semantic owner:

1. priority recovery snapshot/admission evidence
2. priority recovery operation coordinator evidence
3. active-gate publication convergence diagnostics

Consumer:

1. distributed harness active gate and failure bundle classification

Contract:

1. A node that is publication-recovery eligible must be either selected by the
   coordinator, explicitly excluded with one canonical owner reason, or moved
   to a different terminal owner state.
2. An existing operation without step transitions must remain an
   operation-workflow owner state and must not be reported as missing operation
   creation for the same partition.
3. Publication convergence may stay open with pending ACK `0` when the selected
   snapshot still has missing published active nodes.
4. Snapshot reachability timeout is diagnostic evidence for the selected
   observation point; it must not mask the priority recovery coordination
   owner state.

## Progress Grammar

1. `publication_missing_active_node` means selected publication membership does
   not yet include every active node.
2. `publication_recovery_eligible_but_coordinator_excludes_node` means the
   recovery admission set and coordinator target set disagree.
3. `operation_created_but_no_step_transitions` means an operation exists but
   workflow progress has not reached a step transition.
4. `coordination_mismatch` means priority recovery has contradictory admission
   and coordinator evidence for one partition.
5. `closed` means startup active-gate publication convergence no longer blocks.
6. `migrated` means the representative path reaches a new named owner
   boundary.

## Residual Closure Inventory

- [x] Focused regression covers
      `publication_recovery_eligible_but_coordinator_excludes_node`.
- [x] Existing operation evidence and missing-operation evidence cannot both be
      terminal for the same partition.
- [x] Selected snapshot reachability timeout remains separate from priority
      recovery coordination classification.
- [x] Representative rerun no longer fails with startup active-gate
      `publication_missing_active_node` plus priority recovery
      `coordination_mismatch`.
- [x] Operation-transition / over-target trim re-enters only after this active
      gate closes or migrates.

## Validation

1. `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
2. `npm test -- test/control-plane/publication-recovery-evidence.test.js`
3. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
4. `node --check src/control-plane/priority-recovery-snapshot.js`
5. `git diff --check`
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`

## Execution Log

1. `npm test -- test/control-plane/priority-recovery-snapshot.test.js` passed.
2. `npm test -- test/control-plane/publication-recovery-evidence.test.js`
   passed.
3. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
   passed.
4. `node --check src/control-plane/priority-recovery-snapshot.js` passed.
5. `node --check src/control-plane/publication-recovery-evidence.js` passed.
6. `node --check test/distributed/harness/failure-bundle-segment-4.js`
   passed.
7. `node --test test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
   passed.
8. `git diff --check` passed.
9. Representative `rolling-restart --fast-local` rerun failed by migration to
   `sql_write_operations-p1` priority operation scheduling after the package
   blocker closed.
