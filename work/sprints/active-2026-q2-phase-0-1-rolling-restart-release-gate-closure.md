# Phase 0.1 Rolling Restart Release Gate Closure Sprint

Status: active. This sprint is the active release-gate closure track
before `work/sprints/active-2026-q2-spec-led-runtime-modularization.md` was
activated by human direction on May 9, 2026. Its latest closed package and
representative evidence remain predecessor proof for the new sprint.

## Goal

Get to the `0.1` release by closing the representative `rolling-restart`
distributed harness gate, or by migrating each remaining failure to one named
owner-boundary package with replayable proof.

## Current Blocker Snapshot

- Current package:
  [Rolling Restart Startup Readiness Support Evidence Boundary](../packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md)
- Latest artifact:
  `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`
- Latest playback:
  `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof/rolling-restart/`
- Representative gate: `rolling-restart`
- Owner boundary: `startup_readiness_owner / startup_support_evidence`
- Canonical blocker: reduced by the current package. Startup readiness
  no-progress with weak support evidence now carries
  `supportPath=inherited_active_gate_no_progress` and is deferred rather than
  terminal readiness ownership.
- Prior blocker status: operation workflow progress direct-chain proof reduced
  priority recovery to retryable owner work; publication ACK convergence remains
  satisfied with `PUBLISHED` and zero pending ACKs.
- Subordinate evidence: `startup_active_gate_owner / snapshot_coverage` is
  projected downstream after priority progress closes; current causal stop is
  `classified_backpressure` on `operation_workflow_owner / workflow_progress`.
- Next action: parent owner should close the current focused
  startup-readiness support-evidence contraction with commit/push proof, then
  choose the next package from normalized evidence without changing
  operation-workflow or startup active-gate runtime behavior in this package.
