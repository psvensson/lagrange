# Rolling Restart Active Gate Owner Recovery Reentry Drain

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
    "currentState": "Freshness review rejected the package as a plain runtime-owner-boundary slice; this package now implements the selected R13 protocol architecture route for the remaining owner-recovery write_deferred evidence.",
    "nextAction": "Implement the bounded owner-recovery wait reentry/drain as the selected protocol-layer architecture route for membershipPublicationHandoffOutcome write_deferred evidence.",
    "closed": "2026-05-29"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/admin/admin-control-snapshot-class-part-6.js",
      "src/admin/admin-control-snapshot-publication-handoff.js",
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "src/control-plane/publication-active-gate-handoff-contract.js",
      "src/control-plane/snapshot-service.js",
      "src/control-plane/owner-queue.js"
    ],
    "commitScope": [
      "work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md",
      "work/packages/todo-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/packages/todo-20260529-rolling-restart-active-gate-timeout-retry-contract.md",
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The sprint is in architecture-route implement-pending state for startup_active_gate_owner / snapshot_coverage; this package is the bounded source implementation of that selected protocol route, not another unguided local slice.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "architecture-route-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants"
    ],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js # focused contract fixture",
        "regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js # affected consumer proof",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "The remaining owner_reconcile_pending witness is a concrete owner-recovery wait reentry/drain source gap in membership-publication active-gate reconcile.",
    "sprintGoalDelta": "membershipPublicationHandoffOutcome write_deferred reentry either drains/enqueues the selected owner-recovery wait, reduces pending owner recovery or owner queue evidence, migrates owner boundary, or records architecture-gap after one source package.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "supported",
    "outcome": "theory-confirmed",
    "successorPackage": "work/packages/todo-20260529-rolling-restart-active-gate-timeout-retry-contract.md",
    "architectureRoute": {
      "selectedLayer": "protocol",
      "ledgerRef": "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "coupledInvariant": "startup_active_gate_owner / snapshot_coverage must advance owner-recovery wait evidence through the publication active-gate membership handoff protocol, not another repeated selected-snapshot retry diagnostic.",
      "gapAnalysisRef": "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-analysis.md"
    }
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "active_gate_timed_out / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Implement the bounded active-gate timeout retry contract now that owner-recovery wait reentry is enqueued."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "missingTransitionOrObservation": "Implement the bounded owner-recovery wait reentry/drain source package for membershipPublicationHandoffOutcome write_deferred evidence.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "membershipPublicationHandoffOutcome write_deferred reentry either drains/enqueues the selected owner-recovery wait, reduces pending owner recovery or owner queue evidence, migrates owner boundary, or records architecture-gap after one source package.",
    "observed": "Focused proof makes owner-recovery wait reentry enqueue on queue pressure; the fresh rolling-restart artifact reports membershipPublicationHandoffOutcomeEnqueued=true and routes the next dominant reason to active_gate_timed_out.",
    "accuracy": "partial",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage"
  },
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "partial",
    "observedMovement": "Fresh rolling-restart evidence after the source change reports membershipPublicationHandoffOutcomeEnqueued=true; owner_reconcile_pending is no longer the dominant route reason, while the first frontier remains active_gate_snapshot_coverage with active_gate_timed_out and snapshot coverage 1/5.",
    "successorReason": "Rolling-restart is not representative-green yet; the next theory-loop package targets the fresh active_gate_timed_out publication active-gate timeout/retry contract instead of widening owner-recovery reentry.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "boundedExperiment": {
    "hypothesis": "The remaining owner_reconcile_pending witness is a concrete owner-recovery wait reentry/drain source gap in membership-publication active-gate reconcile.",
    "hypothesisDiscriminator": "If true, focused reconcile proof can expose drained or queued reentry for wait_owner_recovery; if false, route evidence stays write_deferred/enqueued=false with no source-owned transition and must route to architecture-gap.",
    "expectedMetric": "membershipPublicationHandoffOutcomeEnqueued, selectedControlPlaneOwnerQueuePendingWrites, publicationActiveGateHandoffPendingRecoveryCount, and scenario-route owner/boundary",
    "inheritsFrom": "work/packages/done-20260529-rolling-restart-active-gate-handoff-protocol-route.md",
    "timebox": "24h",
    "mergeRequirement": "focused owner-recovery reentry proof plus topology and scenario route evidence",
    "killRule": "unchanged owner_reconcile_pending write_deferred/enqueued=false after this source package opens architecture-gap instead of another same-frontier runtime patch"
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
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "active_gate_timed_out moves to bounded retry progress, reduced snapshot timeout evidence, migration, representative-green, or architecture-gap after one source package.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "theoryLedger": "no ledger update: this package implements the selected R13 architecture-route ledger ref and records the source proof result plus fresh successor route in this package closure.",
  "causalGovernance": {
    "hypothesis": "The remaining owner_reconcile_pending witness is no longer a generic local active-gate retry; it is the next source implementation of the selected protocol-layer architecture route, where membership publication reconcile must drain or enqueue wait_owner_recovery reentry.",
    "stopConditionCheck": "Run `npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` after focused source proof to confirm whether the first frontier reduced, migrated, or stayed on startup_active_gate_owner / snapshot_coverage.",
    "expectedCausalModelChange": "Focused proof should expose owner-recovery wait reentry progress: membershipPublicationHandoffOutcomeEnqueued true or reduced pending owner-recovery/owner-queue evidence, with route evidence moving toward reduced, migrated, representative-green, or architecture-gap.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh representative evidence is still red at active_gate_snapshot_coverage, but the owner-recovery write-deferred handoff now records membershipPublicationHandoffOutcomeEnqueued=true; remaining debt is the active_gate_timed_out timeout/retry contract selected for the successor.",
    "crossBoundaryReview": "Do not patch downstream startup readiness, benchmark_events visibility, or priority recovery in this package; the successor remains under startup_active_gate_owner / snapshot_coverage and targets active_gate_timed_out."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage owner_reconcile_pending architecture-route implementation",
    "phaseChain": [
      "The closed protocol route converted selected-snapshot deferred retry into publicationActiveGateHandoff wait_owner_recovery evidence.",
      "The remaining witness is membershipPublicationHandoffOutcome write_deferred with owner_reconcile_pending.",
      "Frontier history still reports startup_active_gate_owner / snapshot_coverage in architecture-route implement-pending state until a source package with theoryLoop.architectureRoute closes."
    ],
    "recentFrontierHistory": [
      "work:frontier-history reports same-mechanism-repeat contract_gap on startup_active_gate_owner / snapshot_coverage.",
      "The latest architecture-gap ledger ref is theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop.",
      "The predecessor protocol route reduced topology evidence to wait_owner_recovery but did not make rolling-restart representative-green."
    ],
    "oscillationCheck": "Plain runtime-owner-boundary promotion is rejected as another same-frontier local patch; the only permitted source path is the selected protocol architecture-route implementation.",
    "handoffInvariant": "wait_owner_recovery membership-publication evidence must reenter through the owner handoff protocol and report drain/enqueue progress before diagnostics may classify the owner boundary as reduced.",
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream",
      "benchmark_events SQL visibility remains downstream"
    ],
    "missingCausalEdge": "membershipPublicationHandoffOutcome write_deferred must drain or enqueue the selected owner-recovery wait reentry under the publication active-gate membership handoff protocol",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "falsifyingProbe": "npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "boundedProgressProof": "Focused reconcile proof must show drain or enqueue bounded progress for wait_owner_recovery and direct consumer proof must keep the publication active-gate handoff contract stable.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedObservableTransition": "membershipPublicationHandoffOutcome write_deferred reentry drains/enqueues owner recovery, reduces pending owner recovery or owner queue evidence, migrates owner boundary, or records architecture-gap after one source package",
    "maxProgressBound": "one architecture-route source package before representative rerun or successor routing",
    "sameFrontierFallback": "If focused proof cannot expose owner-recovery drain/enqueue progress, record architecture-gap or migration evidence instead of widening this package.",
    "expectedNextFrontier": "active_gate_timed_out timeout/retry contract, owner-boundary migration, representative-green, or architecture-gap",
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
      "Package lane remains runtime-owner-boundary.",
      "Declared owner boundary remains startup_active_gate_owner / snapshot_coverage."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "The active action is Implement the bounded owner-recovery wait reentry/drain source package for membershipPublicationHandoffOutcome write_deferred evidence.."
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
    "systemTheoryRef": "work/packages/todo-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md systemTheory",
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
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes owner_reconcile_pending there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Implement the bounded owner-recovery wait reentry/drain source package for membershipPublicationHandoffOutcome write_deferred evidence. for owner_reconcile_pending.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js; regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js; supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps owner_reconcile_pending and route evidence to one emitted outcome: Implement the bounded owner-recovery wait reentry/drain source package for membershipPublicationHandoffOutcome write_deferred evidence..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement the bounded owner-recovery wait reentry/drain source package for membershipPublicationHandoffOutcome write_deferred evidence. | membershipPublicationHandoffOutcome write_deferred reentry either drains/enqueues the selected owner-recovery wait, reduces pending owner recovery or owner queue evidence, migrates owner boundary, or records architecture-gap after one source package. | falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js |
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
- Success metrics: membershipPublicationHandoffOutcome write_deferred reentry either drains/enqueues the selected owner-recovery wait, reduces pending owner recovery or owner queue evidence, migrates owner boundary, or records architecture-gap after one source package.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
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
2. Package lane remains runtime-owner-boundary.
3. Declared owner boundary remains startup_active_gate_owner / snapshot_coverage.
- Changed facts:
1. This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.
2. The active action is Implement the bounded owner-recovery wait reentry/drain source package for membershipPublicationHandoffOutcome write_deferred evidence..
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

