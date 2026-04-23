# Priority-Recovery Decision Recomposition Over The Runtime Grammar Hierarchy

## Why

Once `intent`, `authority`, `actuation`, and `conditions` are explicit, the
decision layer should be recomposed from those lower layers instead of carrying
their overlap directly.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Runtime grammar hierarchy and actuation closure sprint](../../sprints/archived/done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

## In Scope

1. Recompose `PriorityRecoveryProgressContract` and touched semantic-state
   selection over the hierarchy.
2. Keep one clear separation between lower-layer evidence and canonical
   decision output.
3. Reduce cases where semantic state compensates for missing actuation or
   pressure meaning.

## Out Of Scope

1. New presentation surfaces
2. Broad publication/admission redesign outside the pilot slice

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/control-plane/priority-recovery-completion.js`
3. `src/control-plane/owner-contract-outcome.js`
4. `test/control-plane/priority-recovery-snapshot.test.js`

## Execution Notes

1. Rebuilt the shared decision snapshot over explicit `conditions` and
   `actuation` inputs instead of deriving meaning directly from flat blocker
   piles.
2. `PriorityRecoveryProgressContract` now derives owner, next action,
   boundary, wait mode, and timestamps from the hierarchy-backed actuation and
   condition contracts.
3. The decision layer now preserves lower-layer evidence separately instead of
   letting semantic state compensate for missing pressure or timeout meaning.

## Validation

1. Focused decision-snapshot tests
2. Focused admin/harness consumer tests if the contract shape changes
3. `npm run test:metrics`

## Done When

1. Decision output is clearly derived from the hierarchy.
2. Lower-layer overlaps no longer leak directly into semantic-state selection.
