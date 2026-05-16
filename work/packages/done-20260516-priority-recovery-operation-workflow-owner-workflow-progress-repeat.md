# Priority Recovery operation_workflow_owner workflow_progress Residual Repeat

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "closed": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The package drained the repeated priority_recovery_partition_progress workflow-progress residual. Fresh rolling-restart evidence reports zero priority recovery witnesses, marks priority recovery satisfied, and migrates the first frontier to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
  "nextAction": "Activate the startup_active_gate_owner / snapshot_coverage successor to reduce or split owner_reconcile_pending snapshot coverage without reopening priority recovery.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md",
    "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-ports.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md",
    "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "priority recovery residuals split beyond workflow_progress"
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reduce or split owner_reconcile_pending snapshot coverage."
  },
  "causalGovernance": {
    "hypothesis": "The current representative edge is a priority recovery event-driven workflow-progress residual. Three partitions report spread_satisfied_in_flight and topology operator witnesses at dispatch_pending/planned with next action advance_existing_operation.",
    "stopConditionCheck": "Run the required subagent sequence, npm run analyze:causal-model on fresh evidence, focused priority recovery residual extraction, focused workflow owner tests, static guardrails, and one representative rolling-restart rerun after implementation.",
    "expectedCausalModelChange": "Focused proof drained priority_recovery_event_driven_wait; rolling-restart migrated to the next canonical frontier.",
    "representativeOutcome": "migrated",
    "causalDebt": "Priority recovery has zero residual witnesses and is satisfied. Publication ACK remains satisfied. The current first frontier is active_gate_snapshot_coverage with snapshotCoverageNodeCount=2/5, owner_reconcile_pending, and snapshot_repair_deferred.",
    "crossBoundaryReview": "Publication ACK, timeout budgets, active-gate admission, and priority recovery remain closed for this package. The successor owns only the selected startup_active_gate_owner / snapshot_coverage edge."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after active-gate snapshot timeout handoff fixture",
    "phaseChain": [
      "consume active-gate snapshot fixture migration proof",
      "classify priority_recovery_partition_progress as the current first frontier",
      "run review, fix if required, and implementation subagents before runtime edits",
      "prove or split three spread_satisfied_in_flight workflow-progress witnesses",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied",
      "active_gate_snapshot_coverage is downstream with snapshotCoverageNodeCount=2 and expectedNodeCount=5",
      "selected snapshot observation is repair_deferred with stale replica operations in flight",
      "priority recovery residual extraction reports zero witnesses",
      "active_gate_snapshot_coverage is first frontier with owner_reconcile_pending for node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7"
    ],
    "missingCausalEdge": "Prove whether spread_satisfied_in_flight event-driven waits should advance existing operations for the three priority recovery partitions or split by a narrower workflow-progress cause.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown",
    "boundedProgressProof": "The predecessor active-gate package split the snapshot handoff edge and representative evidence selected priority recovery again. This package owns only the selected operation_workflow_owner / workflow_progress residual and must prove the advance existing operation progress mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "expectedObservableTransition": "Fresh evidence reduced priority recovery witnesses to zero and migrated to the next canonical edge without reopening frozen ACK, budget, or admission edges.",
    "maxProgressBound": "one focused operation_workflow_owner / workflow_progress package slice after required subagent sequencing",
    "sameFrontierFallback": "If priority_recovery_partition_progress remains first frontier, preserve the three partition witnesses and split by exact workflow-progress cause.",
    "expectedNextFrontier": "representative green, reduced workflow-progress residual, or active-gate snapshot coverage after priority recovery drains",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "This priority package is allowed because the immediately preceding active-gate package produced fresh representative evidence selecting priority_recovery_partition_progress again.",
    "handoffInvariant": "Publication ACK, timeout budgets, and active-gate admission remain closed unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
  "successor": "work/packages/active-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The representative rolling-restart rerun after the active-gate snapshot fixture
selected `priority_recovery_partition_progress` again. This package owns the
focused `operation_workflow_owner / workflow_progress` residual with three
`spread_satisfied_in_flight` witnesses.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative edge oscillated back to
  priority recovery after an active-gate fixture package, so this package must
  prove the exact producer/consumer handoff before runtime edits.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  listed workflow-progress files, a frozen decision reopens, or representative
  evidence contradicts the selected owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Meitner (019e31ea-e3c4-7be2-81cd-13922a1da457) reviewed work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Anscombe (019e31ed-f593-7d03-9b69-aad77d9a8280) fixed work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md.
- [x] Implementation subagent recorded: Agent Rawls (019e31f1-62ca-7c62-a1e5-3470c4412beb) implemented work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md
2. work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md
3. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. src/rebalancer/operation-workflow-owner.js
7. src/rebalancer/operation-workflow-owner-segment-7-stage-5.js
8. src/rebalancer/operation-workflow-owner-segment-7-stage-3.js
9. src/rebalancer/operation-workflow-owner-segment-7-stage-2.js
10. src/rebalancer/operation-workflow-owner-ports.js
11. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
12. test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
13. test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
14. work/model-ledger.jsonl

## Out Of Scope

1. publication-ack-convergence
2. representative-timeout-budget
3. active-gate-admission-relaxation
4. active-gate-snapshot-coverage

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md`, `work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-2.js`, `src/rebalancer/operation-workflow-owner-ports.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`, `work/model-ledger.jsonl`
- Forbidden files: `publication-ack-convergence`, `representative-timeout-budget`, `active-gate-admission-relaxation`, `active-gate-snapshot-coverage`
- Frozen decisions: publication ACK, timeout budgets, active-gate admission, and active-gate snapshot coverage stay closed unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, or residuals split beyond workflow_progress.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --explain priority_recovery_partition_progress`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json`
- Model ledger advisory: `escalate`

## Implementation Proof

- Focused runtime fix: `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js` now drains dispatch-pending priority recovery operations for the exact three `spread_satisfied_in_flight` witness partitions: `control_plane_publications-p1`, `replica_operations-p1`, and `sql_transaction_participants-p1`.
- Focused regression: `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` covers all three witness partitions with `PENDING`, `persisted_not_dispatched`, completion `spread_satisfied_in_flight`, and verifies owner drain without remote target-owner wake timers.
- Pre-fix proof: the expanded regression failed for `replica_operations-p1` and `sql_transaction_participants-p1` because the owner did not drain them and armed one retry timer per witness.
- Frozen edges preserved: publication ACK, timeout budgets, active-gate admission, and active-gate snapshot coverage were not changed.
- Representative result: migrated. Fresh rolling-restart evidence reports zero priority recovery witnesses and moves the first frontier to `startup_active_gate_owner / snapshot_coverage`.

## Validation

1. PASS - `npm run work:package:doctor -- --suggest work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md` selected causal-escalation metadata and subagent sequencing requirements.
2. PASS - `npm run work:package:evidence-block -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json`
3. PASS - `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
4. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --explain priority_recovery_partition_progress`
5. PASS - `npm run work:validate -- --entry work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md`
6. PASS - `npm run work:validate -- --pre-impl work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md`
7. EXPECTED FAIL BEFORE FIX - `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` failed 49/53 after adding the three-witness regression; the missing drains were `replica_operations-p1` and `sql_transaction_participants-p1`.
8. PASS - `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js` passed 53/53.
9. PASS - `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js` passed 218/218.
10. PASS - `npm test -- test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js` passed 68/68.
11. PASS - `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/operation-workflow-owner-ports.js`
12. PASS - `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/operation-workflow-owner-ports.js`
13. PASS - `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/operation-workflow-owner-ports.js`
14. RED/MIGRATED - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --verbose`; priority recovery drained to zero witnesses and the first frontier migrated to `active_gate_snapshot_coverage`.
15. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json`
16. PASS - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --markdown` reported zero witnesses.
17. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json`
18. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json`
19. PASS - `npm run work:model-ledger -- record --package work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason next-frontier-startup-active-gate-snapshot-coverage --outcome migrated --validation-status focused-green-representative-migrated --correction-loops 1 --review-findings 2 --notes "Repeated priority workflow-progress residual drained to zero witnesses; representative migrated to active_gate_snapshot_coverage with owner_reconcile_pending snapshot coverage 2/5."`

## Commit And Push Ledger

1. Focused package commit: fa1b3b83
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Split commit note: fa1b3b83 contains the runtime fix, focused regression,
   migrated package state, successor activation, sprint handoff, current-blocker
   regeneration, and model-ledger record. This follow-up records the durable
   commit-and-push ledger for closure validation.
