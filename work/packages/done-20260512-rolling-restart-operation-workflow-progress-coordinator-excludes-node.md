# Rolling Restart Operation Workflow Progress Coordinator Excludes Node

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-12",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "publication_recovery_eligible_but_coordinator_excludes_node",
  "currentState": "Focused owner proof is green and the fresh representative rerun removed the direct coordination_mismatch / publication_recovery_eligible_but_coordinator_excludes_node witnesses. rolling-restart remains red with priority_recovery_partition_progress under operation_workflow_owner / workflow_progress: control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1 now have recovering_in_flight persisted_not_dispatched advance_existing_operation evidence, while sql_transactions-p1 and sql_write_operations-p1 remain priority_operation_serial_wait dependents.",
  "nextAction": "Close this package as reduced after the focused package commit is pushed, then activate the serial-wait event-driven advance successor before more runtime work. Do not promote startup active-gate or publication-convergence work while priority_recovery_partition_progress remains the first frontier.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --markdown",
    "focused operation_workflow_owner / workflow_progress tests selected by implementation package",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --markdown"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js",
    "work/model-ledger.jsonl",
    "work/packages/done-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md",
    "work/packages/active-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md",
    "work/packages/todo-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md",
    "work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md",
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
    "hypothesis": "If operation_workflow_owner / workflow_progress owns the coordinator-excludes-node residual, publication-recovery-eligible partitions with pending persisted operations should either dispatch or advance through the workflow-progress coordinator instead of remaining coordination_mismatch blockers.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
    "expectedCausalModelChange": "The direct publication_recovery_eligible_but_coordinator_excludes_node witnesses for replica_operations-p1 and sql_transaction_participants-p1 reduce, converge, or migrate to a new named owner boundary; serial-wait dependents remain subordinate unless fresh evidence promotes them.",
    "representativeOutcome": "reduced",
    "causalDebt": "Rolling-restart remains red, but the coordinator-excludes-node witnesses are gone. The remaining debt is the same owner-boundary workflow-progress serial-wait/event-driven advance residual recorded in work/packages/active-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md; startup active-gate and publication convergence remain downstream.",
    "crossBoundaryReview": "completed-before-implementation through Agent Codex (019e1c9d-bb39-7061-b834-d87b3a65f87f) review and Agent Codex (019e1ca5-86e6-76f0-bf27-4168a3aebd67) fix of work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart workflow-progress coordinator-excludes-node priority recovery residual",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation scheduling",
      "operation workflow coordination and progress",
      "startup active-gate presentation"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress remains the topology first frontier under operation_workflow_owner / workflow_progress after the focused fix, but the direct coordinator-excludes-node witnesses reduced to recovering_in_flight persisted_not_dispatched advance_existing_operation evidence plus serial-wait dependents.",
    "knownDownstreamBlockers": [
      "sql_transactions-p1 and sql_write_operations-p1 are priority_operation_serial_wait dependents of the workflow-progress operations",
      "control_plane_publications-p1 now has a recovering_in_flight workflow-progress operation in the fresh representative report",
      "startup_active_gate_owner snapshot coverage remains downstream while priority_recovery_partition_progress is first",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending ACKs"
    ],
    "missingCausalEdge": "The workflow-progress coordinator excludes publication-recovery-eligible nodes even though persisted operations remain pending; the package must prove dispatch, advance, timeout, or a named migration for those pending operations.",
    "missingCausalEdgeProbe": "focused operation_workflow_owner / workflow_progress tests selected by implementation plus npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --explain priority_recovery_partition_progress",
    "boundedProgressProof": "Focused owner proof now normalizes PENDING dispatch-pending coordinator-excludes-node witnesses into canonical operation owner observations, clearing stale coordination_mismatch blockers.",
    "boundedProgressProofArtifact": "test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js plus test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json",
    "expectedObservableTransition": "replica_operations-p1 and sql_transaction_participants-p1 leave coordination_mismatch, dispatch or advance their pending persisted operations, or migrate to a different named owner boundary.",
    "maxProgressBound": "one workflow-progress owner cycle or focused timeout/progress probe for the selected pending operations",
    "sameFrontierFallback": "keep operation_workflow_owner / workflow_progress active and do not promote startup active-gate, publication convergence, or the parked operation-scheduling successor without fresh owner evidence",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress serial-wait event-driven advance residual in work/packages/active-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md",
  "closed": "2026-05-12",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md"
}
-->

## Why

The classification package split the residual. This successor owns the direct
`operation_workflow_owner / workflow_progress` witnesses:
`replica_operations-p1` and `sql_transaction_participants-p1` are
`publication_recovery_eligible_but_coordinator_excludes_node` while operation
workflow has pending persisted operations.

