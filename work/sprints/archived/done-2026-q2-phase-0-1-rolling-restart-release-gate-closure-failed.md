# Phase 0.1 Rolling Restart Release Gate Closure Sprint

Status: done. Outcome: failed. This sprint was closed on May 13, 2026 because
the representative `rolling-restart` run remained red after the focused SQL
write dispatch retry proof. The sprint's only success measure was a passing
`rolling-restart` run, and that measure was not met.

## Current Result

This sprint failed. Classified closure, accepted backpressure, reduced evidence,
or owner-boundary migration did not satisfy the sprint contract because the
representative `rolling-restart` gate remained red.

Fresh red proof:

1. Latest representative artifact:
   `test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`.
2. Report result: `0/1` passed, `1` failed.
3. Canonical first frontier:
   `operation_workflow_owner / workflow_progress` on
   `priority_recovery_partition_progress`, state `retryable`, dominant reason
   `priority_recovery_event_driven_wait`.
4. Focused dispatch-retry proof passed, but the representative rerun stayed
   same-frontier.
5. Residual shape: retry-deferred / recovering-in-flight
   coordinator-created remote handoff ACK failures across
   `replica_operations-p1`, `sql_transaction_participants-p1`,
   `sql_transactions-p1`, and `sql_write_operations-p1`; the residual
   extractor also reports a `rebalancer_handoff` split group.
6. Publication ACK convergence is not the current first frontier in canonical
   evidence.
7. Projected downstream frontier: active-gate snapshot coverage is not current.
8. Active gate: `active=2/5`, `snapshotCoverage=2/5`, depending on priority
   progress.
9. Startup readiness support remains downstream of active-gate progress, not
   the current owner boundary.

## Goal

Make the representative `rolling-restart` distributed harness scenario pass.
There is no alternate success measure.

## Future-Sprint Applicability Contract

`rolling-restart` is the representative proof gate for this sprint, not a
license to add scenario-only behavior. Every package in this sprint must leave
behind at least one reusable asset for future release-gate sprints:

1. A canonical owner/runtime contract that applies outside `rolling-restart`.
2. A focused fixture or analyzer proof that future sprints can run before a
   full distributed scenario.
3. A package/sprint handoff rule that prevents classified red evidence,
   accepted backpressure, or timeout stretching from being mistaken for
   closure.
4. A reusable architectural simplification, such as one owner-key reconcile
   path, one progress projection, one transport priority contract, or one
   budget chain.

When a package fixes a current `rolling-restart` witness, the package must name
the general invariant it hardens. Scenario-specific constants, harness-only
timeouts, or local special cases do not satisfy this contract unless they are
also expressed as reusable release-gate tooling or documentation.

## Systemic Execution Plan

The recent blocker path is no longer treated as a sequence of unrelated local
failures. It is one convergence chain:

1. `rebalancer_leader / operation_scheduling` exposed missing or stale
   operation creation for priority recovery.
2. `operation_workflow_owner / rebalancer_handoff` exposed retry-scheduled
   remote handoff and bounded verification debt.
3. `operation_workflow_owner / workflow_progress` exposed
   `coordination_mismatch`, `recovering_in_flight`, and
   `advance_existing_operation` evidence.
4. `startup_active_gate_owner / snapshot_coverage` was the prior projected
   frontier after priority recovery cleared, but the latest canonical evidence
   promotes priority recovery back to the current first frontier.
5. `operation_workflow_owner / workflow_progress` stayed current after focused
   SQL write dispatch retry proof, now exposing retry-deferred remote handoff
   ACK failures.
6. Startup readiness support evidence must stay explanatory and must not close
   the sprint while `rolling-restart` is red.

Execution therefore proceeds on the priority-recovery coordinator-created
remote handoff retry/ACK frontier while preserving the SQL write dispatch retry
package as same-frontier predecessor evidence:

1. **Current blocker fixture and burn-down.** Freeze the May 13, 2026 artifact
   into a replayable priority-recovery fixture that records witness count,
   owner-boundary groups, semantic states, next required actions, failed
   invariants, exhausted budgets, and downstream projected frontier. The full
   distributed harness confirms this fixture; it is not the first debugging
   surface.
