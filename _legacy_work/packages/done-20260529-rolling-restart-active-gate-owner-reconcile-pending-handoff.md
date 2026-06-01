# Rolling Restart Active Gate Owner Reconcile Pending Handoff

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
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "nextAction": "Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun.",
    "closed": "2026-05-29",
    "successor": "work/packages/done-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "test/control-plane/publication-active-gate-handoff-contract.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract-decision.js",
      "src/control-plane/publication-active-gate-handoff-contract-evidence.js",
      "src/admin/admin-control-snapshot-repair-diagnostics.js"
    ],
    "commitScope": [
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "test/control-plane/publication-active-gate-handoff-contract.test.js",
      "work/packages/done-20260528-rolling-restart-priority-recovery-single-residual-handoff.md",
      "work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md",
      "work/packages/done-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md"
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
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
      ]
    }
  },
  "systemTheoryRevision": true,
  "theoryLedger": "planned-new-theory: no ledger update needed because this bounded owner_reconcile_pending handoff proof records its representative movement in closureSummary and hands fresh successor work to the next selected active-gate snapshot-coverage shape.",
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun.",
    "sprintGoalDelta": "active_gate_snapshot_coverage reduces pending owner reconcile evidence for the missing active node, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "migrated",
    "successorPackage": "work/packages/done-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md"
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "active_gate_timed_out / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "missingTransitionOrObservation": "Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "active_gate_snapshot_coverage reduces pending owner reconcile evidence for the missing active node, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "observed": "Representative rerun cleared owner_reconcile_pending; active_gate_snapshot_coverage remained first frontier as snapshot_coverage_incomplete with selected_snapshot_source_timeout and snapshot_repair_deferred.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused owner-reconcile handoff proof passed; fresh rolling-restart representative evidence cleared owner_reconcile_pending and now reports active_gate_snapshot_coverage as snapshot_coverage_incomplete with selected_snapshot_source_timeout and snapshot_repair_deferred.",
    "successorReason": "Rolling-restart is not representative-green yet, so the next theory-loop source package targets the fresh selected snapshot repair-deferred retry shape instead of widening this owner-reconcile package.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
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
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "snapshot_coverage_incomplete",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "active_gate_snapshot_coverage reduces pending owner reconcile evidence for the missing active node, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "After priority recovery is satisfied, the active_gate_snapshot_coverage frontier remains because startup_active_gate_owner / snapshot_coverage has one owner_reconcile_pending missing active node and needs a bounded owner reconcile publication projection.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedCausalModelChange": "Focused active-gate handoff proof should reduce owner_reconcile_pending evidence for the missing active node, increase snapshot coverage, migrate owner boundary, or record architecture-gap after one source package.",
    "representativeOutcome": "migrated",
    "causalDebt": "Current artifact has priority recovery satisfied with zero residual witnesses, but active_gate_snapshot_coverage is blocked with snapshot coverage 2/5 and one pending owner reconcile node.",
    "crossBoundaryReview": "Do not reopen priority recovery or patch startup readiness while active_gate_snapshot_coverage is the selected first frontier."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active gate owner reconcile pending handoff",
    "phaseChain": [
      "priority recovery single residual handoff proof passed locally",
      "current representative evidence reports priority recovery satisfied with zero residual witnesses",
      "scenario-route selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage",
      "active-gate evidence reports one owner_reconcile_pending missing active node with snapshot coverage 2/5"
    ],
    "recentFrontierHistory": [
      "work/packages/done-20260528-rolling-restart-priority-recovery-single-residual-handoff.md migrated after priority-recovery residual witnesses reduced to zero",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout.md previously targeted selected-source timeout before priority recovery reopened"
    ],
    "oscillationCheck": "This package records a systemTheoryRevision because startup_active_gate_owner / snapshot_coverage has repeated active-gate contract-gap history, but the current witness shape is owner_reconcile_pending for one missing active node.",
    "handoffInvariant": "Priority recovery stays closed while active_gate_snapshot_coverage owns the first frontier; startup readiness remains downstream until snapshot coverage improves.",
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness inherits active-gate no-progress while snapshot coverage is incomplete",
      "benchmark_events partition visibility remains downstream while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "owner_reconcile_pending active-gate handoff for the missing active node needs a bounded reconcile publication projection.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "falsifyingProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "boundedProgressProof": "Focused proof must show a concrete reconcile, retry, dispatch, handoff, timeout, advance, wake, or bounded progress mechanism for the pending owner reconcile node.",
    "boundedProgressProofArtifact": "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "expectedObservableTransition": "active_gate_snapshot_coverage reduces pending owner reconcile evidence for the missing active node, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage source package before representative rerun and route recording",
    "sameFrontierFallback": "Unchanged active_gate_snapshot_coverage owner_reconcile_pending evidence after this source package triggers architecture rederive instead of another adjacent local patch.",
    "expectedNextFrontier": "snapshot coverage improves, pending owner reconcile count reduces, owner-boundary migration, representative-green, or architecture-gap",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "startup_active_gate_owner / snapshot_coverage has repeated active-gate contract-gap history.",
      "Current representative evidence selects a new owner_reconcile_pending missing-active-node shape after priority recovery reduced to zero witnesses."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute the bounded owner-reconcile publication projection proof for the current active-gate witness shape.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Open architecture rederive if the focused proof cannot select a bounded owner-owned reconcile transition.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
        ]
      }
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Execute the selected owner-reconcile publication projection proof before another representative rerun."
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "active_gate_timed_out is the current selected symptom.",
      "startup_active_gate_owner / snapshot_coverage is the declared decision boundary for this package."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage: selected package owner and boundary.",
      "Downstream owners remain frozen until the falsifier selects migration."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane remains causal-escalation.",
      "Declared owner boundary remains startup_active_gate_owner / snapshot_coverage."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "The active action is Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun.."
    ],
    "competingTheories": [
      "H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for active_gate_timed_out.",
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
      "Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration."
    ],
    "wholeSystemInvariant": "Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md systemTheory",
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

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes active_gate_timed_out there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun. for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js; regression: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js; supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun. | active_gate_snapshot_coverage reduces pending owner reconcile evidence for the missing active node, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package. | falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`
- Success metrics: active_gate_snapshot_coverage reduces pending owner reconcile evidence for the missing active node, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## System Theory

- Problem statement: rolling-restart currently routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
2. active_gate_timed_out is the current selected symptom.
3. startup_active_gate_owner / snapshot_coverage is the declared decision boundary for this package.
- Owner-boundary map:
1. startup_active_gate_owner / snapshot_coverage: selected package owner and boundary.
2. Downstream owners remain frozen until the falsifier selects migration.
- Stable facts:
1. Scenario remains rolling-restart.
2. Package lane remains causal-escalation.
3. Declared owner boundary remains startup_active_gate_owner / snapshot_coverage.
- Changed facts:
1. This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
2. The active action is Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun..
- Competing theories:
1. H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for active_gate_timed_out.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `active_gate_timed_out`; owner `startup_active_gate_owner / snapshot_coverage`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md systemTheory
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
- Promoted theory: Test whether owner_reconcile_pending active-gate handoff needs a bounded owner reconcile publication projection for the missing active node before another representative rerun.
- Sprint-goal delta: active_gate_snapshot_coverage reduces pending owner reconcile evidence for the missing active node, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.
- Required source write: `src/control-plane/publication-active-gate-handoff-contract-selection.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: active_gate_snapshot_coverage reduces pending owner reconcile evidence for the missing active node, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.
- Observed: Representative rerun cleared owner_reconcile_pending; active_gate_snapshot_coverage remained first frontier as snapshot_coverage_incomplete with selected_snapshot_source_timeout and snapshot_repair_deferred.
- Accuracy: partial
- Evidence: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: active_gate_snapshot_coverage reduces pending owner reconcile evidence for the missing active node, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `snapshot_coverage_incomplete`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
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
- Focused proof: `falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`, `regression: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`, `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
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

- [x] action: freshness-review; owner: Agent Feynman (019e711b-9cb6-7d32-96cc-7f372328c7ad); files-changed: none; validation: npm run work:context PASS; npm run work:package:doctor -- --suggest work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md PASS; npm run work:validate -- --entry work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md PASS; npm run work:validate -- --pre-impl work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md PASS; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json PASS; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json PASS; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage PASS; decision: fresh; outcome: validated.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/control-plane/publication-active-gate-handoff-contract-selection.js, test/control-plane/publication-active-gate-handoff-contract.test.js; validation: node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract-selection.js PASS; git diff --check -- src/control-plane/publication-active-gate-handoff-contract-selection.js test/control-plane/publication-active-gate-handoff-contract.test.js work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md PASS; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js PASS (43/43); npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js PASS (143/143); parent revalidated focused proof: yes; representative rerun moved owner_reconcile_pending evidence to snapshot_coverage_incomplete / selected_snapshot_source_timeout / snapshot_repair_deferred; outcome: validated-partial-movement.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md; validation: npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md PASS; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md PASS; npm run work:validate -- --pre-impl work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md PASS; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js PASS (43/43); npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js PASS (143/143); parent revalidated focused proof: yes; outcome: validated-no-fix-required.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md, work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:repair PASS; parent revalidated focused proof: yes, npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js PASS (43/43); outcome: validated.

## Validation

1. falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js
2. regression: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage

## Commit And Push Ledger

1. Focused package commit: 2cda484cbc616d0c3afacce6eaad0441d961df2a
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