- Proof ladder:
  `npm run work:llm-start -- --package work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`,
  `npm run work:package:doctor -- --pre-impl --suggest work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`,
  `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`,
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`,
  `node --test test/diagnostics/topology-convergence-graph.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/causal-graph-builder.test.js`,
  representative rerun or explicit owner-boundary migration.

## Artifact History

The current representative gate is `rolling-restart`. The release-gate artifact
trail is:

1. `test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json`
2. `test-output/reports/rolling-restart-current-release-gate-next.report.json`
3. `test-output/reports/rolling-restart-current-release-gate-after-observed-progress-lane-held.report.json`
4. `test-output/reports/rolling-restart-current-release-gate-after-persisted-not-dispatched.report.json`
5. `test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress.report.json`
6. `test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json`
7. `test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json`
8. `test-output/reports/rolling-restart-current-release-gate-after-remote-handoff-retry-stale-fix.report.json`
9. `test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json`
10. `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix.report.json`
11. `test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`
12. `test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json`
13. `test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json`
14. `test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json`
15. `test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json`
16. `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json`
17. `test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json`
18. `test-output/reports/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix.report.json`
19. `test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json`
20. `test-output/reports/rolling-restart-current-release-gate-after-rebalancer-leader-operation-scheduling-priority-recovery-fix.report.json`
21. `test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-progress-priority-recovery-event-wait-fix.report.json`
22. `test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json`
23. `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json`
24. `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json`
25. `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`

The matching playback is:

1. `test-output/reports/.playback/rolling-restart-current-release-gate-20260508T194848Z/rolling-restart/`
2. `test-output/reports/.playback/rolling-restart-current-release-gate-next/rolling-restart/`
3. `test-output/reports/.playback/rolling-restart-current-release-gate-after-observed-progress-lane-held/rolling-restart/`
4. `test-output/reports/.playback/rolling-restart-current-release-gate-after-persisted-not-dispatched/rolling-restart/`
5. `test-output/reports/.playback/rolling-restart-current-release-gate-after-target-creation-progress/rolling-restart/`
6. `test-output/reports/.playback/rolling-restart-current-release-gate-after-target-creation-progress-rerun/rolling-restart/`
7. `test-output/reports/.playback/rolling-restart-current-release-gate-after-dispatch-skip-retry/rolling-restart/`
8. `test-output/reports/.playback/rolling-restart-current-release-gate-after-remote-handoff-retry-stale-fix/rolling-restart/`
9. `test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix/rolling-restart/`
10. `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix/rolling-restart/`
11. `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix/rolling-restart/`
12. `test-output/reports/.playback/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix/rolling-restart/`
13. `test-output/reports/.playback/rolling-restart-current-release-gate-after-publication-convergence-fix-v2/rolling-restart/`
14. `test-output/reports/.playback/rolling-restart-current-release-gate-after-event-driven-wait-fix/rolling-restart/`
15. `test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-handoff-fix/rolling-restart/`
16. `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix/rolling-restart/`
17. `test-output/reports/.playback/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix/rolling-restart/`
18. `test-output/reports/.playback/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix/rolling-restart/`
19. `test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix/rolling-restart/`
20. `test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-leader-operation-scheduling-priority-recovery-fix/rolling-restart/`
21. `test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-workflow-progress-priority-recovery-event-wait-fix/rolling-restart/`
22. `test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix/rolling-restart/`
23. `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix/rolling-restart/`
24. `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof/rolling-restart/`
25. `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof/rolling-restart/`

## Current Blocker Detail Ledger

Current package:

1. [Rolling Restart Startup Readiness Support Evidence Boundary](../packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md)

Recent completed packages:

1. [Rolling Restart Operation Workflow Progress Direct Chain After Owner Proof](../packages/done-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md)
2. [Rolling Restart Operation Workflow Progress Serial Wait Event Driven Advance](../packages/done-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md)
3. [Rolling Restart Operation Workflow Progress Coordinator Excludes Node](../packages/done-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md)
4. [Rolling Restart Operation Workflow Rebalancer Handoff Needs Operation Coordination Mismatch Classification](../packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md)
5. [Rolling Restart Operation Workflow Rebalancer Handoff Priority Recovery Retry Scheduled](../packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled.md)
6. [Rolling Restart Operation Workflow Progress Priority Recovery Event Wait](../packages/done-20260512-rolling-restart-operation-workflow-progress-priority-recovery-event-wait.md)
7. [Rolling Restart Rebalancer Leader Operation Scheduling Priority Recovery](../packages/done-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery.md)
8. [Rolling Restart Operation Workflow Progress Stage3 Timeout Progression](../packages/done-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md)

Next action:

1. Continue from the active startup-readiness package:
   [Rolling Restart Startup Readiness Support Evidence Boundary](../packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md).
2. Fresh implementation subagent proof is recorded in the package ledger.
3. Focused diagnostics tests reduced the representative startup readiness
   terminal no-progress evidence to
   `readiness_inherited_active_gate_no_progress`.
4. Parent owner should review and close this package with focused commit/push
   proof, then choose the next package from normalized evidence. Do not
   implement `operation_workflow_owner / workflow_progress` or
   `startup_active_gate_owner / snapshot_coverage` runtime behavior from this
   startup-readiness package.
5. Keep the direct-chain workflow-progress package as predecessor proof only; it
   is no longer the active package.
6. Parked split successor, not promoted by the fresh representative report:
   [Rolling Restart Rebalancer Leader Operation Scheduling Control Plane Publications Create Recovery Operation](../packages/todo-20260512-rolling-restart-rebalancer-leader-operation-scheduling-control-plane-publications-create-recovery-operation.md)

Latest representative evidence:

1. Scenario: `rolling-restart`
2. Artifact:
   `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`
3. Report total/passed/failed: `1/0/1`
4. Duration: approximately `132600ms`
5. Active gate: failed; not all nodes active within `120000ms`
6. Priority recovery invariants: passed
7. Publication: `PUBLISHED`
8. Pending acknowledgements: `0`
9. Current frontier: `priority_recovery_partition_progress` under
   `operation_workflow_owner / workflow_progress`, state `retryable`,
   dominant reason `priority_recovery_event_driven_wait`.
10. Residual semantic states: `recovering_in_flight` only.
11. Residual partitions: `control_plane_publications-p1`,
    `replica_operations-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1`.
12. Representative outcome: reduced for startup readiness support evidence.
    Focused owner proof showed weak readiness no-progress is inherited
    active-gate evidence, not a terminal startup-readiness owner blocker.
13. Exact residual shape: one `operation_workflow_owner / workflow_progress`
    group remains retryable, no split required, priority recovery invariants
    passed, and causal stop decision is now `classified_backpressure` with
    reason `priority_recovery_backpressure`.
14. Startup readiness support evidence is reduced. `startup_active_gate_owner /
    snapshot_coverage` remains the projected topology edge after priority
    recovery closes; do not implement startup active-gate behavior inside this
    startup-readiness package.

The publication-convergence package still holds the prior
`topology_publication_owner / publication_convergence` reduction:
`publication_ack_convergence` remains satisfied/non-frontier for the published,
zero-ACK, zero-blocked-node, priority-spread-pending case without canonical
missing-active publication debt.

The workflow-progress priority recovery packages hold the predecessor
reductions: active handoff retries now surface canonical owner outcomes, the
coordinator-excludes-node package clears stale direct `coordination_mismatch`
blockers, and the direct-chain package reduces workflow progress to retryable
event-driven owner work.

Raw distributed-failure presentation for the same latest artifact reports
`publication_missing_active_node`; treat that as presentation evidence while
the canonical topology frontier remains `priority_recovery_partition_progress`
under `operation_workflow_owner / workflow_progress`. Owner-contract evidence
also keeps `publication_ack_convergence` satisfied.

Startup active-gate snapshot coverage is projected after priority recovery.
The current startup-readiness package reduced weak readiness support evidence
to inherited active-gate no-progress; this sprint should not reopen
publication-convergence work while publication ACK convergence remains
satisfied.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Keep `rolling-restart` as the primary representative release gate until it
   passes or migrates to a new named owner boundary.
2. The publication-convergence package is locally closed. Its representative
   rerun reduced `publication_ack_convergence` to satisfied/non-frontier and
   migrated the next focused successor back to `operation_workflow_owner /
   workflow_progress` on `priority_recovery_partition_progress`.
3. Preserve the completed priority recovery owner-path packages as predecessor
   proof, not as the current owner.
4. Keep sustained throughput and 7-node stress confirmation behind the current
   `rolling-restart` gate until this representative path is green.
5. Update tracker truth whenever the representative blocker closes or migrates.

## Out Of Scope

1. Phase `0.5` deployment, CLI, package naming, or service-platform work.
2. Phase `1.0` service manifest, catalog, lifecycle, or platform API work.
3. Pro or Enterprise behavior, operator flows, or control surfaces.
4. Harness timeout increases or presentation-only relabeling.
5. Reopening old rolling-restart residual packages unless a fresh artifact
   restores their owner boundary as the first frontier.

## Execution Order

1. Preserve the contracted workflow-progress startup-replay proof from the
   predecessor rerun.
2. Preserve the target-creation observed-progress proof and regression.
3. Preserve the workflow-progress dispatch-pending fix and representative rerun
   showing `sql_write_operations-p1` as `spread_satisfied_in_flight`.
4. Preserve the workflow-timeout stale-progress fix and representative rerun
   showing `control_plane_publications-p1` moved off `workflow_timeout`.
5. Preserve the serial-wait package rerun showing
   `priority_recovery_partition_progress` reduced to retryable/non-frontier and
   `publication_ack_convergence` became the first frontier.
6. Preserve the publication-convergence package rerun showing
   `publication_ack_convergence` satisfied/non-frontier and the representative
   migrated to retryable operation workflow progress.
7. Preserve the event-driven workflow-progress package rerun showing
    migration to `operation_workflow_owner / rebalancer_handoff`.
8. Preserve the rebalancer-handoff successor rerun showing active handoff retry
   is no longer the first frontier and the representative migrated to
   `operation_workflow_owner / workflow_progress`.
9. Preserve the workflow-progress priority recovery rerun showing the same
   owner boundary remains first frontier, with blocked partitions reduced from
   five to three and next proof at the operation workflow step-timeout contract.
10. Preserve the dispatch-pending step-timeout contract rerun showing focused
   owner probes green but `rolling-restart` same-frontier red on
   `operation_workflow_owner / workflow_progress`, dominant reason
   `priority_recovery_event_driven_wait`, blocked partitions
   `control_plane_publications-p1`, `replica_operations-p1`, and
   `sql_transactions-p1`.
11. Preserve the retry-scheduled rebalancer-handoff proof: focused owner tests
    show retry-scheduled handoff work wakes through canonical dispatch, keeps
    one bounded verification timer, and stops at operation-budget exhaustion.
    The representative remains same-boundary red on broader priority recovery
    progress blocked evidence.
12. Classify the broader residual into one owner fix only if the evidence
    proves one owner owns the whole `needs_operation` /
    `coordination_mismatch` set; otherwise split the next runtime work by
    owner-boundary.
13. Preserve the direct-chain owner proof showing priority recovery is now
    retryable under `operation_workflow_owner / workflow_progress` and the
    causal stop migrated to `startup_readiness_owner /
    startup_support_evidence`.
14. Current implementation work must start from the startup-readiness package,
    prove `readiness_startup_support` with a focused fixture or probe, and use
    `active_gate_snapshot_coverage` only as explanatory/projected evidence until
    the readiness-support boundary reduces or migrates.
15. If `rolling-restart` passes, run sustained throughput and 7-node stress
    confirmation for `0.1`.

## Validation Ladder

1. `npm run work:llm-start -- --package work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`
2. `npm run work:package:doctor -- --suggest work/packages/done-20260512-rolling-restart-startup-readiness-support-evidence-boundary.md`
3. `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`
4. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json --explain readiness_startup_support`
6. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json --explain active_gate_snapshot_coverage`
7. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-direct-chain-owner-proof.report.json`
8. `npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence --markdown`
9. Focused `startup_readiness_owner / startup_support_evidence` fixture or
    owner test before runtime code changes.
10. Representative `rolling-restart --fast-local` rerun or explicit migration
    proof after focused startup-readiness proof.
11. `npm run work:current-blocker`
12. `npm run work:validate -- --pre-impl --all`
13. `git diff --check`
14. Sustained throughput and 7-node stress confirmation after
    `rolling-restart` passes.

## Done When

1. `rolling-restart` passes for the `0.1` release gate or migrates to one new
   named owner boundary with a focused successor package.
2. Priority recovery no longer reports stale priority operations without an
   owner dispatch, progress, retry, or timeout-reconcile path.
3. Publication convergence is either green or reduced to non-frontier before
   any successor operation-workflow package starts.
4. Current-blocker handoff names the latest representative evidence and next
   successor package action.
5. No Phase `0.5`, Phase `1.0`, or paid-edition queue item outranks the active
   `0.1` representative release gate.
