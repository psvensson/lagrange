# Startup Active Gate Snapshot Coverage Deferred Refresh Discovery Gap

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused admin snapshot proof now refreshes after visible owner publication and the representative rerun no longer reports deferred_refresh discovery_node_coverage_gap. The red frontier stayed active_gate_snapshot_coverage but reduced to selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72 with snapshotCoverageNodeCount=0/5, selectedSnapshotTimeoutMs=3340, publication ACK satisfied, and priority recovery satisfied.",
  "nextAction": "Open the successor selected-snapshot-source timeout slice for source 11601fe0-72d6-5853-8590-ec2881853e72; keep publication ACK, priority recovery, timeout budgets, and active-gate admission frozen unless canonical evidence selects them again.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md",
    "test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json",
    "test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-5.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-5.js"
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
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reduce selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72."
  },
  "causalGovernance": {
    "hypothesis": "The package separated deferred_refresh discovery_node_coverage_gap by proving the visible owner publication path must refresh selected snapshot coverage. Fresh representative evidence no longer reports the deferred discovery gap and now selects snapshot-source timeout on 11601fe0-72d6-5853-8590-ec2881853e72.",
    "stopConditionCheck": "Run entry validation, handoff/snapshot probe, npm run analyze:causal-model on fresh evidence, focused admin snapshot tests, focused owner tests for promoted runtime files, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "Focused proof removed discovery_node_coverage_gap from the representative first frontier and selected the next canonical startup active-gate subcause.",
    "representativeOutcome": "reduced",
    "causalDebt": "Publication ACK and priority recovery remain satisfied by canonical extractors. Active-gate snapshot coverage is now 0/5 with selected_snapshot_source_timeout on source 11601fe0-72d6-5853-8590-ec2881853e72 and selectedSnapshotTimeoutMs=3340.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery, timeout budgets, or active-gate admission unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after owner-reconcile selected-evidence handoff fix",
    "phaseChain": [
      "consume same-frontier owner-reconcile handoff proof",
      "separate snapshot-source selection from forced repair stall",
      "separate authoritative control snapshot nodes query pressure",
      "confirm readiness support remains inherited from active-gate no progress",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "priority_recovery_partition_progress is satisfied with zero residual witnesses",
      "publication_ack_convergence is satisfied by canonical handoff probe",
      "active_gate_snapshot_coverage is blocked with snapshotCoverageNodeCount=0 and expectedNodeCount=5",
      "selected source is 11601fe0-72d6-5853-8590-ec2881853e72",
      "selected snapshot cause is selected_snapshot_source_timeout with selectedSnapshotTimeoutMs=3340",
      "publicationActiveGateHandoff is absent in the fresh representative because publication convergence is no longer the selected handoff blocker",
      "readiness support remains inherited_active_gate_no_progress with snapshot_timeout source evidence"
    ],
    "missingCausalEdge": "Reduce selected_snapshot_source_timeout after deferred_refresh discovery_node_coverage_gap disappeared.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The focused admin snapshot owner path now performs one bounded authoritative publication refresh after a published_visible owner handoff and uses the widened snapshot only when coverage improves. The representative rerun removed discovery_node_coverage_gap and selected snapshot-source timeout instead.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
    "expectedObservableTransition": "discovery_node_coverage_gap disappeared from canonical representative evidence and the next selected subcause is selected_snapshot_source_timeout.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "Open a same-frontier successor focused on selected_snapshot_source_timeout for source 11601fe0-72d6-5853-8590-ec2881853e72.",
    "expectedNextFrontier": "representative green, reduced selected_snapshot_source_timeout residual, readiness_startup_support, or another canonical frontier after snapshot coverage improves",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This same-frontier package is allowed because fresh representative evidence changed the active-gate subcause from stale_usable/wait to deferred_refresh/retry with discovery_node_coverage_gap.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md",
  "closed": "2026-05-16",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260516-startup-active-gate-selected-snapshot-source-timeout.md"
}
-->

## Why

