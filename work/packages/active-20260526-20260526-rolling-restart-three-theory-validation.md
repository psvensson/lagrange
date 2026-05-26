# Rolling Restart Three Theory Validation

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-26",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Three-theory sprint executed. H2 was confirmed as a diagnostics/report sidecar-loading bug and fixed by loading linked failure-bundle and triage sidecars before route, topology, causal, and representative summaries. Baseline H1/H3 were supported as symptoms (admin ECONNREFUSED after durable rejoin and control_snapshot_authority_unavailable), but no runtime patch was selected. The post-diagnostics rolling-restart rerun failed on a migrated frontier: operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait with active-gate evidence populated.",
    "nextAction": "Open or focus the successor for operation_workflow_owner / workflow_progress priority recovery event-driven wait; do not patch H1/H3 from the older evidence-missing artifact in this package."
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md",
      "work/sprints/active-2026-q2-rolling-restart-three-theory-validation.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/theory-ledger.md",
      "src/admin/admin-websocket-api-segment-1.js",
      "src/admin/admin-control-snapshot-class-part-2.js",
      "src/admin/admin-service-discovery-readiness-methods.js",
      "src/bootstrap/bootstrap-api-server-methods.js",
      "src/bootstrap/bootstrap-readiness-ladder.js",
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-probe-details.js",
      "src/control-plane/control-plane-snapshot-owner.js",
      "src/transport/message-router.js",
      "scripts/artifact-sidecar-loader.js",
      "scripts/analyze-causal-model.js",
      "scripts/analyze-topology-convergence.js",
      "scripts/summarize-representative-evidence.js",
      "scripts/work-scenario-route.js",
      "test/admin/admin-control-snapshot.test.js",
      "test/bootstrap/bootstrap-api.test.js",
      "test/bootstrap/bootstrap-readiness-ladder.test.js",
      "test/bootstrap/startup-recovery-coordinator.test.js",
      "test/distributed/harness/__tests__/cluster.test-part-2.js",
      "test/distributed/harness/__tests__/cluster.test-part-4-control-snapshot-coverage.js",
      "test/distributed/harness/__tests__/failure-bundle-core-07-test-cases.js",
      "test/scripts/analyze-topology-convergence.test.js",
      "test/scripts/summarize-representative-evidence.test.js",
      "test/transport/message-router.test.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json",
      "test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json",
      "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/admin/admin-websocket-api-segment-1.js",
      "src/admin/admin-control-snapshot-class-part-2.js",
      "src/admin/admin-service-discovery-readiness-methods.js",
      "src/bootstrap/bootstrap-api-server-methods.js",
      "src/bootstrap/bootstrap-readiness-ladder.js",
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-probe-details.js",
      "src/control-plane/control-plane-snapshot-owner.js",
      "src/transport/message-router.js"
    ],
    "commitScope": [
      "work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md",
      "work/sprints/active-2026-q2-rolling-restart-three-theory-validation.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/theory-ledger.md",
      "src/admin/admin-websocket-api-segment-1.js",
      "src/admin/admin-control-snapshot-class-part-2.js",
      "src/admin/admin-service-discovery-readiness-methods.js",
      "src/bootstrap/bootstrap-api-server-methods.js",
      "src/bootstrap/bootstrap-readiness-ladder.js",
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-probe-details.js",
      "src/control-plane/control-plane-snapshot-owner.js",
      "src/transport/message-router.js",
      "scripts/artifact-sidecar-loader.js",
      "scripts/analyze-causal-model.js",
      "scripts/analyze-topology-convergence.js",
      "scripts/summarize-representative-evidence.js",
      "scripts/work-scenario-route.js",
      "test/admin/admin-control-snapshot.test.js",
      "test/bootstrap/bootstrap-api.test.js",
      "test/bootstrap/bootstrap-readiness-ladder.test.js",
      "test/bootstrap/startup-recovery-coordinator.test.js",
      "test/distributed/harness/__tests__/cluster.test-part-2.js",
      "test/distributed/harness/__tests__/cluster.test-part-4-control-snapshot-coverage.js",
      "test/distributed/harness/__tests__/failure-bundle-core-07-test-cases.js",
      "test/scripts/analyze-topology-convergence.test.js",
      "test/scripts/summarize-representative-evidence.test.js",
      "test/transport/message-router.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "representative-migrated",
    "whyHighestLeverageNow": "The three-theory discriminator confirmed the diagnostics sidecar-loading gap, then the representative rerun moved off evidence_missing. The current leverage is no longer H1/H3 runtime patching; it is the migrated operation-workflow priority recovery event-driven wait.",
    "representativeRerunCadence": "scheduled-rerun-command"
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
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-restarted-node-admin-surface",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap",
      "theory-20260526-rolling-restart-control-snapshot-authority-recovery"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage",
        "regression: npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
        "baseline: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --explain active_gate_snapshot_coverage",
        "baseline: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json",
        "focused: node --test test/scripts/summarize-representative-evidence.test.js",
        "focused: node --test --test-name-pattern \"loads linked failure-bundle sidecars\" test/scripts/analyze-topology-convergence.test.js",
        "rerun: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --verbose",
        "post-rerun: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json"
      ]
    }
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
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json",
      "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --explain active_gate_snapshot_coverage"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "update-current-package",
    "runtimePromotionRule": "The selected bug was diagnostics-sidecar loading. Keep H1/H3 runtime files candidate-only unless fresh evidence selects them; continue runtime work in the operation-workflow successor."
  },
  "requiredPreImplProbe": {
    "command": "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage",
    "artifact": "test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json",
    "reason": "Pre-edit proof must preserve the latest active-gate evidence-missing frontier and show which of the restarted-node admin surface, evidence-capture, or control-snapshot-authority theories selects the executable owner slice."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "causal-escalation",
    "expectedDelta": "The rerun populated active-gate evidence and migrated the first frontier to operation_workflow_owner / workflow_progress with priorityRecoveryResiduals witnessCount=5 and splitRequired=true.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "current-blocker refresh via npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The latest restarted-node recovery-ready failure is caused by one of three bounded edges: H1 the restarted node's admin service never binds after bootstrap health becomes reachable; H2 active-gate/control-snapshot evidence capture drops the decisive snapshot coverage and probe fields; H3 control-snapshot authority or publication recovery cannot establish after restart.",
    "stopConditionCheck": "Run canonical route, distributed failure analysis, topology convergence explain, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json` before source edits; inspect only owner-ranked files selected by those proofs.",
    "expectedCausalModelChange": "A confirmed fix should make restarted-node adminReady or controlPlaneRecoveryReady progress, populate active-gate snapshot coverage evidence, migrate the first frontier, or pass rolling-restart.",
    "representativeOutcome": "migrated",
    "causalDebt": "Baseline sidecar evidence supported H1/H3 symptoms, but the confirmed source bug was H2: report-level analyzers did not dereference linked failure-bundle and triage sidecars. After the diagnostics fix, the fresh rerun exposed activeGate.progress and migrated to operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait.",
    "crossBoundaryReview": "Admin, bootstrap recovery, and control-snapshot runtime edits are not selected from the older evidence-missing artifact. The successor edge belongs to operation workflow priority recovery event-driven wait."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart post-diagnostics artifact test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "phaseChain": [
      "previous focused proof cleared priority recovery residuals to zero",
      "post-source rolling-restart failed on restarted-node recovery-ready within 120000ms",
      "bootstrap health stayed reachable while admin probing refused connection",
      "sidecar-loading fix made linked failure-bundle evidence visible to route, topology, causal, and representative summaries",
      "post-diagnostics rerun failed with active-gate evidence populated and first frontier priority_recovery_partition_progress / operation_workflow_owner / workflow_progress"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "post-diagnostics rerun has 4/5 active nodes and selected snapshot coverage 2/5",
      "priorityRecoveryResiduals witnessCount=5 with splitRequired=true",
      "priority recovery reports eligible_but_no_operation_created and needs_operation/recovering_in_flight",
      "selected active-gate evidence is now present at failureBundle.publicationConvergence.activeGate.progress"
    ],
    "missingCausalEdge": "Which operation workflow or rebalancer edge owns priority_recovery_event_driven_wait after diagnostics evidence is complete.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json",
    "falsifyingProbe": "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "boundedProgressProof": "Open or focus a successor for operation_workflow_owner / workflow_progress priority recovery event-driven wait, specifically the dispatch/delivery path from eligible_but_no_operation_created to operation creation and progress; this package should not select H1/H3 runtime edits from the older artifact.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "expectedObservableTransition": "successor priority recovery event-driven wait reduction, owner-boundary split, or representative green.",
    "maxProgressBound": "one causal-escalation package and one representative rerun after source changes",
    "sameFrontierFallback": "If a successor rerun stays on priority_recovery_event_driven_wait with the same residuals, split the operation workflow/rebalancer owner boundary instead of patching startup active-gate symptoms.",
    "expectedNextFrontier": "representative-green, reduced priority recovery residual, or split successor owner boundary",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json / operation_workflow_owner / workflow_progress / reduced",
      "test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json / operation_workflow_owner / workflow_progress / classified_backpressure",
      "test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json / startup_active_gate_owner / snapshot_coverage / evidence_missing",
      "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait"
    ],
    "oscillationCheck": "This reused active package is allowed because the prior representative rerun migrated owner boundary and the user requested a bounded three-theory sprint before further runtime edits.",
    "handoffInvariant": "Owners decide admin readiness, bootstrap recovery readiness, and active-gate admission; diagnostics and harness evidence may observe but must not override owner outcomes."
  },
  "representativeResidual": {
    "status": "active",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Open or focus the successor for operation_workflow_owner / workflow_progress priority recovery event-driven wait."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "After the diagnostics sidecar-loading fix, rolling-restart no longer routes as evidence_missing; it exposes active-gate progress evidence and selects priority_recovery_event_driven_wait.",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json"
  },
  "observablePrediction": {
    "metric": "restarted-node adminReady/controlPlaneRecoveryReady, active-gate evidence completeness, first frontier, rolling-restart status",
    "predicted": "A confirmed source fix or diagnostic repair makes restarted-node adminReady/controlPlaneRecoveryReady progress, fills active-gate snapshot coverage evidence, migrates the first frontier, or passes rolling-restart.",
    "observed": "H2 diagnostics repair populated active-gate evidence and migrated first frontier to operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait; rolling-restart remains red.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "metricDelta": 1
  },
  "experimentOutcome": {
    "decision": "owner-boundary-migration",
    "distinguishedHypothesis": "H2",
    "baselineArtifact": "test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json",
    "representativeArtifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "metricDelta": "active-gate evidence missing -> failureBundle.publicationConvergence.activeGate.progress populated; first frontier migrated to priority_recovery_partition_progress",
    "nextOwner": "operation_workflow_owner",
    "nextBoundary": "workflow_progress",
    "nextDominantReason": "priority_recovery_event_driven_wait",
    "evidence": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "open-architecture-package",
    "nextAction": "Use the post-diagnostics route to open or focus the successor operation_workflow_owner / workflow_progress package; this package has completed the H1/H2/H3 discriminator.",
    "triggerEvidence": [
      "The baseline artifact was evidence_missing for active_gate_snapshot_coverage and restarted-node recovery-ready failed with admin ECONNREFUSED.",
      "Linked failure-bundle sidecars contained decisive state that report-level analyzers did not load.",
      "After the sidecar-loading fix, the representative rerun exposed active-gate evidence and selected operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait."
    ],
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Completed by running this package as the three-theory discriminator and fixing the selected diagnostics mechanism.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage",
          "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json"
        ]
      },
      {
        "id": "continue-local-proof",
        "summary": "Continue local proof in the operation-workflow successor selected by the post-diagnostics rerun.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Escalate only if the evidence is contradictory or required tooling is unavailable.",
        "route": "human-escalation",
        "proof": [
          "npm run work:context"
        ]
      }
    ]
  },
  "boundedExperiment": {
    "hypothesis": "H1 Admin Surface: bootstrap health returns but the restarted node's admin service never binds/listens. H2 Evidence Capture: active-gate/control-snapshot diagnostics drop decisive coverage and probe state, causing evidence_missing. H3 Control-Snapshot Authority: startup recovery cannot establish control-snapshot authority or publication evidence after restart.",
    "hypothesisDiscriminator": "H1 is selected if local admin service startup/listen evidence fails while bootstrap remains reachable. H2 is selected if owner state exists but the active-gate/control-snapshot report path omits it. H3 is selected if startup recovery authority/publication evidence remains unavailable before admin readiness can progress.",
    "expectedMetric": "selected theory plus adminReady/controlPlaneRecoveryReady progress, active-gate snapshot coverage evidence completeness, or route migration",
    "observedMetric": "H2 selected and fixed; post-diagnostics rerun populated active-gate progress evidence and migrated to operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait.",
    "inheritsFrom": "work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md",
    "timebox": "24h",
    "mergeRequirement": "canonical route, distributed failure, topology convergence explain, causal model, one selected focused test, and representative rerun if source changes",
    "killRule": "Do not edit H1/H3 runtime from the older evidence-missing artifact; continue in a successor priority-recovery package."
  },
  "validationTier": "cross-owner",
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
  }
}
-->

