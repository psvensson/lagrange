# Startup Active Gate Pending Handoff Reconcile After Selected Timeout Reduction

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The selected-source timeout package reduced the representative edge from snapshotCoverageNodeCount=0/5 with selected_snapshot_source_timeout to active_gate_snapshot_coverage with snapshotCoverageNodeCount=4/5, selectedSnapshotObservationMode=repair_deferred, publicationActiveGateHandoffState=pending, publicationActiveGateHandoffReasonCode=owner_reconcile_pending, publicationActiveGateHandoffPendingReconcileCount=3, pending reconcile nodes 11601fe0-72d6-5853-8590-ec2881853e72, 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58; publication ACK is satisfied and priority residual witnesses remain at zero.",
  "nextAction": "Build the replayable pending handoff reconcile fixture/probe for the three pending reconcile nodes, then reduce the pending reconcile count, improve snapshot coverage from 4/5 to 5/5, migrate to a genuinely new owner boundary, or turn representative rolling-restart green.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "git diff --check"
  ],
  "writeScope": [
    "work/packages/active-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md",
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json",
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md",
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md",
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
    "artifact": "test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Build a replayable pending publication active-gate handoff reconcile fixture/probe for the three pending reconcile nodes."
  },
  "causalGovernance": {
    "hypothesis": "The selected-source timeout package restored clean terminal snapshot-coverage evidence, exposing the next same-owner handoff reconcile edge: a pending publication active-gate handoff contract with three owner_reconcile_pending nodes and repair-deferred snapshot observation.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence explain/handoff/replay probes, npm run analyze:causal-model, priority residual extraction, distributed-failure summary, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Reduce publicationActiveGateHandoffPendingReconcileCount from 3, improve snapshot coverage from 4/5 to 5/5, migrate to a new owner boundary, or turn representative rolling-restart green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK is satisfied, priority residual extraction reports zero witnesses, and the selected blocker is a startup active-gate snapshot coverage handoff reconcile edge. Timeout budgets, active-gate admission, publication truth, and readiness support remain frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "Do not reopen topology_publication_owner / publication_convergence, operation_workflow_owner / workflow_progress, timeout budgets, active-gate admission, publication truth, or readiness support inside this package unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after selected snapshot source timeout reduction",
    "phaseChain": [
      "consume the reduced selected-source timeout proof",
      "use canonical extractors on the latest representative artifact",
      "run review, fix if required, and implementation subagents before runtime edits",
      "promote exact runtime files only after the pending handoff reconcile fixture/probe identifies them",
      "rerun focused startup active-gate tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with snapshotCoverageNodeCount=4/5, selectedSnapshotObservationMode=repair_deferred, publicationActiveGateHandoffState=pending, and publicationActiveGateHandoffPendingReconcileCount=3.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence producer is satisfied with pendingAckCount=0",
      "priority_recovery_partition_progress extraction reports zero residual witnesses",
      "publicationActiveGateHandoffState is pending",
      "publicationActiveGateHandoffReasonCode is owner_reconcile_pending",
      "publicationActiveGateHandoffPendingReconcileCount is 3",
      "pending reconcile nodes are 11601fe0-72d6-5853-8590-ec2881853e72, 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58",
      "snapshotCoverageNodeCount is 4 of expectedNodeCount 5",
      "selectedSnapshotObservationMode is repair_deferred",
      "selectedSnapshotObservationNextAction is retry",
      "selectedSnapshotObservationRetryAfterMs is 1000",
      "selectedSnapshotObservationReasonCodes are cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readinessDelayCause is none"
    ],
    "missingCausalEdge": "The pending active-gate handoff reconcile contract needs replayable owner membership publication proof for the three pending reconcile nodes before another runtime fix.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --handoff-probe",
    "boundedProgressProof": "Pending before focused pending-handoff reconcile implementation; first build replayable evidence for the three pending reconcile nodes and the repair-deferred snapshot observation.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json",
    "expectedObservableTransition": "Focused proof should reduce pending reconcile count from 3, improve snapshot coverage above 4/5, migrate to a new owner boundary, or turn rolling-restart green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage pending handoff reconcile slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains at active_gate_snapshot_coverage with pendingReconcileCount=3 and coverage 4/5, stop as same-frontier instead of widening into frozen publication, priority, timeout-budget, admission, or readiness edges.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage unless pending handoff reconcile reduces and canonical evidence selects a new owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Allowed because the predecessor changed the selected subcause from selected_snapshot_source_timeout at coverage 0/5 to pending owner_reconcile with repair-deferred observation at coverage 4/5.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, publication truth, selected-source timeout handling, terminal-progress selection, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md"
}
-->

