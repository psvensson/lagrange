# Startup Active Gate Selected Snapshot Source Timeout After Bounded Handoff Retry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The bounded handoff retry package drained the owner_reconcile_pending evidence, but the representative rolling-restart rerun is still red on active_gate_snapshot_coverage with snapshotCoverageNodeCount=0/5, selectedSnapshotSourceCause=selected_snapshot_source_timeout, selectedSnapshotNodeId=11601fe0-72d6-5853-8590-ec2881853e72, selectedSnapshotTimeoutMs=806, no active-gate handoff contract, publication ACK satisfied, and priority residual witnesses at zero.",
  "nextAction": "Build the replayable selected-snapshot-source timeout fixture/probe for source 11601fe0-72d6-5853-8590-ec2881853e72, then reduce the timeout edge, improve snapshot coverage, migrate to a genuinely new owner boundary, or turn representative rolling-restart green.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "git diff --check"
  ],
  "writeScope": [
    "work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
    "artifact": "test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Build a replayable selected_snapshot_source_timeout fixture/probe for node 11601fe0-72d6-5853-8590-ec2881853e72."
  },
  "causalGovernance": {
    "hypothesis": "The prior handoff retry package drained owner_reconcile_pending. The current first frontier is now selected_snapshot_source_timeout before any active-gate handoff evidence forms, so this package must first make that selected source timeout replayable and then reduce or migrate it.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence explain/handoff/replay probes, npm run analyze:causal-model, priority residual extraction, distributed-failure summary, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Reduce selected_snapshot_source_timeout, improve snapshot coverage above 0/5, migrate to a new owner boundary, or turn representative rolling-restart green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK is satisfied or not required, priority residual extraction reports zero witnesses, and active-gate handoff is absent in the latest artifact. Timeout budgets, active-gate admission, publication truth, and readiness support remain frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "Do not reopen topology_publication_owner / publication_convergence, operation_workflow_owner / workflow_progress, timeout budgets, active-gate admission, or readiness support inside this package unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after bounded handoff retry",
    "phaseChain": [
      "consume the reduced bounded handoff retry proof",
      "use canonical extractors on the latest representative artifact",
      "run review, fix if required, and implementation subagents before runtime edits",
      "promote exact runtime files only after the selected snapshot source timeout fixture/probe identifies them",
      "rerun focused startup active-gate tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with selected_snapshot_source_timeout for node 11601fe0-72d6-5853-8590-ec2881853e72 and snapshotCoverageNodeCount=0/5.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence producer is not the selected blocker; pendingAckCount=0 and missingPublishedCount=0",
      "priority_recovery_partition_progress extraction reports zero residual witnesses",
      "publicationActiveGateHandoff is not detected in the representative artifact",
      "publicationActiveGateHandoffPendingReconcileCount is 0",
      "snapshotCoverageNodeCount is 0 of expectedNodeCount 5",
      "selectedSnapshotError is Admin API query timed out for node 11601fe0-72d6-5853-8590-ec2881853e72 on lane snapshot after 806ms",
      "selectedSnapshotSourceCause is selected_snapshot_source_timeout",
      "activeGateSnapshotOwnerEdge is selected_snapshot_source_selection",
      "readinessDelayCause is snapshot_timeout"
    ],
    "missingCausalEdge": "The selected snapshot source timeout prevents coverage before handoff evidence can form.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Pending before focused selected-source timeout implementation; first build replayable evidence for node 11601fe0-72d6-5853-8590-ec2881853e72.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json",
    "expectedObservableTransition": "Focused proof should reduce selected_snapshot_source_timeout, improve snapshot coverage above 0/5, migrate to a new owner boundary, or turn rolling-restart green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage selected-source timeout slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains at active_gate_snapshot_coverage with the same selected snapshot timeout and no coverage movement, stop as same-frontier instead of widening into frozen publication, priority, timeout-budget, admission, or readiness edges.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage unless selected source timeout reduces and canonical evidence selects a new owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "Allowed because the predecessor changed the selected subcause from owner_reconcile_pending with pendingReconcileCount=5 to selected_snapshot_source_timeout with no detected handoff.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, publication truth, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md"
}
-->

## Why

The bounded handoff retry package drained the prior `owner_reconcile_pending`
evidence. The representative gate is still red, but the selected active-gate
subcause is now a source timeout:

```text
active_gate_snapshot_coverage
snapshotCoverageNodeCount=0/5
selectedSnapshotSourceCause=selected_snapshot_source_timeout
selectedSnapshotNodeId=11601fe0-72d6-5853-8590-ec2881853e72
selectedSnapshotTimeoutMs=806
```

This package owns the next startup active-gate slice because the selected
snapshot source times out before handoff evidence can form.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  canonical evidence selects a runtime owner boundary.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run review, fix if needed, and implementation
subagents before editing runtime files.

## Subagent Sequencing Ledger

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

- [ ] Review subagent recorded: pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review-result.
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

1. work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md
2. work/packages/done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md
3. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. work/model-ledger.jsonl

## Out Of Scope

1. topology_publication_owner
2. operation_workflow_owner
3. timeout_budgets
4. active_gate_admission
5. readiness_support

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md`, `work/packages/done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `topology_publication_owner`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`, `readiness_support`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `git diff --check`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --explain active_gate_snapshot_coverage
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --handoff-probe
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json --replay-fixture
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json
6. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json
7. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-bounded-handoff-retry-20260517T112600Z.report.json
8. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
9. git diff --check

## Causal Edge Table

| Edge | Current evidence | Package stance |
| --- | --- | --- |
| Producer publication durable truth | pending ACK and missing published counts are zero in canonical probes | Frozen unless fresh evidence selects publication |
| Active-gate observation | selected source timeout on node `11601fe0-72d6-5853-8590-ec2881853e72`; coverage `0/5` | In scope |
| Workflow progress | priority residual extraction reports zero witnesses | Frozen unless fresh evidence selects workflow progress |

