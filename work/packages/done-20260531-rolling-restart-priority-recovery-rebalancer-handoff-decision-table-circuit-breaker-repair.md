# Rolling Restart Priority Recovery Rebalancer Handoff Decision Table Circuit Breaker Repair

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "The decision table and contract now distinguish accepted classified backpressure under blocked_model_route from rerun-eligible backpressure; the scenario artifact remains accepted backpressure with two priority-recovery witnesses.",
    "nextAction": "Run verifier-fixer proof, repair tracker snapshots, validate closure, then close and push the repaired model/contract route.",
    "predecessor": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md",
      "architecture/contracts/rolling-restart-rebalancer-handoff.md",
      "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner-ports.js"
    ],
    "commitScope": [
      "work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md",
      "work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md",
      "architecture/contracts/rolling-restart-rebalancer-handoff.md",
      "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The route table is the remaining contradiction between accepted backpressure and the model-blocked rerun path; repairing it is lower risk than reopening runtime source or forcing another representative run.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "model-contract-route-repair/rebalancer-handoff",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "decision table cannot represent blocked representative rerun",
      "contract repair requires runtime source promotion",
      "proof selects evidence regeneration instead of model repair"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run model:decision-tables",
        "regression: npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "supporting: npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json",
        "supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json"
      ]
    }
  },
  "theoryLoop": {
    "gateMarker": "same-mechanism-repeat",
    "result": "architecture-gap",
    "outcome": "theory-confirmed",
    "successorRequired": true,
    "jointFalsifierCommand": "npm run model:decision-tables && npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md",
    "architectureRoute": {
      "selectedLayer": "model",
      "ledgerRef": "theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair",
      "coupledInvariant": "blocked representative rerun cannot be emitted as rerun_representative_evidence",
      "gapAnalysisRef": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md"
    }
  },
  "representativeResidual": {
    "status": "architecture-gap",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "frontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Close the repaired model/contract route before any runtime source or representative rerun promotion.",
    "residualCount": 1,
    "witnessCount": 2
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap / model_contract_route_gap",
    "stableFacts": "Scenario-route remains accept_classified_backpressure with two priority-recovery witnesses at operation_workflow_owner / rebalancer_handoff.",
    "changedFacts": "The rebalancer handoff decision table now separates rerun-eligible accepted backpressure from blocked_model_route accepted backpressure.",
    "rejectedAlternatives": "Do not run another representative rerun and do not edit runtime source from the unchanged artifact.",
    "ownerWhoDecides": "operation_workflow_owner",
    "currentAction": "Repair decision-table and contract routing for the blocked rerun state.",
    "missingTransitionOrObservation": "The model table needs a route for accepted backpressure plus blocked representative rerun.",
    "smallestFalsifyingProbe": "falsifier: npm run model:decision-tables",
    "expectedMovement": "Model/contract proof names open_successor_or_architecture_experiment for blocked_model_route and keeps runtime source candidate-only.",
    "negativeResultMeans": "Close as architecture-gap continuation and keep promotion blocked.",
    "escalationRule": "Contradictory model evidence opens architecture-gap continuation instead of runtime source work."
  },
  "observablePrediction": {
    "metric": "accepted-backpressure blocked-rerun model route",
    "predicted": "Decision-table and contract checks pass after representing blocked_model_route without authorizing runtime source or direct representative rerun.",
    "observed": "Decision-table and contract checks pass after representing blocked_model_route without authorizing runtime source or direct representative rerun.",
    "accuracy": "matched",
    "evidence": "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json"
  },
  "boundedExperiment": {
    "hypothesis": "The route gap is in the model/contract surface, not runtime source.",
    "hypothesisDiscriminator": "Decision-table and contract checks must represent accepted backpressure under blocked representative rerun as one legal non-repeated route.",
    "expectedMetric": "One canonical model route for accepted classified backpressure plus blocked_model_route.",
    "inheritsFrom": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md",
    "timebox": "24h",
    "mergeRequirement": "model:decision-tables, contract check, scenario-route, owner-dossier, causal-model, repair, and closure validation",
    "killRule": "Do not edit runtime source or rerun representative evidence unless the repaired model route explicitly selects it."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "causal-escalation",
    "expectedDelta": "Decision-table and contract route represent accepted classified backpressure under blocked representative rerun without runtime source or direct rerun promotion.",
    "requiredRefreshCommands": [
      "npm run model:decision-tables",
      "npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
      "npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief from the repaired model route",
      "update Current Edge Card from the repaired model route",
      "refresh current-blocker with npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Accepted classified backpressure plus blocked representative rerun needs a model/contract route before runtime or evidence promotion.",
    "stopConditionCheck": "Run `npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` plus decision-table, contract, owner-dossier, and scenario-route proof before selecting a successor.",
    "expectedCausalModelChange": "No runtime causal-model movement is expected; this package repairs route representation.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Rolling-restart remains red with two priority-recovery witnesses until the repaired route selects a legal successor.",
    "crossBoundaryReview": "Runtime source, active-gate, release-gate, startup-readiness, and representative rerun work remain frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery rebalancer handoff decision-table circuit-breaker repair",
    "phaseChain": [
      "owner wake proof passed",
      "representative-progress model blocked another rerun",
      "post-model rederive selected architecture-gap",
      "post-model architecture-gap proof selected model/contract route repair"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains downstream",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream",
      "representative_evidence_owner / rolling_restart_rerun remains blocked until the route table no longer emits a forbidden rerun"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-system-theory-rederive.md / operation_workflow_owner / rebalancer_handoff / same-mechanism-repeat contract_gap",
      "done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md / operation_workflow_owner / rebalancer_handoff / model-contract repair selected"
    ],
    "oscillationCheck": "This package repairs the model route selected by architecture-gap proof; it must not become runtime source or representative rerun work unless the route table explicitly selects that successor.",
    "handoffInvariant": "Accepted backpressure cannot authorize another representative rerun when the representative-progress model has already blocked that rerun.",
    "missingCausalEdge": "decision-table route for accepted backpressure plus blocked representative rerun",
    "missingCausalEdgeProbe": "npm run model:decision-tables",
    "falsifyingProbe": "npm run model:decision-tables",
    "boundedProgressProof": "Decision-table and contract checks must show exactly one model route for accepted classified backpressure under blocked representative rerun, selecting bounded progress continuation, model repair, or architecture-gap continuation instead of a forbidden rerun.",
    "boundedProgressProofArtifact": "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json",
    "expectedObservableTransition": "model route changes from forbidden representative rerun emission to a legal successor or architecture-gap continuation",
    "maxProgressBound": "one model/contract repair before runtime or representative rerun promotion",
    "sameFrontierFallback": "If the model cannot express the route, open an architecture-gap continuation successor and keep promotion blocked.",
    "expectedNextFrontier": "model/contract route selected for blocked representative rerun",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "architecture-gap",
    "triggerEvidence": [
      "scenario-route reports accept_classified_backpressure with two priority-recovery witnesses",
      "representative-progress model blocks another rerun from the non-shrinking residual window",
      "pre-repair rebalancer handoff decision table routed accept_classified_backpressure to rerun_representative_evidence"
    ],
    "selectedChoice": "blocked-rerun-route-repair",
    "nextAction": "Close the repaired blocked-rerun route after verifier-fixer and closure validation.",
    "choices": [
      {
        "id": "blocked-rerun-route-repair",
        "summary": "Add an explicit blocked representative-rerun route so accepted backpressure cannot emit a forbidden rerun action.",
        "route": "continue-local-proof",
        "proof": [
          "npm run model:decision-tables",
          "npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md"
        ]
      },
      {
        "id": "architecture-gap-continuation",
        "summary": "Record architecture-gap continuation if the model cannot express blocked rerun without runtime or representative promotion.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress"
        ]
      }
    ]
  },
  "systemTheory": {
    "problemStatement": "The current route model cannot distinguish accepted backpressure that may rerun from accepted backpressure blocked by the representative-progress circuit breaker.",
    "phaseChain": [
      "owner wake proof passed",
      "representative-progress model blocked another rerun",
      "post-model rederive selected architecture-gap",
      "architecture-gap proof selected model/contract repair"
    ],
    "ownerBoundaryMap": [
      "operation_workflow_owner / rebalancer_handoff: owns the route table",
      "representative_evidence_owner / rolling_restart_rerun: owns blocked_model_route evidence",
      "startup_active_gate_owner / snapshot_coverage: downstream symptom"
    ],
    "stableFacts": [
      "Artifact remains accepted classified backpressure with two witnesses.",
      "Runtime source is candidate-only.",
      "The table repair does not rerun representative evidence."
    ],
    "changedFacts": [
      "Decision-table routing now accounts for blocked representative rerun."
    ],
    "competingTheories": [
      "H1 route table can represent blocked rerun with an added input state.",
      "H2 the contract cannot represent the route and must close architecture-gap continuation."
    ],
    "eliminatedTheories": [
      "Direct representative rerun is eliminated by the model route.",
      "Runtime source promotion is eliminated until model routing selects it."
    ],
    "downstreamSymptoms": [
      "startup_active_gate_owner / snapshot_coverage",
      "release_gate_owner / rolling_restart_fully_green_gate"
    ],
    "transitionTable": [
      {
        "inputSignal": "accept_classified_backpressure plus blocked representative rerun",
        "owner": "operation_workflow_owner / rebalancer_handoff",
        "missingTransition": "decision-table route for blocked rerun",
        "expectedEvidence": "model:decision-tables and contract check pass with one canonical route",
        "falsifier": "falsifier: npm run model:decision-tables",
        "migrationTrigger": "proof shows the route belongs to representative_evidence_owner instead of rebalancer_handoff"
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only if proof shows representative_evidence_owner owns the route decision."
    ],
    "architectureGapTriggers": [
      "Close as architecture-gap continuation if the decision table cannot express blocked rerun without runtime or evidence promotion."
    ],
    "wholeSystemInvariant": "Accepted backpressure cannot authorize another representative rerun when the representative-progress model has already blocked that rerun."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md systemTheory",
    "selectedSystemTheory": "Repair the route model for accepted classified backpressure under blocked representative rerun.",
    "selectedMechanism": "contract_gap / model_contract_route_gap",
    "sourceTestContract": "Only architecture contract and decision-table files are writable; runtime source remains candidate-only.",
    "falsifier": "falsifier: npm run model:decision-tables",
    "representativeExpectedMovement": "model route selection only; no representative rerun in this package",
    "killRule": "If proof needs runtime source or a representative rerun, stop and open the selected successor instead of widening.",
    "theoryFitScore": {
      "evidenceFit": "high - proof selected a route-table contradiction.",
      "ownerBoundaryFit": "high - operation_workflow_owner / rebalancer_handoff owns the decision table.",
      "falsifiability": "high - decision-table and contract checks reject malformed routes.",
      "representativeMovement": "low - no runtime rerun is in scope.",
      "downstreamRiskContainment": "high - runtime and downstream owners stay frozen."
    },
    "wrongSliceTriggers": [
      "proof needs runtime source edits",
      "proof selects representative_evidence_owner migration",
      "decision-table route cannot be represented"
    ]
  },
  "closureSummary": {
    "resultClassification": "architecture-gap",
    "predictionAccuracy": "matched",
    "observedMovement": "The model/contract route now blocks a repeated representative rerun by routing accepted backpressure plus blocked_model_route to open_successor_or_architecture_experiment; no runtime or representative evidence movement was expected.",
    "successorReason": "The repaired route selects non-repeated architecture/causal continuation instead of rerun_representative_evidence for blocked_model_route.",
    "nextOwnerBoundary": "operation_workflow_owner / rebalancer_handoff",
    "evidenceArtifact": "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

The post-model architecture-gap proof selected a route-table contradiction:
accepted classified backpressure still points at representative rerun while the
representative-progress model blocks that rerun.

## Scope

- In: rebalancer handoff contract and decision-table route repair.
- Out: runtime source edits, representative scenario execution, downstream
  active-gate or release-gate patches.

## Core Logic Brief

- Canonical outcome: one model/contract route for accepted backpressure plus
  blocked representative rerun.
- Inputs/signals: scenario-route, owner-dossier, causal-model, contract check,
  and decision-table validation.
- State model or invariant: a blocked representative rerun cannot be emitted as
  the next action from accepted backpressure.
- Non-goals and forbidden interpretations: do not use model repair to authorize
  runtime source or representative rerun promotion in this package.
- Proof mapping: decision-table and contract checks prove route representation.
- Wrong-slice trigger: stop if the repair needs runtime source behavior.

## Decision Experiment Gate

- Decision question: Can the rebalancer handoff model route accepted
  backpressure plus blocked representative rerun without runtime or evidence
  promotion?
- Architecture review: owner operation_workflow_owner / boundary rebalancer_handoff owns the route table in `docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json` and the contract route in `architecture/contracts/rolling-restart-rebalancer-handoff.md`; representative_evidence_owner owns the blocked rerun fact.
- Competing hypotheses: H1 the table can add a blocked-rerun discriminator; H2
  the route is an architecture-gap continuation.
- Pre-edit focused probe: `npm run model:decision-tables`.
- Success metrics: decision-table canonical route count remains exactly one for
  each input combination, priority-recovery witness count remains recorded as 2
  until a later successor rerun, and runtime source stays candidate-only.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait`; direct rerun is invalid in this package because blocked_model_route is the condition under repair.
- Redirect rule: if the table cannot represent the route, open an architecture-gap continuation successor and keep runtime source and representative rerun blocked.

## Mechanism Card

- Failure mechanism: model_contract_route_gap.
- Stable facts: accepted classified backpressure with two priority-recovery
  witnesses remains the artifact route.
- Changed facts: representative-progress model blocks the rerun action currently
  emitted by the route table.
- Rejected alternatives: runtime source patch or representative rerun.
- Owner who decides: `operation_workflow_owner`.
- Smallest falsifying probe: `npm run model:decision-tables`.

## Execution Evidence

- [x] action: implementation; owner: operation_workflow_owner; files-changed: work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md, architecture/contracts/rolling-restart-rebalancer-handoff.md, docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json, work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md, work/theory-ledger.md; validation: `npm run model:decision-tables` passed; `npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md` passed; `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress` passed with accept_classified_backpressure and two witnesses; `npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json` passed; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` passed with outcome accept_classified_backpressure, failedInvariantCount=0, and exhaustedBudgetCount=0; `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait` passed with Write=false; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: operation_workflow_owner; files-changed: work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md; validation: `npm run model:decision-tables` passed; `npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md` passed; `npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md` passed; `npm run work:validate -- --pre-impl work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md` passed; `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress` passed; `npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json` passed; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` passed; `npm run work:theory-ledger -- validate` passed; parent revalidated focused proof: yes; outcome: validated, no in-scope repair required beyond verifier-fixer evidence append.

## Validation

1. falsifier: npm run model:decision-tables
2. regression: npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md
3. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress
4. supporting: npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json
5. supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json

## Commit And Push Ledger

1. Focused package commit: ef1aca6b43403621625f20b9961c09ea10811531
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: no
