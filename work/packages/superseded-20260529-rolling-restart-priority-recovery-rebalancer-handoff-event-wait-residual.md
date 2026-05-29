# Rolling Restart Priority Recovery Rebalancer Handoff Event Wait Residual

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "superseded",
  "supersededBy": "work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-system-theory-rederive.md",
  "supersededReason": "Alternating-Pair Mutex (R1): startup_active_gate_owner/snapshot_coverage and operation_workflow_owner/rebalancer_handoff form an alternating pair, and the rederive package must close before any runtime slice on the pair may activate.",
  "intent": {
    "opened": "2026-05-29",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Fresh representative evidence migrated from active_gate_snapshot_coverage back to priority_recovery_partition_progress with one recovering_in_flight replica_operations-p1 residual under operation_workflow_owner / rebalancer_handoff.",
    "nextAction": "Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual.",
    "predecessor": "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md",
    "successor": "work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-system-theory-rederive.md"
  },
  "scope": {
    "writeScope": [
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js"
    ],
    "commitScope": [
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md",
      "work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-system-theory-rederive.md",
      "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
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
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual.",
    "sprintGoalDelta": "Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "migrated",
    "successorPackage": "work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-system-theory-rederive.md"
  },
  "theoryLedger": "planned-new-theory; no ledger update: result is recorded in this package closure and the fresh representative artifact cleared priority recovery to zero residuals, then migrated the first frontier back to startup_active_gate_owner / snapshot_coverage.",
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Activate the startup_active_gate_owner / snapshot_coverage system-theory rederive successor before another local active-gate patch."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects operation_workflow_owner / rebalancer_handoff.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "operation_workflow_owner",
    "currentAction": "Fresh representative evidence migrated from active_gate_snapshot_coverage back to priority_recovery_partition_progress with one recovering_in_flight replica_operations-p1 residual under operation_workflow_owner / rebalancer_handoff.",
    "missingTransitionOrObservation": "Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route",
    "predicted": "Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual.",
    "observed": "Fresh representative rerun failed 0/1 after 800.4s, but priority recovery had zero residual witnesses and the first frontier migrated to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage.",
    "accuracy": "partial",
    "evidence": "timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
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
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Fresh rolling-restart evidence migrated back to priority_recovery_partition_progress because the remaining replica_operations-p1 recovering_in_flight residual does not expose bounded operation_workflow_owner / rebalancer_handoff progress.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedCausalModelChange": "Focused priority-recovery proof should clear or reduce the remaining replica_operations-p1 residual, migrate owner boundary, record architecture-gap, or enable representative green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh artifact has zero priority recovery residual witnesses; the active blocker migrated to active_gate_snapshot_coverage with selected_snapshot_source_timeout and snapshot_repair_deferred under startup_active_gate_owner / snapshot_coverage.",
    "crossBoundaryReview": "Do not patch active-gate snapshot coverage, startup readiness, benchmark visibility, or generic transport while priority_recovery_partition_progress is the selected first frontier."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery rebalancer handoff event-driven wait residual",
    "phaseChain": [
      "active-gate snapshot coverage source package passed focused proof locally",
      "fresh representative rerun stayed red and migrated first frontier from active_gate_snapshot_coverage back to priority_recovery_partition_progress",
      "priority residual extraction reports one operation_workflow_owner / rebalancer_handoff witness on replica_operations-p1",
      "active_gate_snapshot_coverage remains the next expected frontier after priority recovery closes"
    ],
    "recentFrontierHistory": [
      "work/packages/done-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md reduced this family once before priority recovery reopened",
      "work/packages/done-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md migrated from active gate to priority recovery",
      "work/packages/done-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md satisfied the priority recovery frontier"
    ],
    "oscillationCheck": "The frontier returned to a recently closed related priority-recovery boundary; this causal-escalation package gets one source slice before same-frontier/no-reduction opens/selects autonomous architecture work.",
    "handoffInvariant": "Active-gate snapshot coverage, startup readiness, and benchmark visibility stay downstream while priority_recovery_partition_progress owns the first frontier.",
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage remains the next expected frontier after priority recovery closes",
      "startup readiness and benchmark_events partition visibility remain downstream while priority recovery is retryable"
    ],
    "missingCausalEdge": "recovering_in_flight plus retry_scheduled must become bounded operation workflow progress, migration, or architecture-gap.",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "falsifyingProbe": "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "boundedProgressProof": "Focused proof must show a concrete retry, dispatch, handoff, timeout, advance, wake, or bounded progress mechanism for the remaining priority-recovery residual.",
    "boundedProgressProofArtifact": "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "priority_recovery_partition_progress clears or reduces the one residual witness, migrates owner boundary, records architecture-gap, or representative turns green.",
    "maxProgressBound": "one operation_workflow_owner / rebalancer_handoff source package before representative rerun and route recording",
    "sameFrontierFallback": "Unchanged priority_recovery_partition_progress priority_recovery_event_driven_wait evidence after this source package triggers architecture rederive instead of another adjacent local patch.",
    "expectedNextFrontier": "active_gate_snapshot_coverage successor selects bounded startup_active_gate_owner / snapshot_coverage source work, architecture rederive, or representative-green",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "rebalancer_handoff",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Fresh representative evidence has zero priority recovery residual witnesses and scenario route selects active_gate_snapshot_coverage with snapshot_coverage_incomplete.",
    "evidence": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused priority recovery proof and regression passed; fresh rolling-restart representative evidence stayed red but priority recovery had zero residual witnesses and the first frontier migrated to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
    "successorReason": "Compositional history blocks another local startup_active_gate_owner / snapshot_coverage contract-gap slice, so the successor must rederive the active-gate snapshot coverage system theory before source promotion.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "priority recovery is satisfied with zero residual witnesses",
      "active_gate_snapshot_coverage remains the first frontier with selected_snapshot_source_timeout and snapshot_repair_deferred",
      "startup_active_gate_owner / snapshot_coverage has repeated active-gate contract-gap history"
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute the bounded selected-source repair-deferred retry proof for the current active-gate witness shape.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Open architecture rederive if focused proof cannot select a bounded owner-owned retry transition.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
        ]
      }
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Execute the selected repair-deferred retry proof before another representative rerun."
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
      "The active action is Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual.."
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
    "systemTheoryRef": "work/packages/todo-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md systemTheory",
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
  }
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