Fresh representative evidence had stayed on `active_gate_snapshot_coverage` with
`deferred_refresh` / `discovery_node_coverage_gap` for source
`11601fe0-72d6-5853-8590-ec2881853e72`. This package separated that edge from
bad snapshot-source selection, forced repair stalls, authoritative control
snapshot query pressure, and inherited readiness support by proving the visible
owner publication handoff must perform one bounded refresh before returning a
repair-deferred local snapshot.

The focused fix was metric-moving: the representative rerun no longer reports
`discovery_node_coverage_gap`. The frontier remains red on
`active_gate_snapshot_coverage`, but it reduced to
`selected_snapshot_source_timeout` on the same source with snapshot coverage
`0/5`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart
topology workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative first frontier stayed on
  startup active-gate snapshot coverage, but the selected subcause changed and
  must be separated before another runtime change.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  listed candidate files, a frozen decision must be reopened, or
  representative evidence contradicts the selected owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Helmholtz (019e326a-5991-7433-b12e-a23f632b0fc3) reviewed work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Confucius (019e326e-8da1-7e40-aac7-44f265fa96d9) fixed work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md.
- [x] Implementation subagent recorded: Agent Meitner (019e3273-d04e-75b0-8447-cee9a6b70da4) implemented work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

Fallback note: the canonical replay fixture on
`test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json`
proved the handoff shape but emitted unknown selected-owner cause fields because
that older artifact had no selected snapshot error. Raw report inspection was
used only to confirm the selected source was reachable, readiness was not the
selected blocker, and the stale coverage path came from a write-deferred visible
publication handoff before promoting `src/admin/admin-control-snapshot-class-part-2.js`.

## In Scope

1. work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md
2. work/model-ledger.jsonl
3. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. src/admin/admin-control-snapshot-class-part-2.js
7. test/admin/admin-control-snapshot.test.js

## Out Of Scope

1. publication-ack-convergence
2. priority_recovery_partition_progress
3. operation_workflow_owner
4. timeout_budgets
5. active_gate_admission

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md`, `work/model-ledger.jsonl`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `src/admin/admin-control-snapshot-class-part-2.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: publication ACK, priority recovery, timeout budgets, and
  active-gate admission remain closed unless canonical evidence selects them.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, or a frozen decision must be reopened.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `npm run work:validate -- --entry work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md`
2. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --handoff-probe`
3. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --replay-fixture`
4. PASS - `npm run work:validate -- --pre-impl work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md`
5. PASS - `node test/admin/admin-control-snapshot.test.js`
6. PASS - `node --check src/admin/admin-control-snapshot-class-part-2.js && node --check test/admin/admin-control-snapshot.test.js`
7. PASS - `node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-2.js test/admin/admin-control-snapshot.test.js`
8. PASS - `node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-2.js test/admin/admin-control-snapshot.test.js`
9. PASS - `npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-2.js`
10. PASS - `npx eslint src/admin/admin-control-snapshot-class-part-2.js test/admin/admin-control-snapshot.test.js --ignore-pattern 'test/.gitkeep'`
11. REDUCED - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --verbose` stayed red, but `discovery_node_coverage_gap` disappeared and the selected edge moved to `selected_snapshot_source_timeout`.
12. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json`
13. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --explain active_gate_snapshot_coverage`
14. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --handoff-probe`
15. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json`
16. PASS - `git diff --check -- work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json src/admin/admin-control-snapshot-class-part-2.js test/admin/admin-control-snapshot.test.js`
17. PASS - `npm run work:validate -- --closure work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md`
18. PASS - `npm run work:model-ledger -- record --package work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason selected-snapshot-source-timeout --outcome reduced --validation-status focused-green-representative-reduced --correction-loops 2 --review-findings 1`
19. PASS - `npm run work:validate -- --closure work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md` after commit-and-push ledger record.

## Commit And Push Ledger

1. Focused package commit: 41285a3e
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Split commit note: 41285a3e contains the runtime fix, focused regression,
   migrated package state, successor activation, sprint handoff,
   current-blocker regeneration, representative classification, and
   model-ledger record. This follow-up records the durable commit-and-push
   ledger for closure validation.
