# Startup Active Gate Snapshot Timeout Handoff Fixture

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The priority recovery workflow-progress edge is reduced: the fresh representative artifact reports zero priority recovery witnesses and marks priority_recovery_partition_progress satisfied. The current first frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage. The selected source is 11601fe0-72d6-5853-8590-ec2881853e72, snapshot coverage is 0/5, selectedSnapshotSourceCause is selected_snapshot_source_timeout, forcedRepairSnapshotCause is forced_repair_snapshot_timeout, activeGateSnapshotOwnerEdge is forced_repair_path_stall, and readiness support is inherited from active-gate no progress.",
  "nextAction": "Run required review/fix/implementation subagents, then build a replayable handoff/snapshot fixture that separates selected snapshot-source selection, forced repair path stalls, authoritative control snapshot nodes query pressure, and readiness support inherited from active-gate no progress. Do not touch publication ACK, timeout budgets, or active-gate admission unless canonical evidence selects them again.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-service-discovery.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md",
    "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
    "test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-service-discovery.test.js",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "runtime implementation is needed after the replay fixture"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Build the replayable handoff/snapshot fixture and prove which of the four named causes owns the edge."
  },
  "causalGovernance": {
    "hypothesis": "The current rolling-restart red edge is an active-gate snapshot coverage fixture edge rather than publication ACK or priority recovery. The selected snapshot source 11601fe0-72d6-5853-8590-ec2881853e72 times out on the direct snapshot lane, forced repair then times out while reading nodes through authoritative control snapshot repair, and readiness support inherits active-gate no progress.",
    "stopConditionCheck": "Run npm --silent run analyze:causal-model on fresh evidence, the handoff probe, focused admin snapshot tests, focused owner tests for any promoted runtime file, static guardrails, and one representative rolling-restart rerun after implementation.",
    "expectedCausalModelChange": "Focused proof should separate bad snapshot-source selection, forced repair path stalls, authoritative control snapshot query pressure, and readiness inherited from active-gate no progress, then either make rolling-restart green or reduce to a narrower active-gate snapshot subedge.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh evidence reports publication_ack_convergence satisfied and priority_recovery_partition_progress satisfied. The first frontier is active_gate_snapshot_coverage with selected_snapshot_source_timeout and forced_repair_snapshot_timeout; the selected source is 11601fe0-72d6-5853-8590-ec2881853e72.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery, timeout budgets, or active-gate admission unless fresh canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after priority workflow-progress reduction",
    "phaseChain": [
      "consume priority recovery workflow-progress migration proof",
      "classify active_gate_snapshot_coverage as the current first frontier",
      "run review, fix if required, and implementation subagents before runtime edits",
      "build a replayable handoff/snapshot fixture for selected source 11601fe0-72d6-5853-8590-ec2881853e72",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied",
      "priority_recovery_partition_progress is satisfied with zero residual witnesses",
      "selected source 11601fe0-72d6-5853-8590-ec2881853e72 times out on the snapshot lane after 100ms",
      "forced repair snapshot fails through authoritative control snapshot repair on nodes",
      "readiness support is inherited from active-gate no progress"
    ],
    "missingCausalEdge": "Separate the four possible causes: bad snapshot-source selection, forced repair path stalls, authoritative control snapshot query pressure, and readiness support inherited from active-gate no progress.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json --handoff-probe",
    "boundedProgressProof": "The predecessor drained priority recovery. This package must prove the active-gate snapshot timeout and forced repair reconcile subedge with a replayable fixture before runtime edits.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
    "expectedObservableTransition": "Focused proof should identify whether selected snapshot source timeout, forced repair timeout, authoritative control snapshot nodes query timeout, or inherited readiness support owns the edge.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier, preserve selected source 11601fe0-72d6-5853-8590-ec2881853e72 and split by the exact snapshot/repair/query/readiness subcause.",
    "expectedNextFrontier": "representative green, reduced active-gate snapshot timeout debt, or a narrower startup active-gate owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "This active-gate package is allowed because the immediately preceding priority package reduced priority recovery to zero witnesses and fresh canonical evidence selected active_gate_snapshot_coverage.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, and active-gate admission remain closed unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md"
}
-->

## Why

The priority recovery edge is reduced and the representative gate moved back to
active-gate snapshot coverage. This package owns the replayable
handoff/snapshot fixture for selected source
`11601fe0-72d6-5853-8590-ec2881853e72` and must split the selected snapshot
source timeout, forced repair timeout, authoritative control snapshot nodes
query timeout, and inherited readiness support.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative scenario remains red after
  priority recovery reduced, and canonical evidence moved the first frontier
  back to startup active-gate snapshot coverage.
- Escalation trigger to a heavier lane: implementation requires timeout
  increases, publication ACK rewrites, priority recovery rewrites, active-gate
  admission relaxation, or a broader architecture change outside the snapshot
  fixture boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review.
- [ ] Implementation subagent recorded: pending-before-implementation-resumes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. src/admin/admin-control-snapshot-class-part-2.js
5. src/admin/admin-control-snapshot-class-part-3.js
6. src/admin/admin-control-snapshot-class-part-5.js
7. src/admin/admin-control-snapshot-class-part-6.js
8. src/admin/admin-service-discovery-readiness-methods.js
9. src/admin/admin-service-discovery-repair-methods.js
10. src/control-plane/control-plane-snapshot-owner.js
11. src/diagnostics/topology-convergence-graph.js
12. test/admin/admin-control-snapshot.test.js
13. test/admin/admin-service-discovery.test.js
14. work/model-ledger.jsonl

## Out Of Scope

1. publication-ack-convergence
2. priority-recovery-workflow-progress
3. representative-timeout-budget
4. active-gate-admission-relaxation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `src/admin/admin-service-discovery-readiness-methods.js`, `src/admin/admin-service-discovery-repair-methods.js`, `src/control-plane/control-plane-snapshot-owner.js`, `src/diagnostics/topology-convergence-graph.js`, `test/admin/admin-control-snapshot.test.js`, `test/admin/admin-service-discovery.test.js`, `work/model-ledger.jsonl`
- Forbidden files: `publication-ack-convergence`, `priority-recovery-workflow-progress`, `representative-timeout-budget`, `active-gate-admission-relaxation`
- Frozen decisions: publication ACK, priority recovery, timeout budgets, and active-gate admission stay closed unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, active-gate admission would be relaxed, or timeout budgets would be increased.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json --handoff-probe
3. npm test -- test/admin/admin-control-snapshot.test.js
4. npm test -- test/admin/admin-service-discovery.test.js
5. Focused owner tests for the promoted runtime file.
6. Static guardrails for touched runtime files.
7. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --verbose
