# Startup Active Gate Remaining Handoff Reconcile Node

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Closed as migrated. Focused paired owner-reconcile projection and stale selected-ACK handoff proof are implemented in the active-gate harness path. Focused syntax and part-5 tests pass. The representative rolling-restart rerun in test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json moved past startup active gate and failed in load mode with canonical first frontier publication_ack_convergence under topology_publication_owner / publication_convergence, dominant reason publication_pending; active-gate snapshot coverage is now deferred behind publication convergence.",
  "nextAction": "Stop this package at the migrated frontier. Open or continue the successor for topology_publication_owner / publication_convergence using test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json; do not widen this active-gate package into publication ACK, priority recovery, timeout, or readiness work.",
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
    "git diff --check",
    "node --check test/distributed/harness/cluster-segment-7-class-4.js",
    "node --check test/distributed/harness/__tests__/cluster.test-part-5.js",
    "npx tap test/distributed/harness/__tests__/cluster.test-part-5.js",
    "node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence",
    "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md",
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
    "work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md",
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
    "artifact": "test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open or continue the successor for topology_publication_owner / publication_convergence. Active-gate snapshot coverage is deferred behind publication convergence after this package migrated."
  },
  "causalGovernance": {
    "hypothesis": "The predecessor projection reduced pendingReconcileCount from 3 to 1. The remaining local edge is the single unpublished active-gate owner cohort node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7; closing or migrating that reconcile edge should either move pendingReconcileCount to 0, improve snapshot coverage, or expose a new canonical owner boundary.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff and replay probes, npm run analyze:causal-model, priority residual extraction, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Achieved migrated evidence: focused active-gate owner-reconcile projection and stale selected-ACK handoff proof moved the representative first frontier to publication_ack_convergence / topology_publication_owner / publication_convergence.",
    "representativeOutcome": "migrated",
    "causalDebt": "Publication convergence is selected by canonical evidence in the new representative artifact. Priority recovery reports one operation_workflow_owner / rebalancer_handoff witness, and active-gate snapshot coverage is deferred; timeout budgets, active-gate admission, terminal-progress selection, and readiness support stay frozen unless canonical evidence selects them again.",
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
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json, owned by topology_publication_owner / publication_convergence with publicationStatus=OPEN, publicationPending=true, recoveryProtocolState=publication_pending, prioritySpreadPending=true, publishedActiveNodeIds containing only the seed, and missingPublishedCount=4.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is the canonical first frontier with dominant reason publication_pending",
      "publicationStatus is OPEN and recoveryProtocolState is publication_pending",
      "publication owner stream outcome is publishing with recoveryOutcome waiting_for_publication",
      "priority_recovery_residuals reports one operation_workflow_owner / rebalancer_handoff witness for control_plane_publications-p1",
      "active_gate_snapshot_coverage is deferred behind publication_ack_convergence and priority recovery",
      "active-gate progress remains snapshotCoverageNodeCount=3 of expectedNodeCount=5 with repair_deferred observation",
      "publicationActiveGateHandoffState remains pending with owner_reconcile_pending and runtimePromotionAllowed=false",
      "readiness mode at failure is load with no_progress_terminal"
    ],
    "missingCausalEdge": "The active-gate selected stale ACK edge is closed for this package; the remaining representative edge is publication convergence with OPEN publication/publishing owner stream and one priority recovery rebalancer-handoff witness.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --replay-fixture",
    "boundedProgressProof": "Focused tests prove paired pending reconcile projection and selected stale ACK resolution only when the ACK node is covered by pending owner-reconcile handoff proof. The representative moved past startup active-gate setup and selected publication_ack_convergence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "expectedObservableTransition": "Achieved migrated evidence: active_gate_snapshot_coverage is no longer first frontier; topology_publication_owner / publication_convergence is now selected.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage reconcile_owner_membership_publication slice for the remaining-node projection",
    "sameFrontierFallback": "If the successor remains at active_gate_snapshot_coverage with the same owner and required action after focused proof, stop as same-frontier or split a narrower edge instead of widening into frozen publication, priority, timeout-budget, admission, selected-source timeout, terminal-progress, or readiness edges. If evidence only reduces the same owner-boundary-action count, continue in this package instead of opening another successor.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence unless focused successor evidence selects operation_workflow_owner / rebalancer_handoff ahead of publication convergence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260517-startup-active-gate-pending-handoff-reconcile-after-selected-timeout-reduction.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/active-20260517-startup-active-gate-remaining-handoff-reconcile-node.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package stops at migration because canonical evidence selected topology_publication_owner / publication_convergence after focused active-gate proof.",
    "handoffInvariant": "Timeout budgets, active-gate admission, terminal-progress selection, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Focused active-gate proof resolved the remaining selected stale ACK and paired owner-reconcile projection edges locally; the representative rerun moved to load mode and selected publication_ack_convergence as the first frontier with publication_pending.",
    "evidence": [
      "npx tap test/distributed/harness/__tests__/cluster.test-part-5.js",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --replay-fixture",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-startup-publication-lag-snapshot-projection.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260517-topology-publication-convergence-after-startup-reconcile-migration.md"
}
-->

