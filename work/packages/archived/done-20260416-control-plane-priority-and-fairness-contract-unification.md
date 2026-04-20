# Control-Plane Priority And Fairness Contract Unification

## Why

The runtime now protects several critical control-plane paths under pressure,
but the protection is still partly expressed as targeted carve-outs:

1. emergency publication and `replica_operations` recovery have special
   reserved-lane handling
2. heartbeat/publication/readiness already distinguish some critical versus
   background work
3. admin snapshot, repair, observability, membership publication, leader
   establishment, and authoritative visibility reads still do not all share one
   universal work-class and fairness contract

Mature control planes usually make that policy global. This package turns the
current targeted fixes into one control-plane priority and fairness model.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define one shared control-plane work-class taxonomy for membership
   publication, leader establishment, heartbeat/node-state publication,
   authoritative operation visibility, readiness-critical reads, admin
   snapshots, repair, and observability.
2. Route `PressureGovernor`, heartbeat publication, control-plane gateway,
   rebalance coordinator, dispatch/publication owners, and snapshot/repair
   owners through that taxonomy.
3. Make fairness and degradation outcomes explicit in diagnostics and metrics.
4. Replace targeted emergency carve-outs with one explainable priority/fairness
   contract where possible.
5. Keep one reserved path for true critical convergence work while bounding
   observability and repair amplification.

## Out Of Scope

1. A transport queue redesign beyond the existing pressure-governor and queue
   partition model.
2. Product-facing API quota work.
3. Query-plane fairness outside the control-plane/runtime reliability scope.

## Invariants

1. All control-plane work classes must be named and owned once.
2. True critical convergence traffic must not compete on equal terms with
   repair, observability, or background diagnostics.
3. Degradation and defer outcomes must stay explicit rather than collapsing to
   silence or cache-only truth.
4. Fairness policy must be visible in diagnostics and tests, not only encoded
   in local conditionals.

## Hotspots

1. `src/control-plane/pressure-governor.js`
2. `src/control-plane/heartbeat-service.js`
3. `src/control-plane/replica-dispatch-service.js`
4. `src/control-plane/membership-publication-coordinator.js`
5. `src/control-plane/control-plane-system-table-gateway.js`
6. `src/control-plane/control-plane-snapshot-owner.js`
7. `src/rebalancer/rebalance-coordinator.js`
8. `test/control-plane/pressure-governor.test.js`
9. `test/control-plane/replica-dispatch-node-state-update.test.js`
10. `test/admin/admin-control-snapshot.test.js`
11. `test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
12. `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`

## Analysis Tasks

- [ ] Inventory all current control-plane write/read/repair/diagnostic work
  classes and their local pressure behavior.
- [ ] Define one fairness taxonomy and the exact actions allowed under allow,
  degrade, defer, and reject for each class.
- [ ] Confirm which current emergency carve-outs can be replaced by the shared
  taxonomy and which remain true exceptions.
- [ ] Confirm the diagnostics and metric surfaces needed so harness triage can
  see fairness decisions directly.

## Implementation Tasks

- [ ] Add one shared control-plane priority/fairness contract owner or schema.
- [ ] Route pressure-governor consumers through the same work-class taxonomy.
- [ ] Align heartbeat/publication, authoritative visibility reads, snapshot
  repair, and admin diagnostics with that contract.
- [ ] Remove or narrow targeted carve-outs that become redundant once the
  shared fairness policy is live.
- [ ] Add focused and boundary-transition regressions that prove critical
  convergence still moves while observability and repair degrade.

## Progress Notes

1. `ControlPlaneSystemTableGateway` now applies workload-class defaults even
   when callers also use read profiles, so the shared workload contract owns
   work class, degrade/defer policy, and fairness resource keys instead of
   leaving repair-profile defaults to win implicitly.
2. Gateway read telemetry and operation-ledger entries now keep the explicit
   `workloadClass` visible alongside `workClass`.
3. Focused coverage now proves admin-diagnostic reads preserve the background
   workload contract instead of inheriting critical repair defaults solely from
   `repair_required`.
4. Bootstrap-owned control-plane reads and mutations now use explicit shared
   bootstrap workload classes instead of hard-coded critical pressure values,
   so bootstrap admission participates in the same taxonomy as the rest of the
   control plane.
5. Residual tail consumers now use the shared workload contract too:
   authoritative control-plane view, unified rebalancer budget reads,
   replica-operation repository reads and mutations, and node metadata budget
   registration all emit named workload classes instead of raw local
   `workClass` decisions alone.

## Validation

1. `node test/control-plane/pressure-governor.test.js`
2. `node test/control-plane/replica-dispatch-node-state-update.test.js`
3. `node test/control-plane/authoritative-control-plane-view.test.js`
4. `node test/rebalancer/unified-rebalancer.test.js`
5. `node test/rebalancer/replica-operation-repository.test.js`
6. `node test/rebalancer/node-storage-budget-service.test.js`
7. `node test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
8. `node test/admin/admin-control-snapshot.test.js`
9. `node test/bootstrap/bootstrap-api.test.js`
10. `npm run test:distributed:boundary:transition`

## Done When

1. Control-plane work classes and fairness rules are owned once and consumed
   consistently.
2. Critical convergence traffic no longer depends on ad hoc carve-outs alone.
3. Diagnostics explain why work was allowed, degraded, deferred, or rejected.
4. Remaining pressure failures are narrower than missing global fairness
   semantics.
