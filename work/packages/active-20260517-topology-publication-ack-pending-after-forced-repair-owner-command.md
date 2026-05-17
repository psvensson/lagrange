# Topology Publication Ack Pending After Forced Repair Owner Command

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "Representative rolling-restart after the active-gate selected-source/forced-repair slice remains red: first frontier publication_ack_convergence, publicationStatus=OPEN, pendingAckCount=1, pendingAckNodeIds empty, prioritySpreadPending=true, active-gate progress repair_deferred with snapshotCoverage=2/5 and discovery_node_coverage_gap, plus a non-splitting operation_workflow_owner / rebalancer_handoff residual witness.",
  "nextAction": "Build the narrow replay fixture for publication OPEN with pendingAckCount=1, empty pendingAckNodeIds, prioritySpreadPending=true, and operation_workflow_owner/rebalancer_handoff residual; edit only the selected publication or operation workflow owner path if the fixture proves it, with success defined as snapshotCoverage above 2/5, discovery_node_coverage_gap gone, a new owner boundary migration, or representative rolling-restart green.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md",
    "test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json"
  ],
  "generatedFiles": [
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
    "work/packages/active-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "pending_acks_present",
    "nextAction": "Build the replayable publication ACK / rebalancer-handoff split fixture before runtime edits."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate package removed the selected snapshot-source timeout edge but did not move coverage beyond 2/5 because the publication ACK frontier is still OPEN and gated by a concrete rebalancer-handoff residual; the next metric-moving proof must decide whether publication ACK count-only state, operation workflow rebalancer handoff, or downstream active-gate repair owns the edge.",
    "stopConditionCheck": "Use npm run work:evidence-summary, topology handoff/replay fixture, npm run analyze:causal-model, priority-recovery residuals, and owner-files before any runtime edit. Runtime files remain candidate-only until a focused fixture selects publication or operation workflow ownership.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "This is a reopened frozen publication ACK edge, allowed only because canonical evidence reselected publication_ack_convergence after the active-gate slice.",
    "crossBoundaryReview": "Do not touch timeout budgets, active-gate admission, CDC fallback, reconnect/query routing, or readiness support. Publication ACK and priority recovery are reopened only to the extent selected by the replay fixture."
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
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json, owned by topology_publication_owner / publication_convergence with reason pending_acks_present.",
    "knownDownstreamBlockers": [
      "publicationStatus=OPEN",
      "pendingAckCount=1",
      "pendingAckNodeIds=[]",
      "prioritySpreadPending=true",
      "active_gate_snapshot_coverage deferred with repair_deferred/deferred_refresh",
      "snapshotCoverage=2/5",
      "discovery_node_coverage_gap present",
      "operation_workflow_owner / rebalancer_handoff residual witness for sql_transaction_participants-p1 recovering_in_flight"
    ],
    "missingCausalEdge": "Separate publication ACK count-only/open state from operation_workflow_owner rebalancer-handoff residual and downstream active-gate repair deferral.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --markdown",
    "boundedProgressProof": "Pending bounded reconcile/drain proof: the focused fixture must show whether publication ACK can close after the owner reconcile command, whether the rebalancer-handoff residual must drain first, or whether active-gate repair remains the owner.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json",
    "expectedObservableTransition": "snapshotCoverage above 2/5, discovery_node_coverage_gap gone, a genuinely new owner boundary selected, or representative rolling-restart green.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence causal-escalation slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence keeps publication_ack_convergence without metric movement, stop and record same-frontier instead of reopening unrelated frozen edges.",
    "expectedNextFrontier": "publication_ack_convergence gone, snapshotCoverage above 2/5, discovery_node_coverage_gap gone, operation_workflow_owner / rebalancer_handoff selected as a new owner boundary, or representative green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-convergence-reopened-missing-publication.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is allowed because fresh canonical evidence reselected publication_ack_convergence after the active-gate package, not because publication ACK was reopened manually.",
    "handoffInvariant": "Timeout budgets, active-gate admission, CDC fallback, reconnect/query routing, and readiness support remain frozen. Publication ACK and priority recovery may be touched only if the focused replay fixture selects them."
  }
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

- [ ] Review subagent recorded: pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed: pending-review-result.
- [ ] Implementation subagent recorded: pending-before-implementation-resumes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. work/model-ledger.jsonl

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `cross-boundary-causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `publication-ack/rebalancer-handoff-split`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: timeout budgets, active-gate admission, CDC fallback, reconnect/query routing, readiness support unless canonical evidence reselects them.
- Frozen decisions: selected-source timeout is closed for this successor; publication ACK and priority recovery are candidate edges only through the new replay fixture.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-forced-repair-owner-command-20260517T043738Z.report.json --markdown
