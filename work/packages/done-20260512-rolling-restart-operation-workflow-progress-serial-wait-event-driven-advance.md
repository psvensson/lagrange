# Rolling Restart Operation Workflow Progress Serial Wait Event Driven Advance

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-12",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Focused owner proof was already green for dispatch-pending owner advancement/re-entry. The representative rerun remains red but reduces the residual: priority_recovery_partition_progress is still first under operation_workflow_owner / workflow_progress, now with direct event-driven advance witnesses for control_plane_publications-p1, replica_operations-p1, and sql_transactions-p1; sql_transaction_participants-p1 and sql_write_operations-p1 are serial-wait dependents, and control_plane_publications-p1 also has a secondary non-promoted rebalancer_handoff retry witness.",
  "nextAction": "Close this package as reduced, then activate the direct-chain workflow-progress successor. Do not promote the secondary rebalancer_handoff split while workflow_progress remains the first frontier.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --markdown",
    "focused operation_workflow_owner / workflow_progress tests selected by implementation package",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --markdown"
  ],
  "touchedFiles": [
    "work/packages/done-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md",
    "work/model-ledger.jsonl",
    "work/packages/active-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "evidence promotes rebalancer_leader / operation_scheduling ahead of workflow progress",
      "the fix requires startup active-gate, publication convergence, harness timeout, Pro, or Enterprise behavior",
      "serial-wait dependents become independent direct blockers rather than downstream waits"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / workflow_progress owns the serial-wait event-driven advance residual, the direct recovering_in_flight persisted_not_dispatched operations for control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1 must dispatch, advance, timeout, reconcile, or migrate through one named owner path instead of leaving priority recovery blocked.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json",
    "expectedCausalModelChange": "The direct advance_existing_operation workflow-progress witnesses reduce, converge, or migrate to a new named owner boundary before serial-wait dependents are promoted as independent blockers.",
    "representativeOutcome": "reduced",
    "causalDebt": "Rolling-restart remains red after the serial-wait owner proof, but the direct workflow-progress residual reduced to control_plane_publications-p1, replica_operations-p1, and sql_transactions-p1. sql_transaction_participants-p1 and sql_write_operations-p1 are serial-wait dependents, and the secondary control_plane_publications-p1 rebalancer_handoff retry witness is not promoted while workflow_progress remains first.",
    "crossBoundaryReview": "Review/fix proof is recorded in the Subagent Sequencing Ledger, with implementation proof recorded by Agent Ampere (019e1ced-b894-7602-994e-438a596976ca)."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart workflow-progress serial-wait event-driven advance residual",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation scheduling",
      "operation workflow coordination and progress",
      "startup active-gate presentation"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress remains first under operation_workflow_owner / workflow_progress after coordination_mismatch was removed.",
    "knownDownstreamBlockers": [
      "sql_transaction_participants-p1 and sql_write_operations-p1 are priority_operation_serial_wait dependents of the direct workflow-progress operations",
      "startup_active_gate_owner snapshot coverage remains downstream while priority_recovery_partition_progress is first",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending ACKs",
      "the secondary operation_workflow_owner / rebalancer_handoff witness on control_plane_publications-p1 is not promoted while workflow_progress remains the first frontier"
    ],
    "missingCausalEdge": "The event-driven workflow-progress path leaves persisted operations not dispatched or advanced enough to clear priority recovery.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress plus focused operation_workflow_owner / workflow_progress tests selected by implementation",
    "boundedProgressProof": "Implementation must prove a deterministic dispatch, advance, timeout, or reconcile path for the direct persisted operations, or record a bounded migration.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json plus focused operation_workflow_owner / workflow_progress tests selected by implementation",
    "expectedObservableTransition": "The previous direct sql_transaction_participants-p1 witness reduces to a serial-wait dependent; control_plane_publications-p1, replica_operations-p1, and sql_transactions-p1 remain the direct workflow-progress chain for the successor package.",
    "maxProgressBound": "one workflow-progress owner cycle or focused timeout/reconcile probe for the direct pending operations",
    "sameFrontierFallback": "keep operation_workflow_owner / workflow_progress active and do not promote startup active-gate, publication convergence, or the parked operation-scheduling successor without fresh owner evidence",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress direct-chain successor in work/packages/active-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md",
  "successor": "work/packages/active-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md",
  "closed": "2026-05-12",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Fresh representative evidence after the coordinator-excludes-node fix removes
`coordination_mismatch`, but `priority_recovery_partition_progress` remains the
first frontier under `operation_workflow_owner / workflow_progress`.

This package proved the already-implemented owner advancement/re-entry path
with focused tests, then reran `rolling-restart`. The representative rerun
reduced the residual but did not close the gate: the direct workflow-progress
chain is now `control_plane_publications-p1`, `replica_operations-p1`, and
`sql_transactions-p1`, while `sql_transaction_participants-p1` and
`sql_write_operations-p1` are serial-wait dependents.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the work is driven by the current
  `rolling-restart` representative release gate and is bounded to one named
  owner/boundary.
- Escalation trigger to a heavier lane: evidence promotes a different owner,
  the residual needs cross-boundary causal analysis, or the package cannot
  reduce/migrate the direct workflow-progress witnesses with focused proof.

## In Scope

1. The original direct `operation_workflow_owner / workflow_progress` residual
   for `control_plane_publications-p1`, `replica_operations-p1`, and
   `sql_transaction_participants-p1`.
2. The reduced direct chain from the fresh representative rerun:
   `control_plane_publications-p1`, `replica_operations-p1`, and
   `sql_transactions-p1`.
3. `sql_transaction_participants-p1` and `sql_write_operations-p1` only as
   `priority_operation_serial_wait` dependents of the direct operations.
4. Focused owner tests and selected owner runtime files after the implementation
   subagent starts.
5. This package, active sprint handoff, generated current-blocker files, and
   package proof/model-ledger updates.

## Out Of Scope

1. startup active-gate implementation
2. publication-convergence implementation
3. harness timeout increases
4. Pro or Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: this package, active sprint handoff, generated current-blocker
  files, and selected `operation_workflow_owner / workflow_progress` runtime
  and test files only after the implementation subagent records its start.
- Forbidden files: startup active-gate implementation, publication-convergence
  implementation, harness timeout increases, Pro or Enterprise behavior, and
  the parked rebalancer-leader operation-scheduling successor.
- Frozen decisions: the coordinator-excludes-node residual is already reduced;
  `publication_ack_convergence` remains satisfied/non-frontier; startup
  active-gate stays downstream; the parked operation-scheduling successor is not
  promoted by the fresh report.
- Escalation triggers: evidence promotes operation scheduling ahead of workflow
  progress, the fix requires out-of-scope behavior, or serial-wait dependents
  become independent direct blockers.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --markdown`, `focused operation_workflow_owner / workflow_progress tests selected by implementation package`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --explain priority_recovery_partition_progress`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

Review/fix proof and implementation proof are recorded for this package.

- [x] Review subagent recorded:
      Agent Codex (75d36b2a-ecdf-4077-bbf4-46d1f0bb1c7b) reviewed work/packages/done-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Codex (019e1cd9-0833-74d3-ac62-7647f74756de) fixed work/packages/done-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md
- [x] Implementation subagent recorded:
      Agent Ampere (019e1ced-b894-7602-994e-438a596976ca) implemented work/packages/done-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md

## Causal Governance

- Causal hypothesis: if `operation_workflow_owner / workflow_progress` owns
  the serial-wait event-driven advance residual, the direct
  `recovering_in_flight`, `persisted_not_dispatched`,
  `advance_existing_operation` operations must dispatch, advance, timeout,
  reconcile, or migrate through one named owner path.
- Stop-condition check:
  `npm run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json`
- Expected causal-model change: direct workflow-progress witnesses reduce,
  converge, or migrate before serial-wait dependents become independent
  blockers.
- Representative outcome: `reduced`.
- Causal debt: `rolling-restart` remains red with three direct workflow-progress
  witnesses, two subordinate serial-wait dependents, and one secondary
  non-promoted rebalancer-handoff witness.
- Cross-boundary review: review/fix proof is recorded in the Subagent
  Sequencing Ledger above, and implementation proof is recorded by Agent Ampere.

## Scenario Causal Closure

- Reference scenario/probe: `rolling-restart` workflow-progress serial-wait
  event-driven advance residual.
- Phase chain: publication convergence; priority recovery operation scheduling;
  operation workflow coordination and progress; startup active-gate
  presentation.
- Current first frontier: `priority_recovery_partition_progress` under
  `operation_workflow_owner / workflow_progress`.
- Known downstream blockers: `sql_transaction_participants-p1` and
  `sql_write_operations-p1` are `priority_operation_serial_wait` dependents;
  startup active-gate remains downstream; publication ACK convergence remains
  satisfied; the secondary rebalancer-handoff witness is not promoted.
- Missing causal edge: event-driven workflow progress leaves persisted
  operations not dispatched or advanced enough to clear priority recovery.
- Missing causal edge probe:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress`
  plus focused owner tests selected by implementation.
- Bounded progress proof: implementation must prove a deterministic dispatch,
  advance, timeout, or reconcile path, or record a bounded migration.
- Bounded progress proof artifact:
  `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json`
  plus focused owner tests selected by implementation.
- Expected observable transition: the three direct workflow-progress witnesses
  dispatch, advance, timeout, reconcile, or migrate before serial-wait
  dependents are promoted.
- Max progress bound: one workflow-progress owner cycle or focused
  timeout/reconcile probe for the direct pending operations.
- Same-frontier fallback: keep `operation_workflow_owner / workflow_progress`
  active and do not promote startup active-gate, publication convergence, or
  the parked operation-scheduling successor without fresh owner evidence.
- Expected next frontier: the direct-chain workflow-progress successor package.
- Result classification: `reduced`.
- Stop condition: `continue-local-fix`.

## Residual Inventory

Fresh representative artifact:
`test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json`.

Direct workflow-progress witnesses:

1. `control_plane_publications-p1`: `recovering_in_flight`,
   `dispatched_waiting_progress`, `advance_existing_operation`.
2. `replica_operations-p1`: `recovering_in_flight`,
   `persisted_not_dispatched`, `advance_existing_operation`.
3. `sql_transactions-p1`: `recovering_in_flight`,
   `persisted_not_dispatched`, `advance_existing_operation`.

Subordinate serial-wait dependents:

1. `sql_transaction_participants-p1`: `priority_operation_serial_wait`.
2. `sql_write_operations-p1`: `priority_operation_serial_wait`.

Secondary split signal:

1. `control_plane_publications-p1`: `operation_workflow_owner /
   rebalancer_handoff`, `retry_scheduled`, `wait_for_operation_progress`. This
   is not promoted because `workflow_progress` remains the first frontier.

Guardrails:

1. Do not reopen the coordinator-excludes-node residual unless fresh evidence
   restores direct `coordination_mismatch` witnesses.
2. Do not promote the parked `rebalancer_leader / operation_scheduling`
   successor while `control_plane_publications-p1` has workflow-progress
   operation evidence.
3. Do not promote startup active-gate or publication-convergence work while
   `priority_recovery_partition_progress` remains the first frontier.
4. Do not increase harness timeouts or add presentation-only relabeling.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --markdown
4. focused operation_workflow_owner / workflow_progress tests selected by implementation package
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --fast-local --verbose
6. npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json
7. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --explain priority_recovery_partition_progress
8. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --markdown

## Implementation Proof

- Runtime change: none. Focused owner proof shows the
  `operation_workflow_owner / workflow_progress` runtime path already handles
  persisted dispatch-pending direct witnesses through the canonical owner
  advancement and re-entry paths.
- Focused snapshot/owner observation proof:
  `node --test test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
  passed. It proves persisted PENDING and SENDING dispatch witnesses attach the
  canonical owner advancement observation, request
  `advance_existing_operation`, clear stale no-transition blockers, and remain
  `recovering_in_flight`.
- Focused workflow-progress/re-entry proof:
  `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
  passed. It proves timeout and event-driven re-entry re-wakes remote-owned
  priority dispatch-pending rows, re-dispatches locally owned rows, preserves
  bounded handoff retry behavior, and keeps serial-wait PENDING rows on owner
  advancement.

## Residual / Migration Evidence

- Classification:
  `reduced-to-direct-chain-successor`.
- Bounded decision: no local runtime code change was made because the focused
  owner tests already prove dispatch, wake, timeout re-entry, and owner
  advancement for the direct persisted-not-dispatched dispatch-pending shape.
- Representative rerun:
  `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json`
  failed overall (`0/1` passed) but reduced the target residual to a new
  direct workflow-progress chain.
- Successor:
  `work/packages/active-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md`.

## Commit And Push Ledger

1. Focused package commit: `8545fbf5`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
