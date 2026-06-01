# Node-State Recovery Publication Coalescing

## Why

The latest distributed artifacts still show repeated `NODE_STATE_UPDATE` and
`heartbeat_recovery` churn while the control plane is already pressured. That
means the system is amplifying its own recovery traffic instead of collapsing
it behind one owner-held pending publication state.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Collapse repeated node-state recovery publications into one owned pending
   replacement contract per node/target key.
2. Reuse existing coalescing and deferred-publication mechanics instead of
   adding ad hoc retry suppression.
3. Emit diagnostics that distinguish replacement/coalescing from true backlog
   growth.

## Out Of Scope

1. Replica-operation visibility semantics.
2. Benchmark growth gating.
3. Generic retry tuning without owner-path coalescing.

## Invariants

1. Recovery publication retries must replace or merge, not accumulate.
2. Readiness-critical transitions must still bypass defer-only background
   behavior when required for correctness.
3. Diagnostics must preserve the difference between coalesced pending work and
   uncontrolled queue growth.

## Hotspots

1. `src/bootstrap/node-joining-service.js`
2. `src/control-plane/heartbeat-service.js`
3. `src/control-plane/replica-dispatch-service.js`
4. `test/bootstrap/node-joining-service.test.js`
5. `test/control-plane/replica-dispatch-node-state-update.test.js`

## Analysis Tasks

- [x] Confirm repeated recovery publication churn is still visible in the
  latest failure bundle.
- [x] Confirm current defer/retry paths still allow redundant pending
  publications for the same semantic update.

## Implementation Tasks

- [x] Define one canonical recovery-publication coalescing key/owner path.
- [x] Replace accumulation with replacement or merge semantics where safe.
- [ ] Add focused unit tests and middle-layer scenarios.
- [ ] Record progress and diagnostics expectations.

## Progress Notes

1. Confirmed the existing owner paths already coalesced deferred retries by
   node in `NodeJoiningService` and `ReplicaDispatchService`, but the
   transport pending queue still auto-replaced only Raft heartbeats and
   append-fail messages.
2. Extended `MessageRouter` pending replacement so repeated heartbeat-only
   `NODE_STATE_UPDATE` deliveries to the same target/node replace the older
   pending payload instead of stacking more queue work.
3. Focused validation is green in `test/transport/message-router.test.js`,
   `test/control-plane/replica-dispatch-node-state-update.test.js`, and the
   boundary-transition scenario suite.
4. Snapshot-lane `control_snapshot_local()` still leaked into authoritative
   published-membership recovery when the latest membership publication was
   `OPEN`, which contradicted the local-observation contract and matched the
   seed-side capture timeout family.
5. `AdminWebSocketAPI` and `AdminControlSnapshot` now keep snapshot-lane
   published-membership recovery on the local observation path unless the
   caller explicitly forces authoritative repair.
6. Focused validation is green in `test/admin/admin-websocket-api.test.js`,
   `test/admin/admin-control-snapshot.test.js`, and the
   boundary-transition scenario suite.
7. A bounded seven-node rerun no longer emits the old `capture.warning`
   snapshot/service-query timeout on the seed. The remaining live boundary is
   later control-plane pressure: `query_admission_deferred` on `nodes`
   publication writes, `replica_operations` read timeouts, and authoritative
   repair failure on `nodes` under backpressure.

## Validation

1. Focused `node-joining-service` and replica-dispatch tests.
2. Boundary-transition scenarios for recovery publication churn.

## Done When

1. Repeated heartbeat-recovery or node-state updates stop amplifying queue
   pressure under the same unresolved owner path.
2. Failure artifacts can show one pending/coalesced publication state instead
   of repeated equivalent retries.
