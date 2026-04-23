# Priority-Recovery Workflow-Owner Progress State-Machine And Timeout-Reconcile Closure

## Why

The workflow-progress grammar package makes the remaining workflow-owner seam
explicit without fixing it locally inside reporting or snapshot code.

After the 2026-04-23 runtime-grammar confirmation rerun, this seam is no
longer the dominant blocker, but it is still the next unresolved
workflow-owned witness:

1. `sql_transactions-p1`
2. current owner `operation_workflow_owner`
3. boundary `workflow_progress`
4. wait mode `event_driven`
5. latest visible step `CREATING`

That means this package is now sequenced behind the rebalancer-leader
operation-scheduling pressure package. Its scope is still the workflow-owner
state machine and timeout-reconcile path on the existing owner surface once
the dominant scheduling blocker is reduced.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Predecessor package:

1. [Priority-recovery workflow-progress liveness and timeout cutover](./done-20260422-priority-recovery-workflow-progress-liveness-and-timeout-cutover.md)

## In Scope

1. Reuse the existing workflow-owner and `ReplicaOperationLiveness` path to
   make one explicit owner-state model for priority-recovery operations from
   `created` through `creating`, `syncing`, `stopping`, `completed`,
   `timeout_reconcile_due`, and `stalled`.
2. Define the owner-side handoff / reconcile rules that answer:
   which event advances the step,
   when the owner must retry or reconcile,
   and when event-driven waiting becomes a bounded timeout or a true stall.
3. Eliminate touched local ambiguity where workflow-owned `CREATING` work can
   remain described as generic event-driven waiting without a mandatory
   reconcile or retry outcome.
4. Add focused owner-path tests before another harness rerun.

## Out Of Scope

1. A new scheduler or workflow subsystem beside `OperationWorkflowOwner`
2. Broad publication, readiness, or admission redesign
3. Harness confirmation reruns before focused owner-path proof is green

## Hotspots

1. `src/rebalancer/operation-workflow-owner-segment-5.js`
2. `src/rebalancer/operation-workflow-owner-segment-7.js`
3. `src/rebalancer/replica-operation-liveness.js`
4. `src/control-plane/priority-recovery-snapshot.js`
5. `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
6. `test/control-plane/priority-recovery-snapshot.test.js`

## Shared Boundary Contract

- Semantic owner:
  `OperationWorkflowOwner` with the shared
  `PriorityRecoveryProgressContract` as the read-facing projection
- Canonical owner question:
  for a workflow-owned priority-recovery operation,
  what exact event or timeout advances the current step,
  and when must the owner reconcile instead of waiting
- Prohibited reinterpretations:
  consumer-local stall inference,
  scheduler-local timeout grammar detached from the owner,
  or converting overdue owner work back into broad topology/admission labels

## Closure Note

Closure keeps timeout and reconcile semantics on the canonical workflow-owner
lane: deferred retryable transition failures now reuse the last owner snapshot
while authoritative visibility is still deferred, and the retry lane clears its
stale-grace extension once it can no longer recover the operation. The shared
priority-recovery snapshot therefore observes one owner-emitted
timeout-reconcile outcome instead of reconstructing it from stale cache timing.

## Detection / Analysis Tasks

- [x] Record the current owner-state transitions and timeout sources for the
      workflow steps that appear on the priority-recovery path.
- [x] Write one explicit handoff table from operation creation through timeout
      reconcile and terminal follow-up.
- [x] Identify where generic event-driven waiting still leaks through instead
      of one owner-mandated retry/reconcile/stalled outcome.

## Implementation Tasks

- [x] Add failing owner-path tests first for overdue `CREATING`/`SYNCING`
      priority-recovery work.
- [x] Normalize one explicit owner-side workflow-progress state model on the
      touched path.
- [x] Ensure timeout-reconcile-due and stalled outcomes are emitted from the
      owner path, not reconstructed only in reporting.
- [x] Reuse that owner result in the shared
      `PriorityRecoveryProgressContract`.
- [x] Update touched docs if the owner-state grammar changes durably.

## Validation

1. Focused rebalancer / workflow-owner tests on the timeout and reconcile path
2. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
3. Any touched admin/harness consumer tests needed to preserve the shared
   owner-facing vocabulary
4. `npm run test:metrics`

## Done When

1. Workflow-owned priority-recovery operations no longer rely on a generic
   event-driven label when the owner already owes a timeout reconcile or stall
   decision.
2. The next harness rerun, when executed, tests a real narrowed owner defect
   instead of another missing state-machine edge in the grammar.
