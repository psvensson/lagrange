# Partition and Query Cognitive-Complexity Reduction

## Why

The metrics run shows a concentrated cluster in query and partition owners:
`partition-service`, `query-executor`, and `sql-query-engine`.

These are high-risk runtime boundaries where branch-pile cleanup should produce
both metric reduction and clearer owner contracts.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reduce cognitive complexity in `src/partition/partition-service.js`
2. Reduce cognitive complexity in `src/query/query-executor.js`
3. Reduce cognitive complexity in `src/query/sql-query-engine.js`

## Out Of Scope

1. New query features
2. Transport or admin refactors except direct collaborators required by the
   touched owner path
3. Test-suite-wide duplication cleanup

## Invariants

1. Query and partition decisions must stay single-owner and explicit-state
   driven.
2. Refactors must not reintroduce duplicated semantic answerers.
3. Focused query/partition suites and `npm run test:metrics` must pass.

## Hotspots

1. `src/partition/partition-service.js`
2. `src/query/query-executor.js`
3. `src/query/sql-query-engine.js`

## Detection / Analysis Tasks

- [ ] Map the top violating functions to their semantic decisions.
- [ ] Separate evidence collection, normalization, and action in each hotspot.
- [ ] Identify any duplicated helper logic that should collapse during the same
      change.

## Implementation Tasks

- [ ] Refactor the highest-value functions first.
- [ ] Add focused regressions around the simplified owner paths.
- [ ] Re-run the cognitive-complexity report and capture the delta.

## Validation

1. Targeted query and partition tests
2. Any touched integration tests for routing/execution safety
3. `npm run test:metrics`

## Done When

1. The targeted query/partition hotspot functions have lower cognitive
   complexity with unchanged semantics.
2. The package lowers the repo baseline or isolates any remaining hotspots for
   a narrower successor package.
