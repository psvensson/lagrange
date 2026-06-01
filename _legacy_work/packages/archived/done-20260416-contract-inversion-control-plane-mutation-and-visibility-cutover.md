# Contract Inversion Control-Plane Mutation And Visibility Cutover

## Why

1. The current active failure family still clusters around control-plane writes, visibility confirmation, and timeout-shaped ambiguity.
2. This boundary is the best first large-scale consumer cutover for promise-shaped outcomes.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
2. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Cut over gateway, CDC, SQL engine, admin, table bootstrap, and split-transition visibility consumers to the shared envelope.
2. Collapse write-executed-but-not-yet-confirmed cases into canonical pending/deferred contract states with explicit next actions.
3. Remove direct caller branching on bespoke timeout versus visibility strings where the shared envelope is sufficient.

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

1. `src/control-plane/control-plane-system-table-gateway.js`
2. `src/cdc/cdc-integration-service.js`
3. `src/query/sql-query-engine.js`
4. `src/query/table-creation-service.js`
5. `src/partition/managed-split-workflow.js`
6. `src/admin/admin-websocket-api.js`

## Analysis Tasks

- [ ] Confirm the exact active owner boundaries covered by this package.
- [ ] Identify the current exported state vocabulary that should collapse into smaller promise-shaped outcomes.
- [ ] Confirm the focused validation layer that should prove the package before another seven-node rerun.

## Implementation Tasks

- [ ] Implement the bounded contract-inversion slice in the named hotspot owners and consumers.
- [ ] Preserve rich reasons/evidence while reducing the exported branch surface.
- [ ] Update architecture and owner-map records for the boundary once the cutover is real.
- [ ] Add or update focused regressions for the new promise-shaped contract.

## Validation

1. Focused owner and consumer suites for the touched path
2. Unit-only gate once the focused cutover is green
3. Seven-node rerun only after the unit gate is green and the touched boundary is covered

## Done When

1. The touched boundary exports one smaller promise-shaped contract.
2. Detailed observations remain available as reasons/evidence instead of new public states.
3. Architecture and owner-map docs describe the boundary in the same vocabulary the code and tests now use.
