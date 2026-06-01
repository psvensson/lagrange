# Rolling Restart Priority Recovery Retry Deferred Handoff

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Fresh rolling-restart evidence after table-bootstrap SQL-unavailable repair moved the terminal table metric but now selects priority_recovery_partition_progress with three recovering_in_flight retry_deferred dispatch-pending witnesses.",
    "nextAction": "Test the retry_deferred dispatch-pending handoff recurrence with focused operation-workflow owner proof before another representative rerun.",
    "predecessor": "work/packages/done-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md",
    "successor": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "src/rebalancer/operation-workflow-owner-ports.js",
      "src/control-plane/priority-recovery-dispatch-snapshot.js",
      "src/bootstrap/bootstrap-api-control-plane-methods.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
      "test/rebalancer/priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md",
      "work/packages/done-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
      "test/rebalancer/priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js",
      "test/control-plane/priority-recovery-snapshot.test.js"
    ],
    "commitScope": [
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "src/rebalancer/operation-workflow-owner-ports.js",
      "src/control-plane/priority-recovery-dispatch-snapshot.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
      "test/rebalancer/priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js",
      "src/bootstrap/bootstrap-api-control-plane-methods.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "work/packages/active-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md",
      "work/packages/done-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md"
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
        "regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js && npm test -- test/rebalancer/operation-workflow-owner-adapter.test.js test/control-plane/priority-recovery-snapshot.test.js",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --markdown"
      ]
    }
  },
  "theoryLedger": "planned-new-theory: no ledger update needed because this bounded retry_deferred handoff proof records its representative movement in closureSummary and hands fresh successor work to startup_active_gate_owner / snapshot_coverage.",
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Test the retry_deferred dispatch-pending handoff recurrence with focused operation-workflow owner proof before another representative rerun.",
    "sprintGoalDelta": "priority_recovery_partition_progress clears, reduces below three retry_deferred witnesses, migrates owner boundary, or records architecture-gap after one source package",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "migrated",
    "successorPackage": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md"
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json",
    "frontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Activate the selected snapshot source timeout successor before another representative rerun."
  },
  "mechanismCard": {
    "failureMechanism": "scheduling_gap with observation_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json selects operation_workflow_owner / rebalancer_handoff.",
    "changedFacts": "Fresh evidence reports three retry_deferred dispatch-pending priority-recovery witnesses on control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1.",
    "rejectedAlternatives": "Do not widen the completed table-bootstrap package, reopen active-gate/startup-readiness timers, or silently edit handoff retry emitter files outside this package.",
    "ownerWhoDecides": "operation_workflow_owner",
    "currentAction": "Fresh rolling-restart evidence after table-bootstrap SQL-unavailable repair moved the terminal table metric but now selects priority_recovery_partition_progress with three recovering_in_flight retry_deferred dispatch-pending witnesses.",
    "missingTransitionOrObservation": "retry_deferred dispatch-pending handoff witnesses must either produce bounded owner progress or expose a complete progress contract that lets priority_recovery_partition_progress reduce or migrate.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route",
    "predicted": "priority_recovery_partition_progress clears, reduces below three retry_deferred witnesses, migrates owner boundary, or records architecture-gap after one source package",
    "observed": "priority_recovery_partition_progress cleared: fresh representative has zero priority-recovery residual witnesses and routes active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --markdown"
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused operation-workflow proof passed; fresh representative evidence cleared priority_recovery_partition_progress, reduced priority-recovery residual witnesses from 3 to 0, and migrated the first frontier to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
    "successorReason": "Rolling-restart is not representative-green yet, so the next theory-loop source package targets the fresh selected_snapshot_source_timeout and deferred_refresh snapshot coverage residual instead of widening this package.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json"
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
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "snapshot_coverage_incomplete",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "active_gate_snapshot_coverage clears, reduces selected snapshot timeout/deferred-refresh evidence, migrates owner boundary, or records architecture-gap after one source package",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "run current-blocker refresh through npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "retry_deferred PENDING coordinator-created remote handoff failures are recorded as bounded retry_scheduled dispatch-pending priority-recovery witnesses, but the owner path does not produce an observable progress, timeout, reconcile, or migration transition before the representative run times out.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json",
    "expectedCausalModelChange": "Focused operation-workflow owner proof either re-arms or advances retry_deferred dispatch-pending handoff witnesses, or proves the priority-recovery projection already carries a bounded progress contract; representative evidence then reduces the three-witness priority_recovery_partition_progress frontier, migrates, or reaches green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh representative evidence exposes three retry_deferred dispatch-pending priority-recovery witnesses with waitMode=retry_scheduled, latestOperationWorkflowStep=PENDING, latestOperationStatus=retry_deferred, and blockingBoundary=rebalancer_handoff.",
    "crossBoundaryReview": "If the focused falsifier selects src/rebalancer/operation-workflow-coordinator-handoff-retry.js or src/rebalancer/operation-workflow-owner-handoff-state.js, split or adjust package scope instead of silently widening this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery retry_deferred handoff",
    "phaseChain": [
      "table-bootstrap SQL-unavailable focused proof passed and moved authoritativeRepairAttempted from false to true",
      "representative rolling-restart stayed red",
      "canonical scenario-route selected priority_recovery_partition_progress",
      "priority residuals report three operation_workflow_owner / rebalancer_handoff retry_deferred dispatch-pending witnesses"
    ],
    "recentFrontierHistory": [
      "predecessor table-bootstrap source package moved authoritativeRepairAttempted from false to true and selected operation_workflow_owner / rebalancer_handoff retry_deferred priority-recovery residuals",
      "this package's fresh representative rerun cleared priority-recovery residual witnesses from 3 to 0 and migrated the first frontier to startup_active_gate_owner / snapshot_coverage"
    ],
    "oscillationCheck": "Allowed because this source package produced concrete representative movement: priority_recovery_partition_progress residual witnesses fell from 3 to 0 and the first frontier migrated away from operation_workflow_owner / rebalancer_handoff.",
    "handoffInvariant": "This package may close only the retry_deferred operation-workflow handoff edge; startup active-gate snapshot coverage remains frozen to the successor package selected from fresh representative evidence.",
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup readiness remains downstream while priority recovery is retryable",
      "the terminal scenario error still reports benchmark_events visibility failure after priority recovery stalls",
      "priority-recovery witnesses must reduce, migrate, or expose bounded progress before active-gate or readiness symptoms are patched"
    ],
    "missingCausalEdge": "retry_deferred dispatch-pending priority-recovery witnesses need a bounded owner re-entry, progress observation, or projection contract before the representative timeout.",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "falsifyingProbe": "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "boundedProgressProof": "Focused proof must show that retry_deferred PENDING handoff witnesses are re-armed, advanced, or projected with a canonical bounded progress contract.",
    "boundedProgressProofArtifact": "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "priority_recovery_partition_progress clears, reduces below three retry_deferred witnesses, migrates owner boundary, or records architecture-gap after one source package.",
    "maxProgressBound": "one operation_workflow_owner / rebalancer_handoff retry_deferred source package before representative rerun and route recording",
    "sameFrontierFallback": "Unchanged same-frontier three-witness retry_deferred evidence triggers architecture rederive instead of another adjacent local patch.",
    "expectedNextFrontier": "representative-green, reduced retry_deferred witness count, owner-boundary migration, or architecture-gap",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "table-bootstrap package moved authoritativeRepairAttempted from false to true",
      "fresh scenario-route selects priority_recovery_partition_progress",
      "priority residual extraction reports one operation_workflow_owner / rebalancer_handoff group with three retry_deferred dispatch-pending witnesses"
    ],
    "selectedChoice": "priority-recovery-retry-deferred-handoff",
    "nextAction": "Run the focused retry_deferred operation-workflow owner proof before representative rerun.",
    "choices": [
      {
        "id": "priority-recovery-retry-deferred-handoff",
        "summary": "Promote bounded retry_deferred dispatch-pending handoff source proof.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --markdown"
        ]
      },
      {
        "id": "priority-recovery-handoff-architecture-gap",
        "summary": "Open an architecture package if focused proof cannot select a bounded owner-owned transition or projection contract.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json"
        ]
      }
    ]
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "rebalancer_handoff",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Fresh representative evidence after the retry_deferred handoff source proof reduced priority-recovery residual witnesses from 3 to 0 and selected active_gate_snapshot_coverage as the first frontier.",
    "evidence": "test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --markdown"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes priority_recovery_event_driven_wait to operation_workflow_owner / rebalancer_handoff; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json.",
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
      "This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json.",
      "The active action is Test the retry_deferred dispatch-pending handoff recurrence with focused operation-workflow owner proof before another representative rerun.."
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
    "systemTheoryRef": "work/packages/active-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js, src/rebalancer/operation-workflow-owner-ports.js, src/control-plane/priority-recovery-dispatch-snapshot.js after the falsifier keeps the package inside the selected owner boundary.",
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

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / rebalancer_handoff emits Test the retry_deferred dispatch-pending handoff recurrence with focused operation-workflow owner proof before another representative rerun. for priority_recovery_event_driven_wait.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json; falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js; regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js && npm test -- test/rebalancer/operation-workflow-owner-adapter.test.js test/control-plane/priority-recovery-snapshot.test.js; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress; supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --markdown.
- State model or invariant: The operation_workflow_owner / rebalancer_handoff decision table in the Causal Decision Contract maps priority_recovery_event_driven_wait and route evidence to one emitted outcome: Test the retry_deferred dispatch-pending handoff recurrence with focused operation-workflow owner proof before another representative rerun..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / rebalancer_handoff invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Test the retry_deferred dispatch-pending handoff recurrence with focused operation-workflow owner proof before another representative rerun. | priority_recovery_partition_progress clears, reduces below three retry_deferred witnesses, migrates owner boundary, or records architecture-gap after one source package | falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js |
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
- Success metrics: priority_recovery_partition_progress clears, reduces below three retry_deferred witnesses, migrates owner boundary, or records architecture-gap after one source package; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## System Theory

