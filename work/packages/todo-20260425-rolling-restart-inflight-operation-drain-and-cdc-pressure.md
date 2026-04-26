# Rolling Restart In-Flight Operation Drain And CDC Pressure

Status: todo on April 25, 2026. This remains valid if `rolling-restart`
returns to placement-converged post-active operation drain after the active
operation transition and over-target blocker closes.

## Why

The April 25 `rolling-restart` rerun after the STOPPING visibility-pressure
fix moved the blocker again:

1. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-stopping-visibility-defer.report.json`
2. the scenario still fails with `Convergence timeout after 120000ms`
3. failover, publication convergence, and restart recovery gates are closed
4. every expected partition has target voter count `3`
5. `Max over-target` is `0ms`, and over-target durations are empty
6. the remaining hard evidence is operation drain: `In-flight replica
   operations: 4`, statuses `active=3`, `removing=1`, `pending=2`, with
   historical terminal rows also visible
7. the dominant witness is `control_plane_publications-p1` in
   `spread_satisfied_in_flight`, `workflowState=in_flight`,
   `latestOperationWorkflowStep=SENDING`, and `latestOperationStatus=pending`
8. logs show CDC and control-plane pressure while operation rows are being
   updated: retryable transition failures, CDC SQL participant failures,
   out-of-order CDC events, owner-query pressure, and router message timeouts

This closes the previous over-target-voter symptom for the representative run.
The current boundary is now operation drain under CDC/transport pressure after
voter topology has already converged.

## April 25 Continuation Update

The cache-visible source-removal duplicate-admission fence was implemented and
focused-tested. The representative rerun
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-cache-visible-source-removal-fence.report.json`
moved the blocker out of post-restart operation drain and back to the
restarted-node readiness barrier: the node was bootstrap-reachable, but
`adminReady=false`, `controlPlaneRecoveryReady=false`, and the admin API probe
reported `ECONNREFUSED`.

A follow-up diagnostics slice exposed the bootstrap join projection blocker in
the restart-readiness error. The rerun
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-bootstrap-join-projection-diagnostics.report.json`
still fails restart readiness, but now names
`bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`.

That split is now closed. The latest representative rerun returned to
post-active topology convergence with over-target voters, so the current active
execution split is
[Rolling restart operation transition pressure and over-target trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling restart operation transition pressure and over-target trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)
2. [Critical replace operation lifecycle convergence owner](./todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md)
3. [Critical recovery pressure reserve and admission contract](./done-20260424-critical-recovery-pressure-reserve-and-admission-contract.md)

## In Scope

1. Drain pending `SENDING` and `ACTIVE` replacement rows once voter placement is
   already converged.
2. Prevent duplicate add-like replacements for one entity while source removal
   is cache-visible but authoritative entity visibility is deferred.
3. Preserve retryable CDC/write pressure as a bounded deferred state instead
   of minting extra replacement rows.
4. Distinguish terminal historical failures from current in-flight blockers in
   operation-drain diagnostics.
5. Rerun `rolling-restart` once the duplicate-admission and drain fixes are
   focused-tested.

## Out Of Scope

1. Increasing convergence timeout budgets.
2. Treating target voter count alone as strict convergence.
3. Harness-only ignores for current in-flight operations.
4. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  operation workflow owner and rebalancer create-admission owner.
- Canonical contract:
  once voter topology is converged, operation convergence is blocked only by
  current non-terminal work that can still change topology or by explicit
  pressure/deferred visibility evidence.
- Allowed consumers:
  strict convergence, priority recovery observation, rebalancer admission,
  operation drain diagnostics, and failure bundles.
- Prohibited reinterpretations:
  cache-visible source-removal work must not be ignored during deferred
  authoritative entity reads; stale terminal failures must not be counted as
  current blockers; pending `SENDING` rows must not silently survive after
  their target replica is already active.

## Progress Grammar

1. `placement_converged_operation_pending` means all voter counts are at target
   while one operation row still needs a legal drain action.
2. `entity_source_removal_conflict_visible` means cache-visible source-removal
   work keeps the entity add-like lane closed while owner reads are deferred.
3. `cdc_transition_deferred` means the operation transition write/read is
   retryable under CDC or participant pressure.
4. `terminal_history_ignored` means failed or removed historical rows are
   recorded as context but not counted as current blockers.
5. `closed` means placement, current operation rows, and control-plane
   transition visibility are all converged.

## Residual Closure Inventory

- [x] Cache-visible source-removal conflicts block duplicate add-like creates
      when authoritative entity visibility is deferred.
- [ ] Pending `SENDING` replacement rows drain after target replica activation
      is already visible.
- [ ] `ACTIVE` replacement rows continue source removal after retryable CDC
      transition write failures.
- [ ] Operation-drain diagnostics name current non-terminal blockers
      separately from terminal historical failures.
- [x] `rolling-restart` passes or moves to a newly named owner boundary after
      the duplicate-admission fence.

## Validation

1. `node --check src/rebalancer/rebalance-coordinator-segment-3.js`
2. `node --check test/rebalancer/coordinator-dedup-gap.test.js`
3. `npm test -- test/rebalancer/coordinator-dedup-gap.test.js`
4. `npm test -- test/rebalancer/replace-replica-workflow.test.js`
5. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js`
6. `npm test -- test/rebalancer/rebalance-coordinator-topology-guard.test.js`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`

Executed on April 25, 2026:

1. `node --check src/rebalancer/rebalance-coordinator-segment-3.js`
2. Result: passed.
3. `node --check test/rebalancer/coordinator-dedup-gap.test.js`
4. Result: passed.
5. `npm test -- test/rebalancer/coordinator-dedup-gap.test.js`
6. Result: passed, `43/43`.
7. `npm test -- test/rebalancer/replace-replica-workflow.test.js`
8. Result: passed, `177/177`.
9. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js`
10. Result: passed, `207/207`.
11. `npm test -- test/rebalancer/rebalance-coordinator-topology-guard.test.js`
12. Result: passed, `13/13`.
13. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-cache-visible-source-removal-fence.report.json --fast-local --verbose`
14. Result: failed at restarted-node readiness with bootstrap health reachable
    but admin API closed.
15. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-bootstrap-join-projection-diagnostics.report.json --fast-local --verbose`
16. Result: failed at the same restart-readiness barrier, now naming
    `bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`.

## Done When

1. Strict post-restart convergence no longer times out solely on
   placement-converged operation rows.
2. Any remaining `rolling-restart` failure has a new owner boundary with voter
   topology and current operation-drain evidence separated.
