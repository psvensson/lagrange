# Theory Loop Active Gate Calibration Proof

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "theory_loop_active_gate_calibration",
    "dominantReason": "active_gate_timed_out",
    "currentState": "The current active-gate evidence stayed on snapshot coverage with owner_reconcile_pending, write_deferred, enqueued=false, pendingReconcileCount=0, and snapshotCoverageNodeCount=1/5 after witness-selection, bounded-return, and retry-cadence work.",
    "nextAction": "Prove the upgraded theory loop classifies the active-gate evidence as a transition or scheduling gap and rejects another witness-selection, timeout-only, or downstream-symptom package from unchanged evidence.",
    "predecessor": "work/packages/done-20260528-theory-loop-negative-learning-frontier-history.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "test/scripts/work-theory-loop-active-gate-calibration.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json",
      "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
      "work/packages/done-20260528-theory-loop-mechanism-card-command.md",
      "work/packages/done-20260528-theory-loop-artifact-compare-invariants.md",
      "work/packages/done-20260528-theory-loop-negative-learning-frontier-history.md"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js"
    ],
    "commitScope": [
      "test/scripts/work-theory-loop-active-gate-calibration.test.js",
      "work/packages/active-20260528-theory-loop-active-gate-calibration-proof.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the representative gate and current first frontier active_gate_snapshot_coverage by proving the workflow upgrade improves the current rolling-restart failure pattern without runtime edits."
  },
  "modelFit": {
    "packageClass": "test-only-workflow-calibration",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "fixture-proof/current-problem-calibration",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "the proof requires runtime changes",
      "the tools cannot classify the evidence without active-gate-specific branches",
      "the active-gate artifacts are missing or contradict current blocker state"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260526-rolling-restart-selected-view-best-view-evidence-gap",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap",
      "theory-20260522-snapshot-watch-handoff-contract"
    ],
    "theoryLedger": "no ledger update",
    "proof": {
      "commands": [
        "falsifier: npm test -- test/scripts/work-theory-loop-active-gate-calibration.test.js",
        "regression: npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
        "supporting: npm run work:mechanism-card -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
        "supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "supporting: npm run work:validate -- --entry work/packages/active-20260528-theory-loop-active-gate-calibration-proof.md",
        "supporting: npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-active-gate-calibration-proof.md",
        "supporting: git diff --check -- test/scripts/work-theory-loop-active-gate-calibration.test.js"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "test/scripts/work-theory-loop-active-gate-calibration.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "validationTier": "single-owner",
  "boundedExperiment": {
    "hypothesis": "A mechanism-first theory loop classifies the current active-gate residual as transition_gap or scheduling_gap because owner_reconcile_pending stayed write_deferred with enqueued=false and pendingReconcileCount=0 after adjacent snapshot-coverage fixes.",
    "hypothesisDiscriminator": "If the tooling instead selects selection_gap, budget_gap, or downstream_symptom as the next action from unchanged evidence, the workflow upgrade is not yet strong enough.",
    "expectedMetric": "Mechanism-card, artifact-compare, and frontier-history output all recommend owner-recovery retry/enqueue transition proof or architecture owner migration before more snapshot witness, timeout, or downstream readiness work.",
    "inheritsFrom": "work/sprints/todo-2026-q2-theory-loop-causal-learning-upgrade.md",
    "timebox": "8h",
    "mergeRequirement": "Focused calibration test plus mechanism-card, artifact-compare, frontier-history, package validation, and diff-check proof.",
    "killRule": "If current active-gate artifacts cannot be classified without active-gate-specific branches, stop for workflow architecture instead of enforcing validators."
  },
  "observablePrediction": {
    "metric": "mechanism classification for active-gate evidence",
    "predicted": "The upgraded loop classifies unchanged owner_reconcile_pending/write_deferred/enqueued=false evidence as transition_gap or scheduling_gap and rejects witness-selection, timeout-only, and downstream-symptom next packages.",
    "observed": "The upgraded loop classifies unchanged owner_reconcile_pending/write_deferred/enqueued=false evidence as transition_gap or scheduling_gap and rejects witness-selection, timeout-only, and downstream-symptom next packages.",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
    "metricDelta": 0
  },
  "causalGovernance": {
    "hypothesis": "Unchanged owner_reconcile_pending evidence represents a transition or scheduling gap rather than a witness-selection, timeout, or downstream symptom.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
    "expectedCausalModelChange": "The upgraded theory loop classifies the failure as transition/scheduling gap.",
    "representativeOutcome": "reduced",
    "causalDebt": "none: this is a workflow-tooling calibration package.",
    "crossBoundaryReview": "Ensure the tools stay domain-neutral."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate calibration",
    "phaseChain": [
      "tool-development-completed",
      "calibration-completed"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage",
    "knownDownstreamBlockers": [
      "startup readiness inherits active-gate no-progress"
    ],
    "missingCausalEdge": "The loop must classify missing behavior before choosing implementation.",
    "missingCausalEdgeProbe": "npm test -- test/scripts/work-theory-loop-active-gate-calibration.test.js",
    "falsifyingProbe": "npm test -- test/scripts/work-theory-loop-active-gate-calibration.test.js",
    "boundedProgressProof": "Upgrade the loop and prove it classifies the active-gate evidence as a transition or scheduling gap, validating retry and reconcile behaviour.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
    "expectedObservableTransition": "Transition or scheduling next package instead of witness-selection.",
    "maxProgressBound": "one calibration package",
    "sameFrontierFallback": "Stop at architecture-gap.",
    "expectedNextFrontier": "transition or scheduling work",
    "resultClassification": "reduced",
    "stopCondition": "classification-only-stop"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "workflow_tooling_owner",
    "toBoundary": "theory_loop_active_gate_calibration",
    "reason": "Calibration of upgraded workflow theory loop on existing active-gate evidence without runtime edits.",
    "evidence": "npm test -- test/scripts/work-theory-loop-active-gate-calibration.test.js"
  },
  "mechanismCard": {
    "failureMechanism": "observation_gap",
    "stableFacts": "owner_reconcile_pending, write_deferred, enqueued=false, pendingRecoveryCount=1, pendingReconcileCount=0, snapshotCoverageNodeCount=1/5",
    "changedFacts": "active-gate retry cadence movement from 1/8 to 2/8 where available",
    "rejectedAlternatives": "selection_gap as sufficient, budget_gap as sufficient, downstream_symptom as first action",
    "ownerWhoDecides": "workflow_tooling_owner",
    "currentAction": "Add negative-learning and frontier-history commands that summarize prior package learning before another local patch is selected.",
    "missingTransitionOrObservation": "observation_gap in learning loops showing repeated same-frontier attempts",
    "smallestFalsifyingProbe": "npm test -- test/scripts/work-theory-loop-active-gate-calibration.test.js",
    "expectedMovement": "The loop classifies the active-gate evidence as a transition or scheduling gap and rejects another witness-selection, timeout, or downstream symptom package.",
    "negativeResultMeans": "The workflow upgrade does not correctly recognize unchanged blocker invariant state.",
    "escalationRule": "If current active-gate artifacts cannot be classified without active-gate-specific branches, stop for workflow architecture instead of enforcing validators."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "migrate owner or open architecture gate (to prevent loop oscillation on invariant blockers)",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
      "Update Sprint Strategy Brief from routing decision",
      "Update Current Edge Card from routing decision",
      "npm run work:repair to update current-blocker",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage",
    "evidence": "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json"
  },
  "theoryLedger": "no ledger update: this package uses existing active-gate theories as calibration evidence and does not repeat or modify those runtime theory routes.",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "test/scripts/work-theory-loop-active-gate-calibration.test.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Calibration Question

Would the upgraded theory loop have identified the current active-gate blocker as missing owner-recovery transition or scheduling progress before another adjacent snapshot-coverage patch was selected?

## Expected Classification

1. Stable facts include `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, `pendingRecoveryCount=1`, `pendingReconcileCount=0`, and `snapshotCoverageNodeCount=1/5`.
2. Changed facts include active-gate retry cadence movement from `1/8` to `2/8` where available.
3. Candidate mechanism includes `transition_gap` or `scheduling_gap`.
4. Rejected mechanisms include `selection_gap` as sufficient, `budget_gap` as sufficient, and `downstream_symptom` as first action.
5. Recommended next action is owner-recovery retry/enqueue transition proof or architecture owner migration, not broader snapshot probing.

## In Scope

1. A test-only calibration fixture for the new workflow tooling.
2. Use of current rolling-restart active-gate artifacts as handoff evidence.
3. Verification that the tools stay domain-neutral while still recognizing this current failure pattern.

## Out Of Scope

1. Runtime source edits.
2. New rolling-restart representative reruns.
3. Changing the current active package or active sprint.

## Validation

1. `npm test -- test/scripts/work-theory-loop-active-gate-calibration.test.js`
2. `npm run work:mechanism-card -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json`
3. `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json`
4. `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
5. `npm run work:validate -- --entry work/packages/active-20260528-theory-loop-active-gate-calibration-proof.md`
6. `npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-active-gate-calibration-proof.md`
7. `git diff --check -- test/scripts/work-theory-loop-active-gate-calibration.test.js`

## Execution Evidence

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: test/scripts/work-theory-loop-active-gate-calibration.test.js; validation: calibration proof above with parent revalidated focused proof: yes before closure; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: test/scripts/work-theory-loop-active-gate-calibration.test.js; validation: verifier confirms the proof rejects witness-selection, timeout-only, and downstream-symptom packages from unchanged evidence, with parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair before closure; outcome: validated.
