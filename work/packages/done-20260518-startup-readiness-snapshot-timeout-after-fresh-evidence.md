# Startup Readiness Snapshot Timeout After Fresh Evidence

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-18",
  "lane": "diagnostic-classification",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
  "playback": "none",
  "owner": "startup_readiness_owner",
  "boundary": "startup_support_evidence",
  "dominantReason": "snapshot_timeout",
  "currentState": "Focused diagnostics now classify recoverable selectedSnapshotError snapshot_timeout as inherited active-gate support evidence whenever the active gate is stalled or timed_out. On the fresh artifact, readiness_startup_support is deferred with readiness_inherited_active_gate_no_progress, startup_readiness_blocked drops out of the failure taxonomy, and scenario-route now reports publication_ack_convergence under topology_publication_owner / publication_convergence as the local blocker.",
  "nextAction": "Closed as migrated to work/packages/active-20260518-topology-publication-convergence-after-startup-readiness-classification.md. Continue there after required subagent sequencing; do not patch publication runtime inside this diagnostic package.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason snapshot_timeout --explain active_gate_snapshot_coverage --test test/diagnostics/topology-convergence-graph.test.js --test test/diagnostics/failure-class-taxonomy.test.js --test test/diagnostics/stop-condition-decision.test.js --test test/diagnostics/causal-graph-builder.test.js --markdown",
    "node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js",
    "npm run work:advance -- --check"
  ],
  "writeScope": [
    "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/failure-class-taxonomy.js",
    "src/diagnostics/causal-graph-builder.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/diagnostics/failure-class-taxonomy.test.js",
    "test/diagnostics/stop-condition-decision.test.js",
    "test/diagnostics/causal-graph-builder.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md",
    "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md",
    "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/failure-class-taxonomy.js",
    "src/diagnostics/causal-graph-builder.js"
  ],
  "commitScope": [
    "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/diagnostics/topology-convergence-graph.js",
    "src/diagnostics/failure-class-taxonomy.js",
    "src/diagnostics/causal-graph-builder.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/diagnostics/failure-class-taxonomy.test.js",
    "test/diagnostics/stop-condition-decision.test.js",
    "test/diagnostics/causal-graph-builder.test.js"
  ],
  "modelFit": {
    "packageClass": "diagnostic-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostic-owner-evidence/current-artifact",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Continue in the topology publication successor selected after the startup readiness support edge reduced to inherited active-gate evidence."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_readiness_owner",
    "fromBoundary": "startup_support_evidence",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Focused diagnostics classify selectedSnapshotError snapshot_timeout as inherited active-gate support evidence for stalled or timed-out active gates. The fresh artifact no longer carries startup_readiness_blocked in the failure taxonomy; scenario-route reports classified_local_blocker on publication_ack_convergence under topology_publication_owner / publication_convergence.",
    "evidence": [
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason snapshot_timeout --explain active_gate_snapshot_coverage --test test/diagnostics/topology-convergence-graph.test.js --test test/diagnostics/failure-class-taxonomy.test.js --test test/diagnostics/stop-condition-decision.test.js --test test/diagnostics/causal-graph-builder.test.js --markdown",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
      "node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If startup_readiness_owner / startup_support_evidence owns the migrated residual, selectedSnapshotError snapshot_timeout should reduce to bounded support evidence or explicitly migrate back to startup_active_gate_owner / snapshot_coverage instead of leaving publication_pending as an unqualified runtime target.",
    "stopConditionCheck": "Use npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason snapshot_timeout --explain active_gate_snapshot_coverage --markdown plus npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json before implementation and again after focused proof if diagnostics changed.",
    "expectedCausalModelChange": "Observed: readiness_startup_support reduced to inherited active-gate no progress and startup_readiness_blocked dropped out; scenario-route selected publication_ack_convergence as the remaining local blocker.",
    "representativeOutcome": "migrated",
    "causalDebt": "Publication is now the selected successor context. Active-gate snapshot coverage remains deferred at 0/5 with selected_snapshot_source_timeout, priority residuals are zero, and this package did not patch publication, operation workflow, active-gate runtime, readiness runtime, or harness timeout budgets.",
    "crossBoundaryReview": "Diagnostic-classification lane kept review/fix/implementation subagents optional because this package edited only diagnostics, diagnostic tests, and work-tracker files. The successor is a causal-escalation package and must run required subagent sequencing before implementation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "fresh rolling-restart representative after active-gate classification-only closure",
    "phaseChain": [
      "active-gate owner reconcile closed as classification-only",
      "fresh representative stalled at active=0/5 and snapshotCoverage=0/5",
      "publication_ack_convergence remains visible producer context",
      "priority residual extraction reports zero witnesses",
      "focused diagnostics classify selectedSnapshotError snapshot_timeout as inherited active-gate support evidence",
      "causal route selects topology_publication_owner / publication_convergence as the local blocker"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence is the selected successor after readiness_startup_support reduced to inherited active-gate support evidence.",
    "knownDownstreamBlockers": [
      "runner stalled with active=0/5 and snapshotCoverage=0/5",
      "publicationStatus is UNKNOWN and missingPublishedCount is 5",
      "active_gate_snapshot_coverage is deferred with selected_snapshot_source_timeout",
      "selectedSnapshotNodeId is 11601fe0-72d6-5853-8590-ec2881853e72",
      "selectedSnapshotTimeoutMs is 3000",
      "readinessDelayCause is snapshot_timeout",
      "priority recovery residual witnesses are zero"
    ],
    "missingCausalEdge": "Resolved for this package: selectedSnapshotError snapshot_timeout is inherited active-gate support evidence, not a startup readiness support bug.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused diagnostics now classify recoverable selectedSnapshotError snapshot_timeout from a stalled active gate as a bounded timeout support mechanism inherited from active-gate evidence; focused diagnostics tests pass and the fresh causal model removes startup_readiness_blocked.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "expectedObservableTransition": "Observed: readiness support evidence reduced to inherited active-gate no progress and the selected successor is topology_publication_owner / publication_convergence.",
    "maxProgressBound": "one focused startup_readiness_owner / startup_support_evidence proof slice",
    "sameFrontierFallback": "If the same startup readiness support edge remains, record the readiness support outcome and do not broaden into publication runtime, operation workflow runtime, active-gate runtime, or harness timeout increases.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md / release_gate_owner / representative_evidence / migrated",
      "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "work/packages/done-20260518-priority-recovery-operation-workflow-advance-after-handoff-probe.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This package is allowed because fresh evidence changed the active-gate reconcile shape to selectedSnapshotError snapshot_timeout and canonical causal analysis selected startup readiness support.",
    "handoffInvariant": "Operation workflow runtime, startup active-gate runtime, startup readiness runtime, and harness timeout budgets remain frozen unless canonical evidence selects them again. Publication runtime is owned only by the successor package."
  },
  "closed": "2026-05-18",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260518-topology-publication-convergence-after-startup-readiness-classification.md"
}
-->

## Why

Fresh representative evidence after the active-gate classification-only closure
is red at an earlier startup support point: the runner stalled at
`active=0/5` and `snapshotCoverage=0/5`, while the selected snapshot source
timed out on the admin snapshot lane.

This package owns only the migrated
`startup_readiness_owner / startup_support_evidence` boundary. It must classify
whether that snapshot timeout is inherited active-gate support evidence, a
startup readiness support bug, or a migration back to active-gate snapshot
coverage.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `diagnostic-classification`
- Why this lane is sufficient: the fresh representative selected a named
  scenario owner boundary, but the bounded work is diagnostics classification
  over diagnostics files and diagnostic tests only.
- Escalation trigger to a heavier lane: focused proof cannot classify the
  snapshot-timeout support edge, or fresh evidence promotes publication,
  operation workflow, active-gate runtime, or timeout-budget ownership.

## Subagent Sequencing Requirement

Not required for this diagnostic-classification package. Escalate back to
`scenario-release-gate` and run review/fix/implementation subagents if the
work expands into runtime owner behavior, shared runtime contracts, or scenario
behavior changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:scenario-route -- <artifact>` instead of separate
   evidence-summary, topology explain, handoff-probe, causal-model, residual,
   and owner-file commands.
2. Use `npm run work:advance -- --check` before adding more package prose; it
   combines doctor, subagent-next, and entry/pre-implementation validation.
3. Keep the durable proof ladder to 3 commands here: route, focused diagnostics
   tests, and `work:advance`.
4. Once an architecture gate has a selected route, do not open another gate
   unless fresh canonical evidence contradicts the selected route.

## In Scope

1. work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/diagnostics/topology-convergence-graph.js
7. src/diagnostics/failure-class-taxonomy.js
8. src/diagnostics/causal-graph-builder.js
9. test/diagnostics/topology-convergence-graph.test.js
10. test/diagnostics/failure-class-taxonomy.test.js
11. test/diagnostics/stop-condition-decision.test.js
12. test/diagnostics/causal-graph-builder.test.js

## Out Of Scope

1. topology_publication_owner/runtime
2. operation_workflow_owner/runtime
3. startup_active_gate_owner/runtime
4. harness-timeout-increase

## Model Fit

- Package class: `diagnostic-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostic-owner-evidence/current-artifact`
- Output profile: `medium`
- Owned files: `work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/diagnostics/topology-convergence-graph.js`, `src/diagnostics/failure-class-taxonomy.js`, `src/diagnostics/causal-graph-builder.js`, `test/diagnostics/topology-convergence-graph.test.js`, `test/diagnostics/failure-class-taxonomy.test.js`, `test/diagnostics/stop-condition-decision.test.js`, `test/diagnostics/causal-graph-builder.test.js`
- Forbidden files: `topology_publication_owner/runtime`, `operation_workflow_owner/runtime`, `startup_active_gate_owner/runtime`, `harness-timeout-increase`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason snapshot_timeout --explain active_gate_snapshot_coverage --test test/diagnostics/topology-convergence-graph.test.js --test test/diagnostics/failure-class-taxonomy.test.js --test test/diagnostics/stop-condition-decision.test.js --test test/diagnostics/causal-graph-builder.test.js --markdown`, `node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js`, `npm run work:advance -- --check`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason snapshot_timeout --explain active_gate_snapshot_coverage --test test/diagnostics/topology-convergence-graph.test.js --test test/diagnostics/failure-class-taxonomy.test.js --test test/diagnostics/stop-condition-decision.test.js --test test/diagnostics/causal-graph-builder.test.js --markdown
2. node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js
3. npm run work:advance -- --check
