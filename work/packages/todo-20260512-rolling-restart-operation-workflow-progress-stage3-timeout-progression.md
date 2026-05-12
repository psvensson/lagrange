# Rolling Restart Operation Workflow Progress Stage3 Timeout Progression

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-12",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-dispatch-pending-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-event-driven-dispatch-pending-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "The dispatch-pending classification package closed as same-frontier bounded backpressure with focused owner probes green. The representative rolling-restart artifact remains red at operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait for control_plane_publications-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1. Residual stale PENDING timeout progression maps to OperationWorkflowOwnerSegment7Stage3.checkTimeouts in src/rebalancer/operation-workflow-owner-segment-7-stage-3.js.",
  "nextAction": "Run the required review/fix sequence against work/packages/done-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md, then activate this package and have a fresh implementation subagent own stage-3 timeout progression for stale PENDING dispatch-pending operations.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-dispatch-pending-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-dispatch-pending-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-dispatch-pending-fix.report.json",
    "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/todo-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md",
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
      "stage-3 timeout progression requires changes outside operation_workflow_owner",
      "representative proof restores topology_publication_owner or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If stage-3 timeout progression for stale PENDING dispatch-pending operations is repaired or classified, priority_recovery_partition_progress should reduce, converge, or migrate away from operation_workflow_owner / workflow_progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-dispatch-pending-fix.report.json",
    "expectedCausalModelChange": "The stale PENDING timeout frontier either advances through stage-3 timeout progression, becomes classified bounded backpressure with focused proof, or exposes a new named owner boundary.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Rolling-restart remains red on workflow-progress event-driven dispatch-pending priority recovery for control_plane_publications-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1. The next residual path is OperationWorkflowOwnerSegment7Stage3.checkTimeouts in src/rebalancer/operation-workflow-owner-segment-7-stage-3.js.",
    "crossBoundaryReview": "required-before-implementation through a fresh review of work/packages/done-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart workflow-progress stage-3 timeout progression probe",
    "phaseChain": [
      "publication convergence",
      "operation workflow dispatch and retry",
      "startup active-gate presentation"
    ],
    "currentFirstFrontier": "operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait on control_plane_publications-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner snapshot coverage remains downstream at 3/5",
      "publication_missing_active_node is presentation evidence while publication_ack_convergence remains satisfied"
    ],
    "missingCausalEdge": "stage-3 timeout progression for stale PENDING dispatch-pending workflow operations must be proven before downstream active-gate closure is pursued",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "boundedProgressProof": "Focused timeout progression proof must show stage-3 timer or timeout reconcile advance for stale PENDING dispatch-pending operations.",
    "boundedProgressProofArtifact": "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js; src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "expectedObservableTransition": "stale PENDING dispatch-pending operations either advance through OperationWorkflowOwnerSegment7Stage3.checkTimeouts or remain same-frontier with bounded timeout evidence.",
    "maxProgressBound": "one stage-3 timer or timeout reconcile cycle per blocked partition before same-frontier fallback",
    "sameFrontierFallback": "keep operation_workflow_owner / workflow_progress active and do not pursue startup active-gate closure",
    "expectedNextFrontier": "same operation_workflow_owner / workflow_progress frontier unless the stage-3 timeout proof reduces or migrates the representative artifact",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md"
}
-->

## Why

