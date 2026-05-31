# Rolling Restart Priority Recovery Rebalancer Handoff Blocked Rerun Route State

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
    "currentState": "The decision table and contract distinguish eligible representative rerun from blocked_model_route, but runtime progress evidence does not yet emit the representative rerun route discriminator.",
    "nextAction": "Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal.",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "src/rebalancer/operation-workflow-owner-ports.js",
      "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
      "architecture/contracts/rolling-restart-rebalancer-handoff.md",
      "work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md",
      "work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner-ports.js"
    ],
    "commitScope": [
      "work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md",
      "work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md",
      "src/rebalancer/operation-workflow-owner-ports.js",
      "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
      "architecture/contracts/rolling-restart-rebalancer-handoff.md",
      "work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "causal-escalation",
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
      "theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-rederive",
      "theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair",
      "theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state"
    ],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js # focused contract fixture",
        "regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js # affected consumer proof",
        "regression: npm run model:decision-tables",
        "supporting: npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
        "supporting: npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-ports.js"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal.",
    "sprintGoalDelta": "Runtime progress contract emits blocked_model_route for the rebalancer handoff retry path; representative evidence remains unchanged until a later legal rerun.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "supported",
    "outcome": "theory-confirmed",
    "successorPackage": "work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md",
    "architectureRoute": {
      "selectedLayer": "model",
      "ledgerRef": "theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-rederive-architecture-gap",
      "coupledInvariant": "blocked representative rerun cannot be emitted as rerun_representative_evidence",
      "gapAnalysisRef": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md"
    }
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "frontier": "priority_recovery_event_driven_wait / operation_workflow_owner / rebalancer_handoff",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal.",
    "residualCount": 1
  },
  "causalGovernance": {
    "hypothesis": "The missing runtime-owned edge is the progress-contract discriminator that tells the repaired decision table whether accepted backpressure is eligible for representative rerun or already blocked_model_route.",
    "stopConditionCheck": "Run `npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`, the focused rebalancer contract fixture, affected consumer proof, decision-table check, contract check, and scenario-route before implementation closure.",
    "expectedCausalModelChange": "No representative artifact movement is expected in this package; the runtime progress contract should expose blocked_model_route for the rebalancer handoff retry path.",
    "representativeOutcome": "reduced",
    "causalDebt": "Rolling-restart remains red with two priority-recovery witnesses until the linked representative rerun gate consumes the emitted route discriminator.",
    "crossBoundaryReview": "Representative evidence, startup active-gate, release-gate, and unrelated operation workflow paths remain frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery rebalancer handoff blocked rerun route state",
    "phaseChain": [
      "owner wake proof passed",
      "representative-progress model blocked another direct rerun",
      "post-model rederive selected architecture-gap",
      "post-model architecture-gap selected model/contract repair",
      "decision table repair introduced representativeRerunRoute with blocked_model_route"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains downstream",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream",
      "representative_evidence_owner / rolling_restart_rerun remains blocked for blocked_model_route until a legal successor is selected"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-architecture-gap-experiment.md / model-contract route selected",
      "done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md / blocked_model_route decision-table route repaired"
    ],
    "oscillationCheck": "This package implements the selected architecture route in runtime-owned progress contract state; it must not become another analysis package or representative rerun.",
    "handoffInvariant": "Accepted backpressure under blocked_model_route cannot authorize rerun_representative_evidence.",
    "missingCausalEdge": "runtime progress contract representativeRerunRoute discriminator",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "falsifyingProbe": "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "boundedProgressProof": "Focused fixture and consumer proof must show the rebalancer handoff retry path emits blocked_model_route without changing representative evidence.",
    "boundedProgressProofArtifact": "src/rebalancer/operation-workflow-owner-ports.js",
    "expectedObservableTransition": "progressContract.representativeRerunRoute becomes blocked_model_route for rebalancer_handoff retry progress",
    "maxProgressBound": "one runtime progress-contract discriminator implementation before successor selection",
    "sameFrontierFallback": "Open architecture-gap or workflow-tooling continuation if runtime cannot own the discriminator.",
    "expectedNextFrontier": "runtime-owned blocked_model_route signal",
    "resultClassification": "reduced",
    "stopCondition": "bounded-non-frontier"
  },
  "progressContract": {
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "state": "wait_for_rebalancer_handoff_retry",
    "reason": "priority_recovery_event_driven_wait",
    "nextAction": "emit_blocked_model_route_discriminator",
    "wakeSource": "rebalancer_handoff_retry",
    "retryAfterMs": 1000,
    "terminalState": "satisfied",
    "evidencePath": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "blockingDependency": "rebalancer_handoff"
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json selects operation_workflow_owner / rebalancer_handoff.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "operation_workflow_owner",
    "currentAction": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "missingTransitionOrObservation": "Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route",
    "predicted": "Runtime progress contract emits blocked_model_route for the rebalancer handoff retry path; representative evidence remains unchanged until a later legal rerun.",
    "observed": "Runtime progress contract emits blocked_model_route for the rebalancer handoff retry path; representative evidence remains unchanged until a later legal rerun.",
    "accuracy": "matched",
    "evidence": "src/rebalancer/operation-workflow-owner-ports.js"
  },
  "boundedExperiment": {
    "hypothesis": "State the experiment hypothesis before implementation.",
    "hypothesisDiscriminator": "Predict the different observable under H1 vs H2 vs H3 before implementation.",
    "expectedMetric": "Name the count, frontier, route, or representative result expected to move.",
    "inheritsFrom": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "If the runtime progress contract cannot own the route discriminator, stop and migrate to workflow tooling or architecture-gap rather than rerunning representative evidence."
  },
  "validationTier": "single-owner",
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
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "causal-escalation",
    "expectedDelta": "Runtime progress contract emits blocked_model_route for the rebalancer handoff retry path; representative evidence remains unchanged until a later legal rerun.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes priority_recovery_event_driven_wait to operation_workflow_owner / rebalancer_handoff; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json.",
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
      "Declared owner boundary remains operation_workflow_owner / rebalancer_handoff.",
      "Durable contract record is architecture/contracts/rolling-restart-rebalancer-handoff.md."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json.",
      "The active action is Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal.."
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
        "falsifier": "falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
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
    "systemTheoryRef": "architecture/contracts/rolling-restart-rebalancer-handoff.md",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/rebalancer/operation-workflow-owner-ports.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as operation_workflow_owner / rebalancer_handoff.",
      "falsifiability": "high - falsifier is falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js.",
      "representativeMovement": "medium - expected movement is route selection, migration, or architecture-gap stop.",
      "downstreamRiskContainment": "high - downstream symptoms remain frozen until owner selection is proven."
    },
    "wrongSliceTriggers": [
      "proof selects a different owner boundary",
      "proof requires runtime files outside writeScope",
      "proof cannot select a concrete transition or migration"
    ]
  },
  "systemContractRef": "architecture/contracts/rolling-restart-rebalancer-handoff.md",
  "modelTheory": {
    "modelKind": "invariant-spec",
    "executableArtifact": "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json",
    "propertiesProven": [
      "accepted backpressure plus blocked_model_route routes to open_successor_or_architecture_experiment"
    ],
    "assumptions": [
      "representative-progress model has already classified the rerun as blocked_model_route"
    ],
    "counterExampleHandling": "Fail the package falsifier and promote the counterexample to a focused regression or contract update before implementation continues.",
    "linkedSystemTheoryRef": "architecture/contracts/rolling-restart-rebalancer-handoff.md"
  },
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "matched",
    "observedMovement": "Focused runtime proof reduced route ambiguity: event-driven progress remains representativeRerunRoute=eligible while rebalancer handoff retry progress now emits representativeRerunRoute=blocked_model_route.",
    "successorReason": "Representative evidence has not yet consumed the runtime-owned route state, so the linked successor is a todo rerun gate rather than another local runtime patch.",
    "nextOwnerBoundary": "representative_evidence_owner / rolling_restart_rerun",
    "evidenceArtifact": "src/rebalancer/operation-workflow-owner-ports.js"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns operation_workflow_owner / rebalancer_handoff because the selected evidence routes priority_recovery_event_driven_wait there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## System Contract Binding