2. **Operation-progress kernel.** Define one canonical priority-recovery
   operation-progress state model covering `needs_operation`,
   `operation_created`, `handoff_pending`, `handoff_acknowledged`,
   `dispatch_pending`, `step_in_progress`, `retry_scheduled`, `blocked`,
   `completed`, and `terminal_failed`.
3. **Ledger projection.** Make diagnostics and runtime consume one owner-owned
   per-partition projection containing desired recovery action, operation id,
   owner node, coordinator, handoff status, workflow step, semantic state, next
   required action, last transition, next wake deadline, attempt count, budget
   deadline, and blocker reason.
4. **Owner-key reconcile loop.** Make every emitted `nextRequiredAction`
   executable by a deterministic owner-key reconcile path. Events enqueue;
   reconcile advances. At most one reconcile may run for an owner key.
5. **Direct wake-up transport contract.** Any direct owner wake-up that carries
   priority system-table operation progress must declare its target owner,
   delivery source, and transport priority explicitly so all future release
   gates avoid hidden background-queue coupling.
6. **Owner-path cutover.** Collapse competing operation-scheduling,
   workflow-progress, and rebalancer-handoff interpretations into the kernel.
   Transitional wrappers may delegate, but must not add local decision logic.
7. **Active-gate dependency contract.** Make active gate consume explicit
   priority-recovery outcomes such as
   `priority_recovery_blocking_active_gate`,
   `priority_recovery_deferred_bounded`, `priority_recovery_satisfied`, and
   `snapshot_coverage_blocked`.
8. **Budget inheritance.** Derive nested workflow, handoff, active-gate, and
   readiness budgets from the rolling-restart remaining budget so the causal
   model reports one accountable budget chain instead of independent timeout
   cascades.
9. **Green-gate confirmation.** Validate in order: owner fixture, focused
   rebalancer tests, diagnostics/presentation tests, 3-node rolling restart,
   5-node rolling restart, sustained throughput, and 7-node stress.

The first executable proof surface has been created:

1. [Priority Recovery Current Artifact Fixture And Burndown](../../packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md)
2. Fixture:
   `test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json`
3. Test:
   `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`

This first package remains predecessor evidence. The latest artifact promoted
priority recovery back to the first frontier, and the final parked package
preserves the `operation_workflow_owner / workflow_progress` SQL write dispatch
retry proof plus the same-frontier failure evidence.

## Package Queue

1. Parked at failed sprint closure:
   [Priority Recovery SQL Write Dispatch Retry Progress](../../packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md)
2. Todo:
   [Priority Recovery Current Artifact Fixture And Burndown](../../packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md)
3. No next package is active in this failed sprint. A future strategy may create
   coordinator-created remote handoff retry/ACK progress under
   `operation_workflow_owner`, or an active-gate snapshot-coverage successor
   only if fresh canonical evidence first closes priority progress and promotes
   active gate.
4. Then: `Priority Recovery Ledger Projection`.
5. Then: `Priority Recovery Owner-Key Reconcile Loop`.
6. Then: `Control Plane Direct Wake-Up Transport Contract`.
7. Then: `Priority Recovery Owner-Path Cutover`.
8. Then: `Release Gate Active-Gate Dependency Contract`.
9. Then: `Release Gate Budget Inheritance`.
10. Then: `Rolling Restart Green-Gate Confirmation`.

## Closure Snapshot

- Parked package:
  [Priority Recovery SQL Write Dispatch Retry Progress](../../packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md)
- Latest artifact:
  `test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`
- Latest playback: none recorded for the parked package handoff.
- Representative gate: `rolling-restart`
- Owner boundary: `operation_workflow_owner / workflow_progress`
- Canonical blocker: `priority_recovery_partition_progress` is retryable with
  dominant reason `priority_recovery_event_driven_wait`.
- Focused residual: retry-deferred / recovering-in-flight
  coordinator-created remote handoff ACK failures across
  `replica_operations-p1`, `sql_transaction_participants-p1`,
  `sql_transactions-p1`, and `sql_write_operations-p1`.
- Subordinate evidence: active-gate snapshot coverage is downstream/projected
  at `active=2/5` and `snapshotCoverage=2/5`, dependent on priority progress.
- Next action: do not continue the package queue in this sprint. Start a new
  strategy or successor sprint before reactivating priority-recovery remote
  handoff retry/ACK work.
