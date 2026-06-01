# Contract Inversion Boundary Test Layer Rewrite

## Why

1. Tests still overfit some observed-state strings and phase details that should become reasons or evidence instead of public contract state.
2. The boundary-transition layer should protect the promise-shaped contract directly.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
2. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Rewrite active boundary tests to assert contract state and next action first, then reason/evidence.
2. Add reducer/property-style coverage for evidence combinations collapsing into the same contract state.
3. Keep seven-node harness reruns as end-to-end witnesses rather than the first contract proof surface.

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

1. `test/distributed/harness/__tests__`
2. `test/control-plane`
3. `test/partition`
4. `test/admin`
5. `test/query`

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
