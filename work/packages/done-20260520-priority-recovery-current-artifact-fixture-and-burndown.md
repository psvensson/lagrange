# Priority Recovery Current Artifact Fixture And Burndown

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-only-baseline-20260513/rolling-restart/",
  "owner": "diagnostics_owner",
  "boundary": "priority_recovery_fixture_and_burndown",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The compact control_plane_publications-p1 fixture now preserves dispatch_pending/planned and classifies publication_operation_workflow_handoff_leg_missing with nextOwnerPath operation_workflow_owner / workflow_progress.",
  "nextAction": "Use this compact handoff-probe proof before any operation_workflow_owner / workflow_progress runtime package reaches pre-implementation.",
  "proof": [
    "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
    "node --test test/scripts/analyze-topology-convergence.test.js",
    "node --test test/scripts/priority-recovery-current-artifact-fixture.test.js",
    "npm --silent run analyze:causal-model -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "npm run work:validate -- --closure work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md"
  ],
  "writeScope": [
    "work/packages/active-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "test-output/reports/.playback/rolling-restart-green-only-baseline-20260513/rolling-restart/failure-bundle.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "scripts/analyze-topology-convergence.js"
  ],
  "commitScope": [
    "work/packages/active-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
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
      "the fixture cannot reproduce the dispatch_pending/planned handoff probe",
      "the work requires runtime owner changes instead of diagnostics fixture proof",
      "fresh representative evidence changes the owner-boundary group shape"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "H1 says operation_workflow_owner can be advanced from the persisted dispatch_pending/planned witness; H2 says active-gate publication observation is still the first blocker; H3 says the old May 13 residual fixture is too broad for the current frontier.",
    "hypothesisDiscriminator": "H1 predicts the compact fixture reports operationWorkflow workflow_progress with currentStepId dispatch_pending and currentStepState planned; H2 predicts activeGate remains the next owner path; H3 predicts the compact fixture cannot preserve the control_plane_publications-p1 witness.",
    "expectedMetric": "handoff-probe operationWorkflow.currentStepId=dispatch_pending and currentStepState=planned",
    "inheritsFrom": "work/tracks/topology-convergence.md",
    "timebox": "24h",
    "mergeRequirement": "handoff-probe fixture and focused analyzer test distinguish H1/H2/H3",
    "killRule": "stop runtime edits if the compact fixture cannot reproduce control_plane_publications-p1 dispatch_pending/planned"
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
  },
  "requiredPreImplProbe": {
    "command": "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
    "artifact": "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "reason": "Any next runtime package on operation_workflow_owner / workflow_progress must cite the compact dispatch_pending/planned proof before src/ edits."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "workflow_progress",
    "toOwner": "diagnostics_owner",
    "toBoundary": "priority_recovery_fixture_and_burndown",
    "reason": "This active package is fixture-first diagnostics proof for the operation workflow frontier, not a runtime owner migration.",
    "evidence": "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe"
  },
  "causalGovernance": {
    "hypothesis": "If H1 is true, the compact fixture should reproduce the control_plane_publications-p1 dispatch_pending/planned operation workflow witness without a rolling-restart harness rerun.",
    "stopConditionCheck": "npm run analyze:causal-model -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json plus npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe plus node --test test/scripts/analyze-topology-convergence.test.js",
    "expectedCausalModelChange": "No runtime causal model changes in this package; the expected change is a replayable blocker proof surface for the next operation workflow package.",
    "representativeOutcome": "classification-only",
    "causalDebt": "The representative rolling-restart run remains red; this package reduces debugging uncertainty by making the dispatch_pending/planned workflow witness replayable. The fixture causal model reports accept_classified_backpressure for operation_workflow_owner / workflow_progress, while the handoff probe selects the operation workflow advance path.",
    "crossBoundaryReview": "Not yet active. When promoted, this package needs the standard scenario-release-gate review/fix/implementation sequence unless the host records tool-unavailable or human-waived with a reason."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "control_plane_publications-p1 dispatch_pending/planned handoff probe fixture",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "rebalancer handoff",
      "startup active-gate snapshot coverage"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress remains blocked under operation_workflow_owner / workflow_progress for control_plane_publications-p1.",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff has a secondary residual group",
      "startup_active_gate_owner / snapshot_coverage remains downstream",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending ACKs"
    ],
    "missingCausalEdge": "The missing edge is not repaired here; the package freezes dispatch_pending/planned so operation workflow advance proof can run without rolling-restart.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
    "boundedProgressProof": "Bounded fixture proof must show control_plane_publications-p1 carries dispatch_pending/planned before the next runtime reconcile or advance package starts.",
    "boundedProgressProofArtifact": "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "expectedObservableTransition": "A stable dispatch_pending/planned fixture exists for the next operation workflow package.",
    "maxProgressBound": "one handoff-probe fixture extraction test",
    "sameFrontierFallback": "If the fixture cannot preserve dispatch_pending/planned, keep this diagnostics package active and update the fixture before runtime work.",
    "expectedNextFrontier": "operation-progress kernel package",
    "resultClassification": "classification-only",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

