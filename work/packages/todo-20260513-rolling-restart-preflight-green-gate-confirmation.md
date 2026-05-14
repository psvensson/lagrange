# Rolling Restart Preflight Green Gate Confirmation

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
  "playback": "none",
  "owner": "release_gate_owner",
  "boundary": "rolling_restart_green_gate_confirmation",
  "dominantReason": "full_scenario_requires_preflight_closure_proof",
  "currentState": "The full rolling-restart scenario must not be the next discovery step until latest-artifact refresh, LLM preflight, owner-boundary consistency, focused fixtures, optional runtime owner fixes, and diff-aware risk review have produced durable proof. The earlier active rolling-restart green sprint is paused and must not be mutated by this preflight sprint.",
  "nextAction": "Keep this package blocked until focused proof is closed, dirty scope is split, and the human explicitly resumes the green-sprint gate. Do not run the full rolling-restart release gate or update current-blocker files from this package while the earlier active sprint is paused.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:validate -- --closure work/packages/done-20260513-rolling-restart-latest-artifact-preflight-refresh.md",
    "npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md",
    "npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-latest-residual-fixture-synthesis.md",
    "npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md",
    "focused owner tests selected by the activated runtime package",
    "static guardrails selected by the activated runtime package",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json",
    "npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-preflight-green-gate-confirmation.md"
  ],
  "writeScope": [
    "work/packages/todo-20260513-rolling-restart-preflight-green-gate-confirmation.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-rolling-restart-latest-artifact-preflight-refresh.md",
    "work/packages/superseded-20260513-rolling-restart-operation-progress-state-machine-gap-closure.md",
    "work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md",
    "work/packages/superseded-20260513-rolling-restart-wake-retry-progress-closure.md",
    "work/packages/todo-20260513-rolling-restart-latest-residual-fixture-synthesis.md",
    "work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md",
    "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json"
  ],
  "generatedFiles": [
    "test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/todo-20260513-rolling-restart-preflight-green-gate-confirmation.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md"
  ],
  "modelFit": {
    "packageClass": "representative-green-confirmation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "release-gate-confirmation/after-focused-proof",
    "escalationTriggers": [
      "focused preflight packages are not closed",
      "full scenario fails with a new owner boundary",
      "full scenario fails same-frontier after focused proof"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If the selected owner package and focused preflight proof are correct, the representative rolling-restart run should pass or expose a fresh first frontier with concrete owner evidence.",
    "stopConditionCheck": "Run full rolling-restart after focused proof, then evidence-summary and npm run analyze:causal-model on the resulting artifact.",
    "expectedCausalModelChange": "Representative-green or a fresh owner-boundary migration package.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "None if representative green; otherwise a successor package is required and this package cannot close as successful.",
    "crossBoundaryReview": "Requires scenario-release-gate subagent sequencing when activated."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "Full rolling-restart after preflight closure",
    "phaseChain": [
      "publication convergence",
      "priority recovery",
      "active-gate snapshot coverage",
      "startup readiness",
      "scenario completion"
    ],
    "currentFirstFrontier": "Selected by latest-artifact refresh and prior packages.",
    "knownDownstreamBlockers": [
      "startup readiness support evidence",
      "budget cascade"
    ],
    "missingCausalEdge": "None permitted at closure; red evidence must become a successor package.",
    "missingCausalEdgeProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json plus npm run analyze:causal-model on that artifact",
    "boundedProgressProof": "Focused proof packages must close with bounded retry/reconcile/advance proof before the full rerun.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json",
    "expectedObservableTransition": "rolling-restart passes or fresh owner boundary is recorded.",
    "maxProgressBound": "one focused proof ladder plus one full scenario rerun",
    "sameFrontierFallback": "Do not close; reactivate the selected owner package or create a same-frontier successor.",
    "expectedNextFrontier": "representative-green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

This package is the final guardrail: full `rolling-restart` execution happens
after preflight proof, not before it. It prevents the sprint from declaring
success on classification-only red evidence.

## Scope Basis

Scenario/release-gate confirmation for the active `rolling-restart` closure
track.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is required: it runs and classifies a representative scenario.
- Escalation trigger: focused packages are not closed, the scenario fails
  same-frontier, or a fresh owner boundary appears.

## Required Preconditions

Before this package runs the full scenario:

1. Latest artifact preflight refresh has a recorded activation decision.
2. LLM preflight answer is recorded.
3. Owner-boundary consistency is closed or has produced a successor package.
4. Latest residual fixture proof is closed.
5. Any selected runtime owner package is closed with focused tests and static
   guardrails.
6. Diff-aware risk review has cleared or split dirty changes.
7. The human has explicitly resumed the paused active rolling-restart green
   sprint or authorized this sprint to run the representative gate.

## Pause Boundary

This package must not edit or commit:

1. `work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
2. `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`
3. `work/sprints/current-blocker.json`
4. `work/sprints/current-blocker.md`

Those files belong to the paused green-sprint workflow. This preflight sprint
may read them as handoff context only.

## Subagent Sequencing Requirement

When activated, run scenario-release-gate review, fix if needed, and
implementation subagents before closure.

## In Scope

1. Full scenario execution after focused proof.
2. Evidence summary and causal-model classification of the resulting artifact.
3. Final sprint closure or successor package creation.

## Out Of Scope

1. Runtime fixes inside the confirmation package.
2. Timeout stretching.
3. Classification-only closure while `rolling-restart` is red.

## Model Fit

- Package class: `representative-green-confirmation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `release-gate-confirmation/after-focused-proof`
- Owned files: this package and the sprint file
- Forbidden files: runtime `src/` and tests unless a separate runtime package is
  activated.
- Frozen decisions: representative green is the only sprint success measure.
- Escalation triggers: preconditions missing, same-frontier red, or new owner
  boundary.
- Focused proof: closed preflight packages plus full scenario artifact.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-rolling-restart-preflight-green-gate-confirmation.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-rolling-restart-preflight-green-gate-confirmation.md`
3. Before closure, run metadata proof ladder and closure validation.
