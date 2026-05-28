# Startup Active Gate Owner - Snapshot Coverage V3

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "nextAction": "Triage active_gate_timed_out with SQL query engine not available in control plane",
    "closed": "2026-05-28",
    "successor": "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v4.md"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "src/control-plane/snapshot-service.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "src/control-plane/snapshot-service.js",
      "work/packages/active-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md",
      "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "closureSummary": {
    "resultClassification": "same-frontier",
    "predictionAccuracy": "partial",
    "observedMovement": "Fresh representative evidence stayed on startup_active_gate_owner / snapshot_coverage / active_gate_timed_out but exposed SQL query engine unavailable during active-gate visibility.",
    "successorReason": "The next package needed a source successor for SQL query engine availability diagnostics instead of another generic snapshot coverage patch.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v3-20260528T142633Z.report.json"
  },
  "modelFit": {
    "packageClass": "causal-escalation",
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
      "theory-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json",
        "regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown",
        "supporting: npm run work:advance -- --check"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "src/control-plane/membership-publication-active-gate-reconcile.js",
        "src/control-plane/snapshot-service.js",
        "work/packages/active-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Triage active_gate_timed_out with SQL query engine not available in control plane",
    "sprintGoalDelta": "Triage active_gate_timed_out with SQL query engine not available in control plane",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "supported"
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json",
    "frontier": "active_gate_timed_out / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Triage active_gate_timed_out with SQL query engine not available in control plane"
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "missingTransitionOrObservation": "Triage active_gate_timed_out with SQL query engine not available in control plane",
    "smallestFalsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "Triage active_gate_timed_out with SQL query engine not available in control plane",
    "observed": "same-frontier route with SQL query engine unavailable in active-gate visibility",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v3-20260528T142633Z.report.json"
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
    "sourceArtifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v3-20260528T142633Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v3-20260528T142633Z.report.json --package work/packages/active-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md --successor work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v4.md",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Triage active_gate_timed_out with SQL query engine not available in control plane.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json",
    "expectedCausalModelChange": "Triage active_gate_timed_out with SQL query engine not available in control plane.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "startup_active_gate_owner / snapshot_coverage needs SQL query engine availability verification under rolling restart load.",
    "crossBoundaryReview": "No edits outside declared writeScope."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active gate snapshot coverage v3",
    "phaseChain": [
      "fresh representative rerun routes to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
      "src/control-plane/membership-publication-active-gate-reconcile.js and snapshot-service.js were modified",
      "the next step is to triage SQL query engine availability under load"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "SQL query engine availability timeout"
    ],
    "missingCausalEdge": "SQL query engine unavailable on restarted node startup.",
    "missingCausalEdgeProbe": "npm run work:advance -- --check",
    "falsifyingProbe": "npm run work:advance -- --check",
    "boundedProgressProof": "reconcile retry loop under load pressure",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json",
    "expectedObservableTransition": "SQL query engine recovery or classification migration",
    "maxProgressBound": "one runtime package only",
    "sameFrontierFallback": "If fresh representative evidence repeats the same frontier with no progress, stop for causal escalation.",
    "expectedNextFrontier": "rolling-restart startup active-gate snapshot coverage v3",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "This package is causal-escalation because the validator rejected a third runtime-owner-boundary package for startup_active_gate_owner/snapshot_coverage.",
    "handoffInvariant": "Startup active-gate snapshot coverage retry loop must not promote runtime coverage while snapshot coverage is incomplete."
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json.",
      "active_gate_timed_out is the current selected symptom.",
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
      "This package was opened from test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json.",
      "The active action is Triage active_gate_timed_out with SQL query engine not available in control plane."
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
        "falsifier": "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json",
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
    "systemTheoryRef": "work/packages/todo-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/control-plane/membership-publication-active-gate-reconcile.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json.",
      "representativeMovement": "medium - expected movement is route selection, migration, or architecture-gap stop.",
      "downstreamRiskContainment": "high - downstream symptoms remain frozen until owner selection is proven."
    },
    "wrongSliceTriggers": [
      "proof selects a different owner boundary",
      "proof requires runtime files outside writeScope",
      "proof cannot select a concrete transition or migration"
    ]
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "src/control-plane/snapshot-service.js",
      "work/packages/active-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes active_gate_timed_out there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Triage active_gate_timed_out with SQL query engine not available in control plane for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: Triage active_gate_timed_out with SQL query engine not available in control plane.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Triage active_gate_timed_out with SQL query engine not available in control plane | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## System Theory

- Problem statement: rolling-restart currently routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json.
2. active_gate_timed_out is the current selected symptom.
3. startup_active_gate_owner / snapshot_coverage is the declared decision boundary for this package.
- Owner-boundary map:
1. startup_active_gate_owner / snapshot_coverage: selected package owner and boundary.
2. Downstream owners remain frozen until the falsifier selects migration.
- Stable facts:
1. Scenario remains rolling-restart.
2. Package lane remains runtime-owner-boundary.
3. Declared owner boundary remains startup_active_gate_owner / snapshot_coverage.
- Changed facts:
1. This package was opened from test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json.
2. The active action is Triage active_gate_timed_out with SQL query engine not available in control plane.
- Competing theories:
1. H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for active_gate_timed_out.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `active_gate_timed_out`; owner `startup_active_gate_owner / snapshot_coverage`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/todo-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md systemTheory
- Selected system theory: H1 is selected unless npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/control-plane/membership-publication-active-gate-reconcile.js and src/control-plane/snapshot-service.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Kill rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.
3. Falsifiability: high - falsifier is npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Triage active_gate_timed_out with SQL query engine not available in control plane
- Sprint-goal delta: Triage active_gate_timed_out with SQL query engine not available in control plane
- Required source write: `src/control-plane/membership-publication-active-gate-reconcile.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, recording the theory result, and creating or linking the successor package before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, and source/log inspection-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: Triage active_gate_timed_out with SQL query engine not available in control plane
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. In a theory-loop package, package/sprint/tracker/ledger-only work is not a closure shape; keep classification evidence in the sprint, run representative evidence, and create or activate the next `src/` successor package instead of closing as classification-only.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/control-plane/membership-publication-active-gate-reconcile.js
2. src/control-plane/snapshot-service.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/membership-publication-active-gate-reconcile.js`, `src/control-plane/snapshot-service.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown`
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

- [x] theory: theory-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract; result: supported; evidence: Fresh representative rerun test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v3-20260528T142633Z.report.json stayed on startup_active_gate_owner/snapshot_coverage and exposed SQL query engine unavailable during active-gate visibility.; files: src/control-plane/membership-publication-active-gate-reconcile.js, src/control-plane/snapshot-service.js; validation: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v3-20260528T142633Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; npm run analyze:causal-model -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v3-20260528T142633Z.report.json; next: Activate v4 source successor for SQL query engine availability diagnostics..

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/control-plane/membership-publication-active-gate-reconcile.js, src/control-plane/snapshot-service.js, work/packages/active-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md; validation: npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown; npm test -- test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/membership-publication-coordinator-main-stage-2b.js test/control-plane/membership-publication-coordinator-main-stage-2c.js; node scripts/check-guideline-literals.js src/control-plane/membership-publication-active-gate-reconcile.js src/control-plane/snapshot-service.js; node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-active-gate-reconcile.js src/control-plane/snapshot-service.js; npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-active-gate-reconcile.js src/control-plane/snapshot-service.js; git diff --check -- src/control-plane/membership-publication-active-gate-reconcile.js src/control-plane/snapshot-service.js work/packages/active-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md; npm run work:advance -- --check; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/active-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md; validation: reviewed scoped diff for owner-boundary and private-queue access; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown; npm test -- test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/membership-publication-coordinator-main-stage-2b.js test/control-plane/membership-publication-coordinator-main-stage-2c.js; node scripts/check-guideline-literals.js src/control-plane/membership-publication-active-gate-reconcile.js src/control-plane/snapshot-service.js; node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-active-gate-reconcile.js src/control-plane/snapshot-service.js; npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-active-gate-reconcile.js src/control-plane/snapshot-service.js; git diff --check -- src/control-plane/membership-publication-active-gate-reconcile.js src/control-plane/snapshot-service.js work/packages/active-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md; parent revalidated focused proof: yes; outcome: validated.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-reconcile-pending-recovery-contract-20260528T143000Z.report.json --markdown

## Commit And Push Ledger

1. Focused package commit: 113e49652393c97459313210da954bcd06661994
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