## Why

The predecessor proved a bounded startup active-gate projection and reduced the
publication active-gate handoff reconcile count from `3` to `1`. This package
implemented the single pending-node projection fast path and improved the latest
representative snapshot coverage from `2/5` to `3/5`. The latest evidence
then proved the paired remaining reconcile projection plus the selected stale
ACK handoff rule. The representative is still red, but the first frontier
migrated to `topology_publication_owner / publication_convergence`, so this
package stops at the owner-boundary migration.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json
First frontier: publication_ack_convergence
Owner: topology_publication_owner
Boundary: publication_convergence
Selected cause: publication_pending with publicationStatus=OPEN and publicationOwnerStreamOutcome=publishing
Required action: continue in successor package for topology_publication_owner / publication_convergence
Runtime promotion allowed: not applicable in this package
Pending reconcile count: 2 downstream active-gate handoff nodes, deferred
Pending reconcile nodes: 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, ebc4aa0b-06c6-506d-93ea-1dd2deca3f58
Current coverage: 3/5, deferred behind publication convergence
Frozen upstream proof: active-gate selected stale ACK edge resolved locally; priority residual now reports one operation_workflow_owner / rebalancer_handoff witness
Goal: stop this package as migrated and continue in the publication-convergence successor
Allowed edits: exact runtime or harness files promoted by focused remaining-node proof after review/fix/implementation subagent proof; implemented in test/distributed/harness/cluster-segment-7-class-4.js and test/distributed/harness/__tests__/cluster.test-part-5.js
Required latest proof: npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json
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
2. Do not keep editing this active-gate package after the canonical migration.
3. Do not promote workflow progress from this package; the successor must decide
   whether publication convergence or the rebalancer-handoff witness owns the
   next slice.
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

1. topology_publication_owner implementation in this closed package
2. operation_workflow_owner implementation in this closed package
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
- Owned files: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`, `work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
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
16. PASS: `node --check test/distributed/harness/cluster-segment-7-class-4.js`
17. PASS: `node --check test/distributed/harness/__tests__/cluster.test-part-5.js`
18. PASS: `npx tap test/distributed/harness/__tests__/cluster.test-part-5.js`
19. FAIL-MIGRATED: `node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --fast-local --verbose` moved past startup active gate, reached `setup.cluster.active`, and failed in load mode on `publication_ack_convergence / topology_publication_owner / publication_convergence`.
20. PASS: `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json`
21. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --handoff-probe`
22. PASS: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --replay-fixture`
23. PASS: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json`
24. PASS: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json`
25. PASS: `npm run analyze:owner-files -- topology_publication_owner publication_convergence`
26. PASS: `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`
27. PASS: `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json`
28. PASS: `git diff --check`

## Commit And Push Ledger

1. Focused package commit: `86c94a6c`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