The active sprint has repeatedly migrated among operation scheduling,
workflow progress, and rebalancer handoff. This package creates the fast proof
surface that the next runtime package needs: a compact
`control_plane_publications-p1` fixture that replays the exact
`dispatch_pending` / `planned` operation workflow state without running the
full distributed harness.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart release-gate closure
under AGPL-owned topology workflow stabilization, failure simulation, and
production guarantees.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: fixture-first diagnostics proof distinguishes
  H1/H2/H3 without runtime edits.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or
  representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md
2. test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json
3. test/scripts/analyze-topology-convergence.test.js
4. test/scripts/priority-recovery-current-artifact-fixture.test.js

## Out Of Scope

1. Runtime ownership changes.
2. Changing the residual extractor's semantics.
3. Treating fixture proof as a green `rolling-restart` result.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md`, `test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json`, `test/scripts/analyze-topology-convergence.test.js`, `test/scripts/priority-recovery-current-artifact-fixture.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: the fixture cannot reproduce the dispatch_pending/planned handoff probe, runtime ownership changes are required, or representative scenario evidence changes.
- Focused proof: `npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe`, `node --test test/scripts/analyze-topology-convergence.test.js`, `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`, `npm --silent run analyze:causal-model -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json`, `npm run work:validate -- --closure work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md`
- Model ledger advisory: `escalate`

## Causal Governance

- Causal hypothesis: the compact fixture should reproduce the
  `control_plane_publications-p1` dispatch-pending/planned workflow witness.
- Stop-condition check:
  `npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe`
  plus
  `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`
  plus
  `npm --silent run analyze:causal-model -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json`
- Expected causal model change: no runtime causal model change; this package
  establishes the replayable proof surface for the next architecture package.
- Representative outcome: `classification-only`
- Causal debt: `rolling-restart` remains red until later runtime packages
  collapse the residual and the representative run passes; the compact fixture
  now carries the operation-workflow handoff proof surface.

## Scenario Causal Closure

- Reference scenario/probe: compact `control_plane_publications-p1`
  dispatch-pending/planned handoff fixture.
- Phase chain: publication convergence, priority recovery operation workflow
  progress, rebalancer handoff, startup active-gate snapshot coverage.
- Current first frontier: `priority_recovery_partition_progress` blocked under
  `operation_workflow_owner / workflow_progress`.
- Known downstream blockers: secondary `operation_workflow_owner /
  rebalancer_handoff`, then `startup_active_gate_owner / snapshot_coverage`.
- Missing causal edge: deferred to the operation-progress kernel package; this
  package freezes the edge shape for deterministic proof.
- Bounded progress proof: compact fixture and representative artifact produce
  the same residual burn-down projection before the next runtime reconcile or
  advance package starts.

## Execution Notes

- Target fixture:
  `test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json`
- Target fixture test:
  `test/scripts/analyze-topology-convergence.test.js`
- Runtime dependency: the next runtime package must cite this fixture proof
  before `work:validate -- --pre-impl` passes.

## Validation

1. npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe
2. node --test test/scripts/analyze-topology-convergence.test.js
3. node --test test/scripts/priority-recovery-current-artifact-fixture.test.js
4. npm --silent run analyze:causal-model -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json
5. npm run work:validate -- --closure work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md

## Execution Evidence

- [x] implementation: status: validated; evidence: `npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe`, `node --test test/scripts/analyze-topology-convergence.test.js`, `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`, `npm --silent run analyze:causal-model -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json`, and `npm run work:validate -- --closure work/packages/done-20260520-priority-recovery-current-artifact-fixture-and-burndown.md`; parent validation: yes; next: use the compact handoff-probe fixture before operation_workflow_owner / workflow_progress runtime promotion.