The latest representative `rolling-restart` artifact no longer points at
`operation_workflow_owner / rebalancer_handoff`, and the dispatch-pending
classification package closed without runtime edits because its owned focused
probes were already green. The remaining stale `PENDING` witness is a narrower
stage-3 timeout progression path in
`OperationWorkflowOwnerSegment7Stage3.checkTimeouts()`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`,
  `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`,
  this package, generated current-blocker files, `work/model-ledger.jsonl`, and
  the active sprint file only if current-blocker truth requires it.
- Forbidden files and behavior: startup active-gate implementation, topology
  publication convergence implementation, harness timeout increases, Pro or
  Enterprise behavior, and unrelated operation workflow owner stages.
- Frozen decisions: preserve the rebalancer-handoff reduction and the
  dispatch-pending same-frontier classification until fresh evidence names a
  different owner boundary.
- Escalation triggers: stage-3 timeout progression needs files outside the
  owned stage-3 boundary, the representative proof restores a downstream owner
  as direct blocker, or runtime implementation would need Pro or Enterprise
  features.
- Focused proof: `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`.

## In Scope

1. Review the closed dispatch-pending classification package before activation.
2. Own stage-3 timeout progression for stale `PENDING` dispatch-pending
   workflow operations.
3. Add or extend focused tests that prove timer, timeout reconcile, and advance
   behavior in the stage-3 owner path.
4. Rerun selected static guardrails for the stage-3 file.
5. Rerun one representative `rolling-restart --fast-local` gate or classify the
   unchanged frontier with focused proof.

## Out Of Scope

1. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
2. Broad operation workflow owner refactors outside stage 3.
3. Presentation-only relabeling that hides owner-boundary evidence.

## Invariants

1. `publication_ack_convergence` remains satisfied/non-frontier for the current
   representative evidence.
2. `operation_workflow_owner / rebalancer_handoff` must not become the first
   normalized frontier again without fresh evidence.
3. Timeout progression must use named constants and the existing owner evidence
   model; do not add inline runtime scalars or independent branch piles.

## Hotspots

1. `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`
2. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
3. `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-dispatch-pending-fix.report.json`

## Sequencing Handoff

This package is intentionally `todo` until the previous package closure is
committed and pushed. Before implementation starts, run a fresh review subagent
against
`work/packages/done-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md`,
run a separate fix subagent if that review finds fixes, then activate this
package and record the real review/fix/implementation agent identities in the
Subagent Sequencing Ledger.

## Causal Governance

- Causal hypothesis: repairing or classifying stage-3 timeout progression for
  stale `PENDING` dispatch-pending operations reduces or migrates
  `priority_recovery_partition_progress`.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-dispatch-pending-fix.report.json`.
- Expected causal-model change: stage-3 timeout evidence advances, reduces,
  stays same-frontier with bounded proof, or names a new owner boundary.
- Representative outcome: `pending-before-rerun`.
- Causal debt: active-gate snapshot coverage remains downstream at `3/5`.
- Cross-boundary review: required before implementation through the review of
  the closed dispatch-pending classification package.

## Scenario Causal Closure

- Reference scenario/probe: `rolling-restart workflow-progress stage-3 timeout progression probe`
- Phase chain: `publication convergence -> operation workflow dispatch and retry -> startup active-gate presentation`
- Current first frontier: `operation_workflow_owner / workflow_progress /
  priority_recovery_event_driven_wait` on `control_plane_publications-p1`,
  `sql_transaction_participants-p1`, `sql_transactions-p1`, and
  `sql_write_operations-p1`.
- Known downstream blockers: startup active-gate snapshot coverage remains
  downstream at `3/5`; raw publication-missing presentation remains downstream
  while publication ACK convergence is satisfied.
- Missing causal edge: stage-3 timeout progression for stale `PENDING`
  dispatch-pending workflow operations.
- Missing causal edge probe: `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Bounded progress proof: focused timer, timeout reconcile, and advance proof
  in `OperationWorkflowOwnerSegment7Stage3.checkTimeouts()`.
- Bounded progress proof artifact:
  `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`;
  `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`.
- Expected observable transition: stale `PENDING` dispatch-pending operations
  advance through stage-3 timeout progression or remain classified as bounded
  same-frontier backpressure with named evidence.
- Max progress bound: one stage-3 timer or timeout reconcile cycle per blocked
  partition before same-frontier fallback.
- Same-frontier fallback: keep `operation_workflow_owner / workflow_progress`
  active and stop downstream active-gate closure.
- Expected next frontier: same owner boundary unless the stage-3 timeout proof
  reduces or migrates the representative artifact.
- Result classification: `pending-before-probe`
- Stop condition: `continue-local-fix`
