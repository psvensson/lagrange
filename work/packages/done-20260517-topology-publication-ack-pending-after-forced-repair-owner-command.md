# Topology Publication Ack Pending After Forced Repair Owner Command

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "Focused flat-progress handoff regression is implemented. The representative rerun moved the blocker: publication_ack_convergence is satisfied with publicationStatus=PUBLISHED, pendingAckCount=0, pendingAckNodeIds empty, snapshotCoverage improved to 4/5, and the first frontier migrated to operation_workflow_owner / workflow_progress with priority_recovery_event_driven_wait.",
  "nextAction": "Close this publication handoff slice as migrated/reduced and continue in a successor operation_workflow_owner / workflow_progress package using test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json; active-gate snapshot coverage remains a downstream blocker at 4/5 with discovery_node_coverage_gap.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --markdown",
    "node --check src/control-plane/publication-active-gate-handoff-contract.js",
    "node --check test/control-plane/publication-active-gate-handoff-contract.test.js",
    "node --test test/control-plane/publication-active-gate-handoff-contract.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js",
    "npm run test:metrics:scoped -- src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js",
    "npm run work:validate -- --entry",
    "npm run work:validate -- --pre-impl",
    "git diff --check -- src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/model-ledger.jsonl",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --handoff-probe",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md",
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md",
    "test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json"
  ],
  "generatedFiles": [
    "test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/workflow/operation-workflow.js",
    "src/rebalancer/rebalancer.js",
    "src/admin/admin-control-snapshot-class-part-2.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md",
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js"
  ],
  "modelFit": {
    "packageClass": "cross-boundary-causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "publication-ack/rebalancer-handoff-split",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Open a successor on operation_workflow_owner / workflow_progress; publication_ack_convergence is satisfied and snapshotCoverage improved to 4/5."
  },
  "causalGovernance": {
    "hypothesis": "The publication ACK edge was caused by the selector ignoring flattened active-gate progress handoff evidence under publication convergence; accepting that shape lets the owner reconcile target publish the full selected cohort.",
    "stopConditionCheck": "Closed for this owner: focused regression plus representative rerun satisfied publication_ack_convergence, moved snapshotCoverage from 2/5 to 4/5, and npm run analyze:causal-model confirmed migration to operation_workflow_owner / workflow_progress.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "migrated",
    "causalDebt": "This is a reopened frozen publication ACK edge, allowed only because canonical evidence reselected publication_ack_convergence after the active-gate slice.",
    "crossBoundaryReview": "Timeout budgets, active-gate admission, CDC fallback, reconnect/query routing, readiness support, and selected snapshot-source selection remained frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart forced repair owner command representative rerun",
    "phaseChain": [
      "consume active-gate selected-source migration proof",
      "use evidence-summary, handoff probe, replay fixture, causal model, priority residuals, and owner-files to split publication ACK from operation workflow rebalancer handoff",
      "build or reuse a focused replay fixture for publication OPEN with pendingAckCount=1, empty pendingAckNodeIds, prioritySpreadPending=true, and sql_transaction_participants-p1 recovering_in_flight",
      "run review/fix/implementation subagents before runtime edits",
      "edit only the selected owner path",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress in test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json, owned by operation_workflow_owner / workflow_progress with reason priority_recovery_event_driven_wait.",
    "knownDownstreamBlockers": [
      "publicationStatus=PUBLISHED",
      "pendingAckCount=0",
      "pendingAckNodeIds=[]",
      "priority_recovery_partition_progress retryable with priority_recovery_event_driven_wait",
      "operation_workflow_owner / workflow_progress residual witness for control_plane_publications-p1 in spread_satisfied_in_flight",
      "active_gate_snapshot_coverage deferred with repair_deferred/deferred_refresh downstream",
      "snapshotCoverage=4/5",
      "discovery_node_coverage_gap present",
      "owner_reconcile_pending remains for 3 nodes"
    ],
    "missingCausalEdge": "Publication ACK count-only/open state is closed; the remaining edge is operation_workflow_owner / workflow_progress event-driven priority recovery before downstream active-gate repair reaches 5/5.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown",
    "boundedProgressProof": "The flattened active-gate progress handoff fixture now drives the publication reconcile target. Representative rerun satisfied publication_ack_convergence, improved snapshotCoverage from 2/5 to 4/5, and migrated the first frontier to operation_workflow_owner / workflow_progress.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
    "expectedObservableTransition": "Observed: snapshotCoverage improved above 2/5 and the first frontier migrated to operation_workflow_owner / workflow_progress.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence causal-escalation slice",
    "sameFrontierFallback": "Not used; representative evidence moved off publication_ack_convergence.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is allowed because fresh canonical evidence reselected publication_ack_convergence after the active-gate package, not because publication ACK was reopened manually.",
    "handoffInvariant": "Timeout budgets, active-gate admission, CDC fallback, reconnect/query routing, and readiness support remain frozen. Publication ACK and priority recovery may be touched only if the focused replay fixture selects them."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "Focused flattened active-gate progress handoff selection closed the OPEN publication ACK edge in the representative run. Canonical evidence now marks publication_ack_convergence satisfied, snapshotCoverage improved from 2/5 to 4/5, and the first frontier migrated to priority_recovery_partition_progress under operation_workflow_owner / workflow_progress.",
    "evidence": [
      "node --test test/control-plane/publication-active-gate-handoff-contract.test.js",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --handoff-probe",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json"
    ]
  },
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260517-priority-recovery-workflow-progress-after-publication-handoff.md"
}
-->