`sql_transactions-p1` and `sql_write_operations-p1` are in scope only as
serial-wait dependents of those workflow-progress operations. They are not a
separate owner package unless fresh evidence makes them direct blockers.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: this package when activated, selected
  `operation_workflow_owner / workflow_progress` runtime and test files named
  by the implementation package, the serial-wait event-driven successor
  package, active sprint handoff, generated current-blocker files, and
  `work/model-ledger.jsonl`.
- Forbidden files and behavior: retry-scheduled handoff runtime code, startup
  active-gate implementation, topology publication convergence
  implementation, harness timeout increases, Pro or Enterprise behavior, and
  the parked rebalancer-leader operation-scheduling successor.
- Frozen decisions: retry-scheduled handoff backpressure is bounded; startup
  active-gate remains downstream; the fresh representative report no longer
  promotes the parked operation-scheduling successor because
  `control_plane_publications-p1` now has workflow-progress operation evidence.
- Escalation triggers: evidence promotes operation scheduling ahead of workflow
  progress, the fix requires out-of-scope behavior, or serial-wait dependents
  become independent direct blockers.
- Focused proof: evidence summary, topology explain, priority-recovery
  residual extraction, focused workflow-progress owner tests, package doctor,
  work validation, and representative rerun or migration proof.

## Subagent Sequencing Ledger

Required sequencing completed before implementation and representative
classification.

- [x] Review subagent recorded:
      Agent Codex (019e1c9d-bb39-7061-b834-d87b3a65f87f) reviewed work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Codex (019e1ca5-86e6-76f0-bf27-4168a3aebd67) fixed work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md
- [x] Implementation subagent recorded:
      Agent Codex (019e1caf-970d-7f62-87c3-19c1641169c8) implemented work/packages/done-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md

## Causal Governance

- Causal hypothesis: if `operation_workflow_owner / workflow_progress` owns
  the coordinator-excludes-node residual, publication-recovery-eligible
  partitions with pending persisted operations should dispatch or advance
  through workflow progress instead of remaining `coordination_mismatch`
  blockers.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json`
- Expected causal-model change: the direct
  `publication_recovery_eligible_but_coordinator_excludes_node` witnesses for
  `replica_operations-p1` and `sql_transaction_participants-p1` reduce,
  converge, or migrate to a new named owner boundary.
- Representative outcome: `reduced`.
- Causal debt: `rolling-restart` remains red, but the
  coordinator-excludes-node witnesses are gone. Remaining work stays under
  `operation_workflow_owner / workflow_progress` as the serial-wait
  event-driven advance successor.
- Cross-boundary review: completed before implementation by the recorded review
  and fix subagents.

## Scenario Causal Closure

- Reference scenario/probe: `rolling-restart` workflow-progress
  coordinator-excludes-node priority recovery residual.
- Phase chain: publication convergence; priority recovery operation
  scheduling; operation workflow coordination and progress; startup active-gate
  presentation.
- Current first frontier: `priority_recovery_partition_progress` remains the
  topology first frontier under `operation_workflow_owner / workflow_progress`,
  but the direct coordinator-excludes-node blockers reduced to in-flight
  workflow-progress operations and serial-wait dependents.
- Known downstream blockers: `sql_transactions-p1` and
  `sql_write_operations-p1` are serial-wait dependents;
  `control_plane_publications-p1` now has in-flight workflow-progress operation
  evidence; startup active-gate snapshot coverage remains downstream;
  publication ACK convergence remains satisfied.
- Missing causal edge: the workflow-progress coordinator excludes
  publication-recovery-eligible nodes even though persisted operations remain
  pending.
- Missing causal edge probe: focused `operation_workflow_owner /
  workflow_progress` tests selected by implementation plus topology explain.
- Bounded progress proof: focused owner proof now normalizes PENDING
  dispatch-pending coordinator-excludes-node witnesses into canonical operation
  owner observations, clearing stale `coordination_mismatch` blockers.
- Bounded progress proof artifact:
  `test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
  plus the fresh representative artifact.
- Expected observable transition: `replica_operations-p1` and
  `sql_transaction_participants-p1` leave `coordination_mismatch`, dispatch or
  advance pending operations, or migrate to a new named owner boundary.
- Max progress bound: one workflow-progress owner cycle or focused
  timeout/progress probe for the selected pending operations.
- Same-frontier fallback: keep `operation_workflow_owner / workflow_progress`
  active and do not promote startup active-gate, publication convergence, or
  the parked operation-scheduling successor without fresh owner evidence.
- Expected next frontier: `operation_workflow_owner / workflow_progress`
  serial-wait event-driven advance residual.
- Result classification: `reduced`.
- Stop condition: `continue-local-fix`.

## Residual Evidence

Source artifact before implementation:

1. `replica_operations-p1`: `coordination_mismatch`,
   `publication_recovery_eligible_but_coordinator_excludes_node`,
   `persisted_not_dispatched`, `operation_workflow_owner / workflow_progress`,
   latest operation `PENDING`.
