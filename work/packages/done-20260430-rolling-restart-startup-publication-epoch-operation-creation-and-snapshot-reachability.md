# Rolling Restart Startup Publication Epoch Operation Creation And Snapshot Reachability

April 30 activation: the pending-operation stalled package moved the
representative `rolling-restart --fast-local` path away from false
`operation_stalled` evidence. The current failure is a startup publication
epoch convergence boundary with one priority partition still requiring
operation creation and one selected control snapshot that times out during
reachability probing.

Reference artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-pending-owner-state.report.json`

Result: failed, `0/1` passed after `131.3s`.

Terminal barrier:

`Not all nodes reached ACTIVE state within 120000ms`

Observed boundary:

1. active gate mode: startup
2. root cause class: `topology`
3. failure class: `publication_convergence_blocked`
4. dominant reason: `publication_epoch_pending`
5. active gate state: `timed_out`
6. active nodes at terminal sample: `4/5`
7. active nodes at best-progress sample: `5/5`
8. selected snapshot node:
   `7493b0ab-a054-5fad-a91b-5e331db29304`
9. selected snapshot coverage: `4/5`
10. selected snapshot admin readiness: `false`
11. selected snapshot reachability error:
    `Control snapshot reachability probe timed out for 7493b0ab-a054-5fad-a91b-5e331db29304`
12. publication epoch: `4`
13. publication status: `ACK_PENDING`
14. pending ACK count: `1`
15. pending ACK node ids: empty
16. publication gate reasons:
    `priority_partitions_not_spread`, `publication_epoch_pending`
17. priority recovery progress class:
    `eligible_but_no_operation_created`
18. operation-creation partition: `sql_write_operations-p1`
19. operation-creation owner: `rebalancer_leader`
20. operation-creation next action: `create_recovery_operation`
21. workflow-owned in-flight partition: `sql_transactions-p1`
22. workflow-owned operation id:
    `f1616e8a-8094-49e7-bb64-70d7cfff49cd`
23. workflow-owned phase: `dispatch_pending`
24. workflow-owned step age: `5902ms`
25. workflow-owned step timeout: `30000ms`

The current package owns the next runtime boundary exposed by the migrated
representative failure: startup ACTIVE convergence must either create the
`sql_write_operations-p1` priority recovery operation, emit one canonical
scheduling/admission reason for not creating it, or identify the selected
snapshot reachability and publication ACK owner as the terminal blocker.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling Restart Startup Publication Epoch Pending Operation Stalled](./done-20260430-rolling-restart-startup-publication-epoch-pending-operation-stalled.md)
2. [Rolling Restart Pre Load Priority Recovery Operation Creation Under Load Readiness](./done-20260430-rolling-restart-pre-load-priority-recovery-operation-creation-under-load-readiness.md)
3. [Rolling Restart Load Readiness No Progress Fast Fail And Publication Gate Closure](./done-20260430-rolling-restart-load-readiness-no-progress-fast-fail-and-publication-gate-closure.md)
4. [Rolling Restart Startup Readiness Snapshot Gating](./done-20260427-rolling-restart-startup-readiness-snapshot-gating.md)

## In Scope

1. Reconstruct why `sql_write_operations-p1` remains
   `eligible_but_no_operation_created` with owner `rebalancer_leader` and next
   action `create_recovery_operation`.
2. Determine whether operation creation is blocked by readiness lease,
   topology operations in flight, admission pressure, dispatch queue state, or
   missing authoritative evidence.
3. Explain why publication epoch `4` remains `ACK_PENDING` with
   `pendingAckCount=1` while `pendingAckNodeIds` is empty.
4. Determine whether the selected snapshot reachability timeout is a cause of
   convergence failure, a symptom of the same pressure boundary, or stale
   harness selection evidence.
5. Preserve the young-pending workflow owner contract from the previous
   package: `sql_transactions-p1` must remain workflow-owned while its step age
   is below its step timeout.
6. Add focused regression coverage for the selected operation-scheduling,
   ACK-node, or snapshot-reachability owner boundary.
7. Rerun focused checks and the representative `rolling-restart --fast-local`
   path, recording whether the blocker passes or migrates.

## Out Of Scope

1. Increasing startup, publication convergence, load-readiness, quiescence, or
   operation step timeout budgets.
2. Reclassifying young workflow-owned `PENDING` work as stalled.
3. Treating `eligible_but_no_operation_created` as progress without a created
   operation or canonical non-creation reason.
4. Hiding `pendingAckCount` behind an empty node-id list without an explicit
   owner-state explanation.
5. Broad matrix execution before the representative 5-node path moves.
6. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  startup ACTIVE convergence, membership publication ACK accounting, selected
  control snapshot reachability, priority recovery operation scheduling, and
  rebalancer admission for `sql_write_operations-p1`.
- Canonical contract:
  if publication convergence is blocked by priority spread and ACK debt, the
  runtime must emit one normalized owner snapshot that names the required
  operation-scheduling action, ACK target, or snapshot reachability owner. A
  missing operation row must not be the final state without a reason from the
  scheduling owner.
- Allowed consumers:
  startup ACTIVE gate diagnostics, membership publication convergence,
  priority recovery progress summaries, operation scheduling diagnostics,
  selected snapshot reachability diagnostics, and failure bundles.
- Prohibited reinterpretations:
  do not widen timeouts, do not mask pending ACK debt by dropping node ids, and
  do not collapse operation scheduling, snapshot reachability, and publication
  ACK state into independent terminal symptoms.

## Residual Closure Inventory

- [x] Reconstruct the `sql_write_operations-p1` operation-scheduling decision
      from playback, rebalancer logs, and operation repository state.
- [x] Identify the canonical owner and reason for no recovery operation row.
- [x] Reconcile `pendingAckCount=1` with empty `pendingAckNodeIds`.
- [x] Explain the selected snapshot reachability timeout and whether it shares
      an owner with operation scheduling or publication ACK convergence.
- [x] Add focused regression coverage for the selected owner boundary.
- [x] Rerun the representative path and record the migrated or closed blocker.

## Validation

Focused checks:

1. `git diff --check -- src/control-plane/membership-publication-planning.js src/control-plane/publication-recovery-evidence.js src/control-plane/priority-recovery-observation-snapshot.js src/control-plane/priority-recovery-snapshot.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/membership-publication-coordinator.js test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator.test.js test/control-plane/priority-recovery-snapshot.test.js test/control-plane/replica-dispatch-node-state-update.test-part-4.js`
2. `./node_modules/.bin/eslint src/control-plane/membership-publication-planning.js src/control-plane/publication-recovery-evidence.js src/control-plane/priority-recovery-observation-snapshot.js src/control-plane/membership-publication-coordinator.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/priority-recovery-snapshot.js test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator.test.js test/control-plane/priority-recovery-snapshot.test.js`
3. `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js --grep 'caller timeout budgets|young pending work'`
4. `./node_modules/.bin/tap test/control-plane/replica-dispatch-node-state-update.test-part-4.js --grep 'authoritative CREATING|CREATING system-table rows'`
5. `./node_modules/.bin/tap test/control-plane/publication-recovery-evidence.test.js --grep 'pending ACK targets|count-only ACK debt|explicit empty required ACK list|retires stale closure diagnostics'`
6. `./node_modules/.bin/tap test/control-plane/membership-publication-coordinator.test.js --grep 'refreshes stale priority spread metadata'`

Result: passed.

Representative path:

`node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-operation-snapshot-reachability.report.json --fast-local --verbose`

Result: failed, `0/1` passed after `507.0s`, but this package's
startup publication boundary migrated. The new report reaches publication
epoch `7`, `PUBLISHED`, pending ACK count `0`, pending ACK nodes empty,
publication gate reasons empty, priority spread satisfied, blocked priority
partition count `0`, unresolved priority partition count `0`, and
`needs_operation` empty. The original `sql_write_operations-p1`
`eligible_but_no_operation_created` terminal state is no longer present.

The migrated blocker is control-plane quiescence:

`Control plane quiescence stalled for 35272ms (inFlightCount=2, leaderQuietElapsedMs=35272, nodeId=ebc4aa0b-06c6-506d-93ea-1dd2deca3f58, quiescenceState=quiescent, canonicalBlocker=none)`.

Migration target:

[Rolling Restart Quiescence Stale In Flight Canonical Blocker](./done-20260430-rolling-restart-quiescence-stale-inflight-canonical-blocker.md)

## Done When

1. `sql_write_operations-p1` no longer remains
   `eligible_but_no_operation_created` without a canonical owner-state reason.
2. Publication epoch `4` ACK debt either converges or reports the concrete ACK
   target/owner responsible for the remaining pending ACK count.
3. Selected snapshot reachability timeout is either closed or classified as the
   canonical terminal blocker with owner-state evidence.
4. The representative `rolling-restart --fast-local` path passes or migrates to
   one named active package with current owner-state evidence.

Status: done. The representative blocker migrated to
[Rolling Restart Quiescence Stale In Flight Canonical Blocker](./done-20260430-rolling-restart-quiescence-stale-inflight-canonical-blocker.md).
