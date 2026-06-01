# Rolling Restart Active Gate Handoff Protocol Route

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
    "dominantReason": "snapshot_coverage_incomplete",
    "currentState": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "nextAction": "Implement the selected architecture route by turning selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and letting topology diagnostics recognize that source contract.",
    "closed": "2026-05-29"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260529-rolling-restart-active-gate-handoff-protocol-route.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "src/diagnostics/topology-convergence-graph.js",
      "test/diagnostics/topology-convergence-active-gate-handoff-route.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/packages/todo-20260529-rolling-restart-active-gate-owner-handoff-write-deferred-reentry.md"
    ],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "src/admin/admin-control-snapshot-publication-handoff.js"
    ],
    "commitScope": [
      "work/packages/active-20260529-rolling-restart-active-gate-handoff-protocol-route.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "src/diagnostics/topology-convergence-graph.js",
      "test/diagnostics/topology-convergence-active-gate-handoff-route.test.js",
      "work/packages/todo-20260529-rolling-restart-active-gate-owner-handoff-write-deferred-reentry.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
  },
  "modelFit": {
    "packageClass": "representative-frontier-closure",
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
      "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
        "regression: npm test -- test/diagnostics/topology-convergence-active-gate-handoff-route.test.js",
        "supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Implement the selected architecture route by turning selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and letting topology diagnostics recognize that source contract.",
    "sprintGoalDelta": "Topology convergence exposes publicationActiveGateHandoff fields for selected-snapshot deferred retry and no longer emits requires_non_repeated_source_contract when the owner handoff contract is present.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "supported",
    "outcome": "theory-confirmed",
    "successorPackage": "work/packages/todo-20260529-rolling-restart-active-gate-owner-handoff-write-deferred-reentry.md",
    "architectureRoute": {
      "selectedLayer": "protocol",
      "ledgerRef": "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "coupledInvariant": "startup_active_gate_owner / snapshot_coverage must advance through a publication active-gate owner handoff contract, not a repeated selected-snapshot retry diagnostic.",
      "gapAnalysisRef": "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-analysis.md"
    }
  },
  "theoryLedger": "no ledger update: the package implements the selected R13 architecture-route ledger ref and records the source proof result here instead of appending a new theory ledger entry.",
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "owner_reconcile_pending / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Run closure proof and route the next theory-loop step from the reduced active-gate owner handoff contract evidence."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "missingTransitionOrObservation": "Implement the selected architecture route by turning selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and letting topology diagnostics recognize that source contract.",
    "smallestFalsifyingProbe": "falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "Topology convergence exposes publicationActiveGateHandoff fields for selected-snapshot deferred retry and no longer emits requires_non_repeated_source_contract when the owner handoff contract is present.",
    "observed": "Focused topology proof now exposes publicationActiveGateHandoffNextAction=wait_owner_recovery, publicationActiveGateHandoffPendingRecoveryCount=1, the selected node id as pending recovery evidence, selectedControlPlaneOwnerQueuePendingWrites=1, and no runtimePromotionGuard field on active_gate_snapshot_coverage.",
    "accuracy": "partial",
    "evidence": "npm test -- test/diagnostics/topology-convergence-active-gate-handoff-route.test.js; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js; node scripts/check-guideline-decision-boundaries.js src/diagnostics/topology-convergence-graph.js; npm run audit:runtime-grammar:file -- src/diagnostics/topology-convergence-graph.js; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12"
  },
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused topology proof passed and the canonical active_gate_snapshot_coverage explain now promotes selected-snapshot deferred retry into publicationActiveGateHandoff wait_owner_recovery pending recovery evidence while omitting the requires_non_repeated_source_contract runtimePromotionGuard.",
    "successorReason": "Rolling-restart is not representative-green yet; after closure the sprint must route the reduced active-gate owner handoff contract evidence instead of reopening another repeated selected-snapshot retry diagnostic.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "boundedExperiment": {
    "hypothesis": "Selected-snapshot deferred retry is already the input to the publication active-gate owner handoff contract, but topology convergence was reading it as a repeated local retry because the diagnostics graph did not synthesize the owner handoff contract from active-gate progress.",
    "hypothesisDiscriminator": "If H1 is right, the focused topology explain gains publicationActiveGateHandoff wait_owner_recovery pending recovery evidence and loses runtimePromotionGuard; if H2 is right, topology still reports requires_non_repeated_source_contract or no handoff contract.",
    "expectedMetric": "active_gate_snapshot_coverage source includes publicationActiveGateHandoffNextAction=wait_owner_recovery, pending recovery count 1, selected node id pending recovery evidence, and no runtimePromotionGuard.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "release-gate",
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
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "causal-escalation",
    "expectedDelta": "Topology convergence exposes publicationActiveGateHandoff fields for selected-snapshot deferred retry and no longer emits requires_non_repeated_source_contract when the owner handoff contract is present.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The active_gate_snapshot_coverage frontier persists because topology diagnostics see selected-snapshot deferred retry evidence but do not promote it into the publication active-gate owner handoff protocol that already owns consumer promotion.",
    "stopConditionCheck": "Run `npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`, topology convergence explain for active_gate_snapshot_coverage, and frontier-history for startup_active_gate_owner / snapshot_coverage after the source change.",
    "expectedCausalModelChange": "Topology evidence should still identify startup_active_gate_owner / snapshot_coverage as the frontier, but the source snapshot must expose publicationActiveGateHandoff pending recovery fields and omit the requires_non_repeated_source_contract guard once the owner contract is present.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh evidence has zero priority-recovery residual witnesses; focused topology proof now exposes owner_reconcile_pending handoff evidence for the selected snapshot retry while rolling-restart still needs successor routing before representative green.",
    "crossBoundaryReview": "Do not patch startup readiness, benchmark visibility, membership publication writes, or priority recovery in this package; the source route is limited to topology convergence recognizing the publication active-gate handoff protocol."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage topology convergence explain",
    "phaseChain": [
      "priority_recovery_partition_progress has zero residual witnesses",
      "active_gate_snapshot_coverage remains the first frontier with selected_snapshot_source_timeout plus snapshot_repair_deferred",
      "R13 requires the selected architecture route implementation before another rederive or architecture analysis on this pair"
    ],
    "recentFrontierHistory": [
      "frontier-history reports same-mechanism-repeat contract_gap on startup_active_gate_owner / snapshot_coverage",
      "the latest closed architecture-gap analysis selected architecture-gap-stop and supplied the R13 ledger ref",
      "architectureRouteState is implement-pending until a source-changing package with theoryLoop.architectureRoute closes"
    ],
    "oscillationCheck": "Repeated active-gate contract_gap packages and rederive/checkpoint analysis keep the pair in R13 implement-pending state.",
    "handoffInvariant": "Selected-snapshot deferred retry must be represented as an owner handoff protocol before diagnostics may treat it as a repeated local retry with no source contract.",
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream",
      "benchmark_events SQL visibility remains downstream"
    ],
    "missingCausalEdge": "selected-snapshot deferred retry must become a publication active-gate owner handoff source contract in topology convergence evidence",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
    "falsifyingProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused topology test must prove a selected-snapshot deferred retry synthesizes publicationActiveGateHandoff pending recovery evidence and suppresses the non-repeated-source-contract guard only when that owner handoff contract is present.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedObservableTransition": "topology-convergence explain reports publicationActiveGateHandoffNextAction=wait_owner_recovery and no runtimePromotionGuard for the selected-snapshot deferred retry owner contract",
    "maxProgressBound": "one protocol route source change before representative rerun",
    "sameFrontierFallback": "If topology still reports the same guard or no handoff contract, record theory-falsified and continue the non-halting sprint with fresh route evidence.",
    "expectedNextFrontier": "same active-gate frontier with owner handoff contract, migrated frontier, or representative green",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes snapshot_coverage_incomplete to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
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
      "Declared owner boundary remains startup_active_gate_owner / snapshot_coverage."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "The active action is Implement the selected architecture route by turning selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and letting topology diagnostics recognize that source contract.."
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
        "falsifier": "falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
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
    "systemTheoryRef": "work/packages/active-20260529-rolling-restart-active-gate-handoff-protocol-route.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/diagnostics/topology-convergence-graph.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage.",
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

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Implement the selected architecture route by turning selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and letting topology diagnostics recognize that source contract. for snapshot_coverage_incomplete.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; regression: npm test -- test/diagnostics/topology-convergence-active-gate-handoff-route.test.js; supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps snapshot_coverage_incomplete and route evidence to one emitted outcome: Implement the selected architecture route by turning selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and letting topology diagnostics recognize that source contract..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement the selected architecture route by turning selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and letting topology diagnostics recognize that source contract. | Topology convergence exposes publicationActiveGateHandoff fields for selected-snapshot deferred retry and no longer emits requires_non_repeated_source_contract when the owner handoff contract is present. | falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`
- Competing explanations: At minimum compare snapshot_coverage_incomplete against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own snapshot_coverage_incomplete, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: snapshot_coverage_incomplete is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`
- Success metrics: Topology convergence exposes publicationActiveGateHandoff fields for selected-snapshot deferred retry and no longer emits requires_non_repeated_source_contract when the owner handoff contract is present.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete`
- Redirect rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, redirect to an autonomous architecture/causal experiment or successor package instead of opening another local patch — never a bare stop. Terminate the loop only for a closed Termination Condition; a human-only block maps to blocked-frozen-decision/blocked-external-dependency.

## System Theory

- Problem statement: rolling-restart currently routes snapshot_coverage_incomplete to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
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
1. This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
2. The active action is Implement the selected architecture route by turning selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and letting topology diagnostics recognize that source contract..
- Competing theories:
1. H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for snapshot_coverage_incomplete.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `snapshot_coverage_incomplete`; owner `startup_active_gate_owner / snapshot_coverage`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/todo-20260529-rolling-restart-active-gate-handoff-protocol-route.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/diagnostics/topology-convergence-graph.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Redirect rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.
3. Falsifiability: high - falsifier is falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Implement the selected architecture route by turning selected-snapshot deferred retry evidence into a publication active-gate owner handoff contract and letting topology diagnostics recognize that source contract.
- Sprint-goal delta: Topology convergence exposes publicationActiveGateHandoff fields for selected-snapshot deferred retry and no longer emits requires_non_repeated_source_contract when the owner handoff contract is present.
- Architecture route (selected layer): `protocol`
- Architecture route ledger ref: theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop
- Architecture route coupled invariant: startup_active_gate_owner / snapshot_coverage must advance through a publication active-gate owner handoff contract, not a repeated selected-snapshot retry diagnostic.
- Required source write: `src/diagnostics/topology-convergence-graph.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.


