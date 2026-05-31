# Rolling Restart Priority Recovery Rebalancer Handoff Blocked Route Rerun Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "playback": "none",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "priority_recovery_blocked_route_rerun",
    "currentState": "The runtime progress contract now exposes representativeRerunRoute=blocked_model_route for the rebalancer handoff retry path; representative rolling-restart evidence has not yet consumed that route signal.",
    "nextAction": "Run fresh representative rolling-restart evidence and route the result before any further runtime or downstream owner work."
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
      "test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The predecessor changed runtime contract evidence; the lightest valid next step is fresh representative evidence plus canonical route classification.",
    "representativeRerunCadence": "fresh-representative-rerun"
  },
  "modelFit": {
    "packageClass": "representative-rerun",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "representative-rerun/blocked-route-discriminator",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "fresh evidence names a runtime owner boundary",
      "fresh evidence repeats priority recovery with no reduction",
      "representative evidence is unavailable or contradictory"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state"
    ],
    "proof": {
      "commands": [
        "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --fast-local --verbose",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_blocked_route_rerun --explain priority_recovery_partition_progress",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json"
      ]
    }
  },
  "representativeResidual": {
    "status": "needs-rerun",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "frontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "priority_recovery_blocked_route_rerun",
    "nextAction": "Generate fresh rolling-restart evidence and route the result.",
    "residualCount": 1,
    "witnessCount": 2
  },
  "mechanismCard": {
    "failureMechanism": "fresh representative route after runtime progress-contract discriminator",
    "stableFacts": "The predecessor focused proof emits representativeRerunRoute=blocked_model_route for rebalancer handoff retry progress; the baseline artifact still reports two priority-recovery witnesses.",
    "changedFacts": "Runtime source now exposes the route discriminator consumed by future representative evidence.",
    "rejectedAlternatives": "Do not open another runtime patch or downstream owner package until fresh representative evidence is routed.",
    "ownerWhoDecides": "representative_evidence_owner",
    "currentAction": "Generate and route fresh rolling-restart evidence.",
    "missingTransitionOrObservation": "Fresh representative artifact after blocked_model_route runtime evidence.",
    "smallestFalsifyingProbe": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --fast-local --verbose",
    "expectedMovement": "Fresh evidence reaches green, reduces, migrates, becomes contradictory/unavailable, or selects a non-repeated successor.",
    "negativeResultMeans": "Same-frontier/no-reduction evidence must open an architecture or causal successor, not another local patch.",
    "escalationRule": "Contradictory or unavailable representative evidence records a blocked dependency; repeated same-frontier evidence records a non-runtime successor."
  },
  "observablePrediction": {
    "metric": "rolling-restart representative route after blocked rerun route discriminator",
    "predicted": "Fresh evidence consumes representativeRerunRoute=blocked_model_route or routes to a non-repeated successor before any further runtime work.",
    "observed": "pending-before-rerun",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-rerun"
  },
  "boundedExperiment": {
    "hypothesis": "The runtime progress-contract discriminator gives representative evidence enough route state to avoid another direct rerun loop.",
    "hypothesisDiscriminator": "Compare the fresh rolling-restart artifact against the baseline and route it with canonical tools.",
    "expectedMetric": "Representative evidence exits green, reduces priority-recovery witnesses, migrates owner/boundary, becomes contradictory/unavailable, or selects a non-repeated successor.",
    "inheritsFrom": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md",
    "timebox": "24h",
    "mergeRequirement": "fresh representative rerun plus scenario-route and evidence-summary",
    "killRule": "If fresh evidence is unchanged or same-frontier with no concrete reduction, redirect to an architecture/causal successor rather than another local runtime patch."
  },
  "validationTier": "release-gate",
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "routeOwner": "representative_evidence_owner",
    "routeBoundary": "rolling_restart_rerun",
    "routeDominantReason": "priority_recovery_blocked_route_rerun",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "causal-escalation",
    "expectedDelta": "Fresh representative evidence consumes representativeRerunRoute=blocked_model_route or routes to a non-repeated successor; no direct representative rerun is authorized from a blocked_model_route artifact.",
    "requiredRefreshCommands": [
      "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --fast-local --verbose",
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_blocked_route_rerun",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_blocked_route_rerun --explain priority_recovery_partition_progress",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker with npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Fresh representative evidence must consume the runtime-owned blocked_model_route discriminator before downstream symptoms can become authority.",
    "stopConditionCheck": "Run the representative rolling-restart command, scenario-route, evidence-summary, `npm run analyze:causal-model`, repair, and package validation before selecting any runtime successor.",
    "expectedCausalModelChange": "Fresh evidence should move priority recovery, reach green, migrate ownership, become contradictory or unavailable, or select a non-repeated successor without source edits in this package.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Rolling-restart remains red on the baseline artifact until fresh representative evidence consumes the route discriminator.",
    "crossBoundaryReview": "Runtime source, active-gate, startup readiness, release gate, and benchmark work remain frozen during the representative rerun."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart blocked route representative rerun",
    "phaseChain": [
      "decision table distinguishes eligible from blocked_model_route",
      "runtime progress contract emits blocked_model_route for rebalancer handoff retry",
      "fresh representative evidence is required before downstream or runtime continuation"
    ],
    "currentFirstFrontier": "representative_evidence_owner / rolling_restart_rerun pending fresh artifact",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains downstream until priority recovery drains",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits red"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md / runtime route discriminator implemented"
    ],
    "oscillationCheck": "The package is a representative evidence gate, not another local runtime patch.",
    "handoffInvariant": "Accepted backpressure under blocked_model_route cannot authorize rerun_representative_evidence.",
    "missingCausalEdge": "fresh representative artifact after blocked_model_route route state",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --fast-local --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --fast-local --verbose",
    "boundedProgressProof": "Fresh artifact must prove the blocked_model_route retry/wake path drains, reduces, migrates, or selects a non-repeated successor before any source or downstream continuation.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json",
    "expectedObservableTransition": "green, reduced, migrated, unavailable, contradictory, or non-repeated successor route",
    "maxProgressBound": "one representative rerun before route classification",
    "sameFrontierFallback": "Same-frontier/no-reduction evidence must not open a local runtime patch.",
    "expectedNextFrontier": "fresh representative route",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

The predecessor changed the runtime progress-contract route signal. This package
exists only to generate and route fresh representative evidence after that change.

## Execution Evidence

- [ ] action: freshness-review; owner: Agent <name> (<agent-id>); files-changed: none; validation: npm run work:context; npm run work:validate -- --entry work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md; decision: fresh; outcome: pending.

## Validation

1. falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --fast-local --verbose
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_blocked_route_rerun --explain priority_recovery_partition_progress
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-blocked-route-rerun.report.json
