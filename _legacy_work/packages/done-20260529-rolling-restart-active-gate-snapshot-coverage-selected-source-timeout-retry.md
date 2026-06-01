# Rolling Restart Active Gate Snapshot Coverage Selected Source Timeout Retry

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
    "currentState": "Priority recovery is satisfied with zero residual witnesses, and fresh representative evidence selects active_gate_snapshot_coverage with snapshot coverage 1/5, selected_snapshot_source_timeout, and snapshot_repair_deferred under startup_active_gate_owner / snapshot_coverage.",
    "nextAction": "Test whether selected snapshot source timeout plus repair_deferred needs a bounded snapshot repair retry transition before another representative rerun.",
    "predecessor": "work/packages/done-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md",
    "closed": "2026-05-29",
    "successor": "work/packages/superseded-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md"
  },
  "scope": {
    "writeScope": [
      "src/admin/admin-control-snapshot-repair-diagnostics.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "src/control-plane/publication-active-gate-handoff-contract-decision.js",
      "src/control-plane/publication-active-gate-handoff-contract-evidence.js"
    ],
    "commitScope": [
      "src/admin/admin-control-snapshot-repair-diagnostics.js",
      "work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md",
      "work/packages/superseded-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md",
      "work/packages/done-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The representative rerun cleared priority recovery and returned the first frontier to active-gate snapshot coverage, so this is the next rolling-restart gate."
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "runtime ownership changes",
      "representative scenario evidence changes"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
        "regression: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/control-plane/publication-active-gate-handoff-contract.test.js",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
      ]
    }
  },
  "systemTheoryRevision": true,
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Selected snapshot source timeout plus repair_deferred must produce a bounded snapshot repair retry/progress transition, migrate owner boundary, or stop as architecture-gap.",
    "sprintGoalDelta": "active_gate_snapshot_coverage reduces selected snapshot timeout/deferred repair evidence, increases snapshot coverage, migrates owner boundary, records architecture-gap, or representative turns green after one startup_active_gate_owner / snapshot_coverage source package.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "migrated",
    "successorPackage": "work/packages/superseded-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md"
  },
  "theoryLedger": "planned-new-theory; no ledger update: result is recorded in this package closure and the fresh representative artifact migrated back to operation_workflow_owner / rebalancer_handoff with one priority-recovery residual witness.",
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Activate the priority-recovery rebalancer handoff event-wait residual successor before another representative rerun."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Priority recovery is satisfied with zero residual witnesses and priority_recovery_partition_progress is no longer a frontier.",
    "changedFacts": "Fresh representative evidence selects active_gate_snapshot_coverage with snapshot coverage 1/5, selected_snapshot_source_timeout, and snapshot_repair_deferred.",
    "rejectedAlternatives": "Classification-only, evidence-only, route-only, and downstream symptom packages are not valid closure shapes in this source-code theory-loop sprint.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Test the selected snapshot source timeout repair-deferred retry transition.",
    "missingTransitionOrObservation": "Selected snapshot source timeout plus repair_deferred must become a bounded owner-owned retry, coverage progress, migration, or architecture-gap stop.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Same-frontier with no concrete reduction opens/selects an autonomous architecture experiment instead of another local active-gate patch.",
    "escalationRule": "Same-frontier/no-reduction after this source package stops local active-gate patches."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "active_gate_snapshot_coverage reduces selected snapshot timeout/deferred repair evidence, increases snapshot coverage, migrates owner boundary, records architecture-gap, or representative turns green after one startup_active_gate_owner / snapshot_coverage source package.",
    "observed": "Focused active-gate snapshot repair proof and regression passed; fresh rolling-restart representative evidence stayed red but the first frontier migrated to priority_recovery_partition_progress with one operation_workflow_owner / rebalancer_handoff residual witness, while active_gate_snapshot_coverage remains the next expected frontier.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown"
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused active-gate snapshot repair proof passed; fresh rolling-restart representative evidence stayed red but migrated the first frontier to priority_recovery_partition_progress with one operation_workflow_owner / rebalancer_handoff residual witness.",
    "successorReason": "Rolling-restart is not representative-green yet, so the next theory-loop source package targets the fresh priority_recovery_event_driven_wait residual instead of widening active-gate snapshot coverage.",
    "nextOwnerBoundary": "operation_workflow_owner / rebalancer_handoff",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "rebalancer_handoff",
    "reason": "Focused active-gate snapshot repair proof passed, but the fresh representative rerun selected priority_recovery_partition_progress as the first frontier with one residual witness.",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown"
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
      "write scope expands beyond the declared package",
      "proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children only if execution becomes unambiguous and disjoint.",
      "Create an autonomous architecture experiment if same-frontier/no-reduction repeats after this source package."
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
    "expectedDelta": "active_gate_snapshot_coverage reduces selected snapshot timeout/deferred repair evidence, increases snapshot coverage, migrates owner boundary, records architecture-gap, or representative turns green after one startup_active_gate_owner / snapshot_coverage source package.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "After priority recovery is satisfied, rolling-restart remains red because selected snapshot source timeout plus repair_deferred does not expose a bounded snapshot repair retry/progress transition under startup_active_gate_owner / snapshot_coverage.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedCausalModelChange": "Focused snapshot repair proof should reduce selected timeout/deferred repair evidence, increase snapshot coverage, migrate owner boundary, record architecture-gap, or enable representative green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Current artifact has one priority-recovery witness on replica_operations-p1 with recovering_in_flight, retry_scheduled, dispatched_waiting_progress evidence under operation_workflow_owner / rebalancer_handoff.",
    "crossBoundaryReview": "Do not widen active-gate snapshot coverage; the successor targets operation_workflow_owner / rebalancer_handoff."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active gate selected snapshot source timeout repair deferred retry",
    "phaseChain": [
      "active-gate owner-recovery queue-drain proof made selectedMembershipPublicationHandoffOutcome.enqueued true",
      "dispatch-pending priority-recovery proof passed and fresh representative evidence reports zero priority recovery residual witnesses",
      "priority_recovery_partition_progress is satisfied and no longer a frontier",
      "fresh representative evidence returns to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with selected_snapshot_source_timeout and snapshot_repair_deferred"
    ],
    "recentFrontierHistory": [
      "work/packages/done-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md reduced this family once before priority recovery reopened",
      "work/packages/done-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md migrated from active gate to priority recovery",
      "work/packages/done-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md satisfied the priority recovery frontier"
    ],
    "oscillationCheck": "The active-gate snapshot coverage family has repeated; this package gets one source slice for the fresh selected timeout/repair_deferred shape before same-frontier/no-reduction opens/selects autonomous architecture work.",
    "handoffInvariant": "Priority recovery stays closed while active-gate snapshot coverage owns the first frontier; startup readiness and benchmark visibility remain downstream until snapshot coverage improves.",
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "startup readiness remains downstream of active-gate snapshot coverage",
      "benchmark_events partition visibility remains downstream while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "selected snapshot source timeout plus snapshot_repair_deferred needs a bounded retry, coverage-progress, migration, or architecture-gap transition.",
    "missingCausalEdgeProbe": "npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "falsifyingProbe": "npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "boundedProgressProof": "Focused proof must show a concrete retry, dispatch, handoff, timeout, advance, wake, or bounded progress mechanism for selected snapshot repair-deferred retry.",
    "boundedProgressProofArtifact": "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "expectedObservableTransition": "active_gate_snapshot_coverage reduces selected snapshot timeout/deferred repair evidence, increases snapshot coverage, migrates owner boundary, records architecture-gap, or representative turns green.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage source package before representative rerun and route recording",
    "sameFrontierFallback": "Unchanged active_gate_snapshot_coverage selected_snapshot_source_timeout and snapshot_repair_deferred evidence after this source package triggers architecture rederive instead of another adjacent local patch.",
    "expectedNextFrontier": "snapshot coverage improves, selected snapshot timeout/deferred repair reduces, owner-boundary migration, representative-green, or architecture-gap",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "priority recovery is satisfied with zero residual witnesses",
      "active_gate_snapshot_coverage remains the first frontier with selected_snapshot_source_timeout and snapshot_repair_deferred",
      "startup_active_gate_owner / snapshot_coverage has repeated active-gate contract-gap history"
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute the bounded selected-source repair-deferred retry proof for the current active-gate witness shape.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Open architecture rederive if focused proof cannot select a bounded owner-owned retry transition.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
        ]
      }
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Execute the selected repair-deferred retry proof before another representative rerun."
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes snapshot_coverage_incomplete to startup_active_gate_owner / snapshot_coverage after priority recovery is satisfied; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "priority recovery residual extraction reports zero witnesses.",
      "active_gate_snapshot_coverage is the current selected symptom.",
      "startup_active_gate_owner / snapshot_coverage is the declared decision boundary for this package."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage: selected package owner and boundary.",
      "operation_workflow_owner / rebalancer_handoff: satisfied for priority recovery in the current artifact.",
      "Downstream owners remain frozen until the falsifier selects migration."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane remains causal-escalation.",
      "Declared owner boundary remains startup_active_gate_owner / snapshot_coverage.",
      "Priority recovery is satisfied in the current representative artifact."
    ],
    "changedFacts": [
      "Fresh representative evidence now selects active_gate_snapshot_coverage with snapshot coverage 1/5.",
      "The active-gate source shows selected_snapshot_source_timeout and snapshot_repair_deferred."
    ],
    "competingTheories": [
      "H1 startup_active_gate_owner / snapshot_coverage owns the missing selected-source repair retry transition.",
      "H2 the same symptom is inherited from stale instrumentation, a diagnostics gap, or a different owner boundary.",
      "H3 repeated same-frontier/no-reduction after this package means an architecture experiment is required before another local patch."
    ],
    "eliminatedTheories": [
      "Priority recovery is not the current first frontier because residual witnesses are zero and priority_recovery_partition_progress is satisfied."
    ],
    "downstreamSymptoms": [
      "Startup readiness remains downstream of active-gate snapshot coverage.",
      "benchmark_events partition visibility remains downstream while active-gate snapshot coverage is incomplete."
    ],
    "transitionTable": [
      {
        "inputSignal": "snapshot_coverage_incomplete / selected_snapshot_source_timeout / snapshot_repair_deferred",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "selected evidence must become a named owner-owned retry, migration, or stop.",
        "expectedEvidence": "focused proof selects the transition, migrates ownership, or records architecture-gap evidence.",
        "falsifier": "falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
        "migrationTrigger": "the falsifier names a different owner boundary or proves this boundary cannot own the transition."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when focused evidence names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.",
      "Open/select autonomous architecture work when fresh representative evidence repeats same-frontier/no-reduction after this source package."
    ],
    "wholeSystemInvariant": "Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless the falsifier proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source file src/admin/admin-control-snapshot-repair-diagnostics.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, representative green, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier/no-reduction evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - representative evidence selects the same active-gate family but a fresh post-priority-recovery artifact.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is the admin snapshot repair handoff outcome suite.",
      "representativeMovement": "medium - expected movement is metric reduction, migration, architecture-gap, or green.",
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

This package owns the fresh `startup_active_gate_owner / snapshot_coverage` frontier after the priority-recovery package moved. It is a source-code theory-loop package, not a classifier: the only runtime file in write scope is `src/admin/admin-control-snapshot-repair-diagnostics.js`.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, write scope, proof, and same-frontier stop rule are declared.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: `startup_active_gate_owner / snapshot_coverage` must classify or advance selected snapshot repair-deferred retry for `snapshot_coverage_incomplete`.
- Inputs/signals: active-gate snapshot coverage explain, selected snapshot timeout, repair-deferred observation, and priority-recovery residual extractor.
- State model or invariant: priority recovery remains satisfied; active-gate snapshot coverage owns the first frontier until the focused proof selects migration or architecture-gap.
- Non-goals and forbidden interpretations: do not patch startup readiness, benchmark visibility, generic transport, priority recovery, or publication ACK in this package.
- Proof mapping: the admin snapshot repair handoff outcome suite proves the local owner transition; topology and scenario-route commands prove representative route shape.
- Wrong-slice trigger: stop or split if the focused proof needs files outside `src/admin/admin-control-snapshot-repair-diagnostics.js`.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| active-gate snapshot coverage | `selected_snapshot_source_timeout` plus `snapshot_repair_deferred` | selected source repair retry is not producing bounded progress | test bounded retry/progress transition | timeout/deferred repair evidence reduces, coverage increases, migration, architecture-gap, or green | `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js` |
| priority recovery | `0` residual witnesses | priority recovery is no longer first frontier | freeze operation workflow edits | priority recovery remains satisfied | `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown` |
| scope boundary | one admin source file | proof outside this file means this package is wrong slice | stop, split, or migrate | no widened runtime scope | `npm run work:advance -- --check` |

- Anti-symptom rationale: this package targets the current first frontier, not downstream readiness or benchmark visibility symptoms.
- Falsifying focused probe: `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
- Competing explanations: selected-source retry debt, stale instrumentation, downstream lag, or wrong-owner routing.
- Systemic interaction scan: check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: unchanged same-frontier/no-reduction after this source package opens/selects autonomous architecture work instead of another local active-gate patch.
- Oscillation guard: this is not another same-frontier symptom patch because the fresh artifact first eliminated the operation-workflow priority-recovery frontier, now exposes a concrete selected_snapshot_source_timeout plus snapshot_repair_deferred active-gate witness, and this package has a one-source-slice stop rule that opens/selects autonomous architecture work on unchanged same-frontier/no-reduction evidence.

## Decision Experiment Gate

- Decision question: Does `startup_active_gate_owner / snapshot_coverage` still own selected snapshot source timeout plus repair-deferred retry, and what exact transition must move?
- Architecture review: before runtime edits, confirm whether this is local owner-boundary work, owner-boundary migration, autonomous architecture experiment, or contradictory evidence.
- Competing hypotheses: selected-source repair retry debt; stale instrumentation; downstream lag; different owner boundary; architecture gap.
- Pre-edit focused probe: `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
- Success metrics: selected timeout/deferred repair evidence reduces, snapshot coverage increases, owner-boundary migrates, architecture-gap records, or representative turns green.
- Representative rerun: `timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`
- Kill rule: if fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for autonomous architecture work instead of another local patch.

## System Theory

- Problem statement: rolling-restart now routes `snapshot_coverage_incomplete` to `startup_active_gate_owner / snapshot_coverage` after priority recovery is satisfied.
- Phase chain:
1. Active-gate queue-drain work made selected handoff enqueue bounded queue-drain work.
2. Dispatch-pending priority-recovery proof passed locally.
3. Fresh representative evidence reports zero priority recovery residual witnesses.
4. Fresh representative evidence selects active-gate snapshot coverage with selected snapshot timeout and repair deferred.
- Owner-boundary map:
1. `startup_active_gate_owner / snapshot_coverage`: selected package owner and boundary.
2. `operation_workflow_owner / rebalancer_handoff`: satisfied for priority recovery in the current artifact.
3. Downstream readiness and benchmark owners remain frozen.
- Stable facts:
1. Scenario remains `rolling-restart`.
2. Priority recovery residual witnesses are zero.
3. Active-gate snapshot coverage is the first frontier.
- Changed facts:
1. The fresh artifact moved away from priority recovery.
2. Active-gate evidence reports `snapshotCoverageNodeCount=1`, `expectedNodeCount=5`, selected snapshot timeout, and repair deferred.
- Competing theories:
1. H1: the admin snapshot repair diagnostics owner must emit a bounded retry/progress transition.
2. H2: evidence is stale or missing a diagnostic transition.
3. H3: a different owner boundary or architecture gap owns the next move.
- Eliminated theories:
1. Priority recovery is not the current first frontier.
- Downstream symptoms:
1. Startup readiness remains downstream.
2. `benchmark_events` visibility remains downstream.
- Transition table:
1. Input `selected_snapshot_source_timeout / snapshot_repair_deferred`; owner `startup_active_gate_owner / snapshot_coverage`; missing transition `bounded retry/progress`; expected evidence `focused proof plus representative reduction`; falsifier `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`; migration trigger `focused proof names another owner`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
2. Stop for autonomous architecture work when same-frontier/no-reduction repeats after this source package.
- Whole-system invariant: runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: `work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md` systemTheory
- Selected system theory: H1 is selected unless the falsifier proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate.
- Source/test contract: implementation may edit only `src/admin/admin-control-snapshot-repair-diagnostics.js`.
- Falsifier: `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
- Representative expected movement: selected route moves to concrete transition, owner-boundary migration, representative green, or architecture-gap stop.
- Kill rule: stop on unchanged same-frontier/no-reduction evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium, because the active-gate family repeats but the fresh artifact changed after priority recovery was satisfied.
2. Owner-boundary fit: medium, because the current route declares `startup_active_gate_owner / snapshot_coverage`.
3. Falsifiability: high, because the admin snapshot repair suite is focused.
4. Representative movement: medium, because the required movement is metric reduction, migration, architecture-gap, or green.
5. Downstream risk containment: high, because downstream symptoms remain frozen.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: selected snapshot source timeout plus repair_deferred must produce a bounded snapshot repair retry/progress transition, migrate owner boundary, or stop as architecture-gap.
- Sprint-goal delta: active_gate_snapshot_coverage reduces selected snapshot timeout/deferred repair evidence, increases snapshot coverage, migrates owner boundary, records architecture-gap, or representative turns green after one source package.
- Required source write: `src/admin/admin-control-snapshot-repair-diagnostics.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.

## Observable Prediction

- Metric: `rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route`
- Predicted: active_gate_snapshot_coverage reduces selected snapshot timeout/deferred repair evidence, increases snapshot coverage, migrates owner boundary, records architecture-gap, or representative turns green after one source package.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: active_gate_snapshot_coverage reduces selected snapshot timeout/deferred repair evidence, increases snapshot coverage, migrates owner boundary, records architecture-gap, or representative turns green.
- Local proof class: focused owner proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `snapshot_coverage_incomplete`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` plus the active-gate topology extractor.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role freshness-review --package work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose.
2. Keep the durable proof ladder to 3-5 commands by default.
3. In a theory-loop package, package/sprint/tracker/ledger-only work is not a closure shape.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. `src/admin/admin-control-snapshot-repair-diagnostics.js`

## Out Of Scope

1. Runtime ownership changes outside `startup_active_gate_owner / snapshot_coverage`.
2. Priority recovery, publication ACK, startup readiness, benchmark visibility, and generic transport edits.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/admin/admin-control-snapshot-repair-diagnostics.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
- Model ledger advisory: `escalate`

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: freshness-review; owner: Agent Bacon (019e71a0-db5f-7b13-a544-a91ac483be4f); files-changed: none; validation: npm run work:context; npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-selected-source-timeout-retry.md; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; status: validated; decision: fresh; outcome: route fresh; active_gate_snapshot_coverage remains startup_active_gate_owner / snapshot_coverage with selected_snapshot_source_timeout and snapshot_repair_deferred; implementation may proceed only in src/admin/admin-control-snapshot-repair-diagnostics.js.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/admin/admin-control-snapshot-repair-diagnostics.js; validation: node --check src/admin/admin-control-snapshot-repair-diagnostics.js; node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-repair-diagnostics.js; node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-repair-diagnostics.js; npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-repair-diagnostics.js; npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js; npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/control-plane/publication-active-gate-handoff-contract.test.js; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; parent revalidated focused proof: yes; status: validated; outcome: focused proof passed; representative rerun stayed red but migrated the first frontier from active_gate_snapshot_coverage to priority_recovery_partition_progress with one operation_workflow_owner/rebalancer_handoff priority residual; active-gate remains next expected frontier.
- [x] action: verification-fix; owner: Agent Bacon (019e71a0-db5f-7b13-a544-a91ac483be4f); files-changed: none; validation: npm run work:context; npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js; npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/control-plane/publication-active-gate-handoff-contract.test.js; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain priority_recovery_partition_progress; parent revalidated focused proof: yes; status: validated; outcome: read-only verifier confirmed owner-boundary migration to operation_workflow_owner / rebalancer_handoff with one priority residual and no in-scope source fix needed.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:repair; status: validated; outcome: refreshed tracker handoff, then narrowed auto-expanded scope back to the declared active-gate source file.

## Commit And Push Ledger

1. Focused package commit: 2cda484cbc616d0c3afacce6eaad0441d961df2a
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`
2. regression: `npm test -- test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/control-plane/publication-active-gate-handoff-contract.test.js`
3. supporting: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`
4. supporting: `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage`
