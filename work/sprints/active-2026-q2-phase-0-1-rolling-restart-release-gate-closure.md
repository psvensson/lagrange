# Phase 0.1 Rolling Restart Release Gate Closure Sprint

Status: active. This sprint was reopened on May 13, 2026 because the fresh
representative `rolling-restart` run is red. The only sprint success measure is
a passing `rolling-restart` run.

## Current Result

This sprint is not complete. Classified closure, accepted backpressure, reduced
evidence, or owner-boundary migration cannot close it unless the representative
`rolling-restart` gate is green.

Fresh red proof:

1. Latest representative artifact:
   `test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`.
2. Report result: `0/1` passed, `1` failed.
3. Active gate: `active=3/5` before the `120000ms` limit.
4. Publication ACK convergence remains satisfied with `PUBLISHED` and zero
   pending acknowledgements.
5. Priority recovery remains local gate work:
   `priorityRecoveryState=needs_operation` and
   `priorityRecovery=eligible_but_no_operation_created`.
6. Canonical first frontier:
   `operation_workflow_owner / workflow_progress` on
   `priority_recovery_partition_progress`, state `blocked`, dominant reason
   `priority_recovery_progress_blocked`.

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
4. `startup_active_gate_owner / snapshot_coverage` remains downstream and may
   become the true first frontier only after priority recovery progress clears.
5. Startup readiness support evidence must stay explanatory and must not close
   the sprint while `rolling-restart` is red.

Execution therefore proceeds as a vertical priority-recovery convergence
program inside this active sprint:

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

1. [Priority Recovery Current Artifact Fixture And Burndown](../packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md)
2. Fixture:
   `test/scripts/__fixtures__/topology-convergence/rolling-restart-green-only-baseline-priority-recovery.fixture.json`
3. Test:
   `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`

This first package remains a sprint work item until it is either promoted into
the current active package closure proof or activated as its own focused
diagnostics package. The current runtime package still owns the active
`operation_workflow_owner / workflow_progress` fix.

## Package Queue

1. Active:
   [Rolling Restart Green Gate Workflow Progress Recovery](../packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md)
2. Todo:
   [Priority Recovery Current Artifact Fixture And Burndown](../packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md)
3. Next package to create after the current active package resolves or remains
   same-frontier: `Priority Recovery Operation Progress Kernel`.
4. Then: `Priority Recovery Ledger Projection`.
5. Then: `Priority Recovery Owner-Key Reconcile Loop`.
6. Then: `Control Plane Direct Wake-Up Transport Contract`.
7. Then: `Priority Recovery Owner-Path Cutover`.
8. Then: `Release Gate Active-Gate Dependency Contract`.
9. Then: `Release Gate Budget Inheritance`.
10. Then: `Rolling Restart Green-Gate Confirmation`.

## Active Snapshot

- Active package:
  [Rolling Restart Green Gate Workflow Progress Recovery](../packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md)
- Latest artifact:
  `test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`
- Latest playback:
  `test-output/reports/.playback/rolling-restart-green-gate-after-direct-wakeup-transport-contract/rolling-restart/`
- Representative gate: `rolling-restart`
- Owner boundary: `operation_workflow_owner / workflow_progress`
- Canonical blocker: `priority_recovery_partition_progress` is retryable
  under `operation_workflow_owner / workflow_progress`, with three
  target-owned `PENDING` system-table operations still waiting for deterministic
  dispatch progression.
- Subordinate evidence: `startup_active_gate_owner / snapshot_coverage` remains
  downstream until priority recovery progress closes.
- Next action: continue the active workflow-progress package by forcing
  target-owned `PENDING` priority recovery operations through dispatch, retry,
  reconcile, or bounded migration, then rerun `rolling-restart`.
- Proof ladder:
  `npm run work:llm-start -- --package work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`,
  `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`,
  `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --markdown`,
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --explain priority_recovery_partition_progress`,
  `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`,
  focused operation-workflow tests,
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-workflow-progress-recovery.report.json --fast-local --verbose`.

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

## Current Blocker Detail Ledger

Active package:

1. [Rolling Restart Green Gate Workflow Progress Recovery](../packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md)

Latest closed package:

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

Reopen action:

1. Preserve all predecessor packages as proof, not as sprint closure.
2. The closed startup-readiness package no longer represents sprint exit
   because the fresh May 13, 2026 `rolling-restart` run is red.
3. Keep the direct-chain workflow-progress package as predecessor proof only.
4. Parked split successor remains parked until fresh first-frontier evidence
   promotes it:
   [Rolling Restart Rebalancer Leader Operation Scheduling Control Plane Publications Create Recovery Operation](../packages/todo-20260512-rolling-restart-rebalancer-leader-operation-scheduling-control-plane-publications-create-recovery-operation.md)
