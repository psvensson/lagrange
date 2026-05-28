# Priority Recovery Split Residual Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Priority recovery is the first frontier, but residuals split across workflow_progress and rebalancer_handoff on unchanged representative evidence.",
    "nextAction": "Select the architecture route for split priority-recovery residuals before runtime promotion."
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [
      "src/control-plane/owner-queue.js",
      "src/control-plane/snapshot-service.js",
      "src/control-plane/membership-publication-active-gate-reconcile.js"
    ],
    "commitScope": [
      "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal by selecting the next route for the current first frontier priority_recovery_partition_progress before more local runtime work.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "proof selects a runtime owner-boundary child",
      "proof selects rebalancer_handoff as the first actionable owner boundary",
      "fresh evidence contradicts the split priority-recovery residual shape"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260527-rolling-restart-priority-recovery-workflow-progress"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "regression: npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown"
      ]
    }
  },
  "mechanismCard": {
    "failureMechanism": "ownership_gap",
    "stableFacts": "Canonical route selects priority_recovery_partition_progress under operation_workflow_owner / workflow_progress with dominant reason priority_recovery_event_driven_wait.",
    "changedFacts": "Residual extractor reports four recovering_in_flight witnesses split into workflow_progress and rebalancer_handoff owner-boundary groups, with splitRequired=true.",
    "rejectedAlternatives": "Do not open another same-frontier local workflow_progress runtime package on unchanged evidence until architecture selects the route; do not edit startup active-gate, generic rebalancer, admin, transport, table bootstrap, or promotion gates.",
    "ownerWhoDecides": "operation_workflow_owner",
    "currentAction": "Priority recovery waits behind event-driven workflow progress while one witness also points at rebalancer_handoff.",
    "missingTransitionOrObservation": "Architecture must select workflow progress runtime, rebalancer split, rerun evidence, or architecture stop.",
    "smallestFalsifyingProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown",
    "expectedMovement": "Selected runtime child, owner-boundary split, rerun decision, or architecture stop replaces same-frontier local patching.",
    "negativeResultMeans": "If no concrete route can be selected, stop as architecture-gap instead of opening another local patch.",
    "escalationRule": "Same-frontier splitRequired evidence cannot open another local runtime package without architectureDecisionGate route selection."
  },
  "boundedExperiment": {
    "hypothesis": "The first priority-recovery residual cannot safely promote runtime work because the same artifact splits workflow_progress and rebalancer_handoff witnesses.",
    "hypothesisDiscriminator": "H1 selected if canonical evidence preserves splitRequired=true and architecture must choose route before runtime promotion; H2 selected if route or residuals collapse to one concrete runtime owner boundary.",
    "expectedMetric": "selected architecture choice, owner-boundary child, rerun decision, or architecture-gap stop",
    "inheritsFrom": "work/packages/done-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md",
    "timebox": "24h",
    "mergeRequirement": "scenario-route, causal-model, priority residual extractor, current-blocker repair, and closure validation",
    "killRule": "If the proof cannot select a route from unchanged splitRequired evidence, stop at architecture-gap instead of local runtime patching."
  },
  "validationTier": "release-gate",
  "observablePrediction": {
    "metric": "priority_recovery split residual route selection",
    "predicted": "The architecture experiment selects workflow_progress runtime, rebalancer_handoff split, rerun representative evidence, or architecture-gap stop before runtime edits resume.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "metricDelta": 0
  },
  "representativeResidual": {
    "status": "classification-only",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Select architecture route for split priority recovery residuals."
  },
  "causalGovernance": {
    "hypothesis": "Split priority-recovery residuals require architecture route selection before workflow_progress runtime promotion.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "expectedCausalModelChange": "The package selects a concrete runtime child, split owner-boundary child, rerun decision, or architecture-gap stop.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Fresh evidence reports four priority-recovery witnesses across two operation workflow owner-boundary groups with splitRequired=true.",
    "crossBoundaryReview": "Keep startup active-gate owner recovery, selected-source ordering, generic timeout budgets, admin API, transport, table bootstrap, and promotion gates frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart split priority recovery residual architecture experiment",
    "phaseChain": [
      "owner recovery queue proof moved active nodes to 5/5 and snapshotCoverage to 3/5",
      "classification identified priority_recovery_partition_progress under operation_workflow_owner / workflow_progress",
      "priority residual extractor split four recovering_in_flight witnesses across workflow_progress and rebalancer_handoff"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage remains downstream until priority recovery progresses",
      "rebalancer_handoff may own a split residual if architecture selects that route"
    ],
    "missingCausalEdge": "Architecture must decide whether workflow_progress dispatch/advance, rebalancer handoff, rerun evidence, or architecture stop owns the next move.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
    "boundedProgressProof": "Causal escalation must select a concrete dispatch, advance, handoff, rerun, or architecture-stop progress mechanism before runtime edits resume.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "expectedObservableTransition": "A selected runtime child, owner-boundary split, rerun decision, or architecture stop replaces same-frontier local patching.",
    "maxProgressBound": "one causal escalation package with no runtime edits",
    "sameFrontierFallback": "If canonical evidence cannot select a route from this artifact, stop at architecture-gap rather than opening another local runtime patch.",
    "expectedNextFrontier": "selected priority recovery runtime child, rebalancer split, rerun decision, or architecture-gap stop",
    "resultClassification": "pending-before-probe",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md / startup_active_gate_owner / snapshot_coverage_owner_recovery_queue_drain / migrated",
      "done-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md / operation_workflow_owner / workflow_progress / splitRequired"
    ],
    "oscillationCheck": "This is the autonomous architecture experiment required after classification found splitRequired=true on unchanged priority-recovery evidence.",
    "handoffInvariant": "Runtime promotion remains blocked until architecture selects one owner-boundary route."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "classification proof found priority_recovery_partition_progress with splitRequired=true",
      "workflow_progress has three recovering_in_flight witnesses and rebalancer_handoff has one witness",
      "same-frontier local runtime promotion is blocked until architecture selects a route"
    ],
    "selectedChoice": "architecture-package-select-route",
    "nextAction": "Run the architecture experiment proof before opening runtime work.",
    "choices": [
      {
        "id": "architecture-package-select-route",
        "summary": "Use one causal escalation package to choose workflow_progress runtime, rebalancer split, rerun, or architecture stop.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown"
        ]
      },
      {
        "id": "continue-local-proof",
        "summary": "Open workflow_progress runtime only if the architecture proof selects a concrete dispatch or advance mechanism.",
        "route": "continue-local-proof",
        "proof": [
          "selected by this package before runtime edits"
        ]
      }
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "architecture-or-human-stop",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown"
    ],
    "decisionRecord": "Record whether split priority-recovery evidence selects runtime workflow progress, rebalancer split, rerun, or architecture-gap stop.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "Do not open runtime work until this architecture package selects one route."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "causal-escalation",
    "expectedDelta": "Select route for split priority-recovery residuals before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "current-blocker refresh: npm run work:repair",
      "npm run work:validate -- --entry work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md"
    ]
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-architecture-experiment",
    "nextOwner": "operation_workflow_owner",
    "nextBoundary": "workflow_progress",
    "evidence": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json"
  },
  "theoryLedger": "no-ledger-update"
}
-->

