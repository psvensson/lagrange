# Timeout Cause Feedback and Operator Actions

## Why

Even after logic changes, failures were not actionable when output still
collapsed into a few broad reasons. Faster operator response required immediate,
deterministic guidance tied to timeout and non-timeout classes.

## Scope Basis

AGPL-in-scope roadmap rows:

1. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Matrix Stability and Readiness Semantics Sprint](../sprints/done-2026-q2-matrix-stability-timeout-and-readiness-unification.md)

## In Scope

1. Extend triage output to include explicit class mapping for delay and terminal-failure families.
2. Add short deterministic operator recommendations per class.
3. Include confidence and evidence source in summary output.
4. Make failure-bundle ranking consume the new class codes instead of broad strings.
5. Update report output so operators can distinguish delay from terminal fault.

## Out Of Scope

1. Full production alerting redesign.
2. Replacement of the current failure-bundle collector.
3. Unrelated harness dashboards.

## Invariants

1. One source-of-truth map translates reason code into user-facing meaning.
2. Actions reflect severity and recoverability consistently.
3. Recoverable delay does not trigger emergency-style action text.

## Hotspots

1. `test/distributed/harness/failure-bundle.js`
2. `test/distributed/harness/active-gate-closure-classification.js`
3. Matrix triage and summarization tooling
4. Report writers consuming `failureBundle.failureReasons`

## Implementation Tasks

- [x] Add action-policy mapping and confidence-aware summary fields.
- [x] Update triage serialization with reason and action dimensions.
- [x] Add tests for timeout and no-progress mapping edge cases.
- [x] Update report examples to distinguish delay versus terminal fault.
- [x] Preserve backward-compatible top-level summary shape where possible.

## Outcome

Completed as the operator-feedback pass. Failure summaries now carry
`failureAction` and `operatorRecommendation` alongside structured readiness
classification, so timeout-shaped delay and terminal no-progress can be acted on
without opening raw artifacts.

## Validation

- [x] Triage-output unit coverage for class-to-action mapping
- [x] Markdown and JSON artifact coverage for operator guidance fields
- [x] Focused reruns confirming the new action text is emitted on real failures

## Done When

1. Timeout and non-timeout classes are immediately actionable in failure reports.
2. Recommended action for each class matches recoverability semantics.
3. Triage consumers can filter recoverable delay and terminal failure separately.
