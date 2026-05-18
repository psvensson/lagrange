# Startup Readiness Snapshot Timeout After Fresh Evidence

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
  "playback": "none",
  "owner": "startup_readiness_owner",
  "boundary": "startup_support_evidence",
  "dominantReason": "snapshot_timeout",
  "currentState": "Fresh rolling-restart evidence after the active-gate classification-only closure is red. The runner stalled at active=0/5 and snapshotCoverage=0/5; publication_ack_convergence remains the visible first frontier with publication_pending, priority residual extraction reports zero witnesses, and the causal stop decision migrates to startup_readiness_owner / startup_support_evidence because selectedSnapshotError snapshot_timeout blocks startup readiness support.",
  "nextAction": "Run the required review subagent before implementation. Prove whether selectedSnapshotError snapshot_timeout is inherited active-gate support evidence, a startup readiness support bug, or a migration back to startup_active_gate_owner / snapshot_coverage.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --handoff-probe",
    "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence",
    "node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js"
  ],
  "writeScope": [
    "work/packages/active-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md",
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
    "work/packages/active-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md",
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
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "frontier": "readiness_startup_support",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "snapshot_timeout",
    "nextAction": "Run review/fix/implementation subagents, then prove whether selectedSnapshotError snapshot_timeout is inherited active-gate support evidence, a startup readiness support bug, or a migration back to startup_active_gate_owner / snapshot_coverage."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "release_gate_owner",
    "fromBoundary": "representative_evidence",
    "toOwner": "startup_readiness_owner",
    "toBoundary": "startup_support_evidence",
    "reason": "The evidence-only package ran the fresh representative. Canonical causal analysis reports outcome migrate_owner_boundary with stop reason startup_readiness_boundary; readiness_startup_support is retryable with selectedSnapshotError snapshot_timeout while priority residuals are zero.",
    "evidence": [
      "work/packages/done-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
      "npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If startup_readiness_owner / startup_support_evidence owns the migrated residual, selectedSnapshotError snapshot_timeout should reduce to bounded support evidence or explicitly migrate back to startup_active_gate_owner / snapshot_coverage instead of leaving publication_pending as an unqualified runtime target.",
    "stopConditionCheck": "Use npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json plus the active-gate topology explain before implementation and again after focused proof.",
    "expectedCausalModelChange": "The readiness_startup_support edge reduces to inherited active-gate no progress, converges, or names a fresh owner-boundary migration with concrete evidence.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication remains visible producer context, active-gate snapshot coverage is deferred at 0/5 with selected_snapshot_source_timeout, and priority residuals are zero. This package must not patch publication, operation workflow, active-gate runtime, or harness timeout budgets.",
    "crossBoundaryReview": "Required review subagent must inspect the fresh evidence package, startup readiness owner files, prior startup readiness packages, and active-gate explain output before any implementation edit."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "fresh rolling-restart representative after active-gate classification-only closure",
    "phaseChain": [
      "active-gate owner reconcile closed as classification-only",
      "fresh representative stalled at active=0/5 and snapshotCoverage=0/5",
      "publication_ack_convergence remains visible producer context",
      "priority residual extraction reports zero witnesses",
      "causal stop migrates to startup_readiness_owner / startup_support_evidence"
    ],
    "currentFirstFrontier": "startup_readiness_owner / startup_support_evidence is the causal owner-boundary migration target after fresh evidence; visible topology first frontier remains publication_ack_convergence / topology_publication_owner / publication_convergence with publication_pending, while readiness_startup_support carries selectedSnapshotError snapshot_timeout.",
    "knownDownstreamBlockers": [
      "runner stalled with active=0/5 and snapshotCoverage=0/5",
      "publicationStatus is UNKNOWN and missingPublishedCount is 5",
      "active_gate_snapshot_coverage is deferred with selected_snapshot_source_timeout",
      "selectedSnapshotNodeId is 11601fe0-72d6-5853-8590-ec2881853e72",
      "selectedSnapshotTimeoutMs is 3000",
      "readinessDelayCause is snapshot_timeout",
      "priority recovery residual witnesses are zero"
    ],
    "missingCausalEdge": "Determine whether selectedSnapshotError snapshot_timeout is inherited active-gate support evidence, a startup readiness support bug, or a migration back to startup_active_gate_owner / snapshot_coverage.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused diagnostics proof must classify the selectedSnapshotError snapshot_timeout as a bounded timeout support path before another broad representative rerun or runtime owner patch.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "expectedObservableTransition": "Readiness support evidence reduces to inherited active-gate no progress, representative green, or a concrete owner-boundary migration.",
    "maxProgressBound": "one focused startup_readiness_owner / startup_support_evidence proof slice",
    "sameFrontierFallback": "If the same startup readiness support edge remains, record the readiness support outcome and do not broaden into publication runtime, operation workflow runtime, active-gate runtime, or harness timeout increases.",
    "expectedNextFrontier": "startup_readiness_owner / startup_support_evidence unless focused proof migrates back to startup_active_gate_owner / snapshot_coverage",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md / release_gate_owner / representative_evidence / migrated",
      "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "work/packages/done-20260518-priority-recovery-operation-workflow-advance-after-handoff-probe.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This package is allowed because fresh evidence changed the active-gate reconcile shape to selectedSnapshotError snapshot_timeout and canonical causal analysis selected startup readiness support.",
    "handoffInvariant": "Publication, operation workflow, startup active-gate runtime, and harness timeout budgets remain frozen unless canonical evidence selects them again."
  }
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

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the fresh representative selected a named
  scenario owner boundary with focused diagnostics candidate files.
- Escalation trigger to a heavier lane: focused proof cannot classify the
  snapshot-timeout support edge, or fresh evidence promotes publication,
  operation workflow, active-gate runtime, or timeout-budget ownership.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven owner-boundary
package. Run review, fix if needed, and implementation subagents sequentially
before editing diagnostics or runtime files.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-implementation-starts.
- [ ] Fix subagent recorded or explicitly not needed: pending-review-result.
- [ ] Implementation subagent recorded: pending-review-and-fix-clean.

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
2. Keep the durable proof ladder to 3-5 commands by default: one representative/evidence command, one focused extractor or test, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.

## In Scope

1. work/packages/active-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md
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

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/diagnostics/topology-convergence-graph.js`, `src/diagnostics/failure-class-taxonomy.js`, `src/diagnostics/causal-graph-builder.js`, `test/diagnostics/topology-convergence-graph.test.js`, `test/diagnostics/failure-class-taxonomy.test.js`, `test/diagnostics/stop-condition-decision.test.js`, `test/diagnostics/causal-graph-builder.test.js`
- Forbidden files: `topology_publication_owner/runtime`, `operation_workflow_owner/runtime`, `startup_active_gate_owner/runtime`, `harness-timeout-increase`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --handoff-probe`, `npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json`, `npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence`, `node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --explain active_gate_snapshot_coverage
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --handoff-probe
4. npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json
5. npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence
6. node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js
