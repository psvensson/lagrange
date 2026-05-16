# Startup Active Gate Owner Cohort Recovery Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Publication ACK convergence is satisfied and priority recovery has zero residual witnesses in the latest rolling-restart artifact. The active first frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage: activeGateState=timed_out, snapshotCoverageNodeCount=2, expectedNodeCount=5, selected snapshot repair is deferred with cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight, handoff pendingReconcileCount=0, and activeGateOwnerCohort reports one missing published recovery target 11601fe0-72d6-5853-8590-ec2881853e72.",
  "nextAction": "Run required review/fix/implementation subagents, then explain and repair the one-node activeGateOwnerCohort pending recovery target while publication ACK convergence and priority recovery are satisfied. Do not relax active-gate admission, increase timeouts, or reopen publication ACK debt.",
  "proof": [
    "npm run work:context",
    "npm run work:package:doctor -- --suggest work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md",
    "npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run work:subagent-prompt -- --role review --package work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md",
    "npm run work:subagent-prompt -- --role fix --package work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md",
    "npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md"
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-topology-publication-count-only-ack-closure.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md",
    "work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md",
    "test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/active-gate-contract.js",
    "test/scripts/analyze-topology-convergence.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/admin/admin-control-snapshot.test.js"
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
      "startup active-gate admission would be relaxed"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Explain why activeGateOwnerCohort has one pending recovery target while handoff pendingReconcileCount is 0, then reduce, repair, split, or migrate that target with focused proof."
  },
  "causalGovernance": {
    "hypothesis": "The remaining red gate is caused by a startup active-gate owner cohort recovery gap: the consumer still needs reconcile progress for one missing published target even though the publication ACK producer and priority recovery are satisfied.",
    "stopConditionCheck": "Run npm run analyze:causal-model and the topology handoff probe on the latest artifact, then run required subagents before promoting exact runtime files.",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, reduces activeGateOwnerCohort pending recovery or snapshot coverage debt, keeps the same active-gate frontier with a narrower target, or migrates to a narrower owner boundary selected by canonical extractors.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Active-gate handoff has pendingReconcileCount=0 and nextAction=wait_owner_recovery, but activeGateOwnerCohort reports activeGateOwnerCohortMissingPublishedCount=1 and pending recovery node 11601fe0-72d6-5853-8590-ec2881853e72 while snapshot coverage is only 2/5.",
    "crossBoundaryReview": "Publication ACK convergence is closed and pushed as the predecessor. This package must not reopen publication ACK evidence unless canonical extractors promote it again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after publication ACK convergence migration",
    "phaseChain": [
      "consume publication ACK convergence migration proof",
      "classify active-gate snapshot coverage as the current first frontier",
      "run review, fix if required, and implementation subagents before runtime edits",
      "promote exact owner files only after subagent proof and focused probes",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied with pendingAckCount=0 and pendingAckNodeIds=[]",
      "priority recovery residual extraction reports zero witnesses",
      "activeGateState=timed_out, activeNodeCount=4, expectedNodeCount=5, snapshotCoverageNodeCount=2",
      "selected snapshot observation is repair_deferred/deferred_refresh/deferred/deferred/retry with retryAfterMs=6989 and reason codes cache_stale_watermark, discovery_node_coverage_gap, stale_replica_operations_in_flight",
      "publicationActiveGateHandoffState=pending, reason owner_reconcile_pending, nextAction wait_owner_recovery, runtimePromotionAllowed=false, pendingReconcileCount=0",
      "activeGateOwnerCohortState=pending with missing/pending recovery node 11601fe0-72d6-5853-8590-ec2881853e72"
    ],
    "missingCausalEdge": "The owner cohort recovery state still needs one reconcile progress path even though the handoff target list is empty; the package must identify whether the gap is in active-gate observation, owner cohort derivation, publication readback, or a narrower runtime owner.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --handoff-probe",
    "boundedProgressProof": "The current handoff probe names reconcile as the required progress mechanism and identifies one concrete activeGateOwnerCohort recovery target.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json",
    "expectedObservableTransition": "The next representative rerun should make the one-node owner cohort recovery target publish/recover, improve snapshotCoverage, or classify a narrower owner boundary with canonical evidence.",
    "maxProgressBound": "one focused startup active-gate owner package slice after required subagent sequencing; no timeout increases, active-gate admission relaxation, or publication ACK rewrites.",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier, preserve the concrete target and split the active-gate owner cohort edge instead of reopening publication convergence.",
    "expectedNextFrontier": "representative green, reduced active-gate snapshot coverage debt, or a narrower startup active-gate owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-topology-publication-count-only-ack-closure.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "This package is allowed because the immediately preceding publication package satisfied publication_ack_convergence and migrated the first frontier to startup_active_gate_owner / snapshot_coverage.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication ACK debt remains closed unless canonical evidence selects it again."
  },
  "predecessor": "work/packages/done-20260516-topology-publication-count-only-ack-closure.md"
}
-->