- System theory reference: work/packages/todo-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md systemTheory
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
- Promoted theory: The remaining owner_reconcile_pending witness is a concrete owner-recovery wait reentry/drain source gap in membership-publication active-gate reconcile.
- Sprint-goal delta: membershipPublicationHandoffOutcome write_deferred reentry either drains/enqueues the selected owner-recovery wait, reduces pending owner recovery or owner queue evidence, migrates owner boundary, or records architecture-gap after one source package.
- Required source write: `src/control-plane/membership-publication-active-gate-reconcile.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.


## Bounded Experiment

- Hypothesis: The remaining owner_reconcile_pending witness is a concrete owner-recovery wait reentry/drain source gap in membership-publication active-gate reconcile.
- Hypothesis discriminator: If true, focused reconcile proof can expose drained or queued reentry for wait_owner_recovery; if false, route evidence stays write_deferred/enqueued=false with no source-owned transition and must route to architecture-gap.
- Expected metric: membershipPublicationHandoffOutcomeEnqueued, selectedControlPlaneOwnerQueuePendingWrites, publicationActiveGateHandoffPendingRecoveryCount, and scenario-route owner/boundary
- Inherits from: `work/packages/done-20260529-rolling-restart-active-gate-handoff-protocol-route.md`
- Timebox: `24h`
- Validation tier: `single-owner`
- Merge requirement: focused owner-recovery reentry proof plus topology and scenario route evidence
- Redirect rule: unchanged owner_reconcile_pending write_deferred/enqueued=false after this source package opens architecture-gap instead of another same-frontier runtime patch
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: membershipPublicationHandoffOutcome write_deferred reentry either drains/enqueues the selected owner-recovery wait, reduces pending owner recovery or owner queue evidence, migrates owner boundary, or records architecture-gap after one source package.
- Observed: focused proof makes owner-recovery wait reentry enqueue on queue pressure; the fresh rolling-restart artifact reports membershipPublicationHandoffOutcomeEnqueued=true and routes the next dominant reason to active_gate_timed_out.
- Accuracy: partial
- Evidence: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: membershipPublicationHandoffOutcome write_deferred reentry either drains/enqueues the selected owner-recovery wait, reduces pending owner recovery or owner queue evidence, migrates owner boundary, or records architecture-gap after one source package.
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
- Focused proof: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`, `regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js`, `supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`, `supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`
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

