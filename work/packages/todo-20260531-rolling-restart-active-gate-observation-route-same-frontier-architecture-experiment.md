# Rolling Restart Active Gate Observation Route Same Frontier Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-31",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "currentState": "Fresh representative evidence after the observation-route implementation stayed on active_gate_snapshot_coverage with owner_reconcile_pending, while runtimePromotionGuard blocked another repeated local runtime promotion.",
    "nextAction": "Select the next non-repeated active-gate route before any runtime source write."
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md",
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
      "work/packages/todo-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md",
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
      "theory-20260531-rolling-restart-active-gate-observation-route-same-frontier-rerun"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage"
      ]
    }
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
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json"
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
    "routeCausalOutcome": "runtime_promotion_blocked",
    "stopMode": "saturated_history_requires_non_repeated_source_contract",
    "nextLane": "experiment",
    "expectedDelta": "Select a non-repeated source contract, owner-boundary migration, representative-green path, or architecture-gap stop.",
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
    "expectedCausalModelChange": "The package changes no runtime behavior; it selects the next architecture/runtime route from the fresh evidence.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh evidence still reports active_gate_snapshot_coverage with owner_reconcile_pending, snapshot coverage 1/5, selected_snapshot_source_timeout, snapshot_repair_deferred, and runtimePromotionGuard blocked.",
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
    "expectedNextFrontier": "non-repeated route selection or architecture-gap stop",
    "resultClassification": "pending-before-probe",
    "stopCondition": "architecture-gap-stop"
  },
  "architectureDecisionGate": {
    "status": "presented",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Fresh representative rerun stayed same-frontier after the observation-route source implementation.",
      "runtimePromotionGuard.state is blocked with saturated_history_requires_non_repeated_source_contract.",
      "Topology exposes wait_owner_recovery with pendingRecovery=1 and pendingReconcile=0 but snapshot coverage remains 1/5."
    ],
    "selectedChoice": "pending-before-probe",
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
    "nextAction": "Run the discriminator proof and select exactly one route before runtime promotion."
  }
}
-->

## Why

This package owns the architecture discriminator after fresh representative evidence stayed at `active_gate_snapshot_coverage` despite the observation-route source change. Runtime promotion is blocked until a non-repeated route is selected.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success is selecting the next route, not editing runtime behavior.
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

## In Scope

1. work/packages/todo-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md
2. work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md
3. work/theory-ledger.md
4. work/sprints/current-blocker.json
5. work/sprints/current-blocker.md

## Out Of Scope

1. Runtime source edits.
2. Downstream startup readiness, release-gate, priority-recovery, or benchmark patches.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `same-frontier-architecture-discriminator`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md`, `work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md`, `work/theory-ledger.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Do-not-edit scope: `src/`
- Frozen decisions: runtime source stays frozen until route selection.
- Focused proof: `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`; `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage`

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.

- [ ] action: implementation; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: falsifier, regression, and supporting proof pending; parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: verification-fix; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: verifier reruns focused proof and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: pending.

## Validation

1. falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --explain active_gate_snapshot_coverage
