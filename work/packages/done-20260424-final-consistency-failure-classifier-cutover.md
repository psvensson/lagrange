# Final Consistency Failure Classifier Cutover

Status: done on April 24, 2026.

## Why

Failure bundles still keep a legacy message-string fallback for final leader
mismatches so older reports remain readable. Once structured final consistency
diagnostics are present in new reports, classification should rely on the
structured contract only.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Cut failure-bundle classification over to structured final consistency
   diagnostics.
2. Keep legacy report compatibility in an explicitly named compatibility path
   or archive-only reader.
3. Delete broad message-text inference from active classification.
4. Add tests for topology, cache/visibility lag, CDC lag, and unknown
   final-consistency diagnostic states.

## Out Of Scope

1. Changing the final consistency decision model. That belongs to the active
   barrier/decision-table package.
2. Adding authority certificate fields. That belongs to the authority
   certificate package.

## Priority

Priority 4 after the structured diagnostics and authority evidence are stable.

## Shared Boundary Contract

- Semantic owner:
  final consistency failure classification in failure bundles.
- Canonical contract shape:
  active reports classify final consistency from
  `controlPlaneDiagnostics.finalConsistency` fields: `state`, `reasonCode`,
  owner boundary, evidence by partition id, and observation modes where
  present.
- Compatibility path:
  legacy message-string inference is allowed only in explicitly named
  compatibility readers for older reports without structured final consistency
  diagnostics.
- Prohibited reinterpretations:
  active classification must not infer topology/cache final consistency state
  from broad error-message substring checks when structured diagnostics are
  available.

## Residual Closure Inventory

- [x] Inventory active message-string final consistency classifiers.
- [x] Cut active failure-bundle classification to structured
      `finalConsistency` diagnostics first.
- [x] Move legacy message-string inference behind an explicit compatibility
      path for reports without structured diagnostics.
- [x] Add focused tests for topology, cache/visibility lag, CDC lag, and
      unknown structured final-consistency states.
- [x] Update sprint and rolling-restart package validation notes.

## Validation

Executed on April 24, 2026:

1. `node --check test/distributed/harness/failure-bundle-segment-4.js`
2. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
3. `node test/distributed/harness/__tests__/failure-bundle.test.js`
4. Result: passed, `40/40`.
5. `git diff --check` on touched package, sprint, and failure-bundle files.
6. Result: passed.
