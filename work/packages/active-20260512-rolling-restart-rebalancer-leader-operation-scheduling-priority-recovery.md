# Rolling Restart Rebalancer Leader Operation Scheduling Priority Recovery

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-12",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix/rolling-restart/",
  "owner": "rebalancer_leader",
  "boundary": "operation_scheduling",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The stage-3 timeout progression package closed as migrated. Fresh rolling-restart evidence names rebalancer_leader / operation_scheduling as the first frontier: priority_recovery_partition_progress is blocked with needs_operation on control_plane_publications-p1, replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1. Publication ACK convergence is satisfied and startup active-gate snapshot coverage remains downstream at 2/5.",
  "nextAction": "Own priority recovery operation creation for needs_operation partitions under rebalancer_leader / operation_scheduling. Preserve publication ACK convergence and keep startup active-gate downstream until priority_recovery_partition_progress reduces, converges, or migrates.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json",
    "npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js",
    "node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-rebalancer-leader-operation-scheduling-priority-recovery-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/rebalancer/unified-rebalancer-core-05-test-cases.js",
    "work/packages/active-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "priority recovery operation creation requires changes outside rebalancer_leader operation scheduling",
      "representative proof restores operation_workflow_owner or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If rebalancer leader operation scheduling creates priority recovery operations for needs_operation partitions, priority_recovery_partition_progress should reduce, converge, or migrate away from rebalancer_leader / operation_scheduling.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json",
    "expectedCausalModelChange": "The needs_operation operation-scheduling frontier either creates recovery work, reduces blocked partitions, migrates to workflow progress, or exposes a new named owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "Rolling-restart remains red, but priority recovery operation scheduling moved from needs_operation to recovering_in_flight; active-gate snapshot coverage remains downstream at 2/5.",
    "crossBoundaryReview": "completed-before-implementation through Agent Locke (019e1bc0-0a4b-7f91-aef1-5da20bad7369) review and Agent Aristotle (019e1bc4-b5d7-7d82-a7b8-52c909e82825) fix of work/packages/done-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart rebalancer leader operation scheduling priority recovery probe",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation scheduling",
      "operation workflow dispatch and retry",
      "startup active-gate presentation"
    ],
    "currentFirstFrontier": "rebalancer_leader / operation_scheduling / priority_recovery_operation_scheduling_event_driven on control_plane_publications-p1, replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner snapshot coverage remains downstream at 2/5",
      "publication_missing_active_node is presentation evidence while publication_ack_convergence remains satisfied"
    ],
    "missingCausalEdge": "rebalancer leader operation scheduling must create or dispatch priority recovery operations for needs_operation partitions before downstream active-gate closure is pursued",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js",
    "boundedProgressProof": "Focused operation scheduling proof must show bounded create, dispatch, persist, or advance behavior for needs_operation priority recovery partitions.",
    "boundedProgressProofArtifact": "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js; test/rebalancer/unified-rebalancer-core-05-test-cases.js; src/rebalancer/unified-rebalancer-segment-5.js",
    "expectedObservableTransition": "needs_operation partitions create recovery operations, reduce blocked partition count, or migrate to operation workflow progress with named evidence.",
    "maxProgressBound": "one rebalancer leader operation-scheduling cycle per blocked priority partition before same-frontier fallback",
    "sameFrontierFallback": "keep rebalancer_leader / operation_scheduling active and do not pursue startup active-gate closure",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress after recovery operations are created, unless operation scheduling remains the same-frontier blocker",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md"
}
-->

## Why

The fresh representative `rolling-restart` rerun migrated away from
`operation_workflow_owner / workflow_progress`. The first frontier is now
priority recovery operation scheduling: five priority partitions need recovery
operations before active-gate work can be meaningful.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `src/rebalancer/unified-rebalancer-segment-5.js`,
  `src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`,
  `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`,
  `test/rebalancer/unified-rebalancer-core-05-test-cases.js`, this package,
  generated current-blocker files, `work/model-ledger.jsonl`, and the active
  sprint file only if current-blocker truth requires it.
- Forbidden files and behavior: startup active-gate implementation, topology
  publication convergence implementation, harness timeout increases, Pro or
  Enterprise behavior, and unrelated workflow owner refactors.