## Why

The selected-source timeout package restored usable terminal snapshot-coverage
evidence. The representative gate is still red, but the current blocker is now
a pending publication active-gate handoff reconcile contract:

```text
active_gate_snapshot_coverage
snapshotCoverageNodeCount=4/5
selectedSnapshotObservationMode=repair_deferred
publicationActiveGateHandoffState=pending
publicationActiveGateHandoffReasonCode=owner_reconcile_pending
publicationActiveGateHandoffPendingReconcileCount=3
```

This package owns the next startup active-gate slice because canonical
handoff-probe evidence selects `reconcile_owner_membership_publication` as the
required progress mechanism.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json
First frontier: active_gate_snapshot_coverage
Owner: startup_active_gate_owner
Boundary: snapshot_coverage
Selected cause: owner_reconcile_pending through pending publication active-gate handoff
Pending reconcile nodes: 11601fe0-72d6-5853-8590-ec2881853e72, 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, ebc4aa0b-06c6-506d-93ea-1dd2deca3f58
Allowed edits: pending handoff reconcile fixture/probe first; runtime edits only after exact files are promoted by that proof
Forbidden edits: topology_publication_owner, operation_workflow_owner, timeout_budgets, active_gate_admission, publication truth, readiness_support
Required first proof: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --handoff-probe
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

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

- [x] Review subagent recorded: Agent Bohr (019e35db-02f7-7f10-91a7-5b3c317a8a34) reviewed work/packages/active-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Linnaeus (019e35dd-553b-75e1-be1f-b2146c0f9d5b) fixed work/packages/active-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md.
- [ ] Implementation subagent recorded: pending-before-implementation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md
2. work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md
3. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. work/model-ledger.jsonl

Runtime files are candidate-only until the focused handoff reconcile proof
promotes exact edit targets.

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
- Owned files: `work/packages/active-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md`, `work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `topology_publication_owner`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`, `readiness_support`
- Frozen decisions: publication ACK, priority recovery, timeout budgets,
  active-gate admission, publication truth, selected-source timeout handling,
  terminal-progress selection, and readiness support stay frozen unless
  canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `git diff --check`
- Model ledger advisory: `escalate`

## Classification And Implementation Gates

Classification gate before runtime edits:

- [x] Canonical evidence selects `active_gate_snapshot_coverage` under
      `startup_active_gate_owner / snapshot_coverage`.
- [x] `--handoff-probe` detects a pending publication active-gate handoff
      contract with `pendingReconcileCount=3`.
- [x] Subordinate evidence is frozen: publication ACK is satisfied, priority
      residual extraction reports zero witnesses, and readiness support is
      inherited/deferred from the active-gate failure.
- [ ] Replayable pending handoff reconcile fixture/probe records the three
      pending reconcile nodes and repair-deferred snapshot observation.

Implementation gate before runtime edits:

- [ ] Exact runtime files are promoted by the fixture/probe, not by broad
      representative failure text alone.
- [ ] Focused startup active-gate tests or probe assertions are named before
      implementation.
- [ ] Runtime edits keep publication ACK, priority workflow progress, timeout
      budgets, active-gate admission, publication truth, selected-source
      timeout handling, terminal-progress selection, and readiness support
      frozen unless canonical evidence selects them again.

## LLM Trap List

1. Do not reopen publication ACK; canonical handoff-probe evidence reports the
   producer as satisfied with `pendingAckCount=0`.
2. Do not promote `operation_workflow_owner / workflow_progress`; priority
   residual extraction reports zero witnesses.
3. Do not widen timeout budgets or active-gate admission to mask the remaining
   active-gate timeout.
4. Do not patch readiness support while readiness remains downstream of
   active-gate snapshot coverage.
5. Do not start runtime edits until the pending handoff reconcile path is
   replayable or the package stops as evidence-incomplete.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --explain active_gate_snapshot_coverage
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --handoff-probe
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json --replay-fixture
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json
6. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json
7. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-selected-snapshot-source-timeout-fix-20260517T000000Z.report.json
8. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
9. git diff --check
