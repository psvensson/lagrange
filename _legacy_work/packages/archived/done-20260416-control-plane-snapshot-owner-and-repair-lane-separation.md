# Control-Plane Snapshot Owner And Repair-Lane Separation

## Why

The remaining late distributed failure family is no longer a seed-startup bug.
It is a control-plane truth loop:

1. node-state and membership publication are already trying to converge through
   owner-held deferred queues
2. readiness, admin snapshot, and service discovery still reopen
   authoritative multi-table repair from the read path when cache evidence is
   stale or incomplete
3. under pressure, those reads compete with the same control-plane capacity
   needed for publication and `replica_operations` visibility, so the system
   slows by making the same boundary do more work

Recent fixes removed earlier blind spots, but the boundary is still porous.
This package closes it by making one snapshot owner the only truth surface for
startup, readiness, admin visibility, and harness convergence.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define one control-plane snapshot owner for publication state, node
   membership, leader coverage, replica-operation visibility, freshness, and
   retry metadata.
2. Move synchronous authoritative multi-table repair out of
   `control_snapshot`, service discovery, and readiness read paths and into
   owner-held reconcile work.
3. Give snapshot consumers one bounded outcome model:
   fresh, stale-but-usable, deferred-refresh, or failed.
4. Reserve stricter admission for critical convergence work such as
   `NODE_STATE_UPDATE`, membership publication, and authoritative
   `replica_operations` visibility than for diagnostics, broad repair, and
   observability reads.
5. Cut startup gate, readiness, admin snapshot, service discovery, and harness
   convergence consumers over to the same owner snapshot instead of local
   repair heuristics.
6. Record owner-map and architecture updates for the consolidated boundary.

## Out Of Scope

1. A transport redesign beyond the existing queue-partition and pressure-owner
   model.
2. Repo-wide contract inversion outside the control-plane snapshot boundary.
3. Broad hotspot refactors unrelated to startup/readiness/admin/discovery
   truth acquisition.
4. New product or roadmap scope.

## Invariants

1. Readers must not perform synchronous authoritative multi-table repair on the
   hot path.
2. Under pressure, the control plane may return stale or deferred snapshot
   outcomes, but it must not degrade into empty visibility, timeout-only
   silence, or absence-shaped publication state.
3. Critical convergence writes and authoritative operation visibility must keep
   a higher admission class than diagnostics, observability, or broad repair.
4. Startup, readiness, admin snapshot, service discovery, and harness
   convergence must consume one semantic snapshot owner for this boundary.
5. Snapshot freshness, revision, reasons, and retry timing must be explicit so
   callers can wait, degrade, or fail without reconstructing local state.

## Hotspots

1. `src/control-plane/control-plane-readiness-service.js`
2. `src/control-plane/membership-publication-coordinator.js`
3. `src/control-plane/control-plane-system-table-gateway.js`
4. `src/control-plane/replica-dispatch-service.js`
5. `src/bootstrap/control-plane-write-health-owner.js`
6. `src/admin/admin-control-snapshot.js`
7. `src/admin/admin-service-discovery.js`
8. `test/control-plane/control-plane-readiness-service.test.js`
9. `test/control-plane/replica-dispatch-node-state-update.test.js`
10. `test/admin/admin-control-snapshot.test.js`
11. `test/admin/admin-control-snapshot-response-contract.test.js`
12. `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`
13. `test/distributed/harness/__tests__/failure-bundle.test.js`
14. `test/distributed/harness/cluster.js`

## Analysis Tasks

- [ ] Inventory every current read path that can still trigger authoritative
  repair for startup, readiness, admin snapshot, or discovery.
- [ ] Define one canonical snapshot schema and one explicit outcome model for
  fresh, stale, deferred, and failed observation.
- [ ] Build the admission matrix that separates critical convergence work from
  background repair and observability work.
- [ ] Confirm which existing active packages are subsumed by this boundary and
  which remain independent.

