# Rolling Restart Active Gate Observation Route

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "currentState": "Resumed under the rolling-restart-active-gate-resolution sprint. Frontier history reports startup_active_gate_owner / snapshot_coverage is in architecture-route implement-pending state after the selected architecture-gap route; this package is the bounded observation-layer implementation, not another unguided local slice.",
    "nextAction": "Implement the selected observation-layer architecture route so selected snapshot observation retry produces owner-owned snapshot coverage progress.",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260531-rolling-restart-active-gate-observation-route.md",
      "work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md",
      "src/control-plane/publication-active-gate-handoff-contract-decision.js",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/sprints/done-2026-q2-rolling-restart-contract-first-green-theory-loop.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-contract-first-green-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract.js",
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "src/control-plane/membership-publication-active-gate-reconcile.js"
    ],
    "commitScope": [
      "work/packages/active-20260531-rolling-restart-active-gate-observation-route.md",
      "work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md",
      "src/control-plane/publication-active-gate-handoff-contract-decision.js",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/sprints/done-2026-q2-rolling-restart-contract-first-green-theory-loop.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The active-gate owner/boundary is in architecture-route implement-pending state; the selected observation route is the permitted source implementation before representative rerun.",
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
      "proof selects owner-boundary migration",
      "evidence contradicts the selected architecture route"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "theory-20260531-rolling-restart-contract-first-green-fresh-rerun",
      "theory-20260531-rolling-restart-active-gate-observation-route-implementation"
    ],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
        "regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
        "supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage",
        "supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Implement the selected observation-layer architecture route so selected snapshot observation retry produces owner-owned snapshot coverage progress.",
    "sprintGoalDelta": "Selected snapshot observation retry produces owner-owned snapshot coverage progress instead of returning to saturated owner_reconcile_pending.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "outcome": "theory-confirmed",
    "result": "needs-rerun",
    "successorPackage": "work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md",
    "architectureRoute": {
      "selectedLayer": "observation",
      "ledgerRef": "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "coupledInvariant": "selected snapshot observation retry must produce owner-owned snapshot coverage progress without re-entering saturated owner_reconcile_pending.",
      "gapAnalysisRef": "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-analysis.md"
    }
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "frontier": "owner_reconcile_pending / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Implement the selected observation-layer architecture route before another representative rerun.",
    "residualCount": 1
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-contract-first-green-rerun.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "Fresh evidence drained priority-recovery residual witnesses to zero and frontier-history reports architectureRouteState=implement-pending for this pair.",
    "rejectedAlternatives": "Another analysis-only architecture-gap package is invalid while the selected architecture route is implement-pending.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Implement the selected observation-layer architecture route with bounded src write scope.",
    "missingTransitionOrObservation": "Selected snapshot timeout plus repair_deferred evidence must produce an owner-owned observation/progress transition instead of returning to owner_reconcile_pending.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "expectedMovement": "The focused source proof selects a bounded observation transition; a later representative rerun must reduce, migrate, go green, or record architecture-gap.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of widening the runtime scope.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / observation route",
    "predicted": "Focused contract proof exposes an owner-owned observation transition for selected snapshot retry before representative rerun.",
    "observed": "Focused proof and the discriminator probe select wait_owner_recovery when selected snapshot recovery is the only live debt, instead of scheduling membership publication reconcile from a reconcile-required snapshot.",
    "accuracy": "partial",
    "evidence": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js; node --input-type=module selected snapshot recovery-only discriminator probe"
  },
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused proof and the discriminator probe selected wait_owner_recovery when selected snapshot recovery is the only live debt, instead of scheduling membership publication reconcile from a reconcile-required snapshot.",
    "successorReason": "Local source proof is validated but representative rolling-restart evidence has not been rerun after the observation-route implementation.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage representative rerun",
    "evidenceArtifact": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json"
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
    "sourceArtifact": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "owner_reconcile_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "causal-escalation",
    "expectedDelta": "The selected observation-layer architecture route is implemented locally, then fresh representative evidence must reduce active_gate_snapshot_coverage, migrate, go green, or record architecture-gap.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The selected observation-layer architecture route can convert selected_snapshot_source_timeout plus repair_deferred evidence into owner-owned snapshot coverage progress without re-entering saturated owner_reconcile_pending.",
    "stopConditionCheck": "Run `npm run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json` plus the focused handoff contract falsifier, owner-recovery regression, frontier-history, and scenario-route before closure.",
    "expectedCausalModelChange": "Focused proof records whether the observation route creates a non-repeated owner-owned transition; representative evidence must later reduce active_gate_snapshot_coverage, migrate, go green, or record architecture-gap.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh representative evidence is red at active_gate_snapshot_coverage with priority-recovery residual witnesses at zero, selected_snapshot_source_timeout, snapshot_repair_deferred, and owner_reconcile_pending.",
    "crossBoundaryReview": "Primary runtime write scope is src/control-plane/publication-active-gate-handoff-contract-decision.js; adjacent handoff, selection, and reconcile files remain candidate consumers unless proof requires escalation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate observation architecture-route implementation",
    "phaseChain": [
      "release-gate system-theory rederive completed",
      "fresh representative rerun drained priority-recovery residual witnesses to zero",
      "fresh route selected active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending",
      "frontier-history reports architectureRouteState=implement-pending, so the selected observation route must be implemented in src before another architecture gate"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream until active-gate snapshot coverage improves",
      "benchmark_events table partition visibility remains downstream of startup/readiness convergence"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-fresh-representative-rerun-gate.md / release_gate_owner / rolling_restart_fully_green_gate / reduced",
      "done-20260530-rolling-restart-active-gate-bounded-reentry-representative-rerun.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260530-rolling-restart-active-gate-bounded-reentry-model-route.md / startup_active_gate_owner / snapshot_coverage / architecture-gap"
    ],
    "oscillationCheck": "This is not another same-frontier symptom patch because it declares theoryLoop.architectureRoute selectedLayer=observation, cites the architecture-gap ledger ref, and writes the bounded runtime route required by implement-pending state.",
    "handoffInvariant": "Selected snapshot observation retry must create owner-owned snapshot coverage progress before downstream readiness or release-gate logic reinterprets the active-gate state.",
    "missingCausalEdge": "Observation-layer transition from selected_snapshot_source_timeout plus repair_deferred evidence to owner-owned coverage progress.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "falsifyingProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "boundedProgressProof": "Focused contract proof must show a bounded observation/progress outcome for selected snapshot retry evidence while preserving owner-recovery handoff behavior.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "expectedObservableTransition": "Focused proof selects a concrete owner-owned observation transition; later representative evidence reduces active_gate_snapshot_coverage, migrates, goes green, or records architecture-gap.",
    "maxProgressBound": "one observation-layer source route plus focused owner proof before representative rerun",
    "sameFrontierFallback": "If proof cannot name one non-repeated owner-owned observation transition or migration, record architecture-gap and do not widen runtime scope.",
    "expectedNextFrontier": "reduced active-gate frontier, owner-boundary migration, representative-green, or architecture-gap stop",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh representative route selected active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending",
      "priority-recovery residual witnesses are zero, so the active-gate pair is the current first frontier",
      "frontier-history reports architectureRouteState=implement-pending and requires the runtime implementation of the selected route"
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Execute the selected observation-layer route implementation before another representative rerun.",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute the selected observation-layer source route in the publication active-gate handoff decision contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
          "npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js"
        ]
      },
      {
        "id": "migrate-owner-boundary",
        "summary": "Migrate only if canonical route evidence names a different deciding owner and boundary for the selected active-gate evidence.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Record architecture-gap only if the focused source proof cannot select a non-repeated observation transition, owner migration, or representative-green route.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --explain active_gate_snapshot_coverage"
        ]
      }
    ]
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes owner_reconcile_pending to startup_active_gate_owner / snapshot_coverage after priority recovery residuals reached zero; the package must implement the selected observation-layer architecture route before another representative rerun.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-contract-first-green-rerun.report.json.",
      "owner_reconcile_pending is the current selected symptom.",
      "startup_active_gate_owner / snapshot_coverage is the declared decision boundary for this route implementation.",
      "frontier-history reports architectureRouteState=implement-pending."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage: selected first frontier and blocked local source-patch boundary.",
      "startup_readiness_owner / startup_support_evidence: downstream until active-gate snapshot coverage moves.",
      "release_gate_owner / rolling_restart_fully_green_gate: downstream proof target after representative evidence exits red."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane is causal-escalation.",
      "Declared owner boundary remains startup_active_gate_owner / snapshot_coverage.",
      "Durable contract record is architecture/contracts/active-gate-convergence.md#active-gate-convergence.",
      "Priority-recovery residual witnesses are zero in the fresh route explanation."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-contract-first-green-rerun.report.json.",
      "The active action is the selected observation-layer source implementation before representative rerun."
    ],
    "competingTheories": [
      "H1 startup_active_gate_owner / snapshot_coverage has a non-repeated observation transition in the handoff decision contract.",
      "H2 the same symptom requires owner-boundary migration or a separate architecture package.",
      "H3 no current owner-owned transition is selectable, so the correct result is architecture-gap."
    ],
    "eliminatedTheories": [
      "Another analysis-only architecture-gap package is eliminated by implement-pending route history.",
      "Priority recovery remains the first frontier is eliminated by zero residual witnesses."
    ],
    "downstreamSymptoms": [
      "startup readiness support evidence remains downstream",
      "benchmark table partition visibility remains downstream"
    ],
    "transitionTable": [
      {
        "inputSignal": "owner_reconcile_pending",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "selected snapshot retry evidence must become a named owner-owned observation transition, migration, or stop.",
        "expectedEvidence": "focused proof selects the transition, migrates ownership, or records architecture-gap evidence.",
        "falsifier": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
        "migrationTrigger": "focused proof names a different deciding owner boundary or proves this boundary cannot own the transition."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when focused evidence names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration."
    ],
    "wholeSystemInvariant": "Runtime edits are allowed only for the selected architecture route and must stay within the declared owner-owned transition or migration proof."
  },
  "sliceTheory": {
    "systemTheoryRef": "architecture/contracts/active-gate-convergence.md#active-gate-convergence",
    "selectedSystemTheory": "H1 is selected unless the focused handoff contract falsifier proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only src/control-plane/publication-active-gate-handoff-contract-decision.js for the selected observation-layer architecture route.",
    "falsifier": "falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js",
    "representativeExpectedMovement": "selected route records a concrete observation transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js.",
      "representativeMovement": "medium - expected movement is route selection, migration, or architecture-gap stop.",
      "downstreamRiskContainment": "high - downstream symptoms remain frozen until owner selection is proven."
    },
    "wrongSliceTriggers": [
      "proof selects a different owner boundary",
      "proof requires runtime files outside writeScope",
      "proof cannot select a concrete transition or migration"
    ]
  },
  "systemContractRef": "architecture/contracts/active-gate-convergence.md#active-gate-convergence",
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package implements the selected observation-layer architecture route for `startup_active_gate_owner / snapshot_coverage`. Fresh rolling-restart evidence drained priority-recovery residual witnesses to zero, then returned to active-gate snapshot coverage with `owner_reconcile_pending`; frontier history now reports `architectureRouteState=implement-pending`, so another architecture-gap analysis is stale and the next valid move is the bounded source route implementation.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: this is an R13 architecture-route runtime implementation on a saturated owner/boundary, using the selected `observation` layer and architecture-gap ledger ref.
- Escalation trigger to a heavier lane: evidence contradicts the current route, names a different owner boundary, or requires a human-only frozen decision.

