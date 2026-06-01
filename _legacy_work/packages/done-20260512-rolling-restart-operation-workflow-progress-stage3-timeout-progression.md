# Rolling Restart Operation Workflow Progress Stage3 Timeout Progression

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-12",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix/rolling-restart/",
  "owner": "rebalancer_leader",
  "boundary": "operation_scheduling",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "Focused stage-3 timeout proof is green without runtime edits. The fresh rolling-restart artifact migrated away from operation_workflow_owner / workflow_progress to rebalancer_leader / operation_scheduling with priority_recovery_progress_blocked evidence. The dominant witness reports needs_operation for control_plane_publications-p1, replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1; active-gate snapshot coverage remains downstream at 2/5.",
  "nextAction": "Activate the successor for rebalancer_leader / operation_scheduling priority recovery operation creation. Do not pursue startup active-gate until priority_recovery_partition_progress reduces, converges, or migrates again.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json",
    "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/done-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md",
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
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json",
    "expectedCausalModelChange": "The stale PENDING timeout frontier either advances through stage-3 timeout progression, becomes classified bounded backpressure with focused proof, or exposes a new named owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "Focused proof covers the named OperationWorkflowOwnerSegment7Stage3.checkTimeouts stale PENDING timeout progression path. Fresh representative evidence now points at rebalancer_leader / operation_scheduling with needs_operation priority recovery operation creation debt for five partitions.",
    "crossBoundaryReview": "completed-before-implementation through Agent Codex (019e1b9d-81cf-7073-a449-64a0cf0a36cf) review of work/packages/done-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart workflow-progress stage-3 timeout progression probe",
    "phaseChain": [
      "publication convergence",
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
    "expectedObservableTransition": "stale PENDING dispatch-pending operations are no longer the representative first frontier; fresh evidence migrates to operation scheduling needs_operation recovery creation.",
    "maxProgressBound": "one stage-3 timer or timeout reconcile cycle per blocked partition before same-frontier fallback",
    "sameFrontierFallback": "keep priority_recovery_partition_progress active and do not pursue startup active-gate closure",
    "expectedNextFrontier": "rebalancer_leader / operation_scheduling priority recovery operation creation",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md",
  "closed": "2026-05-12",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery.md"
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

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Codex (019e1b9d-81cf-7073-a449-64a0cf0a36cf) reviewed
      `work/packages/done-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md`;
      result `clean`.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.
- [x] Implementation subagent recorded:
      Agent Codex (019e1ba4-6a69-71e1-ad9e-bb85cb273dfa) implemented
      `work/packages/done-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md`.

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

The required sequence is complete for this package. Agent Codex
(`019e1b9d-81cf-7073-a449-64a0cf0a36cf`) reviewed the closed dispatch-pending
classification package and found it clean, so the fix role is `not-needed`.
Agent Codex (`019e1ba4-6a69-71e1-ad9e-bb85cb273dfa`) implemented this
package as focused proof plus representative migration evidence.

## Causal Governance

- Causal hypothesis: repairing or classifying stage-3 timeout progression for
  stale `PENDING` dispatch-pending operations reduces or migrates
  `priority_recovery_partition_progress`.
- Stop-condition check:
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json`.
- Expected causal-model change: stage-3 timeout evidence advances, reduces,
  stays same-frontier with bounded proof, or names a new owner boundary.
- Representative outcome: `migrated`.
- Causal debt: focused proof covers the named stage-3 timeout progression path;
  fresh representative evidence points at rebalancer leader operation
  scheduling for `needs_operation` priority recovery creation.
- Cross-boundary review: completed before implementation through the review of
  the closed dispatch-pending classification package.

## Scenario Causal Closure

- Reference scenario/probe: `rolling-restart workflow-progress stage-3 timeout progression probe`
- Phase chain: `publication convergence -> operation workflow dispatch and retry -> startup active-gate presentation`
- Current first frontier: `rebalancer_leader / operation_scheduling /
  priority_recovery_operation_scheduling_event_driven` on
  `control_plane_publications-p1`, `replica_operations-p1`,
  `sql_transaction_participants-p1`, `sql_transactions-p1`, and
  `sql_write_operations-p1`.
- Known downstream blockers: startup active-gate snapshot coverage remains
  downstream at `2/5`; raw publication-missing presentation remains downstream
  while publication ACK convergence is satisfied.
- Missing causal edge: rebalancer leader operation scheduling must create or
  dispatch priority recovery operations for `needs_operation` partitions.
- Missing causal edge probe: `npm test -- test/rebalancer/unified-rebalancer-part-5-2-stage-2.js test/rebalancer/unified-rebalancer-core-05-test-cases.js`
- Bounded progress proof: focused operation scheduling proof must show bounded
  create, dispatch, persist, or advance behavior for `needs_operation` priority
  recovery partitions.
- Bounded progress proof artifact:
  `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`;
  `test/rebalancer/unified-rebalancer-core-05-test-cases.js`;
  `src/rebalancer/unified-rebalancer-segment-5.js`.
- Expected observable transition: stale `PENDING` dispatch-pending operations
  are no longer the representative first frontier; fresh evidence migrates to
  operation scheduling `needs_operation` recovery creation.
- Max progress bound: one stage-3 timer or timeout reconcile cycle per blocked
  partition before same-frontier fallback.
- Same-frontier fallback: keep `priority_recovery_partition_progress`
  active and stop downstream active-gate closure.
- Expected next frontier: `rebalancer_leader / operation_scheduling` priority
  recovery operation creation.
- Result classification: `migrated`
- Stop condition: `migrate-owner-boundary`

## Implementation Result

- Runtime/test edits: none. Focused proof already covers the named stage-3
  timeout progression path, so no bounded runtime change was justified.
- Focused proof: `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
  passed with `75` assertions. Covered stale remote-owned `PENDING` re-wake,
  stale handoff retry replacement during transition grace, locally owned
  `PENDING` redispatch, snapshot re-entry, retry-scheduled handoff re-entry,
  and serial-wait `PENDING` re-entry.
- Static owner guards: literal, decision-boundary, and runtime-grammar checks
  passed for `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`.
- Representative rerun:
  `node test/distributed/run.js --config test/distributed/config/local.json
  --scenario rolling-restart --output
  test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-stage3-timeout-progression-fix.report.json
  --fast-local --verbose`: failed, but migrated the first frontier to
  `rebalancer_leader / operation_scheduling /
  priority_recovery_operation_scheduling_event_driven`.
- Fresh artifact summary: `priority_recovery_partition_progress` is blocked
  with `needs_operation` on `control_plane_publications-p1`,
  `replica_operations-p1`, `sql_transaction_participants-p1`,
  `sql_transactions-p1`, and `sql_write_operations-p1`; active-gate snapshot
  coverage remains downstream at `2/5`; publication ACK convergence remains
  satisfied.
- Causal model: outcome `ask_human`, stop condition `insufficient_evidence`,
  failed invariant `priority_recovery_classified`; this is treated as an owner
  migration because topology explain names the new direct owner boundary.
- Classification: `migrated`.

## Commit And Push Ledger

1. Focused package commit: `8679cb4f`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Model Ledger

A model-ledger row was recorded for this proof-classification package:
`2026-05-12T10:09:13.048Z`, package
`work/packages/active-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md`,
model `gpt-5.3-codex`, task class `proof-classification`, package class
`representative-frontier-closure`, scope shape
`owner-boundary-contraction/current-frontier`, outcome `migrated`, validation
status `focused-green-representative-migrated`, correction loops `0`, review
findings `0`, bailout reason
`migrated-to-rebalancer-leader-operation-scheduling`.
