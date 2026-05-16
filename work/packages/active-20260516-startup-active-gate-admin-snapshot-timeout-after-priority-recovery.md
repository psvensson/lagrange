# Startup Active Gate Admin Snapshot Timeout After Priority Recovery

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The predecessor operation_workflow_owner / workflow_progress package drained the priority recovery residual: the latest representative artifact reports zero priority recovery witnesses and causal evidence marks priority_recovery_partition_progress satisfied. The current first frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage: activeGateState=timed_out, snapshotCoverageNodeCount=0, expectedNodeCount=5, selectedSnapshotError is an admin snapshot query timeout against node 11601fe0-72d6-5853-8590-ec2881853e72 with forced repair also timing out, and readiness reports one inactive node whose probe timed out.",
  "nextAction": "Run required review/fix/implementation subagents, then identify why selected admin snapshot capture times out after priority recovery drains; preserve strict active-gate admission, publication ACK closure, and the drained priority recovery edge.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
    "npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run work:subagent-prompt -- --role review --package work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
    "npm run work:subagent-prompt -- --role fix --package work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
    "npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md"
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md",
    "work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md",
    "test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-4.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-control-snapshot-class-part-7.js",
    "src/control-plane/startup-authority-snapshot-owner.js",
    "src/control-plane/authoritative-control-plane-view.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-control-snapshot-response-contract.test.js",
    "test/distributed/harness/active-gate-contract.js",
    "test/distributed/harness/active-gate-closure-classification.js",
    "scripts/analyze-topology-convergence.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
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
      "runtime ownership changes",
      "representative scenario evidence changes",
      "active-gate admission would be relaxed",
      "timeout budgets would be increased"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Identify why selected admin snapshot capture times out after priority recovery drains, then repair, reduce, split, or migrate the active-gate snapshot coverage frontier without timeout increases or admission relaxation."
  },
  "causalGovernance": {
    "hypothesis": "The remaining red gate is caused by startup active-gate snapshot coverage being unable to capture a usable authoritative snapshot under control-plane pressure after priority recovery has drained.",
    "stopConditionCheck": "Run npm run analyze:causal-model and npm run analyze:topology-convergence on the latest artifact, then run required subagents before promoting exact runtime files.",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, reduces active-gate snapshot timeout debt, keeps the same frontier with a narrower admin snapshot source or forced repair edge, or migrates to a narrower owner boundary selected by canonical extractors.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Canonical evidence selects active_gate_snapshot_coverage: activeGateState=timed_out, snapshotCoverageNodeCount=0/5, selected admin snapshot query timed out, forced repair snapshot failed with authoritative control snapshot repair timeout, publication ACK is not selected, and priority recovery residual extraction reports zero witnesses.",
    "crossBoundaryReview": "Publication ACK convergence and priority recovery workflow progress are closed unless canonical evidence selects them again. This package may reopen startup_active_gate_owner / snapshot_coverage because the latest artifact selected it after the priority residual drained."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after workflow-progress pending coordination gate",
    "phaseChain": [
      "consume priority recovery workflow-progress migration proof",
      "classify active_gate_snapshot_coverage as the current first frontier",
      "run review, fix if required, and implementation subagents before runtime edits",
      "promote exact owner files only after subagent proof and focused probes",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is not selected and pendingAckCount=0",
      "priority recovery residual extraction reports zero witnesses",
      "activeGateState=timed_out, activeNodeCount=4, expectedNodeCount=5, snapshotCoverageNodeCount=0",
      "selectedSnapshotError is an admin snapshot query timeout against 11601fe0-72d6-5853-8590-ec2881853e72 followed by forced repair snapshot timeout",
      "readiness failure is inherited from active-gate no progress and reports snapshot_timeout"
    ],
    "missingCausalEdge": "The active-gate snapshot coverage owner cannot obtain a timely authoritative admin snapshot after the priority recovery edge drains; this package must identify whether the gap is snapshot-source selection, forced repair, authoritative control snapshot query pressure, or a narrower startup readiness support edge.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --handoff-probe",
    "boundedProgressProof": "Canonical evidence names active_gate_snapshot_coverage as the first frontier and records selectedSnapshotError plus forced repair timeout as the concrete snapshot coverage blocker while priority recovery has zero residual witnesses.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json",
    "expectedObservableTransition": "The next representative rerun should obtain snapshot coverage, expose a narrower admin snapshot or forced repair owner edge, migrate to startup readiness support after coverage improves, or go green.",
    "maxProgressBound": "one focused startup active-gate owner package slice after required subagent sequencing; no timeout increases, active-gate admission relaxation, publication ACK rewrites, or priority recovery rewrites.",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier, preserve the selected snapshot timeout evidence and split by canonical snapshot-source, forced-repair, or readiness-support edge instead of widening scope.",
    "expectedNextFrontier": "representative green, reduced active-gate snapshot timeout debt, or a narrower startup active-gate owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-topology-publication-count-only-ack-closure.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "This package is allowed because the immediately preceding package drained priority recovery to zero witnesses and canonical evidence selected active_gate_snapshot_coverage again with a different selected admin snapshot timeout shape.",
    "handoffInvariant": "Publication ACK convergence and priority recovery workflow progress stay closed unless canonical evidence selects them again; this package owns startup active-gate snapshot coverage only."
  },
  "predecessor": "work/packages/done-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md"
}
-->

## Why

The predecessor drained the priority recovery workflow-progress residual, but
the representative rolling-restart gate is still red. Canonical evidence now
selects active-gate snapshot coverage: the selected admin snapshot query and
forced repair both time out, so the active gate cannot observe coverage after
priority recovery is satisfied.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative scenario remains red after a
  related owner-boundary migration, and the frontier returned to active-gate
  snapshot coverage with a new selected admin snapshot timeout shape.
- Escalation trigger to a heavier lane: implementation requires timeout
  increases, active-gate admission relaxation, publication ACK rewrites,
  priority recovery rewrites, or a broader architecture change outside this
  snapshot-coverage boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded:
- [ ] Fix subagent recorded or explicitly not needed:
- [ ] Implementation subagent recorded:

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/tracks/topology-convergence.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. work/model-ledger.jsonl

## Out Of Scope

1. representative-timeout-budget
2. active-gate-admission-relaxation
3. publication-ack-convergence-rewrite

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/tracks/topology-convergence.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `representative-timeout-budget`, `active-gate-admission-relaxation`, `publication-ack-convergence-rewrite`
- Frozen decisions: publication ACK convergence and priority recovery workflow progress remain closed unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, active-gate admission would be relaxed, or timeout budgets would be increased.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md`, `npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `npm run work:subagent-prompt -- --role review --package work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md`, `npm run work:subagent-prompt -- --role fix --package work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md`, `npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md
4. npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md
5. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json
6. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json
7. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --handoff-probe
8. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json
9. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --markdown
10. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
11. npm run work:subagent-prompt -- --role review --package work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md
12. npm run work:subagent-prompt -- --role fix --package work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md
13. npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md
