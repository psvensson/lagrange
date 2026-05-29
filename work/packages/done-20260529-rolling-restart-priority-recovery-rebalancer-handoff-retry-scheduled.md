# Rolling Restart Priority Recovery Rebalancer Handoff Retry Scheduled

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-29",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Focused dispatch-pending reentry proof passed, and the fresh representative rerun reports zero priority recovery residual witnesses with priority_recovery_partition_progress satisfied.",
    "nextAction": "Close as owner-boundary migration and activate the active-gate snapshot coverage selected-source timeout successor.",
    "predecessor": "work/packages/done-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md",
    "successor": "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md",
    "closed": "2026-05-29"
  },
  "scope": {
    "writeScope": [
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner-ports.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js"
    ],
    "commitScope": [
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md",
      "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md",
      "work/packages/done-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md"
    ]
  },
  "gates": {
    "stabilityCredit": "representative-migrated",
    "whyHighestLeverageNow": "The representative route now selects priority_recovery_partition_progress as the first frontier, so proving this operation workflow handoff is the next rolling-restart gate."
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
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
        "regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Prove whether dispatch-pending retry-scheduled priority recovery re-enters operation progress or must split the residual owner boundary.",
    "sprintGoalDelta": "priority_recovery_partition_progress reduces, migrates, records architecture-gap, or representative turns green after one operation_workflow_owner / rebalancer_handoff source package.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "migrated",
    "successorPackage": "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md"
  },
  "theoryLedger": "planned-new-theory; no ledger update: result is recorded in this package closure and the fresh representative artifact migrated to startup_active_gate_owner / snapshot_coverage after priority recovery residuals reached zero.",
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Activate the active-gate snapshot coverage selected-source timeout successor before another representative rerun."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects operation_workflow_owner / rebalancer_handoff.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "operation_workflow_owner",
    "currentAction": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "missingTransitionOrObservation": "Prove whether dispatch-pending retry-scheduled priority recovery re-enters operation progress or must split the residual owner boundary.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route",
    "predicted": "priority_recovery_partition_progress reduces, migrates, records architecture-gap, or representative turns green after one operation_workflow_owner / rebalancer_handoff source package.",
    "observed": "Focused dispatch-pending priority-recovery proof and regression passed; fresh rolling-restart representative evidence stayed red but priority recovery residuals are zero, priority_recovery_partition_progress is satisfied, and the first frontier migrated to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused dispatch-pending reentry proof passed; fresh rolling-restart representative evidence stayed red but priority recovery residuals are zero, priority_recovery_partition_progress is satisfied, and the first frontier migrated to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
    "successorReason": "Rolling-restart is not representative-green yet, so the next theory-loop source package targets the fresh active-gate selected snapshot timeout plus repair_deferred frontier instead of widening operation workflow.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "rebalancer_handoff",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Focused dispatch-pending reentry proof satisfied priority recovery; fresh representative evidence has zero priority recovery residual witnesses and selects active_gate_snapshot_coverage as the first frontier.",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
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
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "snapshot_coverage_incomplete",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "priority_recovery_partition_progress satisfied with zero residual witnesses; the representative first frontier migrated to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "After active-gate owner-recovery handoff enqueues bounded queue-drain work, rolling-restart remains red because dispatch-pending retry-scheduled priority recovery does not re-enter operation progress under operation_workflow_owner / rebalancer_handoff.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedCausalModelChange": "Focused dispatch-pending proof should reduce or migrate priority_recovery_partition_progress, record an architecture-gap stop, or enable a representative-green rerun after one source package.",
    "representativeOutcome": "migrated",
    "causalDebt": "Current artifact has zero priority-recovery witnesses and priority_recovery_partition_progress is satisfied; the remaining first frontier is active_gate_snapshot_coverage with selected snapshot timeout and repair_deferred evidence under startup_active_gate_owner / snapshot_coverage.",
    "crossBoundaryReview": "Do not widen this operation-workflow package; the successor targets startup_active_gate_owner / snapshot_coverage."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery rebalancer handoff retry scheduled",
    "phaseChain": [
      "active-gate queue-drain proof made selectedMembershipPublicationHandoffOutcome.enqueued true",
      "fresh representative evidence migrated the first topology frontier to priority_recovery_partition_progress",
      "dispatch-pending reentry proof passed locally and the regression suite stayed green",
      "fresh representative evidence now reports zero priority-recovery witnesses and priority_recovery_partition_progress satisfied",
      "remaining first frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage"
    ],
    "recentFrontierHistory": [
      "work/packages/done-20260527-rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.md migrated a prior dispatch-pending owner-effect witness",
      "work/packages/done-20260528-rolling-restart-priority-recovery-single-residual-handoff.md selected a single priority-recovery residual handoff",
      "work/packages/done-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md migrated the active-gate frontier back to priority recovery"
    ],
    "oscillationCheck": "operation_workflow_owner / rebalancer_handoff has repeated history, so this package gets one source slice before same-frontier/no-reduction opens architecture rederive.",
    "handoffInvariant": "Operation workflow may wake, re-enter, or classify dispatch-pending progress, but it must not mutate another owner boundary or let downstream readiness reinterpret retry-scheduled priority recovery.",
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "startup readiness remains downstream while active-gate snapshot coverage is incomplete",
      "benchmark_events partition visibility remains downstream while active-gate snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "Dispatch-pending retry-scheduled priority recovery must re-enter operation progress, classify an explicit bounded wait, migrate owner boundary, or record an architecture-gap stop.",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "falsifyingProbe": "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "boundedProgressProof": "Focused proof showed dispatch-pending priority recovery wakes owner progress through the operation workflow owner instead of relying on unbounded retry-scheduled waiting.",
    "boundedProgressProofArtifact": "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "priority_recovery_partition_progress is satisfied with zero residual witnesses, and representative evidence migrates to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
    "maxProgressBound": "one operation_workflow_owner / rebalancer_handoff source package before representative rerun and route recording",
    "sameFrontierFallback": "Unchanged priority_recovery_partition_progress retry_scheduled evidence after this source package triggers architecture rederive instead of another local operation-workflow patch.",
    "expectedNextFrontier": "active_gate_snapshot_coverage selected-source timeout retry, representative-green, or architecture-gap",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "operation_workflow_owner / rebalancer_handoff has repeated priority-recovery history.",
      "Current representative evidence selects one concrete retry-scheduled dispatch-pending residual group with six witnesses."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute the bounded dispatch-pending priority-recovery reentry proof for the current rebalancer handoff witness shape.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Open architecture rederive if focused proof cannot select a bounded operation-workflow transition or migration.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress"
        ]
      }
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Execute the selected dispatch-pending priority-recovery reentry proof before another representative rerun."
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes priority_recovery_event_driven_wait to operation_workflow_owner / rebalancer_handoff; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "priority_recovery_event_driven_wait is the current selected symptom.",
      "operation_workflow_owner / rebalancer_handoff is the declared decision boundary for this package."
    ],
    "ownerBoundaryMap": [
      "operation_workflow_owner / rebalancer_handoff: selected package owner and boundary.",
      "Downstream owners remain frozen until the falsifier selects migration."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane remains causal-escalation.",
      "Declared owner boundary remains operation_workflow_owner / rebalancer_handoff."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "The active action is Prove whether dispatch-pending retry-scheduled priority recovery re-enters operation progress or must split the residual owner boundary.."
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
        "falsifier": "falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
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
    "systemTheoryRef": "work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as operation_workflow_owner / rebalancer_handoff.",
      "falsifiability": "high - falsifier is falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js.",
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

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / rebalancer_handoff emits Prove whether dispatch-pending retry-scheduled priority recovery re-enters operation progress or must split the residual owner boundary. for priority_recovery_event_driven_wait.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js; regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js; supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress.
- State model or invariant: The operation_workflow_owner / rebalancer_handoff decision table in the Causal Decision Contract maps priority_recovery_event_driven_wait and route evidence to one emitted outcome: Prove whether dispatch-pending retry-scheduled priority recovery re-enters operation progress or must split the residual owner boundary..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / rebalancer_handoff invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Prove whether dispatch-pending retry-scheduled priority recovery re-enters operation progress or must split the residual owner boundary. | priority_recovery_partition_progress reduces, migrates, records architecture-gap, or representative turns green after one operation_workflow_owner / rebalancer_handoff source package. | falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / rebalancer_handoff directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Competing explanations: At minimum compare priority_recovery_event_driven_wait against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / rebalancer_handoff still own priority_recovery_event_driven_wait, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: priority_recovery_event_driven_wait is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Success metrics: priority_recovery_partition_progress reduces, migrates, records architecture-gap, or representative turns green after one operation_workflow_owner / rebalancer_handoff source package.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## System Theory

- Problem statement: rolling-restart currently routes priority_recovery_event_driven_wait to operation_workflow_owner / rebalancer_handoff; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
2. priority_recovery_event_driven_wait is the current selected symptom.
3. operation_workflow_owner / rebalancer_handoff is the declared decision boundary for this package.
- Owner-boundary map:
1. operation_workflow_owner / rebalancer_handoff: selected package owner and boundary.
2. Downstream owners remain frozen until the falsifier selects migration.
- Stable facts:
1. Scenario remains rolling-restart.
2. Package lane remains causal-escalation.
3. Declared owner boundary remains operation_workflow_owner / rebalancer_handoff.
- Changed facts:
1. This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
2. The active action is Prove whether dispatch-pending retry-scheduled priority recovery re-enters operation progress or must split the residual owner boundary..
- Competing theories:
1. H1 operation_workflow_owner / rebalancer_handoff owns the missing transition for priority_recovery_event_driven_wait.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `priority_recovery_event_driven_wait`; owner `operation_workflow_owner / rebalancer_handoff`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Kill rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as operation_workflow_owner / rebalancer_handoff.
3. Falsifiability: high - falsifier is falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Prove whether dispatch-pending retry-scheduled priority recovery re-enters operation progress or must split the residual owner boundary.
- Sprint-goal delta: priority_recovery_partition_progress reduces, migrates, records architecture-gap, or representative turns green after one operation_workflow_owner / rebalancer_handoff source package.
- Required source write: `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route
- Predicted: priority_recovery_partition_progress reduces, migrates, records architecture-gap, or representative turns green after one operation_workflow_owner / rebalancer_handoff source package.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: priority_recovery_partition_progress reduces, migrates, records architecture-gap, or representative turns green after one operation_workflow_owner / rebalancer_handoff source package.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `rebalancer_handoff`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. In a theory-loop package, package/sprint/tracker/ledger-only work is not a closure shape; keep classification evidence in the sprint, run representative evidence, and create or activate the next `src/` successor package instead of closing as classification-only.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js`, `supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown`, `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: freshness-review; owner: Agent Fermat (019e717e-297b-75a0-b789-18d0f07fdb09); files-changed: none; validation: npm run work:context; npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; status: validated; decision: fresh; outcome: implementation may proceed within write scope src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js.
- [x] action: implementation; owner: operation_workflow_owner; files-changed: src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; validation: node --check src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js; npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress; parent revalidated focused proof: yes; status: validated; outcome: focused proof and regression passed; representative rerun reduced priority recovery to zero residual witnesses and migrated first frontier to active_gate_snapshot_coverage.
- [x] action: verification-fix; owner: Agent Euler (019e7191-dbf2-7c50-ab21-25af9f8c8c47); files-changed: none; validation: npm run work:context; node --check src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress; parent revalidated focused proof: yes; status: validated; outcome: read-only verifier passed and confirmed priority recovery is satisfied; remaining representative frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:repair; outcome: tracker refreshed; package scope was narrowed back to the declared operation-workflow source slice after repair autocomplete.

## Commit And Push Ledger

1. Focused package commit: 2cda484cbc616d0c3afacce6eaad0441d961df2a
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
2. regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js
3. supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress
