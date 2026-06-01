# Rolling restart active-gate bounded re-entry model route

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-30",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "currentState": "Fresh frontier history reports pair-alternation-post-rederive on startup_active_gate_owner / snapshot_coverage; a formal active-gate convergence model (TLC + fast-check) now proves that bounding owner re-entry (AllowUnboundedReentry=FALSE) converges while the unbounded protocol oscillates.",
    "nextAction": "Open the runtime successor package (causal-escalation, runtime owner-boundary) that implements the model-layer bounded-re-entry invariant in src/control-plane/publication-active-gate-handoff-contract-decision.js, then run its falsifier and regression proof before closure.",
    "closed": "2026-05-30"
  },
  "scope": {
    "writeScope": [
      "work/packages/done-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract-decision.js"
    ],
    "commitScope": [
      "work/packages/done-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Frontier history reports pair-alternation-post-rederive on startup_active_gate_owner / snapshot_coverage; another runtime package on this pair is blocked until architecture-gap analysis selects a non-repeated route or stop, and the formal model now selects the model-layer bounded-re-entry route.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation/architecture-gap",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260530-active-gate-bounded-reentry-model"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage",
        "supporting: npm run model:check"
      ]
    }
  },
  "theoryLoop": {
    "gateMarker": "pair-alternation-post-rederive",
    "jointFalsifierCommand": "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
    "result": "architecture-gap",
    "outcome": "theory-confirmed",
    "architectureRoute": {
      "selectedLayer": "model",
      "ledgerRef": "theory-20260530-active-gate-bounded-reentry-model",
      "coupledInvariant": "active-gate snapshot coverage vs owner re-entry (a covered/published node must not return to pendingReconcile)"
    }
  },
  "architectureGapAnalysis": true,
  "validationTier": "release-gate",
  "theoryLedger": "Confirms theory-20260530-active-gate-bounded-reentry-model: the formal active-gate convergence model selects the model-layer bounded-re-entry route as the architecture decision for owner_reconcile_pending; the runtime successor implements it in the decision contract.",
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "frontier-history reports pair-alternation-post-rederive with same-mechanism-repeat contract_gap on startup_active_gate_owner / snapshot_coverage",
      "prior scheduling- and protocol-layer routes stalled at owner_reconcile_pending without leaving the active_gate_snapshot_coverage frontier",
      "the formal active-gate convergence model proves bounded re-entry converges (Liveness Holds: Converged) while the unbounded protocol oscillates (liveness FAILS)"
    ],
    "choices": [
      {
        "id": "open-architecture-package",
        "route": "architecture-package",
        "summary": "Select the model-layer bounded-re-entry route proven by ActiveGate.tla and promote a runtime successor that excludes already covered/published nodes from the owner_reconcile_pending re-entry path in src/control-plane/publication-active-gate-handoff-contract-decision.js.",
        "proof": [
          "npm run model:check",
          "npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "migrate-owner-boundary",
        "route": "owner-boundary-migration",
        "summary": "Migrate the deciding owner boundary only if canonical route evidence names a different owner and boundary; rejected because scenario-route keeps startup_active_gate_owner / snapshot_coverage as the deciding owner.",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "continue-local-proof",
        "route": "continue-local-proof",
        "summary": "Continue repeating a local active-gate owner_reconcile_pending patch; rejected by the pair-alternation-post-rederive guard which blocks another same-layer local source package on this pair.",
        "proof": [
          "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12"
        ]
      }
    ],
    "selectedChoice": "open-architecture-package",
    "nextAction": "Open the runtime successor package (causal-escalation, runtime owner-boundary) that implements the model-layer bounded-re-entry invariant in src/control-plane/publication-active-gate-handoff-contract-decision.js, then run its falsifier and regression proof before closure."
  },
  "architectureGapDecision": {
    "selectedRoute": "model-layer-bounded-reentry",
    "decisionDate": "2026-05-30",
    "reason": "Frontier-history reports pair-alternation-post-rederive on startup_active_gate_owner / snapshot_coverage; prior scheduling- and protocol-layer routes stalled at owner_reconcile_pending. The formal active-gate convergence model (TLC + fast-check) proves the model-layer bounded-re-entry route (AllowUnboundedReentry=FALSE) satisfies Liveness Holds: Converged while the unbounded protocol oscillates, selecting the previously-untried model layer.",
    "causalModelInterpretation": "Causal-model keeps active_gate_snapshot_coverage as the first critical path with owner_reconcile_pending; the model proves the missing causal edge is an unbounded re-entry path that returns already covered/published nodes to pendingReconcile, and bounding it removes the oscillation.",
    "runtimePromotion": "successor-required",
    "successorRule": "The runtime successor package excludes already covered/published nodes from the owner_reconcile_pending re-entry path in src/control-plane/publication-active-gate-handoff-contract-decision.js, preserving the model safety invariants PublishedSubsetCovered and CoveredDisjointPending, and proves it with a representative falsifier and regression."
  },
  "representativeResidual": {
    "status": "architecture-gap",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "owner_reconcile_pending / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Enforce the ActiveGate.tla bounded-re-entry invariant in the decision rule table: exclude already covered/published nodes from the owner_reconcile_pending re-entry path"
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "missingTransitionOrObservation": "Enforce the ActiveGate.tla bounded-re-entry invariant in the decision rule table: exclude already covered/published nodes from the owner_reconcile_pending re-entry path",
    "smallestFalsifyingProbe": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "Enforce the ActiveGate.tla bounded-re-entry invariant in the decision rule table: exclude already covered/published nodes from the owner_reconcile_pending re-entry path",
    "observed": "Enforce the ActiveGate.tla bounded-re-entry invariant in the decision rule table: exclude already covered/published nodes from the owner_reconcile_pending re-entry path",
    "accuracy": "matched",
    "evidence": "npm run model:check; test-output/reports/active-gate-tlc-route.model.report.json; test-output/reports/active-gate-tlc-stall.model.report.json"
  },
  "closureSummary": {
    "resultClassification": "architecture-gap",
    "predictionAccuracy": "matched",
    "observedMovement": "The formal active-gate convergence model (TLC + fast-check) proves that bounding owner re-entry (AllowUnboundedReentry=FALSE) converges (Liveness Holds: Converged) while the unbounded protocol oscillates, and the 300-run model-to-real-reducer binding test holds.",
    "successorReason": "Open the runtime successor package (causal-escalation, runtime owner-boundary) that implements the model-layer bounded-re-entry invariant in src/control-plane/publication-active-gate-handoff-contract-decision.js, then run its falsifier and regression proof before closure.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "test-output/reports/active-gate-tlc-route.model.report.json"
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
    "routeDominantReason": "owner_reconcile_pending",
    "routeCausalOutcome": "architecture-gap",
    "stopMode": "architecture-route-selected",
    "nextLane": "causal-escalation",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Bounding owner re-entry so a covered or published node is not returned to pendingReconcile (the ActiveGate.tla route with AllowUnboundedReentry=FALSE) turns the active-gate owner_reconcile_pending oscillation into snapshot-coverage convergence inside the publication active-gate handoff decision contract.",
    "stopConditionCheck": "Run npm run model:check (convergence proof), the focused decision-contract proof, npm run work:test:regression, npm run analyze:causal-model on the fresh representative report, and post-rerun route checks before closure.",
    "expectedCausalModelChange": "The decision rule table stops emitting owner_reconcile_pending for nodes already covered or published, so the representative rerun reduces the unbounded re-entry shape and the dominant reason moves off owner_reconcile_pending.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Fresh representative evidence is still red at active_gate_snapshot_coverage with owner_reconcile_pending and zero priority-recovery residual witnesses; this architecture-gap package selects the route and does not itself rerun the representative harness.",
    "crossBoundaryReview": "Do not patch active-gate runtime source, startup readiness, priority recovery, or unrelated runtime files in this package; the runtime successor implements the selected route in src/control-plane/publication-active-gate-handoff-contract-decision.js."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage owner_reconcile_pending model-layer bounded-re-entry route implementation",
    "phaseChain": [
      "The formal active-gate convergence model (npm run model:check; TLC + fast-check) proves the bounded-re-entry route satisfies Liveness Holds: Converged while the unbounded protocol oscillates",
      "the 300-run binding test confirms the abstract convergence predicate equals buildPublicationActiveGateCatchupFence promotionAllowed on every reachable state",
      "frontier-history reports same-mechanism-repeat contract_gap after scheduling- and protocol-layer routes stalled at owner_reconcile_pending",
      "this package owns promoting the model-layer bounded-re-entry invariant into the decision rule table before the next representative rerun"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream of active-gate snapshot coverage",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until snapshot coverage converges"
    ],
    "missingCausalEdge": "owner_reconcile_pending re-entry has no bound preventing an already covered or published node from being returned to pendingReconcile.",
    "missingCausalEdgeProbe": "npm run model:check",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose",
    "boundedProgressProof": "Focused proof must show the decision rule table no longer emits owner_reconcile_pending re-entry for an already covered or published node, so the bounded re-entry reconcile path advances snapshot coverage instead of looping, while preserving affected active-gate handoff outcomes.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "expectedObservableTransition": "owner_reconcile_pending stops being the active_gate_snapshot_coverage dominant reason and snapshot coverage advances toward quorum in fresh representative routing.",
    "maxProgressBound": "one model-layer route implementation package before representative rerun routing",
    "sameFrontierFallback": "If the route implementation later returns same-frontier with no reduction, rotate the architecture-route layer or migrate the owner boundary instead of widening this package.",
    "expectedNextFrontier": "active-gate snapshot coverage reduction, owner-boundary migration, representative-green, or architecture-gap continuation",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260529-rolling-restart-active-gate-owner-reconcile-wake-scheduling-route.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260529-rolling-restart-active-gate-owner-reconcile-handoff-retry.md / startup_active_gate_owner / snapshot_coverage / architecture-gap",
      "work/packages/done-20260529-rolling-restart-active-gate-timeout-after-wake-architecture-gap.md / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "Prior scheduling- and protocol-layer routes stalled at owner_reconcile_pending with same-mechanism-repeat contract_gap; this package rotates to the previously-untried model layer selected by the formal convergence proof rather than repeating a stalled layer.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; the publication active-gate handoff decision contract remains the sole owner of reconcile and re-entry truth, and bounding re-entry must not relax any safety invariant the model checks (PublishedSubsetCovered, CoveredDisjointPending)."
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
      "The active action is Enforce the ActiveGate.tla bounded-re-entry invariant in the decision rule table: exclude already covered/published nodes from the owner_reconcile_pending re-entry path."
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
        "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose",
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
    "systemTheoryRef": "work/packages/todo-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/control-plane/publication-active-gate-handoff-contract-decision.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose.",
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

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Enforce the ActiveGate.tla bounded-re-entry invariant in the decision rule table: exclude already covered/published nodes from the owner_reconcile_pending re-entry path for owner_reconcile_pending.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose; regression: npm run work:test:regression; npm run model:check.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps owner_reconcile_pending and route evidence to one emitted outcome: Enforce the ActiveGate.tla bounded-re-entry invariant in the decision rule table: exclude already covered/published nodes from the owner_reconcile_pending re-entry path.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Enforce the ActiveGate.tla bounded-re-entry invariant in the decision rule table: exclude already covered/published nodes from the owner_reconcile_pending re-entry path | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose`
- Competing explanations: At minimum compare owner_reconcile_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own owner_reconcile_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: owner_reconcile_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
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
2. The active action is Enforce the ActiveGate.tla bounded-re-entry invariant in the decision rule table: exclude already covered/published nodes from the owner_reconcile_pending re-entry path.
- Competing theories:
1. H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for owner_reconcile_pending.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `owner_reconcile_pending`; owner `startup_active_gate_owner / snapshot_coverage`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/todo-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md systemTheory
- Selected system theory: H1 is selected unless falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/control-plane/publication-active-gate-handoff-contract-decision.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Redirect rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.
3. Falsifiability: high - falsifier is falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --fast-local --verbose.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Architecture Gap Decision

- Trigger: `frontier-oscillation` — frontier-history reports pair-alternation-post-rederive (same-mechanism-repeat contract_gap) on startup_active_gate_owner / snapshot_coverage; another local runtime source package on this pair is blocked until architecture analysis selects a non-repeated route or stop.
- Architecture decision: select the previously-untried **model layer** bounded-re-entry route. The formal active-gate convergence model (`npm run model:check`; TLC + fast-check) proves that bounding owner re-entry (ActiveGate.tla with `AllowUnboundedReentry=FALSE`) satisfies `<>Converged` while the unbounded protocol oscillates, and the 300-run binding test confirms the abstract convergence predicate equals `buildPublicationActiveGateCatchupFence` promotionAllowed on every reachable state.
- Selected route: `architecture-package` — promote a runtime successor that excludes already covered/published nodes from the `owner_reconcile_pending` re-entry path in `src/control-plane/publication-active-gate-handoff-contract-decision.js`.
- Coupled invariant: active-gate snapshot coverage vs owner re-entry — a covered/published node must not return to `pendingReconcile`; the bound must not relax any safety invariant the model checks (`PublishedSubsetCovered`, `CoveredDisjointPending`).
- Ledger ref: `theory-20260530-active-gate-bounded-reentry-model`.
- This package makes no runtime source edits; it records the architecture decision and declares the runtime successor. Runtime promotion is unblocked only through that successor package.
- Forbidden stop shape: a bare classification-only or evidence-only stop. This package selects a concrete architecture route (the model layer) with a named successor; it does not patch downstream symptoms or widen do-not-edit scope.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `owner_reconcile_pending`
- Route causal outcome: `architecture-gap`
- Stop mode: `architecture-route-selected`
- Next lane: `causal-escalation`
- Required after this decision: open the runtime successor package (causal-escalation, runtime owner-boundary) that implements the model-layer bounded-re-entry invariant, then run its falsifier and regression proof before closure.

## In Scope

1. work/packages/active-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md (this architecture decision)
2. work/sprints/active-2026-q2-spec-led-runtime-modularization.md (record the selected route)
3. work/theory-ledger.md (model-route theory entry)

## Out Of Scope

1. Runtime source edits (deferred to the declared runtime successor package).
2. Runtime ownership changes.

## Model Fit

- Package class: `architecture-gap-analysis`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation/architecture-gap`
- Output profile: `medium`
- Owned files: this package, the active sprint, and the theory ledger (no runtime source edits)
- Do-not-edit scope: all `src/` files; the runtime successor owns the source change
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`, `regression: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`, `supporting: npm run model:check`
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

- [x] action: freshness-review; owner: Agent Curie (329ceb8f-da96-46cb-ab96-c7881e813035); files-changed: none; validation: npm run work:context passed and current-blocker points at work/packages/active-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md; npm run work:validate -- --entry passed; npm run work:validate -- --pre-impl passed; decision: fresh; outcome: validated
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: work/packages/active-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md, work/theory-ledger.md; validation: npm run model:check passed and TLC confirmed route converges (converged=true expect=true met=true) while stall oscillates (converged=false expect=false met=true); npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed and reported exhausted loop health with pair-alternation-post-rederive; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage passed; parent revalidated focused proof: yes; outcome: validated - model-layer bounded-re-entry route selected; runtime promotion deferred to the declared successor package.
- [x] action: verification-fix; owner: Agent Curie (329ceb8f-da96-46cb-ab96-c7881e813035); files-changed: work/packages/active-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md; validation: embedded work-package JSON parsed; npm run work:validate -- --entry passed; npm run work:validate -- --pre-impl passed; npm run model:check passed with route converged=true and stall converged=false; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed; npm run work:context passed and current-blocker points at work/packages/active-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md; parent revalidated focused proof: yes; outcome: validated
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair passed; outcome: validated

## Validation

1. falsifier: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage
3. supporting: npm run model:check

