# Startup Active Gate Snapshot Coverage After Priority Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Priority recovery is satisfied with zero residual witnesses. Fresh representative rolling-restart remains red at active_gate_snapshot_coverage: snapshotCoverage=0/5, selected snapshot source 11601fe0-72d6-5853-8590-ec2881853e72, and selectedSnapshotError reports authoritative control snapshot repair failed against node 7493b0ab-a054-5fad-a91b-5e331db29304.",
  "nextAction": "Run the required review/fix/implementation subagent sequence before runtime edits, then build the narrow replayable active-gate snapshot fixture that separates selected snapshot source, authoritative repair/query pressure, and inherited readiness support. Success must improve snapshot coverage, remove the selected repair/query edge, migrate to a genuinely new owner boundary, or turn rolling-restart green.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-handoff.md",
    "test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/authoritative-node-evidence-reconciler.js",
    "test/admin/admin-control-snapshot.test.js",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "cross-boundary-causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "active-gate-snapshot-coverage/authoritative-repair-pressure",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Decide the authoritative repair/query pressure edge for selected snapshot source 11601fe0-72d6-5853-8590-ec2881853e72 without reopening publication ACK, priority recovery, timeout budgets, active-gate admission, or readiness support."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "workflow_progress",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The predecessor classified the spread_satisfied_in_flight priority recovery witness as non-blocking, residual extraction reports zero witnesses, and fresh representative evidence selects active_gate_snapshot_coverage.",
    "evidence": [
      "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-handoff.md",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json --markdown",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The remaining red gate belongs to startup_active_gate_owner / snapshot_coverage: the selected snapshot source is admin-ready, but authoritative control snapshot repair fails against a participant connection and coverage stays 0/5.",
    "stopConditionCheck": "Use npm run work:evidence-summary, npm run analyze:topology-convergence -- --handoff-probe, npm run analyze:owner-files, and npm run analyze:causal-model before runtime edits; then run required subagents before promoting exact owner files.",
    "expectedCausalModelChange": "snapshotCoverage improves above 0/5, the selected authoritative repair/query edge disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK, priority recovery, timeout budgets, active-gate admission, and readiness support are frozen. This package may reopen selected snapshot source and active-gate snapshot coverage only because fresh canonical evidence selects them.",
    "crossBoundaryReview": "The validation lane is causal-escalation because the sprint has alternated between active-gate, publication, and workflow-progress boundaries without representative green. This successor must make one replayable decision before runtime edits."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority nonblocking closure rerun",
    "phaseChain": [
      "consume the priority-recovery closure proof",
      "use work:evidence-summary and handoff probe on the fresh representative",
      "use owner-files to select the startup_active_gate_owner / snapshot_coverage fixture and candidate runtime files",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected owner path",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with reason active_gate_timed_out and snapshotCoverage=0/5.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied",
      "priority_recovery_partition_progress is satisfied and residual extraction reports zero witnesses",
      "selected snapshot source is 11601fe0-72d6-5853-8590-ec2881853e72",
      "selectedSnapshotError reports authoritative control snapshot repair failed: nodes connection to 7493b0ab-a054-5fad-a91b-5e331db29304 closed",
      "readiness_startup_support is deferred as inherited active-gate no progress"
    ],
    "missingCausalEdge": "Decide whether the 0/5 selected snapshot coverage edge is caused by selected snapshot source choice, forced repair stall, authoritative control snapshot query pressure, or inherited readiness support.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json --handoff-probe",
    "boundedProgressProof": "Pending replayable active-gate snapshot fixture and focused owner proof for the bounded retry/reconcile path after priority recovery closure.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json",
    "expectedObservableTransition": "snapshotCoverage improves above 0/5, selected repair/query pressure disappears, a genuinely new owner boundary is selected, or representative rolling-restart turns green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage causal-escalation slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains at active_gate_snapshot_coverage with the same selected repair/query edge and no metric movement, stop as same-frontier instead of reopening frozen edges.",
    "expectedNextFrontier": "readiness_startup_support after active-gate snapshot coverage improves, otherwise a narrower selected source, repair, or authoritative query owner selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-handoff.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This package is allowed only because the predecessor removed the priority-recovery edge and fresh canonical evidence selected startup_active_gate_owner / snapshot_coverage.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-handoff.md"
}
-->

## Why

Priority recovery is now satisfied with zero residual witnesses. The fresh
representative is still red, but canonical evidence selects
`startup_active_gate_owner / snapshot_coverage`: selected source
`11601fe0-72d6-5853-8590-ec2881853e72` is admin-ready, coverage is `0/5`, and
authoritative repair fails while querying control snapshot data through node
`7493b0ab-a054-5fad-a91b-5e331db29304`.

This package owns the next metric-moving decision. It must separate selected
source choice, forced repair stall, authoritative query pressure, and inherited
readiness support before any runtime edit.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative gate remains red after adjacent
  publication and workflow-progress migrations, and the next proof may change
  startup active-gate snapshot coverage behavior.
- Escalation trigger to a heavier lane: owner evidence expands outside
  startup active-gate snapshot coverage, or representative evidence selects a
  frozen decision again.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-implementation-starts.
- [ ] Fix subagent recorded or explicitly not needed: pending-review-result.
- [ ] Implementation subagent recorded: pending-review-and-fix-ledger-clean.

## Out Of Scope

1. publication_ack_convergence
2. timeout_budgets
3. active_gate_admission
4. priority_recovery_workflow_progress
5. readiness_support

## Model Fit

- Package class: `cross-boundary-causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `active-gate-snapshot-coverage/authoritative-repair-pressure`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `publication_ack_convergence`, `timeout_budgets`, `active_gate_admission`, `priority_recovery_workflow_progress`, `readiness_support`
- Frozen decisions: publication ACK, priority recovery, timeout budgets,
  active-gate admission, and readiness support stay closed unless canonical
  evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime
  ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-nonblocking-closure-20260517T055254Z.report.json
4. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
