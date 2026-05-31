# Rolling Restart Priority Recovery Rebalancer Handoff Owner Wake Rerun Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json",
    "playback": "none",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "priority_recovery_owner_wake_rerun",
    "currentState": "Focused owner wake proof is expected to pass in the predecessor package; fresh representative evidence is still required to classify whether the priority-recovery residual reduces, clears, migrates, repeats, or exposes an architecture gap.",
    "nextAction": "Run fresh representative rolling-restart evidence after the owner wake route implementation and route the result before any further source package.",
    "predecessor": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-route.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
      "test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The focused owner wake proof only validates the local scheduling contract; the release-relevant question is whether fresh representative evidence reduces, clears, migrates, repeats, or exposes an architecture gap.",
    "representativeRerunCadence": "fresh-representative-rerun"
  },
  "modelFit": {
    "packageClass": "representative-rerun",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "representative-rerun/post-owner-wake-route",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "fresh evidence repeats the same priority-recovery frontier without reduction",
      "fresh evidence migrates to another owner boundary",
      "representative evidence is unavailable or contradictory"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-architecture-gap"
    ],
    "proof": {
      "commands": [
        "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json --fast-local --verbose",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_owner_wake_rerun --explain priority_recovery_partition_progress",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json"
      ]
    }
  },
  "representativeResidual": {
    "status": "needs-rerun",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json",
    "frontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Run fresh representative evidence after the owner wake route proof.",
    "residualCount": 1,
    "witnessCount": 2
  },
  "causalGovernance": {
    "hypothesis": "After the bounded owner wake/progress contract is proven locally, fresh representative evidence should reduce, clear, migrate, repeat, or select architecture-gap continuation.",
    "stopConditionCheck": "Run the representative rolling-restart command, scenario-route, evidence-summary, `npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json`, and current-blocker repair before selecting the next package.",
    "expectedCausalModelChange": "Representative evidence should move from the stale accepted-backpressure artifact to a fresh classified route.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Rolling-restart remains red until fresh post-route evidence exits green or names the next owner boundary.",
    "crossBoundaryReview": "Do not edit runtime source in this rerun gate."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart post owner wake route representative rerun",
    "phaseChain": [
      "priority-recovery backpressure reduced from 8 to 2 witnesses",
      "architecture-gap analysis and owner-dossier repair selected a scheduling-layer owner wake route",
      "focused proof in the predecessor package validates the bounded owner re-entry contract",
      "fresh representative evidence is required before any further source package"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains downstream until priority recovery clears or migrates",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits red"
    ],
    "missingCausalEdge": "fresh representative route after focused bounded owner wake proof",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json --fast-local --verbose",
    "falsifyingProbe": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json --fast-local --verbose",
    "boundedProgressProof": "The predecessor focused proof must pass and expose the bounded owner wake/retry timer progress mechanism before this rerun starts.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "expectedObservableTransition": "representative evidence reduces, clears, migrates, repeats with no reduction, or records architecture-gap continuation",
    "maxProgressBound": "one representative rerun before route classification",
    "sameFrontierFallback": "Same-frontier or no-reduction evidence opens architecture/causal successor instead of another local runtime patch.",
    "expectedNextFrontier": "representative-green, migrated owner boundary, or architecture/causal successor",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "mechanismCard": {
    "failureMechanism": "post-owner-wake representative rerun",
    "stableFacts": "The current baseline artifact keeps two priority-recovery witnesses under operation_workflow_owner / rebalancer_handoff with retry_scheduled rebalancer_handoff progress.",
    "changedFacts": "The predecessor package binds retry-scheduled rebalancer handoff progress to an explicit bounded owner re-entry contract field.",
    "rejectedAlternatives": "Do not open another local runtime source package before fresh representative evidence routes the post-proof outcome.",
    "ownerWhoDecides": "representative_evidence_owner",
    "currentAction": "Run fresh rolling-restart representative evidence and route the result.",
    "missingTransitionOrObservation": "Fresh evidence after bounded owner wake proof must classify the next frontier.",
    "smallestFalsifyingProbe": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json --fast-local --verbose",
    "expectedMovement": "Representative evidence reduces or clears priority-recovery witnesses, migrates owner boundary, repeats without reduction, or records architecture-gap continuation.",
    "negativeResultMeans": "Open the selected architecture/causal successor instead of another local runtime patch.",
    "escalationRule": "Same-frontier, no-reduction, contradictory, unavailable, or architecture-gap evidence redirects the theory loop."
  },
  "boundedExperiment": {
    "hypothesis": "The focused bounded owner wake contract should permit representative priority-recovery evidence to move on the next fresh rerun.",
    "hypothesisDiscriminator": "Route the new artifact with scenario-route and compare it to the two-witness accepted-backpressure baseline.",
    "expectedMetric": "priority-recovery witness count reduces below 2, clears, migrates, or selects a non-runtime successor.",
    "inheritsFrom": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-route.md",
    "timebox": "24h",
    "mergeRequirement": "fresh representative rerun plus canonical route classification",
    "killRule": "Do not open another local runtime source package if fresh evidence is unchanged, same-frontier, no-reduction, contradictory, or architecture-gap."
  },
  "closureSummary": {
    "resultClassification": "pending-before-probe",
    "predictionAccuracy": "pending-before-observation",
    "observedMovement": "pending closure",
    "successorReason": "pending closure",
    "nextOwnerBoundary": "pending closure",
    "evidenceArtifact": "test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json"
  }
}
-->

## Why

The predecessor package is a focused local proof. This package owns the fresh
representative rerun required to measure whether that proof moves the release
frontier.

## Scope

- In: fresh rolling-restart representative evidence, route classification, and
  sprint/package truth updates.
- Out: runtime source, active-gate source, release-gate source, and unrelated
  diagnostic grammar.

## Validation

1. falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json --fast-local --verbose
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_owner_wake_rerun --explain priority_recovery_partition_progress
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-owner-wake-rerun.report.json

## Execution Evidence

- [ ] action: implementation; owner: representative_evidence_owner; files-changed: none recorded yet; validation: representative rerun and route classification; outcome: pending.
