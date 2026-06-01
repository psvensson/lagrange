# Rolling Restart Benchmark Table Bootstrap Sql Unavailable Repair

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json",
    "playback": "none",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "readiness_probe_timeout",
    "currentState": "Promoted theory-loop package for fresh rolling-restart representative evidence that terminates with benchmark_events SQL query engine unavailable and authoritativeRepairAttempted=false after the owner-recovery source theory did not move snapshot coverage.",
    "nextAction": "Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created.",
    "predecessor": "work/packages/done-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md",
    "successor": "work/packages/done-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "src/bootstrap/bootstrap-api-control-plane-methods.js",
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/bootstrap/bootstrap-api-control-plane-methods.js",
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "work/packages/active-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md",
      "work/packages/done-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md",
      "work/packages/done-20260528-spec-led-runtime-modularization-active-gate-owner-recovery-reentry.md",
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
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
        "regression: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
        "supporting: npm run work:frontier-history -- --owner startup_readiness_owner --boundary startup_support_evidence --limit 12"
      ]
    }
  },
  "theoryLedger": "no-ledger-update: planned-new-theory because this package recorded the promoted table-bootstrap SQL-unavailable result as migrated, while the fresh representative route created a new retry_deferred priority-recovery handoff successor theory.",
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Benchmark table bootstrap must attempt bounded authoritative repair after SQL-unavailable create evidence exhausts candidate progress with visibility state none.",
    "sprintGoalDelta": "rolling-restart either reaches green or moves beyond benchmark_events SQL query engine unavailable with authoritativeRepairAttempted=false.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "result": "migrated",
    "successorPackage": "work/packages/done-20260528-rolling-restart-priority-recovery-retry-deferred-handoff.md"
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json",
    "frontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Activate the retry_deferred priority-recovery handoff successor before another representative rerun."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json selects startup_readiness_owner / startup_support_evidence.",
    "changedFacts": "This theory-loop package promotes one source-code theory for implementation.",
    "rejectedAlternatives": "Classification-only, evidence-only, and downstream symptom packages are not valid package work in a theory-loop sprint.",
    "ownerWhoDecides": "startup_readiness_owner",
    "currentAction": "Promoted theory-loop package for fresh rolling-restart representative evidence that terminates with benchmark_events SQL query engine unavailable and authoritativeRepairAttempted=false after the owner-recovery source theory did not move snapshot coverage.",
    "missingTransitionOrObservation": "Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "expectedMovement": "The source change must move representative evidence toward success, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_readiness_owner / startup_support_evidence / representative route",
    "predicted": "Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created.",
    "observed": "Focused proof passed and the representative rerun moved the terminal table-bootstrap metric from authoritativeRepairAttempted=false to authoritativeRepairAttempted=true with authoritativeRepairApplied=false; canonical route then selected priority_recovery_partition_progress under operation_workflow_owner / rebalancer_handoff.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json"
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused table-bootstrap proof passed and representative evidence moved beyond authoritativeRepairAttempted=false, but rolling-restart stayed red and canonical route selected priority_recovery_partition_progress under operation_workflow_owner / rebalancer_handoff with three retry_deferred dispatch-pending witnesses.",
    "successorReason": "The sprint success condition is still not met, so the next theory-loop source package targets the fresh retry_deferred priority-recovery handoff recurrence instead of widening this package.",
    "nextOwnerBoundary": "operation_workflow_owner / rebalancer_handoff",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json"
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
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "readiness_probe_timeout",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "causal-escalation",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_probe_timeout",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Benchmark table bootstrap defers authoritative repair for SQL-unavailable create failures while visibility remains none, so rolling-restart terminates with benchmark_events SQL query engine unavailable and authoritativeRepairAttempted=false.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json",
    "expectedCausalModelChange": "Focused source proof makes SQL-unavailable table bootstrap attempt bounded authoritative repair after candidate progress is exhausted, moving representative evidence beyond authoritativeRepairAttempted=false or green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh representative evidence moved beyond authoritativeRepairAttempted=false but stayed red with priority_recovery_partition_progress first and three retry_deferred dispatch-pending priority-recovery witnesses under operation_workflow_owner / rebalancer_handoff.",
    "crossBoundaryReview": "Do not widen the table-bootstrap SQL-unavailable repair package; continue in the operation_workflow_owner / rebalancer_handoff successor selected by fresh canonical route evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart benchmark table bootstrap SQL-unavailable repair",
    "phaseChain": [
      "operation_workflow_owner / rebalancer_handoff focused proof passed",
      "owner-recovery source proof did not move active-gate snapshot coverage metrics in the representative rerun",
      "route-after-rerun selected owner-boundary migration with startup_readiness_owner / startup_support_evidence as next expected boundary",
      "terminal failure exposed benchmark_events SQL query engine unavailable with authoritativeRepairAttempted=false"
    ],
    "currentFirstFrontier": "readiness_startup_support / startup_readiness_owner / startup_support_evidence / readiness_probe_timeout after active_gate_snapshot_coverage owner-boundary migration",
    "knownDownstreamBlockers": [
      "benchmark table visibility cannot observe partitions while SQL query engine remains unavailable",
      "authoritative repair was not attempted for the terminal benchmark_events bootstrap failure",
      "rolling-restart remains red until table bootstrap either repairs from authoritative state or selects a new owner boundary"
    ],
    "missingCausalEdge": "Benchmark table bootstrap needs a bounded SQL-unavailable repair transition after candidate cycling or grace no longer produces visibility progress.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "boundedProgressProof": "Focused proof must show bounded retry progress from SQL-unavailable create evidence to authoritative repair and partition visibility instead of ending with authoritativeRepairAttempted=false.",
    "boundedProgressProofArtifact": "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "expectedObservableTransition": "Focused proof records authoritative repair after SQL-unavailable create exhaustion; representative rerun moves beyond benchmark_events SQL unavailable or reaches green.",
    "maxProgressBound": "one benchmark table bootstrap SQL-unavailable source package before representative rerun and route recording",
    "sameFrontierFallback": "If representative repeats authoritativeRepairAttempted=false or unchanged active_gate_snapshot_coverage with no table-bootstrap movement, stop for causal escalation instead of another adjacent local patch.",
    "expectedNextFrontier": "representative-green, table-bootstrap authoritative repair movement, owner-boundary migration, or architecture-gap",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage_owner_recovery_reentry",
    "toOwner": "startup_readiness_owner",
    "toBoundary": "startup_support_evidence",
    "reason": "Fresh representative rerun after the owner-recovery source patch preserved active_gate_snapshot_coverage as first frontier but route-after-rerun selected owner_boundary_migration and the terminal failure exposed benchmark_events SQL query engine unavailable with authoritativeRepairAttempted=false.",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json --owner startup_active_gate_owner --boundary snapshot_coverage_owner_recovery_reentry --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh representative rerun stayed red after the owner-recovery source theory",
      "route-after-rerun selected migrate_owner_boundary / owner_boundary_migration",
      "terminal benchmark_events bootstrap failure reported SQL query engine not available and authoritativeRepairAttempted=false"
    ],
    "selectedChoice": "benchmark-table-bootstrap-sql-unavailable-repair",
    "nextAction": "Run the focused table-bootstrap primary-rotation proof before representative rerun.",
    "choices": [
      {
        "id": "benchmark-table-bootstrap-sql-unavailable-repair",
        "summary": "Promote bounded SQL-unavailable table-bootstrap repair source proof.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
          "npm run work:frontier-history -- --owner startup_readiness_owner --boundary startup_support_evidence --limit 12"
        ]
      },
      {
        "id": "table-bootstrap-architecture-gap",
        "summary": "Open an architecture package if focused proof cannot select a bounded repair transition.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json"
        ]
      }
    ]
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes readiness_probe_timeout to startup_readiness_owner / startup_support_evidence; the package must explain the whole phase chain before selecting the executable slice.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json.",
      "readiness_probe_timeout is the current selected symptom.",
      "startup_readiness_owner / startup_support_evidence is the declared decision boundary for this package."
    ],
    "ownerBoundaryMap": [
      "startup_readiness_owner / startup_support_evidence: selected package owner and boundary.",
      "Downstream owners remain frozen until the falsifier selects migration."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane remains causal-escalation.",
      "Declared owner boundary remains startup_readiness_owner / startup_support_evidence."
    ],
    "changedFacts": [
      "This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json.",
      "The active action is Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created.."
    ],
    "competingTheories": [
      "H1 startup_readiness_owner / startup_support_evidence owns the missing transition for readiness_probe_timeout.",
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
        "inputSignal": "readiness_probe_timeout",
        "owner": "startup_readiness_owner / startup_support_evidence",
        "missingTransition": "selected evidence must become a named owner-owned transition, migration, or stop.",
        "expectedEvidence": "focused proof selects the transition, migrates ownership, or records architecture-gap evidence.",
        "falsifier": "falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
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
    "systemTheoryRef": "work/packages/todo-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/bootstrap/bootstrap-api-control-plane-methods.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from declared package evidence before proof execution.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_readiness_owner / startup_support_evidence.",
      "falsifiability": "high - falsifier is falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js.",
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

This package owns startup_readiness_owner / startup_support_evidence because the selected evidence routes readiness_probe_timeout there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_readiness_owner / startup_support_evidence emits Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created. for readiness_probe_timeout.
- Inputs/signals: test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json; falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js; regression: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js; supporting: npm run work:frontier-history -- --owner startup_readiness_owner --boundary startup_support_evidence --limit 12.
- State model or invariant: The startup_readiness_owner / startup_support_evidence decision table in the Causal Decision Contract maps readiness_probe_timeout and route evidence to one emitted outcome: Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / readiness_probe_timeout | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js`
- Competing explanations: At minimum compare readiness_probe_timeout against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own readiness_probe_timeout, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: readiness_probe_timeout is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_probe_timeout`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## System Theory

- Problem statement: rolling-restart currently routes readiness_probe_timeout to startup_readiness_owner / startup_support_evidence; the package must explain the whole phase chain before selecting the executable slice.
- Phase chain:
1. Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json.
2. readiness_probe_timeout is the current selected symptom.
3. startup_readiness_owner / startup_support_evidence is the declared decision boundary for this package.
- Owner-boundary map:
1. startup_readiness_owner / startup_support_evidence: selected package owner and boundary.
2. Downstream owners remain frozen until the falsifier selects migration.
- Stable facts:
1. Scenario remains rolling-restart.
2. Package lane remains causal-escalation.
3. Declared owner boundary remains startup_readiness_owner / startup_support_evidence.
- Changed facts:
1. This package was opened from test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json.
2. The active action is Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created..
- Competing theories:
1. H1 startup_readiness_owner / startup_support_evidence owns the missing transition for readiness_probe_timeout.
2. H2 the same symptom is inherited from a different owner boundary or architecture gap.
- Eliminated theories:
1. No eliminated theory is durable until the package proof records a contrary artifact or command result.
- Downstream symptoms:
1. Downstream symptoms stay frozen until H1 selects a concrete transition or H2 selects migration.
- Transition table:
1. Input `readiness_probe_timeout`; owner `startup_readiness_owner / startup_support_evidence`; missing `selected evidence must become a named owner-owned transition, migration, or stop.`; expected `focused proof selects the transition, migrates ownership, or records architecture-gap evidence.`; falsifier `falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js`; migration trigger `the falsifier names a different owner boundary or proves this boundary cannot own the transition.`.
- Ownership migration triggers:
1. Migrate only when focused evidence names the alternate deciding owner and boundary.
- Architecture-gap triggers:
1. Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration.
- Whole-system invariant: Runtime edits are allowed only after the system theory selects one owner-owned transition or migration route.

## Slice Theory

- System theory reference: work/packages/todo-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md systemTheory
- Selected system theory: H1 is selected unless falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js proves a different owner boundary or architecture gap.
- Selected mechanism: contract_gap with ownership_gap as the first alternate
- Source/test contract: Implementation may edit only declared source files src/bootstrap/bootstrap-api-control-plane-methods.js after the falsifier keeps the package inside the selected owner boundary.
- Falsifier: `falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js`
- Representative expected movement: selected route moves to a concrete transition, owner-boundary migration, or architecture-gap stop.
- Kill rule: Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.
- Theory-fit score:
1. Evidence fit: medium - generated from declared package evidence before proof execution.
2. Owner-boundary fit: medium - owner boundary is declared as startup_readiness_owner / startup_support_evidence.
3. Falsifiability: high - falsifier is falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js.
4. Representative movement: medium - expected movement is route selection, migration, or architecture-gap stop.
5. Downstream risk containment: high - downstream symptoms remain frozen until owner selection is proven.
- Wrong-slice triggers:
1. proof selects a different owner boundary
2. proof requires runtime files outside writeScope
3. proof cannot select a concrete transition or migration

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created.
- Sprint-goal delta: Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created.
- Required source write: `src/bootstrap/bootstrap-api-control-plane-methods.js`
- Package size rule: this package must test one promoted theory by changing declared `src/` source code, running falsifier and regression proof, and recording the theory result before closure.
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.



## Observable Prediction

- Metric: rolling-restart / startup_readiness_owner / startup_support_evidence / representative route
- Predicted: Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created.
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-representative-rerun
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `readiness_probe_timeout`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. In a theory-loop package, package/sprint/tracker/ledger-only work is not a closure shape; keep classification evidence in the sprint, run representative evidence, and create or activate the next `src/` successor package instead of closing as classification-only.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/bootstrap/bootstrap-api-control-plane-methods.js
2. test/distributed/scenarios/table-distribution-helpers-segment-3.js
3. test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/bootstrap/bootstrap-api-control-plane-methods.js`, `test/distributed/scenarios/table-distribution-helpers-segment-3.js`, `test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js`, `regression: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js`, `supporting: npm run work:frontier-history -- --owner startup_readiness_owner --boundary startup_support_evidence --limit 12`
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

## Theory Loop Results

- [x] theory: benchmark-table-bootstrap-sql-unavailable-repair; result: migrated; evidence: focused proof passed 8/8; representative artifact moved terminal benchmark_events failure from authoritativeRepairAttempted=false to authoritativeRepairAttempted=true and authoritativeRepairApplied=false, while scenario-route still reports causalOutcome=migrate_owner_boundary and first frontier priority_recovery_partition_progress; files: src/bootstrap/bootstrap-api-control-plane-methods.js,test/distributed/scenarios/table-distribution-helpers-segment-3.js,test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js; validation: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js PASS total=8 pass=8; node --check touched files PASS; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json PASS outcome=migrate_owner_boundary; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-table-bootstrap-sql-unavailable-repair.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_probe_timeout --explain active_gate_snapshot_coverage PASS; next: create successor from fresh representative route instead of widening this package.

## Execution Evidence

theory-ledger: not-needed

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: freshness-review; owner: Agent McClintock (019e7082-8ffb-7551-b592-a8d1d171f03d); files-changed: work/packages/active-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md; validation: npm run work:context PASS; npm run work:package:doctor -- work/packages/active-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md FAIL expected missing checked freshness-review before this line; npm run work:package:doctor -- --suggest work/packages/active-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md FAIL expected missing checked freshness-review before this line; npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md PASS; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json PASS outcome=migrate_owner_boundary stop=owner_boundary_migration; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-owner-recovery-source-reentry.report.json --owner startup_active_gate_owner --boundary snapshot_coverage_owner_recovery_reentry --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage PASS residualWitnesses=0; npm run work:frontier-history -- --owner startup_readiness_owner --boundary startup_support_evidence --limit 12 PASS no saturation; decision: fresh; outcome: validated.
- [x] action: implementation; owner: workflow_tooling_owner; files-changed: src/bootstrap/bootstrap-api-control-plane-methods.js,test/distributed/scenarios/table-distribution-helpers-segment-3.js,test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js,work/packages/active-20260528-rolling-restart-benchmark-table-bootstrap-sql-unavailable-repair.md; validation: pre-change focused falsifier failed new SQL-unavailable repair cases with authoritativeRepairAttempted=false; npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js PASS total=8 pass=8; node --check touched files PASS; audit:runtime-grammar:file touched files PASS; scoped guideline audits PASS; representative rerun FAIL but moved authoritativeRepairAttempted=true authoritativeRepairApplied=false; work:evidence-summary PASS causalOutcome=migrate_owner_boundary; work:scenario-route PASS firstFrontier=priority_recovery_partition_progress; result=migrated; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: Agent Einstein (019e7099-613d-7e41-ad44-5a7dc3027ef1) ran npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js PASS 8/8; git diff --check PASS; guideline literals PASS; guideline decision-boundaries PASS; audit:runtime-grammar:file PASS; no in-scope fixes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json,work/sprints/current-blocker.md,work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:repair PASS; parent revalidated focused proof: yes; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: 2cda484cbc616d0c3afacce6eaad0441d961df2a
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js
2. regression: npm test -- test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js
3. supporting: npm run work:frontier-history -- --owner startup_readiness_owner --boundary startup_support_evidence --limit 12
