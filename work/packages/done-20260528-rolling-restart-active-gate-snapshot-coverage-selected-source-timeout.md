# Rolling Restart Active Gate Snapshot Coverage Selected Source Timeout

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "currentState": "Fresh representative evidence after retry-deferred handoff has zero priority-recovery residual witnesses, but active_gate_snapshot_coverage is deferred with snapshot coverage 1/5, selected_snapshot_source_timeout after 100ms, and selected snapshot repair deferred_refresh.",
    "nextAction": "Test the selected snapshot source timeout handoff projection in the publication active-gate handoff contract before another representative rerun.",
    "predecessor": "work/packages/done-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md",
    "successor": "work/packages/done-20260528-rolling-restart-priority-recovery-single-residual-handoff.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "test/control-plane/publication-active-gate-handoff-contract.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json",
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract-decision.js",
      "src/control-plane/publication-active-gate-handoff-contract-evidence.js",
      "src/admin/admin-control-snapshot-repair-diagnostics.js"
    ],
    "commitScope": [
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "test/control-plane/publication-active-gate-handoff-contract.test.js",
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md",
      "work/packages/done-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md"
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
        "falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
        "regression: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --explain active_gate_snapshot_coverage",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
      ]
    }
  },
  "systemTheoryRevision": true,
  "theoryLedger": "planned-new-theory: no ledger update needed because this bounded selected_snapshot_source_timeout handoff proof records its representative movement in closureSummary and hands fresh successor work to the next selected owner boundary.",
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Test the selected snapshot source timeout handoff projection in the publication active-gate handoff contract before another representative rerun.",
    "sprintGoalDelta": "active_gate_snapshot_coverage clears, reduces selected snapshot timeout/deferred-refresh evidence, migrates owner boundary, or records architecture-gap after one source package",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "migrated",
    "successorPackage": "work/packages/done-20260528-rolling-restart-priority-recovery-single-residual-handoff.md"
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Activate the single-residual priority recovery successor before another representative rerun."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Fresh representative evidence after retry-deferred handoff has zero priority-recovery residual witnesses, but active_gate_snapshot_coverage is deferred with snapshot coverage 1/5, selected_snapshot_source_timeout after 100ms, and selected snapshot repair deferred_refresh.",
    "missingTransitionOrObservation": "Test the selected snapshot source timeout handoff projection in the publication active-gate handoff contract before another representative rerun.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "active_gate_snapshot_coverage clears, reduces selected snapshot timeout/deferred-refresh evidence, migrates owner boundary, or records architecture-gap after one source package",
    "observed": "Focused selected-source timeout proof passed, but fresh representative evidence stayed red and migrated first frontier to priority_recovery_partition_progress with one recovering_in_flight control_plane_publications-p1 witness under operation_workflow_owner / rebalancer_handoff.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown"
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused selected-source timeout handoff proof passed; fresh rolling-restart representative evidence stayed red and migrated the first frontier back to priority_recovery_partition_progress under operation_workflow_owner / rebalancer_handoff with one recovering_in_flight control_plane_publications-p1 witness.",
    "successorReason": "Rolling-restart is not representative-green yet, so the next theory-loop source package targets the fresh single priority-recovery residual instead of widening this active-gate package.",
    "nextOwnerBoundary": "operation_workflow_owner / rebalancer_handoff",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
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
    "expectedDelta": "priority_recovery_partition_progress clears, the single residual witness reduces to zero, migrates owner boundary, or records architecture-gap after one source package",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "After priority-recovery residuals clear, selected_snapshot_source_timeout plus deferred_refresh must project bounded selected-source owner recovery; if fresh representative evidence reopens priority_recovery_partition_progress, this package must migrate instead of widening the active-gate slice.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedCausalModelChange": "Fresh representative evidence either clears active_gate_snapshot_coverage, reduces selected-source timeout evidence, migrates owner boundary, or records architecture-gap after this source package.",
    "representativeOutcome": "migrated",
    "causalDebt": "Focused selected-source timeout proof passed locally, but fresh representative evidence stayed red and selected priority_recovery_partition_progress with one recovering_in_flight control_plane_publications-p1 witness; active_gate_snapshot_coverage remains deferred as the next expected frontier.",
    "crossBoundaryReview": "The fresh representative first frontier is operation_workflow_owner / rebalancer_handoff, so the successor package must target the single priority recovery residual instead of widening this active-gate source slice."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active gate selected snapshot source timeout",
    "phaseChain": [
      "table-bootstrap SQL-unavailable focused proof moved authoritativeRepairAttempted from false to true",
      "retry_deferred priority-recovery handoff proof reduced priority residual witnesses from 3 to 0",
      "focused selected-source timeout handoff proof passed locally",
      "fresh representative rolling-restart stayed red and migrated first frontier back to priority_recovery_partition_progress with one recovering_in_flight control_plane_publications-p1 witness"
    ],
    "recentFrontierHistory": [
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md stayed same-frontier on startup_active_gate_owner / snapshot_coverage",
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v6.md closed architecture-gap for the older active_gate_timed_out artifact",
      "work/packages/done-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md migrated from operation_workflow_owner / rebalancer_handoff after priority residuals reached 0"
    ],
    "oscillationCheck": "System-theory revision is required and recorded because frontier history shows repeated contract_gap on startup_active_gate_owner / snapshot_coverage; this package may not proceed as another local patch unless the revised theory selects the selected-source timeout handoff contract.",
    "handoffInvariant": "Publication ACK stays closed; selected-source timeout work proved a bounded local projection, but fresh priority recovery evidence must be handled before downstream active-gate or startup readiness symptoms.",
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage remains deferred as the next expected frontier after priority progress closes",
      "startup readiness remains downstream of active_gate_snapshot_coverage",
      "terminal benchmark_events partition visibility remains downstream while priority recovery and snapshot coverage are incomplete"
    ],
    "missingCausalEdge": "selected snapshot source timeout with deferred_refresh needs a bounded publication active-gate handoff projection or owner migration before another representative timeout.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "falsifyingProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "boundedProgressProof": "Focused proof showed selected snapshot timeout evidence becomes wait_owner_recovery locally; fresh representative evidence selected owner-boundary migration to the single priority recovery residual.",
    "boundedProgressProofArtifact": "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "expectedObservableTransition": "active_gate_snapshot_coverage clears, reduces selected snapshot timeout/deferred-refresh evidence, migrates owner boundary, or records architecture-gap after one source package.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage selected-source-timeout source package before representative rerun and route recording",
    "sameFrontierFallback": "Unchanged same-frontier selected_snapshot_source_timeout and deferred_refresh evidence triggers architecture rederive instead of another adjacent local patch.",
    "expectedNextFrontier": "priority_recovery_partition_progress clears, the single residual witness reduces to zero, owner-boundary migration, representative-green, or architecture-gap",
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
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "rebalancer_handoff",
    "reason": "The focused selected-source timeout contract proof passed, but fresh representative evidence stayed red and selected priority_recovery_partition_progress with one recovering_in_flight control_plane_publications-p1 witness.",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown"
  },
  "systemTheory": {
    "problemStatement": "Frontier history on startup_active_gate_owner / snapshot_coverage shows repeated contract_gap results; this package records the system-theory revision and narrows implementation to selected snapshot source timeout handoff projection only if the focused proof keeps that slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json.",
      "snapshot_coverage_incomplete is the current selected symptom.",
      "startup_active_gate_owner / snapshot_coverage is the declared decision boundary for this package."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage: selected package owner and boundary.",
      "Downstream owners remain frozen until the falsifier selects migration."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane remains causal-escalation.",
      "Declared owner boundary remains startup_active_gate_owner / snapshot_coverage.",
      "Recent mechanisms repeatedly include contract_gap on startup_active_gate_owner / snapshot_coverage.",
      "Priority recovery residual witnesses are zero in the fresh artifact."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json.",
      "The active action is Test the selected snapshot source timeout handoff projection in the publication active-gate handoff contract before another representative rerun.."
    ],
    "competingTheories": [
      "H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for snapshot_coverage_incomplete.",
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
        "inputSignal": "snapshot_coverage_incomplete",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "selected evidence must become a named owner-owned transition, migration, or stop.",
        "expectedEvidence": "focused proof selects the transition, migrates ownership, or records architecture-gap evidence.",
        "falsifier": "falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
        "migrationTrigger": "the falsifier names a different owner boundary or proves this boundary cannot own the transition."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when focused evidence names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.",
      "Stop as architecture-gap if selected_snapshot_source_timeout remains same-frontier with no reduced deferred_refresh evidence after this source package."
    ],
    "wholeSystemInvariant": "Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route; repeated startup_active_gate_owner / snapshot_coverage contract_gap evidence requires this systemTheoryRevision before implementation; priority recovery and publication ACK stay satisfied while selected snapshot timeout remains coupled to active_gate_snapshot_coverage and downstream startup readiness."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/control-plane/publication-active-gate-handoff-contract-selection.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js.",
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

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes snapshot_coverage_incomplete there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Test the selected snapshot source timeout handoff projection in the publication active-gate handoff contract before another representative rerun. for snapshot_coverage_incomplete.
- Inputs/signals: test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json; falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js; regression: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js; supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --explain active_gate_snapshot_coverage; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps snapshot_coverage_incomplete and route evidence to one emitted outcome: Test the selected snapshot source timeout handoff projection in the publication active-gate handoff contract before another representative rerun..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Test the selected snapshot source timeout handoff projection in the publication active-gate handoff contract before another representative rerun. | active_gate_snapshot_coverage clears, reduces selected snapshot timeout/deferred-refresh evidence, migrates owner boundary, or records architecture-gap after one source package | falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`
- Competing explanations: At minimum compare snapshot_coverage_incomplete against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own snapshot_coverage_incomplete, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: snapshot_coverage_incomplete is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`
- Success metrics: active_gate_snapshot_coverage clears, reduces selected snapshot timeout/deferred-refresh evidence, migrates owner boundary, or records architecture-gap after one source package; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## System Theory

