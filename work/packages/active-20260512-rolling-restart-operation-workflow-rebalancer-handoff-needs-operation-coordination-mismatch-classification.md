# Rolling Restart Operation Workflow Rebalancer Handoff Needs Operation Coordination Mismatch Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-12",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Retry-scheduled rebalancer-handoff backpressure is bounded by focused owner proof, but the representative artifact remains red on priority_recovery_partition_progress with unresolved needs_operation and coordination_mismatch evidence. The residual is not one retry-scheduled runtime gap: control_plane_publications-p1 is rebalancer_leader / operation_scheduling / eligible_but_no_operation_created, replica_operations-p1 and sql_transaction_participants-p1 are operation_workflow_owner / workflow_progress / publication_recovery_eligible_but_coordinator_excludes_node, and sql_transactions-p1 plus sql_write_operations-p1 are operation_workflow_owner / workflow_progress serial-wait dependents.",
  "nextAction": "Classify the residual into one owner fix only if evidence proves one owner owns the whole needs_operation / coordination_mismatch set; otherwise split deliberately into the smallest owner-boundary successor packages. Do not add more retry-scheduled handoff runtime code and do not touch startup active-gate, publication convergence, harness timeouts, Pro, or Enterprise behavior.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
    "jq residual semantic-state extraction for needs_operation and coordination_mismatch partitions",
    "npm run work:package:doctor -- work/packages/active-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md",
    "npm run work:validate",
    "git diff --check"
  ],
  "touchedFiles": [
    "work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled.md",
    "work/packages/active-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md",
    "work/packages/done-20260512-rolling-restart-operation-workflow-progress-priority-recovery-event-wait.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-residual-classification/current-frontier",
    "escalationTriggers": [
      "classification requires runtime implementation before the residual owner split is known",
      "evidence requires reopening retry-scheduled handoff runtime code",
      "evidence restores startup active-gate or publication convergence as the first frontier",
      "runtime implementation would need Pro or Enterprise behavior"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If retry-scheduled handoff work is bounded, the remaining needs_operation and coordination_mismatch residual should classify as one owner-boundary fix only when all residual witnesses share one semantic owner; otherwise it should split into separate owner-boundary packages.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
    "expectedCausalModelChange": "The package either names one owner fix for the residual or records a deliberate split with successor owner-boundary packages before further runtime work.",
    "representativeOutcome": "pending-before-classification",
    "causalDebt": "Rolling-restart remains red with priority_recovery_partition_progress blocked after bounded retry proof; startup active-gate snapshot coverage remains downstream at 2/5 and publication ACK convergence remains satisfied.",
    "crossBoundaryReview": "Review the closed retry-scheduled handoff package before implementation; fix any package-proof defects before classifying this residual."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery needs_operation coordination_mismatch residual classification",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation scheduling",
      "operation workflow coordination and progress",
      "startup active-gate presentation"
    ],
    "currentFirstFrontier": "operation_workflow_owner / rebalancer_handoff / priority_recovery_progress_blocked with unresolved semantic states needs_operation and coordination_mismatch",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner snapshot coverage remains downstream at 2/5",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending ACKs"
    ],
    "missingCausalEdge": "The residual needs classification between rebalancer_leader operation scheduling and operation_workflow_owner workflow progress instead of another retry-scheduled handoff patch.",
    "missingCausalEdgeProbe": "jq residual semantic-state extraction plus topology convergence explain for priority_recovery_partition_progress",
    "boundedProgressProof": "Predecessor proof bounds retry-scheduled handoff work through focused operation workflow owner tests; this package classifies the non-retry residual only.",
    "boundedProgressProofArtifact": "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js; test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js; test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "residual classification narrows to one owner fix or splits into explicit owner-boundary successors without changing runtime behavior",
    "maxProgressBound": "classification-only package; no runtime wait or retry budget is added",
    "sameFrontierFallback": "split the residual by owner-boundary and keep startup active-gate downstream",
    "expectedNextFrontier": "first selected owner-boundary successor from the classified split",
    "resultClassification": "pending-before-classification",
    "stopCondition": "classify-or-split"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled.md"
}
-->

