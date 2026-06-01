# Control-Plane Ingress Mode Contract Simplification

## Why

Several hot owner paths still expose semantic read or write behavior through
bags of booleans such as:

1. prefer this path
2. require that path
3. allow fallback here
4. disallow fallback there

That is expressive, but it is not a clear contract. It permits invalid or
ambiguous combinations and pushes policy composition out to every caller.

The system needs named ingress modes instead of caller-assembled behavior.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `architecture/current-owner-maps.md`
2. `work/packages/archived/done-20260411-authoritative-read-contract-and-diagnostic-unification.md`
3. `work/packages/archived/done-20260410-rebalancer-read-model-fallback-policy-collapse.md`

## Sprint Umbrella

[Runtime Boundary Simplification And Contract Unification Sprint](../../sprints/archived/done-2026-q2-runtime-boundary-simplification-and-contract-unification.md)

## In Scope

1. Replace semantic boolean option bags on touched control-plane ingress paths
   with explicit named mode contracts.
2. Make invalid combinations unrepresentable on the touched boundaries.
3. Align diagnostics and tests to report the resolved named mode rather than
   inferred boolean combinations.
4. Delete superseded boolean-mode vocabulary on the touched owner paths.

## Out Of Scope

1. Replacing purely technical options that are orthogonal to semantic mode.
2. Broad storage engine redesign.
3. Unrelated query-plane simplification beyond the touched control-plane
   boundaries.

## Invariants

1. Callers must choose one named semantic mode rather than assemble policy from
   independent booleans.
2. One ingress contract must resolve to one read or write policy outcome.
3. Diagnostics must expose the canonical resolved mode.
4. Touched boundaries must not preserve legacy boolean combinations behind a
   second adapter path.

## Hotspots

1. `src/rebalancer/replica-operation-repository.js`
2. `src/control-plane/control-plane-system-table-gateway.js`
3. `src/control-plane/authoritative-control-plane-view.js`
4. `src/rebalancer/rebalance-coordinator.js`
5. `test/rebalancer/replica-operation-repository.test.js`
6. `test/control-plane/control-plane-system-table-gateway.test.js`

## Detection / Analysis Tasks

- [ ] Inventory the touched ingress APIs that still expose semantic booleans.
- [ ] Classify which combinations are real semantic modes and which are invalid
      or redundant.
- [ ] Define one named mode set per touched ingress boundary.
- [ ] Detect callers that would still be relying on implicit legacy
      combinations.

## Implementation Tasks

- [ ] Replace the touched boolean option bags with explicit named mode
      constants.
- [ ] Move mode resolution into the owning ingress boundary instead of caller
      composition.
- [ ] Update diagnostics, traces, and tests to emit the resolved mode.
- [ ] Delete superseded boolean-mode helpers and stale comments.
- [ ] Perform the required closure deep dive across the touched ingress
      boundaries and split forward any out-of-scope residuals explicitly.

## Validation

1. Targeted repository, gateway, and coordinator tests.
2. Focused integration checks for authoritative read and mutation behavior on
   the touched paths.
3. Boundary-catalog review for the touched ingress contracts.

## Done When

1. Touched control-plane ingress paths expose named modes instead of semantic
   boolean bags.
2. Invalid combinations are structurally impossible on those paths.
3. Diagnostics and tests use the canonical named mode vocabulary.
4. Superseded boolean-mode contract language is removed from the touched area.