## Why

The latest post-source `rolling-restart` artifact cleared the prior operation-workflow residual but still failed on restarted-node recovery readiness. This reused package owned the discriminator for the three current theories, the confirmed H2 diagnostics fix, and the required representative rerun after source changed.

## Scope Basis

Scenario release-gate work for `rolling-restart` under the active sprint. Runtime writes stay limited to the owner-ranked admin, bootstrap recovery, control-snapshot, transport, and focused test files declared in metadata.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: the baseline artifact routed to startup_active_gate_owner / snapshot_coverage / evidence_missing, but after the sidecar-loading fix the representative rerun routes to operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait.
- Inputs/signals: `test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`; `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage`; `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --explain active_gate_snapshot_coverage`; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`.
- State model or invariant: recovery-ready, admin readiness, control-plane recovery readiness, and active-gate snapshot coverage must remain separate owner outcomes; missing diagnostics may block classification but must not promote readiness.
- Non-goals and forbidden interpretations: Do not widen timeouts, relax active-gate/readiness admission, reinterpret degraded evidence as ready, or edit runtime outside declared scope.
- Proof mapping: Focused proof selected H2 evidence capture. Runtime H1/H3 edits remain unselected because the fresh representative rerun moved to the operation-workflow priority recovery edge.
- Wrong-slice trigger: Stop or split if the canonical route changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait | H2 fixed the evidence capture gap; the fresh representative failure now belongs to operation workflow priority recovery | Open or focus the successor operation-workflow package; do not patch H1/H3 from older evidence. | reduced priority recovery residual, owner-boundary split, or representative green | npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package fixed the diagnostics evidence gap before changing readiness or snapshot coverage behavior.
- Falsifying focused probe: `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`
- Competing explanations: Compare admin service listen failure, diagnostic evidence loss, and control-snapshot authority recovery before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: This is not another same-frontier symptom patch because runtime edits are blocked until the discriminator selects admin listen, evidence delivery, or bounded authority recovery; if proof remains evidence_missing with no admin/recovery/evidence movement, stop for an autonomous architecture experiment or human escalation.

## Decision Experiment Gate

- Decision question: Which concrete mechanism owns the restarted-node recovery-ready failure: admin service listen, active-gate evidence capture, or control-snapshot authority recovery?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: H1 predicts bootstrap health reaches the node but admin service startup/listen fails; H2 predicts active-gate/control-snapshot owner state exists but diagnostics fail to capture it; H3 predicts startup recovery cannot establish control-snapshot authority or publication evidence before admin readiness can progress.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage`
- Success metrics: one selected theory, one focused failing or discriminating test, adminReady/controlPlaneRecoveryReady movement, active-gate evidence completeness, route migration, or representative green.
- Representative rerun: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --verbose`
- Kill rule: The discriminator selected H2 and the rerun migrated; stop H1/H3 runtime work here and follow the operation-workflow successor.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`
- Expected delta: representative green, restarted-node adminReady/controlPlaneRecoveryReady movement, populated active-gate evidence, owner-boundary migration, architecture-gap, or human-escalation.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: `test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json` failed but populated active-gate evidence and migrated the owner boundary.
- Stop if unchanged: the package did not stay evidence_missing; continue from the migrated operation-workflow priority recovery edge.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `causal-escalation`
- Required after rerun: open or focus a successor for the operation-workflow priority recovery event-driven wait edge, then refresh current-blocker and validators.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `update-current-package`
- Runtime promotion rule: H2 promoted diagnostics-only files and focused regressions. H1/H3 runtime files stay candidate-only until fresh evidence selects them.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Canonical evidence extraction for the latest rolling-restart artifact.
2. Focused source inspection for H1 restarted-node admin surface, H2 active-gate/control-snapshot evidence capture, and H3 control-snapshot authority recovery.
3. Source/test fixes only when a focused bug is confirmed.
4. Representative `rolling-restart` rerun if source changes.

