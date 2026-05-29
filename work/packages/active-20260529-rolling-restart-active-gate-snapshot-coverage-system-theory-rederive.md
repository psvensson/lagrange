# Rolling Restart Active Gate Snapshot Coverage System Theory Rederive

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-29",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "currentState": "Fresh representative evidence has zero priority recovery residuals and selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage, but compositional history blocks another local active-gate slice.",
    "nextAction": "Rederive the startup_active_gate_owner / snapshot_coverage whole-system theory before promoting another local snapshot coverage mechanism.",
    "predecessor": "work/packages/superseded-20260529-rolling-restart-priority-recovery-rebalancer-handoff-event-wait-residual.md"
  },
  "scope": {
    "writeScope": [
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/theory-ledger.md",
      ".kiro/steering/schemas/work-package.schema.json",
      "scripts/work-frontier-history.js",
      "scripts/work-package-schema.js",
      "scripts/work-tracker.js",
      "src/admin/admin-control-snapshot-repair-diagnostics.js",
      "src/bootstrap/bootstrap-api-control-plane-methods.js",
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "test/control-plane/publication-active-gate-handoff-contract.test.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
      "test/rebalancer/priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js",
      "work/RULES.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/sprint-strategy-brief.md",
      "test/scripts/work-frontier-history-loop-metrics.test.js",
      "test/scripts/work-tracker-alternating-pair-mutex.test.js",
      "test/scripts/work-tracker-loop-evolution-guardrails.test.js",
      "test/scripts/work-tracker-rederive-guardrails.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/admin/admin-control-snapshot-repair-diagnostics.js"
    ],
    "commitScope": [
      "work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-system-theory-rederive.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/theory-ledger.md",
      ".kiro/steering/schemas/work-package.schema.json",
      "scripts/work-frontier-history.js",
      "scripts/work-package-schema.js",
      "scripts/work-tracker.js",
      "src/admin/admin-control-snapshot-repair-diagnostics.js",
      "src/bootstrap/bootstrap-api-control-plane-methods.js",
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "test/control-plane/publication-active-gate-handoff-contract.test.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
      "test/rebalancer/priority-recovery-snapshot-handoff-timeout-reentry-test-cases.js",
      "work/RULES.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/sprint-strategy-brief.md",
      "test/scripts/work-frontier-history-loop-metrics.test.js",
      "test/scripts/work-tracker-alternating-pair-mutex.test.js",
      "test/scripts/work-tracker-loop-evolution-guardrails.test.js",
      "test/scripts/work-tracker-rederive-guardrails.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The active-gate owner/boundary has a same-mechanism-repeat compositional signal, so another local slice is blocked until system theory is revised."
  },
  "modelFit": {
    "packageClass": "system-theory-rederive",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "whole-system-theory/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "runtime source edits are required before theory revision",
      "representative scenario evidence changes"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap",
      "theory-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract",
      "theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --explain snapshot_coverage # coupled-invariant startup_active_gate_owner/snapshot_coverage + operation_workflow_owner/rebalancer_handoff",
        "falsifier: npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage"
      ]
    }
  },
  "theoryLoop": {
    "outcome": "inconclusive",
    "jointFalsifierCommand": "npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --explain snapshot_coverage"
  },
  "systemTheoryRevision": true,
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Rederive active-gate snapshot coverage system theory before another local source patch."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "snapshot_coverage_incomplete",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "Record the saturated active-gate contract-gap pattern, revise whole-system invariants and transition table, then select the next executable source package or architecture stop.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "active_gate_snapshot_coverage remains red because repeated local snapshot coverage contract-gap patches are saturated and require a whole-system theory revision before source promotion.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedCausalModelChange": "System-theory rederive records a revised invariant and selects the next executable source package, architecture-gap, owner-boundary migration, or representative-green path.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact has zero priority recovery residual witnesses and selects active_gate_snapshot_coverage with selected_snapshot_source_timeout and snapshot_repair_deferred.",
    "crossBoundaryReview": "Do not patch benchmark visibility, startup readiness, or another active-gate local source slice until this systemTheoryRevision is recorded."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate snapshot coverage system theory rederive",
    "phaseChain": [
      "priority_recovery_partition_progress is satisfied with zero residual witnesses",
      "fresh representative rerun stayed red at active_gate_snapshot_coverage",
      "topology evidence selects startup_active_gate_owner / snapshot_coverage with selected_snapshot_source_timeout and snapshot_repair_deferred",
      "work:system-theory:rederive reports same-mechanism-repeat contract_gap saturation"
    ],
    "recentFrontierHistory": [
      "done active-gate source packages repeatedly selected contract_gap style mechanisms",
      "priority recovery cleared and returned the first frontier to active_gate_snapshot_coverage"
    ],
    "oscillationCheck": "Compositional auto-promote blocks another local active-gate source slice until system theory is revised.",
    "handoffInvariant": "Priority recovery remains satisfied while active-gate snapshot coverage owns the first frontier.",
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "startup readiness support evidence remains downstream",
      "benchmark_events bootstrap visibility remains downstream"
    ],
    "missingCausalEdge": "selected_snapshot_source_timeout plus snapshot_repair_deferred must become a revised system invariant, owner migration, architecture-gap, or selected source transition.",
    "missingCausalEdgeProbe": "npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
    "falsifyingProbe": "npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
    "boundedProgressProof": "Rederive system theory before source promotion so selected_snapshot_source_timeout plus snapshot_repair_deferred can become a concrete retry, reconcile, timer, wake, or bounded progress mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedObservableTransition": "system theory revision records the saturated contract-gap pattern and selects the next executable package or architecture route.",
    "maxProgressBound": "one system-theory rederive before another local active-gate source package",
    "sameFrontierFallback": "Same-frontier/no-reduction after rederive selects architecture work instead of another local active-gate patch.",
    "expectedNextFrontier": "system-theory revision, architecture-gap, owner-boundary migration, selected source package, or representative-green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Fresh representative route selects startup_active_gate_owner / snapshot_coverage and priority recovery is satisfied.",
    "changedFacts": "work:system-theory:rederive reports same-mechanism-repeat contract_gap saturation.",
    "rejectedAlternatives": "Another local active-gate source patch is blocked until the system theory revision is recorded.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Rederive active-gate snapshot coverage system theory.",
    "missingTransitionOrObservation": "Decide whether selected_snapshot_source_timeout plus snapshot_repair_deferred is local progress, owner migration, or architecture gap.",
    "smallestFalsifyingProbe": "falsifier: npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
    "expectedMovement": "System theory revision records the saturated contract_gap pattern and selects the next executable source or architecture route.",
    "negativeResultMeans": "Same-frontier/no-reduction after rederive opens or selects architecture work instead of a local active-gate patch.",
    "escalationRule": "Unchanged same-frontier or architecture-gap evidence blocks local source promotion."
  },
  "systemTheory": {
    "problemStatement": "Frontier history on startup_active_gate_owner / snapshot_coverage shows repeated contract_gap saturation; revise the whole-system active-gate theory before another local snapshot coverage patch.",
    "phaseChain": [
      "Fresh representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "priority_recovery_partition_progress is satisfied with zero residual witnesses.",
      "active_gate_snapshot_coverage is the selected first frontier with selected_snapshot_source_timeout and snapshot_repair_deferred.",
      "startup_readiness_owner / startup_support_evidence remains downstream until active-gate snapshot coverage is rederived."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage: selected owner boundary for active_gate_snapshot_coverage.",
      "startup_readiness_owner / startup_support_evidence: downstream support evidence boundary after snapshot coverage improves.",
      "operation_workflow_owner / rebalancer_handoff: predecessor boundary, now satisfied for priority recovery."
    ],
    "stableFacts": [
      "Representative route selects startup_active_gate_owner / snapshot_coverage.",
      "Priority recovery residual count is zero.",
      "work:system-theory:rederive reports same-mechanism-repeat contract_gap saturation."
    ],
    "changedFacts": [
      "The predecessor priority-recovery source package migrated the first frontier back to active_gate_snapshot_coverage.",
      "The active-gate owner boundary now requires system-theory revision before another local source slice."
    ],
    "competingTheories": [
      "H1 active_gate_snapshot_coverage still owns a local bounded retry/progress transition.",
      "H2 repeated selected-source timeout plus repair_deferred is a protocol or model contract gap that local source patches cannot resolve.",
      "H3 the visible active-gate symptom is downstream readiness lag and needs owner-boundary migration."
    ],
    "eliminatedTheories": [
      "Do not open another local contract_gap source package before the systemTheory revision records a new invariant."
    ],
    "downstreamSymptoms": [
      "benchmark_events bootstrap visibility timeout remains downstream while active_gate_snapshot_coverage is selected.",
      "startup readiness support evidence is the next expected frontier after snapshot coverage improves."
    ],
    "transitionTable": [
      {
        "inputSignal": "snapshot_coverage_incomplete",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "system theory must decide whether deferred repair retry remains a local source transition or an architecture-level contract change.",
        "expectedEvidence": "rederived theory records a new invariant and selects the next executable source package or architecture stop.",
        "falsifier": "npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
        "migrationTrigger": "route evidence selects a different owner boundary or proves snapshot_coverage cannot own the transition."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when fresh route evidence selects startup_readiness_owner / startup_support_evidence or another concrete owner boundary.",
      "Do not infer migration from benchmark_events visibility alone while active_gate_snapshot_coverage is the first frontier."
    ],
    "architectureGapTriggers": [
      "same-mechanism-repeat contract_gap on startup_active_gate_owner / snapshot_coverage",
      "local selected-source timeout repair packages repeat without representative green"
    ],
    "wholeSystemInvariant": "selected_snapshot_source_timeout plus snapshot_repair_deferred must be represented as a bounded progress contract, owner-boundary migration, or architecture-gap before another local startup_active_gate_owner / snapshot_coverage source package.",
    "wholeSystemInvariants": [
      {
        "invariant": "snapshot_coverage on startup_active_gate_owner must converge to a bounded progress contract before active_gate_snapshot_coverage stops being selected.",
        "coupledWith": [
          "operation_workflow_owner / rebalancer_handoff"
        ],
        "couplingNote": "Active-gate snapshot_coverage selection oscillates with rebalancer_handoff priority_recovery_event_driven_wait; closing one frontier without coupled evidence on the other re-routes the representative back to the partner."
      },
      {
        "invariant": "rebalancer_handoff on operation_workflow_owner must prove priority_recovery_partition_progress with a recorded wake or terminal-progress contract; absent that, snapshot_coverage selection cannot be considered architecturally caused.",
        "coupledWith": [
          "startup_active_gate_owner / snapshot_coverage"
        ],
        "couplingNote": "Zero priority-recovery residual witnesses are necessary but not sufficient: residual movement on snapshot_coverage must be co-observed in the same joint probe run."
      }
    ]
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260529-rolling-restart-active-gate-snapshot-coverage-system-theory-rederive.md systemTheory",
    "selectedSystemTheory": "System-theory revision is selected because work:system-theory:rederive reports same-mechanism-repeat contract_gap saturation.",
    "selectedMechanism": "contract_gap system_theory_rederive",
    "sourceTestContract": "Do not edit src/ in this package; revise active sprint system theory and then open the next executable source package selected by that theory.",
    "falsifier": "supporting: npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
    "representativeExpectedMovement": "revision selects a concrete source package, architecture stop, owner-boundary migration, or representative-green path.",
    "killRule": "Stop or escalate on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of promoting another local active-gate source slice before the systemTheory revision is recorded.",
    "theoryFitScore": {
      "evidenceFit": "high - canonical rederive command reports same-mechanism-repeat contract_gap saturation.",
      "ownerBoundaryFit": "high - current representative route selects startup_active_gate_owner / snapshot_coverage.",
      "falsifiability": "medium - proof is a governance/rederive gate rather than a runtime falsifier.",
      "representativeMovement": "medium - revision must select the next executable path before another rerun.",
      "downstreamRiskContainment": "high - source edits remain frozen until theory revision."
    },
    "wrongSliceTriggers": [
      "representative evidence moves away from startup_active_gate_owner / snapshot_coverage",
      "system rederive reports no compositional signal",
      "runtime source edits become required before theory revision"
    ]
  }
}
-->

## Why

This package records the required system-theory rederive after active-gate snapshot coverage hit a repeated `contract_gap` saturation pattern. It keeps source frozen until the whole-system theory selects the next executable slice.

## Validation

1. falsifier: `npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage`
2. regression: `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage`
3. supporting: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage`
