# Rolling Restart Active Gate Owner Reconcile Wake Scheduling Route

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
    "dominantReason": "owner_reconcile_pending",
    "currentState": "Architecture-gap analysis selected the scheduling owner wake route for active-gate owner_reconcile_pending write_deferred evidence.",
    "nextAction": "Implement the selected scheduling route that turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule.",
    "closed": "2026-05-30"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
      "work/packages/active-20260529-rolling-restart-active-gate-timeout-after-wake-architecture-gap.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
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
    "proof": {
      "commands": [
        "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # focused contract fixture",
        "regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js # affected consumer proof",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage # representative routing evidence",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage"
      ]
    },
    "theoryLedgerRefs": [
      "theory-20260529-rolling-restart-active-gate-owner-reconcile-handoff-scheduling-architecture-gap",
      "theory-20260529-rolling-restart-active-gate-owner-reconcile-pending-architecture-gap",
      "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop"
    ]
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Implement the selected scheduling route that turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule.",
    "sprintGoalDelta": "owner_reconcile_pending gains a bounded owner wake scheduling contract, then fresh representative evidence reduces owner_reconcile_pending, improves snapshot coverage, migrates, greens, or records architecture-gap continuation.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "architectureRoute": {
      "selectedLayer": "scheduling",
      "ledgerRef": "theory-20260529-rolling-restart-active-gate-owner-reconcile-handoff-scheduling-architecture-gap",
      "coupledInvariant": "startup_active_gate_owner / snapshot_coverage must translate owner_reconcile_pending write_deferred evidence into a bounded owner wake scheduling contract instead of another local snapshot timeout/retry patch.",
      "gapAnalysisRef": "work/packages/done-20260529-rolling-restart-active-gate-owner-reconcile-handoff-retry.md"
    },
    "result": "fixed",
    "outcome": "theory-confirmed",
    "successorPackage": "work/packages/active-20260529-rolling-restart-active-gate-timeout-after-wake-architecture-gap.md"
  },
  "theoryLedger": "no ledger update: this package implements the selected scheduling architecture-route ledger ref and records the source proof result, representative reduction, and active successor package in closureSummary.",
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "active_gate_timed_out / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Analyze the fresh active_gate_timed_out post-wake route before any further runtime source promotion."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Architecture-gap analysis selected the scheduling owner wake route for active-gate owner_reconcile_pending write_deferred evidence.",
    "missingTransitionOrObservation": "Implement the selected scheduling route that turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "owner_reconcile_pending gains a bounded owner wake scheduling contract, then fresh representative evidence reduces owner_reconcile_pending, improves snapshot coverage, migrates, greens, or records architecture-gap continuation.",
    "observed": "Focused owner-recovery proof passed and fresh rolling-restart evidence now reports membershipPublicationHandoffOutcomeEnqueued=true with membershipPublicationHandoffOutcomeRetryAfterMs=100; owner_reconcile_pending remains a reason but active_gate_timed_out is the dominant reason.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
  },
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused owner wake scheduling proof passed and fresh rolling-restart evidence moved membershipPublicationHandoffOutcomeEnqueued from false to true with bounded retryAfterMs=100; owner_reconcile_pending is no longer dominant, while active_gate_timed_out is now the first active-gate snapshot-coverage reason.",
    "successorReason": "Rolling-restart is not representative-green yet; the successor analyzes the fresh active_gate_timed_out post-wake route with runtimePromotionGuard blocked instead of opening another adjacent runtime patch.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage architecture-gap analysis",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
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
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "causal-escalation",
    "expectedDelta": "owner_reconcile_pending gained bounded owner wake evidence; fresh representative evidence now routes active_gate_timed_out under startup_active_gate_owner / snapshot_coverage for architecture-gap analysis before any source promotion resumes.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The selected scheduling route turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule inside membership publication active-gate reconcile.",
    "stopConditionCheck": "Run focused owner-recovery scheduling proof, affected handoff regression, topology convergence, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`, and post-rerun route checks before closure.",
    "expectedCausalModelChange": "Local proof exposed a bounded wake scheduling contract for owner_reconcile_pending; representative rerun reduced the unbounded handoff shape and moved the dominant reason to active_gate_timed_out.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh representative evidence remains red at active_gate_snapshot_coverage with active_gate_timed_out, selected_snapshot_source_timeout, snapshot_repair_deferred, snapshot coverage 1/5, membershipPublicationHandoffOutcomeEnqueued=true, retryAfterMs=100, and zero priority-recovery residual witnesses.",
    "crossBoundaryReview": "Limit edits to membership publication active-gate reconcile and its owner-recovery test; do not edit admin diagnostics, startup readiness, benchmark_events visibility, priority recovery, or unrelated runtime files."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage owner_reconcile_pending scheduling route implementation",
    "phaseChain": [
      "Architecture-gap analysis selected scheduling-owner-wake-route after pair-alternation-post-rederive blocked another analysis-only runtime promotion",
      "fresh representative evidence keeps active_gate_snapshot_coverage first with owner_reconcile_pending",
      "topology evidence reports write_deferred owner handoff with enqueued=false and retryAfterMs=0 while progressContract.retryAfterMs=1000",
      "this package owns the bounded membership publication wake scheduling implementation before the next representative rerun"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream of active-gate snapshot coverage",
      "benchmark_events visibility timeout remains downstream while active-gate snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "write_deferred owner_reconcile_pending evidence needs a bounded owner wake scheduling contract.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "falsifyingProbe": "npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "boundedProgressProof": "Focused proof must show owner_reconcile_pending write_deferred evidence schedules a bounded owner wake and preserves affected active-gate handoff behavior.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedObservableTransition": "owner_reconcile_pending gained an explicit bounded owner wake schedule and fresh representative routing recorded reduction to active_gate_timed_out.",
    "maxProgressBound": "one scheduling-route implementation package before representative rerun routing",
    "sameFrontierFallback": "If the route implementation later returns same-frontier with no reduction, redirect again instead of widening this package.",
    "expectedNextFrontier": "active_gate_timed_out architecture-gap analysis, owner-boundary migration, representative-green, or architecture-gap continuation",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes owner_reconcile_pending to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "owner_reconcile_pending is the current selected symptom.",
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
      "The active action is Implement the selected scheduling route that turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule.."
    ],
    "competingTheories": [
      "H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for owner_reconcile_pending.",
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
        "inputSignal": "owner_reconcile_pending",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "selected evidence must become a named owner-owned transition, migration, or stop.",
        "expectedEvidence": "focused proof selects the transition, migrates ownership, or records architecture-gap evidence.",
        "falsifier": "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # focused contract fixture",
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
    "systemTheoryRef": "work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-wake-scheduling-route.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # focused contract fixture proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/control-plane/membership-publication-active-gate-reconcile.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # focused contract fixture",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # focused contract fixture.",
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

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes owner_reconcile_pending there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this theory-loop package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Implement the selected scheduling route that turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule. for owner_reconcile_pending.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route; regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js # affected active-gate handoff regression; supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps owner_reconcile_pending and route evidence to one emitted outcome: Implement the selected scheduling route that turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement the selected scheduling route that turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule. | owner_reconcile_pending gains a bounded owner wake scheduling contract, then fresh representative evidence reduces owner_reconcile_pending, improves snapshot coverage, migrates, greens, or records architecture-gap continuation. | falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route`
- Competing explanations: At minimum compare owner_reconcile_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own owner_reconcile_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: owner_reconcile_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route`
- Success metrics: owner_reconcile_pending gains a bounded owner wake scheduling contract, then fresh representative evidence reduces owner_reconcile_pending, improves snapshot coverage, migrates, greens, or records architecture-gap continuation.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending`
- Redirect rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, redirect to an autonomous architecture/causal experiment or successor package instead of opening another local patch — never a bare stop. Terminate the loop only for a closed Termination Condition; a human-only block maps to blocked-frozen-decision/blocked-external-dependency.

## System Theory

- Problem statement: rolling-restart currently routes owner_reconcile_pending to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
2. owner_reconcile_pending is the current selected symptom.
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
2. The active action is Implement the selected scheduling route that turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule..
- Competing theories:
1. H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for owner_reconcile_pending.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `owner_reconcile_pending`; owner `startup_active_gate_owner / snapshot_coverage`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-wake-scheduling-route.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/control-plane/membership-publication-active-gate-reconcile.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Redirect rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.
3. Falsifiability: high - falsifier is falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Implement the selected scheduling route that turns active-gate owner_reconcile_pending write_deferred evidence into an explicit bounded owner wake schedule.
- Sprint-goal delta: owner_reconcile_pending gains a bounded owner wake scheduling contract, then fresh representative evidence reduces owner_reconcile_pending, improves snapshot coverage, migrates, greens, or records architecture-gap continuation.
- Architecture route (selected layer): `scheduling`
- Architecture route ledger ref: theory-20260529-rolling-restart-active-gate-owner-reconcile-handoff-scheduling-architecture-gap
- Architecture route coupled invariant: startup_active_gate_owner / snapshot_coverage must translate owner_reconcile_pending write_deferred evidence into a bounded owner wake scheduling contract instead of another local snapshot timeout/retry patch.
- Required source write: `src/control-plane/membership-publication-active-gate-reconcile.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: owner_reconcile_pending gains a bounded owner wake scheduling contract, then fresh representative evidence reduces owner_reconcile_pending, improves snapshot coverage, migrates, greens, or records architecture-gap continuation.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: owner_reconcile_pending gains a bounded owner wake scheduling contract, then fresh representative evidence reduces owner_reconcile_pending, improves snapshot coverage, migrates, greens, or records architecture-gap continuation.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `owner_reconcile_pending`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## In Scope

1. src/control-plane/membership-publication-active-gate-reconcile.js
2. test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/membership-publication-active-gate-reconcile.js`, `test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route`, `regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js # affected active-gate handoff regression`, `supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`
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

## Theory Loop Results

- [x] theory: theory-20260529-rolling-restart-active-gate-owner-reconcile-handoff-scheduling-architecture-gap; result: fixed; evidence: Focused owner recovery proof passed and fresh rolling-restart rerun moved membershipPublicationHandoffOutcomeEnqueued to true with bounded retryAfterMs while dominant reason moved from owner_reconcile_pending to active_gate_timed_out.; files: none; validation: none; next: continue theory loop.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: freshness-review; owner: Agent Carver (019e761a-6944-7203-9aa3-d1c4266703ee); files-changed: none; validation: npm run work:context passed; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-wake-scheduling-route.md passed; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage passed; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed; npm run work:theory-ledger -- validate passed; decision: fresh; outcome: validated.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/control-plane/membership-publication-active-gate-reconcile.js, test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js; validation: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js failed before implementation on missing bounded wake schedule then passed 6/6 after implementation; node scripts/check-guideline-literals.js src/control-plane/membership-publication-active-gate-reconcile.js passed; node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-active-gate-reconcile.js passed; npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-active-gate-reconcile.js passed; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js passed 53/53; parent revalidated focused proof: yes; status: passed; outcome: passed - bounded owner wake schedule implemented.
- [x] action: verification-fix; owner: Agent Huygens (019e7620-60ba-7922-9f58-b6b02ea4799c); files-changed: none; validation: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js passed 6/6; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js passed 53/53; parent revalidated focused proof: yes; status: passed; outcome: passed - no scoped fix needed.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:current-blocker passed; status: passed; outcome: generated handoff refreshed without dirty-scope autocomplete.

## Validation

1. falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # owner recovery wake scheduling route
2. regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js # affected active-gate handoff regression
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage

## Commit And Push Ledger

1. Focused package commit: 385f90b424510e4e58a1b239585eeeba61f19851
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: no
