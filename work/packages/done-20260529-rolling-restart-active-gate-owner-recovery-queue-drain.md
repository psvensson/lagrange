# Rolling Restart Active Gate Owner Recovery Queue Drain

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
    "currentState": "Fresh representative evidence reduced selected snapshot repair-deferred timeout, but active_gate_snapshot_coverage remains blocked with snapshot coverage 2/5, owner_reconcile_pending, and owner queue pending writes.",
    "nextAction": "Test whether owner-recovery wait needs a bounded snapshot queue drain/reentry transition before another representative rerun.",
    "closed": "2026-05-29",
    "successor": "work/packages/done-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md"
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
      "src/control-plane/snapshot-service.js",
      "src/control-plane/owner-queue.js",
      "src/control-plane/publication-active-gate-handoff-contract-selection.js"
    ],
    "commitScope": [
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md",
      "work/packages/done-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md",
      "work/packages/done-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md"
    ]
  },
  "gates": {
    "stabilityCredit": "representative-migrated",
    "whyHighestLeverageNow": "The diagnostics repair timeout package reduced the stale selected-snapshot timeout witness; the remaining same-frontier evidence now names owner recovery/queue drain pressure inside the active-gate snapshot coverage boundary."
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
      "fresh evidence selects architecture-gap or same-frontier/no-reduction"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
        "regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
      ]
    }
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "partial",
    "observedMovement": "Focused owner-recovery queue-drain proof passed; fresh rolling-restart representative evidence stayed red but selectedMembershipPublicationHandoffOutcome.enqueued is true and the first topology frontier migrated to priority_recovery_partition_progress under operation_workflow_owner / rebalancer_handoff.",
    "successorReason": "Rolling-restart is not representative-green yet; the next theory-loop package must prove or split the priority recovery rebalancer handoff retry-scheduled residual instead of widening this active-gate package.",
    "nextOwnerBoundary": "operation_workflow_owner / rebalancer_handoff",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "systemTheoryRevision": true,
  "theoryLedger": "planned-new-theory: current artifact reduced selected snapshot repair-deferred timeout but still selects active_gate_snapshot_coverage with owner_reconcile_pending and owner queue pending writes; this package tests whether owner-recovery wait needs a bounded snapshot queue drain/reentry transition before another representative rerun.",
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Test whether owner-recovery wait needs a bounded snapshot queue drain/reentry transition before another representative rerun.",
    "sprintGoalDelta": "active_gate_snapshot_coverage reduces owner queue or pending owner recovery evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "result": "migrated",
    "successorPackage": "work/packages/done-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md",
    "sourceChangeRequired": true,
    "successorRequired": true
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "snapshot_coverage_incomplete / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Test whether owner-recovery wait needs a bounded snapshot queue drain/reentry transition before another representative rerun."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "rebalancer_handoff",
    "reason": "Focused owner-recovery queue-drain proof made selectedMembershipPublicationHandoffOutcome.enqueued true; fresh representative evidence then moved the first topology frontier from active_gate_snapshot_coverage to priority_recovery_partition_progress.",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Representative artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json selects startup_active_gate_owner / snapshot_coverage and priority recovery residuals are zero.",
    "changedFacts": "Selected snapshot timeout/deferred repair reduced; current evidence reports snapshot coverage 2/5, owner_reconcile_pending, and owner queue pending writes.",
    "rejectedAlternatives": "Do not reopen diagnostics timeout or downstream readiness while owner-recovery queue drain evidence is the selected active-gate witness.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Fresh representative evidence reduced selected snapshot repair-deferred timeout, but active_gate_snapshot_coverage remains blocked with snapshot coverage 2/5, owner_reconcile_pending, and owner queue pending writes.",
    "missingTransitionOrObservation": "Owner-recovery wait must expose a bounded snapshot queue drain/reentry transition, migration, or architecture-gap stop.",
    "smallestFalsifyingProbe": "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "expectedMovement": "The source change must move representative evidence toward reduced owner queue/pending recovery, increased coverage, migration, or architecture-gap stop.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of widening this package.",
    "escalationRule": "Same-frontier/no-reduction after this source package selects architecture rederive instead of another adjacent local patch."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "active_gate_snapshot_coverage reduces owner queue or pending owner recovery evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "observed": "Representative rerun stayed red but migrated the first topology frontier to operation_workflow_owner / rebalancer_handoff; failure bundle now records selectedMembershipPublicationHandoffOutcome.enqueued=true while active-gate snapshot coverage is deferred behind priority_recovery_partition_progress.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "scenario-release-gate",
    "expectedDelta": "successor proves or splits priority recovery rebalancer handoff retry-scheduled progress before another representative-green attempt.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "After the diagnostics repair timeout reduction, active_gate_snapshot_coverage remains because owner-recovery wait does not expose a bounded snapshot queue drain/reentry transition for startup_active_gate_owner / snapshot_coverage.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedCausalModelChange": "Focused owner-recovery queue drain proof should reduce owner queue or pending owner recovery evidence, increase snapshot coverage, migrate owner boundary, or record architecture-gap after one source package.",
    "representativeOutcome": "migrated",
    "causalDebt": "Current artifact migrated the first topology frontier to priority_recovery_partition_progress under operation_workflow_owner / rebalancer_handoff; active-gate owner-recovery handoff now records enqueued=true but remains downstream of priority recovery progress.",
    "crossBoundaryReview": "Do not widen this active-gate package after migration; the successor must own operation_workflow_owner / rebalancer_handoff priority recovery progress."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active gate owner recovery queue drain",
    "phaseChain": [
      "priority recovery residuals reduced to zero",
      "owner-reconcile publication handoff proof previously reduced owner_reconcile_pending",
      "repair-deferred selected snapshot timeout proof reduced selected_snapshot_source_timeout and snapshot_repair_deferred evidence",
      "fresh representative evidence still selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with owner queue pending writes"
    ],
    "recentFrontierHistory": [
      "work/packages/done-20260529-rolling-restart-active-gate-owner-reconcile-pending-handoff.md reduced a previous owner_reconcile_pending witness",
      "work/packages/done-20260529-rolling-restart-active-gate-snapshot-repair-deferred-retry.md reduced selected snapshot timeout/deferred repair evidence"
    ],
    "oscillationCheck": "The active-gate snapshot coverage boundary is repeated, so this package stays in causal-escalation and must either show concrete movement or select architecture rederive.",
    "handoffInvariant": "Active-gate owner-recovery queue-drain proof moved the route; priority recovery now owns the first frontier before downstream readiness can be reinterpreted.",
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup readiness remains downstream of active-gate snapshot coverage",
      "benchmark_events partition visibility remains downstream while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "owner-recovery wait needs a bounded snapshot queue drain/reentry transition, migration, or architecture-gap stop.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "falsifyingProbe": "npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "boundedProgressProof": "Focused proof must show a concrete queue drain, reentry, handoff, timeout, advance, wake, or bounded progress mechanism for owner-recovery wait.",
    "boundedProgressProofArtifact": "test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "expectedObservableTransition": "active_gate_snapshot_coverage reduces owner queue or pending owner recovery evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage source package before representative rerun and route recording",
    "sameFrontierFallback": "Unchanged active_gate_snapshot_coverage owner queue/pending owner recovery evidence after this source package triggers architecture rederive instead of another adjacent local patch.",
    "expectedNextFrontier": "snapshot coverage improves, owner queue/pending owner recovery evidence reduces, owner-boundary migration, representative-green, or architecture-gap",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "startup_active_gate_owner / snapshot_coverage has repeated active-gate contract-gap history.",
      "Current representative evidence shows concrete movement but still selects owner queue/pending owner recovery within active_gate_snapshot_coverage."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute the bounded owner-recovery queue drain/reentry proof for the current active-gate witness shape.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Open architecture rederive if focused proof cannot select a bounded owner-owned queue drain/reentry transition.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
        ]
      }
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Execute the selected owner-recovery queue drain/reentry proof before another representative rerun."
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes snapshot_coverage_incomplete to startup_active_gate_owner / snapshot_coverage after repair-deferred timeout evidence reduced.",
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
      "Selected snapshot timeout/deferred repair no longer owns the fresh witness shape.",
      "The active witness is owner_reconcile_pending with owner queue pending writes and snapshot coverage 2/5."
    ],
    "competingTheories": [
      "H1 startup_active_gate_owner / snapshot_coverage owns the missing owner-recovery queue drain/reentry transition.",
      "H2 the same symptom is inherited from stale instrumentation, a diagnostics gap, or a different owner boundary."
    ],
    "eliminatedTheories": [
      "selected_snapshot_source_timeout plus snapshot_repair_deferred is reduced in the current representative evidence."
    ],
    "downstreamSymptoms": [
      "Downstream readiness and benchmark visibility symptoms stay frozen until H1 selects a concrete transition or H2 selects migration."
    ],
    "transitionTable": [
      {
        "inputSignal": "snapshot_coverage_incomplete / owner_reconcile_pending / owner queue pending writes",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "owner-recovery wait must become a named owner-owned queue drain/reentry transition, migration, or stop.",
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
    "systemTheoryRef": "work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md systemTheory",
    "selectedSystemTheory": "H1 is selected unless the falsifier proves a different owner boundary or architecture gap.",
    "selectedMechanism": "contract_gap with ownership_gap as the first alternate",
    "sourceTestContract": "Implementation may edit only declared source files src/control-plane/membership-publication-active-gate-reconcile.js after the falsifier keeps the package inside the selected owner boundary.",
    "falsifier": "falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js",
    "representativeExpectedMovement": "selected route moves to concrete owner queue/pending recovery reduction, owner-boundary migration, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - generated from fresh representative evidence after the previous package reduced selected snapshot timeout/deferred repair evidence.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "high - falsifier is the owner-recovery queue drain test.",
      "representativeMovement": "medium - expected movement is route selection, migration, reduction, or architecture-gap stop.",
      "downstreamRiskContainment": "high - downstream symptoms remain frozen until owner selection is proven."
    },
    "wrongSliceTriggers": [
      "proof selects a different owner boundary",
      "proof requires runtime files outside writeScope",
      "proof cannot select a concrete transition or migration"
    ]
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
      "Use this package for the selected owner-recovery queue drain/reentry source slice.",
      "Split only if proof selects a different owner boundary.",
      "Open architecture work only on same-frontier/no-reduction after the source package."
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns the repeated startup_active_gate_owner / snapshot_coverage frontier after the previous diagnostics package produced concrete reduction but not representative green.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the same owner boundary repeats, but the fresh artifact changed shape and this package has one source file and one falsifier.
- Escalation trigger to a heavier lane: runtime ownership changes, proof needs files outside write scope, or representative evidence returns same-frontier/no-reduction.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits a bounded owner-recovery queue drain/reentry transition or a migration/architecture stop for snapshot_coverage_incomplete.
- Inputs/signals: owner_reconcile_pending, owner queue pending writes, snapshot coverage 2/5, active_gate_snapshot_coverage.
- State model or invariant: owner-recovery wait must not leave active-gate coverage with only an unbounded wait while queue pressure is observed.
- Non-goals and forbidden interpretations: do not patch diagnostics timeout, priority recovery, startup readiness, or benchmark table visibility in this package.
- Proof mapping: focused owner-recovery reconcile tests must prove the owner-owned queue drain/reentry shape before representative proof is accepted.
- Wrong-slice trigger: stop or split if proof needs files outside `src/control-plane/membership-publication-active-gate-reconcile.js` or names a different owner boundary.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | owner-recovery queue drain/reentry transition, migration, or architecture-gap stop | active_gate_snapshot_coverage reduces owner queue or pending owner recovery evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package | falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js |
| scope boundary | declared source file only | proof that needs other runtime files means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream readiness or benchmark visibility symptoms.
- Falsifying focused probe: `falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`
- Competing explanations: owner queue pressure is real owner debt; evidence is stale/instrumentation-only; another owner boundary owns the queue drain transition.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: This is a repeated boundary only because the previous source package moved evidence; if this package returns same-frontier/no-reduction, open/select architecture rederive instead of another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own snapshot_coverage_incomplete as an owner-recovery queue drain/reentry gap?
- Architecture review: local owner-boundary proof is selected for one source package; unchanged same-frontier/no-reduction triggers architecture rederive.
- Competing hypotheses: owner-recovery wait is real owner debt; owner queue evidence is stale/instrumentation-only; another owner boundary owns the missing transition.
- Pre-edit focused probe: `npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js`
- Success metrics: owner queue/pending recovery evidence reduces, snapshot coverage increases, owner boundary migrates, architecture-gap records, or representative goes green.
- Representative rerun: `timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`
- Kill rule: unchanged active_gate_snapshot_coverage owner queue/pending owner recovery evidence after this source package opens architecture rederive instead of another local patch.

## Theory Loop Package Contract

- Enforcement: `source-code-package-required`
- Promoted theory: Test whether owner-recovery wait needs a bounded snapshot queue drain/reentry transition before another representative rerun.
- Sprint-goal delta: active_gate_snapshot_coverage reduces owner queue or pending owner recovery evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.
- Required source write: `src/control-plane/membership-publication-active-gate-reconcile.js`
- Forbidden stop shape: classification-only, evidence-only, route-only, source/log inspection-only, package-only, and successor-creation-only outcomes stay in the sprint and must not become work packages.

## Observable Prediction

- Metric: rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route
- Predicted: active_gate_snapshot_coverage reduces owner queue or pending owner recovery evidence, increases snapshot coverage, migrates owner boundary, or records architecture-gap after one source package.
- Observed: Representative rerun stayed red but migrated the first topology frontier to `operation_workflow_owner / rebalancer_handoff`; the failure bundle records `selectedMembershipPublicationHandoffOutcome.enqueued=true`.
- Accuracy: partial
- Evidence: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`; `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`; `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage`

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: owner queue or pending owner recovery evidence reduces, snapshot coverage increases, owner boundary migrates, architecture-gap records, or representative goes green.
- Local proof class: focused owner proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `rebalancer_handoff`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `scenario-release-gate`
- Required after rerun: route-after-rerun, sprint/current-blocker refresh, entry validation, and pre-implementation validation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-next`.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose.
2. Keep durable proof to the declared focused test, regression, route extractor, and representative rerun.
3. Package/sprint/tracker/ledger-only work is not a closure shape in this theory-loop sprint.
4. Same-frontier/no-reduction after this source package opens architecture rederive.

## In Scope

1. src/control-plane/membership-publication-active-gate-reconcile.js

## Out Of Scope

1. Runtime ownership changes outside the declared source file.
2. Diagnostics timeout, priority recovery, startup readiness, and benchmark table visibility fixes.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: freshness-review; owner: Agent Gauss (019e7162-845c-7ad2-869e-03ffd83bf017); files-changed: none; validation: npm run work:context; npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage; status: validated; decision: fresh; outcome: implementation may proceed within write scope src/control-plane/membership-publication-active-gate-reconcile.js.
- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/control-plane/membership-publication-active-gate-reconcile.js; validation: node --check src/control-plane/membership-publication-active-gate-reconcile.js; node scripts/check-guideline-literals.js src/control-plane/membership-publication-active-gate-reconcile.js; node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-active-gate-reconcile.js; npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-active-gate-reconcile.js; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage; parent revalidated focused proof: yes; outcome: validated owner-boundary migration, representative still red.
- [x] action: verification-fix; owner: Agent Wegener (019e7177-f20a-71c0-8ccc-5367ff7df29a); files-changed: none; validation: node --check src/control-plane/membership-publication-active-gate-reconcile.js; node scripts/check-guideline-literals.js src/control-plane/membership-publication-active-gate-reconcile.js; node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-active-gate-reconcile.js; npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-active-gate-reconcile.js; npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js; git diff --check -- src/control-plane/membership-publication-active-gate-reconcile.js work/packages/active-20260529-rolling-restart-active-gate-owner-recovery-queue-drain.md; parent revalidated focused proof: yes; outcome: validated no fixes, migration evidence confirmed.
- [x] action: theory-ledger; owner: startup_active_gate_owner; files-changed: none; validation: no ledger update; parent revalidated focused proof: yes; outcome: no ledger update.

## Validation

1. falsifier: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js
2. regression: npm test -- test/control-plane/membership-publication-active-gate-reconcile-owner-recovery.test.js test/control-plane/publication-active-gate-handoff-contract.test.js
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage

## Commit And Push Ledger

1. Focused package commit: 2cda484cbc616d0c3afacce6eaad0441d961df2a
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
