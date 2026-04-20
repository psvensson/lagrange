# Benchmark Table Bootstrap Timeout-Budget Owner Collapse

## Why

The April 15, 2026 rerun after the load-node availability fix did not fail in
the same place.

It regressed earlier to benchmark table bootstrap with:

1. `Timed out waiting for table partition visibility for "benchmark_events"`
2. `lastCreateError=Admin API query timed out ... on lane control after 15000ms`
3. `observedBootstrapVisibilityState=table_id_visible`
4. `lastPartitionVisibilityError=table_id_visible_without_partitions`

That points to one owner boundary:

`admin request timeout budget -> SQL CREATE TABLE -> initial partition provisioning`

Today the outer admin control-lane timeout owns the caller-visible deadline, but
that budget is not carried through the create-table bootstrap path. The inner
partition provisioning wait therefore runs on a different timeout owner and can
outlive the caller, producing an opaque admin timeout instead of one canonical
query result.

This package exists to collapse benchmark table bootstrap onto one timeout
owner path.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Carry the admin SQL request timeout budget into `CREATE TABLE`.
2. Carry the same budget through table bootstrap reconciliation and initial
   partition provisioning.
3. Leave a bounded completion margin so inner create execution resolves before
   the outer admin request expires.
4. Add focused unit coverage for admin budget propagation, SQL-engine budget
   forwarding, and table-creation budget forwarding.
5. Re-run the full unit gate and the seven-node distributed scenario.

## Out Of Scope

1. Changing benchmark helper bootstrap deadlines as a substitute for owner-path
   repair.
2. Redesigning control-plane readiness or load-node availability in this
   package.
3. Widening the previous load-node package to absorb this timeout concern.

## Invariants

1. One caller-visible control-lane request must have one owned inner bootstrap
   timeout budget.
2. `CREATE TABLE` must not let inner partition provisioning outlive the outer
   admin request.
3. Table bootstrap retries and `IF NOT EXISTS` reconciliation must share the
   same timeout owner path.
4. Validation must stay in order: unit gate first, distributed rerun second.

## Hotspots

1. `src/admin/admin-websocket-api.js`
2. `src/query/sql-query-engine.js`
3. `src/query/table-creation-service.js`
4. `test/admin/admin-websocket-api.test.js`
5. `test/query/sql-query-engine.test.js`
6. `test/query/table-creation-service.test.js`

## Analysis Tasks

- [x] Confirm the rerun failure is an opaque outer admin timeout, not the
  earlier load-node dispatch-capacity concern.
- [x] Name the missing boundary explicitly: admin request timeout budget versus
  inner table-bootstrap provisioning budget.
- [x] Identify the smallest systemic fix: propagate one timeout owner through
  admin, SQL engine, and table-creation provisioning.

## Implementation Tasks

- [x] Forward an inner SQL timeout budget from the admin adapter with bounded
  completion margin.
- [x] Forward request timeout budgets through `SQLQueryEngine.executeRequest()`
  into `CREATE TABLE`.
- [x] Forward timeout budgets through `TableCreationService` fresh create and
  `IF NOT EXISTS` reconciliation provisioning.
- [ ] Record the owner-path change in architecture/owner docs.
- [ ] Run the full unit gate and the seven-node distributed scenario.

## Validation

1. `node test/admin/admin-websocket-api.test.js`
2. `node test/query/sql-query-engine.test.js`
3. `node test/query/table-creation-service.test.js`
4. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
5. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery ...`

## Done When

1. Benchmark table bootstrap uses one timeout owner path end-to-end.
2. The admin caller no longer times out first while inner create provisioning is
   still running.
3. Fresh create and reconciliation paths both respect the caller budget.
4. The unit-only gate is green.
5. The seven-node rerun either passes or fails at a later, clearly different
   boundary.
