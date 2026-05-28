# Failure Bundle SQL Availability Diagnostics Capture

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
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
    "predecessor": "work/packages/done-20260528-startup-active-gate-snapshot-coverage-architecture-v5.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md",
      "test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js",
      "test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js",
      "test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/admin/admin-control-snapshot-publication-convergence-diagnostics.js"
    ],
    "commitScope": [
      "work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md",
      "test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js",
      "test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js",
      "test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The active architecture package selected this diagnostics capture path from fresh representative evidence before another runtime patch.",
    "representativeRerunCadence": "explicit-invalid-rerun-reason",
    "codeQualityAdmission": "improves-evidence-fidelity"
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "matched",
    "observedMovement": "Focused failure-bundle proof preserved SQL query engine availability fields in active-gate diagnostics playback.",
    "successorReason": "The observation path is now proven; runtime owner selection can resume from the representative active-gate snapshot coverage route.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage",
    "evidenceArtifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json"
  },
  "codeQualityAdmission": {
    "reason": "improves-evidence-fidelity",
    "evidence": "The package is a test-only diagnostics proof that preserves SQL query engine availability fields in failure-bundle playback before runtime work resumes."
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
        "falsifier: npm test -- test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "supporting: rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js"
      ]
    },
    "theoryLedger": "no-ledger-update",
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md",
        "test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js",
        "test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js",
        "test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
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
  "systemTheory": {
    "problemStatement": "rolling-restart still routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage while SQL query engine availability is absent from representative playback; the selected diagnostic owner must prove failure-bundle capture preserves that observation.",
    "phaseChain": [
      "v4 admin active-gate diagnostics added local SQL query engine availability fields.",
      "fresh representative v4 evidence stayed on active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out.",
      "architecture v5 selected diagnostics_owner / failure_bundle_diagnostics_capture because representative playback contained no queryEngineAvailability, queryEngineAvailable, or sql_query_engine fields."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage remains the representative runtime frontier.",
      "diagnostics_owner / failure_bundle_diagnostics_capture owns this proof because the selected observation is missing from failure-bundle playback.",
      "admin diagnostics source, startup readiness, table bootstrap, transport, generic timeout budgets, and promotion gates remain frozen until this observation path is proven or rejected."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Representative route still names active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
      "Representative playback lacks SQL query engine availability fields."
    ],
    "changedFacts": [
      "Architecture v5 selected failure-bundle diagnostics capture as the next owner-owned observation path.",
      "The active package is now a test-only proof rather than another runtime patch."
    ],
    "competingTheories": [
      "H1 failure-bundle diagnostics capture drops availability fields that are already produced upstream.",
      "H2 the fields never reach failure-bundle input and ownership must migrate back to active-gate diagnostics.",
      "H3 the missing observation is not needed by failure-bundle routing and route evidence remains unchanged."
    ],
    "eliminatedTheories": [
      "Another startup active-gate runtime patch is eliminated until the SQL availability observation path is preserved.",
      "Selected-source timeout remains downstream while SQL query availability is absent from representative playback."
    ],
    "downstreamSymptoms": [
      "benchmark_events partition visibility waits on SQL query engine availability.",
      "startup readiness remains downstream while active-gate snapshot coverage is incomplete.",
      "selected-source timeout remains downstream until the observation path is proven."
    ],
    "transitionTable": [
      {
        "inputSignal": "active_gate_timed_out with SQL query engine availability fields absent from playback",
        "owner": "diagnostics_owner / failure_bundle_diagnostics_capture",
        "missingTransition": "Failure-bundle active-gate diagnostics must preserve SQL query engine availability fields before runtime ownership resumes.",
        "expectedEvidence": "Focused failure-bundle proof preserves queryEngineAvailability or queryEngineAvailable, or migrates owner boundary.",
        "falsifier": "npm test -- test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js",
        "migrationTrigger": "Migrate back to active-gate diagnostics if failure-bundle input never receives the availability fields."
      }
    ],
    "ownershipMigrationTriggers": [
      "Focused failure-bundle proof shows availability fields are absent before the builder owns them.",
      "The fixture cannot preserve the fields without editing runtime source."
    ],
    "architectureGapTriggers": [
      "Focused proof cannot identify a failure-bundle input or output that can carry SQL availability.",
      "The representative artifact lacks enough diagnostics structure to prove either capture or migration."
    ],
    "wholeSystemInvariant": "Runtime edits remain blocked until the selected SQL query engine availability observation path is preserved or rejected."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md systemTheory",
    "selectedSystemTheory": "The selected slice is failure-bundle diagnostics capture of SQL query engine availability.",
    "selectedMechanism": "observation_gap with diagnostics_capture_gap as the first alternate",
    "sourceTestContract": "Update only the failure-bundle diagnostics builder, SQL query engine availability field helper, and focused SQL query engine availability test to preserve queryEngineAvailability/queryEngineAvailable fields.",
    "falsifier": "npm test -- test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js",
    "representativeExpectedMovement": "migrated diagnostic route preserves the missing SQL query engine availability observation or migrates the owner boundary back to active-gate diagnostics",
    "killRule": "If proof needs runtime source edits or cannot own the missing observation, stop and migrate owner boundary instead of widening scope.",
    "theoryFitScore": {
      "evidenceFit": "high - architecture v5 selected this path from representative playback with no SQL availability fields.",
      "ownerBoundaryFit": "high - failure-bundle diagnostics capture owns playback serialization without runtime owner changes.",
      "falsifiability": "high - a focused failure-bundle fixture can prove whether the fields are preserved.",
      "representativeMovement": "medium - this package proves the observation path before representative runtime movement.",
      "downstreamRiskContainment": "high - runtime admin diagnostics and startup readiness remain frozen until the observation path is proven."
    },
    "wrongSliceTriggers": [
      "failure-bundle input does not receive SQL availability fields",
      "proof requires runtime admin diagnostics changes",
      "representative route evidence contradicts diagnostics_owner / failure_bundle_diagnostics_capture"
    ]
  },
  "validationTier": "single-owner",
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Preserve SQL query engine availability fields in failure-bundle active-gate diagnostics playback before another runtime patch."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "diagnostics_owner",
    "toBoundary": "failure_bundle_diagnostics_capture",
    "reason": "Architecture v5 selected the diagnostics owner because representative playback lacked SQL query engine availability fields after the active-gate diagnostics patch.",
    "evidence": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json"
  },
  "causalGovernance": {
    "hypothesis": "Failure-bundle diagnostics capture is the selected observation path because representative playback lacks SQL query engine availability fields after local admin diagnostics proof.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
    "expectedCausalModelChange": "Focused proof preserves queryEngineAvailability or queryEngineAvailable in failure-bundle active-gate diagnostics or migrates the owner boundary back to active-gate diagnostics.",
    "representativeOutcome": "migrated",
    "causalDebt": "Representative route still reports active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out while the playback lacks the SQL availability observation needed to decide the next runtime contract.",
    "crossBoundaryReview": "Runtime admin diagnostics, startup readiness, table bootstrap, transport, generic timeout budgets, and promotion gates remain frozen unless this focused proof shows failure-bundle capture cannot own the observation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart failure-bundle SQL availability diagnostics capture",
    "phaseChain": [
      "v4 admin diagnostics proof added local SQL query engine availability fields",
      "fresh representative v4 evidence stayed on active_gate_snapshot_coverage",
      "architecture v5 selected failure-bundle diagnostics capture because playback search found no SQL query engine availability fields"
    ],
    "currentFirstFrontier": "diagnostics_owner / failure_bundle_diagnostics_capture / sql_query_engine_availability_absent selected from active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "benchmark_events partition visibility waits on SQL query engine availability",
      "startup readiness remains downstream while active-gate snapshot coverage is incomplete",
      "selected-source timeout remains downstream until the availability observation is preserved"
    ],
    "missingCausalEdge": "Failure-bundle active-gate diagnostics must preserve SQL query engine availability before the startup active-gate owner can select the next runtime transition.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js",
    "boundedProgressProof": "Focused proof must preserve the SQL query availability observation in failure-bundle diagnostics or trigger a bounded owner-boundary migration before runtime edits resume.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json",
    "expectedObservableTransition": "failure-bundle activeGateSnapshotCoverage diagnostics include queryEngineAvailability or queryEngineAvailable",
    "maxProgressBound": "one test-only proof package before runtime resumes",
    "sameFrontierFallback": "If failure-bundle capture cannot preserve the fields without runtime source edits, stop and migrate owner boundary instead of widening this proof package.",
    "expectedNextFrontier": "diagnostics_owner / failure_bundle_diagnostics_capture / sql_query_engine_availability_absent",
    "resultClassification": "migrated",
    "stopCondition": "continue-local-fix"
  },
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
      "npm run work:validate -- --entry work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md"
    ]
  }
}
-->

## Why

Architecture v5 selected the failure-bundle diagnostics path before runtime resumes. This proof owns only whether the representative failure-bundle capture preserves SQL query engine availability fields that were absent from playback.

## Validation

1. falsifier: npm test -- test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
3. supporting: rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js

## Execution Evidence

- [x] action: implementation; owner: diagnostics_owner; files-changed: work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md, test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js, test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js, test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js; validation: npm test -- test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: diagnostics_owner; files-changed: work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md; validation: npm run work:package:doctor -- --suggest work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md; npm test -- test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js; npm run work:scenario-route -- test-output/reports/rolling-restart-startup-active-gate-owner-snapshot-coverage-v4-20260528T150137Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; rg -n 'queryEngineAvailability|queryEngineAvailable|sql_query_engine' test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js; node scripts/check-guideline-literals.js test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js; node scripts/check-guideline-decision-boundaries.js test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js; npm run audit:runtime-grammar:file -- test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js; npm run audit:file-size -- test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js; git diff --check -- work/packages/active-20260528-failure-bundle-sql-availability-diagnostics-capture.md test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js test/distributed/harness/failure-bundle-sql-query-engine-availability-fields.js test/distributed/harness/__tests__/failure-bundle-sql-query-engine-availability.test.js; outcome: validated.
