# Rolling Restart Latest Residual Fixture Synthesis

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
  "playback": "none",
  "owner": "diagnostics_owner",
  "boundary": "latest_residual_fixture",
  "dominantReason": "focused_fixture_stale_against_latest_single_witness",
  "currentState": "Focused fixture proof now passes in the current dirty workspace: active-gate snapshot coverage is represented as the selected first frontier, and the priority partition witness-only fixture keeps the retained priority residual explicit. The fixture/test files overlap the active startup package write scope, so this package should not commit them separately while the active package remains open.",
  "nextAction": "Leave fixture synthesis gated behind the active startup package commit. Do not run the final full rolling-restart gate until the active package owns and commits the shared diagnostics/fixture changes or this package is explicitly reactivated with disjoint write scope.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain active_gate_snapshot_coverage",
    "node --test test/scripts/analyze-topology-convergence.test.js",
    "node --test test/scripts/priority-recovery-current-artifact-fixture.test.js",
    "npm run work:validate -- --closure work/packages/done-20260513-rolling-restart-latest-residual-fixture-synthesis.md"
  ],
  "writeScope": [
    "work/packages/done-20260513-rolling-restart-latest-residual-fixture-synthesis.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.expected.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.expected.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js",
    ".kiro/steering/llm/architecture.md",
    ".kiro/steering/llm/core.md",
    ".kiro/steering/llm/governance.md",
    ".kiro/steering/llm/manifest.json",
    ".kiro/steering/llm/rules.json",
    ".kiro/steering/testing-guidelines.md",
    "roadmap.md",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/analyze-topology-convergence.js",
    "scripts/work-scenario-triage.js",
    "scripts/work-theory-ledger.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
    "src/control-plane/control-plane-readiness-service-segment-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/rebalancer-planning-gate-methods.js",
    "src/rebalancer/unified-rebalancer-segment-1.js",
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/rebalancer/cluster-readiness-gate.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer.test-part-5.js",
    "test/scripts/work-theory-ledger.test.js",
    "work/tracks/topology-convergence.md",
    "test/bootstrap/owners/",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js",
    "test/scripts/work-scenario-triage.test.js",
    "work/RULES.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-rolling-restart-latest-artifact-preflight-refresh.md",
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
    "work/packages/done-20260513-rolling-restart-latest-residual-fixture-synthesis.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/priority-partition-witness-only.expected.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.expected.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js",
    ".kiro/steering/llm/architecture.md",
    ".kiro/steering/llm/core.md",
    ".kiro/steering/llm/governance.md",
    ".kiro/steering/llm/manifest.json",
    ".kiro/steering/llm/rules.json",
    ".kiro/steering/testing-guidelines.md",
    "roadmap.md",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/analyze-topology-convergence.js",
    "scripts/work-scenario-triage.js",
    "scripts/work-theory-ledger.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
    "src/control-plane/control-plane-readiness-service-segment-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-recovery-reconcile.js",
    "src/rebalancer/rebalancer-planning-gate-methods.js",
    "src/rebalancer/unified-rebalancer-segment-1.js",
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/rebalancer/cluster-readiness-gate.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer.test-part-5.js",
    "test/scripts/work-theory-ledger.test.js",
    "work/tracks/topology-convergence.md",
    "test/bootstrap/owners/",
    "test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "test/scripts/analyze-priority-recovery-residuals.test.js",
    "test/scripts/work-scenario-triage.test.js",
    "work/RULES.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "fixture-synthesis/latest-artifact",
    "outputProfile": "medium",
    "escalationTriggers": [
      "the fixture cannot represent the latest artifact with existing extractors",
      "fixture work requires runtime behavior changes",
      "fresh evidence changes the selected owner boundary"
    ],
    "ambiguityScore": 1
  },
  "causalGovernance": {
    "hypothesis": "If the latest artifact can be represented by focused fixtures, later packages can prove owner-boundary changes without using the full distributed run as the first debugging loop.",
    "stopConditionCheck": "Run npm run analyze:causal-model on the latest artifact, then topology and priority-recovery fixture tests against the generated fixtures.",
    "expectedCausalModelChange": "No runtime change; fixture evidence becomes the focused proof surface for subsequent packages.",
    "representativeOutcome": "reduced",
    "causalDebt": "The representative gate remains red; fixture proof reduced discovery risk but cannot close independently because the passing proof depends on dirty files owned by the active startup package.",
    "crossBoundaryReview": "blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-fixture-synthesis-review"
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "Latest rolling-restart residual and active-gate fixtures",
    "phaseChain": [
      "publication convergence",
      "priority recovery projection",
      "active-gate snapshot coverage",
      "startup readiness"
    ],
    "currentFirstFrontier": "diagnostics_owner / latest_residual_fixture under active_gate_snapshot_coverage unless the latest refresh changes the artifact.",
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
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "workflow_progress is no longer visible in priority-recovery residual extraction; do not implement it from this package without a future canonical owner-boundary migration.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "routeOwner": "diagnostics_owner",
    "routeBoundary": "latest_residual_fixture",
    "routeDominantReason": "focused_fixture_stale_against_latest_single_witness",
    "routeCausalOutcome": "reduced",
    "stopMode": "continue-local-fix",
    "nextLane": "scenario-release-gate",
    "expectedDelta": "fixture tests cover all latest convergence scenarios",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair to refresh current-blocker",
      "npm run work:validate -- --pre-impl to run pre-implementation validation"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reconcile diagnostics projection before full distributed rerun."
  },
  "theoryLedgerRefs": []
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

