# Rolling Restart Priority Recovery Operation Workflow Classification

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "diagnostic-classification",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Fresh representative evidence moved off startup_active_gate_owner: all five nodes report active, snapshot coverage moved to 3/5, and the canonical route now selects priority_recovery_partition_progress under operation_workflow_owner / workflow_progress.",
    "nextAction": "Classify the priority recovery residual groups and select rerun, runtime work, or architecture escalation before editing operation workflow runtime.",
    "closed": "2026-05-28",
    "successor": "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
      "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md",
      "work/packages/done-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md",
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
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
      "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md",
      "work/packages/done-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "representative-migrated",
    "whyHighestLeverageNow": "The owner-recovery package moved the representative frontier; the next bounded step is to classify the new priority recovery residuals before runtime edits."
  },
  "modelFit": {
    "packageClass": "diagnostic-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostic-owner-evidence/current-artifact",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond package and sprint tracker files",
      "runtime ownership or shared operation workflow contracts must change",
      "fresh route evidence contradicts operation_workflow_owner / workflow_progress"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
        "regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
        "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    }
  },
  "mechanismCard": {
    "failureMechanism": "scheduling_gap",
    "stableFacts": "Rolling-restart remains red, but startup active-gate owner recovery moved: active node count is 5/5 and snapshot coverage moved to 3/5.",
    "changedFacts": "The fresh route selects priority_recovery_partition_progress with operation_workflow_owner / workflow_progress, dominant reason priority_recovery_event_driven_wait, and priority recovery residual splitRequired=true.",
    "rejectedAlternatives": "Do not continue startup active-gate owner recovery patches from the prior artifact; do not edit operation workflow runtime before classifying the residual groups.",
    "ownerWhoDecides": "operation_workflow_owner",
    "currentAction": "Priority recovery partition progress waits behind event-driven workflow progress evidence.",
    "missingTransitionOrObservation": "Determine whether the residual is accepted backpressure needing rerun evidence, runtime workflow progress work, or architecture escalation.",
    "smallestFalsifyingProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown",
    "expectedMovement": "Classification names rerun, runtime successor, or architecture escalation with the priority recovery residual groups preserved.",
    "negativeResultMeans": "If residuals do not support this owner boundary, route again before runtime edits.",
    "escalationRule": "Same-frontier priority recovery residuals after classification and rerun require runtime-owner-boundary or architecture escalation instead of another classifier."
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Classify priority recovery residuals before runtime edits."
  },
  "causalGovernance": {
    "hypothesis": "After owner-recovery queue progress, the first blocking edge is event-driven priority recovery workflow progress.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "expectedCausalModelChange": "Classification should decide rerun evidence, runtime workflow-progress work, or architecture escalation without editing startup active-gate owner recovery.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh evidence reports all nodes active, snapshotCoverage=3/5, publication OPEN, pendingAck=1, and priority_recovery_partition_progress with splitRequired=true.",
    "crossBoundaryReview": "Keep startup active-gate owner recovery, selected-source ordering, generic timeout budgets, admin API, transport, table bootstrap, and promotion gates frozen until this owner boundary is classified."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart operation workflow progress classification",
    "phaseChain": [
      "owner recovery queue fixture passed locally",
      "representative active nodes moved to 5/5 and snapshot coverage moved to 3/5",
      "fresh route selected priority_recovery_partition_progress under operation_workflow_owner / workflow_progress"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "publication remains OPEN while priority recovery progresses",
      "startup readiness remains downstream while rolling-restart is not representative-green"
    ],
    "missingCausalEdge": "Priority recovery residual groups must be classified before runtime workflow edits.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown",
    "falsifyingProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown",
    "boundedProgressProof": "Classification must preserve the residual groups and select rerun, runtime dispatch/advance work, or architecture escalation.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "expectedObservableTransition": "next package closes as classification-only and opens an autonomous architecture experiment for split priority recovery residuals.",
    "maxProgressBound": "one classification package before runtime promotion",
    "sameFrontierFallback": "same-frontier residuals after classification require runtime-owner-boundary or architecture escalation.",
    "expectedNextFrontier": "priority recovery split residual architecture experiment",
    "resultClassification": "classification-only",
    "stopCondition": "architecture-gap-stop"
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown"
    ],
    "decisionRecord": "Residual extractor found splitRequired=true across workflow_progress and rebalancer_handoff, so runtime promotion is blocked until an autonomous architecture experiment selects a route.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "Do not open workflow runtime work on unchanged splitRequired evidence; the successor architecture experiment must select workflow_progress runtime, rebalancer split, rerun, or architecture stop."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "priority recovery residual extractor reports splitRequired=true",
      "workflow_progress has three recovering_in_flight witnesses and rebalancer_handoff has one witness",
      "same-frontier runtime promotion is blocked on unchanged split residual evidence"
    ],
    "selectedChoice": "architecture-package-select-route",
    "nextAction": "Open the split priority-recovery residual architecture experiment before runtime work.",
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
        "summary": "Open workflow_progress runtime only after the architecture proof selects a concrete dispatch or advance mechanism.",
        "route": "continue-local-proof",
        "proof": [
          "selected by the architecture experiment before runtime edits"
        ]
      }
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "diagnostic-classification",
    "expectedDelta": "Open a causal escalation package to select the route for split priority recovery residuals before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "current-blocker refresh: npm run work:repair",
      "npm run work:validate -- --entry work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md"
    ]
  },
  "commitAndPushLedgerRequired": true,
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
      "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  }
}
-->

## Why

The owner-recovery queue package moved the representative route. This package records the new first frontier before operation workflow runtime is edited.

## Mechanism Card

- Failure mechanism: `scheduling_gap`.
- Stable facts: rolling-restart remains red, but startup active-gate owner recovery reduced: active nodes are `5/5` and snapshot coverage moved to `3/5`.
- Changed facts: canonical route now selects `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`.
- Rejected alternatives: do not continue startup active-gate owner recovery patches from the prior artifact; do not edit operation workflow runtime before residual classification.
- Owner who decides: `operation_workflow_owner`.
- Current action: priority recovery partition progress waits behind event-driven workflow progress evidence.
- Missing transition or observation: determine whether the residual is accepted backpressure needing rerun evidence, runtime workflow progress work, or architecture escalation.
- Smallest falsifier: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown`.
- Expected movement: classification names rerun, runtime successor, or architecture escalation.
- Negative result means: reroute before runtime edits.
- Escalation rule: same-frontier residuals after classification and rerun require runtime-owner-boundary or architecture escalation.

## Classification-Only Fast Path

- Runtime, test, script, and report paths stay out of runtime write scope until this package promotes implementation.
- Keep proof to canonical evidence commands.
- Close or promote after the residual classification; do not accumulate another classifier on unchanged evidence.

## Execution Evidence

- [x] action: implementation; owner: operation_workflow_owner; files-changed: work/packages/active-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md, work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md; validation: `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown`, and `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown` pass; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: operation_workflow_owner; files-changed: work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md; validation: successor entry/pre-impl validation passed for split priority recovery architecture experiment; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair pending after migration; parent revalidated focused proof: yes; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: f6c809d28e474d858123068967ca881448774708
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json`
2. `npm run work:scenario-triage -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown`
3. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown`