## System Contract Binding

- Contract record: `architecture/contracts/active-gate-convergence.md#active-gate-convergence`
- Closure question: does the selected observation route create a non-repeated owner-owned transition, preserve affected owner-recovery behavior, and set up representative rerun evidence?

## Core Logic Brief

- Canonical outcome: selected snapshot retry evidence becomes a named owner-owned observation/progress transition in `src/control-plane/publication-active-gate-handoff-contract-decision.js`.
- Inputs/signals: fresh representative artifact, frontier history, scenario route, causal model, and active-gate handoff contract tests.
- State model or invariant: the implementation is limited to the selected observation route and must not reinterpret downstream readiness or release-gate state.
- Non-goals and forbidden interpretations: do not patch startup readiness, priority recovery, benchmark visibility, or adjacent active-gate runtime files unless focused proof escalates scope.
- Proof mapping: focused contract proof validates the route; owner-recovery regression protects affected handoff behavior; frontier/route evidence confirms the R13 implement-pending state.
- Wrong-slice trigger: stop or split if proof requires files outside declared write scope, names a different owner boundary, or cannot select a concrete transition.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending | startup_active_gate_owner owns the selected observation-route implementation before downstream consumers reinterpret it | bounded source implementation | focused proof selects transition, migration, or architecture-gap | `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js` |
| route history | architectureRouteState=implement-pending | prior architecture-gap analysis already selected the route | implement `theoryLoop.architectureRoute` | no additional architecture-gap package | `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12` |

