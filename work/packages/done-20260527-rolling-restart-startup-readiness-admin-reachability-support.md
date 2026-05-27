# Rolling Restart Startup Readiness Admin Reachability Support

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "playback": "none",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "admin_reachability_refused",
    "currentState": "Architecture experiment selected startup_readiness_owner / startup_support_evidence because topology convergence classified the rebalancer handoff source as admin_reachability_refused and startup_recovery_blocked.",
    "nextAction": "Prove and repair startup readiness/admin reachability support for admin_reachability_refused, then rerun rolling-restart until the representative scenario succeeds.",
    "predecessor": "work/packages/done-20260526-reconnect-handoff-architecture-experiment.md",
    "closed": "2026-05-27",
    "successor": "work/packages/done-20260527-rolling-restart-operation-workflow-owner-workflow-progress.md"
  },
  "scope": {
    "writeScope": [
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/bootstrap/startup-authority-consumption.test.js",
      "test/bootstrap/node-joining-ready-signal-retry.test.js",
      "test/bootstrap/traffic-readiness-utils.test.js",
      "test/distributed/harness/startup-readiness-evidence.js",
      "test/distributed/harness/cluster-segment-5.js",
      "test/distributed/harness/cluster-segment-7-class-2.js",
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/__tests__/cluster.test-part-2.js",
      "test/distributed/harness/__tests__/cluster-part-2-node-reachability-test-cases.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
      "test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js",
      "test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js",
      "work/packages/done-20260526-reconnect-handoff-architecture-experiment.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md"
    ],
    "candidateRuntimeFiles": [
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/distributed/harness/cluster-segment-5.js",
      "test/distributed/harness/cluster-segment-7-class-2.js",
      "test/distributed/harness/cluster-segment-7-class-4.js"
    ],
    "commitScope": [
      "src/bootstrap/startup-recovery-coordinator.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/bootstrap/startup-authority-consumption.test.js",
      "test/bootstrap/node-joining-ready-signal-retry.test.js",
      "test/bootstrap/traffic-readiness-utils.test.js",
      "test/distributed/harness/startup-readiness-evidence.js",
      "test/distributed/harness/cluster-segment-5.js",
      "test/distributed/harness/cluster-segment-7-class-2.js",
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/__tests__/cluster.test-part-2.js",
      "test/distributed/harness/__tests__/cluster-part-2-node-reachability-test-cases.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
      "test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js",
      "test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js",
      "work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-support.md",
      "work/packages/done-20260526-reconnect-handoff-architecture-experiment.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md"
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
        "falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
        "supporting: npm run audit:guideline:literals -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
        "supporting: npm run audit:guideline:decision-boundaries -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
        "supporting: npm run audit:runtime-grammar:file -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js"
      ]
    }
  },
  "boundedExperiment": {
    "hypothesis": "State the experiment hypothesis before implementation.",
    "hypothesisDiscriminator": "Predict the different observable under H1 vs H2 vs H3 before implementation.",
    "expectedMetric": "Name the count, frontier, route, or representative result expected to move.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "representative frontier owner/boundary after startup reachability fix",
    "predicted": "admin_reachability_refused clears or migrates to a non-startup owner",
    "observed": "migrated to operation_workflow_owner / workflow_progress",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json",
    "metricDelta": 1
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_readiness_owner",
    "fromBoundary": "startup_support_evidence",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "fresh representative evidence no longer reports admin_reachability_refused as terminal and selects priority_recovery_event_driven_wait in workflow_progress",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress"
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
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json",
    "frontier": "operation_workflow_owner / workflow_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Continue in the operation workflow progress successor; the startup admin reachability refusal is no longer the representative blocker."
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
      "regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
      "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "admin_reachability_refused",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "causal-escalation",
    "expectedDelta": "Focused startup readiness proof should classify admin_reachability_refused as bounded startup support evidence, let recovery readiness proceed only through the startup owner contract, and the fresh rolling-restart representative should pass or expose a new named owner boundary.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason admin_reachability_refused",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "WebSocket transport reconnection hang under load prevents node bootstrap join convergence.",
    "stopConditionCheck": "Use npm run analyze:causal-model on the latest representative artifact; latest: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json.",
    "expectedCausalModelChange": "Startup readiness/admin reachability support is no longer terminal; operation workflow progress is now the selected first frontier.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh rolling-restart moved from admin_reachability_refused to persisted-not-dispatched priority recovery workflow progress with snapshot coverage blocked downstream.",
    "crossBoundaryReview": "Startup readiness support did its bounded work; successor must prove operation workflow progress before active-gate snapshot coverage or transport runtime edits resume."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "startup readiness support focused proof passed after capping reachability HTTP stage timeouts",
      "fresh rolling-restart rerun completed at test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json",
      "admin_reachability_refused stopped being the representative terminal blocker",
      "topology convergence selected operation_workflow_owner / workflow_progress with priority_recovery_event_driven_wait"
    ],
    "currentFirstFrontier": "operation_workflow_owner/workflow_progress",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage",
      "publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7"
    ],
    "missingCausalEdge": "Operation workflow progress must explain why the selected priority recovery operation stayed planned/persisted-not-dispatched before active gate snapshot coverage can recover.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
    "boundedProgressProof": "Advance or classify the persisted-not-dispatched priority recovery workflow progress before any downstream retry or active-gate patch.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json",
    "expectedObservableTransition": "Successor selects a concrete operation workflow progress proof or runtime owner, then reruns rolling-restart toward representative green.",
    "maxProgressBound": "one successor package before another representative rerun",
    "sameFrontierFallback": "Open an autonomous architecture experiment rather than another local patch.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260526-rolling-restart-operation-workflow-owner-workflow-progress.md",
      "done-20260526-rolling-restart-operation-workflow-owner-rebalancer-handoff.md"
    ],
    "oscillationCheck": "Fresh evidence moved away from startup readiness and back to workflow progress with a different source shape: planned dispatch rather than admin reachability refused.",
    "handoffInvariant": "Startup readiness package closes only by handing off to operation workflow progress; active-gate and transport runtime remain frozen until that successor proves or falsifies progress."
  },
  "theoryLedger": "no ledger update: this package produced a bounded owner migration rather than a durable new runtime theory; successor records workflow-progress theory if fixed.",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

