# Authority View And Consumer Contract Collapse

## Why

Several recent bugs came from the same structural problem: the codebase still
has more than one authority-shaped surface for the same cluster concern.

That makes callers decide locally between:

1. observed state
2. published authority
3. retained stable state
4. ad hoc fast-path or cache-local interpretations

The runtime needs one explicit consumer contract instead:

1. one operationally authoritative surface
2. one diagnostics-only observed surface
3. one owner-internal retained surface

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `architecture/current-owner-maps.md`
2. `work/packages/archived/done-20260417-critical-visibility-and-authority-convergence.md`
3. `work/packages/archived/done-20260417-owner-map-and-architecture-boundary-catalog.md`

## Sprint Umbrella

[Runtime Boundary Simplification And Contract Unification Sprint](../../sprints/archived/done-2026-q2-runtime-boundary-simplification-and-contract-unification.md)

## In Scope

1. Define one explicit authority-view model for runtime cluster state:
   observed, published, retained.
2. Define which consumers may use each view and which must not.
3. Remove or collapse caller-local reinterpretations that treat observed or
   retained state as a second publishable authority.
4. Replace nullable or ambiguous runtime authority-state contracts with named
   explicit variants.
5. Update architecture and owner-boundary records to make the consumer matrix
   durable.

## Out Of Scope

1. Broad endpoint publication redesign outside the authority-surface contract.
2. Storage engine redesign.
3. User-facing feature additions.

## Invariants

1. Production routing, readiness, topology planning, and execution must
   consume one canonical published authority surface.
2. Observed state may inform diagnostics, but it must not silently act as a
   second operational authority.
3. Retained authority is owner-internal stabilization state, not a general
   caller contract.
4. Runtime authority state must not use `null` or empty collections to encode
   semantic absence.
5. Every shared authority surface must declare allowed consumers and forbidden
   reinterpretations.

## Hotspots

1. `src/bootstrap/owners/bootstrap-topology-snapshot-owner.js`
2. `src/bootstrap/bootstrap-api.js`
3. `src/query/query-router.js`
4. `src/query/sql-query-engine.js`
5. `src/control-plane/active-node-projection.js`
6. `architecture/current-owner-maps.md`

## Detection / Analysis Tasks

- [ ] Inventory the current authority-shaped views and the direct consumers of
      each.
- [ ] Detect callers that still decide locally between observed, published, and
      retained state.
- [ ] Detect runtime authority or leader-state contracts that still leak raw
      nullable or storage-shaped fields.
- [ ] Define one consumer matrix and one explicit runtime authority-state
      vocabulary.

## Implementation Tasks

- [ ] Introduce one shared authority-view contract with explicit allowed
      consumers.
- [ ] Cut routing, readiness, and topology owners over to the canonical
      published authority surface.
- [ ] Contain retained authority to its owning component.
- [ ] Convert touched authority-state runtime models to explicit named
      variants.
- [ ] Update architecture and boundary-catalog records for the touched
      boundaries.
- [ ] Perform the required closure deep dive across the affected boundary and
      either fix or split forward any remaining overlap.

## Validation

1. Targeted bootstrap, query, readiness, and control-plane tests for authority
   consumers.
2. Architecture and boundary-catalog consistency review.
3. Distributed harness checks that diagnostics can still inspect observed state
   without routing through it.

## Done When

1. Shared runtime consumers use one canonical published authority surface.
2. Observed and retained views have explicit non-overlapping roles.
3. Touched authority-state contracts use named explicit variants instead of
   raw nullable semantics.
4. Architecture records describe the authority surface and consumer matrix
   once.