- Anti-symptom rationale: this package implements the already-selected observation route; it does not patch downstream symptoms or open another unguided local slice.
- Falsifying focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`
- Competing explanations: selected observation transition, owner-boundary migration, stale route evidence, downstream lag, or unresolved architecture gap.
- Systemic interaction scan: compare route history, focused contract proof, causal model, and representative route before closure.
- Ping-pong stop rule: unchanged same-frontier/no-reduction after focused proof records architecture-gap or successor action instead of widening runtime scope.
- Oscillation guard: this is not another same-frontier symptom patch because it declares `theoryLoop.architectureRoute.selectedLayer=observation`, cites the architecture-gap ledger ref, and writes the selected route in `src/`; if proof cannot select the transition, stop as architecture-gap or migrate owner boundary.

## Decision Experiment Gate

- Decision question: does the selected observation route make selected snapshot retry an owner-owned progress transition without re-entering saturated `owner_reconcile_pending`?
- Architecture review: selected route is `continue-local-proof` because frontier history reports architecture-route implement-pending.
- Competing hypotheses: active-gate owns a non-repeated observation transition; a different owner boundary owns the next move; the evidence is stale; no route is selectable.
- Pre-edit focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`
- Success metrics: focused transition selected, owner migration, representative green, reduced active-gate route, or explicit architecture-gap stop.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending`
- Redirect rule: non-terminal evidence opens or selects the next architecture/causal package instead of another local patch; the sprint terminates only on the recorded theory-loop success condition or blocked external/frozen decision.

## System Theory

- Problem statement: rolling-restart currently routes `owner_reconcile_pending` to `startup_active_gate_owner / snapshot_coverage` after priority recovery cleared, so the package must implement the selected observation route before runtime source work can be evaluated by a fresh representative rerun.
- Phase chain:
1. Representative evidence comes from `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`.
2. Priority-recovery residual witnesses are zero.
3. Fresh route selects `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending`.
4. Frontier history reports `architectureRouteState=implement-pending`.
- Owner-boundary map:
1. `startup_active_gate_owner / snapshot_coverage`: selected first frontier and blocked local source-patch boundary.
2. `startup_readiness_owner / startup_support_evidence`: downstream until active-gate snapshot coverage moves.
3. `release_gate_owner / rolling_restart_fully_green_gate`: downstream representative success gate.
- Stable facts:
1. Scenario remains rolling-restart.
2. Package lane is `causal-escalation`.
3. Declared owner boundary remains `startup_active_gate_owner / snapshot_coverage`.
4. Durable contract record is `architecture/contracts/active-gate-convergence.md#active-gate-convergence`.
- Changed facts:
1. Fresh evidence drained priority-recovery residuals.
2. The current package is the selected observation-layer architecture-route implementation.
- Competing theories:
1. H1 current evidence contains a non-repeated startup active-gate observation route in the handoff decision contract.
2. H2 the next move is owner-boundary migration.
3. H3 no route is selectable, so architecture-gap stop is correct.
- Eliminated theories:
1. Another architecture-gap analysis is eliminated by implement-pending route history.
2. Priority recovery remains first frontier is eliminated by zero residual witnesses.
- Downstream symptoms:
1. startup readiness support evidence remains downstream.
2. benchmark table partition visibility remains downstream.
- Transition table:
1. Input `owner_reconcile_pending`; owner `startup_active_gate_owner / snapshot_coverage`; missing `selected snapshot retry evidence must become a named owner-owned observation transition, migration, or stop`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence`; falsifier `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`; migration trigger `focused proof names a different deciding owner boundary`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: runtime edits are allowed only for the selected architecture route and must stay within the declared owner-owned transition or migration proof.

## Slice Theory

- System theory reference: `architecture/contracts/active-gate-convergence.md#active-gate-convergence`
- Selected system theory: H1 is selected unless the focused handoff contract falsifier proves a different owner boundary or architecture gap.
- Selected mechanism: `contract_gap` with `ownership_gap` as the first alternate.
- Source/test contract: implementation may edit only `src/control-plane/publication-active-gate-handoff-contract-decision.js` for the selected observation route.
- Falsifier: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`
- Representative expected movement: selected route records a concrete observation transition, owner-boundary migration, or architecture-gap stop.
- Redirect rule: stop on unchanged same-frontier/no-reduction evidence instead of widening runtime scope.
- Theory-fit score:
1. Evidence fit: medium - fresh evidence is concrete but still red.
2. Owner-boundary fit: high - owner boundary is selected by route evidence and current blocker.
3. Falsifiability: high - focused contract proof can reject the selected source route.
4. Representative movement: medium - focused proof precedes a later representative rerun.
5. Downstream risk containment: high - downstream symptoms remain frozen until route selection.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside write scope
3. proof cannot select a concrete transition or migration

## Architecture Route Decision

- Selected layer: `observation`
- Selected architecture gate choice: `continue-local-proof`
- Trigger evidence: fresh route returned to active-gate snapshot coverage; priority recovery residual witnesses are zero; frontier-history reports `architectureRouteState=implement-pending`.
- Runtime promotion: allowed only for the selected architecture route.
- Successor rule: after focused proof, rerun or route representative evidence and continue from reduction, migration, representative green, or architecture-gap.

## Observable Prediction

- Metric: rolling-restart active-gate observation route
- Predicted: focused proof selects a concrete owner-owned observation transition for selected snapshot retry.
- Observed: focused proof and the discriminator probe select `wait_owner_recovery` when selected snapshot recovery is the only live debt, instead of scheduling membership publication reconcile from a reconcile-required snapshot.
- Accuracy: partial
- Evidence: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`; `npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`; `node --input-type=module` selected snapshot recovery-only discriminator probe
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- Expected delta: focused proof selects a non-repeated observation route; later representative evidence reduces active-gate, migrates, goes green, or records architecture-gap.
- Local proof class: focused owner proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result after the selected route.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction records architecture-gap or successor action instead of widening this local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `owner_reconcile_pending`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## In Scope

