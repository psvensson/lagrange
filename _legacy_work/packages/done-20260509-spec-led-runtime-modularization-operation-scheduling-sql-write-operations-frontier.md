# Spec-Led Runtime Modularization Operation Scheduling SQL Write Operations Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending/rolling-restart/",
  "owner": "rebalancer_leader",
  "boundary": "operation_scheduling",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The workflow progress dispatch-pending package moved the representative proof past operation_workflow_owner / workflow_progress. The fresh representative report now fails first on priority_recovery_partition_progress with rebalancer_leader / operation_scheduling, dominant source priority_recovery_operation_scheduling_event_driven, priorityRecoveryInvariants passed, and sql_write_operations-p1 eligible but without a recovery operation.",
  "nextAction": "Review the just-closed workflow progress dispatch-pending package, fix any findings, then trace why the rebalancer leader leaves sql_write_operations-p1 eligible with no recovery operation after other priority partitions are in flight.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json --explain priority_recovery_partition_progress",
    "Focused rebalancer_leader operation_scheduling fixture from the representative report",
    "Focused operation scheduling tests selected by priority_recovery_operation_scheduling_event_driven",
    "Touched-file static guardrails selected by rebalancer_leader and priority recovery operation scheduling",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/rebalance-coordinator*.js",
    "src/rebalancer/unified-rebalancer*.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-2.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/rebalancer/*operation*.test.js",
    "test/rebalancer/*priority-recovery*.test.js",
    "test/rebalancer/unified-rebalancer-part-5-2-stage-2.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/model-ledger.jsonl",
    "work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-sql-write-operations-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "operation scheduling evidence requires changes outside rebalancer_leader or priority recovery scheduling",
      "focused fixture exposes operation_workflow_owner, rebalancer_handoff, or workflow_timeout again",
      "representative proof still fails on sql_write_operations-p1 eligible_but_no_operation_created after scheduling fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-dispatch-pending-frontier.md",
  "closed": "2026-05-10",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md"
}
-->

## Why

The dispatch-pending package proved workflow-progress re-entry no longer needs
an owner-observation side channel before scheduling owner work. The fresh
representative run now exposes the next leader-owned scheduling gap:
`sql_write_operations-p1` remains eligible for priority recovery but has no
recovery operation.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-dispatch-pending-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the workflow progress dispatch-pending package before implementation
   starts.
2. Freeze the smallest `sql_write_operations-p1` needs-operation scheduling
   witness from the fresh representative report.
3. Trace the rebalancer leader priority recovery operation scheduling evidence
   for eligible partitions with no operation.
4. Rewrite the scheduling path so eligibility, add-budget admission, and
   operation creation resolve through one canonical leader decision.
5. Keep workflow progress, handoff, workflow timeout, and publication ACK
   convergence satisfied.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Operation workflow dispatch-pending re-entry; that is predecessor proof.
2. Rebalancer handoff retry-log summary shadowing; that is predecessor proof.
3. Workflow timeout handling; that is earlier predecessor proof.
4. Active-gate report schema alias deletion.
5. Harness timeout increases, report relabeling, or fallback scheduling
   classification.
6. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `rebalancer_leader / operation_scheduling` for the dominant witness.
2. `priority_recovery_operation_scheduling_event_driven` must come from the
   leader scheduling decision, not diagnostics reconstructing missing operations
   from raw table snapshots.
3. Eligible priority partitions with no operation must flow through one
   canonical scheduling decision table before operation creation.
4. No package-owned change may regress workflow progress, rebalancer handoff,
   workflow timeout, or publication ACK convergence edges.

## Tactical Inspiration

1. Kubernetes Scheduler: separate filter, reserve, and commit intent so a
   single canonical scheduling decision owns operation creation.
2. CockroachDB allocator: make priority recovery add-budget evidence explicit
   before choosing a target.
3. Kubernetes controllers: conditions name the reconcile action rather than
   leaving consumers to infer why no operation exists.
