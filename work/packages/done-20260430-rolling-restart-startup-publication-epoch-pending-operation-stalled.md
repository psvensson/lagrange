# Rolling Restart Startup Publication Epoch Pending Operation Stalled

April 30 closure: the package fixed the false stalled-operation
classification for young startup priority recovery operations and preserved
the owner-state evidence through failure-bundle normalization. The
representative `rolling-restart --fast-local` path now migrates to a fresh
operation-scheduling and snapshot-reachability boundary instead of reporting
`operation_created_but_no_step_transitions` for an operation that is still
inside its workflow-owned timeout budget.

Original reference artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-priority-authoritative-service-evidence.report.json`

Original result: failed, `0/1` passed after `130.0s`.

Original terminal barrier:

`Cluster ACTIVE wait stalled with no meaningful progress for 5 attempts`

Original observed boundary:

1. active gate mode: startup
2. root cause class: `publication_convergence_blocked`
3. dominant reason: `publication_epoch_pending`
4. active nodes: `5/5`
5. selected snapshot coverage: `3/5`
6. publication status: `PUBLISHED`
7. publication epoch: `3`
8. pending ACK count: `0`
9. published active nodes: `3/5`
10. missing published nodes:
    `8be8d30f-58c5-5170-93f6-9e56d040a7a5`,
    `ebc4aa0b-4393-584a-9c25-bafbb7891666`
11. publication gate reasons:
    `priority_partitions_not_spread`, `publication_epoch_pending`
12. priority recovery progress class:
    `operation_created_but_no_step_transitions`
13. priority recovery semantic state: `operation_stalled`
14. blocked partition: `sql_write_operations-p1`
15. operation witness:
    `dbbc250c-aec0-40eb-9637-8194f955bfea`
16. operation status: `pending`
17. workflow step: `PENDING`
18. operation visibility: `cache_visible`

Closed boundary:

1. Young priority recovery operations in `PENDING`/`CREATING` with no timeline
   transitions are now classified from an explicit operation-transition state
   model. Operations inside the step timeout remain workflow-owned
   `recovering_in_flight` instead of being reported as `operation_stalled`.
2. Membership publication and replica-dispatch retry discovery now use the
   union of authoritative and cache-visible operation evidence, so ready-node
   retry candidates are not lost when one evidence surface is stale or under
   pressure.
3. Failure-bundle normalization now preserves priority-recovery progress and
   actuation owner fields, so migrated failures carry the canonical owner,
   next action, wait mode, workflow phase, and timeout evidence.
4. Non-blocking `converged` and `spread_satisfied_in_flight` witnesses no
   longer become root-cause evidence solely because owner-state fields are
   present.

Representative migration artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-pending-owner-state.report.json`

Latest result: failed, `0/1` passed after `131.3s`, but the original stalled
operation classification is closed. `operation_stalled` is empty, the
workflow-owned young pending operation is reported as `recovering_in_flight`,
and the new terminal blocker is `eligible_but_no_operation_created` for
`sql_write_operations-p1` plus selected-snapshot reachability timeout on node
`7493b0ab-a054-5fad-a91b-5e331db29304`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling Restart Pre Load Priority Recovery Operation Creation Under Load Readiness](./done-20260430-rolling-restart-pre-load-priority-recovery-operation-creation-under-load-readiness.md)
2. [Rolling Restart Load Readiness No Progress Fast Fail And Publication Gate Closure](./done-20260430-rolling-restart-load-readiness-no-progress-fast-fail-and-publication-gate-closure.md)
3. [Rolling Restart Startup Readiness Snapshot Gating](./done-20260427-rolling-restart-startup-readiness-snapshot-gating.md)
4. [Rolling Restart Priority Follow Up Under Transport Pressure](./done-20260427-rolling-restart-priority-follow-up-under-transport-pressure.md)

## In Scope

1. Reconstruct the created `sql_write_operations-p1` recovery operation from
   the report, playback bundle, operation repository, and rebalancer logs.
2. Identify why the cache-visible pending operation does not transition from
   `PENDING` during startup convergence.
3. Identify why publication epoch convergence remains pending with active
   nodes `5/5`, pending ACK count `0`, and selected snapshot coverage `3/5`.
4. Preserve the operation-creation, closure-witness, owner-RPC service
   evidence, no-progress, and publication ACK evidence from prior packages.
5. Add focused coverage for the owned non-transition or dispatch-readiness
   boundary that explains the pending operation.
6. Rerun focused checks and the representative `rolling-restart --fast-local`
   path, recording whether the blocker passes or migrates.

## Out Of Scope

1. Increasing startup, publication convergence, load-readiness, or quiescence
   timeout budgets.
2. Treating `PENDING` priority recovery operations as progress without an
   owned transition, dispatch, or non-transition reason.