2. `sql_transaction_participants-p1`: `coordination_mismatch`,
   `publication_recovery_eligible_but_coordinator_excludes_node`,
   `persisted_not_dispatched`, `operation_workflow_owner / workflow_progress`,
   latest operation `PENDING`.
3. `sql_transactions-p1`: `needs_operation`, `priority_operation_serial_wait`,
   `transition_deferred`, `operation_workflow_owner / workflow_progress`,
   serial-wait dependent.
4. `sql_write_operations-p1`: `needs_operation`,
   `priority_operation_serial_wait`, `transition_deferred`,
   `operation_workflow_owner / workflow_progress`, serial-wait dependent.

Fresh representative after implementation:

1. The direct `coordination_mismatch` and
   `publication_recovery_eligible_but_coordinator_excludes_node` witnesses are
   gone.
2. `control_plane_publications-p1`, `replica_operations-p1`, and
   `sql_transaction_participants-p1` are `recovering_in_flight`,
   `persisted_not_dispatched`, `advance_existing_operation` workflow-progress
   witnesses.
3. `sql_transactions-p1` and `sql_write_operations-p1` remain
   `priority_operation_serial_wait` dependents with `transition_deferred` and
   `wait_for_operation_progress`.
4. The next package is
   `work/packages/active-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md`.

## Out Of Scope

1. Reopening `control_plane_publications-p1` operation creation without fresh
   operation-scheduling evidence; the fresh report shows workflow-progress
   operation evidence for that partition.
2. More retry-scheduled handoff runtime code.
3. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.

## Validation

1. Evidence summary:
   `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json`
2. Topology explain:
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --explain priority_recovery_partition_progress`
3. Priority-recovery residual extraction:
   `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --markdown`
4. Focused owner tests selected by implementation.
5. Representative rolling-restart rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --fast-local --verbose`
6. Fresh evidence summary:
   `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json`
7. Fresh topology explain:
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress`
8. Fresh priority-recovery residual extraction:
   `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --markdown`
9. Package doctor, work validation, and `git diff --check`.

## Implementation Proof

- Failing focused test first:
  `node --test test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
  failed before the runtime change for the PENDING coordinator-excludes-node
  fixture: no `operationOwnerObservation`, stale
  `publication_recovery_eligible_but_coordinator_excludes_node`, and progress
  still on `wait_for_operation_progress`.
- Runtime change:
  `src/control-plane/priority-recovery-snapshot-stage-10.js` now treats
  dispatch-pending workflow evidence as owner-observable when progress is
  still `wait_for_operation_progress` or already
  `advance_existing_operation`, while retaining the workflow owner,
  workflow-progress boundary, event-driven wait mode, dispatch-pending phase,
  pending operation status, compatible target state, and
  persisted/dispatch-waiting actuation guards.
- Focused test result:
  `node --test test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
  passed with 49 tests / 10 suites.
- Evidence summary:
  `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json`
  passed. The pre-existing representative artifact remains red at
  `priority_recovery_partition_progress`.
- Topology explain:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --explain priority_recovery_partition_progress`
  passed. The stale artifact still reports the first frontier as
  `operation_workflow_owner / rebalancer_handoff`; parent integration will run
  the representative rerun.
- Priority-recovery residual extraction:
  `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --markdown`
  passed. The stale artifact still contains workflow-progress,
  rebalancer-handoff, and parked operation-scheduling groups.
- Diff hygiene:
  `git diff --check -- src/control-plane/priority-recovery-snapshot-stage-10.js test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
  passed.
- Representative rerun:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --fast-local --verbose`
  failed overall (`0/1` passed), but reduced the focused residual: the
  `coordination_mismatch` and coordinator-excludes-node witnesses are gone.
- Fresh evidence summary:
  `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json`
  passed and kept first frontier at `priority_recovery_partition_progress`
  under `operation_workflow_owner / workflow_progress`.
- Fresh topology explain:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress`
  passed and reported unresolved semantic states `needs_operation` and
  `recovering_in_flight` with all priority partitions under workflow progress.
- Fresh priority-recovery residual extraction:
  `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --markdown`
  passed. It reports one owner-boundary group,
  `operation_workflow_owner / workflow_progress`, with
  `advance_existing_operation` direct witnesses and
  `priority_operation_serial_wait` dependents.

## Residual / Migration Evidence

- Classification: `reduced`.
- Focused blocker closed: direct `coordination_mismatch` /
  `publication_recovery_eligible_but_coordinator_excludes_node` workflow
  progress witnesses.
- Remaining blocker: same owner-boundary
  `operation_workflow_owner / workflow_progress` with event-driven advance and
  serial-wait evidence.
- Successor:
  `work/packages/active-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md`.

## Commit And Push Ledger

1. Focused package commit: `d3e4b9b2`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
