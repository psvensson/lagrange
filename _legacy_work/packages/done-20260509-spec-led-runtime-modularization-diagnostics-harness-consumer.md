# Spec-Led Runtime Modularization Diagnostics And Harness Consumer Rewrite

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json",
  "playback": "none",
  "owner": "diagnostics_observer",
  "boundary": "owner_contract_presentation",
  "dominantReason": "diagnostics_and_harness_can_still_reclassify_owner_truth",
  "currentState": "Diagnostics graph, topology analyzer, and failure-bundle reporting now expose canonical owner witnesses for ACK debt and dominant topology blockers.",
  "nextAction": "Run parent verification, commit and push the focused diagnostics package slice, then close the package.",
  "proof": [
    "Focused failure-bundle tests",
    "Focused topology convergence analyzer tests",
    "Focused publication evidence harness tests",
    "Representative rolling-restart rerun if this package owns active gate presentation"
  ],
  "touchedFiles": [
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot.expected.json",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-progress.expected.json",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "work/packages/done-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-projection-readiness-contract.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true
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

- [x] Inventory every diagnostics reason, state, owner, and boundary label.
- [x] Map each label to an emitting owner contract or mark it for deletion.
- [x] Identify raw trace fields that are only explanatory evidence.
- [x] Record representative report fields that must remain stable.

## Implementation Tasks

- [x] Add or update owner-contract presentation helpers.
- [x] Rewrite failure-bundle classification to consume owner witnesses.
- [x] Rewrite topology analyzer dominant blocker selection to use contracts.
- [x] Update tests to assert canonical names and evidence details separately.
- [x] Delete obsolete aliases and branch classifiers.

## Implementation Notes

1. `src/diagnostics/topology-convergence-graph.js` now builds owner
   presentation witnesses for every topology edge, frontier witnesses, and one
   dominant witness with stable `owner`, `boundary`, `state`,
   `dominantReason`, `reasons`, `evidencePath`, `source`, and
   `rootCauseClass` fields.
2. Publication ACK debt is presented as the canonical owner reason
   `pending_acks_present`; raw publication statuses remain in witness evidence
   and no longer outrank the owner reason.
3. The topology analyzer consumes the shared owner-presentation helpers for
   JSON output, explain output, and package evidence blocks. Obsolete
   `topology` and `failure-reasons` edge aliases were removed from the CLI
   alias table.
4. Failure-bundle reporting now attaches the shared owner contract
   presentation and only lets the publication owner witness promote ACK debt to
   the dominant failure reason/root-cause class. Legacy stability-gate blocker
   aliases remain compatibility evidence rather than semantic ownership.
5. Focused distributed harness and analyzer tests assert canonical
   owner/boundary/state/reason witnesses separately from raw evidence details.

## Validation

1. Focused failure-bundle tests.
2. Focused topology convergence analyzer tests.
3. Focused publication evidence harness tests.
4. Representative rolling-restart rerun if this package owns active gate
   presentation.

## Validation Notes

1. `node --check` passed for all touched JavaScript files:
   `src/diagnostics/topology-convergence-graph.js`,
   `scripts/analyze-topology-convergence.js`,
   `test/diagnostics/topology-convergence-graph.test.js`,
   `test/scripts/analyze-topology-convergence.test.js`,
   `test/distributed/harness/failure-bundle-segment-4.js`,
   `test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js`,
   and
   `test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`.
2. `node --test test/diagnostics/topology-convergence-graph.test.js` passed
   6 tests.
3. `node --test test/scripts/analyze-topology-convergence.test.js` passed
   8 tests.
4. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
   passed 93 tests.
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`
   passed and emitted dominant witness
   `operation_workflow_owner` / `workflow_progress` /
   `priority_recovery_workflow_progress_transition_deferred`.
6. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json --explain priority`
   passed and exposed the same owner/boundary/state/reason witness.
7. `npm run analyze:topology-convergence -- --package-evidence-block test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`
   passed and rendered the owner evidence block.
8. `npm run audit:guideline:literals -- src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/failure-bundle-segment-4.js`
   passed with 0 new literal-guideline violations.
9. `npm run audit:guideline:decision-boundaries -- src/diagnostics/topology-convergence-graph.js scripts/analyze-topology-convergence.js test/distributed/harness/failure-bundle-segment-4.js`
   passed with 0 decision-boundary violations.
10. `npm run audit:runtime-grammar:file -- <touched JavaScript files>` passed
    with 0 runtime-grammar-contract violations.
11. `npm run audit:file-size -- <touched JavaScript files>` exited 0 and
    reported the existing oversized-file ratchet for
    `test/distributed/harness/failure-bundle-segment-4.js`,
    `src/diagnostics/topology-convergence-graph.js`, and
    `test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`.
12. `git diff --check -- <tracked touched files>` passed, and
    `git diff --no-index --check -- /dev/null work/packages/active-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md`
    produced no whitespace errors for the untracked active package file.
13. `npm run work:current-blocker` regenerated
    `work/sprints/current-blocker.json` and `work/sprints/current-blocker.md`
    after the exact package `touchedFiles` update.
14. `npm run work:context` passed after the regenerated handoff and now lists
    exact package touched paths.
15. `npm run work:dirty-scope -- --package work/packages/done-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md`
    passed; it reported 10 package-owned dirty entries, 2 tracker-generated
    dirty entries, and 8 unrelated dirty entries.
16. `npm run work:validate` passed for 23 files.

## Done When

1. Diagnostics and harnesses present owner outcomes without reclassification.
2. Old shadow grammar labels are deleted or documented as compatibility aliases.
3. Representative reports expose one canonical dominant owner-boundary witness.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Kant (`019e0c25-e001-7ca2-a595-0cd30823eae5`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-projection-readiness-contract.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Singer (`019e0c29-de11-72f0-8209-1cd883fb9993`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-projection-readiness-contract.md`.
- [x] Implementation subagent recorded:
      Agent Confucius (`019e0c31-44f2-75a1-abd4-5b40adcae506`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md`.

## Commit And Push Ledger

1. Focused package commit: `b084bf84`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
