# Priority-Recovery Actuation Contract And Owner-Path Normalization

## Why

The current pilot slice can now distinguish `intent`, `authority`,
`conditions`, `decision`, and `presentation`, but it still lacks one explicit
actuation layer.

That gap lets:

1. no follow-up action exists
2. action creation was attempted but could not persist
3. action creation is blocked by pressure
4. action was dispatched and awaits observation

collapse too easily into the same blocked outcome family.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Runtime grammar hierarchy and actuation closure sprint](../../sprints/archived/done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

Predecessor package:

1. [Runtime grammar hierarchy contract and priority-recovery inventory](./done-20260422-runtime-grammar-hierarchy-contract-and-priority-recovery-inventory.md)

## In Scope

1. Define one explicit actuation contract on the existing
   workflow/coordinator owner path for the priority-recovery slice.
2. Reuse durable workflow, operation, and repository evidence already owned by
   `RebalanceCoordinator` and `OperationWorkflowOwner`.
3. Distinguish at least:
   `action_required`,
   `persist_in_flight`,
   `persist_blocked_by_pressure`,
   `persist_failed_retryable`,
   `dispatched`,
   `awaiting_observation`,
   `reconcile_due`,
   `completed`,
   `failed_terminal`.
4. Surface that actuation contract into the shared priority-recovery snapshot.

## Out Of Scope

1. Broad consumer/reporting redesign
2. New scheduler or coordinator subsystem
3. Pressure normalization beyond what is needed to shape actuation state

## Invariants

1. `RebalanceCoordinator` and `OperationWorkflowOwner` remain the actuation
   owners on the touched path.
2. The actuation contract must not become a second decision layer.
3. `PriorityRecoveryProgressContract` stays a decision surface, not the owner
   of actuation truth.

## Owner Path Inventory

The current actuation owner path on the pilot slice is:

1. `ControlPlaneReadinessServiceSegment4.buildPriorityRecoveryPlanningProjection(...)`
   provides the normalized planning and authority input.
2. `resolvePriorityRecoveryActiveNodeCohort(...)` in
   `src/control-plane/active-node-projection.js`
   provides the admitted active cohort used by runtime planning.
3. `RebalanceCoordinator` owns follow-up action creation and create-lane
   gating, especially:
   `armCoordinatorCreatedOperationProgress(...)`,
   `ensureCriticalPartitionCreateLaneAvailable(...)`,
   and `ensureEntityAddLikeCreateLaneAvailable(...)`.
4. `OperationWorkflowOwner` owns in-flight progression and timeout reconcile,
   especially:
   `reconcileOperationProgress(...)`,
   `reconcileTimeoutOperation(...)`,
   and the timeout sweep.
5. `replica-operation-liveness.js` already owns step age, timeout, and stale
   classification evidence used by the actuation layer.
6. `priority-recovery-snapshot.js` is the decision-layer consumer that should
   receive one actuation contract instead of reverse-inferring meaning from
   operation contexts alone.

## Hotspots

1. `src/rebalancer/rebalance-coordinator-segment-3.js`
2. `src/rebalancer/operation-workflow-owner-segment-7.js`
3. `src/rebalancer/replica-operation-liveness.js`
4. `src/rebalancer/replica-operation-repository-observation-methods.js`
5. `src/control-plane/priority-recovery-snapshot.js`
6. `test/rebalancer/replace-replica-workflow.test.js`
7. `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
8. `test/control-plane/priority-recovery-snapshot.test.js`

## Detection / Analysis Tasks

- [x] Identify the concrete coordinator/workflow ingress points where
      actuation meaning is currently split.
- [x] Confirm the existing source of step age / timeout evidence.
- [x] Confirm the current decision-layer consumer that should receive the new
      actuation contract.

## Implementation Tasks

- [x] Add one first-class actuation vocabulary on the existing owner path.
- [x] Normalize coordinator create-lane outcomes so the decision layer can
      distinguish absence of work from blocked persistence or deferred
      observation.
- [x] Normalize workflow in-flight and timeout-reconcile outcomes into the
      same actuation contract.
- [x] Thread the actuation contract into
      `priority-recovery-snapshot.js` without widening reporting semantics.

## Execution Notes

1. Started from the completed hierarchy inventory package instead of a fresh
   local survey.
2. Mapped the concrete owner ingress points:
   readiness planning projection,
   admitted active cohort resolution,
   coordinator create-lane / follow-up arming,
   workflow progress and timeout reconcile,
   and durable liveness timing.
3. The implementation target is now explicit:
   add one actuation contract between those existing owner paths and the
   current decision snapshot.
4. Landed the first runtime cut:
   `PriorityRecoveryDecisionSnapshot` now carries an explicit `actuation`
   contract derived from the existing coordinator/workflow path, and focused
   snapshot + harness consumer tests stayed green.
5. Completed the remaining owner-path normalization on the shared snapshot:
   missing follow-up work now separates plain `action_required`,
   `persist_blocked_by_pressure`, and `persist_failed_retryable`,
   while workflow-owned in-flight and timeout-reconcile paths share the same
   actuation contract instead of forcing the decision layer to guess.
6. Reserved actuation variants like `persist_in_flight` and
   `failed_terminal` remain part of the canonical vocabulary, but the pilot
   slice only emits variants backed by current owner evidence. No parallel
   synthetic state was added to force unused variants.

## Validation

1. Focused workflow-owner and coordinator tests
2. Focused snapshot composition tests on the pilot slice
3. `npm run test:metrics`

## Done When

1. The pilot slice has one first-class actuation contract on the owner path.
2. Decision and reporting layers no longer need to guess whether a missing
   operation means no attempt, blocked persistence, or stalled follow-up.
