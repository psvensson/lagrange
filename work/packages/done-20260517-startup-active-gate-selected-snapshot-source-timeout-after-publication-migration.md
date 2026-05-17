# Startup Active Gate Selected Snapshot Source Timeout After Publication Migration

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused proof selected the active-gate selected snapshot source timeout path. The harness now resets only the snapshot admin lane after a timeout-shaped snapshot probe error, preserving the selected timeout evidence for the current attempt while allowing the next selected-source attempt to use a fresh lane. Focused part-5 harness tests and static checks passed. The fresh representative artifact test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json is red but migrated the first frontier to publication_ack_convergence under topology_publication_owner / publication_convergence with dominant reason publication_pending; active gate is now deferred with snapshotCoverageNodeCount=2/5 and priority residual witnesses remain 0.",
  "nextAction": "Stop this package at migrated. If work continues, open a successor on topology_publication_owner / publication_convergence using test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json; do not implement publication, priority, timeout-budget, admission, readiness, terminal-progress, or closed handoff work in this package.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json --explain active_gate_snapshot_coverage",
    "raw fallback: rg -n \"forceRepair|forcedRepair|forceAuthoritative|selectedSnapshot|snapshotCoverage|probeWitnesses\" test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json because canonical extractors did not expose snapshot lane reset state",
    "node --check test/distributed/harness/cluster-segment-7-class-5.js",
    "node --check test/distributed/harness/__tests__/cluster.test-part-5.js",
    "npx tap test/distributed/harness/__tests__/cluster.test-part-5.js -g \"resets snapshot lane after selected source timeout\"",
    "npx tap test/distributed/harness/__tests__/cluster.test-part-5.js",
    "node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js",
    "node scripts/check-guideline-decision-boundaries.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js",
    "node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "git diff --check -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md work/model-ledger.jsonl"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md",
    "test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json",
    "test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json"
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
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md",
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
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Active-gate selected-source timeout moved out of the first frontier. Publication convergence is out of this package's runtime scope."
  },
  "causalGovernance": {
    "hypothesis": "Publication convergence is now satisfied and no priority residual witnesses remain. The active-gate selected snapshot source times out before coverage can form, so a focused startup_active_gate_owner / snapshot_coverage proof should either reduce selected_snapshot_source_timeout, expose a narrower active-gate source-selection edge, or migrate to a new canonical owner boundary.",
    "stopConditionCheck": "Use work:evidence-summary, topology handoff/replay probes, npm run analyze:causal-model, priority residual extraction, distributed-failure summary, and owner-files before runtime edits. Runtime edits require the package's subagent sequencing proof or an explicit blocked-by-environment-policy ledger entry.",
    "expectedCausalModelChange": "Observed: selected_snapshot_source_timeout no longer remains the first frontier; active gate is deferred at snapshotCoverageNodeCount=2/5 and the representative migrated to publication_ack_convergence with priority residual witness count still 0.",
    "representativeOutcome": "migrated",
    "causalDebt": "The selected-source timeout lane reset is covered by focused harness proof. The fresh representative selects publication convergence again, which is out of this package. Timeout budgets, active-gate admission, terminal-progress selection, readiness support, and closed handoff proof stay frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "Review the closed topology_publication_owner / publication_convergence package before implementation; do not reopen publication recovery, priority recovery, timeout budgets, active-gate admission, or readiness support inside this package unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate selected snapshot source timeout after publication convergence",
    "phaseChain": [
      "consume the migrated publication-convergence closure package",
      "refresh evidence-summary, topology handoff/replay probes, causal model, priority residuals, distributed-failure summary, and owner-files on the latest representative artifact",
      "run or record required review/fix/implementation subagent sequencing before implementation",
      "build the narrowest selected snapshot source timeout probe",
      "edit only files selected by that focused proof",
      "rerun focused active-gate tests and one representative rolling-restart run with a real timestamp"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json, owned by topology_publication_owner / publication_convergence with dominant reason publication_pending. The prior active_gate_snapshot_coverage selected_snapshot_source_timeout moved out of first frontier; active gate is deferred with snapshotCoverageNodeCount=2 of expectedNodeCount=5.",
    "knownDownstreamBlockers": [
      "fresh representative first frontier is publication_ack_convergence",
      "publication status is OPEN/publishing/waiting_for_publication",
      "priority residual extraction reports zero witnesses",
      "active gate is deferred with snapshotCoverageNodeCount 2 of expectedNodeCount 5",
      "selectedSnapshotObservation is repair_deferred/deferred_refresh/deferred/deferred/retry",
      "publicationActiveGateHandoff is pending owner_reconcile_pending with count 3",
      "readiness mode is load and the representative failed after publication convergence stalled"
    ],
    "missingCausalEdge": "The selected snapshot source timeout blocks active-gate coverage after publication convergence closed.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json --replay-fixture",
    "boundedProgressProof": "Original extractors selected active_gate_snapshot_coverage with selected_snapshot_source_timeout at 0/5 coverage after publication ACK convergence and priority residuals were already clean. Focused source inspection showed timeout-shaped snapshot probe errors were normalized and returned without resetting the snapshot admin lane, so a timed-out selected source could remain pinned to the stale lane. The implementation resets only ADMIN_SOCKET_LANE_SNAPSHOT after timeout-shaped snapshot probe errors and keeps the timeout evidence on the current attempt. The new focused harness test proves the first selected source timeout resets the lane and the next selected-source attempt recovers on the normal snapshot lane without force repair or authoritative repair.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
    "expectedObservableTransition": "Observed: active_gate_snapshot_coverage moved out of first frontier, active gate is deferred with snapshotCoverageNodeCount=2/5, priority residual witnesses remain 0, and the representative migrated to publication_ack_convergence.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage selected-source timeout slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains active_gate_snapshot_coverage with the same selected snapshot source timeout and no coverage movement, stop as same-frontier or split a narrower edge instead of widening into publication, priority, timeout-budget, admission, or readiness work.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence successor, if continued",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "Allowed because the predecessor closed publication_ack_convergence and the latest representative evidence selects startup_active_gate_owner / snapshot_coverage with a different selected subcause.",
    "handoffInvariant": "Publication recovery, priority recovery, timeout budgets, active-gate admission, terminal-progress selection, readiness support, and the closed active-gate handoff proof remain frozen unless canonical evidence selects them again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Focused active-gate proof reset only the snapshot admin lane after timeout-shaped selected-source probe errors; focused harness validation passed and the representative rerun moved the first frontier to publication_ack_convergence with priority residual witnesses still 0.",
    "evidence": [
      "npx tap test/distributed/harness/__tests__/cluster.test-part-5.js -g \"resets snapshot lane after selected source timeout\"",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --replay-fixture",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md",
  "successor": "work/packages/active-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The publication-convergence package closed the stale presentation-only ACK debt:
the latest representative artifact reports publication convergence satisfied
and priority residual witness count `0`. The remaining first frontier is now
active-gate snapshot coverage, specifically a selected snapshot source timeout
before coverage can form.

## Current Edge Card

```text
Input artifact: test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json
Fresh artifact: test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
Input frontier: active_gate_snapshot_coverage
Input selected cause: selected_snapshot_source_timeout
Focused runtime proof: snapshot admin lane reset after timeout-shaped selected-source probe error
Fresh first frontier: publication_ack_convergence
Fresh owner: topology_publication_owner
Fresh boundary: publication_convergence
Fresh dominant reason: publication_pending
Fresh active-gate state: deferred, snapshotCoverageNodeCount=2/5
Frozen upstream proof: priority residual witnesses 0
Allowed edits: package metadata plus test/distributed/harness/cluster-segment-7-class-5.js and test/distributed/harness/__tests__/cluster.test-part-5.js
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

- [x] Review subagent recorded: Agent Bernoulli (019e3694-7a7a-7193-84c0-a50903ec3c1a) reviewed work/packages/done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e3696-4c56-7001-bbf8-ac7d33f3341b) fixed work/packages/done-20260517-topology-publication-convergence-after-startup-reconcile-migration.md.
- [x] Implementation subagent recorded: Agent Halley (019e369c-95cf-7de3-86f9-5c61ae089750) implemented work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md.

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

1. test/distributed/harness/cluster-segment-7-class-5.js
2. test/distributed/harness/__tests__/cluster.test-part-5.js
3. work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md
4. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
5. work/sprints/current-blocker.md
6. work/sprints/current-blocker.json
7. work/model-ledger.jsonl

## Out Of Scope

1. topology_publication_owner implementation
2. operation_workflow_owner implementation
3. timeout_budgets
4. active_gate_admission
5. readiness_support
6. closed publication-convergence proof

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`, `work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `topology_publication_owner implementation`, `operation_workflow_owner implementation`, `timeout_budgets`, `active_gate_admission`, `readiness_support`, `closed publication-convergence proof`
- Frozen decisions: publication recovery, priority recovery, timeout budgets, active-gate admission, terminal-progress selection, readiness support, and closed handoff proof stay frozen unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: original extractors selected `active_gate_snapshot_coverage` with `selected_snapshot_source_timeout`; focused source inspection selected snapshot lane reset after timeout-shaped snapshot probe errors in `test/distributed/harness/cluster-segment-7-class-5.js`; the focused harness test proves the next selected-source attempt recovers on the normal snapshot lane. Fresh representative evidence migrated to `topology_publication_owner / publication_convergence`.
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json
6. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json
7. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage
8. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json --explain active_gate_snapshot_coverage
9. raw fallback: rg -n "forceRepair|forcedRepair|forceAuthoritative|selectedSnapshot|snapshotCoverage|probeWitnesses" test-output/reports/rolling-restart-publication-reason-filter-20260517T151928Z.report.json because canonical extractors did not expose snapshot lane reset state
10. node --check test/distributed/harness/cluster-segment-7-class-5.js
11. node --check test/distributed/harness/__tests__/cluster.test-part-5.js
12. npx tap test/distributed/harness/__tests__/cluster.test-part-5.js -g "resets snapshot lane after selected source timeout"
13. npx tap test/distributed/harness/__tests__/cluster.test-part-5.js
14. node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js
15. node scripts/check-guideline-decision-boundaries.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js
16. node test/distributed/run.js --config test/distributed/config/local-benchmark-5node.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --fast-local --verbose
17. npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
18. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --handoff-probe
19. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json --replay-fixture
20. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
21. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
22. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-selected-snapshot-lane-reset-20260517T155212Z.report.json
23. git diff --check -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md work/model-ledger.jsonl

## Commit And Push Ledger

1. Focused package commit: `d635d399`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
