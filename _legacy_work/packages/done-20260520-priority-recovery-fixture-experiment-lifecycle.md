# Priority Recovery Fixture Experiment Lifecycle

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-20",
  "lane": "experiment",
  "scenario": "none",
  "artifact": "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
  "playback": "none",
  "owner": "diagnostics_owner",
  "boundary": "priority_recovery_fixture_lifecycle",
  "dominantReason": "fixture_first_experiment_lifecycle",
  "currentState": "The compact control_plane_publications-p1 fixture preserves the dispatch_pending/planned operation workflow witness and can distinguish fixture freshness from downstream active-gate hypotheses without a rolling-restart rerun.",
  "nextAction": "Use the fixture proof as the required pre-implementation probe for the next operation_workflow_owner / workflow_progress runtime package.",
  "proof": [
    "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
    "node --test test/scripts/analyze-topology-convergence.test.js",
    "node --test test/scripts/priority-recovery-current-artifact-fixture.test.js",
    "npm run work:validate -- --closure work/packages/done-20260520-priority-recovery-fixture-experiment-lifecycle.md"
  ],
  "writeScope": [
    "work/packages/done-20260520-priority-recovery-fixture-experiment-lifecycle.md",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260520-priority-recovery-fixture-experiment-lifecycle.md",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "the fixture cannot reproduce dispatch_pending/planned",
      "runtime owner edits become necessary",
      "fresh representative evidence changes the first frontier"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "H1 says the current artifact can be reduced to a deterministic dispatch_pending/planned operation workflow fixture; H2 says active-gate publication observation is the first blocker; H3 says the old May 13 residual fixture is too broad for the current frontier.",
    "hypothesisDiscriminator": "H1 predicts operationWorkflow.currentStepId=dispatch_pending and currentStepState=planned for control_plane_publications-p1; H2 predicts activeGate remains the next owner path; H3 predicts the compact fixture loses the partition witness.",
    "expectedMetric": "handoff-probe operationWorkflow.currentStepId/currentStepState",
    "inheritsFrom": "work/tracks/topology-convergence.md",
    "timebox": "24h",
    "mergeRequirement": "handoff-probe fixture distinguishes H1/H2/H3",
    "killRule": "close as evidence-incomplete if the compact fixture cannot preserve the partition witness"
  },
  "validationTier": "single-owner",
  "observablePrediction": {
    "metric": "operationWorkflow.source topology operator step",
    "predicted": "control_plane_publications-p1 reports dispatch_pending/planned under operation_workflow_owner / workflow_progress",
    "observed": "control_plane_publications-p1 reports dispatch_pending/planned under operation_workflow_owner / workflow_progress",
    "accuracy": "matched",
    "evidence": "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
    "metricDelta": 1
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "operation_workflow_owner",
    "nextBoundary": "workflow_progress",
    "evidence": "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe"
  }
}
-->

## Why

This package records a complete experiment lifecycle for the fixture-first
policy. The result is information: the compact fixture keeps the exact
operation workflow witness that the next runtime package needs.

## Scope

1. work/packages/done-20260520-priority-recovery-fixture-experiment-lifecycle.md
2. test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json
3. test/scripts/analyze-topology-convergence.test.js
4. test/scripts/priority-recovery-current-artifact-fixture.test.js

## Execution Evidence

- [x] implementation: status: validated; evidence: `npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe`, `node --test test/scripts/analyze-topology-convergence.test.js`, `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`, and `npm run work:validate -- --closure work/packages/done-20260520-priority-recovery-fixture-experiment-lifecycle.md`; parent validation: yes; next: use fixture proof before runtime source edits.