## Why

The publication package moved the representative frontier out of ACK
convergence. The remaining release-gate blocker is now the active-gate owner
cohort: one node is still missing from published recovery and selected snapshot
coverage is `2/5`, while the handoff contract reports no pending reconcile
targets.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative scenario is red on a runtime
  owner boundary after a cross-owner migration.
- Escalation trigger to a heavier lane: canonical evidence promotes a different
  owner, or the fix requires timeout increases, admission relaxation, or
  reopening publication ACK convergence.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e311a-0f5b-73d1-bea5-6a61d5ea8d84) reviewed work/packages/done-20260516-topology-publication-count-only-ack-closure.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Codex (019e311e-9fd9-7643-86bf-7afe05f899f0) implemented work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc
`jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which
canonical extractor was tried and why it was insufficient.

## In Scope

1. Work package, sprint, track, current-blocker, and model ledger handoff files.
2. `src/control-plane/publication-active-gate-handoff-contract.js`
3. `test/admin/admin-control-snapshot.test.js`

## Out Of Scope

1. Representative timeout budget changes
2. Active-gate admission relaxation
3. Publication ACK convergence rewrites unless canonical evidence selects it
   again

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/tracks/topology-convergence.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `representative-timeout-budget`, `active-gate-admission-relaxation`
- Frozen decisions: active-gate admission remains strict while `runtimePromotionAllowed=false`.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, or startup active-gate admission would be relaxed.
- Focused proof: `npm run work:context`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, required subagent sequencing, focused owner tests, static guardrails, and representative rerun after implementation.
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:package:doctor -- --suggest work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md
3. npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-top-level-publication-projection-20260516.report.json --markdown
8. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
9. npm run work:subagent-prompt -- --role review --package work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md
10. npm run work:subagent-prompt -- --role fix --package work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md
11. npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md
12. npm test -- test/admin/admin-control-snapshot.test.js
13. npx eslint src/control-plane/publication-active-gate-handoff-contract.js test/admin/admin-control-snapshot.test.js --ignore-pattern 'test/.gitkeep'
14. node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js
15. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js
16. npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js
17. npm run work:validate -- --pre-impl work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md
18. npm run work:package:doctor -- --suggest work/packages/active-20260516-startup-active-gate-owner-cohort-recovery-closure.md
19. git diff --check -- package-owned files
20. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --verbose
21. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json
22. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --handoff-probe
23. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json
24. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --markdown

## Implementation Result

The active-gate handoff contract now treats explicit clean canonical priority
recovery evidence as closed owner-recovery debt. When priority recovery has no
unresolved classes, semantic states, or blocked partitions, readiness
`PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` no longer suppresses the publication
reconcile target. Unknown or unresolved priority recovery evidence still keeps
the existing `wait_owner_recovery` behavior.

Focused admin snapshot proof covers the live canonical
`priorityRecoveryCurrentSummary` shape so the runtime path does not rely on
diagnostics-only active-gate progress projection.

## Migration Result

- From: `startup_active_gate_owner / snapshot_coverage`
- To: `operation_workflow_owner / workflow_progress`
- Reason: representative rerun
  `test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json`
  reports publication `PUBLISHED`, `pendingAckCount=0`, `missingPublished=0`,
  published membership `5/5`, and snapshot coverage `5/5`. Canonical evidence
  marks `publication_ack_convergence` and `active_gate_snapshot_coverage`
  satisfied, then selects `priority_recovery_partition_progress` as the first
  frontier.
- Successor should start from the priority recovery residual extractor's first
  owner-boundary group:
  `operation_workflow_owner / workflow_progress` with dominant reason
  `priority_recovery_progress_blocked`.
