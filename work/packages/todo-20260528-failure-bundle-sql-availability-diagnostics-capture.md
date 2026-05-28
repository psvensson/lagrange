# Failure Bundle SQL Availability Diagnostics Capture

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-28",
    "lane": "test-only-proof",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
    "playback": "none",
    "owner": "diagnostics_owner",
    "boundary": "failure_bundle_diagnostics_capture",
    "dominantReason": "sql_query_engine_availability_absent",
    "currentState": "Architecture v5 selected failure-bundle diagnostics capture because representative playback lacks SQL query engine availability fields.",
    "nextAction": "Preserve SQL query engine availability fields in failure-bundle active-gate diagnostics playback.",
    "predecessor": "work/packages/done-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md"
  },
  "scope": {
    "writeScope": [
      "test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js",
      "test/distributed/harness/__tests__/failure-bundle.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/admin/admin-control-snapshot-publication-convergence-diagnostics.js"
    ],
    "commitScope": [
      "test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js",
      "test/distributed/harness/__tests__/failure-bundle.test.js",
      "work/packages/todo-20260528-failure-bundle-sql-availability-diagnostics-capture.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The active architecture package selected this diagnostics capture path from fresh representative evidence before another runtime patch.",
    "representativeRerunCadence": "explicit-invalid-rerun-reason"
  },
  "modelFit": {
    "packageClass": "test-only-proof",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "diagnostic-owner-evidence/current-artifact",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "proof requires runtime source edits",
      "failure-bundle capture cannot own the missing observation",
      "representative evidence contradicts the selected diagnostics owner"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/distributed/harness/__tests__/failure-bundle.test.js",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "supporting: rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test-output/reports/.playback/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z/rolling-restart"
      ]
    }
  },
  "boundedExperiment": {
    "hypothesis": "Failure-bundle diagnostics capture drops the SQL query engine availability fields produced by admin active-gate diagnostics.",
    "hypothesisDiscriminator": "H1 is selected if a focused failure-bundle fixture can preserve queryEngineAvailability/queryEngineAvailable fields; H2 is selected if the fields never reach failure-bundle input and the owner must migrate back to active-gate diagnostics.",
    "expectedMetric": "failure-bundle activeGateSnapshotCoverage diagnostics include queryEngineAvailability or queryEngineAvailable",
    "inheritsFrom": "work/packages/done-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md",
    "timebox": "24h",
    "mergeRequirement": "focused failure-bundle test plus scenario-route regression",
    "killRule": "If focused proof cannot preserve the fields without runtime source edits, stop and migrate owner boundary instead of widening this proof package."
  },
  "validationTier": "single-owner",
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
    "routeOwner": "diagnostics_owner",
    "routeBoundary": "failure_bundle_diagnostics_capture",
    "routeDominantReason": "sql_query_engine_availability_absent",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "test-only-proof",
    "expectedDelta": "Focused proof preserves SQL query engine availability fields in failure-bundle active-gate diagnostics or migrates owner boundary.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner diagnostics_owner --boundary failure_bundle_diagnostics_capture --dominant-reason sql_query_engine_availability_absent",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "current-blocker refresh via npm run work:repair",
      "npm run work:validate -- --entry work/packages/todo-20260528-failure-bundle-sql-availability-diagnostics-capture.md",
      "npm run work:validate -- --pre-impl work/packages/todo-20260528-failure-bundle-sql-availability-diagnostics-capture.md"
    ]
  }
}
-->

## Why

Architecture v5 selected the failure-bundle diagnostics path before runtime resumes. This proof owns only whether the representative failure-bundle capture preserves SQL query engine availability fields that were absent from playback.

## Validation

1. falsifier: npm test -- test/distributed/harness/__tests__/failure-bundle.test.js
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
3. supporting: rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test-output/reports/.playback/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z/rolling-restart
