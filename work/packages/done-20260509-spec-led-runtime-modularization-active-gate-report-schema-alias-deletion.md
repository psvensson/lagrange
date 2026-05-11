# Spec-Led Runtime Modularization Active Gate Report Schema Alias Deletion

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json",
  "playback": "none",
  "owner": "diagnostics_artifact_schema_owner",
  "boundary": "active_gate_report_schema_alias_deletion",
  "dominantReason": "active_gate_report_aliases_remain_external_artifact_contract",
  "currentState": "Active-gate report aliases were removed from scoped diagnostics/report artifact surfaces, and consumers now use the canonical owner-bound activeGate shape without changing runtime active-gate behavior.",
  "nextAction": "No successor is open for this sprint; reopen only if focused diagnostics proof finds alias drift or runtime owner evidence changes.",
  "proof": [
    "rg checks for activeGateBestProgress, activeGateNoProgress, and activeGateBlockerHistory before and after migration",
    "node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/failure-bundle.test.js",
    "Touched-file static guardrails selected by diagnostics_artifact_schema_owner",
    "Representative rolling-restart report preserves canonical owner-boundary evidence without old active-gate report aliases"
  ],
  "touchedFiles": [
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/distributed/harness/active-gate-contract.js",
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/failure-bundle-segment-1.js",
    "test/distributed/harness/failure-bundle-segment-2.js",
    "test/distributed/harness/failure-bundle-segment-3.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/failure-bundle-segment-6.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/__tests__/cluster-part-6-core-01-test-cases.js",
    "test/distributed/harness/__tests__/cluster-part-6-core-04-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "test/distributed/harness/__tests__/failure-bundle-active-gate-tail-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-02-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-03-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-05-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-06-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-08-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-11-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-core-15-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle-publication-closure-tail-test-cases.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/__fixtures__/topology-convergence/*.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/packages/done-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostics-artifact-schema-migration",
    "escalationTriggers": [
      "owned files expand outside diagnostics artifact schema surfaces",
      "migration requires runtime active-gate behavior changes",
      "representative proof reveals a new owner boundary instead of schema aliases"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If active-gate report schema aliases are deleted correctly, diagnostics readers should preserve the same owner-bound active-gate evidence without changing runtime active-gate causal edges.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json",
    "expectedCausalModelChange": "The causal model should stay on the same runtime owner boundary while report aliases disappear from diagnostics schema; any runtime owner migration is contradictory for this schema-only package.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "No runtime causal debt is owned here; any runtime blocker exposed by alias deletion must be split into a separate owner-boundary package.",
    "crossBoundaryReview": "Review the closed priority recovery backpressure package before activation because this package touches diagnostics, failure-bundle, topology-convergence, and active-gate report consumers."
  },
  "predecessor": "work/packages/done-20260511-spec-led-runtime-modularization-priority-recovery-backpressure-frontier.md",
  "closed": "2026-05-11",
  "commitAndPushLedgerRequired": true
}
-->

## Why

`activeGateBestProgress`, `activeGateNoProgress`, and
`activeGateBlockerHistory` are no longer allowed as silent transitional
vocabulary, but they remain part of the current failure-bundle/report artifact
schema. Removing them inside the final deletion slice would change external
artifact contracts and break diagnostics readers without a scoped schema-owner
migration.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md`
for the remaining active-gate diagnostics artifact schema aliases. This is a
Phase `0.1` internal-coherence cleanup within the AGPL repository.

## In Scope

1. Define the canonical active-gate diagnostics artifact shape.
2. Migrate failure-bundle, analyzer, and topology-convergence consumers from
   the old report aliases to that shape.
3. Add structural guards that reject the old aliases after migration.
4. Preserve owner-boundary evidence and representative report readability.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostics-artifact-schema-migration`
- Owned files: `src/diagnostics/topology-convergence-graph.js`, `scripts/analyze-topology-convergence.js`, active-gate diagnostics readers/writers under `test/distributed/harness/`, migrated failure-bundle and cluster active-gate fixtures under `test/distributed/harness/__tests__/`, `test/diagnostics/topology-convergence-graph.test.js`, topology-convergence JSON fixtures under `test/scripts/__fixtures__/topology-convergence/`, `test/scripts/analyze-topology-convergence.test.js`, this package file.
- Forbidden files: `src/control-plane/`, `src/rebalancer/`, runtime active-gate owner behavior, unrelated sprint/package files.
- Frozen decisions: this package only renames/removes active-gate report schema aliases; it must not change active-gate semantics or owner-witness classification.
- Escalation triggers: owned files expand outside diagnostics artifact schema surfaces, migration requires runtime active-gate behavior changes, or representative proof reveals a new owner boundary instead of schema aliases.
- Focused proof: `rg "activeGateBestProgress|activeGateNoProgress|activeGateBlockerHistory" src/diagnostics scripts test/distributed/harness test/diagnostics test/scripts`; `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/failure-bundle.test.js`

## Causal Governance

- Causal hypothesis: if active-gate report schema aliases are deleted correctly,
  diagnostics readers should preserve the same owner-bound active-gate evidence
  without changing runtime active-gate causal edges.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-final.report.json`.
- Expected causal-model change: the causal model should stay on the same runtime
  owner boundary while report aliases disappear from diagnostics schema; any
  runtime owner migration is contradictory for this schema-only package.
- Representative outcome: `same-frontier`.
- Causal debt: no runtime causal debt is owned here; any runtime blocker exposed
  by alias deletion must be split into a separate owner-boundary package.
- Cross-boundary review: required before activation because this package touches
  diagnostics, failure-bundle, topology-convergence, and active-gate report
  consumers.

## Out Of Scope

1. New active-gate behavior.
2. Reclassification of owner witnesses from raw report fields.
3. Harness timeout or report relabeling changes.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent review-6c1e830f (6c1e830f-0000-4000-8000-000000000000) reviewed work/packages/done-20260511-spec-led-runtime-modularization-priority-recovery-backpressure-frontier.md; result clean.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.
- [x] Implementation subagent recorded:
      Agent implement-0e91a4c3 (0e91a4c3-0000-4000-8000-000000000000) implemented work/packages/done-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md.

## Implementation Proof Notes

Additional files touched beyond original touchedFiles:
- `test/distributed/harness/failure-bundle-segment-1.js` — migrated normalizePriorityRecoveryActiveGateSnapshot calls, removed activeGateNoProgress local extractions, replaced with canonical activeGate.readinessFailure/attemptsSinceProgress/state/etc.
- `test/distributed/harness/failure-bundle-segment-2.js` — replaced details.activeGateNoProgress/activeGateBlockerHistory checks with canonical activeGate.state/blockerHistory checks
- `test/distributed/harness/failure-bundle-segment-6.js` — replaced publicationConvergence.activeGateBlockerHistory/activeGateNoProgress with activeGate.blockerHistory/state
- `test/distributed/harness/cluster-segment-7.js` — removed activeGateBlockerHistory mutation on stalledNoProgress, removed activeGateNoProgress from _recordClusterStage calls
- `test/distributed/harness/cluster-segment-7-class-4.js` — removed old alias copies from controlPlaneDiagnostics spread
- `test/distributed/harness/publication-evidence-contract.js` — stripped old alias fields from all normalizePriorityRecoveryActiveGateSnapshot calls, buildPriorityRecoveryObservationSnapshot calls, hasExplicitActiveGateSource checks, and canonicalActiveGateFields fallback
- All test data files under `test/distributed/harness/__tests__/` listed above — migrated inline test data from old alias shape to canonical activeGate nested object

Alias scan result after implementation:
`rg "activeGateBestProgress|activeGateNoProgress|activeGateBlockerHistory" src/diagnostics scripts test/distributed/harness test/diagnostics test/scripts` → zero matches.

No intentional documented exceptions remain.

## Validation Notes

- `rg` alias scan: 0 matches across all scoped paths
- `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/distributed/harness/__tests__/failure-bundle.test.js`: 122/122 pass
- `npm run work:validate -- --all`: Work tracker validation OK for 51 file(s)
- `npm run work:package:doctor -- work/packages/done-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md`: validation ok
- `git diff --check`: clean (no whitespace issues)
- `npx eslint ...`: passed for linted touched diagnostics/schema tests; ignored
  generated harness segment files are covered by focused failure-bundle tests.

## Commit And Push Ledger

1. Focused package commit: `aabc1ca9`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
