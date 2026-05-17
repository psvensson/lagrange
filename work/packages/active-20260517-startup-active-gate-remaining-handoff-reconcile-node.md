# Startup Active Gate Remaining Handoff Reconcile Node

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused remaining-node projection proof is implemented. The representative rerun remains red on active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage, but snapshot coverage improved from 2/5 to 3/5. Publication ACK is still satisfied with pendingAckCount=0, priority residual extraction reports zero witnesses, and the active-gate handoff remains pending owner_reconcile_pending with reconcile_owner_membership_publication, runtimePromotionAllowed=false, pendingReconcileCount=2, and pending nodes 11601fe0-72d6-5853-8590-ec2881853e72 and 35a891b8-c1a0-5064-9c6e-2acfba61c2a7.",
  "nextAction": "Keep this package active as reduced evidence for the same owner, boundary, and required action. Continue only on the remaining startup_active_gate_owner / snapshot_coverage reconcile_owner_membership_publication edge for nodes 11601fe0-72d6-5853-8590-ec2881853e72 and 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, or stop if canonical evidence migrates or turns representative rolling-restart green.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage",
    "npx tap test/distributed/harness/__tests__/cluster.test-part-5.js",
    "node --check test/distributed/harness/cluster-segment-7-class-4.js",
    "node --check test/distributed/harness/__tests__/cluster.test-part-5.js",
    "node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json",
    "git diff --check"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "work/packages/active-20260517-startup-active-gate-remaining-handoff-reconcile-node.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "work/packages/active-20260517-startup-active-gate-remaining-handoff-reconcile-node.md",
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
      "runtime ownership changes",
      "representative scenario evidence changes",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reduced: snapshot coverage improved from 2/5 to 3/5 while publication ACK and priority recovery stayed satisfied. Continue on the same startup_active_gate_owner / snapshot_coverage reconcile_owner_membership_publication edge unless canonical evidence migrates or turns green."
  },
  "causalGovernance": {
    "hypothesis": "The predecessor projection reduced pendingReconcileCount from 3 to 1. The remaining local edge is the single unpublished active-gate owner cohort node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7; closing or migrating that reconcile edge should either move pendingReconcileCount to 0, improve snapshot coverage, or expose a new canonical owner boundary.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff and replay probes, npm run analyze:causal-model, priority residual extraction, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Achieved reduced evidence: snapshot coverage improved from 2/5 to 3/5. Representative rolling-restart remains red at startup_active_gate_owner / snapshot_coverage with reconcile_owner_membership_publication still required.",
    "representativeOutcome": "reduced",
    "causalDebt": "Publication ACK is satisfied with pendingAckCount=0, priority residual extraction has zero witnesses, readiness support remains inherited from active-gate no progress, and timeout budgets, active-gate admission, publication truth, selected-source timeout handling, terminal-progress selection, and readiness support stay frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "The predecessor package closed as reduced in commit 3c76cf0fb7d086b9fa48eb175b4192b82a082577 and closure proof commit 44beffa9. This successor must review that focused slice before implementation starts."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart startup publication lag projection",
    "phaseChain": [
      "consume predecessor reduced evidence and pushed closure proof",
      "refresh evidence-summary, handoff probe, replay fixture, causal model, priority residuals, and owner-files on the latest representative artifact",
      "run review and fix subagents before implementation starts",
      "run a fresh implementation subagent before runtime edits",
      "promote exact runtime or harness files only if focused proof selects them",
      "rerun focused active-gate tests and one representative rolling-restart run with a real timestamp or unique run id"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with snapshotCoverageNodeCount=3/5, expectedNodeCount=5, selectedSnapshotObservationMode=repair_deferred, publicationActiveGateHandoffState=pending, requiredAction=reconcile_owner_membership_publication, runtimePromotionAllowed=false, and publicationActiveGateHandoffPendingReconcileCount=2.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence producer is satisfied with pendingAckCount=0",
      "priority_recovery_partition_progress extraction reports zero residual witnesses",
      "publicationActiveGateHandoffState is pending",
      "publicationActiveGateHandoffReasonCode is owner_reconcile_pending",
      "publicationActiveGateHandoffNextAction is reconcile_owner_membership_publication",
      "publicationActiveGateHandoffRuntimePromotionAllowed is false",
      "publicationActiveGateHandoffPendingReconcileCount is 2",
      "pending reconcile nodes are 11601fe0-72d6-5853-8590-ec2881853e72 and 35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
      "activeGateOwnerCohortMissingPublishedCount is 2",
      "snapshotCoverageNodeCount is 3 of expectedNodeCount 5",
      "selectedSnapshotObservationMode is repair_deferred",
      "selectedSnapshotObservationNextAction is retry",
      "selectedSnapshotObservationRetryAfterMs is 1000",
      "selectedSnapshotObservationReasonCodes are cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readinessDelayCause is none"
    ],
    "missingCausalEdge": "The pending active-gate handoff reconcile contract still needs owner membership publication progress for the remaining pending reconcile nodes before another representative run can prove closure or migration.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --handoff-probe",
    "boundedProgressProof": "This package's focused single-node reconcile projection improved representative snapshot coverage from 2/5 to 3/5 while keeping publication ACK and priority residuals frozen.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json",
    "expectedObservableTransition": "Achieved reduced evidence: snapshot coverage improved beyond 2/5 to 3/5; rolling-restart remains red at startup_active_gate_owner / snapshot_coverage.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage reconcile_owner_membership_publication slice for the remaining-node projection",
    "sameFrontierFallback": "If the successor remains at active_gate_snapshot_coverage with the same owner and required action after focused proof, stop as same-frontier or split a narrower edge instead of widening into frozen publication, priority, timeout-budget, admission, selected-source timeout, terminal-progress, or readiness edges. If evidence only reduces the same owner-boundary-action count, continue in this package instead of opening another successor.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage on the pending reconcile nodes 11601fe0-72d6-5853-8590-ec2881853e72 and 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 unless canonical evidence selects a new owner boundary",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "Allowed because this successor is the remaining single-node contraction of the same owner-boundary reconcile edge, not a widened or alternate owner-boundary package. Further same-owner same-action reductions must update this package edge card instead of creating package churn.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, publication truth, selected-source timeout handling, terminal-progress selection, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md"
}
-->

