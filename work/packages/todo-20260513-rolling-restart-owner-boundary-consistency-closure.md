# Rolling Restart Owner Boundary Consistency Closure

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
  "boundary": "topology_frontier_projection",
  "dominantReason": "priority_recovery_startup_boundary_projection_mismatch",
  "currentState": "The latest known artifact has a projection split: evidence-summary and causal critical path promote active_gate_snapshot_coverage, topology explain says priority recovery is satisfied, distributed failure reports priorityRecovery=none, but the priority-recovery residual extractor still reports one workflow-progress witness and causal waits still include priority_recovery:event_driven.",
  "nextAction": "Reconcile topology, residual, causal-model, distributed-failure, active-gate, and startup-readiness projections so the latest artifact has exactly one owner-owned first frontier and stale/subordinate priority-recovery evidence is not promoted into runtime implementation.",
  "proof": [
    "npm run work:subagent-prompt -- --role review --package work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js",
    "node --test test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js",
    "npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md"
  ],
  "writeScope": [
    "work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/causal-analysis-schema.js",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/analyze-topology-convergence.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js"
  ],
  "handoffFiles": [
    "work/packages/todo-20260513-rolling-restart-latest-artifact-preflight-refresh.md",
    "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/causal-analysis-schema.js",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/analyze-topology-convergence.js",
    "test/distributed/harness/failure-bundle-segment-4.js"
  ],
  "commitScope": [
    "work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/causal-analysis-schema.js",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/analyze-topology-convergence.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostics-owner-boundary/current-frontier",
    "escalationTriggers": [
      "the inconsistency is caused by runtime owner state rather than projection",
      "fixing projection requires changing operation workflow or startup active-gate runtime behavior",
      "canonical extractors cannot represent the latest artifact without raw JSON fallback"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If active-gate snapshot coverage is the real first frontier, all diagnostics must demote priority recovery to satisfied or subordinate context and preserve only owner-owned waits that are actually on the critical path.",
    "stopConditionCheck": "Run topology, residual, npm run analyze:causal-model, and distributed-failure extractors before and after the projection fix.",
    "expectedCausalModelChange": "The same artifact should report one consistent first frontier and no contradictory priority-recovery activation decision.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The representative gate remains red until the owner boundary selected by this package is implemented.",
    "crossBoundaryReview": "Requires scenario-release-gate review/fix/implementation sequencing when activated."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "Latest rolling-restart artifact projection reconciliation",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "active gate snapshot coverage",
      "startup readiness"
    ],
    "currentFirstFrontier": "Extractor-dependent: active_gate_snapshot_coverage in evidence-summary; priority recovery satisfied in topology explain; one priority residual witness in residual extractor.",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence after snapshot coverage",
      "budget cascade after active-gate timeout"
    ],
    "missingCausalEdge": "One projection path must decide whether priority recovery evidence is actionable, stale, or subordinate before runtime packages run.",
    "missingCausalEdgeProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json plus focused topology explain commands",
    "boundedProgressProof": "Projection code and fixtures must reconcile the latest artifact consistently before any full scenario rerun.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
    "expectedObservableTransition": "All extractors agree on active-gate, priority-recovery actionable, or contradictory evidence requiring a successor.",
    "maxProgressBound": "one projection review and focused fixture run",
    "sameFrontierFallback": "If priority recovery is still real, activate the operation-progress state-machine package.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage or operation_workflow_owner / workflow_progress with fresh proof",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

The latest artifact should not drive two different implementation stories. This
package is the concrete owner-boundary consistency review: one first frontier,
one owner, one projection grammar, and one activation path.

## Scope Basis

Scenario/release-gate diagnostics work for the active `rolling-restart` closure
path. The package may edit diagnostics and analyzer projection code, not
operation workflow or startup runtime behavior.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is required: the package changes scenario projection semantics
  driven by a representative artifact.
- Escalation trigger to a different runtime package: the projection is correct
  and the inconsistency is real runtime owner state.

## Required Result

When complete, the same latest artifact must produce a non-contradictory answer
across:

1. evidence summary
2. priority-recovery residuals
3. topology explain for priority recovery
4. topology explain for active gate
5. causal model
6. distributed failure summary
7. focused topology/failure-bundle fixtures

## Subagent Sequencing Requirement

When activated, run the required scenario-release-gate sequence:

1. review subagent on the most recent package in this sprint or first-package
   `not-needed` if this is the first activated package
2. fix subagent if review finds fixes
3. implementation subagent for this package

Record the real ledger lines before closure.

## In Scope

1. Diagnostics owner projection and causal schema.
2. Priority residual and topology analyzer consistency.
3. Failure-bundle tests and topology analyzer fixtures.
4. Sprint/package handoff truth for the selected next owner.

## Out Of Scope

1. Operation workflow runtime repairs.
2. Startup active-gate runtime repairs.
3. Full distributed rerun before focused projection proof passes.
4. Treating an owner migration as green.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostics-owner-boundary/current-frontier`
- Owned files: metadata `writeScope`
- Forbidden files: operation workflow and startup active-gate runtime files
  unless this package is superseded by a runtime-owner package.
- Frozen decisions: diagnostics must not reinterpret runtime owner state with
  local fallback branches.
- Escalation triggers: runtime state is the real source, raw JSON fallback is
  needed, or projection changes affect unrelated scenarios.
- Focused proof: extractor ladder plus topology/failure-bundle tests.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md`
3. Before closure, run the proof ladder from metadata and `npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md`