- [x] action: freshness-review; owner: Agent Hume (019e740e-71ad-7861-af7f-659a0485d59a); files-changed: none; validation: npm run work:context passed and recognized repaired causal-escalation architecture-route package; npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md failed only on missing checked evidence before this line; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md passed; npm run work:validate -- --pre-impl work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md failed only on missing checked freshness-review evidence before this line; decision: fresh; outcome: validated - no metadata, owner, boundary, route marker, ledger, or proof ladder blockers remain after repair.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/control-plane/membership-publication-active-gate-reconcile.js, test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js, work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md; validation: npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md passed; npm run work:validate -- --pre-impl work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md passed; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js passed; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js passed; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage passed on the static representative artifact and still reports membershipPublicationHandoffOutcomeEnqueued false pending rerun; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage passed; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json passed; node scripts/check-guideline-literals.js src/control-plane/membership-publication-active-gate-reconcile.js passed; node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-active-gate-reconcile.js passed; npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-active-gate-reconcile.js passed; npm run audit:file-size -- --path src/control-plane/membership-publication-active-gate-reconcile.js passed; parent revalidated focused proof: yes; outcome: validated - owner-recovery wait now treats snapshot queue pressure reset as bounded reentry when immediate drain writes zero entries.
- [x] action: verification-fix; owner: Agent Dewey (019e7419-68a3-79b2-8b51-315c9435f6e6); files-changed: none; validation: npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md passed; npm run work:validate -- --pre-impl work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md passed; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js passed with 2 tests; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js passed with 45 tests; node scripts/check-guideline-literals.js src/control-plane/membership-publication-active-gate-reconcile.js passed with 0 violations; node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-active-gate-reconcile.js passed with 0 violations; npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-active-gate-reconcile.js passed with 0 violations; npm run audit:file-size -- --path src/control-plane/membership-publication-active-gate-reconcile.js passed under threshold; git diff --check -- package/source/test files passed; parent revalidated focused proof: yes; outcome: validated - verifier found no code, test, or package blocker and made no edits.
- [x] action: representative-rerun; owner: startup_active_gate_owner; files-changed: work/packages/todo-20260529-rolling-restart-active-gate-timeout-retry-contract.md, work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-reentry-drain.md; validation: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose failed as expected for the still-red representative scenario and wrote a fresh report; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json passed and selected active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage passed with runtimePromotionGuard allowed; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage passed and reported membershipPublicationHandoffOutcomeEnqueued=true; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json passed with continue_local_fix / classified_local_blocker; parent revalidated focused proof: yes; outcome: validated - the source package reduced the owner-recovery handoff evidence and fresh routing selected the active_gate_timed_out successor.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:repair passed; outcome: validated - current-blocker and sprint handoff files refreshed with the active package and successor queue.

## Validation

1. falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js
2. regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage

## Commit And Push Ledger

1. Focused package commit: fda13d4702043dc0daca935fcdfb53810e4b5982
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-30T10:22:34.858Z