# Rolling Restart Active Gate Snapshot Coverage Repair

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The preflight confirmation representative rerun failed with active_gate_snapshot_coverage_incomplete timeout. normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff expects selectedActiveGateOwnerCohort when falling back, but the active-gate projection context is not fully applying.",
  "nextAction": "Align normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff to fall back to cohort and verify active-gate projection.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "Resolving this cohort mapping is the direct next action for the active sprint goal to ensure the active gate converges cleanly.",
  "theoryLedgerRefs": [
    "theory-20260513-rolling-restart-preflight-green-gate-confirmation"
  ],
  "proof": [
    "npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
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
    "test/rebalancer/cluster-readiness-gate.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer.test-part-5.js",
    "test/scripts/analyze-topology-convergence.test.js",
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
    "test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "work/packages/active-20260523-rolling-restart-active-gate-snapshot-coverage-repair.md",
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
    "test/rebalancer/cluster-readiness-gate.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer.test-part-5.js",
    "test/scripts/analyze-topology-convergence.test.js",
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
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package"
    ]
  },
  "representativeResidual": {
    "status": "active",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Align cohort fallback mapping."
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane"
    ],
    "childPackageCandidates": []
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js"
    ],
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor.",
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes."
  },
  "causalGovernance": {
    "hypothesis": "normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff must support selectedActiveGateOwnerCohort fallback, enabling waitOwnerRecoveryHandoff to evaluate to true.",
    "stopConditionCheck": "Focused TAP test, fresh representative rolling-restart, and npm run analyze:causal-model before closure.",
    "expectedCausalModelChange": "Active gate snapshot coverage completes successfully.",
    "representativeOutcome": "reduced",
    "causalDebt": "The cohort fallback mapping is missing in normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff.",
    "crossBoundaryReview": "Only cluster-segment-7-class-4.js is modified."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "startup active gate timeout is detected",
      "transport closed observations are registered",
      "wait owner recovery handoff is evaluated",
      "cohort fallback is resolved",
      "snapshot coverage converges"
    ],
    "currentFirstFrontier": "startup_active_gate_owner/snapshot_coverage",
    "knownDownstreamBlockers": [
      "active gate snapshot coverage remains incomplete"
    ],
    "missingCausalEdge": "selectedActiveGateOwnerCohort is not parsed as handoff in normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js",
    "boundedProgressProof": "The focused test proves that normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff successfully falls back to cohort, resolving the pending owner reconciliation to advance convergence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json",
    "expectedObservableTransition": "Active gate snapshot coverage complete is true in representative rerun.",
    "maxProgressBound": "one local patch",
    "sameFrontierFallback": "Stop for autonomous architecture experiment if same-frontier.",
    "expectedNextFrontier": "green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260523-rolling-restart-single-inactive-snapshot-coverage-architecture-experiment.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Supported because this maps a specific missing fallback mapping highlighted by the diagnostic report witness.",
    "handoffInvariant": "cohort recovery is bounded."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Active gate snapshot coverage completes successfully.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "not-closed",
  "commitAndPushLedgerRequired": false,
  "successor": "not-provided"
}
-->

## Why

This package directly repairs the cohort fallback mapping inside the active-gate recovery projection context so the rolling-restart scenario can successfully resolve pending owner reconciliation and converge cleanly.

## Scope Basis

Approved rolling-restart stability goal runtime-owner-boundary scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: Bounded to `startup_active_gate_owner / snapshot_coverage` and `test/distributed/harness/cluster-segment-7-class-4.js`.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage successfully fallbacks and resolves cohort pending recovery.
- Inputs/signals: test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json.
- State model or invariant: normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff maps the fallback cleanly.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run work:evidence-summary -- test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff fallback correctly?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json --fast-local --verbose
- Pre-edit focused probe: npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json`
- Expected delta: representative-green

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`

## LLM Tool-First Contract

We run validator tools first before any ad-hoc edits.

## Workflow Acceleration Contract

We validate at each step (entry, pre-impl, and closure).

## In Scope

1. Align active-gate cohort fallbacks in `test/distributed/harness/cluster-segment-7-class-4.js`.

## Out Of Scope

1. Modifying other owners' scopes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`

## Model-Fit Split

Single executor model is sufficient.

## Execution Evidence

- [x] implementation: status: validated; evidence: Cohort fallback mapping aligned in `normalizeSelectedSnapshotTimeoutOwnerRecoveryHandoff` of `test/distributed/harness/cluster-segment-7-class-4.js` to correctly resolve `selectedActiveGateOwnerCohort`. Running focused TAP tests `cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js` passes successfully (6/6 assertions); parent revalidated focused proof: yes; next: closure.
- [x] verification-fix: status: validated; evidence: Checked and verified correctness of fallback mapping; focused tests pass perfectly and `npm run work:validate -- --pre-impl` succeeds; changed files: `test/distributed/harness/cluster-segment-7-class-4.js`; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: validated; evidence: `npm run work:repair` executed to align track metadata; next: closure.

## Theory Ledger References

1. `theory-20260513-rolling-restart-preflight-green-gate-confirmation`
2. no ledger update