## Why

The predecessor proved retry-scheduled rebalancer-handoff backpressure is
bounded. The representative gate remains red because the residual
priority-recovery evidence is mixed: one partition still needs a recovery
operation, two partitions have coordinator/operation workflow mismatch, and two
partitions are serial-wait dependents.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## Model Fit

- Package class: `representative-frontier-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-residual-classification/current-frontier`
- Owned files: this package, the predecessor package closure metadata, active
  sprint handoff, generated current-blocker files, `work/model-ledger.jsonl`,
  and successor package metadata if the residual must split.
- Forbidden files and behavior: retry-scheduled handoff runtime code, startup
  active-gate implementation, topology publication convergence implementation,
  harness timeout increases, Pro or Enterprise behavior.
- Frozen decisions: publication ACK convergence is satisfied/non-frontier;
  retry-scheduled handoff backpressure is bounded by predecessor focused proof;
  startup active-gate remains downstream until priority recovery is green,
  reduced, or explicitly split.
- Escalation triggers: classification needs runtime changes before the owner
  split is known, evidence restores publication convergence or startup
  active-gate as the first frontier, or implementation would need paid-edition
  behavior.
- Focused proof: evidence summary, topology explain, distributed-failure
  summary, causal model, residual semantic-state extraction, package doctor,
  work validation, and `git diff --check`.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Lorentz (019e1c4f-a952-7480-8829-994b3254d02c) reviewed
      `work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Mendel (019e1c54-5aaf-7fe0-b8ae-3e0836ee4670) fixed
      `work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled.md`.
- [ ] Implementation subagent recorded:
      Agent <name> (<agent-id>) implemented
      `work/packages/active-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md`.

## Residual Evidence To Classify

The latest artifact keeps the first frontier at
`priority_recovery_partition_progress` with topology owner
`operation_workflow_owner / rebalancer_handoff`, but the unresolved semantic
state set is `needs_operation,coordination_mismatch`.

Residual partition witnesses:

1. `control_plane_publications-p1`: `needs_operation`,
   `eligible_but_no_operation_created`, `action_required`,
   `rebalancer_leader / operation_scheduling`, next action
   `create_recovery_operation`.
2. `replica_operations-p1`: `coordination_mismatch`,
   `publication_recovery_eligible_but_coordinator_excludes_node`,
   `persisted_not_dispatched`, `operation_workflow_owner / workflow_progress`,
   latest operation `PENDING`.
3. `sql_transaction_participants-p1`: `coordination_mismatch`,
   `publication_recovery_eligible_but_coordinator_excludes_node`,
   `persisted_not_dispatched`, `operation_workflow_owner / workflow_progress`,
   latest operation `PENDING`.
4. `sql_transactions-p1`: `needs_operation`, `priority_operation_serial_wait`,
   `transition_deferred`, `operation_workflow_owner / workflow_progress`,
   serial-waiting on the first two operation ids.
5. `sql_write_operations-p1`: `needs_operation`,
   `priority_operation_serial_wait`, `transition_deferred`,
   `operation_workflow_owner / workflow_progress`, serial-waiting on the same
   two operation ids.

## In Scope

1. Review the closed retry-scheduled handoff package before residual
   classification starts.
2. Classify whether the residual is one owner fix or a deliberate split.
3. Preserve the exact owner-boundary evidence for each residual partition.
4. Update the sprint/current-blocker handoff to the classification result.
5. Create successor package metadata only if the residual splits.

## Out Of Scope

1. More retry-scheduled handoff runtime code.
2. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
3. Runtime implementation before the residual owner split is known.
4. Presentation-only relabeling that hides owner-boundary evidence.

## Validation

1. Evidence summary:
   `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json`
2. Topology explain:
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --explain priority_recovery_partition_progress`
3. Distributed-failure summary:
   `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json`
4. Causal model:
   `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json`
5. Package doctor:
   `npm run work:package:doctor -- work/packages/active-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md`
6. Work validation:
   `npm run work:validate`
7. Diff check:
   `git diff --check`