## Why

Canonical evidence reselected `publication_ack_convergence` after the
active-gate selected-source and forced-repair slice. This package owns only the
replayable split between publication ACK/open state and the
`operation_workflow_owner / rebalancer_handoff` residual that the same artifact
reported.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the package reopens a frozen publication/priority
  edge only because canonical evidence selected it again.
- Escalation trigger to a heavier lane: the replay fixture selects a different
  runtime owner or requires files outside the candidate runtime set.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven causal
escalation package that may edit a runtime owner boundary.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Herschel (019e3445-5215-7862-bc51-9cd2e8274fe9) reviewed work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Feynman (019e3448-43f5-7ae3-ae7c-ac62f21a435a) fixed work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md.
- [x] Implementation subagent recorded: Agent Nash (019e344a-ed45-7201-8e6c-ea0092edff9c) implemented work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md
2. work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md
3. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. work/model-ledger.jsonl
7. src/control-plane/publication-active-gate-handoff-contract.js
8. test/control-plane/publication-active-gate-handoff-contract.test.js

## Out Of Scope

1. Timeout budgets, active-gate admission, CDC fallback, reconnect/query routing, readiness support, and selected snapshot-source selection.
2. Operation workflow runtime edits; the representative run selected that as the successor owner.

## Model Fit

- Package class: `cross-boundary-causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `publication-ack/rebalancer-handoff-split`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md`, `work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`
- Forbidden files: timeout budgets, active-gate admission, CDC fallback, reconnect/query routing, readiness support unless canonical evidence reselects them.
- Frozen decisions: selected-source timeout, timeout budgets, active-gate admission, CDC fallback, reconnect/query routing, and readiness support stayed closed in this package.
- Escalation triggers: owned files expand beyond this package or representative scenario evidence contradicts the migrated owner boundary.
- Focused proof: `node --test test/control-plane/publication-active-gate-handoff-contract.test.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --handoff-probe`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --markdown
6. node --check src/control-plane/publication-active-gate-handoff-contract.js
7. node --check test/control-plane/publication-active-gate-handoff-contract.test.js
8. node --test test/control-plane/publication-active-gate-handoff-contract.test.js
9. node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js
10. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js
11. npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js
12. npm run test:metrics:scoped -- src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js
13. npm run work:validate -- --entry work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md
14. npm run work:validate -- --pre-impl work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md
15. git diff --check -- src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/model-ledger.jsonl
16. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --verbose
17. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json
18. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --handoff-probe
19. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown
20. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json

## Commit And Push Ledger

1. Focused package commit: `8ce8359dbb7afe4d07e332132addc0fb351d54c7`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
