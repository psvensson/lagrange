# Control-Plane Readiness Startup Authority and Transition Owner Extraction

## Why

`ControlPlaneReadinessService` is closer to the intended model than several
other hotspots, but it still centralizes too much policy in one owner. Startup
authority shaping, transition-history shaping, and inline literal state checks
still live together, which makes readiness bugs harder to localize and harder
to audit against the system guidelines.

This package narrows that owner so readiness failures become easier to explain
and easier to match to one canonical contract.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Extract startup-authority shaping from
   `src/control-plane/control-plane-readiness-service.js` into a smaller owner.
2. Extract readiness transition-history shaping into a smaller owner.
3. Remove inline startup/readiness state literals from the touched lane and
   replace them with owned vocabulary.
4. Touch direct control-plane collaborators only where needed to preserve one
   canonical readiness contract.

## Out Of Scope

1. Broad readiness redesign outside the touched startup and transition lane
2. Transport or query redesign beyond direct collaborators required by the
   readiness contract
3. New readiness feature work

## Scenario Targets

1. `rolling-restart`
2. `seed-restart-under-load`
3. `node-join-under-load`
4. `seven-node-load-during-partitioning`

## Invariants

1. Startup authority and transition-history shaping must have explicit owners.
2. The touched readiness lane must not rely on inline string literals to
   encode domain state.
3. Callers must keep one canonical readiness result and typed reason story.

## Shared Boundary Contract

- Semantic owner: extracted startup-authority owner and transition-history
  owner under the readiness boundary
- Canonical contract shape / vocabulary: canonical startup-authority snapshot
  and canonical readiness-transition state using owned constants
- Allowed consumers: readiness service, admin/control-plane diagnostics,
  focused control-plane tests
- Prohibited reinterpretations: callers must not rebuild startup authority or
  transition state from raw planning answers or inline string literals
- Primary diagnostics / proof surfaces: control-plane readiness tests,
  readiness diagnostics, named restart/join scenario lanes

## Detection / Analysis Tasks

- [ ] Build the current startup-authority shaping inventory.
- [ ] Build the current transition-history shaping inventory.
- [ ] Record inline readiness literals that violate scalar ownership.

## Implementation Tasks

- [ ] Extract the startup-authority owner.
- [ ] Extract the transition-history owner.
- [ ] Replace touched inline readiness literals with owned vocabulary.

## Residual Closure Inventory

- [ ] Startup-authority shaping is no longer buried inside the larger
      readiness owner.
- [ ] Transition-history shaping is no longer buried inside the larger
      readiness owner.
- [ ] Touched inline state literals are replaced by owned constants or
      contracts.

## Validation

1. Targeted control-plane readiness tests
2. Focused admin/control-plane diagnostic coverage
3. Distributed scenario evidence for the named restart and join lanes
4. `npm run test:metrics`

## Done When

1. Startup authority and transition-history shaping have explicit smaller
   owners.
2. The touched lane follows scalar-ownership rules and emits one canonical
   readiness story.
3. The named scenario lanes keep green or fail with one obvious typed blocker
   story.
