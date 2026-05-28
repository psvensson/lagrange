# Priority Recovery Split Residual Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
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
    "nextAction": "Select the architecture route for split priority-recovery residuals before runtime promotion.",
    "closed": "2026-05-28",
    "successor": "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md",
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md",
      "work/packages/done-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
      "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
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
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md",
      "work/packages/done-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md",
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
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "regression: npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md",
        "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md",
        "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
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
    "observed": "Fresh representative rerun selected rerun evidence: priority-recovery witnesses dropped to 0 and the route migrated to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "metricDelta": 0
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open autonomous architecture experiment for repeated startup active-gate snapshot coverage."
  },
  "causalGovernance": {
    "hypothesis": "Split priority-recovery residuals require architecture route selection before workflow_progress runtime promotion.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "expectedCausalModelChange": "Fresh rerun either preserves the priority-recovery split, selects a runtime child, or migrates to another owner-boundary route.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh evidence reports zero priority-recovery residual witnesses and selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
    "crossBoundaryReview": "Do not return to operation workflow runtime work until fresh proof reselects priority recovery; repeated startup active-gate snapshot coverage requires autonomous architecture selection before runtime edits."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart split priority recovery residual architecture experiment",
    "phaseChain": [
      "owner recovery queue proof moved active nodes to 5/5 and snapshotCoverage to 3/5",
      "classification identified priority_recovery_partition_progress under operation_workflow_owner / workflow_progress",
      "priority residual extractor split four recovering_in_flight witnesses across workflow_progress and rebalancer_handoff",
      "fresh representative rerun cleared priority-recovery residuals and migrated the first frontier to active_gate_snapshot_coverage"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "benchmark table bootstrap remains downstream while snapshot coverage is incomplete",
      "selected-source timeout remains downstream until the snapshot coverage contract is selected",
      "startup readiness remains downstream unless the successor proof migrates ownership"
    ],
    "missingCausalEdge": "The next package must select the startup active-gate snapshot coverage wake, retry, reconcile, drain, handoff, migration, or architecture-gap route before runtime edits.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Fresh rerun selected a migrated owner-boundary route; successor must select a concrete wake, retry, reconcile, drain, dispatch, or architecture-gap progress mechanism before runtime edits resume.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "expectedObservableTransition": "migrated to startup active-gate snapshot coverage autonomous architecture successor",
    "maxProgressBound": "one causal escalation package with no runtime edits",
    "sameFrontierFallback": "Do not open operation workflow runtime work unless fresh evidence reselects priority recovery.",
    "expectedNextFrontier": "active gate snapshot coverage architecture route selection",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-owner-recovery-queue-drain-runtime.md / startup_active_gate_owner / snapshot_coverage_owner_recovery_queue_drain / migrated",
      "done-20260528-rolling-restart-priority-recovery-operation-workflow-classification.md / operation_workflow_owner / workflow_progress / splitRequired",
      "priority-recovery-split rerun artifact / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "The architecture experiment selected rerun evidence rather than another operation workflow runtime patch.",
    "handoffInvariant": "Runtime promotion is handed to the startup active-gate autonomous architecture successor."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "workflow_progress",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Fresh representative rerun cleared priority-recovery residual witnesses and selected active_gate_snapshot_coverage as the first frontier.",
    "evidence": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh representative rerun reported priorityRecoveryResiduals.witnessCount=0",
      "scenario route migrated to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage",
      "runtime successor generation for the migrated owner-boundary is rejected by same-frontier validation, requiring autonomous architecture"
    ],
    "selectedChoice": "open-startup-active-gate-autonomous-architecture",
    "nextAction": "Close this package as migrated and activate the startup active-gate snapshot coverage autonomous architecture successor.",
    "choices": [
      {
        "id": "fresh-rerun-migration",
        "summary": "Use fresh rerun evidence because priority-recovery residuals collapsed to zero and the owner-boundary migrated.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
        ]
      },
      {
        "id": "open-startup-active-gate-autonomous-architecture",
        "summary": "Activate the autonomous architecture experiment required before another repeated startup active-gate runtime package.",
        "route": "architecture-package",
        "proof": [
          "npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md",
          "npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md"
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
      "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "npm run work:advance -- --check",
      "npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md"
    ],
    "decisionRecord": "Fresh rerun evidence selected migration away from priority recovery and validator history selected autonomous architecture before startup active-gate runtime work.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "Do not open runtime work until the autonomous architecture package selects one startup active-gate snapshot coverage contract or migration route."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "causal-escalation",
    "expectedDelta": "Open autonomous architecture experiment for repeated active_gate_snapshot_coverage before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --package work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md --successor work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md --write",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "current-blocker refresh: npm run work:repair",
      "npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md"
    ]
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H2",
    "decision": "open-architecture-experiment",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage",
    "evidence": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md",
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

The priority-recovery classifier found split residual ownership on the inherited artifact. Fresh representative rerun evidence cleared that split and migrated the first frontier back to startup active-gate snapshot coverage, where validator history requires an autonomous architecture discriminator before runtime work.

## Core Logic Brief

- Canonical outcome: selected rerun representative evidence and migrated to a startup active-gate autonomous architecture successor.
- Inputs/signals: scenario route, causal model, priority-recovery residual groups, and fresh route-after-rerun output.
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
- Missing transition or observation: startup active-gate snapshot coverage route selection.
- Smallest falsifier: `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`.
- Expected movement: migrated to autonomous architecture successor.
- Negative result means: if startup active-gate proof cannot select a contract, stop at architecture-gap instead of local patching.
- Escalation rule: startup active-gate runtime promotion stays blocked until the successor selects one route.

## Execution Evidence

- [x] action: implementation; owner: operation_workflow_owner; files-changed: work/packages/active-20260528-priority-recovery-split-residual-architecture-experiment.md, work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md; validation: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: operation_workflow_owner; files-changed: none; validation: npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md and npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: validated.

## Validation

1. `npm run work:scenario-route -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`
2. `npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json`
3. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-recovery-queue-drain-20260528T094536Z.report.json --markdown`
4. `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
5. `npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md`
6. `npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md`

## Commit And Push Ledger

1. Focused package commit: b35a7a8514566bc6b92705904d8a581b77de87d8
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