- Canonical outcome: operation_workflow_owner / rebalancer_handoff emits Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual. for priority_recovery_event_driven_wait.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js; regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js; supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress.
- State model or invariant: The operation_workflow_owner / rebalancer_handoff decision table in the Causal Decision Contract maps priority_recovery_event_driven_wait and route evidence to one emitted outcome: Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / rebalancer_handoff invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js |
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
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
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
2. The active action is Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual..
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

- System theory reference: work/packages/todo-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md systemTheory
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
- Promoted theory: Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual.
- Sprint-goal delta: Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual.
- Required source write: `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route
- Predicted: Prove bounded progress for the remaining replica_operations-p1 recovering_in_flight priority-recovery residual.
- Observed: fresh representative rerun failed 0/1 after 800.4s, but priority recovery had zero residual witnesses and the first frontier migrated to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage.
- Accuracy: supported-migration.
- Evidence: `timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`; `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown`; `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `rebalancer_handoff`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md`.
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
- Focused proof: `falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js`, `supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress`, `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`
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

- [x] action: freshness-review; owner: Agent Arendt (019e71bf-3b21-7cb3-9197-e07a3ecf2dcf); files-changed: none; validation: npm run work:context; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; parent revalidated focused proof: yes; status: validated; decision: fresh; outcome: route fresh; priority_recovery_partition_progress remains operation_workflow_owner / rebalancer_handoff with one replica_operations-p1 recovering_in_flight retry_scheduled residual and absent progress contract; implementation may proceed only in src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js.
- [x] action: implementation; owner: operation_workflow_owner; files-changed: src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js, work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md; validation: node --check src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js; npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; parent revalidated focused proof: yes; status: validated; outcome: final source removed the failed wake experiment and retained remote retry progress recording; focused and regression proof passed; representative stayed red but priority recovery reached zero residual witnesses and first frontier migrated to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage.
- [x] action: verification-fix; owner: Agent Ptolemy (019e71e9-882b-7e70-9241-a115d0bb954a); files-changed: none; validation: npm run work:context; git diff -- src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; rg -n "WAKE_REMOTE_OWNER|REMOTE_OWNER|wake|retry|progress" src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js; npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js; npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; parent revalidated focused proof: yes; status: validated; outcome: verifier confirmed no files changed, current diff is limited to remote retry progress recording, focused/regression proof passed, priority residuals are zero, and representative route migrated to startup_active_gate_owner / snapshot_coverage; noted baseline WAKE_REMOTE_OWNER symbols still exist outside the current diff.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md, work/packages/active-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md; validation: npm run work:repair; status: validated; outcome: refreshed tracker handoff, then narrowed auto-expanded package scope back to the declared priority-recovery source file plus package successor record.

## Validation

1. falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
2. regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-owner-adapter.test.js
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress
