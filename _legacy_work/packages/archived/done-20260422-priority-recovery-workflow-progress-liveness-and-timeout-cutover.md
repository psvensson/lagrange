# Priority-Recovery Workflow-Progress Liveness And Timeout Cutover

## Status

Closed on 2026-04-23 after focused proof and later harness confirmation kept
the new liveness grammar intact while splitting the remaining workflow-owned
defect into a narrower follow-on package.

This package was kept open too long, and its old `active-...` status had begun
to overstate its role in the current critical path:

1. the shared liveness grammar is already landed
2. the latest 2026-04-23 confirmation rerun did not reopen a missing liveness
   vocabulary defect
3. the surviving workflow-owned issue is the narrower state-machine / timeout
   follow-on tracked in
   [Priority-recovery workflow-owner progress state-machine and timeout-reconcile closure](./done-20260422-priority-recovery-workflow-owner-progress-state-machine-and-timeout-reconcile-closure.md)

This package is a closed liveness-grammar slice, not the place for new
workflow-owner execution fixes.

## Why

The latest `node-join-under-load` rerun no longer leaves the remaining
priority-recovery blocker ambiguous. This package landed the shared liveness
grammar needed to describe that boundary without flattening it.

The system can now say:

1. which secondary unresolved witness remains on the workflow-owned path:
   `sql_transactions-p1`
2. which owner currently owns next progress:
   `operation_workflow_owner`
3. which boundary is holding it:
   `workflow_progress`

That was the missing grammar this package needed to land. The current rerun no
longer says the grammar itself is missing; it says the remaining owner defect
is narrower than this package.

The package remains relevant because the landed liveness fields are the reason
the current follow-on can now be scoped precisely:

1. `ReplicaOperationLiveness` already knows operation age and step timeout
2. `OperationWorkflowOwner` already knows when timeout reconciliation must run
3. the shared progress contract now preserves those signals instead of forcing
   consumers back to generic `event_driven` wait labels

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Predecessor package:

1. [Priority-recovery progress handoff contract](./done-20260422-priority-recovery-progress-handoff-contract.md)

## In Scope

1. Extend the existing `PriorityRecoveryProgressContract` with explicit
   workflow-progress liveness evidence reused from the current owner path.
2. Reuse `ReplicaOperationLiveness` and the workflow-owner step-timeout model
   to distinguish:
   still-fresh event-driven wait,
   retry-scheduled wait,
   timeout-reconcile-due wait,
   deferred visibility,
   and truly stalled follow-up gaps.
3. Add one explicit workflow-progress grammar for in-flight priority
   operations:
   workflow progress phase,
   step age,
   step timeout,
   and timeout-reconcile requirement.
4. Thread the new liveness evidence through the canonical
   `PriorityRecoveryObservationSnapshot` witness path so admin and harness
   consumers can preserve it without local reinference.
5. Reuse the live workflow-owner timeout configuration when runtime callers
   build the decision snapshot directly from active operations.

## Out Of Scope

1. A new scheduler, timer owner, or progress subsystem beside the current
   workflow owner and rebalancer
2. Broad rebalancer scheduling redesign beyond the touched liveness contract
3. Changing the scenario convergence window as a substitute for missing
   workflow-progress grammar
4. Another harness rerun before focused proof for this package is green

## Invariants

1. `OperationWorkflowOwner` remains the owner of workflow progression and
   timeout reconciliation.
2. The shared progress contract must reuse existing timeout and stale-operation
   evidence. It must not invent a second timeout model.
3. Event-driven in-flight work and timeout-reconcile-due work must remain
   distinct states.
4. The shared priority-recovery snapshot remains the one public liveness
   surface for touched runtime, admin, and harness consumers.

## Hotspots

1. `src/control-plane/priority-recovery-diagnostics-constants.js`
2. `src/control-plane/priority-recovery-snapshot.js`
3. `src/control-plane/priority-recovery-observation-snapshot.js`
4. `src/rebalancer/replica-operation-liveness.js`
5. `src/rebalancer/operation-workflow-owner-segment-5.js`
6. `test/control-plane/priority-recovery-snapshot.test.js`
7. `test/distributed/harness/__tests__/failure-bundle.test.js`

## Shared Boundary Contract