4. SRE diagnostic pipelines: diagnostics select the dominant witness from
   canonical owner output and remain read-only.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: operation scheduling evidence requires changes outside
  `rebalancer_leader` or priority recovery scheduling; focused fixture exposes
  `operation_workflow_owner`, `rebalancer_handoff`, or `workflow_timeout` again;
  representative proof still fails on `sql_write_operations-p1`
  `eligible_but_no_operation_created` after scheduling fix.

## Shared Boundary Contract

Semantic owner: `rebalancer_leader`.

Canonical contract shape / vocabulary: priority recovery progress edge,
operation scheduling boundary, partition id, spread gap, eligible node set,
operation ids, actuation state, next required action, wait mode, and owner
reason `priority_recovery_progress_blocked`.

Allowed consumers: topology convergence analyzer, failure bundle, rebalancer
leader scheduling tests, priority recovery diagnostics, and sprint/package
handoff notes.

Prohibited reinterpretations: do not treat missing operation scheduling as
workflow progress, rebalancer handoff, workflow timeout, publication ACK
convergence, startup snapshot coverage, generic readiness failure, or a harness
timeout. Do not add fallback operation scheduling classification outside the
rebalancer leader.

Primary diagnostics / proof surfaces: scheduling fixture, topology convergence
explain output, focused operation scheduling tests, static guardrails, and
representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `rebalancer_leader`
- Current boundary: `operation_scheduling`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked`,
  `priority_recovery_event_driven_wait`
- Source: `unresolvedSemanticStateIds: needs_operation,operation_stalled,recovering_in_flight`,
  `blockedPartitionIds: control_plane_publications-p1,replica_operations-p1,sql_transaction_participants-p1,sql_transactions-p1,sql_write_operations-p1`,
  `dominantReason: priority_recovery_operation_scheduling_event_driven`,
  `failureClass: priority_recovery_progress_blocked`.
- Representative dominant witness: `sql_write_operations-p1`, semantic state
  `needs_operation`, progress class `eligible_but_no_operation_created`,
  actuation state `action_required`, workflow phase `none`, latest workflow
  step `unavailable`, latest operation status `unavailable`, next required
  action `create_recovery_operation`.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json --explain priority_recovery_partition_progress`

## Subagent Observability Contract

Subagent waits for this package are checkpointed instead of blind long waits.
Each subagent prompt must ask for concrete file paths, current hypothesis,
validation status, and blocker status. The parent session records timeout or
stall outcomes in this package instead of converting missing output into proof.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Avicenna (019e10ad-c8e8-7851-a9af-3a2fe6ea1026) reviewed
      `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-dispatch-pending-frontier.md`;
      result `clean`.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.
- [x] Implementation subagent recorded:
      Agent Pascal (019e10ba-eb99-7f61-8eb3-3402d85bb56a) implemented
      `work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-sql-write-operations-frontier.md`.

## Detection / Analysis Tasks

- [x] Review the workflow progress dispatch-pending package before
      implementation starts.
- [x] Extract the smallest `sql_write_operations-p1` operation scheduling
      fixture from the representative report.
- [x] Trace rebalancer leader add-budget, operation admission, and operation
      creation evidence for eligible priority partitions with no operation.
- [x] Identify any diagnostics, active-gate, or scheduling branch that masks
      canonical operation scheduling owner evidence.

## Implementation Tasks

- [x] Add or update the focused operation scheduling fixture.
- [x] Rewrite the scheduling logic so eligible priority partitions create
      recovery operations through one canonical leader decision path.
- [x] Delete or guard superseded operation scheduling fallback branches.
      No superseded fallback branch was added; the existing missing-evidence
      serial gate behavior remains covered.
- [x] Update diagnostics/harness consumers only where owner vocabulary changes.
      Not needed; no owner vocabulary changed.
- [x] Rerun representative rolling-restart and migrate any fresh frontier.
      Representative proof migrated to `operation_workflow_owner /
      workflow_progress`.

## Implementation Notes

