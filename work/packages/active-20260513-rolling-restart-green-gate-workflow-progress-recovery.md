# Rolling Restart Green Gate Workflow Progress Recovery

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-direct-wakeup-transport-contract/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "The reusable direct wake-up transport contract is implemented and focused proof is green. The post-fix rolling-restart artifact is still red, but priorityRecoveryInvariants now pass and the residual is reduced to three target-owned PENDING system-table operations under operation_workflow_owner / workflow_progress with next action advance_existing_operation.",
  "nextAction": "Continue same-frontier workflow-progress work by making target-owned PENDING priority recovery operations deterministically dispatch, retry, reconcile, or migrate through one owner path. Keep the future-sprint release-gate contract reusable; classification-only closure, accepted backpressure, owner migration, or reduced evidence is not a sprint success measure.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "npm test -- test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "node --test test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "node --test test/scripts/priority-recovery-current-artifact-fixture.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js src/control-plane/replica-dispatch-service-segment-1.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js src/control-plane/replica-dispatch-service-segment-1.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js src/control-plane/replica-dispatch-service-segment-1.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-workflow-progress-recovery.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
    "work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-decision.js",
    "src/rebalancer/operation-workflow-owner-effects.js",
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md",
    "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "test-output/reports/.playback/rolling-restart-green-only-baseline-20260513/rolling-restart/",
    "test-output/reports/.playback/rolling-restart-green-only-baseline-20260513/rolling-restart/failure-bundle.json",
    "test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json",
    "test-output/reports/.playback/rolling-restart-green-gate-after-direct-wakeup-transport-contract/rolling-restart/",
    "test-output/reports/.playback/rolling-restart-green-gate-after-direct-wakeup-transport-contract/rolling-restart/failure-bundle.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-decision.js",
    "src/rebalancer/operation-workflow-owner-effects.js",
    "src/control-plane/replica-dispatch-service-segment-1.js"
  ],
  "commitScope": [
    "work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
    "work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-decision.js",
    "src/rebalancer/operation-workflow-owner-effects.js",
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier-until-green",
    "escalationTriggers": [
      "fresh evidence promotes startup_active_gate_owner / snapshot_coverage ahead of operation workflow progress",
      "fresh evidence promotes topology_publication_owner / publication_convergence ahead of operation workflow progress",
      "the fix requires harness timeout changes, Pro behavior, or Enterprise behavior",
      "workflow-progress implementation cannot produce deterministic dispatch, advance, timeout, retry, reconcile, or bounded migration proof"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / workflow_progress owns the fresh priority recovery residual, the coordination_mismatch and recovering_in_flight partitions must dispatch, advance, timeout, retry, reconcile, or migrate through one named owner path until the representative rolling-restart gate passes.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "expectedCausalModelChange": "The current first frontier either converges to representative-green or exposes the next same-scenario owner boundary with fresh evidence; non-green classifications do not close this sprint.",
    "representativeOutcome": "red-but-reduced-after-direct-wakeup-transport-contract",
    "causalDebt": "The post-fix rolling-restart artifact is red with active=3/5, snapshotCoverage=2/5, publication PUBLISHED, pendingAck=0, and priorityRecoveryInvariants passed. Three target-owned system-table REPLACE operations remain PENDING under operation_workflow_owner / workflow_progress: replica_operations-p1, sql_transaction_participants-p1, and sql_transactions-p1.",
    "crossBoundaryReview": "Review subagent Codex (GPT-5) found fixes-required on the predecessor startup-readiness handoff; fix subagent Codex (019e1f7d-e951-7610-b22b-9b0211cbe7a3) repaired sprint and predecessor handoff truth. Implementation subagent Kepler (019e1f85-8605-7ae1-9d73-f59744e47e48) implemented the active workflow-progress package; parent session added the May 13 fixture/burn-down proof surface."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart green-only release gate baseline from May 13, 2026",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "rebalancer handoff",
      "startup active-gate snapshot coverage",
      "startup readiness"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress remains first under operation_workflow_owner / workflow_progress, now retryable priority_recovery_event_driven_wait with three recovering_in_flight PENDING dispatch witnesses.",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage is blocked downstream with activeGate timed out and snapshotCoverage=2/5 until priority recovery progress closes",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending ACKs"
    ],
    "missingCausalEdge": "The workflow-progress owner must advance target-owned PENDING priority recovery operations to dispatch or a bounded retry/reconcile path instead of leaving persisted_not_dispatched evidence through active-gate timeout.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --markdown plus npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --explain priority_recovery_partition_progress",
    "boundedProgressProof": "Implementation must prove deterministic dispatch, advance, timeout, retry, reconcile, or bounded migration for target-owned PENDING workflow-progress priority recovery work before the representative rerun.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json plus focused operation_workflow_owner / workflow_progress and ReplicaDispatchService tests selected by implementation",
    "expectedObservableTransition": "rolling-restart passes, or the same scenario emits a fresh first frontier with concrete owner evidence that remains part of the green-only sprint loop.",
    "maxProgressBound": "one workflow-progress owner cycle plus one representative rolling-restart rerun after focused tests pass",
    "sameFrontierFallback": "keep this operation_workflow_owner / workflow_progress package active, inspect the new report with canonical extractors, and continue local fixes until rolling-restart passes or a different owner is first frontier.",
    "expectedNextFrontier": "representative-green rolling-restart; any non-green successor remains active sprint work, not closure.",
    "resultClassification": "red-but-reduced-after-direct-wakeup-transport-contract",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md"
}
-->