- Problem statement: rolling-restart currently routes priority_recovery_event_driven_wait to operation_workflow_owner / rebalancer_handoff; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json.
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
1. This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json.
2. The active action is Test the retry_deferred dispatch-pending handoff recurrence with focused operation-workflow owner proof before another representative rerun..
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

- System theory reference: work/packages/todo-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js, src/rebalancer/operation-workflow-owner-ports.js, src/control-plane/priority-recovery-dispatch-snapshot.js after the falsifier keeps the package inside the selected owner boundary.
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
- Promoted theory: Test the retry_deferred dispatch-pending handoff recurrence with focused operation-workflow owner proof before another representative rerun.
- Sprint-goal delta: priority_recovery_partition_progress clears, reduces below three retry_deferred witnesses, migrates owner boundary, or records architecture-gap after one source package
- Required source write: `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`, `src/rebalancer/operation-workflow-owner-ports.js`, `src/control-plane/priority-recovery-dispatch-snapshot.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / operation_workflow_owner / rebalancer_handoff / representative route
- Predicted: priority_recovery_partition_progress clears, reduces below three retry_deferred witnesses, migrates owner boundary, or records architecture-gap after one source package
- Observed: fresh representative cleared priority_recovery_partition_progress; priority-recovery residual witnesses are 0; first frontier migrated to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage.
- Accuracy: matched-migrated-owner-boundary.
- Evidence: `test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json`; `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json`; `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --markdown`.
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json`
- Expected delta: priority_recovery_partition_progress clears, reduces below three retry_deferred witnesses, migrates owner boundary, or records architecture-gap after one source package
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `rebalancer_handoff`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `diagnostic-classification`
- Required after rerun: activate successor for `startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete` using `test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json`.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. In a theory-loop package, package/sprint/tracker/ledger-only work is not a closure shape; keep classification evidence in the sprint, run representative evidence, and create or activate the next `src/` successor package instead of closing as classification-only.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js
2. src/rebalancer/operation-workflow-owner-ports.js
3. src/control-plane/priority-recovery-dispatch-snapshot.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`, `src/rebalancer/operation-workflow-owner-ports.js`, `src/control-plane/priority-recovery-dispatch-snapshot.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js && npm test -- test/rebalancer/operation-workflow-owner-adapter.test.js test/control-plane/priority-recovery-snapshot.test.js`, `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`, `supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --markdown`
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

- [x] action: freshness-review; owner: workflow_tooling_owner; files-changed: none; validation: Agent Anscombe (019e70a4-6479-7c42-9be0-0bc5fd286a58): npm run work:context PASS; npm run work:package:doctor -- --suggest work/packages/active-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md expected pre-impl findings only; npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md PASS; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress PASS; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --markdown PASS witnesses=3 splitRequired=false; decision: fresh; stale implementation blockers: none; parent revalidated focused proof: yes; outcome: validated.
- [x] action: implementation; status: validated; owner: workflow_tooling_owner; files-changed: src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js,test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js,test/rebalancer/priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js; validation: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js PASS; npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js && npm test -- test/rebalancer/operation-workflow-owner-adapter.test.js test/control-plane/priority-recovery-snapshot.test.js PASS 461 assertions; representative rerun test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json moved priority residuals to 0 and routed active_gate_snapshot_coverage; parent revalidated focused proof: yes; outcome: moved-representative-frontier.
- [x] action: verification-fix; status: validated; owner: workflow_tooling_owner; files-changed: src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js,test/rebalancer/priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js; validation: Verifier Hume confirmed retry progress idempotent: one timer, zero deliveries, progress version [1], retryAttempt [1], one event before/after second snapshot pass; npm test focused PASS; git diff --check PASS; parent revalidated focused proof: yes; outcome: high-issue-fixed.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: `npm run work:repair` PASS; outcome: repaired.

## Commit And Push Ledger

1. Focused package commit: 2cda484cbc616d0c3afacce6eaad0441d961df2a
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
2. regression: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js && npm test -- test/rebalancer/operation-workflow-owner-adapter.test.js test/control-plane/priority-recovery-snapshot.test.js
3. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress
4. supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --markdown