- Proof ladder:
  `npm run work:llm-start`,
  `npm run work:package:doctor -- --suggest work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md`,
  `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`,
  `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown`,
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --explain priority_recovery_partition_progress`,
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`,
  focused control-plane dispatch retry tests,
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --fast-local --verbose`.

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
26. `test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
27. `test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`
28. `test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json`
29. `test-output/reports/rolling-restart-green-gate-after-startup-active-gate-recovery.report.json`
30. `test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json`
31. `test-output/reports/rolling-restart-green-gate-after-active-gate-register-service-timeout.report.json`
32. `test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`

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
26. `test-output/reports/.playback/rolling-restart-green-only-baseline-20260513/rolling-restart/`
27. `test-output/reports/.playback/rolling-restart-green-gate-after-direct-wakeup-transport-contract/rolling-restart/`
28. `test-output/reports/.playback/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness/rolling-restart/`
29. `test-output/reports/.playback/rolling-restart-green-gate-after-startup-active-gate-recovery/rolling-restart/`
30. `test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline/rolling-restart/`

The parked package records no playback path for
`test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`.

## Current Blocker Detail Ledger

Parked package:

1. [Priority Recovery SQL Write Dispatch Retry Progress](../../packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md)

Latest closed package:

1. [Rolling Restart Active Gate Snapshot Coverage After Readiness Support Reduction](../../packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md)

Recent completed packages:

1. [Rolling Restart Operation Workflow Progress Direct Chain After Owner Proof](../../packages/done-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md)
2. [Rolling Restart Operation Workflow Progress Serial Wait Event Driven Advance](../../packages/done-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md)
3. [Rolling Restart Operation Workflow Progress Coordinator Excludes Node](../../packages/done-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md)
4. [Rolling Restart Operation Workflow Rebalancer Handoff Needs Operation Coordination Mismatch Classification](../../packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md)
5. [Rolling Restart Operation Workflow Rebalancer Handoff Priority Recovery Retry Scheduled](../../packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled.md)
6. [Rolling Restart Operation Workflow Progress Priority Recovery Event Wait](../../packages/done-20260512-rolling-restart-operation-workflow-progress-priority-recovery-event-wait.md)
7. [Rolling Restart Rebalancer Leader Operation Scheduling Priority Recovery](../../packages/done-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery.md)
8. [Rolling Restart Operation Workflow Progress Stage3 Timeout Progression](../../packages/done-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md)

Closure action:

1. Preserve all predecessor packages as proof, not as sprint closure.
2. The closed startup-readiness package no longer represents sprint exit
   because the fresh May 13, 2026 `rolling-restart` run is red.
3. Keep the direct-chain workflow-progress package as predecessor proof only.
4. Parked split successor remains parked until fresh first-frontier evidence
   promotes it:
   [Rolling Restart Rebalancer Leader Operation Scheduling Control Plane Publications Create Recovery Operation](../../packages/todo-20260512-rolling-restart-rebalancer-leader-operation-scheduling-control-plane-publications-create-recovery-operation.md)
5. Stop this sprint instead of implementing another same-scenario package in
   the existing queue.

Latest representative evidence:

1. Scenario: `rolling-restart`
2. Artifact:
   `test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`
3. Report total/passed/failed: `1/0/1`
4. Duration: approximately one rolling-restart timeout window.
5. Current frontier: `priority_recovery_partition_progress` under
   `operation_workflow_owner / workflow_progress`, state `retryable`, dominant
   reason `priority_recovery_event_driven_wait`.
6. Focused residual shape: retry-deferred / recovering-in-flight
   coordinator-created remote handoff ACK failures across
   `replica_operations-p1`, `sql_transaction_participants-p1`,
   `sql_transactions-p1`, and `sql_write_operations-p1`.
7. Active gate: downstream/projected; `active=2/5`, `snapshotCoverage=2/5`,
   depending on priority progress.
8. Publication convergence: not the current first frontier in canonical
   evidence.
9. Startup readiness support: downstream of active-gate progress, not the
   current owner boundary.
10. Projected next frontier: `active_gate_snapshot_coverage` only after
    priority recovery progress closes.
11. Representative outcome: red. No non-green classification is a sprint
    success measure.
12. Priority recovery workflow progress is the active first frontier.

The publication-convergence package still holds the prior
`topology_publication_owner / publication_convergence` reduction:
`publication_ack_convergence` remains satisfied/non-frontier for the published,
zero-ACK, zero-blocked-node, priority-spread-pending case without canonical
missing-active publication debt.

