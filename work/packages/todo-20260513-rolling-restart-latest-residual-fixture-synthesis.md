# Rolling Restart Latest Residual Fixture Synthesis

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
  "playback": "none",
  "owner": "diagnostics_owner",
  "boundary": "latest_residual_fixture",
  "dominantReason": "focused_fixture_stale_against_latest_single_witness",
  "currentState": "Existing focused priority-recovery fixture proof was created for an older May 13 baseline. The latest known artifact now needs fixtures that lock the active-gate first-frontier shape and any remaining priority-recovery stale/subordinate witness shape before another full distributed run.",
  "nextAction": "Freeze the latest artifact into focused topology/residual fixtures that prove whether priority recovery is actionable or stale/subordinate and whether active-gate snapshot coverage is the selected first frontier.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain active_gate_snapshot_coverage",
    "node --test test/scripts/analyze-topology-convergence.test.js",
    "node --test test/scripts/priority-recovery-current-artifact-fixture.test.js",
    "npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-latest-residual-fixture-synthesis.md"
  ],
  "writeScope": [
    "work/packages/todo-20260513-rolling-restart-latest-residual-fixture-synthesis.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.expected.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.expected.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "handoffFiles": [
    "work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md",
    "work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md",
    "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.expected.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.expected.json"
  ],
  "commitScope": [
    "work/packages/todo-20260513-rolling-restart-latest-residual-fixture-synthesis.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.expected.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.expected.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "fixture-synthesis/latest-artifact",
    "escalationTriggers": [
      "the fixture cannot represent the latest artifact with existing extractors",
      "fixture work requires runtime behavior changes",
      "fresh evidence changes the selected owner boundary"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If the latest artifact can be represented by focused fixtures, later packages can prove owner-boundary changes without using the full distributed run as the first debugging loop.",
    "stopConditionCheck": "Run npm run analyze:causal-model on the latest artifact, then topology and priority-recovery fixture tests against the generated fixtures.",
    "expectedCausalModelChange": "No runtime change; fixture evidence becomes the focused proof surface for subsequent packages.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The representative gate remains red until the selected owner package fixes or migrates the latest frontier.",
    "crossBoundaryReview": "Requires scenario-release-gate subagent sequencing when activated."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "Latest rolling-restart residual and active-gate fixtures",
    "phaseChain": [
      "publication convergence",
      "priority recovery projection",
      "active-gate snapshot coverage",
      "startup readiness"
    ],
    "currentFirstFrontier": "Expected active_gate_snapshot_coverage unless the latest refresh changes the artifact.",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence",
      "budget accounting cascade"
    ],
    "missingCausalEdge": "Focused fixture coverage for the latest projection split.",
    "missingCausalEdgeProbe": "node --test test/scripts/analyze-topology-convergence.test.js",
    "boundedProgressProof": "The latest artifact must be represented by a compact fixture with bounded reconcile proof before a full rerun.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "expectedObservableTransition": "Fixture tests fail when priority recovery is accidentally re-promoted or active-gate is hidden by stale residual evidence.",
    "maxProgressBound": "one focused fixture test run",
    "sameFrontierFallback": "If fixtures cannot represent the evidence, return to owner-boundary consistency closure.",
    "expectedNextFrontier": "selected runtime owner package",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

The earlier fixture was useful, but it froze an older residual. The newest
evidence needs a focused proof surface that captures the promoted active-gate
frontier and the remaining priority-recovery stale/subordinate question.

## Scope Basis

Scenario/release-gate fixture work under the active `rolling-restart` sprint.
This package writes tests and fixtures only.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is required: the fixtures encode representative scenario
  evidence.
- Escalation trigger to runtime: fixture generation exposes a real owner state
  transition that cannot be represented by diagnostics alone.

## Required Fixture Cases

1. Active-gate snapshot coverage is selected when priority recovery is
   satisfied.
2. A priority-recovery residual witness is represented as actionable,
   subordinate, or stale by one explicit fixture expectation.
3. Causal wait evidence that is not the first critical path cannot by itself
   select a runtime owner.
4. Distributed failure evidence with `priorityRecovery=none` cannot be promoted
   into workflow-progress implementation without matching topology evidence.

## Subagent Sequencing Requirement

When activated, run scenario-release-gate review, fix if needed, and
implementation subagents before closure.

## In Scope

1. Topology convergence fixtures.
2. Priority-recovery current artifact fixture tests.
3. Package/sprint notes that name which focused proof blocks the full scenario
   rerun.

## Out Of Scope

1. Runtime source changes.
2. Full distributed rerun.
3. Reclassifying the artifact without updating expected fixture outputs.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `fixture-synthesis/latest-artifact`
- Owned files: metadata `writeScope`
- Forbidden files: `src/`
- Frozen decisions: fixtures express canonical extractor behavior; they do not
  decide runtime policy locally.
- Escalation triggers: fixture cannot model current evidence, runtime changes
  are required, or newer artifact changes the frontier.
- Focused proof: topology and priority-recovery fixture tests.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-rolling-restart-latest-residual-fixture-synthesis.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-rolling-restart-latest-residual-fixture-synthesis.md`
3. Before closure, run metadata proof ladder and closure validation.