- Contract record: `architecture/contracts/rolling-restart-rebalancer-handoff.md`
- Closure question: which failure class became impossible, earlier-detected, bounded, or explicitly residual?
- Model artifact: `docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json`
- Model kind: `invariant-spec`


## Core Logic Brief

- Canonical outcome: operation_workflow_owner / rebalancer_handoff emits Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal. for priority_recovery_event_driven_wait.
- Inputs/signals: test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json; falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js; regression: npm run model:decision-tables; supporting: npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress.
- State model or invariant: The operation_workflow_owner / rebalancer_handoff decision table in the Causal Decision Contract maps priority_recovery_event_driven_wait and route evidence to one emitted outcome: Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / rebalancer_handoff invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal. | Runtime progress contract emits blocked_model_route for the rebalancer handoff retry path; representative evidence remains unchanged until a later legal rerun. | falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / rebalancer_handoff directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Competing explanations: At minimum compare priority_recovery_event_driven_wait against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / rebalancer_handoff still own priority_recovery_event_driven_wait, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: priority_recovery_event_driven_wait is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Success metrics: Runtime progress contract emits blocked_model_route for the rebalancer handoff retry path; representative evidence remains unchanged until a later legal rerun.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait`
- Redirect rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, redirect to an autonomous architecture/causal experiment or successor package instead of opening another local patch — never a bare stop. Terminate the loop only for a closed Termination Condition; a human-only block maps to blocked-frozen-decision/blocked-external-dependency.

## System Theory

- Problem statement: rolling-restart currently routes priority_recovery_event_driven_wait to operation_workflow_owner / rebalancer_handoff; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json.
2. priority_recovery_event_driven_wait is the current selected symptom.
3. operation_workflow_owner / rebalancer_handoff is the declared decision boundary for this package.
- Owner-boundary map:
1. operation_workflow_owner / rebalancer_handoff: selected package owner and boundary.
2. Downstream owners remain frozen until the falsifier selects migration.
- Stable facts:
1. Scenario remains rolling-restart.
2. Package lane remains runtime-owner-boundary.
3. Declared owner boundary remains operation_workflow_owner / rebalancer_handoff.
4. Durable contract record is architecture/contracts/rolling-restart-rebalancer-handoff.md.
- Changed facts:
1. This package was opened from test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json.
2. The active action is Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal..
- Competing theories:
1. H1 operation_workflow_owner / rebalancer_handoff owns the missing transition for priority_recovery_event_driven_wait.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `priority_recovery_event_driven_wait`; owner `operation_workflow_owner / rebalancer_handoff`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: architecture/contracts/rolling-restart-rebalancer-handoff.md
- Selected system theory: H1 is selected unless falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/rebalancer/operation-workflow-owner-ports.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Redirect rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as operation_workflow_owner / rebalancer_handoff.
3. Falsifiability: high - falsifier is falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Model Theory

- Model kind: `invariant-spec`
- Executable artifact: `docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json`
- Properties proven:
1. accepted backpressure plus blocked_model_route routes to open_successor_or_architecture_experiment
- Assumptions:
1. representative-progress model has already classified the rerun as blocked_model_route
- Counterexample handling: Fail the package falsifier and promote the counterexample to a focused regression or contract update before implementation continues.
- Linked system theory: architecture/contracts/rolling-restart-rebalancer-handoff.md

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Emit the blocked_model_route representative rerun discriminator from the rebalancer handoff progress contract so the repaired decision table has a runtime-owned route signal.
- Sprint-goal delta: Runtime progress contract emits blocked_model_route for the rebalancer handoff retry path; representative evidence remains unchanged until a later legal rerun.
- Architecture route (selected layer): `model`
- Architecture route ledger ref: theory-20260531-rolling-restart-priority-recovery-rebalancer-handoff-post-model-rederive-architecture-gap
- Architecture route coupled invariant: blocked representative rerun cannot be emitted as rerun_representative_evidence
- Required source write: `src/rebalancer/operation-workflow-owner-ports.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.


