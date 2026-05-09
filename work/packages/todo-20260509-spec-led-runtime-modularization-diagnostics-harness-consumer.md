# Spec-Led Runtime Modularization Diagnostics And Harness Consumer Rewrite

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json",
  "playback": "none",
  "owner": "diagnostics_observer",
  "boundary": "owner_contract_presentation",
  "dominantReason": "diagnostics_and_harness_can_still_reclassify_owner_truth",
  "currentState": "Distributed harness failure bundles, topology analyzers, and diagnostics helpers can still select or rename blockers from raw traces instead of presenting canonical owner outcomes.",
  "nextAction": "Rewrite diagnostics and harness consumers to present owner contracts without reclassifying them.",
  "proof": [
    "Focused failure-bundle tests",
    "Focused topology convergence analyzer tests",
    "Focused publication evidence harness tests",
    "Representative rolling-restart rerun if this package owns active gate presentation"
  ],
  "touchedFiles": [
    "test/distributed/harness/failure-bundle-segment-*.js",
    "test/distributed/harness/publication-evidence-*.js",
    "test/distributed/harness/active-gate-closure-classification.js",
    "test/distributed/harness/__tests__/failure-bundle-core-*.js",
    "scripts/analyze-topology-convergence.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md"
  ],
  "predecessor": "work/packages/active-20260509-spec-led-runtime-modularization-projection-readiness-contract.md"
}
-->

## Why

The fastest way to lose the benefit of owner rewrites is to let diagnostics and
harnesses preserve their own semantic grammar. This package rewrites those
consumers so they become explainers of owner contracts, not competing owners.

## Scope Basis

Spec-led runtime modularization design and the consumer contracts produced by
the operation, priority recovery, publication, placement, and readiness
packages.

## In Scope

1. Replace raw trace-based blocker selection with owner-outcome presentation.
2. Define a stable owner witness list and dominant blocker selection rule.
3. Preserve useful detail as evidence, not as independent classification.
4. Update failure bundle and analyzer tests to assert canonical owner
   vocabulary.
5. Remove old aliases that no owner still emits.

## Out Of Scope

1. Changing owner decisions to satisfy presentation preferences.
2. Adding new runtime owners.
3. Rewriting distributed harness mechanics unrelated to diagnostics.
4. Broad report format redesign beyond owner-contract presentation.

## Invariants

1. Diagnostics are read-only.
2. Diagnostics cannot create owner, boundary, state, or reason names that no
   owner emits.
3. Raw traces can support explanation but not semantic ownership.
4. Representative reports must identify the same dominant owner-boundary pair
   that owner contracts expose.

## Tactical Inspiration

1. SRE incident pipelines: preserve raw evidence, but root-cause classification
   comes from stable signal contracts.
2. Kubernetes events and conditions: events explain changes; conditions remain
   owner-authored truth.
3. OpenTelemetry-style semantic conventions: consumers report standard fields
   instead of inventing local labels.

## Hotspots

1. `test/distributed/harness/failure-bundle-segment-*.js`
2. `test/distributed/harness/publication-evidence-*.js`
3. `test/distributed/harness/active-gate-closure-classification.js`
4. `test/distributed/harness/__tests__/failure-bundle-core-*.js`
5. `scripts/analyze-topology-convergence.js`
6. `scripts/analyze-owner-*.js`

## Shared Boundary Contract

Semantic owner: runtime owner contracts; consumer owner:
`diagnostics_observer`.

Canonical contract shape / vocabulary: owner witness list, dominant owner,
boundary, state, reason list, supporting evidence, downstream symptom list, and
presentation aliases.

Allowed consumers: distributed harness report generation, analyzer CLI output,
admin diagnostics, and failure-bundle tests.

Prohibited reinterpretations: diagnostics cannot promote startup symptoms above
operation or publication owner outcomes, cannot infer publication freshness from
cache presence, and cannot rename operation states from raw dispatch timing.

Primary diagnostics / proof surfaces: failure-bundle tests, analyzer tests,
owner evidence block generation, and representative report comparison.

## Detection / Analysis Tasks

- [ ] Inventory every diagnostics reason, state, owner, and boundary label.
- [ ] Map each label to an emitting owner contract or mark it for deletion.
- [ ] Identify raw trace fields that are only explanatory evidence.
- [ ] Record representative report fields that must remain stable.

## Implementation Tasks

- [ ] Add or update owner-contract presentation helpers.
- [ ] Rewrite failure-bundle classification to consume owner witnesses.
- [ ] Rewrite topology analyzer dominant blocker selection to use contracts.
- [ ] Update tests to assert canonical names and evidence details separately.
- [ ] Delete obsolete aliases and branch classifiers.

## Validation

1. Focused failure-bundle tests.
2. Focused topology convergence analyzer tests.
3. Focused publication evidence harness tests.
4. Representative rolling-restart rerun if this package owns active gate
   presentation.

## Done When

1. Diagnostics and harnesses present owner outcomes without reclassification.
2. Old shadow grammar labels are deleted or documented as compatibility aliases.
3. Representative reports expose one canonical dominant owner-boundary witness.