- Frozen witness from
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json`:
  `sql_write_operations-p1`, semantic state `needs_operation`, progress class
  `eligible_but_no_operation_created`, eligible nodes
  `11601fe0-72d6-5853-8590-ec2881853e72` and
  `7493b0ab-a054-5fad-a91b-5e331db29304`, no operation ids, explicit empty
  serial wait ids, next required action `create_recovery_operation`.
- Root scheduling gap: reconstructed priority recovery follow-up decisions from
  planning summary preserved eligibility but did not preserve explicit
  no-serial evidence in the canonical `coordinator` block. The ordinary
  priority serial gate only bypasses in-flight ordinary priority work when the
  move carries explicit empty `serialWaitOperationIds`.
- Focused regression:
  `test/rebalancer/unified-rebalancer-part-5-2-stage-2.js` now reconstructs
  a `sql_write_operations-p1` planning witness with ordinary priority work in
  flight and proves the leader schedules the missing recovery operation through
  the canonical path.
- Production change:
  `src/rebalancer/unified-rebalancer-segment-4-stage-2.js` now preserves
  explicit empty coordinator serial-wait evidence when reconstructing a
  canonical eligible-but-no-operation priority recovery decision.
- Existing missing-evidence behavior remains covered by
  `checkRebalance requires explicit no-serial evidence before bypassing ordinary
  priority serial wait`.
- Takeover validation on 2026-05-10 reviewed the shared candidate patch and
  kept it as-is: reconstructed `needs_operation` planning with no operation
  contexts now carries explicit empty coordinator serial-wait evidence, while
  the existing missing-evidence assertion still blocks behind ordinary priority
  in-flight work.
- Representative rerun wrote
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json`
  and migrated the frontier to `operation_workflow_owner / workflow_progress`:
  dominant witness `sql_transactions-p1`, semantic state `operation_stalled`,
  progress `operation_created_but_no_step_transitions`, actuation
  `persisted_not_dispatched`, next action `advance_existing_operation`.

## Validation Results

- PASS:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json --explain priority_recovery_partition_progress`
- PASS: `node test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
- PASS:
  `node --test test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
- PASS: `node test/rebalancer/priority-recovery-stale-planning-visibility.test.js`
- PASS: `node test/rebalancer/unified-rebalancer-part-5-2-stage-4.js`
- PASS:
  `node scripts/check-guideline-literals.js 'src/rebalancer/unified-rebalancer-segment-4-stage-2.js' 'src/rebalancer/unified-rebalancer-segment-4-stage-3.js'`
- PASS:
  `node scripts/check-guideline-decision-boundaries.js 'src/rebalancer/unified-rebalancer-segment-4-stage-2.js' 'src/rebalancer/unified-rebalancer-segment-4-stage-3.js'`
- PASS:
  `npm run audit:runtime-grammar:file -- 'src/rebalancer/unified-rebalancer-segment-4-stage-2.js' 'src/rebalancer/unified-rebalancer-segment-4-stage-3.js'`
- PASS:
  `git diff --check -- 'src/rebalancer/unified-rebalancer-segment-4-stage-2.js' 'test/rebalancer/unified-rebalancer-part-5-2-stage-2.js'`
- PASS:
  `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-2.js test/rebalancer/unified-rebalancer-part-5-2-stage-2.js work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-sql-write-operations-frontier.md`
- PASS:
  `perl -ne 'print "$ARGV:$.:$_" if /[ \t]$/' 'work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-sql-write-operations-frontier.md'`
- MIGRATED:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --fast-local --verbose`
  moved the representative blocker to `operation_workflow_owner /
  workflow_progress`.
- OUTSIDE PACKAGE FAILURE:
  `node test/rebalancer/unified-rebalancer.test-part-5-2.js` fails in
  `test/rebalancer/unified-rebalancer-part-5-2-stage-5.js` on the default
  start-delay behavior, unrelated to the serial-wait scheduling path.

## Validation

1. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json --explain priority_recovery_partition_progress`
2. Focused rebalancer leader operation scheduling tests selected by
   `priority_recovery_operation_scheduling_event_driven`.
3. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
4. `git diff --check`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --fast-local --verbose`

## Done When

1. Operation scheduling has one leader-owned priority recovery creation path.
2. Focused rebalancer leader scheduling and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.

## Commit And Push Ledger

1. Focused package commit: `66ad7638`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