## Why

The predecessor proved a bounded startup active-gate projection and reduced the
publication active-gate handoff reconcile count from `3` to `1`. This package
implemented the single pending-node projection fast path and improved the latest
representative snapshot coverage from `2/5` to `3/5`. The latest evidence
remains red on the same owner boundary and required action.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json
First frontier: active_gate_snapshot_coverage
Owner: startup_active_gate_owner
Boundary: snapshot_coverage
Selected cause: active_gate_timed_out with owner_reconcile_pending through pending publication active-gate handoff
Required action: reconcile_owner_membership_publication
Runtime promotion allowed: false
Pending reconcile count: 2
Pending reconcile nodes: 11601fe0-72d6-5853-8590-ec2881853e72, 35a891b8-c1a0-5064-9c6e-2acfba61c2a7
Current coverage: 3/5
Frozen upstream proof: publication ACK pendingAckCount=0; priority residual witnessCount=0
Goal: continue only on the same owner-boundary reconcile edge, migrate, or representative green
Allowed edits: exact runtime or harness files promoted by focused remaining-node proof after review/fix/implementation subagent proof; implemented in test/distributed/harness/cluster-segment-7-class-4.js and test/distributed/harness/__tests__/cluster.test-part-5.js
Required latest proof: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --handoff-probe
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Same-Owner Reduction Continuation

If this package reduces the remaining node but the owner, boundary, and required
action stay the same, update this package instead of opening another successor.
Split only when canonical evidence changes owner, boundary, required action, or
the stop state.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  canonical evidence selects a runtime owner boundary.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or
  representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run the review/fix/implementation sequence before
runtime or test implementation edits.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Gauss (019e362c-4914-7c21-be9a-7cbe94034472) reviewed work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Mill (019e3630-9ec4-7a20-848e-d7ff35e11a6d) implemented work/packages/active-20260517-startup-active-gate-remaining-handoff-reconcile-node.md.

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

## LLM Trap List

1. Do not open another successor for count-only reduction on the same owner,
   boundary, and required action.
2. Do not reopen publication ACK; it is satisfied with `pendingAckCount=0`.
3. Do not promote workflow progress; priority residual extraction reports zero
   witnesses.
4. Do not widen timeout budgets, active-gate admission, readiness support, or
   publication truth to hide the remaining owner-reconcile node.
5. Do not write new representative artifacts with placeholder timestamps such
   as `T000000Z`; use a real timestamp or unique run id.

## In Scope

1. test/distributed/harness/cluster-segment-7-class-4.js
2. test/distributed/harness/__tests__/cluster.test-part-5.js
3. work/packages/active-20260517-startup-active-gate-remaining-handoff-reconcile-node.md
4. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
5. work/sprints/current-blocker.md
6. work/sprints/current-blocker.json
7. work/model-ledger.jsonl

The focused implementation proof promoted the two candidate runtime/test files
listed in metadata.

## Out Of Scope

1. topology_publication_owner
2. operation_workflow_owner
3. timeout_budgets
4. active_gate_admission
5. publication_truth
6. selected-source timeout handling
7. terminal-progress selection
8. readiness_support

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`, `work/packages/active-20260517-startup-active-gate-remaining-handoff-reconcile-node.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `topology_publication_owner`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`, `publication_truth`, `selected-source timeout handling`, `terminal-progress selection`, `readiness_support`
- Frozen decisions: publication ACK, priority recovery, timeout budgets,
  active-gate admission, publication truth, selected-source timeout handling,
  terminal-progress selection, and readiness support stay frozen unless
  canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`, `npx tap test/distributed/harness/__tests__/cluster.test-part-5.js`, `node --check test/distributed/harness/cluster-segment-7-class-4.js`, `node --check test/distributed/harness/__tests__/cluster.test-part-5.js`, `node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json`, `git diff --check`
- Model ledger advisory: `escalate`

## Validation

1. PASS: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
2. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe`
3. PASS: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
4. PASS: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
5. PASS: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`
6. PASS: `node --check test/distributed/harness/cluster-segment-7-class-4.js`
7. PASS: `node --check test/distributed/harness/__tests__/cluster.test-part-5.js`
8. PASS: `npx tap test/distributed/harness/__tests__/cluster.test-part-5.js`
9. FAIL-REDUCED: `node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --fast-local --verbose` remained red but improved snapshot coverage from `2/5` to `3/5`.
10. PASS: `npm run work:evidence-summary -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json`
11. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --handoff-probe`
12. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json --replay-fixture`
13. PASS: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json`
14. PASS: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-remaining-handoff-reconcile-node-20260517T135205Z.report.json`
15. PASS: `npm run work:model-ledger -- record --package work/packages/active-20260517-startup-active-gate-remaining-handoff-reconcile-node.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason representative-coverage-3-of-5-same-owner-reconcile --outcome reduced --validation-status focused-tests-static-green-representative-reduced --correction-loops 1 --review-findings 0 --notes "..."`
16. PASS: `git diff --check`