- Semantic owner:
  `PriorityRecoveryDecisionSnapshot` emitted from
  `src/control-plane/priority-recovery-snapshot.js`, composed with existing
  workflow-owner timeout evidence
- Canonical contract shape / vocabulary:
  `PriorityRecoveryProgressContract { contractState, nextAction, currentOwner, nextRequiredAction, blockingBoundary, waitMode, workflowProgressPhaseId, stepAgeMs, stepTimeoutMs, lastProgressAtMs, retryAfterMs, evidenceSourceIds }`
- Allowed consumers:
  priority-recovery observation snapshots, admin/control-snapshot surfaces,
  harness/reporting consumers, and focused contract tests
- Prohibited reinterpretations:
  treating overdue in-flight workflow steps as generic event-driven waiting,
  consumer-local timeout inference, or report-local remapping of timeout-due
  work back into admission or broad topology labels
- Primary diagnostics / proof surfaces:
  focused priority-recovery snapshot tests,
  observation-snapshot preservation tests,
  and focused harness/failure-bundle consumer tests

## Detection / Analysis Tasks

- [x] Record the blocker migration from broad progress handoff to
      workflow-progress liveness.
- [x] Trace the existing reusable timeout/stale signals on the owner path.
- [x] Identify the shared snapshot seam where those signals are currently lost.

## Implementation Tasks

- [x] Add failing tests first for overdue in-flight workflow progress on the
      shared decision snapshot path.
- [x] Extend the shared progress contract with workflow-progress phase and
      timeout evidence.
- [x] Emit one explicit timeout-reconcile-due state instead of generic
      event-driven waiting when a step has aged past its timeout.
- [x] Reuse workflow-owner step-timeout configuration when runtime callers
      build the shared decision snapshot from active operations.
- [x] Preserve the new liveness fields through
      `PriorityRecoveryObservationSnapshot` and touched harness normalizers.
- [x] Update [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
      in the same work cycle if the contract changes durably.

## Residual Closure Inventory

- [x] Direct owner-path cutover is complete for workflow-progress phase and
      timeout evidence on the shared decision snapshot path.
- [x] Runtime wrappers no longer lose configured step-timeout information when
      composing direct priority-recovery decision snapshots.
- [x] Observation/admin/harness surfaces preserve the new workflow-progress
      liveness fields without local reinference.
- [x] The deferred `node-join-under-load` rerun stays outside this package
      until focused proof is green.
- [x] Any remaining executor/runtime defect is split explicitly if the new
      grammar still points at one narrower owner bug after this package lands.
      Follow-on package:
      [Priority-recovery workflow-owner progress state-machine and timeout-reconcile closure](./done-20260422-priority-recovery-workflow-owner-progress-state-machine-and-timeout-reconcile-closure.md)

## Execution Notes

1. The shared snapshot now preserves one workflow-progress liveness contract
   for fresh event-driven wait versus overdue timeout-reconcile-due wait on
   the existing owner path.
2. Focused proof is green on the shared snapshot, admin control-snapshot, and
   harness/failure-bundle consumer paths.
3. The later 2026-04-23 confirmation rerun kept this grammar intact and
   narrowed the surviving workflow-owned seam to a secondary unresolved
   witness on `sql_transactions-p1`, behind the dominant rebalancer scheduling
   blocker.
4. The remaining runtime bug is explicitly split into the sequenced
   workflow-owner closure package instead of being patched back into this
   grammar package.
5. `npm run test:metrics` remains red at the dirty-worktree level:
   cognitive complexity currently reports `149` violations against the repo
   baseline of `144`.

## Validation

1. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
2. Focused observation/admin/harness witness-consumer tests for the new fields
3. Focused rebalancer runtime tests if the direct runtime wrapper changes
4. `npm run test:metrics`

## Done When

1. The shared progress contract distinguishes fresh event-driven wait from
   timeout-reconcile-due workflow progress.
2. Runtime, admin, and harness consumers can discuss overdue in-flight work
   using one shared workflow-progress liveness grammar.
3. The remaining workflow-owner defect stays explicitly split to the successor
   package instead of being carried here as implicit residual grammar work.
4. The package is closed and any new blocker at this boundary would require a
   new follow-on package instead of reopening this one implicitly.
