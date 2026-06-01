# Startup Active Gate Startup Publication Lag Snapshot Projection

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "owner_reconcile_pending",
  "currentState": "Focused harness projection now adds canonical published active membership to snapshot coverage only when the selected publication active-gate handoff is pending owner_reconcile_pending with reconcile_owner_membership_publication, runtimePromotionAllowed=false, and non-empty pending reconcile nodes. The focused regression failed before the fix at coverage 4/5 and now proves projected coverage 5/5 without relaxing the handoff. Representative rolling-restart is still red, but canonical handoff evidence reduced publicationActiveGateHandoffPendingReconcileCount from 3 to 1 while publication ACK and priority residuals remain satisfied.",
  "nextAction": "Close this package as reduced evidence. The successor should target the remaining startup_active_gate_owner / snapshot_coverage reconcile_owner_membership_publication node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, or stop if canonical evidence improves coverage, migrates, or turns rolling-restart green.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json --replay-fixture",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json",
    "npx tap test/distributed/harness/__tests__/cluster.test-part-5.js",
    "npx tap test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "node --check test/distributed/harness/cluster-segment-7-class-4.js",
    "node --check test/distributed/harness/__tests__/cluster.test-part-5.js",
    "node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --replay-fixture",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "npm run work:package:doctor -- --suggest work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md",
    "npm run work:model-ledger -- record --package work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md --outcome reduced --validation-status focused-tests-static-green-representative-reduced",
    "npm run work:validate -- --closure",
    "git diff --check"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json",
    "work/packages/done-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md"
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
    "work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md",
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
    "nextAction": "Reduced: publicationActiveGateHandoffPendingReconcileCount moved from 3 to 1 after the focused harness projection proof. Continue with the remaining node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 unless canonical evidence migrates or turns green."
  },
  "causalGovernance": {
    "hypothesis": "The replay fixture predecessor made the pending handoff reconcile edge explicit but did not reduce it. This package proved the startup snapshot projection must include canonical published active membership only under the pending active-gate owner-reconcile handoff; the representative rerun reduced pendingReconcileCount from 3 to 1.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff and replay probes, npm run analyze:causal-model, priority residual extraction, distributed-failure summary, and owner-files before runtime edits; then run required implementation subagent proof before changing promoted runtime files.",
    "expectedCausalModelChange": "Achieved reduced evidence: publicationActiveGateHandoffPendingReconcileCount fell below 3 to 1 in the representative rerun. Rolling-restart remains red at startup_active_gate_owner / snapshot_coverage.",
    "representativeOutcome": "reduced",
    "causalDebt": "Publication ACK is satisfied with pendingAckCount=0, priority residual extraction has zero witnesses, readiness support remains inherited from active-gate no progress, and timeout budgets, active-gate admission, publication truth, selected-source timeout handling, terminal-progress selection, and readiness support stay frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "Review proof is Agent Raman (019e35fe-3100-7b50-a924-2e3123f91594) with fixes-required on the predecessor; this fix subagent repaired tracker/package state only and left runtime implementation for the next required implementation subagent."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart pending handoff reconcile after selected timeout reduction",
    "phaseChain": [
      "consume the predecessor replay fixture and clean pushed commit 5888ab0c",
      "use evidence-summary, handoff probe, replay fixture, causal model, priority residual extraction, distributed failure summary, and owner-files on the latest representative artifact",
      "run review and fix subagents before implementation starts",
      "run a fresh implementation subagent before runtime edits",
      "promote exact runtime or harness files only after the focused reconcile proof selects them",
      "rerun focused active-gate tests and one representative rolling-restart run"
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
      "snapshotCoverageNodeCount is 2 of expectedNodeCount 5",
      "selectedSnapshotObservationMode is repair_deferred",
      "selectedSnapshotObservationNextAction is retry",
      "selectedSnapshotObservationRetryAfterMs is 1000",
      "selectedSnapshotObservationReasonCodes are cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readinessDelayCause is none"
    ],
    "missingCausalEdge": "The pending active-gate handoff reconcile contract still needs runtime owner membership publication progress for the remaining pending reconcile node before another representative run can prove closure or migration.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe",
    "boundedProgressProof": "The focused reconcile projection reduced publicationActiveGateHandoffPendingReconcileCount from 3 to 1 while keeping publication ACK and priority residuals frozen.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json",
    "expectedObservableTransition": "Achieved reduced evidence: pendingReconcileCount moved below 3 to 1; rolling-restart remains red at startup_active_gate_owner / snapshot_coverage.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage reconcile_owner_membership_publication slice",
    "sameFrontierFallback": "If the successor remains at active_gate_snapshot_coverage with pendingReconcileCount=1, stop as same-frontier or split a narrower edge instead of widening into frozen publication, priority, timeout-budget, admission, selected-source timeout, terminal-progress, or readiness edges.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage on the remaining node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 unless canonical evidence selects a new owner boundary",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-bounded-handoff-retry.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Allowed because the predecessor was fixture/probe-only and stopped same-frontier; this active package owns the bounded implementation of the same requiredAction rather than opening a new artifact-only boundary.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, publication truth, selected-source timeout handling, terminal-progress selection, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The predecessor package added the focused replay fixture for the three pending
publication active-gate handoff reconcile nodes, then stopped as same-frontier.
The latest canonical evidence still selects `active_gate_snapshot_coverage`
under `startup_active_gate_owner / snapshot_coverage`.

This package owned the next bounded active-gate implementation slice because the
handoff probe selected `reconcile_owner_membership_publication` with
`runtimePromotionAllowed=false` and `pendingReconcileCount=3`. The focused
projection proof reduced the representative pending reconcile count to `1`.

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
Allowed edits after implementation proof: exact files promoted by the focused reconcile proof
Forbidden edits: topology_publication_owner, operation_workflow_owner, timeout_budgets, active_gate_admission, publication truth, selected-source timeout, terminal-progress selection, readiness_support
Required latest proof: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

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
owner-boundary package. Review and fix proof are now recorded; implementation
proof remains required before runtime or test implementation edits.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Raman (019e35fe-3100-7b50-a924-2e3123f91594) reviewed work/packages/done-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Hubble (019e3602-359f-78e2-9119-6bff7fc7dbc0) fixed work/packages/done-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md.
- [x] Implementation subagent recorded: Agent Helmholtz (019e360a-e9bc-7e23-bfc7-184308e2834b) implemented work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md.

## Commit And Push Ledger

1. Focused package commit: 3c76cf0fb7d086b9fa48eb175b4192b82a082577
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Fix Subagent Tracker Repair

This fix pass repaired only package and tracker state:

1. Replaced scaffold metadata with concrete representative scenario, artifact,
   residual, causal governance, and scenario causal closure fields.
2. Replaced the stale projection next action with the handoff-probe required
   action: `reconcile_owner_membership_publication`.
3. Recorded the real review subagent result and this fix subagent entry while
   leaving implementation open.
4. Updated the sprint and current-blocker trackers to point at this active
   package and latest artifact.

No runtime or test implementation files were edited by this fix pass.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad
hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which
canonical extractor was tried and why it was insufficient.

## In Scope

1. test/distributed/harness/cluster-segment-7-class-4.js
2. test/distributed/harness/__tests__/cluster.test-part-5.js
3. work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md
4. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
5. work/sprints/current-blocker.md
6. work/sprints/current-blocker.json
7. work/model-ledger.jsonl

Runtime and test implementation files remain candidate implementation surfaces
until a fresh implementation subagent promotes exact edits from focused proof.

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
- Owned files: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`, `work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `topology_publication_owner`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`, `publication_truth`, `selected-source timeout handling`, `terminal-progress selection`, `readiness_support`
- Frozen decisions: publication ACK, priority recovery, timeout budgets,
  active-gate admission, publication truth, selected-source timeout handling,
  terminal-progress selection, and readiness support stay frozen unless
  canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json`, `npx tap test/distributed/harness/__tests__/cluster.test-part-5.js`, `npx tap test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `node --check test/distributed/harness/cluster-segment-7-class-4.js`, `node --check test/distributed/harness/__tests__/cluster.test-part-5.js`, `node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --fast-local --verbose`, `npm run work:validate -- --closure`, `git diff --check`
- Model ledger advisory: `escalate`

## Classification And Implementation Gates

Classification gate before runtime edits:

- [x] Canonical evidence selects `active_gate_snapshot_coverage` under
      `startup_active_gate_owner / snapshot_coverage`.
- [x] `--handoff-probe` detects a pending publication active-gate handoff
      contract with `requiredAction=reconcile_owner_membership_publication`.
- [x] `runtimePromotionAllowed=false` remains strict.
- [x] `pendingReconcileCount=3` and the three pending reconcile node ids are
      fixed by the predecessor replay fixture.
- [x] Subordinate evidence is frozen: publication ACK is satisfied, priority
      residual extraction reports zero witnesses, and readiness support is
      inherited/deferred from the active-gate failure.
- [x] Review and fix subagent proof is recorded.

Implementation gate before runtime edits:

- [x] Fresh implementation subagent proof is recorded.
- [x] Exact runtime or harness files are promoted by focused reconcile proof.
- [x] Runtime edits keep publication ACK, priority workflow progress, timeout
      budgets, active-gate admission, publication truth, selected-source
      timeout handling, terminal-progress selection, and readiness support
      frozen unless canonical evidence selects them again.

## Validation

1. PASS: `npm run work:evidence-summary -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json`
2. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json --handoff-probe`
3. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json --replay-fixture`
4. PASS: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-pending-handoff-reconcile-after-timeout-reduction-20260517T000000Z.report.json`
5. PASS: focused regression failed before the fix at projected coverage `4/5`, then passed after the harness projection fix.
6. PASS: `npx tap test/distributed/harness/__tests__/cluster.test-part-5.js`
7. PASS: `npx tap test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
8. PASS: `node --check test/distributed/harness/cluster-segment-7-class-4.js`
9. PASS: `node --check test/distributed/harness/__tests__/cluster.test-part-5.js`
10. REDUCED: `node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --fast-local --verbose` remains red, but reduced `publicationActiveGateHandoffPendingReconcileCount` from `3` to `1`.
11. PASS: `npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
12. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --handoff-probe`
13. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json --replay-fixture`
14. PASS: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
15. PASS: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
16. PASS: `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-startup-publication-lag-projection-20260517T000000Z.report.json`
17. PASS: `npm run work:model-ledger -- record --package work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason representative-reduced-pending-reconcile-count-1 --outcome reduced --validation-status focused-tests-static-green-representative-reduced --correction-loops 1 --review-findings 0 --notes "..."`
18. PASS: `npm run work:package:doctor -- --suggest work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md`
19. PASS: `npm run work:validate -- --closure`
20. PASS: `git diff --check`