3. Reopening missing-operation-creation blockers without fresh owner evidence.
4. Broad matrix execution before the representative 5-node path moves.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  startup ACTIVE convergence, membership publication epoch coverage, priority
  recovery operation dispatch, and operation workflow progression for
  `sql_write_operations-p1`.
- Canonical contract:
  when startup publication convergence is blocked by a priority recovery
  operation that exists and is cache-visible, the runtime must either progress
  the operation from `PENDING`, emit one explicit owned non-transition reason,
  or classify the publication epoch gap as the canonical owner-state blocker.
- Allowed consumers:
  startup ACTIVE gate diagnostics, membership publication convergence,
  priority recovery progress summaries, operation workflow diagnostics, and
  failure bundles.
- Prohibited reinterpretations:
  do not mask a pending operation with timeout increases, do not collapse
  publication epoch debt into generic topology failure, and do not classify
  independent dispatch guards as the terminal outcome without one normalized
  snapshot.

## Implementation

1. `src/control-plane/priority-recovery-snapshot.js` adds an explicit
   operation-transition evidence model and decision table for no-transition
   operations. The model separates young workflow-owned work from overdue or
   unknown no-transition blockers before emitting priority recovery semantic
   states.
2. `src/control-plane/membership-publication-coordinator.js` builds ready-node
   retry evidence from authoritative and cache-visible operation rows before
   deciding whether publication-owned retry work is already represented.
3. `src/control-plane/replica-dispatch-service-segment-2.js` applies the same
   authoritative/cache union when replaying ready-node retry discovery.
4. `test/distributed/harness/failure-bundle-segment-1.js`,
   `test/distributed/harness/failure-bundle-segment-2.js`, and
   `test/distributed/harness/priority-recovery-summary-normalization.js`
   preserve owner-state details while filtering non-blocking satisfied
   witnesses from root-cause progress summaries.
5. Focused tests cover the ready-node retry union, the young pending
   operation owner state, and failure-bundle preservation of progress and
   actuation evidence.

## Residual Closure Inventory

- [x] Reconstruct the `sql_write_operations-p1` pending operation witness from
      playback and runtime logs.
- [x] Identify the canonical owner of the `PENDING` non-transition.
- [x] Determine whether `publication_epoch_pending` is caused by operation
      dispatch, snapshot coverage, or publication planning evidence.
- [x] Add focused regression coverage for the selected owner boundary.
- [x] Rerun the representative path and record the migrated or closed blocker.

## Validation

1. `node --check src/control-plane/priority-recovery-snapshot.js`
2. `node --check test/control-plane/priority-recovery-snapshot.test.js`
3. `node --check test/distributed/harness/failure-bundle-segment-1.js`
4. `node --check test/distributed/harness/failure-bundle-segment-2.js`
5. `node --check test/distributed/harness/priority-recovery-summary-normalization.js`
6. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
7. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js --grep "young pending work|workflow-owned event-driven progress|timeout-reconcile-due"`
8. `node --test test/distributed/harness/__tests__/failure-bundle.test.js --test-name-pattern "preserves priority-recovery operation ids|replays playback snapshot priority-recovery evidence"`
9. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`
10. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
11. `./node_modules/.bin/tap test/control-plane/membership-publication-coordinator.test.js`
12. `./node_modules/.bin/tap test/control-plane/replica-dispatch-atomic-claim.integration.test.js`
13. `npm run audit:guideline:literals`
14. `npm run audit:guideline:decision-boundaries`
15. `npm run audit:runtime-grammar`
16. `git diff --check -- <touched files>`

Representative migration run:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-pending-owner-state.report.json --verbose`

Representative result: failed, `0/1` passed after `131.3s`, but the blocker
migrated. The active gate reports publication epoch `4`, status
`ACK_PENDING`, pending ACK count `1`, selected snapshot coverage `4/5`,
terminal snapshot reachability timeout, `eligible_but_no_operation_created`
for `sql_write_operations-p1`, and no `operation_stalled` partitions.

## Done When

1. Startup ACTIVE convergence no longer stalls with active nodes `5/5`,
   selected snapshot coverage `3/5`, pending ACK count `0`, and
   `publication_epoch_pending` without a canonical owner-state reason.
2. The `sql_write_operations-p1` pending operation either transitions from
   `PENDING` or emits one explicit owned non-transition reason.
3. The representative `rolling-restart --fast-local` path passes or migrates to
   one named active package with current owner-state evidence.

Status: done. The representative blocker migrated to
[Rolling Restart Startup Publication Epoch Operation Creation And Snapshot Reachability](./done-20260430-rolling-restart-startup-publication-epoch-operation-creation-and-snapshot-reachability.md).
