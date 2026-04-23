# Runtime-Grammar Presentation Consumer Cutover

## Why

Once the pilot hierarchy is explicit, presentation surfaces must stop
reconstructing local meaning from partial evidence.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Runtime grammar hierarchy and actuation closure sprint](../../sprints/archived/done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

## In Scope

1. Cut admin/control-snapshot, failure-bundle, and triage consumers over to
   the hierarchy-derived decision output.
2. Keep lower-layer evidence as supporting diagnostics only.
3. Remove touched report-local reinterpretations that bypass the hierarchy.

## Out Of Scope

1. New user-facing features
2. Broad CLI or operator-surface redesign beyond the pilot slice

## Hotspots

1. `src/admin/admin-control-snapshot*.js`
2. `test/distributed/harness/failure-bundle*.js`
3. `test/distributed/harness/priority-recovery-summary-normalization.js`
4. touched admin/harness suites

## Execution Notes

1. Cut admin control snapshots over to the shared priority-recovery decision
   and observation contracts, including actuation, workflow phase, and
   pressure evidence.
2. Cut harness summary normalization, failure-bundle aggregation, and triage
   formatting over to the same canonical witness fields instead of local
   reinterpretation.
3. The presentation layer now summarizes hierarchy-owned meaning and keeps
   lower-layer evidence as supporting detail.

## Validation

1. Focused admin and harness consumer tests
2. Deferred named harness rerun after the full pilot slice is coherent
3. `npm run test:metrics`

## Done When

1. Presentation consumers summarize the hierarchy instead of inventing
   substitute runtime meaning.
2. The harness can discuss the pilot slice without another local grammar.
