# Rolling Restart Active Gate Owner Reconcile Handoff Retry

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "superseded",
  "supersededReason": "Alternating-Pair Mutex (R1): superseded by active-20260530-rolling-restart-active-gate-bounded-reentry-model-route-implementation.",
  "intent": {
    "opened": "2026-05-29",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "currentState": "Fresh rolling-restart evidence moved active_gate_timed_out to owner_reconcile_pending; membershipPublicationHandoffOutcome is write_deferred with enqueued=false and retryAfterMs=0 while active-gate progress retryAfterMs is 1000.",
    "nextAction": "Run the owner-reconcile handoff retry/enqueue discriminator, implement only if it stays in membership publication active-gate reconcile, then rerun representative evidence.",
    "predecessor": "work/packages/done-20260529-rolling-restart-active-gate-owner-recovery-retry-floor.md"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract.js",
      "src/control-plane/membership-publication-control-plane-convergence.js"
    ],
    "commitScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
      "work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-handoff-retry.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
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
    "theoryLedgerRefs": [
      "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "theory-20260529-rolling-restart-active-gate-timeout-post-rerun-architecture-gap",
      "theory-20260529-rolling-restart-active-gate-handoff-selection-architecture-experiment",
      "theory-20260529-rolling-restart-active-gate-owner-pending-write-reentry-architecture-experiment"
    ],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
        "regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage",
        "supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Owner-recovery wait handoff write_deferred should preserve a retryable owner wake contract instead of reporting enqueued=false with retryAfterMs=0.",
    "sprintGoalDelta": "Focused proof preserves owner-recovery wake retry/enqueue semantics, then fresh representative evidence reduces owner_reconcile_pending, migrates owner boundary, greens, or records architecture-gap continuation.",
    "sourceChangeRequired": true,
    "successorRequired": true
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "owner_reconcile_pending / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Run the owner-reconcile handoff retry/enqueue discriminator, implement only if it stays in membership publication active-gate reconcile, then rerun representative evidence."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Fresh rolling-restart evidence moved active_gate_timed_out to owner_reconcile_pending; membershipPublicationHandoffOutcome is write_deferred with enqueued=false and retryAfterMs=0 while active-gate progress retryAfterMs is 1000.",
    "missingTransitionOrObservation": "Run the owner-reconcile handoff retry/enqueue discriminator, implement only if it stays in membership publication active-gate reconcile, then rerun representative evidence.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "Focused proof preserves owner-recovery wake retry/enqueue semantics, then fresh representative evidence reduces owner_reconcile_pending, migrates owner boundary, greens, or records architecture-gap continuation.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-representative-rerun"
  },
  "boundedExperiment": {
    "hypothesis": "Owner-recovery wait handoff write_deferred should preserve a retryable owner wake contract instead of reporting enqueued=false with retryAfterMs=0.",
    "hypothesisDiscriminator": "Membership publication owner-recovery proof shows write_deferred owner recovery carries retryAfterMs and wake intent.",
    "expectedMetric": "owner_reconcile_pending evidence reports a retryable owner-recovery handoff instead of retryAfterMs=0 with no enqueue",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused membership reconcile owner-recovery proof plus handoff contract regression",
    "killRule": "If focused proof cannot keep the transition inside membership publication active-gate reconcile, redirect to architecture-gap continuation or owner-boundary migration instead of widening runtime scope."
  },
  "validationTier": "single-owner",
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
    "routeDominantReason": "owner_reconcile_pending",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "causal-escalation",
    "expectedDelta": "Focused proof preserves owner-recovery wake retry/enqueue semantics, then fresh representative evidence reduces owner_reconcile_pending, migrates owner boundary, greens, or records architecture-gap continuation.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Selected snapshot observation retry timing is being reused as owner-recovery handoff retry timing and can downshift the critical owner-recovery wait below the control-plane convergence retry floor.",
    "stopConditionCheck": "Run the focused handoff contract proof, owner-recovery consumer regression, `npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`, scenario-route, frontier-history, and a fresh representative rerun before closure.",
    "expectedCausalModelChange": "Focused proof keeps owner-recovery wait retryAfterMs at the critical convergence floor when selectedSnapshotObservationRetryAfterMs is 100ms; representative evidence should reduce active_gate_timed_out, improve snapshot coverage, migrate, or produce architecture-gap continuation.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh representative evidence still selects active_gate_snapshot_coverage with active_gate_timed_out, selected_snapshot_source_timeout, snapshot_repair_deferred, membershipPublicationHandoffOutcomeEnqueued=true, one pending owner-recovery wait, retryAfterMs=100, zero priority-recovery residual witnesses, and blocked runtime promotion.",
    "crossBoundaryReview": "Do not edit startup readiness, benchmark_events visibility, priority recovery, or membership reconcile in this package; the source scope is the publication active-gate handoff retry contract and its focused fixture."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage owner-recovery retry floor",
    "phaseChain": [
      "pending-write architecture proof closed without a non-repeated source contract",
      "fresh representative evidence returned to active_gate_snapshot_coverage with active_gate_timed_out",
      "topology evidence reports selectedSnapshotObservationRetryAfterMs=100 and membershipPublicationHandoffOutcomeRetryAfterMs=100",
      "control-plane critical convergence defaults owner-recovery retry to 1000ms when no narrower owner retry is selected"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream of active-gate snapshot coverage",
      "benchmark_events visibility timeout remains downstream while active-gate snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "Selected snapshot observation retry must stay observation-local and must not override owner-recovery handoff retry below the critical convergence floor.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "falsifyingProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "boundedProgressProof": "Focused contract proof must show selected snapshot observation retry of 100ms does not reduce owner-recovery handoff retry below the critical convergence floor, while preserving wait_owner_recovery and runtimePromotionAllowed=false.",
    "boundedProgressProofArtifact": "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "expectedObservableTransition": "owner-recovery handoff retryAfterMs is at least 1000ms for selected snapshot timeout repair-deferred retry evidence.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage source package before representative rerun and route recording",
    "sameFrontierFallback": "If fresh evidence remains same-frontier with no metric reduction after this source proof, open architecture continuation or fresh route evidence instead of widening runtime scope.",
    "expectedNextFrontier": "reduced active_gate_timed_out, snapshot coverage improvement, owner-boundary migration, representative-green, or architecture-gap continuation",
    "resultClassification": "pending-before-probe",
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
      "The active action is Run the owner-reconcile handoff retry/enqueue discriminator, implement only if it stays in membership publication active-gate reconcile, then rerun representative evidence.."
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
        "falsifier": "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
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
    "systemTheoryRef": "work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-handoff-retry.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/control-plane/membership-publication-active-gate-reconcile.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js.",
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

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes owner_reconcile_pending there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Run the owner-reconcile handoff retry/enqueue discriminator, implement only if it stays in membership publication active-gate reconcile, then rerun representative evidence. for owner_reconcile_pending.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js; regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage; supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps owner_reconcile_pending and route evidence to one emitted outcome: Run the owner-reconcile handoff retry/enqueue discriminator, implement only if it stays in membership publication active-gate reconcile, then rerun representative evidence..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Run the owner-reconcile handoff retry/enqueue discriminator, implement only if it stays in membership publication active-gate reconcile, then rerun representative evidence. | Focused proof preserves owner-recovery wake retry/enqueue semantics, then fresh representative evidence reduces owner_reconcile_pending, migrates owner boundary, greens, or records architecture-gap continuation. | falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`
- Competing explanations: At minimum compare owner_reconcile_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own owner_reconcile_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: owner_reconcile_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`
- Success metrics: Focused proof preserves owner-recovery wake retry/enqueue semantics, then fresh representative evidence reduces owner_reconcile_pending, migrates owner boundary, greens, or records architecture-gap continuation.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
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
2. The active action is Run the owner-reconcile handoff retry/enqueue discriminator, implement only if it stays in membership publication active-gate reconcile, then rerun representative evidence..
- Competing theories:
1. H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for owner_reconcile_pending.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `owner_reconcile_pending`; owner `startup_active_gate_owner / snapshot_coverage`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-handoff-retry.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/control-plane/membership-publication-active-gate-reconcile.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Redirect rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.
3. Falsifiability: high - falsifier is falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Owner-recovery wait handoff write_deferred should preserve a retryable owner wake contract instead of reporting enqueued=false with retryAfterMs=0.
- Sprint-goal delta: Focused proof preserves owner-recovery wake retry/enqueue semantics, then fresh representative evidence reduces owner_reconcile_pending, migrates owner boundary, greens, or records architecture-gap continuation.
- Required source write: `src/control-plane/membership-publication-active-gate-reconcile.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.


## Bounded Experiment

- Hypothesis: Owner-recovery wait handoff write_deferred should preserve a retryable owner wake contract instead of reporting enqueued=false with retryAfterMs=0.
- Hypothesis discriminator: Membership publication owner-recovery proof shows write_deferred owner recovery carries retryAfterMs and wake intent.
- Expected metric: owner_reconcile_pending evidence reports a retryable owner-recovery handoff instead of retryAfterMs=0 with no enqueue
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `single-owner`
- Merge requirement: focused membership reconcile owner-recovery proof plus handoff contract regression
- Redirect rule: If focused proof cannot keep the transition inside membership publication active-gate reconcile, redirect to architecture-gap continuation or owner-boundary migration instead of widening runtime scope.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: Focused proof preserves owner-recovery wake retry/enqueue semantics, then fresh representative evidence reduces owner_reconcile_pending, migrates owner boundary, greens, or records architecture-gap continuation.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: Focused proof preserves owner-recovery wake retry/enqueue semantics, then fresh representative evidence reduces owner_reconcile_pending, migrates owner boundary, greens, or records architecture-gap continuation.
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
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## In Scope

1. src/control-plane/membership-publication-active-gate-reconcile.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/membership-publication-active-gate-reconcile.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`, `regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js`, `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`, `supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
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

- [ ] action: freshness-review; owner: Agent <name> (<agent-id>); files-changed: none; validation: npm run work:context; npm run work:package:doctor -- --suggest work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-handoff-retry.md; npm run work:validate -- --entry work/packages/todo-20260529-rolling-restart-active-gate-owner-reconcile-handoff-retry.md; decision: fresh; outcome: pending.
- [ ] action: implementation; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: verification-fix; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: verifier reruns focused proof and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: pending.

## Validation

1. falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js
2. regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js
3. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage
4. supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12

