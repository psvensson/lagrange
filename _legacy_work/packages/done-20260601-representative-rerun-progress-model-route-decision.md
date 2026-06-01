# Representative Rerun Progress Model Route Decision

<!-- work-package
{
  "schema": "work-package-v2",
  "intent": {
    "lane": "diagnostic-classification",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "playback": "none",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "representative_rerun_model_route_decision",
    "currentState": "Owner-dossier-visible representative rerun progress model coverage exists; the stale representative artifact still routes to priority_recovery_partition_progress and must be reclassified before rerun or runtime promotion.",
    "nextAction": "Use owner-dossier-visible representative rerun progress model coverage to choose the next legal route; do not rerun representative evidence from blocked_model_route unless the model-backed route permits it.",
    "closed": "2026-06-01"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260601-representative-rerun-progress-model-route-decision.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner-ports.js",
      "src/scenarios/rolling-restart.js"
    ],
    "commitScope": [
      "work/packages/active-20260601-representative-rerun-progress-model-route-decision.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package keeps the active theory-loop sprint moving after model coverage binding by selecting the next legal representative-rerun route before any runtime or evidence action."
  },
  "modelFit": {
    "packageClass": "diagnostic-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostic-owner-evidence/current-artifact",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-representative-rerun-progress-model-coverage-binding",
      "theory-20260601-rolling-restart-priority-recovery-backpressure-drain-escalation"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_route_decision --explain priority_recovery_partition_progress",
        "supporting: npm run work:frontier-history -- --owner representative_evidence_owner --boundary rolling_restart_rerun --limit 12"
      ]
    }
  },
  "theoryLoop": {
    "gateMarker": "same-mechanism-repeat",
    "jointFalsifierCommand": "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
    "result": "architecture-gap",
    "outcome": "theory-confirmed",
    "successorRequired": true,
    "architectureRoute": {
      "selectedLayer": "model",
      "ledgerRef": "theory-20260531-rolling-restart-representative-rerun-progress-model-route",
      "coupledInvariant": "representative residual count must shrink or route through a model-backed non-rerun exit before another rolling_restart_rerun evidence slice"
    }
  },
  "sliceTheory": {
    "systemTheoryRef": "architecture/contracts/rolling-restart-representative-rerun-progress.md#rolling-restart-representative-rerun-progress",
    "selectedSystemTheory": "The proven representative rerun progress model coverage must route to a legal successor before another rerun is attempted.",
    "selectedMechanism": "contract_gap",
    "sourceTestContract": "architecture/contracts/rolling-restart-representative-rerun-progress.md",
    "falsifier": "npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
    "representativeExpectedMovement": "selected route",
    "killRule": "If route selection cannot find a legal successor, open an architecture-gap experiment or record a blocked termination handoff.",
    "theoryFitScore": {
      "evidenceFit": "high - owner-dossier reports proven model coverage for the exact owner/boundary.",
      "ownerBoundaryFit": "high - representative_evidence_owner / rolling_restart_rerun owns the rerun admission decision.",
      "falsifiability": "high - falsifier command asserts model status and proven routes in owner-dossier.",
      "representativeMovement": "high - route classification must select a concrete successor route.",
      "downstreamRiskContainment": "high - runtime, downstream owners, and reruns stay frozen during classification."
    },
    "wrongSliceTriggers": [
      "route classification contradicts the proven model state",
      "the route requires architecture changes beyond the contract scope",
      "owner-dossier reports a different deciding owner/boundary"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "bounded classification after owner, boundary, evidence artifact, route probes, and non-rerun guard are named",
    "safeToExecuteWhen": [
      "runtime files stay candidate-only until route classification promotes a concrete successor",
      "the package records a route decision instead of editing runtime or running representative evidence",
      "the proof commands give a clear supported, migrated, architecture-gap, needs-rerun, or blocked signal"
    ],
    "splitTriggers": [
      "classification promotes runtime source edits",
      "proof contradicts the proven model route or owner-dossier output",
      "the route requires architecture or human decision beyond the recorded stop rules"
    ],
    "childPackageCandidates": [
      "Open runtime-owner-boundary only if the route selects a concrete runtime transition.",
      "Open architecture experiment only if the route remains architecture-gap.",
      "Rerun representative evidence only if the model-backed route permits a rerun."
    ]
  },
  "representativeResidual": {
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "representative_rerun_model_route_decision",
    "status": "classification-only",
    "frontier": "representative_evidence_owner / rolling_restart_rerun",
    "nextAction": "Use owner-dossier-visible representative rerun progress model coverage to choose the next legal route.",
    "residualCount": 1
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_route_decision --explain priority_recovery_partition_progress",
      "npm run work:frontier-history -- --owner representative_evidence_owner --boundary rolling_restart_rerun --limit 12"
    ],
    "decisionRecord": "Record the route classification in this package, sprint edge card, and theory ledger before opening a runtime, evidence-rerun, migration, or architecture successor.",
    "successorAction": "open-causal-escalation",
    "runtimePromotionRule": "Keep runtime files in candidateRuntimeFiles until the model-backed route selects a concrete owner-boundary implementation; blocked_model_route is not rerun permission."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "routeOwner": "representative_evidence_owner",
    "routeBoundary": "rolling_restart_rerun",
    "routeDominantReason": "representative_rerun_model_route_decision",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "diagnostic-classification",
    "expectedDelta": "Classify whether the proven model route permits rerun, migration, runtime source promotion, architecture continuation, or blocked handoff before any representative evidence rerun.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_route_decision",
      "npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_route_decision --explain priority_recovery_partition_progress",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair # current-blocker refresh",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "With owner-dossier-visible model coverage, the representative rerun route can select a legal successor without treating blocked_model_route as permission for another direct rerun.",
    "stopConditionCheck": "Run owner-dossier, scenario-route, frontier-history, npm run analyze:causal-model, current-blocker refresh, entry validation, and pre-implementation validation before selecting a successor.",
    "expectedCausalModelChange": "The package records whether the model-backed route permits rerun, migration, architecture continuation, or concrete runtime promotion.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Rolling-restart remains red until the selected successor produces fresh representative movement or terminal success evidence.",
    "crossBoundaryReview": "Runtime source, active-gate, startup readiness, release gate, and representative rerun execution remain frozen until the route decision selects one successor."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "representative rerun progress model route decision",
    "phaseChain": [
      "runtime progress contract emits blocked_model_route for rebalancer handoff retry progress",
      "representative-progress circuit breaker blocks another direct rerun on non-shrinking residual history",
      "owner-dossier now reports proven model coverage for representative_evidence_owner / rolling_restart_rerun",
      "the next package must classify the model-backed route before rerun or runtime promotion"
    ],
    "currentFirstFrontier": "representative_evidence_owner / rolling_restart_rerun model route decision",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff remains the stale artifact frontier",
      "startup_active_gate_owner / snapshot_coverage remains downstream until priority recovery drains",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits red"
    ],
    "recentFrontierHistory": [
      "done-20260531-representative-rerun-progress-model-coverage-binding.md / owner-dossier model coverage proven",
      "done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md / architecture-gap selected model coverage binding"
    ],
    "oscillationCheck": "This package classifies the proven model route instead of repeating another representative rerun.",
    "handoffInvariant": "A blocked_model_route artifact cannot authorize rerun_representative_evidence until model-backed route classification allows it.",
    "missingCausalEdge": "route classification after model coverage binding",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_route_decision --explain priority_recovery_partition_progress",
    "falsifyingProbe": "npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
    "boundedProgressProof": "Route classification must open a concrete retry, timer, advance, runtime, architecture, migration, or blocked-handoff successor.",
    "boundedProgressProofArtifact": "architecture/contracts/rolling-restart-representative-rerun-progress.md",
    "expectedObservableTransition": "scenario-route and owner-dossier jointly select the next legal route from proven model coverage",
    "maxProgressBound": "one route-decision package before successor selection",
    "sameFrontierFallback": "If route classification cannot select rerun, runtime, migration, or architecture continuation, record a blocked termination handoff instead of stopping silently.",
    "expectedNextFrontier": "selected model-backed representative rerun successor",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  },
  "mechanismCard": {
    "failureMechanism": "model_route_classification_gap",
    "stableFacts": "Owner-dossier now reports proven model coverage for representative_evidence_owner / rolling_restart_rerun; the stale rolling-restart artifact remains red.",
    "changedFacts": "Model coverage binding changed the legal route surface but did not rerun representative evidence.",
    "rejectedAlternatives": "Do not run another direct representative rerun or runtime patch from blocked_model_route before route classification.",
    "ownerWhoDecides": "representative_evidence_owner",
    "currentAction": "Classify the model-backed rerun route using owner-dossier, scenario-route, and frontier-history.",
    "missingTransitionOrObservation": "Selected successor after proven representative rerun progress model coverage.",
    "smallestFalsifyingProbe": "npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
    "expectedMovement": "A concrete rerun, runtime, migration, architecture, or blocked-handoff route is selected without emptying the theory-loop sprint.",
    "negativeResultMeans": "Record the route as blocked or architecture-gap and open the appropriate autonomous successor instead of closing the sprint.",
    "escalationRule": "If route evidence is contradictory or cannot select a next action, record valid Theory Loop Termination evidence or open an architecture experiment."
  },
  "closureSummary": {
    "resultClassification": "classification-only",
    "predictionAccuracy": "matched",
    "observedMovement": "Owner-dossier confirmed modelStatus=proven and two safety/liveness invariants. Scenario-route confirmed causalOutcome=accept_classified_backpressure, causalStopCondition=classified_backpressure, first critical path=topology:priority_recovery_partition_progress with 2 priority-recovery witnesses.",
    "successorReason": "The proven representative rerun progress model blocks direct rerun from a non-shrinking residual window, routing accepted backpressure to open-causal-escalation.",
    "nextOwnerBoundary": "operation_workflow_owner / rebalancer_handoff",
    "evidenceArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json"
  },
  "result": {
    "classification": "classification-only"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package resumes the rolling-restart theory loop after the workflow guard
repair. The previous runtime/model package proved representative rerun progress
model coverage, but the sprint still needs a route decision before any rerun,
runtime promotion, migration, or architecture continuation.

## Scope Basis

Canonical evidence source:
`test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`.

## Workflow Lane

- Selected lane: `diagnostic-classification`
- Why this lane is sufficient: no runtime files are in write scope; the package
  only classifies the next legal route and records the successor selection.
- Escalation trigger to a heavier lane: route evidence selects runtime source
  work, architecture continuation, migration, or representative rerun.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.

## Mechanism Card

- Failure Mechanism: model_route_classification_gap
- Stable Facts: owner-dossier-visible model coverage exists for representative_evidence_owner / rolling_restart_rerun, and the stale rolling-restart artifact remains red.
- Changed Facts: model coverage binding changed the legal route surface but did not rerun representative evidence.
- Rejected Alternatives: do not run another direct representative rerun or runtime patch from blocked_model_route before route classification.
- Owner who decides: representative_evidence_owner
- Current Action: classify the model-backed rerun route using owner-dossier, scenario-route, and frontier-history.
- Missing Transition Or Observation: selected successor after proven representative rerun progress model coverage.
- Smallest falsifying probe: npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json
- Expected movement: a concrete rerun, runtime, migration, architecture, or blocked-handoff route is selected without emptying the theory-loop sprint.
- Negative result means: record the route as blocked or architecture-gap and open the appropriate autonomous successor instead of closing the sprint.
- Escalation rule: if route evidence is contradictory or cannot select a next action, record valid Theory Loop Termination evidence or open an architecture experiment.

## Classification-Only Fast Path

- Runtime, test, script, and report paths stay out of `writeScope` and
  `commitScope` until fresh route evidence promotes implementation.
- Keep possible implementation files in `candidateRuntimeFiles` only.
- Verifier-fixer proof is optional while the package remains classification-only
  and no implementation or tracker-truth write scope is present.
- Use the three canonical proof commands, then select the successor instead of
  adding local runtime work.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`
- Route owner: `representative_evidence_owner`
- Route boundary: `rolling_restart_rerun`
- Route dominant reason: `representative_rerun_model_route_decision`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `diagnostic-classification`
- Required after rerun: owner-dossier, scenario-route, frontier-history, Sprint
  Strategy Brief and Current Edge Card update, current-blocker refresh, entry
  validation, and pre-implementation validation.

## In Scope

1. work/packages/active-20260601-representative-rerun-progress-model-route-decision.md
2. work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md
3. work/theory-ledger.md

## Out Of Scope

1. Runtime source edits.
2. Representative scenario rerun.

## Model Fit

- Package class: `diagnostic-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostic-owner-evidence/current-artifact`
- Output profile: `medium`
- Owned files: `work/packages/active-20260601-representative-rerun-progress-model-route-decision.md`, `work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md`, `work/theory-ledger.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: runtime and representative evidence stay frozen until this route decision selects one successor.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_route_decision --explain priority_recovery_partition_progress`, `npm run work:frontier-history -- --owner representative_evidence_owner --boundary rolling_restart_rerun --limit 12`
- Model ledger advisory: `escalate`

## Execution Evidence

Preferred closure evidence for new packages. One executor owns classification
end to end; verifier-fixer is optional while this remains classification-only.

- [x] action: implementation; owner: representative_evidence_owner; files-changed: work/packages/active-20260601-representative-rerun-progress-model-route-decision.md, work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md; validation: npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json and parent revalidated focused proof: yes before closure; outcome: passed.
- [x] action: verification-fix; owner: representative_evidence_owner; files-changed: work/packages/active-20260601-representative-rerun-progress-model-route-decision.md, work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md; validation: verifier ran active entry/pre-impl validation, owner-dossier assertion, scenario-route/frontier-history, and parent revalidated focused proof: yes; outcome: passed.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json; validation: `npm run work:repair`; outcome: passed.

## Validation

1. npm run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json
2. npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_route_decision --explain priority_recovery_partition_progress
3. npm run work:frontier-history -- --owner representative_evidence_owner --boundary rolling_restart_rerun --limit 12

## Commit And Push Ledger

1. Push target: origin/codex/pending-ack-eligibility-filter
2. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
3. Pushed: yes 2026-06-01T05:45:15.611Z