- Problem statement: rolling-restart currently routes snapshot_coverage_incomplete to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json.
2. snapshot_coverage_incomplete is the current selected symptom.
3. startup_active_gate_owner / snapshot_coverage is the declared decision boundary for this package.
- Owner-boundary map:
1. startup_active_gate_owner / snapshot_coverage: selected package owner and boundary.
2. Downstream owners remain frozen until the falsifier selects migration.
- Stable facts:
1. Scenario remains rolling-restart.
2. Package lane remains causal-escalation.
3. Declared owner boundary remains startup_active_gate_owner / snapshot_coverage.
- Changed facts:
1. This package was opened from test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json.
2. The active action is Test the selected snapshot source timeout handoff projection in the publication active-gate handoff contract before another representative rerun..
- Competing theories:
1. H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for snapshot_coverage_incomplete.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `snapshot_coverage_incomplete`; owner `startup_active_gate_owner / snapshot_coverage`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/control-plane/publication-active-gate-handoff-contract-selection.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Kill rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.
3. Falsifiability: high - falsifier is falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Test the selected snapshot source timeout handoff projection in the publication active-gate handoff contract before another representative rerun.
- Sprint-goal delta: active_gate_snapshot_coverage clears, reduces selected snapshot timeout/deferred-refresh evidence, migrates owner boundary, or records architecture-gap after one source package
- Required source write: `src/control-plane/publication-active-gate-handoff-contract-selection.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: active_gate_snapshot_coverage clears, reduces selected snapshot timeout/deferred-refresh evidence, migrates owner boundary, or records architecture-gap after one source package
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json`
- Expected delta: active_gate_snapshot_coverage clears, reduces selected snapshot timeout/deferred-refresh evidence, migrates owner boundary, or records architecture-gap after one source package
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `snapshot_coverage_incomplete`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. In a theory-loop package, package/sprint/tracker/ledger-only work is not a closure shape; keep classification evidence in the sprint, run representative evidence, and create or activate the next `src/` successor package instead of closing as classification-only.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/control-plane/publication-active-gate-handoff-contract-selection.js
2. test/control-plane/publication-active-gate-handoff-contract.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-active-gate-handoff-contract-selection.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`, `regression: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --explain active_gate_snapshot_coverage`, `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage`
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

- [x] action: freshness-review; owner: Agent Faraday (019e70db-bccf-7711-989e-04bee6c32ac9); files-changed: none; validation: npm run work:context PASS; npm run work:package:doctor -- --suggest work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md initially selected systemTheoryRevision blockers, then after update only required this freshness evidence record; npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md PASS; decision: fresh; stale implementation blockers: none; outcome: validated.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/control-plane/publication-active-gate-handoff-contract-selection.js, test/control-plane/publication-active-gate-handoff-contract.test.js; validation: node --check src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; node --check test/control-plane/publication-active-gate-handoff-contract.test.js PASS; falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js PASS 39/39; regression: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js PASS 139/139; node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --explain active_gate_snapshot_coverage PASS; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage PASS; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: Agent Tesla (019e70e4-1111-7523-8194-45cb86cdf45b); files-changed: none; validation: npm run work:context PASS; node --check src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; node --check test/control-plane/publication-active-gate-handoff-contract.test.js PASS; node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; git diff --check -- src/control-plane/publication-active-gate-handoff-contract-selection.js test/control-plane/publication-active-gate-handoff-contract.test.js PASS; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js PASS 39/39; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js PASS 139/139; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:repair PASS; outcome: validated.

## Validation

1. falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js
2. regression: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --explain active_gate_snapshot_coverage
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-retry-deferred-handoff.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage

## Commit And Push Ledger

1. Focused package commit: 2cda484cbc616d0c3afacce6eaad0441d961df2a
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