- Frozen decisions: publication ACK convergence is satisfied/non-frontier;
  startup active-gate remains downstream while priority recovery scheduling is
  blocked.
- Escalation triggers: operation creation requires files outside rebalancer
  leader scheduling, representative proof restores an older owner as direct
  blocker, or runtime implementation would need Pro or Enterprise features.
- Focused proof: `npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js`.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Locke (019e1bc0-0a4b-7f91-aef1-5da20bad7369) reviewed
      `work/packages/done-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Aristotle (019e1bc4-b5d7-7d82-a7b8-52c909e82825) fixed
      `work/packages/done-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md`.
- [x] Implementation subagent recorded:
      Agent Faraday (019e1bce-391e-7182-92bf-1a3126d4c18e) implemented
      `work/packages/active-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery.md`.

## In Scope

1. Review the closed stage-3 timeout progression package before activation.
2. Own priority recovery operation creation for `needs_operation` partitions.
3. Add or extend focused tests that prove create, dispatch, persist, or
   advance behavior from the rebalancer leader operation-scheduling path.
4. Rerun selected static guardrails for touched rebalancer files.
5. Rerun one representative `rolling-restart --fast-local` gate or classify the
   unchanged frontier with focused proof.

## Out Of Scope

1. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
2. Operation workflow owner changes unless fresh focused evidence proves the
   successor has migrated back to that owner.
3. Presentation-only relabeling that hides owner-boundary evidence.

## Implementation Notes

- Added a publication-event scheduling decision in
  `src/rebalancer/unified-rebalancer-segment-5.js`. Published
  `control_plane_publications` cache events now wake the priority recovery
  rebalance owner when the current priority partition already has a
  `needs_operation` planning witness requiring recovery operation creation.
- Added a focused regression in
  `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` proving the
  publication event enqueues both rebalance scheduling and membership
  publication reconciliation with `PRIORITY_RECOVERY_PROGRESS`.
- No operation workflow owner implementation, startup active-gate
  implementation, publication convergence implementation, or harness timeout
  changes were made.

## Validation

- Before production edits:
  `node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`
  passed with `0` new literal violations.
- Before production edits:
  `node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`
  passed with `0` violations.
- Before production edits:
  `npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`
  passed with `0` violations.
- The new regression failed before the implementation: publication events did
  not classify priority recovery visibility progress and did not enqueue
  rebalance or publication reconciliation.
- After implementation:
  `npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js`
  passed, with `33` passing assertions and `1` expected empty-file skip for
  `test/rebalancer/unified-rebalancer-core-05-test-cases.js`.
- After implementation:
  `node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`
  passed with `0` new literal violations.
- After implementation:
  `node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`
  passed with `0` violations.
- After implementation:
  `npm run audit:runtime-grammar:file -- src/rebalancer/unified-rebalancer-segment-5.js src/rebalancer/unified-rebalancer-segment-4-stage-shared.js`
  passed with `0` violations.
- Representative command:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-rebalancer-leader-operation-scheduling-priority-recovery-fix.report.json --fast-local --verbose`
  failed overall (`0/1` passed), but migrated the first frontier away from
  `rebalancer_leader / operation_scheduling`.

## Result Classification

- Source artifact:
  `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json`.
- New representative artifact:
  `test-output/reports/rolling-restart-current-release-gate-after-rebalancer-leader-operation-scheduling-priority-recovery-fix.report.json`.
- `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-leader-operation-scheduling-priority-recovery-fix.report.json`
  reports `priority_recovery_partition_progress` as retryable under
  `operation_workflow_owner / workflow_progress`.
- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-leader-operation-scheduling-priority-recovery-fix.report.json --explain priority_recovery_partition_progress`
  reports unresolved semantic state `recovering_in_flight` and reason
  `priority_recovery_event_driven_wait`.
- `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-leader-operation-scheduling-priority-recovery-fix.report.json`
  reports outcome `accept_classified_backpressure`, stop condition
  `classified_backpressure`, and `0` failed invariants.
- Classification: migrated to `operation_workflow_owner / workflow_progress`.
  Startup active-gate snapshot coverage remains downstream and was not pursued
  in this package.