5. Implement and rerun the active package until `rolling-restart` passes.

Latest representative evidence:

1. Scenario: `rolling-restart`
2. Artifact:
   `test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`
3. Report total/passed/failed: `1/0/1`
4. Duration: approximately `137970ms`
5. Active gate: failed; not all nodes active within `120000ms`
6. Priority recovery invariants: passed after the reusable direct wake-up
   transport contract.
7. Publication: `PUBLISHED`
8. Pending acknowledgements: `0`
9. Current frontier: `priority_recovery_partition_progress` under
   `operation_workflow_owner / workflow_progress`, state `retryable`,
   dominant reason `priority_recovery_event_driven_wait`.
10. Residual semantic states: `recovering_in_flight`.
11. Residual partitions: `replica_operations-p1`,
    `sql_transaction_participants-p1`, and `sql_transactions-p1`.
12. Residual shape: three target-owned system-table `REPLACE` operations are
    persisted as `PENDING` with actuation state `persisted_not_dispatched`,
    target node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and source node
    `7493b0ab-a054-5fad-a91b-5e331db29304`.
13. Representative outcome: red. No non-green classification is a sprint
    success measure.
14. Startup active-gate snapshot coverage remains downstream at
    `snapshotCoverage=2/5` until priority recovery progress closes.

The publication-convergence package still holds the prior
`topology_publication_owner / publication_convergence` reduction:
`publication_ack_convergence` remains satisfied/non-frontier for the published,
zero-ACK, zero-blocked-node, priority-spread-pending case without canonical
missing-active publication debt.

The workflow-progress priority recovery packages remain predecessor reductions,
but the fresh green-only run restores `operation_workflow_owner /
workflow_progress` as the active first frontier with blocked evidence.

Raw distributed-failure presentation still reports active-node readiness
failures, but canonical topology keeps the current blocker at
`priority_recovery_partition_progress` under
`operation_workflow_owner / workflow_progress`. Treat presentation evidence as
downstream until canonical extractors promote it.

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
   migrated the next focused successor back to `operation_workflow_owner /
   workflow_progress` on `priority_recovery_partition_progress`; fresh evidence
   still keeps publication convergence non-frontier.
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
    representative `rolling-restart` run is red and the active first frontier
    is again `operation_workflow_owner / workflow_progress`.
15. Final implementation work proved `readiness_startup_support` with focused
    fixtures and analyzer probes, using `active_gate_snapshot_coverage` only as
    explanatory/projected evidence.
16. Create the May 13 priority-recovery fixture and burn-down proof so the next
    architecture package starts from a replayable owner-decision surface rather
    than another full-harness-only debug loop.
17. Implement the reusable direct wake-up transport contract so system-table
    replica dispatch wake-ups carry explicit target-node critical routing
    metadata for any future release-gate sprint, not only rolling-restart.
18. Continue the same workflow-progress package on the post-fix residual:
    target-owned `PENDING` system-table operations must deterministically
    dispatch, retry, reconcile, or migrate instead of waiting indefinitely on
    event-driven progress.
19. If `rolling-restart` passes, run sustained throughput and 7-node stress
    confirmation for `0.1`.

## Validation Ladder

1. `npm run work:llm-start -- --package work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
2. `npm run work:package:doctor -- --suggest work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
3. `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`
4. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --markdown`
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json --explain priority_recovery_partition_progress`
6. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json`
7. `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
8. Focused `operation_workflow_owner / workflow_progress` validation before
   the representative rerun, including the active package's focused rebalancer
   tests and runtime guardrails.
9. Fixture burn-down proof:
   `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`.
10. Final representative green rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-workflow-progress-recovery.report.json --fast-local --verbose`.
   Any non-green result continues or opens active same-scenario work; it does
   not close this sprint.
11. `npm run work:current-blocker`
12. `npm run work:validate -- --pre-impl --all`
13. `git diff --check`
14. Sustained throughput and 7-node stress confirmation after
    `rolling-restart` passes.

## Done When

1. `rolling-restart` passes for the `0.1` release gate. Migration, reduction,
   classification, or owner-boundary successor evidence may only continue or
   open active sprint work while the representative gate is non-green.
2. Priority recovery no longer reports stale priority operations without an
   owner dispatch, progress, retry, or timeout-reconcile path.
3. Publication convergence is either green or reduced to non-frontier before
   any successor operation-workflow package starts.
4. Current-blocker handoff names the latest representative evidence and next
   successor package action.
5. No Phase `0.5`, Phase `1.0`, or paid-edition queue item outranks the active
   `0.1` representative release gate.
