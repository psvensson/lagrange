# Admin and Bootstrap Response Contract Hardening

## Why

Admin and bootstrap surfaces still emit many nullable payload fields. Even when
internal logic improves, those outputs reintroduce ambiguity for callers,
operators, tests, and harness logic.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Hotspots

1. `src/admin/admin-control-snapshot.js`
2. `src/admin/admin-service-discovery.js`
3. `src/bootstrap/bootstrap-api.js`

## Invariants

1. Responses present named states, not nullable bags.
2. Admin/bootstrap outputs are shaped from owner-owned explicit contracts.
3. No response uses `null` or `undefined` to signal phase or status.

## Analysis Tasks

- [ ] Inventory nullable response fields and map each to a real state meaning.
- [ ] Identify which payloads can be directly derived from existing readiness/publication/runtime variants.

## Implementation Tasks

- [ ] Replace nullable response/status fields with explicit response variants or required sub-objects.
- [ ] Remove admin/bootstrap-local state reconstruction where it depends on absence.
- [ ] Add unit coverage for non-null response contract shape.

## Done When

1. Touched admin/bootstrap responses no longer use nullish state presentation.
2. Harness/operator consumers can distinguish state explicitly from payload shape alone.

## 2026-04-12 execution update

Implemented slice:
1. `BootstrapAPI.buildBootstrapControlPlaneQueryError(...)` now emits an
   explicit `details.pressure` descriptor with `present` vs `none`, while
   keeping legacy alias keys only when concrete values exist.
2. `AdminControlSnapshot.resolvePublicationConvergenceDiagnostics(...)` now
   emits explicit:
   `publicationObservation`
   and `timestamps.{publishedAt,updatedAt}`
   state objects.
3. The admin publication-convergence response now returns an explicit
   unavailable object instead of `null` when no publication observation exists
   on that path.
4. `AdminWebSocketAPI` load-lane admission now routes query/table gating
   through explicit admission states instead of scattered benchmark/readiness
   checks.
5. `AdminTestRunService` config precheck and run finalization now resolve one
   explicit state before emitting one canonical precheck/run outcome.
6. `AdminControlSnapshot` now ignores unavailable publication diagnostics when
   resolving active-node membership, so projected readiness/websocket evidence
   is not collapsed into an empty published-membership cohort.
7. `AdminServiceDiscovery` table-scoped authoritative repairs now opt into the
   canonical gateway fallback contract with explicit
   `allowSqlFallback: true`.

Focused validation passed:
1. `node test/bootstrap/bootstrap-control-plane-query-error-contract.test.js`
2. `node test/admin/admin-control-snapshot-response-contract.test.js`
3. `node test/bootstrap/bootstrap-api.test.js`
4. `node test/admin/admin-control-snapshot.test.js`
5. `node test/admin/admin-websocket-api-timeout.test.js`
6. `node test/admin/admin-websocket-api.test.js`
7. `node test/admin/admin-test-run-service.test.js`
8. `node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot.js src/admin/admin-service-discovery.js src/admin/admin-test-run-service.js src/admin/admin-websocket-api.js`

Remaining gap in this package:
1. other admin/bootstrap payloads outside the hardened publication,
   load-lane, control-snapshot, and test-run seams still contain broader
   legacy nullish compatibility.
