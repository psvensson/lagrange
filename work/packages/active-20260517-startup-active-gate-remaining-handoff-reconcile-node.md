# Startup Active Gate Remaining Handoff Reconcile Node

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "owner_reconcile_pending",
  "currentState": "Latest representative evidence still selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage. Publication ACK is satisfied with pendingAckCount=0, priority residual extraction reports zero witnesses, and the active-gate handoff is pending owner_reconcile_pending with reconcile_owner_membership_publication, runtimePromotionAllowed=false, pendingReconcileCount=1, and remaining node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7.",
  "nextAction": "Run the required review/fix/implementation subagent sequence before runtime edits. Target only the remaining reconcile_owner_membership_publication node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7; stop as reduced, migrated, same-frontier, or green based on canonical representative evidence. If proof only changes the pending count or node set under the same owner, boundary, and required action, update this package instead of opening another successor.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage",
    "git diff --check"
  ],
  "writeScope": [
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
    "artifact": "test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Continue on the remaining publication active-gate handoff reconcile node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 while keeping publication ACK and priority recovery frozen."
  },
  "causalGovernance": {
    "hypothesis": "The predecessor projection reduced pendingReconcileCount from 3 to 1. The remaining local edge is the single unpublished active-gate owner cohort node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7; closing or migrating that reconcile edge should either move pendingReconcileCount to 0, improve snapshot coverage, or expose a new canonical owner boundary.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff and replay probes, npm run analyze:causal-model, priority residual extraction, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Expected movement is pendingReconcileCount from 1 to 0, snapshot coverage above 2/5, representative green, or a canonical migration away from startup_active_gate_owner / snapshot_coverage.",
    "representativeOutcome": "pending-before-rerun",
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
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with snapshotCoverageNodeCount=2/5, expectedNodeCount=5, selectedSnapshotObservationMode=repair_deferred, publicationActiveGateHandoffState=pending, requiredAction=reconcile_owner_membership_publication, runtimePromotionAllowed=false, and publicationActiveGateHandoffPendingReconcileCount=1.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence producer is satisfied with pendingAckCount=0",
      "priority_recovery_partition_progress extraction reports zero residual witnesses",
      "publicationActiveGateHandoffState is pending",
      "publicationActiveGateHandoffReasonCode is owner_reconcile_pending",
      "publicationActiveGateHandoffNextAction is reconcile_owner_membership_publication",
      "publicationActiveGateHandoffRuntimePromotionAllowed is false",
      "publicationActiveGateHandoffPendingReconcileCount is 1",
      "pending reconcile node is 35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
      "activeGateOwnerCohortMissingPublishedCount is 1",
      "snapshotCoverageNodeCount is 2 of expectedNodeCount 5",
      "selectedSnapshotObservationMode is repair_deferred",
      "selectedSnapshotObservationNextAction is retry",
      "selectedSnapshotObservationRetryAfterMs is 1000",
      "selectedSnapshotObservationReasonCodes are cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readinessDelayCause is none"
    ],
    "missingCausalEdge": "The pending active-gate handoff reconcile contract still needs owner membership publication progress for the remaining node before another representative run can prove closure or migration.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe",
    "boundedProgressProof": "Predecessor reconcile projection reduced publicationActiveGateHandoffPendingReconcileCount from 3 to 1 while keeping publication ACK and priority residuals frozen.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "expectedObservableTransition": "pendingReconcileCount moves from 1 to 0, snapshot coverage improves beyond 2/5, representative rolling-restart turns green, or canonical evidence migrates to a different owner boundary.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage reconcile_owner_membership_publication slice for node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
    "sameFrontierFallback": "If the successor remains at active_gate_snapshot_coverage with pendingReconcileCount=1 after focused proof, stop as same-frontier or split a narrower edge instead of widening into frozen publication, priority, timeout-budget, admission, selected-source timeout, terminal-progress, or readiness edges. If evidence only reduces the same owner-boundary-action count, continue in this package instead of opening another successor.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage on the remaining node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 unless canonical evidence selects a new owner boundary",
    "resultClassification": "pending-before-probe",
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
publication active-gate handoff reconcile count from `3` to `1`. The latest
representative evidence remains red on the same owner boundary, with only node
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7` left in the pending reconcile set.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json
First frontier: active_gate_snapshot_coverage
Owner: startup_active_gate_owner
Boundary: snapshot_coverage
Selected cause: owner_reconcile_pending through pending publication active-gate handoff
Required action: reconcile_owner_membership_publication
Runtime promotion allowed: false
Pending reconcile count: 1
Pending reconcile node: 35a891b8-c1a0-5064-9c6e-2acfba61c2a7
Current coverage: 2/5
Frozen upstream proof: publication ACK pendingAckCount=0; priority residual witnessCount=0
Goal: pendingReconcileCount 1 -> 0, migrate, or representative green
Allowed edits: exact runtime or harness files promoted by focused remaining-node proof after review/fix/implementation subagent proof
Required first proof: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe
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

- [ ] Review subagent recorded: pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-implementation-resumes.
- [ ] Implementation subagent recorded: pending-before-implementation-resumes.

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

1. work/packages/active-20260517-startup-active-gate-remaining-handoff-reconcile-node.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

Candidate runtime files are listed in metadata but stay gated until focused
proof and the implementation subagent promote exact edits.

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
- Owned files: `work/packages/active-20260517-startup-active-gate-remaining-handoff-reconcile-node.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `topology_publication_owner`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`, `publication_truth`, `selected-source timeout handling`, `terminal-progress selection`, `readiness_support`
- Frozen decisions: publication ACK, priority recovery, timeout budgets,
  active-gate admission, publication truth, selected-source timeout handling,
  terminal-progress selection, and readiness support stay frozen unless
  canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`, `git diff --check`
- Model ledger advisory: `escalate`

## Validation

1. PASS: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
2. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe`
3. PASS: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
4. PASS: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
5. PASS: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`
6. PASS: `git diff --check`