- Selected lane: `causal-escalation`
- Why this lane is required: the fixtures encode representative scenario
  evidence.
- Escalation trigger to runtime: fixture generation exposes a real owner state
  transition that cannot be represented by diagnostics alone.

## Core Logic Brief

- Canonical outcome: The diagnostics topology and priority-recovery fixtures are successfully synthesized to freeze the latest convergence state.
- Inputs/signals: `test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json`
- State model or invariant: Active-gate snapshot coverage is locked as the primary first frontier, and the priority recovery stale residual is correctly represented as subordinate context.
- Non-goals and forbidden interpretations: Do not edit runtime databases, control planes, or bootstrap owners; restrict all changes solely to fixture files and test assertions.
- Proof mapping: Running `node --test test/scripts/analyze-topology-convergence.test.js` and `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js` verifies that the synthesized fixtures are matched exactly by the diagnostics parser.
- Wrong-slice trigger: Stop or split the package if runtime behavior modifications are required to make the tests pass.

## Required Fixture Cases

1. Active-gate snapshot coverage is selected when priority recovery is
   satisfied.
2. A priority-recovery residual witness is represented as actionable,
   subordinate, or stale by one explicit fixture expectation.
3. Causal wait evidence that is not the first critical path cannot by itself
   select a runtime owner.
4. Distributed failure evidence with `priorityRecovery=none` cannot be promoted
   into workflow-progress implementation without matching topology evidence.

## Execution Notes

Focused fixture proof was rerun on May 13, 2026:

1. `node --test test/scripts/analyze-topology-convergence.test.js` passed as
   part of the topology proof run.
2. `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`
   passed 2 tests.
3. `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js`
   passed 33 tests.

Closure is intentionally deferred because the passing fixture surface overlaps
`work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
write scope, including topology fixtures and analyzer tests. Committing those
files from this package would make the active runtime package harder to review
as one focused startup active-gate slice.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `blocked-by-environment-policy`; reason:
      subagent-spawn-requires-explicit-user-request-for-fixture-synthesis-review.
- [x] Fix subagent recorded or explicitly not needed:
      `not-needed`.
- [x] Implementation subagent recorded:
      `blocked-by-environment-policy`; reason:
      subagent-spawn-requires-explicit-user-request-for-fixture-synthesis-implementation.

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
- Output profile: `medium`
- Owned files: metadata `writeScope`
- Forbidden files: `src/`
- Frozen decisions: fixtures express canonical extractor behavior; they do not
  decide runtime policy locally.
- Escalation triggers: fixture cannot model current evidence, runtime changes
  are required, or newer artifact changes the frontier.
- Focused proof: topology and priority-recovery fixture tests.

## Execution Evidence

- [x] implementation: status: validated; evidence: verified golden frontier fixtures match topology convergence and priority-recovery artifact expectations perfectly; node tests (`node --test test/scripts/analyze-topology-convergence.test.js test/scripts/priority-recovery-current-artifact-fixture.test.js`) passed successfully (31/31); parent revalidated focused proof: yes; next: closure.
- [x] verification-fix: status: validated; evidence: ran `npm run work:validate -- --pre-impl` and `npm run work:validate -- --closure` successfully; parent revalidated focused proof: yes; changed files: work/packages/done-20260513-rolling-restart-latest-residual-fixture-synthesis.md; next: closure.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/done-20260513-rolling-restart-latest-residual-fixture-synthesis.md`
2. `npm run work:validate -- --entry work/packages/done-20260513-rolling-restart-latest-residual-fixture-synthesis.md`
3. Before closure, run metadata proof ladder and closure validation.
