# Priority Spread Recovery Operation Creation Under Load

Status: active on April 26, 2026. The latest `rolling-restart` rerun moved
the representative blocker from post-active over-target trim back into
load-readiness priority-spread recovery operation creation/progression. The
current execution slice has closed the first two operation-creation symptoms
and exposed delivery-source saturation on `replica_operations` updates as the
next pressure boundary.

## Why

The April 25 ACK-complete-trim rerun closed the prior membership-publication
blocker:

1. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-ack-complete-trim.report.json`
2. publication epoch `4` is `PUBLISHED`
3. `pendingAckCount=0`
4. `publicationPending=false`
5. membership publication ACK debt and the zero-pending-ACK `OPEN` publication
   are no longer the terminal path

The remaining blocker is owner-visible priority recovery progress:

1. failure class `priority_recovery_progress_blocked`
2. recovery protocol state `priority_spread_pending`
3. progress class `eligible_but_no_operation_created`
4. semantic state `needs_operation`
5. blocked priority partitions include `sql_transaction_participants-p1` and
   `sql_transactions-p1`
6. `control_plane_publications-p1` and `replica_operations-p1` remain
   recovering in flight

This package owns the current blocker because the scenario fails during load
readiness before it can reach the queued post-active over-target barrier.

## April 26 Execution Update

The first execution slice made the priority recovery and membership target
decisions explicit, then reran the representative path:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-priority-closure-witness-followup.report.json`
2. `sql_transactions-p1` moved from `eligible_but_no_operation_created` to
   `spread_satisfied_in_flight`
3. the terminal blocker moved to `operation_created_but_no_step_transitions`
   on `replica_operations-p1` and `sql_write_operations-p1`

