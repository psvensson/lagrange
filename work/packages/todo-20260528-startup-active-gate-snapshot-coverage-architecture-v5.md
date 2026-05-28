# Startup Active Gate Snapshot Coverage Architecture v5

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-28",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Fresh representative v4 evidence repeated startup_active_gate_owner / snapshot_coverage / active_gate_timed_out and the playback does not contain SQL query engine availability fields.",
    "nextAction": "Select the autonomous architecture route for missing SQL query engine availability observation before another local runtime patch.",
    "predecessor": "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v4.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/admin/admin-control-snapshot-publication-convergence-diagnostics.js",
      "test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js",
      "test/distributed/harness/cluster-segment-7-alpha-load-readiness.js",
      "test/distributed/harness/active-gate-contract.js"
    ],
    "commitScope": [
      "work/packages/todo-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The active v4 package hit its kill rule: fresh representative evidence repeated the same frontier and did not expose SQL query engine availability fields.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "bounded-experiment",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "architecture-experiment/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "proof selects owner-boundary migration",
      "proof cannot distinguish an owner-owned observation path",
      "runtime files must be edited before the architecture decision is closed"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260528-rolling-restart-active-gate-snapshot-coverage-source-contract"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "regression: npm run analyze:causal-model -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
        "supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
        "supporting: rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test-output/reports/.playback/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z/rolling-restart"
      ]
    }
  },
  "boundedExperiment": {
    "hypothesis": "The v4 source change did not move representative evidence because the selected failure-bundle or active-gate observation path drops the SQL query engine availability edge before routing.",
    "hypothesisDiscriminator": "H1 selects failure-bundle diagnostics capture if canonical route stays active-gate snapshot coverage and playback lacks availability fields; H2 selects active-gate diagnostics ownership if availability is present but ignored; H3 selects owner-boundary migration or architecture-gap if no owner-owned observation path can be selected.",
    "expectedMetric": "selected architecture route: active-gate progress contract, failure-bundle diagnostics contract, owner-boundary migration, or architecture-gap stop",
    "inheritsFrom": "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v4.md",
    "timebox": "24h",
    "mergeRequirement": "scenario-route, causal-model, priority-recovery residuals, and playback availability-field search select one architecture route or stop",
    "killRule": "Do not edit runtime in this architecture package; if proof cannot select an owner-owned observation or migration, stop as architecture-gap."
  },
  "mechanismCard": {
    "failureMechanism": "observation_gap with contract_gap as the first alternate",
    "stableFacts": "Fresh v4 representative evidence selects startup_active_gate_owner / snapshot_coverage / active_gate_timed_out.",
    "changedFacts": "Local SQL query engine availability diagnostics passed focused proof, but representative playback did not contain the availability fields.",
    "rejectedAlternatives": "Do not open another local runtime patch while the representative observation path drops the edge; selected-source timeout remains downstream until availability observation is owned.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Active-gate snapshot coverage times out waiting for benchmark_events visibility while SQL query engine availability is not represented in playback.",
    "missingTransitionOrObservation": "A selected owner must preserve or route SQL query engine availability before partition visibility waits consume the active-gate path.",
    "smallestFalsifyingProbe": "rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test-output/reports/.playback/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z/rolling-restart",
    "expectedMovement": "The architecture proof selects failure-bundle capture, active-gate diagnostics capture, owner-boundary migration, or architecture-gap stop.",
    "negativeResultMeans": "If no owner-owned observation path is selected, close as architecture-gap rather than opening another local runtime patch.",
    "escalationRule": "Runtime edits remain blocked until the architecture route is selected."
  },
  "validationTier": "release-gate",
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Select the architecture route before another local runtime patch."
  },
  "causalGovernance": {
    "hypothesis": "The next work is architecture selection because the local SQL availability diagnostics patch did not appear in representative playback.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json plus scenario route, priority residual extraction, and playback field search ran on the fresh v4 artifact before this package was created.",
    "expectedCausalModelChange": "The package selects an observation path, owner-boundary migration, or architecture-gap stop without editing runtime.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh v4 evidence still selects active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out and playback lacks queryEngineAvailability, queryEngineAvailable, and sql_query_engine fields.",
    "crossBoundaryReview": "Do not edit admin diagnostics, failure-bundle capture, startup readiness, table bootstrap, transport, generic timeout budgets, or promotion gates until the architecture route is selected."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart startup active-gate snapshot coverage architecture v5",
    "phaseChain": [
      "v4 focused proof added SQL query engine availability diagnostics locally",
      "fresh representative rerun stayed on active_gate_snapshot_coverage",
      "playback search found no SQL query engine availability fields",
      "the kill rule requires an autonomous architecture experiment before another local patch"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "benchmark_events partition visibility waits on SQL query engine availability",
      "startup readiness remains downstream while active-gate snapshot coverage is incomplete",
      "selected-source timeout remains downstream until the missing observation path is selected"
    ],
    "missingCausalEdge": "SQL query engine availability must be preserved in the representative observation path or the owner boundary must migrate.",
    "missingCausalEdgeProbe": "rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test-output/reports/.playback/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z/rolling-restart",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Canonical route, causal-model, priority residuals, and playback field search select a bounded SQL query visibility retry, reconcile, observation path, migration, or architecture-gap stop.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
    "expectedObservableTransition": "Selected architecture route points to active-gate diagnostics capture, failure-bundle diagnostics capture, owner migration, or architecture-gap stop.",
    "maxProgressBound": "one architecture selector package before runtime resumes",
    "sameFrontierFallback": "If proof cannot select a concrete observation path or owner migration, stop as architecture-gap.",
    "expectedNextFrontier": "selected architecture route for SQL availability observation",
    "resultClassification": "same-frontier",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v3.md / startup_active_gate_owner / snapshot_coverage / active-theory-loop",
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v4.md / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "This package is the autonomous architecture experiment required by the v4 kill rule.",
    "handoffInvariant": "Runtime promotion remains blocked while SQL query engine availability is absent from representative evidence."
  },
  "architectureDecisionGate": {
    "status": "required",
    "trigger": "architecture-gap",
    "triggerEvidence": [
      "fresh v4 representative evidence stayed active_gate_snapshot_coverage / active_gate_timed_out",
      "canonical route still names startup_active_gate_owner / snapshot_coverage",
      "playback search found no SQL query engine availability fields"
    ],
    "selectedChoice": "pending-before-proof",
    "choices": [
      {
        "id": "failure-bundle-diagnostics-contract",
        "summary": "Select failure-bundle diagnostics capture if availability is absent from playback despite local diagnostics proof.",
        "route": "architecture-package",
        "proof": [
          "rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test-output/reports/.playback/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z/rolling-restart"
        ]
      },
      {
        "id": "active-gate-diagnostics-contract",
        "summary": "Select active-gate diagnostics ownership if availability is present in playback but not used by route evidence.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate only if canonical route evidence names a different deciding owner and boundary.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json"
        ]
      },
      {
        "id": "architecture-gap",
        "summary": "Stop if no owner-owned observation path or migration can be selected from fresh evidence.",
        "route": "architecture-package",
        "proof": [
          "npm run work:advance -- --check"
        ]
      }
    ],
    "nextAction": "Run the architecture proof ladder and select one route."
  },
  "observablePrediction": {
    "metric": "selected architecture route for SQL availability observation",
    "predicted": "Proof selects failure-bundle diagnostics capture, active-gate diagnostics capture, owner-boundary migration, or architecture-gap stop.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-observation"
  }
}
-->

## Why

This package is the autonomous architecture experiment required by the v4 kill rule. Runtime files stay as candidates until proof selects one observation path, migration, or architecture-gap stop.

## Validation

1. falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
2. regression: npm run analyze:causal-model -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json
3. supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json
4. supporting: rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test-output/reports/.playback/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z/rolling-restart
