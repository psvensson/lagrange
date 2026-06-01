# Contract Inversion Boundary Taxonomy

## Why

1. Current cross-layer failures still create too many exported states from observed symptoms.
2. The repo needs one explicit inventory separating contract state, reasons/evidence, and owner-internal phase so future cuts reduce state instead of multiplying it.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
2. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Inventory active exported vocabularies across control-plane mutation/visibility, readiness, harness admission, split workflow, replica operations, recovery planning, and admin surfaces.
2. Classify each field as one of: contract state, next action, reason code, evidence, or owner-internal phase.
3. Produce the first collapse map for the active runtime-hotspot families.

## Out Of Scope

1. Repo-wide rewrite in one change set.
2. Replacing rich owner-internal protocols where correctness still requires them.
3. New product or roadmap scope.
4. Broad doctrine duplication outside the steering and architecture records.

## Invariants

1. Exported state must stay smaller than observed evidence.
2. If two distinctions do not change the caller's legal next move, they belong in reasons or evidence rather than public contract state.
3. Owner-internal durable phase may remain rich, but callers should consume one smaller promise-shaped envelope.
4. This package must remove or collapse interpretation layers rather than add another permanent one.

## Hotspots

1. `architecture/current-owner-maps.md`
2. `architecture.md`
3. `src/control-plane/control-plane-system-table-gateway.js`
4. `src/cdc/cdc-integration-service.js`
5. `src/admin/admin-websocket-api.js`
6. `src/partition/managed-split-workflow.js`
7. `test/distributed/scenarios/table-distribution-helpers.js`

## Analysis Tasks

- [x] Confirm the exact active owner boundaries covered by this package.
- [x] Identify the current exported state vocabulary that should collapse into smaller promise-shaped outcomes.
- [x] Confirm the focused validation layer that should prove the package before another seven-node rerun.

## Implementation Tasks

- [x] Implement the bounded contract-inversion slice in the named hotspot owners and consumers.
- [x] Preserve rich reasons/evidence while reducing the exported branch surface.
- [x] Update architecture and owner-map records for the boundary once the cutover is real.
- [x] Add or update focused regressions for the new promise-shaped contract.

## Progress Notes

1. The first live taxonomy slice is now explicit: `contractState` and
   `nextAction` are the caller contract, while `visibilityState`, legacy
   `outcome`, `reasonCodes`, `runtimeAuthority`, `retryAfterMs`, and
   durable workflow phase remain reasons/evidence.
2. `ControlPlaneSystemTableGateway` is the first migrated boundary. It now
   collapses `pending_visibility`,
   `authoritative_confirmation_pending`, `deferred_by_pressure`,
   `owner_not_ready`, rejection, and plain success/failure into the smaller
   promise-shaped envelope.
3. `AdminWebSocketAPI`, harness query parsing, and
   `table-distribution-helpers` now preserve the promise-shaped contract so
   callers do not need to infer the next legal move from timeout-shaped
   symptoms.

## Validation

1. Focused owner and consumer suites for the touched path:
   `node test/control-plane/control-plane-system-table-gateway.test.js`
   `node test/admin/admin-websocket-api.test.js`
   `node test/admin/admin-websocket-api-timeout.test.js`
   `node test/distributed/harness/__tests__/cluster.test.js`
   `node test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js`
2. Unit-only gate once the focused cutover is green
3. Seven-node rerun only after the unit gate is green and the touched boundary is covered

## Done When

1. The touched boundary exports one smaller promise-shaped contract.
2. Detailed observations remain available as reasons/evidence instead of new public states.
3. Architecture and owner-map docs describe the boundary in the same vocabulary the code and tests now use.