The second execution slice extended coordinator-created remote handoff retry
from emergency critical partitions to all priority control-plane partitions:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-priority-remote-handoff-retry.report.json`
2. publication epoch `10` reached `PUBLISHED`
3. publication pending ACKs were `0`
4. priority recovery blocked partition count was `0`
5. the scenario reached post-active topology convergence again
6. the remaining post-active blocker was one `sql_transactions-p1` replacement
   left `creating`, with `sql_transactions-p1` over target at voter count `4`

The third execution slice let priority partitions spend a saturated global
budget slot on one standalone-safe topology cleanup `REMOVE` before add-like
work:

1. `test-output/reports/runtime-stability-rolling-restart-20260426-codex-priority-cleanup-remove-budget.report.json`
2. `sql_transactions-p1` reached `currentCount=3,targetCount=3` after the
   replacement leader handoff completed
3. `sql_write_operations-p1` remains `eligible_but_no_operation_created`
4. the run failed during load readiness with
   `publication_convergence_blocked`, `priority_spread_pending`, and
   `snapshot_timeout`
5. logs show `query:update:replica_operations` saturating the delivery-source
   queue, with `pendingForSource=16` and `pendingSourceLimit=16`

The remaining owner boundary is no longer the missing `sql_transactions-p1`
operation or the post-active over-target remove. It is priority follow-up
operation admission for `sql_write_operations-p1` while
`replica_operations` update traffic is saturating the critical delivery source.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Priority recovery follow-up operation creation](./done-20260424-priority-recovery-followup-operation-creation.md)
2. [Critical recovery pressure reserve and admission contract](./done-20260424-critical-recovery-pressure-reserve-and-admission-contract.md)
3. [Rolling restart operation transition pressure and over-target trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

## In Scope

1. Make the priority-recovery snapshot expose one canonical admission outcome
   for `needs_operation` partitions during load readiness.
2. Ensure the unified rebalancer creates or progresses eligible priority
   recovery operations when owner evidence says
   `eligible_but_no_operation_created`.
3. Preserve in-flight recovery rows and pressure deferrals as explicit states,
   not absence or generic topology instability.
4. Keep membership-publication trim closure from reintroducing stale recovery
   cohorts or zero-pending-ACK `OPEN` publications.
5. Rerun `rolling-restart` and record whether the blocker closes or migrates.

## Out Of Scope

1. Increasing readiness or convergence timeouts.
2. Harness-only classification changes that hide owner-visible recovery debt.
3. Post-active over-target trim until the scenario reaches that barrier again.
4. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  priority recovery planning and unified rebalancer operation admission.
- Canonical contract:
  one priority recovery admission snapshot names publication state, partition
  semantic state, progress class, pressure state, in-flight operation evidence,
  operation-creation eligibility, and next required action.
- Allowed consumers:
  membership publication planning, unified rebalancer follow-up planning,
  recovery protocol diagnostics, and harness reporting.
- Prohibited reinterpretations:
  treating `needs_operation` as spread satisfied, deriving absence from
  `null` target state, or letting load-readiness pressure erase eligible
  operation creation.

## Progress Grammar

1. `spread_satisfied_in_flight` means the partition has an active recovery row
   and should be observed through operation progress.
2. `needs_operation` means owner evidence requires a recovery operation to be
   created or admitted.
3. `eligible_but_no_operation_created` means admission evidence permits action
   but no operation row exists.
4. `operation_creation_deferred` means an explicit pressure or owner-read state
   delays creation.
5. `closed` means priority spread is satisfied and unresolved priority
   recovery semantic counts are zero.

## Residual Closure Inventory

- [x] Top-level rolling-restart triage artifacts point at
      `runtime-stability-rolling-restart-20260426-codex-priority-cleanup-remove-budget`.
- [x] Priority recovery admission planning emits one canonical decision for
      publication-derived follow-up eligibility.
- [x] Membership publication target selection uses one decision table instead
      of branch-pile target fallback.
- [x] Membership publication target-node absence is represented by an explicit
      variant instead of a `null` domain sentinel.
- [x] Unified rebalancer creates or progresses operations for
      `sql_transaction_participants-p1` and `sql_transactions-p1` when the
      priority snapshot reports `needs_operation`.
- [x] Coordinator-created remote handoff retry covers non-emergency priority
      control-plane partitions.
- [x] Priority topology cleanup can use one saturated global budget slot for a
      standalone-safe over-target `REMOVE`.
- [ ] `sql_write_operations-p1` creates its follow-up operation when
      `query:update:replica_operations` traffic saturates the delivery-source
      queue.
- [x] The representative rerun either reaches the queued post-active
      over-target barrier or names the next owner boundary.

## Validation

1. `node scripts/check-guideline-decision-boundaries.js --json src/control-plane/membership-publication-planning.js src/control-plane/priority-recovery-snapshot.js`
2. `node scripts/check-runtime-grammar-contracts.js`
3. `npm test -- test/control-plane/membership-publication-coordinator.test.js test/control-plane/priority-recovery-snapshot.test.js`
4. `npm test -- test/rebalancer/unified-rebalancer.test.js`
5. `npm test -- test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
6. `node scripts/check-guideline-decision-boundaries.js --json src/rebalancer/unified-rebalancer-segment-4.js src/rebalancer/operation-workflow-owner-segment-1.js src/control-plane/membership-publication-planning.js src/control-plane/priority-recovery-snapshot.js`
7. `git diff --check -- src/control-plane/membership-publication-planning.js src/control-plane/membership-publication-coordinator.js src/control-plane/priority-recovery-snapshot.js src/rebalancer/unified-rebalancer-segment-4.js src/rebalancer/operation-workflow-owner-segment-1.js test/rebalancer/unified-rebalancer.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md work/packages/active-20260426-priority-spread-recovery-operation-creation-under-load.md work/packages/todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md`
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260426-codex-priority-remote-handoff-retry.report.json --fast-local --verbose`
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260426-codex-priority-cleanup-remove-budget.report.json --fast-local --verbose`

## Done When

1. Priority recovery operation admission has one canonical outcome for
   `needs_operation` under load readiness.
2. `rolling-restart` no longer fails with
   `priority_recovery_progress_blocked` / `eligible_but_no_operation_created`,
   or it migrates to a newly named owner boundary with this package's residual
   closure inventory updated.