The workflow-progress priority recovery packages remain predecessor reductions.
The latest canonical topology keeps priority recovery workflow progress as the
first frontier and moves the next package direction from control-plane dispatch
retry coverage to coordinator-created remote handoff retry/ACK progress.

Raw distributed-failure presentation reports active-node readiness failures.
Treat readiness as downstream until active-gate coverage improves or canonical
extractors promote it. Treat active-gate as downstream until priority recovery
progress closes or canonical extractors promote it.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Keep `rolling-restart` as the primary representative release gate until it
   passes.
2. The publication-convergence package is locally closed. Its representative
   rerun reduced `publication_ack_convergence` to satisfied/non-frontier and
   later workflow-progress proof reduced priority recovery to non-frontier;
   fresh evidence keeps publication non-frontier but promotes priority
   recovery back to the current first frontier.
3. Preserve the completed priority recovery owner-path packages as predecessor
   proof, not as the current owner.
4. Keep sustained throughput and 7-node stress confirmation behind the current
   `rolling-restart` gate until this representative path is green.
5. Update tracker truth after every representative rerun, and keep the sprint
   active until `rolling-restart` is green.

## Out Of Scope

1. Phase `0.5` deployment, CLI, package naming, or service-platform work.
2. Phase `1.0` service manifest, catalog, lifecycle, or platform API work.
3. Pro or Enterprise behavior, operator flows, or control surfaces.
4. Harness timeout increases or presentation-only relabeling.
5. Reopening old rolling-restart residual packages unless a fresh artifact
   restores their owner boundary as the first frontier.
6. Closing the sprint because a blocker is classified, reduced, migrated, or
   accepted as backpressure while `rolling-restart` is red.

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
14. Reopen the sprint from the May 13, 2026 green-only baseline because the
    representative `rolling-restart` run is red; a prior representative
    frontier moved to `startup_active_gate_owner / snapshot_coverage`.
15. Final implementation work proved `readiness_startup_support` with focused
    fixtures and analyzer probes, using `active_gate_snapshot_coverage` only as
    explanatory/projected evidence.
16. Create the May 13 priority-recovery fixture and burn-down proof so the next
    architecture package starts from a replayable owner-decision surface rather
    than another full-harness-only debug loop.
17. Implement the reusable direct wake-up transport contract so system-table
    replica dispatch wake-ups carry explicit target-node critical routing
    metadata for any future release-gate sprint, not only rolling-restart.
18. Preserve the priority-recovery SQL dispatch-deadline proof as migrated
    predecessor evidence.
19. Preserve the active-gate snapshot-coverage package as predecessor evidence
    after the latest representative report promoted priority recovery back to
    `operation_workflow_owner / workflow_progress`.
20. Preserve the priority-recovery SQL write dispatch retry progress package as
    same-frontier evidence after the representative rerun exposed
    coordinator-created remote handoff ACK failures.
21. If `rolling-restart` passes, run sustained throughput and 7-node stress
    confirmation for `0.1`.

## Validation Ladder

1. `npm run work:llm-start`
2. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-priority-recovery-sql-write-dispatch-retry-progress.md`
3. `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`
4. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown`
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --explain priority_recovery_partition_progress`
6. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`
7. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`
8. `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
9. `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown`
10. Focused control-plane dispatch retry validation before the representative
   rerun, including package guardrails.
11. Diagnostics proof:
   `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js`.
12. Final representative green rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --fast-local --verbose`.
   This rerun stayed non-green and is the failed sprint closure artifact.
13. `npm run work:current-blocker`
14. `npm run work:validate -- --pre-impl --all`
15. `git diff --check`
16. Sustained throughput and 7-node stress confirmation after
    `rolling-restart` passes.

## Failed Exit Criteria

1. Not met: `rolling-restart` did not pass for the `0.1` release gate.
2. Not met: priority recovery still reports retry-deferred
   coordinator-created remote handoff ACK progress debt.
3. Partially met: publication convergence is not the current first frontier,
   but downstream active-gate snapshot coverage remains red once priority
   progress is resolved.
4. Met: the closure handoff names the latest representative evidence and parks
   the same-frontier package.
5. Met: no Phase `0.5`, Phase `1.0`, or paid-edition queue item was promoted
   into this sprint.