## Why

The priority-recovery classifier found split residual ownership on the unchanged representative artifact. This package selects the architecture route before any local workflow runtime patch.

## Core Logic Brief

- Canonical outcome: select workflow-progress runtime, rebalancer split, rerun representative evidence, or architecture stop.
- Inputs/signals: scenario route, causal model, and priority-recovery residual groups.
- State model or invariant: same-frontier splitRequired evidence must not promote runtime work until one owner-boundary route is selected.
- Non-goals and forbidden interpretations: no runtime, startup active-gate, admin, transport, table bootstrap, generic timeout, or promotion-gate edits.
- Proof mapping: route, causal model, and residual extractor are the complete proof ladder.
- Wrong-slice trigger: if proof needs source edits, split a runtime child package first.

## Mechanism Card

- Failure mechanism: `ownership_gap`.
- Stable facts: `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait` remains the canonical route.
- Changed facts: residuals split into `workflow_progress` and `rebalancer_handoff` groups.
- Rejected alternatives: no local runtime package on unchanged splitRequired evidence.
- Owner who decides: `operation_workflow_owner`.
- Current action: priority recovery waits behind event-driven workflow progress.
- Missing transition or observation: architecture route selection.
- Smallest falsifier: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown`.
- Expected movement: selected runtime child, split, rerun, or architecture stop.
- Negative result means: stop at architecture-gap instead of local patching.
- Escalation rule: runtime promotion stays blocked until one route is selected.

## Execution Evidence

- [ ] action: implementation; owner: operation_workflow_owner; files-changed: none recorded yet; validation: npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress; outcome: pending.
- [ ] action: verification-fix; owner: operation_workflow_owner; files-changed: none recorded yet; validation: verifier reruns focused proof before closure; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: pending.

## Validation

1. `npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`
2. `npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json`
3. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown`