## Bounded Experiment

- Hypothesis: Selected-snapshot deferred retry is already the input to the publication active-gate owner handoff contract, but topology convergence was reading it as a repeated local retry because the diagnostics graph did not synthesize the owner handoff contract from active-gate progress.
- Hypothesis discriminator: If H1 is right, the focused topology explain gains publicationActiveGateHandoff wait_owner_recovery pending recovery evidence and loses runtimePromotionGuard; if H2 is right, topology still reports requires_non_repeated_source_contract or no handoff contract.
- Expected metric: active_gate_snapshot_coverage source includes publicationActiveGateHandoffNextAction=wait_owner_recovery, pending recovery count 1, selected node id pending recovery evidence, and no runtimePromotionGuard.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `release-gate`
- Merge requirement: focused test plus canonical route or evidence command
- Redirect rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: Topology convergence exposes publicationActiveGateHandoff fields for selected-snapshot deferred retry and no longer emits requires_non_repeated_source_contract when the owner handoff contract is present.
- Observed: Focused topology proof now exposes publicationActiveGateHandoffNextAction=wait_owner_recovery, publicationActiveGateHandoffPendingRecoveryCount=1, the selected node id as pending recovery evidence, selectedControlPlaneOwnerQueuePendingWrites=1, and no runtimePromotionGuard field on active_gate_snapshot_coverage.
- Accuracy: partial
- Evidence: `npm test -- test/diagnostics/topology-convergence-active-gate-handoff-route.test.js`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`; `node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js`; `node scripts/check-guideline-decision-boundaries.js src/diagnostics/topology-convergence-graph.js`; `npm run audit:runtime-grammar:file -- src/diagnostics/topology-convergence-graph.js`; `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: Topology convergence exposes publicationActiveGateHandoff fields for selected-snapshot deferred retry and no longer emits requires_non_repeated_source_contract when the owner handoff contract is present.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `snapshot_coverage_incomplete`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## In Scope