1. work/packages/active-20260531-rolling-restart-active-gate-observation-route.md
2. src/control-plane/publication-active-gate-handoff-contract-decision.js
3. work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md
4. work/sprints/done-2026-q2-rolling-restart-contract-first-green-theory-loop.md
5. work/theory-ledger.md
6. work/sprints/current-blocker.json
7. work/sprints/current-blocker.md

## Out Of Scope

1. Startup readiness, priority recovery, and benchmark visibility patches.
2. Runtime source files outside declared write scope unless focused proof escalates.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `architecture-route-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260531-rolling-restart-active-gate-observation-route.md`, `work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md`, `src/control-plane/publication-active-gate-handoff-contract-decision.js`, `work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md`, `work/sprints/done-2026-q2-rolling-restart-contract-first-green-theory-loop.md`, `work/theory-ledger.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Candidate runtime files: `src/control-plane/publication-active-gate-handoff-contract-decision.js`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/publication-active-gate-handoff-contract-selection.js`, `src/control-plane/membership-publication-active-gate-reconcile.js`
- Do-not-edit scope: `src/` outside declared write scope.
- Frozen decisions: source promotion is limited to the selected observation route.
- Focused proof: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js`; `npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`; `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`; `npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`; `npm run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: selected observation-route implementation only.
- Safe to execute when:
1. owner, boundary, write scope, proof, and kill rule stay as declared
2. the executor modifies only the declared source route
3. proof gives a clear transition, migration, representative-green, or architecture-gap signal
- Split or escalate when:
1. proof requires runtime source outside declared write scope
2. proof selects a different owner boundary
3. evidence contradicts the current route

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.

