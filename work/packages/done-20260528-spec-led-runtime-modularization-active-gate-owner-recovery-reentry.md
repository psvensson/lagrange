# Spec-Led Runtime Modularization Active Gate Owner Recovery Reentry

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage_owner_recovery_reentry",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Fresh representative rerun after the rebalancer handoff proof removed priority-recovery residual witnesses, but active-gate snapshot coverage remains blocked by selected-timeout owner recovery in load mode.",
    "nextAction": "Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch.",
    "predecessor": "work/packages/done-20260528-spec-led-runtime-modularization-priority-recovery-rebalancer-handoff.md",
    "successor": "work/packages/done-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "scripts/work-package-schema.js",
      "src/rebalancer/operation-workflow-owner-ports.js",
      "test/rebalancer/priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js",
      "work/packages/done-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md",
      "work/packages/done-20260528-spec-led-runtime-modularization-priority-recovery-rebalancer-handoff.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js"
    ],
    "commitScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "work/packages/active-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "scripts/work-package-schema.js",
      "src/rebalancer/operation-workflow-owner-ports.js",
      "test/rebalancer/priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js",
      "work/packages/done-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md",
      "work/packages/done-20260528-spec-led-runtime-modularization-priority-recovery-rebalancer-handoff.md"
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
        "falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
        "regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown",
        "supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
      ]
    }
  },
  "theoryLedger": "no-ledger-update: not-applicable because this package recorded the promoted theory result and migrated to a planned-new-theory successor instead of updating durable ledger truth.",
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "missed",
    "observedMovement": "Fresh rolling-restart representative rerun stayed red with active_gate_snapshot_coverage still first, snapshotCoverageNodeCount=1/5, attempts=2/8, enqueued=false, and terminal benchmark_events SQL query engine unavailable with authoritativeRepairAttempted=false.",
    "successorReason": "The owner-recovery source theory did not move the representative; the sprint remains active and the next source-code theory targets benchmark table bootstrap SQL-unavailable repair.",
    "nextOwnerBoundary": "startup_readiness_owner / startup_support_evidence",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json"
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch.",
    "sprintGoalDelta": "Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "migrated",
    "successorPackage": "work/packages/done-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md"
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json",
    "frontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete -> startup_readiness_owner / startup_support_evidence",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "readiness_probe_timeout",
    "nextAction": "Migrate the theory loop to the SQL-unavailable benchmark table bootstrap source package."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage_owner_recovery_reentry",
    "toOwner": "startup_readiness_owner",
    "toBoundary": "startup_support_evidence",
    "reason": "Fresh representative rerun after the owner-recovery source patch preserved active-gate snapshot coverage metrics and then terminated at benchmark_events table bootstrap with SQL query engine unavailable and authoritativeRepairAttempted=false.",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json; npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json --owner startup_active_gate_owner --boundary snapshot_coverage_owner_recovery_reentry --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Fresh representative rerun after the rebalancer handoff proof removed priority-recovery residual witnesses, but active-gate snapshot coverage remains blocked by selected-timeout owner recovery in load mode.",
    "missingTransitionOrObservation": "Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry / representative route",
    "predicted": "Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch.",
    "observed": "Fresh representative rerun did not move snapshot coverage or attempts; route-after-rerun selected owner_boundary_migration and the terminal failure exposed benchmark_events SQL query engine unavailable with authoritativeRepairAttempted=false.",
    "accuracy": "missed",
    "evidence": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json --fast-local --verbose",
    "metricDelta": 0
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
    "routeBoundary": "snapshot_coverage_owner_recovery_reentry",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "Fresh representative evidence migrated to startup_readiness_owner / startup_support_evidence after the owner-recovery source patch did not move active-gate snapshot coverage.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage_owner_recovery_reentry --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Load-mode active-gate snapshot coverage terminalizes after selected snapshot timeout even though owner recovery is queued and priority-recovery witnesses are zero, because the owner-recovery path does not re-enter reconcile or bounded coverage progress.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json",
    "expectedCausalModelChange": "Fresh representative evidence selected owner-boundary migration after unchanged active-gate snapshot coverage metrics and a terminal benchmark_events SQL-unavailable bootstrap failure.",
    "representativeOutcome": "migrated",
    "causalDebt": "The owner-recovery source patch did not move active-gate snapshot coverage; fresh evidence now exposes benchmark table bootstrap SQL-unavailable repair debt with authoritativeRepairAttempted=false.",
    "crossBoundaryReview": "Do not reopen rebalancer handoff or generic active-gate timeout budgets from this package; continue in the successor source-code package for startup_readiness_owner / startup_support_evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate owner-recovery reentry",
    "phaseChain": [
      "operation_workflow_owner / rebalancer_handoff focused proof passed",
      "fresh representative rerun removed priority_recovery_partition_progress as first frontier",
      "priority-recovery residual witnesses are zero",
      "active-gate snapshot coverage remained at snapshotCoverageNodeCount=1/5 after the owner-recovery source patch",
      "fresh representative rerun terminated at benchmark_events table visibility with SQL query engine not available and authoritativeRepairAttempted=false"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "benchmark table visibility failed because SQL query engine was unavailable",
      "startup readiness support evidence is now the successor owner boundary",
      "the rolling-restart representative remains red until bounded table bootstrap repair succeeds"
    ],
    "missingCausalEdge": "Benchmark table bootstrap needs bounded SQL-unavailable repair when the create lane cannot reach a ready SQL engine and visibility remains none.",
    "missingCausalEdgeProbe": "node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
    "boundedProgressProof": "The successor proof must show table bootstrap can attempt authoritative repair after bounded SQL-unavailable create evidence instead of terminating with authoritativeRepairAttempted=false.",
    "boundedProgressProofArtifact": "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "expectedObservableTransition": "The next representative rerun either gets rolling-restart green or moves beyond the SQL-unavailable benchmark table bootstrap blocker.",
    "maxProgressBound": "one selected owner-recovery reentry source package before representative rerun and route recording",
    "sameFrontierFallback": "Same-frontier active_gate_snapshot_coverage with no attempt, coverage, or owner-boundary movement opens architecture rederive instead of another local patch.",
    "expectedNextFrontier": "representative-green or bounded table-bootstrap SQL-unavailable repair movement",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "priority-recovery residual witnesses are zero in the fresh representative artifact",
      "scenario-triage flags priority_recovery_zero_witness_conflict while owner recovery remains pending",
      "frontier-history rejects another generic startup_active_gate_owner / snapshot_coverage runtime package"
    ],
    "selectedChoice": "owner-recovery-reentry-discriminator",
    "nextAction": "Run the focused load-mode owner-recovery re-entry proof before runtime implementation.",
    "choices": [
      {
        "id": "owner-recovery-reentry-discriminator",
        "summary": "Promote the selected-timeout owner-recovery re-entry source proof.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
          "npm run work:scenario-triage -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown"
        ]
      },
      {
        "id": "diagnostics-signal-conflict",
        "summary": "Migrate to diagnostics_owner / scenario_triage_signal_conflict if the focused proof cannot choose source work from contradictory evidence.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-triage -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown"
        ]
      }
    ]
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "active_gate_timed_out is the current selected symptom.",
      "startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry is the declared decision boundary for this package."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry: selected package owner and boundary.",
      "Downstream owners remain frozen until the falsifier selects migration."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane remains causal-escalation.",
      "Declared owner boundary remains startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "The active action is Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch.."
    ],
    "competingTheories": [
      "H1 startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry owns the missing transition for active_gate_timed_out.",
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
        "inputSignal": "active_gate_timed_out",
        "owner": "startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry",
        "missingTransition": "selected evidence must become a named owner-owned transition, migration, or stop.",
        "expectedEvidence": "focused proof selects the transition, migrates ownership, or records architecture-gap evidence.",
        "falsifier": "falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
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
    "systemTheoryRef": "work/packages/todo-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/control-plane/membership-publication-active-gate-reconcile.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry.",
      "falsifiability": "high - falsifier is falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js.",
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

This package owns startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry because the selected evidence routes active_gate_timed_out there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry emits Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch. for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js; regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12; supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage_owner_recovery_reentry --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## System Theory

- Problem statement: rolling-restart currently routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
2. active_gate_timed_out is the current selected symptom.
3. startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry is the declared decision boundary for this package.
- Owner-boundary map:
1. startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry: selected package owner and boundary.
2. Downstream owners remain frozen until the falsifier selects migration.
- Stable facts:
1. Scenario remains rolling-restart.
2. Package lane remains causal-escalation.
3. Declared owner boundary remains startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry.
- Changed facts:
1. This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
2. The active action is Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch..
- Competing theories:
1. H1 startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry owns the missing transition for active_gate_timed_out.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `active_gate_timed_out`; owner `startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/todo-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/control-plane/membership-publication-active-gate-reconcile.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Kill rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry.
3. Falsifiability: high - falsifier is falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch.
- Sprint-goal delta: Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch.
- Required source write: `src/control-plane/membership-publication-active-gate-reconcile.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage_owner_recovery_reentry / representative route
- Predicted: Run the promoted load-mode owner-recovery re-entry discriminator, then repair or migrate before another generic snapshot-coverage patch.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage_owner_recovery_reentry`
- Route dominant reason: `active_gate_timed_out`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage_owner_recovery_reentry`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. In a theory-loop package, package/sprint/tracker/ledger-only work is not a closure shape; keep classification evidence in the sprint, run representative evidence, and create or activate the next `src/` successor package instead of closing as classification-only.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/control-plane/membership-publication-active-gate-reconcile.js
2. test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js
3. test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js
4. test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js
5. test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/membership-publication-active-gate-reconcile.js`, `test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`, `test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`, `test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js`, `test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`, `regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown`, `supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`, `supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
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

## Theory Loop Results

- [x] theory: theory-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract; result: migrated; evidence: Fresh representative rerun test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json stayed red: topology remained active_gate_snapshot_coverage under startup_active_gate_owner/snapshot_coverage with snapshotCoverage=1/5 and enqueued=false, while causal outcome selected owner_boundary_migration and the terminal scenario error exposed benchmark_events SQL query engine unavailable with authoritativeRepairAttempted=false.; files: none; validation: none; next: continue theory loop.

## Execution Evidence

theory-ledger: not-needed

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: freshness-review; owner: Agent Jason (019e704c-e41c-7240-a315-5912c8de9b63); files-changed: work/packages/active-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md; validation: npm run work:context PASS; npm run work:package:doctor -- work/packages/active-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md FAIL expected missing checked freshness evidence before this line was recorded; npm run work:package:doctor -- --suggest work/packages/active-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md FAIL expected missing checked freshness evidence before this line was recorded; npm run work:validate -- --entry work/packages/active-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md PASS; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json PASS; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json PASS; npm run work:scenario-triage -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown PASS; npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json PASS; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage PASS; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown PASS; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 PASS; decision: fresh; outcome: validated.
- [x] action: implementation; owner: workflow_tooling_owner; files-changed: src/control-plane/membership-publication-active-gate-reconcile.js,test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js,test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js,test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js,test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js,work/packages/active-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md; validation: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js PASS total=1 pass=1; npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js PASS total=1 pass=1; npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js test/distributed/harness/__tests__/cluster-active-gate-admin-probe-timeout-projection.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js PASS total=21 pass=21; node --check source and touched tests PASS; npm run audit:file-size -- src/control-plane/membership-publication-active-gate-reconcile.js test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js PASS; npm run audit:runtime-grammar:file touched runtime/harness files PASS; npm run audit:guideline:literals touched runtime/harness/test files PASS; npm run audit:guideline:decision-boundaries touched runtime/harness/test files PASS; parent revalidated focused proof: yes; outcome: validated.
- [x] action: implementation; owner: workflow_tooling_owner; files-changed: test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js,test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js,test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js,work/packages/active-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md; validation: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js PASS; npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js test/distributed/harness/__tests__/cluster-active-gate-admin-probe-timeout-projection.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js PASS total=17 pass=17; node --check changed harness files PASS; npm run work:scenario-triage -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown PASS; npm run audit:runtime-grammar:file changed harness owners PASS; npm run audit:guideline:literals changed harness owners PASS; npm run audit:guideline:decision-boundaries changed harness owners PASS; git diff --check PASS; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: work/packages/active-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md; validation: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js PASS total=1 pass=1; npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js test/distributed/harness/__tests__/cluster-active-gate-admin-probe-timeout-projection.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js PASS total=17 pass=17; node --check touched harness files PASS; npm run audit:runtime-grammar:file touched harness files PASS; npm run audit:guideline:literals touched harness files PASS; npm run audit:guideline:decision-boundaries touched harness files PASS; git diff --check touched harness files PASS; npm run work:scenario-triage -- artifact --markdown PASS; npm run work:frontier-history -- owner startup_active_gate_owner boundary snapshot_coverage PASS; npm run analyze:causal-model -- artifact PASS; parent revalidated focused proof: yes; outcome: validated.
- [x] action: source-implementation; owner: workflow_tooling_owner; files-changed: src/control-plane/membership-publication-active-gate-reconcile.js,test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js,test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js,test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js,test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js,work/packages/active-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md; validation: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js PASS total=1 pass=1; npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js PASS total=1 pass=1; npm test -- test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js test/distributed/harness/__tests__/cluster-active-gate-admin-probe-timeout-projection.test.js test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js PASS total=21 pass=21; node --check source and touched tests PASS; npm run audit:file-size -- src/control-plane/membership-publication-active-gate-reconcile.js test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js PASS; npm run audit:runtime-grammar:file touched runtime/harness files PASS; npm run audit:guideline:literals touched runtime/harness/test files PASS; npm run audit:guideline:decision-boundaries touched runtime/harness/test files PASS; outcome: awaiting representative rerun.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json,work/sprints/current-blocker.md,work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:repair PASS; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: 5ab7296703c75780edae36da3e8830ddd5c8bc14
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js
2. regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown
3. supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12
4. supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json