1. src/diagnostics/topology-convergence-graph.js
2. test/diagnostics/topology-convergence-active-gate-handoff-route.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/diagnostics/topology-convergence-graph.js`, `test/diagnostics/topology-convergence-active-gate-handoff-route.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`, `regression: npm test -- test/diagnostics/topology-convergence-active-gate-handoff-route.test.js`, `supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
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

- [x] action: freshness-review; owner: Agent Kierkegaard (019e73e0-33de-7fa3-82d4-5ba46296a64f); files-changed: none; validation: npm run work:context passed; npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-handoff-protocol-route.md failed only on expected missing checked evidence and reported no route drift; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-handoff-protocol-route.md passed; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage passed; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed with architectureRouteState implement-pending; decision: fresh; outcome: validated.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/diagnostics/topology-convergence-graph.js, test/diagnostics/topology-convergence-active-gate-handoff-route.test.js, work/packages/active-20260529-rolling-restart-active-gate-handoff-protocol-route.md; validation: npm test -- test/diagnostics/topology-convergence-active-gate-handoff-route.test.js passed; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage passed with publicationActiveGateHandoffNextAction=wait_owner_recovery, pendingRecoveryCount=1, pendingRecoveryNodeIds=7493b0ab-a054-5fad-a91b-5e331db29304, and no runtimePromotionGuard; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed with architectureRouteState implement-pending before closure; node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js passed; node scripts/check-guideline-decision-boundaries.js src/diagnostics/topology-convergence-graph.js passed; npm run audit:runtime-grammar:file -- src/diagnostics/topology-convergence-graph.js passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: Agent Hypatia (019e73e9-2390-7a13-b784-43be04f32528); files-changed: none; validation: npm test -- test/diagnostics/topology-convergence-active-gate-handoff-route.test.js passed; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage passed; node scripts/check-guideline-literals.js src/diagnostics/topology-convergence-graph.js passed; node scripts/check-guideline-decision-boundaries.js src/diagnostics/topology-convergence-graph.js passed; npm run audit:runtime-grammar:file -- src/diagnostics/topology-convergence-graph.js passed; git diff --check -- work/packages/active-20260529-rolling-restart-active-gate-handoff-protocol-route.md work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/sprints/current-blocker.json work/sprints/current-blocker.md src/diagnostics/topology-convergence-graph.js test/diagnostics/topology-convergence-active-gate-handoff-route.test.js passed; parent revalidated focused proof: yes; decision: verified; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:repair passed and refreshed current-blocker plus sprint edge card after successor creation; outcome: validated.

## Validation

1. falsifier: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage
2. regression: npm test -- test/diagnostics/topology-convergence-active-gate-handoff-route.test.js
3. supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12

## Commit And Push Ledger

1. Focused package commit: 77ff91570cd4385c9a1b49edeaa5fe917da3eee4
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-29T13:38:52.517Z