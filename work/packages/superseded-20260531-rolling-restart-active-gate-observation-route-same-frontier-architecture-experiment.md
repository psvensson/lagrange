# Rolling Restart Active Gate Observation Route Same Frontier Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "superseded",
  "intent": {
    "opened": "2026-05-31",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "currentState": "Canonical discriminator proof kept active_gate_snapshot_coverage on startup_active_gate_owner / snapshot_coverage with owner_reconcile_pending; runtimePromotionGuard remains blocked and source review found no non-repeated post-wait owner route.",
    "nextAction": "Close as architecture-gap stop, keep runtime source promotion blocked, and redirect only through fresh representative movement, owner-boundary migration, rotated architecture route, or representative-green proof.",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md",
      "work/packages/superseded-20260531-rolling-restart-active-gate-owner-recovery-retry-schedule.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract-decision.js",
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "src/control-plane/membership-publication-active-gate-reconcile.js"
    ],
    "commitScope": [
      "work/packages/active-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md",
      "work/packages/superseded-20260531-rolling-restart-active-gate-owner-recovery-retry-schedule.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The fresh rerun shows the previous source route is visible but insufficient; route-after-rerun and frontier-history block repeated runtime promotion until a non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop is selected."
  },
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "same-frontier-architecture-discriminator",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "runtime source write is needed before route selection",
      "fresh evidence contradicts the same-frontier route"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-active-gate-observation-route-same-frontier-rerun",
      "theory-20260531-rolling-restart-active-gate-observation-route-architecture-gap"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage"
      ]
    }
  },
  "theoryLoop": {
    "gateMarker": "pair-alternation-post-rederive",
    "result": "architecture-gap",
    "outcome": "theory-confirmed",
    "jointFalsifierCommand": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage"
  },
  "representativeResidual": {
    "status": "architecture-gap",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "frontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending",
    "residualCount": 1,
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Runtime promotion remains blocked; redirect only through fresh representative movement, owner-boundary migration, rotated architecture route, or representative-green proof."
  },
  "mechanismCard": {
    "failureMechanism": "same-frontier runtime-promotion saturation",
    "stableFacts": "The fresh rerun routes to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending; priority-recovery residual witnesses are zero.",
    "changedFacts": "The observation-route source change is visible in topology as wait_owner_recovery with one pending recovery node and zero pending reconcile nodes, but representative evidence still reports snapshot coverage 1/5 with selected_snapshot_source_timeout plus snapshot_repair_deferred.",
    "rejectedAlternatives": "Do not open another local active-gate runtime patch from the same repeated route without a non-repeated source contract or migration proof.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Run the canonical route discriminator and select the next non-repeated route.",
    "missingTransitionOrObservation": "A concrete owner-owned transition out of selected_snapshot_source_timeout plus snapshot_repair_deferred after wait_owner_recovery.",
    "smallestFalsifyingProbe": "falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
    "expectedMovement": "Select exactly one successor: non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop.",
    "negativeResultMeans": "Close as architecture-gap and do not open another local active-gate runtime patch from this evidence.",
    "escalationRule": "If canonical tools cannot name a non-repeated route, stop runtime promotion and record the architecture gap."
  },
  "boundedExperiment": {
    "hypothesis": "Fresh representative evidence shows the observation-route source change is visible but insufficient because active-gate snapshot coverage still lacks a non-repeated owner-owned transition out of selected_snapshot_source_timeout plus snapshot_repair_deferred.",
    "hypothesisDiscriminator": "Compare the fresh active-gate handoff evidence, frontier history, topology explain output, and current source contracts to decide whether the next route is a new observation, protocol, model, topology source contract, owner-boundary migration, representative-green path, or architecture-gap stop.",
    "expectedMetric": "One canonical route is selected: non-repeated source contract, owner-boundary migration, representative-green, or architecture-gap stop; no runtime source write occurs before that selection.",
    "inheritsFrom": "work/packages/done-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md",
    "timebox": "24h",
    "mergeRequirement": "Route evidence and frontier history select one successor before runtime promotion.",
    "killRule": "If the experiment cannot name a non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop, close as architecture-gap and do not open another local active-gate runtime patch."
  },
  "validationTier": "single-owner",
  "observablePrediction": {
    "metric": "selected successor route after same-frontier active-gate rerun",
    "predicted": "Canonical tools select a non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop before runtime promotion.",
    "observed": "Architecture-gap stop selected: canonical tools kept active_gate_snapshot_coverage on startup_active_gate_owner / snapshot_coverage with runtimePromotionGuard blocked, and source review found no concrete non-repeated post-wait active-gate successor.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "metricDelta": 0
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "runtime-promotion-blocked",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage"
    ],
    "decisionRecord": "Record the selected successor in this architecture experiment before opening any runtime package.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "Runtime promotion is blocked by same-frontier/no-reduction evidence until this experiment selects a non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "owner_reconcile_pending",
    "routeCausalOutcome": "architecture-gap",
    "stopMode": "architecture-gap",
    "nextLane": "causal-escalation",
    "expectedDelta": "Architecture-gap stop selected; no non-repeated post-wait source contract, owner-boundary migration, or representative-green path was named.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending",
      "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker with npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The same-frontier representative result is no longer eligible for another repeated active-gate runtime patch until the architecture experiment names a non-repeated route or stop.",
    "stopConditionCheck": "Run frontier-history, scenario-route, topology-convergence, and npm run analyze:causal-model before selecting a follow-on package.",
    "expectedCausalModelChange": "The package changes no runtime behavior; it records architecture-gap stop for the fresh same-frontier evidence.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Fresh evidence still reports active_gate_snapshot_coverage with owner_reconcile_pending, snapshot coverage 1/5, selected_snapshot_source_timeout, snapshot_repair_deferred, runtimePromotionGuard blocked, and no post-wait source contract in the inspected source.",
    "crossBoundaryReview": "Keep runtime source, startup readiness, priority recovery, release gate, and benchmark visibility work frozen while the experiment selects the next route."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate same-frontier architecture discriminator",
    "phaseChain": [
      "observation-route source implementation selected wait_owner_recovery in focused proof",
      "fresh representative rolling-restart evidence stayed at active_gate_snapshot_coverage",
      "topology shows wait_owner_recovery with one pending recovery node and zero pending reconcile nodes",
      "runtimePromotionGuard is blocked by saturated history and requires a non-repeated source contract"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream until active-gate coverage improves or migrates",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits red",
      "benchmark_events table partition visibility is downstream until active-gate residuals are resolved"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-active-gate-observation-route.md / startup_active_gate_owner / snapshot_coverage / focused route visible",
      "done-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "The experiment is required because the fresh rerun remained same-frontier after a source-route implementation and runtimePromotionGuard blocks repeated local runtime promotion.",
    "handoffInvariant": "No runtime files are writable until the experiment selects one successor route.",
    "missingCausalEdge": "A non-repeated owner-owned transition or architecture stop for selected_snapshot_source_timeout plus snapshot_repair_deferred.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage",
    "falsifyingProbe": "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
    "boundedProgressProof": "The experiment must select one retry, reconcile, timeout, or bounded successor route, or close as architecture-gap without runtime source edits.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "expectedObservableTransition": "selected non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop",
    "maxProgressBound": "one architecture experiment before runtime promotion",
    "sameFrontierFallback": "If no non-repeated route is named, close as architecture-gap and do not open another local active-gate runtime patch.",
    "expectedNextFrontier": "architecture-gap stop unless fresh evidence moves, owner boundary migrates, a rotated architecture route is selected, or representative evidence goes green",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Fresh representative rerun stayed same-frontier after the observation-route source implementation.",
      "runtimePromotionGuard.state is blocked with saturated_history_requires_non_repeated_source_contract.",
      "Topology exposes wait_owner_recovery with pendingRecovery=1 and pendingReconcile=0 but snapshot coverage remains 1/5.",
      "Source-context review found the current source already consumes selected_snapshot_source_timeout plus repair_deferred into wait_owner_recovery and does not define a non-repeated post-wait successor."
    ],
    "selectedChoice": "architecture-gap-stop",
    "choices": [
      {
        "id": "non-repeated-source-contract",
        "summary": "Select a new observation, protocol, model, or topology source contract for selected_snapshot_source_timeout plus snapshot_repair_deferred.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate only if canonical evidence names a different deciding owner and boundary.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Record architecture-gap if no non-repeated route can be named.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json"
        ]
      }
    ],
    "nextAction": "Close as architecture-gap stop; do not open another local active-gate runtime patch from this evidence unless fresh proof names a rotated architecture route, owner-boundary migration, representative movement, or representative-green."
  },
  "architectureGapDecision": {
    "selectedRoute": "architecture-gap-stop",
    "decisionDate": "2026-05-31",
    "reason": "Frontier-history reports loopHealth=exhausted with same-mechanism-repeat and pair-alternation-post-rederive; scenario-route reports runtimePromotionGuard.state=blocked with saturated_history_requires_non_repeated_source_contract; topology-convergence exposes wait_owner_recovery with one pending recovery node, zero pending reconcile nodes, selected_snapshot_source_timeout, and snapshot_repair_deferred; source-context review found no concrete non-repeated post-wait owner-owned successor.",
    "causalModelInterpretation": "Causal-model keeps topology:active_gate_snapshot_coverage as the first critical path while startup readiness and release-gate symptoms remain downstream.",
    "runtimePromotion": "blocked",
    "successorRule": "Do not open runtime source work from this artifact; continue only through fresh representative movement, owner-boundary migration, a rotated architecture route, or representative-green proof."
  },
  "closureSummary": {
    "resultClassification": "architecture-gap",
    "predictionAccuracy": "partial",
    "observedMovement": "Canonical proof found no non-repeated source contract, owner-boundary migration, representative-green path, or implementable post-wait active-gate successor; active_gate_snapshot_coverage remains first with owner_reconcile_pending, selected_snapshot_source_timeout, snapshot_repair_deferred, one pending recovery node, zero pending reconcile nodes, and runtimePromotionGuard blocked.",
    "successorReason": "Runtime source promotion remains blocked from this artifact; architecture-gap is non-terminal for the sprint and future progress requires fresh representative movement, owner-boundary migration, a rotated architecture route, or representative-green proof.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage architecture-gap stop",
    "evidenceArtifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart remains blocked at active_gate_snapshot_coverage after the observation-route implementation because startup_active_gate_owner / snapshot_coverage still lacks a non-repeated owner-owned route for selected_snapshot_source_timeout plus snapshot_repair_deferred.",
    "phaseChain": [
      "Observation-route source implementation selected wait_owner_recovery in focused proof.",
      "Fresh representative evidence in test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json stayed at active_gate_snapshot_coverage.",
      "The same-frontier result blocks another local runtime promotion until this experiment selects a non-repeated route or architecture-gap stop."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage: current first frontier and discriminator owner.",
      "startup_readiness_owner / startup_support_evidence: downstream until active-gate coverage improves or migrates.",
      "release_gate_owner / rolling_restart_fully_green_gate: downstream final proof target after representative evidence exits red."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Declared owner boundary remains startup_active_gate_owner / snapshot_coverage.",
      "Runtime source files are out of scope until the route discriminator selects a successor.",
      "Durable contract record is architecture/contracts/active-gate-convergence.md#active-gate-convergence."
    ],
    "changedFacts": [
      "Fresh representative evidence stayed same-frontier after the observation-route source implementation.",
      "Topology explain output exposes wait_owner_recovery with one pending recovery node and zero pending reconcile nodes.",
      "runtimePromotionGuard is blocked by saturated_history_requires_non_repeated_source_contract.",
      "Source-context review found no concrete non-repeated post-wait active-gate successor in the inspected contract/source files."
    ],
    "competingTheories": [
      "H1 a non-repeated active-gate source contract exists for selected_snapshot_source_timeout plus snapshot_repair_deferred.",
      "H2 canonical route evidence migrates ownership to a different owner and boundary.",
      "H3 no current non-repeated owner-owned route exists, so the correct outcome is architecture-gap stop."
    ],
    "eliminatedTheories": [
      "Opening another repeated local active-gate runtime patch is eliminated by saturated same-frontier history.",
      "Stopping at classification-only is eliminated by the theory-loop non-halting redirect rule."
    ],
    "downstreamSymptoms": [
      "startup readiness support evidence remains downstream",
      "release gate remains downstream",
      "benchmark_events table partition visibility remains downstream"
    ],
    "transitionTable": [
      {
        "inputSignal": "selected_snapshot_source_timeout plus snapshot_repair_deferred after wait_owner_recovery",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "non-repeated owner-owned route, owner-boundary migration, representative-green path, or architecture-gap stop.",
        "expectedEvidence": "frontier-history, scenario-route, topology-convergence, and causal-model analysis select exactly one successor.",
        "falsifier": "falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "migrationTrigger": "scenario-route names a different deciding owner and boundary."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when canonical route evidence names a different deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Record architecture-gap when canonical discriminator tools cannot name a non-repeated source contract, owner-boundary migration, or representative-green path."
    ],
    "wholeSystemInvariant": "Runtime promotion remains frozen until the discriminator selects one non-repeated successor route or records an architecture-gap stop."
  },
  "sliceTheory": {
    "systemTheoryRef": "architecture/contracts/active-gate-convergence.md#active-gate-convergence",
    "selectedSystemTheory": "H3 is selected: fresh same-frontier evidence does not admit a non-repeated active-gate route, migration, or representative-green path from the inspected source, so the package records architecture-gap stop.",
    "selectedMechanism": "contract_gap",
    "sourceTestContract": "No runtime source edit; this package runs canonical discriminator commands and records the selected successor route.",
    "falsifier": "falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
    "representativeExpectedMovement": "architecture-gap stop with runtime source promotion blocked from this artifact",
    "killRule": "On architecture-gap evidence, redirect only through fresh representative movement, owner-boundary migration, a rotated architecture route, or representative-green proof; do not open another local active-gate runtime patch from this evidence.",
    "theoryFitScore": {
      "evidenceFit": "high - the discriminator uses the fresh representative artifact and canonical route tools.",
      "ownerBoundaryFit": "high - the package is scoped to startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - frontier-history and scenario-route can reject repeated runtime promotion.",
      "representativeMovement": "medium - this package selects the next route rather than changing runtime behavior.",
      "downstreamRiskContainment": "high - downstream owners and runtime source edits remain frozen."
    },
    "wrongSliceTriggers": [
      "proof requires runtime source edits before route selection",
      "fresh route evidence names a different owner boundary",
      "canonical tools cannot read the representative artifact"
    ]
  },
  "systemContractRef": "architecture/contracts/active-gate-convergence.md#active-gate-convergence",
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns the architecture discriminator after fresh representative evidence stayed at `active_gate_snapshot_coverage` despite the observation-route source change. Runtime promotion is blocked until a non-repeated route is selected.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`.

## Workflow Lane

- Selected lane: `experiment`
- Package class: `experiment`
- Why this lane is sufficient: success is selecting the next route or recording architecture-gap stop, not editing runtime behavior.
- Escalation trigger to a heavier lane: runtime ownership changes, source writes are needed, or evidence contradicts the same-frontier route.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.

## Mechanism Card

- Failure mechanism: same-frontier runtime-promotion saturation.
- Stable facts: fresh evidence stayed on `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending`.
- Changed facts: topology now exposes `wait_owner_recovery`, one pending recovery node, and zero pending reconcile nodes.
- Rejected alternatives: do not open another repeated local runtime patch from this evidence.
- Owner who decides: `startup_active_gate_owner`.
- Current action: select the next non-repeated route.
- Missing transition or observation: owner-owned transition out of `selected_snapshot_source_timeout` plus `snapshot_repair_deferred`.
- Smallest falsifying probe: `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`.
- Expected movement: one selected successor route or architecture-gap stop.
- Negative result means: close as architecture-gap.
- Escalation rule: runtime source stays frozen until route selection.

## Bounded Experiment

- Hypothesis: Fresh representative evidence shows the observation-route source change is visible but insufficient because active-gate snapshot coverage still lacks a non-repeated owner-owned transition out of selected_snapshot_source_timeout plus snapshot_repair_deferred.
- Hypothesis discriminator: Compare the fresh active-gate handoff evidence, frontier history, topology explain output, and current source contracts to decide whether the next route is a new observation, protocol, model, topology source contract, owner-boundary migration, representative-green path, or architecture-gap stop.
- Expected metric: One canonical route is selected: non-repeated source contract, owner-boundary migration, representative-green, or architecture-gap stop; no runtime source write occurs before that selection.
- Inherits from: `work/packages/done-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md`
- Timebox: `24h`
- Validation tier: `single-owner`
- Merge requirement: Route evidence and frontier history select one successor before runtime promotion.
- Redirect rule: If the experiment cannot name a non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop, close as architecture-gap and do not open another local active-gate runtime patch.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: selected successor route after same-frontier active-gate rerun
- Predicted: Canonical tools select a non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop before runtime promotion.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`
- Closure compares predicted vs observed before the package can close.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `owner_reconcile_pending`
- Route causal outcome: `runtime_promotion_blocked`
- Stop mode: `saturated_history_requires_non_repeated_source_contract`
- Next lane: `experiment`
- Required after rerun: route-after-rerun, frontier-history, scenario-route, topology-convergence, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
- Separate package reason: `runtime-promotion-blocked`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record the selected successor in this architecture experiment before opening any runtime package.
- Successor action: `open-architecture-experiment`
- Runtime promotion rule: Runtime promotion is blocked by same-frontier/no-reduction evidence until this experiment selects a non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop.

## Architecture Gap Decision

- Selected route: `architecture-gap-stop`
- Decision date: `2026-05-31`
- Reason: canonical proof kept `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending` with `runtimePromotionGuard.state=blocked`; topology shows the observation route as `wait_owner_recovery` with one pending recovery node and zero pending reconcile nodes, but source review found no named non-repeated post-wait successor.
- Runtime promotion: `blocked`
- Successor rule: do not open runtime source work from this artifact; continue only through fresh representative movement, owner-boundary migration, a rotated architecture route, or representative-green proof.

## In Scope

1. work/packages/active-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md
2. work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md
3. work/theory-ledger.md
4. work/sprints/current-blocker.json
5. work/sprints/current-blocker.md

## Out Of Scope

1. Runtime source edits.
2. Downstream startup readiness, release-gate, priority-recovery, or benchmark patches.

## Model Fit

- Package class: `architecture-gap-analysis`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `same-frontier-architecture-discriminator`
- Output profile: `medium`
- Owned files: `work/packages/active-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md`, `work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md`, `work/theory-ledger.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Do-not-edit scope: `src/`
- Frozen decisions: runtime source stays frozen until route selection.
- Focused proof: `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`; `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage`

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: work/packages/active-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md, work/theory-ledger.md, work/packages/superseded-20260531-rolling-restart-active-gate-owner-recovery-retry-schedule.md; validation: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed; npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage passed; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage passed; npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md passed; npm run work:validate -- --pre-impl work/packages/active-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md failed with model-proven-route-forces-implementation, selecting the runtime successor; parent revalidated focused proof: yes; outcome: superseded.
- [x] action: verification-fix; owner: Agent Ampere (019e7e3b-8011-7260-a884-6fd61341152e); files-changed: none; validation: read-only source review of architecture/contracts/active-gate-convergence.md, src/control-plane/publication-active-gate-handoff-contract-decision.js, src/control-plane/publication-active-gate-handoff-contract-selection.js, and src/control-plane/membership-publication-active-gate-reconcile.js found the current analysis package should not promote another architecture-gap package and should hand off to the model-proven observation route implementation; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: tracker repair deferred until successor activation refreshes current blocker; outcome: superseded.

## Validation

1. falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage
