# Rolling Restart Active Gate Snapshot Coverage Source Contract

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Fresh representative evidence cleared priority-recovery residuals and returned to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage; the sprint remains active until rolling-restart passes or this source theory proves migration or architecture-gap stop.",
    "nextAction": "Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result.",
    "predecessor": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md"
  },
  "scope": {
    "writeScope": [
      "src/control-plane/snapshot-service.js",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/schemas/work-package.schema.json",
      ".kiro/steering/workflow-guidelines/closure.md",
      "scripts/work-package-new.js",
      "scripts/work-package-schema.js",
      "scripts/work-sprint-advance.js",
      "scripts/work-theory-loop.js",
      "scripts/work-tracker.js",
      "test/scripts/work-theory-loop.test.js",
      "work/README.md",
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md",
      "test/scripts/work-theory-loop-hardening.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/control-plane/owner-queue.js",
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "src/admin/admin-control-snapshot-publication-convergence-diagnostics.js"
    ],
    "commitScope": [
      "src/control-plane/snapshot-service.js",
      ".kiro/steering/llm/governance.md",
      ".kiro/steering/llm/rules.json",
      ".kiro/steering/schemas/work-package.schema.json",
      ".kiro/steering/workflow-guidelines/closure.md",
      "scripts/work-package-new.js",
      "scripts/work-package-schema.js",
      "scripts/work-sprint-advance.js",
      "scripts/work-theory-loop.js",
      "scripts/work-tracker.js",
      "test/scripts/work-theory-loop.test.js",
      "work/README.md",
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md",
      "test/scripts/work-theory-loop-hardening.test.js",
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md"
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
      "theory-20260522-snapshot-watch-handoff-contract",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap",
      "theory-20260526-rolling-restart-restarted-node-admin-surface",
      "theory-20260526-rolling-restart-control-snapshot-authority-recovery"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "regression: npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
        "supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
        "supporting: timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-snapshot-coverage-source-contract-20260528T122757Z.report.json --fast-local --verbose && npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-snapshot-coverage-source-contract-20260528T122757Z.report.json --package work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result.",
    "sprintGoalDelta": "Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result.",
    "sourceChangeRequired": true,
    "successorRequired": true
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "frontier": "active_gate_timed_out / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "Fresh representative evidence after the src/control-plane/snapshot-service.js source theory moves from same-frontier active_gate_timed_out to reduced, migrated, architecture-gap, or representative-green.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-representative-rerun"
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json selects startup_active_gate_owner / snapshot_coverage.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Fresh representative evidence cleared priority-recovery residuals and returned to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage; the sprint remains active until rolling-restart passes or this source theory proves migration or architecture-gap stop.",
    "missingTransitionOrObservation": "Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result.",
    "smallestFalsifyingProbe": "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
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
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "causal-escalation",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Repeated startup active-gate snapshot coverage failures require an architecture discriminator before another local runtime patch.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "expectedCausalModelChange": "The package selects a concrete wake, retry, reconcile, drain, owner-boundary migration, or architecture-gap stop for snapshot coverage progress.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Recent packages already exercised startup_active_gate_owner / snapshot_coverage runtime routes, and fresh evidence again reports active_gate_timed_out after priority-recovery residuals clear.",
    "crossBoundaryReview": "Operation workflow, generic rebalancer, transport, admin API, table bootstrap, generic timeout, and promotion gates remain frozen unless canonical proof selects them."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active gate snapshot coverage autonomous architecture",
    "phaseChain": [
      "owner recovery queue drain proof moved priority recovery to the first frontier",
      "priority recovery architecture rerun cleared priority residual witnesses",
      "fresh route returned to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "benchmark table bootstrap remains downstream while active gate snapshot coverage is incomplete",
      "selected-source timeout remains downstream until the owner coverage contract is selected",
      "startup readiness remains downstream unless the architecture proof migrates ownership"
    ],
    "missingCausalEdge": "The owner-owned snapshot coverage contract must choose wake, retry, reconcile, drain, handoff, or migration before runtime implementation resumes.",
    "missingCausalEdgeProbe": "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Architecture must select a concrete wake, retry, reconcile, drain, dispatch, or owner-boundary migration mechanism before runtime edits resume.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "expectedObservableTransition": "selected snapshot coverage contract, owner-boundary migration, or architecture-gap stop",
    "maxProgressBound": "one autonomous architecture experiment with no runtime edits",
    "sameFrontierFallback": "If the architecture proof cannot select a concrete contract or migration, stop as architecture-gap.",
    "expectedNextFrontier": "selected startup active-gate snapshot coverage contract or migration",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "done-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "done-20260528-priority-recovery-split-residual-architecture-experiment.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This package is activated because validator same-frontier rules rejected another startup_active_gate_owner / snapshot_coverage runtime package.",
    "handoffInvariant": "Runtime promotion remains blocked until this architecture package selects one owner-owned contract or migration route."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "route-after-rerun selected startup_active_gate_owner / snapshot_coverage",
      "priority recovery residual witness count is 0",
      "validator rejected another runtime-owner-boundary package for this repeated snapshot coverage frontier"
    ],
    "selectedChoice": "runtime-owner-boundary",
    "nextAction": "Open the runtime-owner-boundary successor package for startup active-gate snapshot coverage.",
    "choices": [
      {
        "id": "runtime-owner-boundary",
        "summary": "Open runtime-owner-boundary successor for startup active-gate snapshot coverage.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
        ]
      },
      {
        "id": "autonomous-architecture-experiment",
        "summary": "Use this package to select the snapshot coverage contract before runtime implementation resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
          "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate only if canonical proof names a different deciding owner.",
        "route": "owner-boundary-migration",
        "proof": [
          "selected by this package before runtime edits"
        ]
      }
    ]
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json.",
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
      "This package was opened from test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json.",
      "The active action is Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result.."
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
        "falsifier": "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
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
    "systemTheoryRef": "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/control-plane/snapshot-service.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage.",
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

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes active_gate_timed_out there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result. for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json; falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12; regression: npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js; supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json; supporting: timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-snapshot-coverage-source-contract-20260528T122757Z.report.json --fast-local --verbose && npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-snapshot-coverage-source-contract-20260528T122757Z.report.json --package work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## System Theory

- Problem statement: rolling-restart currently routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json.
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
1. This package was opened from test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json.
2. The active action is Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result..
- Competing theories:
1. H1 startup_active_gate_owner / snapshot_coverage owns the missing transition for active_gate_timed_out.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `active_gate_timed_out`; owner `startup_active_gate_owner / snapshot_coverage`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/control-plane/snapshot-service.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Kill rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.
3. Falsifiability: high - falsifier is falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result.
- Sprint-goal delta: Test the promoted snapshot coverage source contract in src/control-plane/snapshot-service.js, run the route falsifier and regression proof, record the theory-loop result, rerun representative rolling-restart evidence, and create the successor package from that fresh result.
- Required source write: `src/control-plane/snapshot-service.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, recording the theory result, and creating or linking the successor package before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, and source/log inspection-only outcomes stay in the sprint and must not become work packages.




## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: Fresh representative evidence after the src/control-plane/snapshot-service.js source theory moves from same-frontier active_gate_timed_out to reduced, migrated, architecture-gap, or representative-green.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. In a theory-loop package, package/sprint/tracker/ledger-only work is not a closure shape; keep classification evidence in the sprint, run representative evidence, and create or activate the next `src/` successor package instead of closing as classification-only.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/control-plane/snapshot-service.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/snapshot-service.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`, `supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`, `regression: npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js`, `supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json`, `supporting: timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-snapshot-coverage-source-contract-20260528T122757Z.report.json --fast-local --verbose && npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-snapshot-coverage-source-contract-20260528T122757Z.report.json --package work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md`
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

- [ ] action: implementation; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: verification-fix; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: verifier reruns focused proof and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: pending.

## Validation

1. falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
2. supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12
3. regression: npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js
4. supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json
5. supporting: timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-snapshot-coverage-source-contract-20260528T122757Z.report.json --fast-local --verbose && npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-snapshot-coverage-source-contract-20260528T122757Z.report.json --package work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract.md