Theory ledger: `planned-new-theory` - record the focused proof and fresh rolling-restart result after this package tests startup readiness support behavior for `admin_reachability_refused`.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_readiness_owner / startup_support_evidence emits the package outcome for admin_reachability_refused.
- Inputs/signals: test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json; falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js; regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json; supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json; supporting: npm run audit:guideline:literals -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js; supporting: npm run audit:guideline:decision-boundaries -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js; supporting: npm run audit:runtime-grammar:file -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js.
- State model or invariant: The startup_readiness_owner / startup_support_evidence decision table in the Causal Decision Contract maps admin_reachability_refused and route evidence to one emitted outcome: migrate_owner_boundary.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / admin_reachability_refused | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Prove and repair startup readiness/admin reachability support for admin_reachability_refused, then rerun rolling-restart until the representative scenario succeeds. | Focused startup readiness proof should classify admin_reachability_refused as bounded startup support evidence, let recovery readiness proceed only through the startup owner contract, and the fresh rolling-restart representative should pass or expose a new named owner boundary. | falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`
- Competing explanations: At minimum compare admin_reachability_refused against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own admin_reachability_refused, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: admin_reachability_refused is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`
- Success metrics: Focused startup readiness proof should classify admin_reachability_refused as bounded startup support evidence, let recovery readiness proceed only through the startup owner contract, and the fresh rolling-restart representative should pass or expose a new named owner boundary.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason admin_reachability_refused`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: State the experiment hypothesis before implementation.
- Hypothesis discriminator: Predict the different observable under H1 vs H2 vs H3 before implementation.
- Expected metric: Name the count, frontier, route, or representative result expected to move.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Classification-Only Fast Path

- Runtime, test, script, and report paths stay out of `writeScope` and `commitScope` until fresh evidence promotes implementation.
- Keep possible implementation files in `candidateRuntimeFiles` only.
- Subagent sequencing is optional until implementation or tracker-truth write scope is promoted.
- Verifier-fixer proof is optional while the package remains classification-only and no implementation or tracker-truth write scope is present.
- Use 2-3 canonical proof commands, then close and rerun evidence instead of adding more package ceremony.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`
- Expected delta: Focused startup readiness proof should classify admin_reachability_refused as bounded startup support evidence, let recovery readiness proceed only through the startup owner contract, and the fresh rolling-restart representative should pass or expose a new named owner boundary.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `admin_reachability_refused`
- Route causal outcome: `migrate_owner_boundary`
- Stop mode: `owner_boundary_migration`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

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

1. src/bootstrap/startup-recovery-coordinator.js
2. src/bootstrap/node-joining-ready-signal-readiness.js
3. src/bootstrap/traffic-readiness-utils.js
4. test/bootstrap/startup-authority-consumption.test.js
5. test/bootstrap/node-joining-ready-signal-retry.test.js
6. test/bootstrap/traffic-readiness-utils.test.js
7. test/distributed/harness/startup-readiness-evidence.js
8. test/distributed/harness/cluster-segment-5.js
9. test/distributed/harness/cluster-segment-7-class-2.js
10. test/distributed/harness/cluster-segment-7-class-4.js
11. test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js
12. test/distributed/harness/__tests__/cluster.test-part-2.js
13. test/distributed/harness/__tests__/cluster-part-2-node-reachability-test-cases.js
14. test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js
15. test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js
16. test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/bootstrap/startup-recovery-coordinator.js`, `src/bootstrap/node-joining-ready-signal-readiness.js`, `src/bootstrap/traffic-readiness-utils.js`, `test/bootstrap/startup-authority-consumption.test.js`, `test/bootstrap/node-joining-ready-signal-retry.test.js`, `test/bootstrap/traffic-readiness-utils.test.js`, `test/distributed/harness/startup-readiness-evidence.js`, `test/distributed/harness/cluster-segment-5.js`, `test/distributed/harness/cluster-segment-7-class-2.js`, `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js`, `test/distributed/harness/__tests__/cluster.test-part-2.js`, `test/distributed/harness/__tests__/cluster-part-2-node-reachability-test-cases.js`, `test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js`, `test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js`, `test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`, `regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`, `supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`, `supporting: npm run audit:guideline:literals -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js`, `supporting: npm run audit:guideline:decision-boundaries -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js`, `supporting: npm run audit:runtime-grammar:file -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js`
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

- [x] action: implementation; owner: startup_readiness_owner; files-changed: test/distributed/harness/cluster-segment-5.js, work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-support.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: `npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js`, parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_readiness_owner; files-changed: work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-support.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json`, parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: 43ee0cec32e55a541b50a6755c598caf66cbcfa5
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js
2. regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
4. supporting: npm run audit:guideline:literals -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js
5. supporting: npm run audit:guideline:decision-boundaries -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js
6. supporting: npm run audit:runtime-grammar:file -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js