## Out Of Scope

1. Timeout widening.
2. Readiness or admission relaxation.
3. Unrelated roadmap, governance, or workflow cleanup.
4. Runtime ownership changes outside the declared owner files.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --explain active_gate_snapshot_coverage`
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

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: src/admin/admin-control-snapshot-class-part-2.js; validation: H1/H2/H3 probes run; fixed forced-repair fallback gating; parent revalidated focused proof: yes; node test/admin/admin-control-snapshot.test.js PASS 329/329; node test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js PASS 230/230; node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js PASS 72/72; node test/rebalancer/priority-recovery-stale-planning-visibility.test.js PASS 12/12; node test/control-plane/control-plane-snapshot-owner.test.js PASS 25/25; node test/transport/message-router.test.js PASS 361/361; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: post-source representative rerun: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --verbose FAIL; route: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage => priorityRecoveryResiduals witnessCount=0, first frontier active_gate_snapshot_coverage/evidence_missing, causalOutcome=ask_human; parent revalidated focused proof: yes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json,work/sprints/current-blocker.md,work/sprints/active-2026-q2-rolling-restart-three-theory-validation.md; validation: npm run work:repair PASS; parent revalidated focused proof: yes; parent revalidated focused proof: yes; outcome: validated.

- [x] action: sprint-update; owner: workflow_tooling_owner; files-changed: work/theory-ledger.md, work/packages/active-20260526-20260526-rolling-restart-three-theory-validation.md; validation: recorded latest three theory refs for restarted-node admin surface, active-gate evidence capture gap, and control-snapshot authority recovery; parent revalidated focused proof: pending; outcome: active.
- [x] action: discriminator; owner: diagnostics_owner; files-changed: scripts/artifact-sidecar-loader.js, scripts/analyze-causal-model.js, scripts/analyze-topology-convergence.js, scripts/summarize-representative-evidence.js, scripts/work-scenario-route.js, test/scripts/analyze-topology-convergence.test.js, test/scripts/summarize-representative-evidence.test.js; validation: sidecar-linked baseline reroute confirmed H2 diagnostics/report loading gap; focused tests passed; parent revalidated focused proof: yes; outcome: H2 fixed.
- [x] action: representative-rerun; owner: operation_workflow_owner; files-changed: none; validation: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --verbose FAIL; route: operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait; causalOutcome=accept_classified_backpressure; activeGate evidence path populated; parent revalidated focused proof: yes; outcome: migrated successor.
## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason evidence_missing --explain active_gate_snapshot_coverage
2. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json --explain active_gate_snapshot_coverage
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-20260526T140236Z.report.json
5. node --test test/scripts/summarize-representative-evidence.test.js
6. node --test --test-name-pattern "loads linked failure-bundle sidecars" test/scripts/analyze-topology-convergence.test.js
7. node --test --test-name-pattern "loads linked failure-bundle sidecars" test/scripts/summarize-representative-evidence.test.js
8. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --verbose
9. npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json
10. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
11. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --explain active_gate_snapshot_coverage
12. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