- [x] action: freshness-review; owner: Agent Avicenna (019e7d86-ec83-7020-8d06-c24c08a4756d); files-changed: none; validation: npm run work:context passed; npm run work:package:doctor -- --suggest work/packages/active-20260531-rolling-restart-active-gate-observation-route.md failed only on expected missing checked evidence before this ledger update; npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-active-gate-observation-route.md passed; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed with architectureRouteState=implement-pending; npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage passed; decision: fresh; outcome: validated.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/control-plane/publication-active-gate-handoff-contract-decision.js, work/packages/active-20260531-rolling-restart-active-gate-observation-route.md; validation: npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-active-gate-observation-route.md passed; npm run work:validate -- --pre-impl work/packages/active-20260531-rolling-restart-active-gate-observation-route.md passed; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js passed; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js passed; npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract-decision.js passed; node --input-type=module selected snapshot recovery-only discriminator probe passed with nextAction=wait_owner_recovery and no pendingReconcileNodeIds; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed with architectureRouteState=implement-pending; npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage passed; npm run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json passed; parent revalidated focused proof: yes; outcome: validated - selected snapshot recovery-only evidence now reaches wait_owner_recovery instead of membership publication reconcile.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/active-20260531-rolling-restart-active-gate-observation-route.md; validation: git diff --check -- src/control-plane/publication-active-gate-handoff-contract-decision.js work/packages/active-20260531-rolling-restart-active-gate-observation-route.md passed; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js passed; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js passed; parent revalidated focused proof: yes; decision: source diff stays inside declared write scope and matches the observation-route intent; source fix applied: no; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair passed; outcome: repaired.

## Validation

1. falsifier: npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js
2. regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js
3. supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage
5. supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json

## Commit And Push Ledger

1. Focused package commit: b9d572ce14599273d27327e9275000038c9544c2
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-31T11:35:42.382Z