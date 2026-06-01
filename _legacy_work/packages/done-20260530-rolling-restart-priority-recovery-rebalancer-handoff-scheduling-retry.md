# Rolling Restart Priority Recovery Rebalancer Handoff Scheduling Retry

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-30",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "nextAction": "Implement the rebalancer handoff retry scheduling wake convergence",
    "closed": "2026-05-30",
    "successor": "work/packages/active-20260530-rolling-restart-priority-recovery-rebalancer-handoff-rerun-backpressure-residual.md"
  },
  "scope": {
    "writeScope": [
      "src/rebalancer/operation-workflow-owner-ports.js",
      "work/packages/active-20260530-rolling-restart-priority-recovery-rebalancer-handoff-rerun-backpressure-residual.md",
      "work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner-ports.js"
    ],
    "commitScope": [
      "src/rebalancer/operation-workflow-owner-ports.js",
      "work/packages/active-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry.md",
      "work/packages/active-20260530-rolling-restart-priority-recovery-rebalancer-handoff-rerun-backpressure-residual.md",
      "work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry-architecture-gap",
      "theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants",
      "theory-20260527-rolling-restart-priority-recovery-workflow-progress"
    ],
    "proof": {
      "commands": [
        "falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Implement the rebalancer handoff retry scheduling wake convergence",
    "sprintGoalDelta": "Implement the rebalancer handoff retry scheduling wake convergence",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "needs-rerun",
    "outcome": "theory-falsified",
    "successorPackage": "work/packages/active-20260530-rolling-restart-priority-recovery-rebalancer-handoff-rerun-backpressure-residual.md",
    "architectureRoute": {
      "selectedLayer": "scheduling",
      "ledgerRef": "theory-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry-architecture-gap",
      "coupledInvariant": "operation_workflow_owner / rebalancer_handoff scheduler retry wake liveness is coupled with startup_active_gate_owner / snapshot_coverage active gate readiness"
    }
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "frontier": "priority_recovery_event_driven_wait / operation_workflow_owner / rebalancer_handoff",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Implement the rebalancer handoff retry scheduling wake convergence"
  },
  "mechanismCard": {
    "failureMechanism": "scheduling_retry",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json selects operation_workflow_owner / rebalancer_handoff.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "operation_workflow_owner",
    "currentAction": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "missingTransitionOrObservation": "Implement the rebalancer handoff retry scheduling wake convergence",
    "smallestFalsifyingProbe": "falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route",
    "predicted": "Implement the rebalancer handoff retry scheduling wake convergence",
    "observed": "accept_classified_backpressure / classified_backpressure after representative rerun",
    "accuracy": "missed",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress"
  },
  "closureSummary": {
    "resultClassification": "same-frontier",
    "predictionAccuracy": "missed",
    "observedMovement": "Representative rerun kept the route at accept_classified_backpressure with causal stop classified_backpressure; no movement occurred.",
    "successorReason": "Open a residual successor package for rerun-based follow-on work and avoid another local same-frontier patch under unchanged evidence.",
    "nextOwnerBoundary": "operation_workflow_owner / rebalancer_handoff",
    "evidenceArtifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json"
  },
  "causalGovernance": {
    "hypothesis": "Implementing the rebalancer handoff retry scheduling wake convergence avoids stalling rebalancer progress in priority_recovery_event_driven_wait.",
    "stopConditionCheck": "Run the focused TAP unit test cluster-active-gate-startup-readiness-admin-availability.test.js and the regression command. npm run analyze:causal-model",
    "expectedCausalModelChange": "The scheduler wakes retry attempts gracefully instead of event-driven wait stalling.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh representative evidence is needed after implementation.",
    "crossBoundaryReview": "Do not patch other control plane or rebalancer logic outside src/rebalancer/operation-workflow-owner-ports.js."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery rebalancer handoff retry scheduling wake convergence",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json.",
      "priority_recovery_event_driven_wait is the current selected symptom.",
      "operation_workflow_owner / rebalancer_handoff is the declared decision boundary for this package."
    ],
    "currentFirstFrontier": "priority_recovery_event_driven_wait / operation_workflow_owner / rebalancer_handoff",
    "knownDownstreamBlockers": [
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until harness scenario passes green"
    ],
    "missingCausalEdge": "rebalancer handoff has no scheduler retry wake convergence.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait",
    "falsifyingProbe": "falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
    "boundedProgressProof": "Focused proof must show operation-workflow-owner-ports scheduler retry wake converges priority recovery progress.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "expectedObservableTransition": "priority_recovery_event_driven_wait stops blocking rebalancer handoff and scenario proceeds.",
    "maxProgressBound": "one rebalancer handoff scheduler retry package before fresh representative rerun",
    "sameFrontierFallback": "If the change still stalls, escalate to causal analysis instead of widening this package.",
    "expectedNextFrontier": "representative-green or successor residual package",
    "recentFrontierHistory": [
      "work/packages/done-20260530-rolling-restart-startup-readiness-sql-query-engine-available-check.md / startup_readiness_owner / startup_support_evidence / reduced"
    ],
    "oscillationCheck": "The prior startup readiness SQL engine check moved the frontier here.",
    "handoffInvariant": "Operation workflow ports scheduler retry wake convergence must not weaken any active gate convergence invariant.",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes priority_recovery_event_driven_wait to operation_workflow_owner / rebalancer_handoff; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json.",
      "priority_recovery_event_driven_wait is the current selected symptom.",
      "operation_workflow_owner / rebalancer_handoff is the declared decision boundary for this package."
    ],
    "ownerBoundaryMap": [
      "operation_workflow_owner / rebalancer_handoff: selected package owner and boundary.",
      "Downstream owners remain frozen until the falsifier selects migration."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane remains runtime-owner-boundary.",
      "Declared owner boundary remains operation_workflow_owner / rebalancer_handoff."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json.",
      "The active action is Implement the rebalancer handoff retry scheduling wake convergence."
    ],
    "competingTheories": [
      "H1 operation_workflow_owner / rebalancer_handoff owns the missing transition for priority_recovery_event_driven_wait.",
      "H2 the same symptom is inherited from a different owner boundary or architecture gap."
    ],
    "eliminatedTheories": [
      "No eliminated theory is durable until the package proof records a contrary artifact or command result."
    ],
    "downstreamSymptoms": [
      "Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration."
    ],
    "transitionTable": [
      {
        "inputSignal": "priority_recovery_event_driven_wait",
        "owner": "operation_workflow_owner / rebalancer_handoff",
        "missingTransition": "selected evidence must become a named owner-owned transition, migration, or stop.",
        "expectedEvidence": "focused proof selects the transition, migrates ownership, or records architecture-gap evidence.",
        "falsifier": "falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant",
        "migrationTrigger": "the falsifier names a different owner boundary or proves this boundary cannot own the transition."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when focused evidence names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration."
    ],
    "wholeSystemInvariant": "Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap",
    "sourceTestContract": "Implementation may edit only declared source files src/rebalancer/operation-workflow-owner-ports.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as operation_workflow_owner / rebalancer_handoff.",
      "falsifiability": "high - falsifier is falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant.",
      "representativeMovement": "medium - expected movement is route selection, migration, or architecture-gap stop.",
      "downstreamRiskContainment": "high - downstream symptoms remain frozen until owner selection is proven."
    },
    "wrongSliceTriggers": [
      "proof selects a different owner boundary",
      "proof requires runtime files outside writeScope",
      "proof cannot select a concrete transition or migration"
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns operation_workflow_owner / rebalancer_handoff because the selected evidence routes priority_recovery_event_driven_wait there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / rebalancer_handoff emits Implement the rebalancer handoff retry scheduling wake convergence for priority_recovery_event_driven_wait.
- Inputs/signals: test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json; falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant; regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait.
- State model or invariant: The operation_workflow_owner / rebalancer_handoff decision table in the Causal Decision Contract maps priority_recovery_event_driven_wait and route evidence to one emitted outcome: Implement the rebalancer handoff retry scheduling wake convergence.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / rebalancer_handoff invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Implement the rebalancer handoff retry scheduling wake convergence | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / rebalancer_handoff directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant`
- Competing explanations: At minimum compare priority_recovery_event_driven_wait against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / rebalancer_handoff still own priority_recovery_event_driven_wait, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: priority_recovery_event_driven_wait is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait`
- Redirect rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, redirect to an autonomous architecture/causal experiment or successor package instead of opening another local patch — never a bare stop. Terminate the loop only for a closed Termination Condition; a human-only block maps to blocked-frozen-decision/blocked-external-dependency.

## System Theory

- Problem statement: rolling-restart currently routes priority_recovery_event_driven_wait to operation_workflow_owner / rebalancer_handoff; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json.
2. priority_recovery_event_driven_wait is the current selected symptom.
3. operation_workflow_owner / rebalancer_handoff is the declared decision boundary for this package.
- Owner-boundary map:
1. operation_workflow_owner / rebalancer_handoff: selected package owner and boundary.
2. Downstream owners remain frozen until the falsifier selects migration.
- Stable facts:
1. Scenario remains rolling-restart.
2. Package lane remains runtime-owner-boundary.
3. Declared owner boundary remains operation_workflow_owner / rebalancer_handoff.
- Changed facts:
1. This package was opened from test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json.
2. The active action is Implement the rebalancer handoff retry scheduling wake convergence.
- Competing theories:
1. H1 operation_workflow_owner / rebalancer_handoff owns the missing transition for priority_recovery_event_driven_wait.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `priority_recovery_event_driven_wait`; owner `operation_workflow_owner / rebalancer_handoff`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/rebalancer/operation-workflow-owner-ports.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Redirect rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as operation_workflow_owner / rebalancer_handoff.
3. Falsifiability: high - falsifier is falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Implement the rebalancer handoff retry scheduling wake convergence
- Sprint-goal delta: Implement the rebalancer handoff retry scheduling wake convergence
- Required source write: `src/rebalancer/operation-workflow-owner-ports.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route
- Predicted: Implement the rebalancer handoff retry scheduling wake convergence
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `rebalancer_handoff`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## In Scope

1. src/rebalancer/operation-workflow-owner-ports.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/rebalancer/operation-workflow-owner-ports.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant`, `regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: freshness-review; owner: Agent FreshnessReviewer (a8449cde-553a-41b9-b6d7-2120f3581dc4); files-changed: none; validation: npm run work:context; npm run work:package:doctor -- --suggest work/packages/active-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry.md; npm run work:validate -- --entry work/packages/active-20260530-rolling-restart-priority-recovery-rebalancer-handoff-scheduling-retry.md; decision: fresh; outcome: validated.
- [x] action: implementation; owner: operation_workflow_owner; files-changed: src/rebalancer/operation-workflow-owner-ports.js; validation: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant and parent revalidated focused proof: yes before closure; outcome: validated.
- [x] action: verification-fix; owner: operation_workflow_owner; files-changed: src/rebalancer/operation-workflow-owner-ports.js; validation: verifier reruns focused proof and parent revalidated focused proof (`npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait`); parent revalidated focused proof: yes; outcome: validated; blocker: no frontier movement (`accept_classified_backpressure`).
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. falsifier: npx tap test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js # rebalancer_handoff snapshot_coverage # coupled-invariant
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait

## Commit And Push Ledger

1. Focused package commit: e9d840166599f4ed64f894206b1fd085f0d09c6e
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-31T08:19:36.518Z