# Priority Recovery Current Artifact Fixture And Burndown

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-only-baseline-20260513/rolling-restart/",
  "owner": "diagnostics_owner",
  "boundary": "priority_recovery_fixture_and_burndown",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The May 13 rolling-restart artifact has a split priority-recovery residual: four operation_workflow_owner / workflow_progress witnesses and two operation_workflow_owner / rebalancer_handoff witnesses. Full-harness reruns are too slow to be the first debugging surface, so this package freezes the blocker into a replayable fixture and burn-down projection.",
  "nextAction": "Freeze the May 13 rolling-restart blocker into a replayable owner-decision fixture and residual burn-down report.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown",
    "node --test test/scripts/priority-recovery-current-artifact-fixture.test.js",
    "npm run work:validate -- --entry --all"
  ],
  "writeScope": [
    "work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "test-output/reports/.playback/rolling-restart-green-only-baseline-20260513/rolling-restart/failure-bundle.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "scripts/analyze-priority-recovery-residuals.js"
  ],
  "commitScope": [
    "work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-fixture/current-frontier",
    "escalationTriggers": [
      "the fixture cannot reproduce the May 13 residual extractor output",
      "the work requires runtime owner changes instead of diagnostics fixture proof",
      "fresh representative evidence changes the owner-boundary group shape"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If the May 13 priority-recovery residual is the current blocker, a compact fixture should reproduce the same owner-boundary group split, semantic states, next required actions, and witness counts as the representative artifact.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json plus node --test test/scripts/priority-recovery-current-artifact-fixture.test.js",
    "expectedCausalModelChange": "No runtime causal model changes in this package; the expected change is a replayable blocker proof surface for the next operation-progress architecture package.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The representative rolling-restart run remains red; this package reduces debugging uncertainty by making the current split residual replayable without a full harness run.",
    "crossBoundaryReview": "Not yet active. When promoted, this package needs the standard scenario-release-gate review/fix/implementation sequence unless the host records tool-unavailable or human-waived with a reason."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "May 13 rolling-restart priority-recovery residual fixture",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "rebalancer handoff",
      "startup active-gate snapshot coverage"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress remains blocked under operation_workflow_owner / workflow_progress in the representative artifact.",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff has a secondary residual group",
      "startup_active_gate_owner / snapshot_coverage remains downstream",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending ACKs"
    ],
    "missingCausalEdge": "The missing edge is not repaired here; the package freezes the current edge so operation-progress kernel work can prove it deterministically.",
    "missingCausalEdgeProbe": "node --test test/scripts/priority-recovery-current-artifact-fixture.test.js",
    "boundedProgressProof": "Bounded fixture extraction proof must show the compact artifact and the full representative artifact produce the same residual burn-down projection before the next runtime reconcile or advance package starts.",
    "boundedProgressProofArtifact": "test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json",
    "expectedObservableTransition": "A stable owner-decision fixture exists for the next operation-progress package.",
    "maxProgressBound": "one fixture extraction test",
    "sameFrontierFallback": "If the fixture diverges from the artifact, keep the active workflow-progress package open and update the fixture before more runtime work.",
    "expectedNextFrontier": "operation-progress kernel package",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

The active sprint has repeatedly migrated among operation scheduling,
workflow progress, and rebalancer handoff. This package creates the fast proof
surface that the broader architecture work needs: a compact May 13 fixture that
replays the exact priority-recovery residual shape without running the full
distributed harness.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart release-gate closure
under AGPL-owned topology workflow stabilization, failure simulation, and
production guarantees.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md
2. test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json
3. test/scripts/priority-recovery-current-artifact-fixture.test.js

## Out Of Scope

1. Runtime ownership changes.
2. Changing the residual extractor's semantics.
3. Treating fixture proof as a green `rolling-restart` result.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-fixture/current-frontier`
- Owned files: `work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md`, `test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json`, `test/scripts/priority-recovery-current-artifact-fixture.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: the fixture cannot reproduce the May 13 residual extractor output, runtime ownership changes are required, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown`, `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`, `npm run work:validate -- --entry --all`
- Model ledger advisory: `escalate`

## Causal Governance

- Causal hypothesis: the compact fixture should reproduce the same split
  residual as the May 13 representative artifact.
- Stop-condition check:
  `npm run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
  plus
  `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`
- Expected causal model change: no runtime causal model change; this package
  establishes the replayable proof surface for the next architecture package.
- Representative outcome: `pending-before-rerun`
- Causal debt: `rolling-restart` remains red until later runtime packages
  collapse the residual and the representative run passes.

## Scenario Causal Closure

- Reference scenario/probe: May 13 `rolling-restart` priority-recovery residual
  fixture.
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

- Added fixture:
  `test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json`
- Added fixture test:
  `test/scripts/priority-recovery-current-artifact-fixture.test.js`
- Executed proof:
  `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`
  passed with 2 tests.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown
3. node --test test/scripts/priority-recovery-current-artifact-fixture.test.js
4. npm run work:validate -- --entry --all