## Bounded Experiment

- Hypothesis: State the experiment hypothesis before implementation.
- Hypothesis discriminator: Predict the different observable under H1 vs H2 vs H3 before implementation.
- Expected metric: Name the count, frontier, route, or representative result expected to move.
- Inherits from: `work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-decision-table-circuit-breaker-repair.md`
- Timebox: `24h`
- Validation tier: `single-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Redirect rule: If the runtime progress contract cannot own the route discriminator, stop and migrate to workflow tooling or architecture-gap rather than rerunning representative evidence.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route
- Predicted: Runtime progress contract emits blocked_model_route for the rebalancer handoff retry path; representative evidence remains unchanged until a later legal rerun.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`
- Expected delta: Runtime progress contract emits blocked_model_route for the rebalancer handoff retry path; representative evidence remains unchanged until a later legal rerun.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `rebalancer_handoff`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## In Scope

1. src/rebalancer/operation-workflow-owner-ports.js
2. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
3. architecture/contracts/rolling-restart-rebalancer-handoff.md
4. work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md
5. work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md
6. work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md
7. work/theory-ledger.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/rebalancer/operation-workflow-owner-ports.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `architecture/contracts/rolling-restart-rebalancer-handoff.md`, `work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md`, `work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md`, `work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md`, `work/theory-ledger.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `regression: npm run model:decision-tables`, `supporting: npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md`, `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`
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

- [x] action: freshness-review; owner: Agent Ptolemy (019e7f56-0112-74d0-8782-5fe3b83049c8); files-changed: none; validation: npm run work:context; npm run work:package:doctor -- --suggest work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md; npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md; npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress; decision: fresh; outcome: validated, route current with no migrate/split/architecture-gap blocker.
- [x] action: implementation; owner: operation_workflow_owner; files-changed: src/rebalancer/operation-workflow-owner-ports.js, test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js, architecture/contracts/rolling-restart-rebalancer-handoff.md, work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md, work/packages/todo-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md, work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md, work/theory-ledger.md, work/sprints/current-blocker.json; validation: `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` passed; `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js` passed; `npm run model:decision-tables` passed; `npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md` passed; `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress` passed with accept_classified_backpressure and witnessCount=2; `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` passed; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` passed with outcome accept_classified_backpressure, exhaustedBudgetCount=0, failedInvariantCount=0; `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-ports.js` passed; `git diff --check -- work/packages/active-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-rerun-route-state.md src/rebalancer/operation-workflow-owner-ports.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js architecture/contracts/rolling-restart-rebalancer-handoff.md work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md work/theory-ledger.md work/sprints/current-blocker.json` passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: Agent Lovelace (019e7f5b-15b1-75f2-89b4-8b4e26e6e930); files-changed: none; validation: verifier ran `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` passed; `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-ports.js` passed; `git diff --check -- src/rebalancer/operation-workflow-owner-ports.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json; validation: `npm run work:repair` passed; outcome: validated.

## Validation

1. falsifier: npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
2. regression: npm run model:decision-tables
3. supporting: npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress

## Commit And Push Ledger

1. Focused package commit: 652034a9bd9c5a68873e748bdbf45032caf1d83c
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-31T18:57:38.919Z
