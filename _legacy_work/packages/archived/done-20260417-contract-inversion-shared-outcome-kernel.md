# Contract Inversion Shared Outcome Kernel

## Why

1. The repo needs one small promise-shaped envelope before boundary-specific cutovers can stop leaking observation-shaped states.
2. Without a shared kernel, each owner will keep inventing its own pending/deferred vocabulary and downstream callers will keep branching on bespoke fields.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
2. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Add one shared outcome kernel for contract state, next action, bounded retry hints, and reason/evidence carriage.
2. Keep the kernel compatibility-friendly so existing fields may coexist during migration.
3. Cut over one live boundary to prove the kernel against real runtime pressure rather than only package prose.

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

1. `src/control-plane`
2. `src/admin/admin-websocket-api.js`
3. `test/distributed/harness/cluster.js`
4. `test/distributed/scenarios/table-distribution-helpers.js`
5. `test/control-plane/control-plane-system-table-gateway.test.js`

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

1. `src/control-plane/owner-contract-outcome.js` now owns the shared
   promise-shaped kernel: `contractState`, `nextAction`, and the canonical
   normalizers/builders used across the first migrated boundary.
2. The first live cutover carries that kernel through
   `ControlPlaneSystemTableGateway`, `AdminWebSocketAPI`, harness query
   parsing in `Cluster`, and `table-distribution-helpers`.
3. Compatibility is preserved during migration: owner-specific fields remain on
   the result payload, but consumers can now branch on one smaller envelope
   instead of bespoke timeout or visibility states.

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
