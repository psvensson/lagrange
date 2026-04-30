# Rolling Restart Pre Load Priority Recovery Operation Creation Under Load Readiness

April 30 closure: the pre-load load-readiness package moved the
representative `rolling-restart --fast-local` path from missing priority
recovery operation creation to a later startup publication epoch and pending
operation progress boundary.

Original reference artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-fast-fail-load-readiness.report.json`

Original result: failed, `0/1` passed after `110.8s`.

Original terminal blocker:

1. load-readiness phase: pre-load readiness gate
2. root cause class: `topology`
3. dominant reason: `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
4. publication status: `ACK_PENDING`
5. pending ACK count: `2`
6. snapshot coverage: `5/5`
7. priority recovery progress class:
   `eligible_but_no_operation_created`
8. priority recovery semantic state: `needs_operation`
9. blocked partitions:
   `sql_transaction_participants-p1`, `sql_transactions-p1`

Closed boundary:

1. raw operation rows from authoritative paths now normalize partition identity
   from camel-case and snake-case operation fields before priority recovery
   readiness and planning decisions are made.
2. closure-witness follow-up operation creation now selects an unblocked
   `needs_operation` partition rather than spending the priority slot on a
   topology-blocked current-owner candidate.
3. publication planning now uses owner-RPC authoritative service evidence while
   a published priority spread gap remains pending, preventing stale cache-only
   service rows from hiding active priority service placement.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling Restart Load Readiness No Progress Fast Fail And Publication Gate Closure](./done-20260430-rolling-restart-load-readiness-no-progress-fast-fail-and-publication-gate-closure.md)
2. [Priority Spread Recovery Operation Creation Under Load](./done-20260426-priority-spread-recovery-operation-creation-under-load.md)
3. [Priority Operation Creation Local Mutation Gate Under Load](./done-20260426-priority-operation-creation-local-mutation-gate-under-load.md)
4. [Rolling Restart Priority Follow Up Under Transport Pressure](./done-20260427-rolling-restart-priority-follow-up-under-transport-pressure.md)

## Implementation

1. `src/rebalancer/operation-workflow-owner-segment-5.js` accepts raw
   operation rows whose partition identity is carried as `partition_id`,
   `entityId`, or `entity_id`, so planning-owned priority spread completion is
   not lost when operation evidence crosses repository boundaries.
2. `src/rebalancer/unified-rebalancer-segment-4.js` adds an explicit
   closure-witness follow-up selection model for `needs_operation` candidates,
   allowing the runtime to advance the partition that can actually create a
   recovery operation under a one-slot priority budget.
3. `src/control-plane/membership-publication-coordinator.js` preserves
   owner-local reads for normal publication listing, but switches membership
   evidence reads to `OWNER_RPC_PREFERRED` when priority spread remains pending
   and authoritative service evidence is required.

## Residual Closure Inventory

- [x] Reconstruct the current priority-recovery operation snapshot for the two
      blocked SQL transaction partitions.
- [x] Identify the canonical reason no operation is created or observed.
- [x] Add focused regression coverage for the operation-creation boundary.
- [x] Preserve no-progress, publication ACK, quiescence, and critical-spread
      evidence.
- [x] Rerun the representative path and record the migrated or closed blocker.

## Validation

1. `node --check src/rebalancer/operation-workflow-owner-segment-5.js`
2. `node --check test/rebalancer/rebalance-coordinator-operation-ownership-tail-test-cases.js`
3. `./node_modules/.bin/tap test/rebalancer/rebalance-coordinator-operation-ownership.test.js --grep "planning-owned priority spread completion"`
4. `./node_modules/.bin/tap test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
5. `node --check src/rebalancer/unified-rebalancer-segment-4.js`
6. `node --check test/rebalancer/unified-rebalancer.test.js`
7. `./node_modules/.bin/tap test/rebalancer/unified-rebalancer.test.js --grep "closure-witness needs_operation"`
8. `./node_modules/.bin/tap test/rebalancer/unified-rebalancer.test.js --grep "closure-witness|priority recovery active service visibility|terminal operation visibility|service cache visibility"`
9. `./node_modules/.bin/tap test/rebalancer/unified-rebalancer.test.js`
10. `node --check src/control-plane/membership-publication-coordinator.js`
11. `node --check test/control-plane/membership-publication-coordinator-tail-final-test-cases.js`
12. `./node_modules/.bin/tap test/control-plane/membership-publication-coordinator.test.js --grep "owner-rpc service evidence"`
13. `./node_modules/.bin/tap test/control-plane/membership-publication-coordinator.test.js`
14. `npm run audit:guideline:literals`
15. `npm run audit:guideline:decision-boundaries`
16. `npm run audit:runtime-grammar`
17. `git diff --check -- <touched files>`

Representative migration runs:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-priority-raw-operation-owner-row.report.json --verbose`
2. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-priority-closure-witness-candidate.report.json --verbose`
3. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-priority-authoritative-service-evidence.report.json --verbose`

Latest representative result: failed, `0/1` passed after `130.0s`, but
`eligible_but_no_operation_created` is no longer terminal. Publication is
`PUBLISHED`, pending ACK count is `0`, and the active blocker has migrated to
startup `publication_epoch_pending` with snapshot coverage `3/5` and a
cache-visible pending operation for `sql_write_operations-p1`.

## Done When

1. `eligible_but_no_operation_created` no longer remains the terminal
   load-readiness blocker without a canonical planner/admission reason.
2. Focused coverage proves the operation is created, observed, or explicitly
   declined through the owned decision table.
3. The representative `rolling-restart --fast-local` path passes or migrates to
   one named active package with current owner-state evidence.

Status: done. The representative blocker migrated to
[Rolling Restart Startup Publication Epoch Pending Operation Stalled](./done-20260430-rolling-restart-startup-publication-epoch-pending-operation-stalled.md).