## Why

The sprint exit is a green `rolling-restart` run. The May 13, 2026 baseline is
still red, so the earlier classified closure is invalid for this sprint.

Canonical evidence still puts the first frontier at
`operation_workflow_owner / workflow_progress` for
`priority_recovery_partition_progress`. The direct wake-up transport contract
reduced the blocker, but the same-scenario loop stays open until
`rolling-restart` passes.

## Scope Basis

AGPL rolling-restart release-gate work from `roadmap.md` Phase `0.1 -
Internal Coherence`: topology workflow stabilization, failure simulations, and
production guarantees.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the work targets one representative gate with a
  named owner boundary, fresh artifact, proof ladder, and required sequential
  subagents. Fresh evidence tied the same workflow-progress blocker to the
  reusable control-plane direct wake-up transport contract, so this package may
  harden that contract without adding scenario-only behavior.
- Escalation trigger to a heavier lane: fresh evidence promotes a different
  owner ahead of workflow progress, the fix requires message-router admission
  semantics beyond explicit wake-up metadata, or the scenario remains red after
  the focused owner proof.

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

## Subagent Sequencing Ledger

Review and fix sequencing must be recorded before runtime implementation
starts. The implementation entry is recorded after the fresh implementation
subagent completes this package.

- [x] Review subagent recorded:
      Agent Lorentz (019e1f7b-2910-75f1-ab78-7ddc820d9259) reviewed work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Plato (019e1f7d-e951-7610-b22b-9b0211cbe7a3) fixed work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md
- [x] Implementation subagent recorded:
      Agent Kepler (019e1f85-8605-7ae1-9d73-f59744e47e48) implemented work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md

## In Scope

1. Fresh `rolling-restart` red evidence from
   `test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`.
2. Predecessor startup-readiness package handoff annotation; no runtime work is
   owned by that predecessor package.
3. `operation_workflow_owner / workflow_progress` runtime and focused tests.
4. The reusable `ReplicaDispatchService` direct owner wake-up transport
   contract for priority system-table operation progress.
5. The active sprint tracker and generated current-blocker files.
6. Same-scenario successor blockers found by canonical extractors after each
   representative rerun.

## Out Of Scope

1. Treating classification-only, accepted backpressure, reduced evidence, or
   owner migration as sprint success.
2. Startup active-gate implementation unless fresh evidence promotes it as the
   first frontier.
3. Publication-convergence implementation while publication remains
   `PUBLISHED` with zero pending acknowledgements.