## Implementation Tasks

- [ ] Add guardrail tests first for stale-but-usable and deferred-refresh
  snapshot outcomes.
- [ ] Introduce one control-plane snapshot owner and route all named consumers
  through it.
- [ ] Move read-side authoritative repair into owner-held reconcile work with
  explicit retry and freshness metadata.
- [ ] Reclassify snapshot repair and observability reads so they cannot consume
  the same effective lane as critical convergence work.
- [ ] Delete or downgrade consumer-local repair heuristics once the owner path
  is live.
- [ ] Update owner maps, architecture notes, and harness diagnostics to name
  the new snapshot boundary directly.

## Validation

1. Focused owner tests:
   `node test/control-plane/control-plane-readiness-service.test.js`,
   `node test/control-plane/replica-dispatch-node-state-update.test.js`,
   `node test/admin/admin-control-snapshot.test.js`,
   `node test/admin/admin-control-snapshot-response-contract.test.js`
2. Middle layer:
   `npm run test:distributed:boundary:transition`,
   `node test/distributed/harness/__tests__/failure-bundle.test.js`
3. Harness consumer gate:
   targeted startup/readiness assertions in `test/distributed/harness/cluster.js`
   plus any focused harness unit coverage added by the package
4. Distributed reruns in this order:
   one seven-node transaction-recovery checkpoint,
   adjacent control-plane recovery scenarios if needed,
   full harness sweep only after the checkpoint turns green

## Done When

1. One control-plane snapshot owner is the only semantic read surface for the
   startup/readiness/admin/discovery boundary.
2. Read-side authoritative repair no longer runs synchronously from snapshot
   consumers.
3. Critical convergence work keeps making progress under the same pressure
   conditions that previously caused reader-triggered repair loops.
4. Harness artifacts report explicit snapshot freshness and deferred reasons
   instead of `publication=unknown` with caller-local interpretation.
5. Remaining follow-up work, if any, is narrower than this boundary and split
   into separate package files.

## Current Status

### Implemented

1. Added the shared control-plane snapshot owner and cut
   `control_snapshot_local()` and service-discovery readers over to explicit
   `fresh`, `stale_usable`, and `deferred_refresh` observation states.
2. Moved non-forced admin snapshot and discovery repair off the synchronous
   read path; those readers now schedule owner-held repair instead of blocking
   on multi-table authoritative refresh.
3. Updated harness/admin consumers so stale snapshot observations do not cache
   retryable blocked answers as if they were fresh.
4. Added focused owner/admin regressions and kept the boundary-transition layer
   green after the cutover.

### Verified

1. `node test/control-plane/control-plane-snapshot-owner.test.js`
2. `node test/admin/admin-control-snapshot.test.js`
3. `node test/admin/admin-service-discovery.test.js`
4. `node test/admin/admin-websocket-api.test.js`
5. `node test/control-plane/control-plane-readiness-service.test.js`
6. `node test/control-plane/replica-dispatch-node-state-update.test.js`
7. `node test/admin/admin-control-snapshot-response-contract.test.js`
8. `node test/distributed/harness/__tests__/failure-bundle.test.js`
9. `npm run test:distributed:boundary:transition`

### Remaining Live Boundary

The first seven-node transaction-recovery rerun after this cut moved materially
later and reached `cluster_active`, but it did not finish green. The remaining
live failure family is now narrower than this package:

1. message-group strict CDC forwarding can still repair a leader address and
   then reject the same path as `leader unknown`
2. that leaves `nodes` and `partitions` CDC updates buffered on the seed
3. publication and `replica_operations` reads then fall into
   `query_admission_deferred` / timeout pressure
4. joiners later report canonical partition leader metadata missing for
   `sql_transactions-p1`

That residual should be split into a follow-up package around message-group
leader identity / CDC forwarding convergence rather than reopening the snapshot
owner boundary.