4. Harness timeout increases.
5. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier-until-green`
- Owned files: this package, predecessor package handoff annotation, active
  sprint handoff, generated current-blocker files, `work/model-ledger.jsonl`,
  selected
  `operation_workflow_owner / workflow_progress` runtime files, the
  reusable `ReplicaDispatchService` direct wake-up transport contract, and
  focused tests named in the metadata.
- Forbidden files: startup active-gate implementation, publication-convergence
  implementation, harness timeout increases, Pro behavior, Enterprise
  behavior, and roadmap rows outside AGPL scope.
- Frozen decisions: `rolling-restart` green is the only sprint success
  measure; non-green classifications keep the sprint active.
- Escalation triggers: fresh evidence promotes startup active-gate, publication
  convergence, harness timeout, Pro, or Enterprise behavior; workflow-progress
  proof cannot produce deterministic dispatch, advance, timeout, retry,
  reconcile, or bounded migration; scenario remains red after the focused
  owner proof.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --explain priority_recovery_partition_progress`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`, focused rebalancer tests, `node --test test/control-plane/replica-dispatch-node-state-update.test-part-2.js`, runtime grammar audits, and `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-workflow-progress-recovery.report.json --fast-local --verbose`
- Model ledger advisory: `escalate`

## Causal Governance

- Causal hypothesis: if `operation_workflow_owner / workflow_progress` owns the
  fresh priority-recovery residual, the blocked partitions must dispatch,
  advance, timeout, retry, reconcile, or migrate through one named owner path
  until the representative `rolling-restart` gate passes.
- Stop-condition check: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
- Expected causal model change: the first frontier converges to
  representative-green or exposes the next same-scenario owner boundary with
  fresh evidence; non-green classification does not close the sprint.
- Representative outcome: `pending-before-rerun`
- Representative outcome:
  `red-but-reduced-after-direct-wakeup-transport-contract`.
- Causal debt: the post-fix run is red with `active=3/5`,
  `snapshotCoverage=2/5`, publication `PUBLISHED`, `pendingAck=0`, and
  priority recovery invariants passing. Three target-owned system-table
  `REPLACE` operations remain `PENDING` under
  `operation_workflow_owner / workflow_progress`.
- Cross-boundary review: review found fixes-required on the predecessor
  startup-readiness handoff; fix subagent Codex
  (019e1f7d-e951-7610-b22b-9b0211cbe7a3) repaired sprint and predecessor
  package truth. Implementation subagent Kepler
  (019e1f85-8605-7ae1-9d73-f59744e47e48) implemented the active package, and
  the parent session added a May 13 fixture/burn-down proof surface for the
  same blocker.

## Scenario Causal Closure

- Reference scenario/probe: May 13, 2026 green-only `rolling-restart` baseline.
- Phase chain: publication convergence, priority recovery operation workflow
  progress, rebalancer handoff, startup active-gate snapshot coverage, startup
  readiness.
- Current first frontier: `priority_recovery_partition_progress` is retryable
  under `operation_workflow_owner / workflow_progress` with three
  `recovering_in_flight` `PENDING` dispatch witnesses.
- Known downstream blockers: `startup_active_gate_owner / snapshot_coverage`
  is blocked behind priority spread with active-gate timeout and
  `snapshotCoverage=2/5`; publication ACK convergence is satisfied.
- Missing causal edge: workflow progress must advance target-owned `PENDING`
  priority recovery operations to dispatch or a bounded retry/reconcile path
  instead of leaving `persisted_not_dispatched` evidence through the active
  gate timeout.
- Missing causal edge probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --markdown`
- Bounded progress proof: focused tests plus representative rerun must prove
  deterministic dispatch, advance, timeout, retry, reconcile, or bounded
  migration.
- Bounded progress proof artifact:
  `test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`
- Expected observable transition: `rolling-restart` passes, or fresh evidence
  names the next active same-scenario owner boundary.
- Max progress bound: one workflow-progress owner cycle plus one representative
  rerun after focused tests pass.
- Same-frontier fallback: keep this package active and continue canonical
  evidence-driven fixes until `rolling-restart` passes.
- Expected next frontier: representative-green `rolling-restart`; any non-green
  successor remains active sprint work.
- Result classification:
  `red-but-reduced-after-direct-wakeup-transport-contract`
- Stop condition: `continue-local-fix`

## Validation

1. `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
2. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --markdown`
3. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json --explain priority_recovery_partition_progress`
4. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
5. `npm test -- test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
6. `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`
7. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js`
8. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js`
9. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js`
10. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-workflow-progress-recovery.report.json --fast-local --verbose`
11. `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`
12. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --markdown`
13. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --explain priority_recovery_partition_progress`
14. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`
