# Priority-Recovery Terminal Follow-Up Actuation Consistency Closure

## Why

The runtime-grammar sprint landed a much clearer priority-recovery hierarchy,
but one contradiction remains on the touched pilot slice.

On a terminal prior `REPLACE` with spread still unresolved:

1. the decision contract can correctly require
   `nextRequiredAction = create_recovery_operation`
2. the semantic state can correctly stay `needs_operation`
3. the actuation contract can still report `completed`

That violates the hierarchy rule for the sprint itself:
`actuation` should answer what action exists or must exist,
while `decision` answers the canonical current meaning over that lower layer.

This package closes that contradiction on the shared owner path before more
consumer or harness proof is treated as trustworthy.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Runtime grammar hierarchy and actuation closure sprint](../../../sprints/archived/done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

Predecessor packages:

1. [Priority-recovery actuation contract and owner-path normalization](./done-20260422-priority-recovery-actuation-contract-and-owner-path-normalization.md)
2. [Priority-recovery decision recomposition over the runtime grammar hierarchy](./done-20260422-priority-recovery-decision-recomposition-over-the-runtime-grammar-hierarchy.md)

## In Scope

1. Fix the shared actuation contract so a touched partition cannot require a
   new recovery action while `actuation.state` reports `completed` or
   `no_action_needed`.
2. Make terminal prior-operation follow-up cases resolve through one explicit
   actuation outcome:
   `action_required`,
   `persist_blocked_by_pressure`,
   or `persist_failed_retryable`,
   based on the shared lower-layer evidence.
3. Add focused regressions for:
   terminal follow-up with plain missing work,
   terminal follow-up under pressure,
   and terminal follow-up with scheduled retry.
4. Tighten the shared contract proof so the touched observation path preserves
   the corrected actuation semantics without inventing local compensations.
5. Update the active architecture record if the durable actuation semantics
   need to be stated more explicitly.

## Out Of Scope

1. Broad workflow-owner state-machine redesign beyond the touched terminal
   follow-up seam
2. Harness dominant-reason redesign beyond the explicit follow-on consumer
   package
3. The deferred `node-join-under-load` rerun before the amendment packages are
   complete

## Invariants

1. `PriorityRecoveryDecisionSnapshot` remains the one shared owner-facing
   surface for the pilot slice.
2. A terminal prior operation may remain visible as evidence, but it must not
   become the top-level actuation answer when new work is still required.
3. Pressure and retry semantics must stay subordinate actuation inputs rather
   than report-local annotations.
4. The fix must not reintroduce consumer-local reinterpretation to compensate
   for runtime contradiction.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/control-plane/priority-recovery-observation-snapshot.js`
3. `test/control-plane/priority-recovery-snapshot.test.js`
4. `architecture/current-owner-maps.md`

## Shared Boundary Contract

- Semantic owner:
  `PriorityRecoveryDecisionSnapshot` emitted from
  `src/control-plane/priority-recovery-snapshot.js`
- Canonical contract shape / vocabulary:
  `PriorityRecoveryActuationContract { owner, state, workflowProgressPhaseId, stepAgeMs, stepTimeoutMs, lastProgressAtMs, retryAfterMs, timeoutReconcileDue }`
  with the touched invariant that `completed` and `no_action_needed` are only
  valid when no new recovery action is required on the same snapshot
- Allowed consumers:
  the shared progress contract,
  observation snapshots,
  admin/harness/reporting consumers,
  and focused contract tests
- Prohibited reinterpretations:
  treating the last completed prior operation as the current actuation answer
  when spread remains unresolved,
  or relying on report-local filtering to hide the contradiction
- Primary diagnostics / proof surfaces:
  focused priority-recovery snapshot tests,
  observation-path contract tests,
  and architecture owner-map wording if the durable semantics need tightening

## Detection / Analysis Tasks

- [x] Reproduce the terminal follow-up contradiction directly on the shared
      decision snapshot path.
- [x] Record which lower-layer evidence must dominate terminal prior-operation
      completion when spread is still blocked.
- [x] Confirm whether the active architecture record needs a durable wording
      update for `completed` versus follow-up-required actuation.

## Implementation Tasks

- [x] Add failing tests first for terminal follow-up plain, pressure-blocked,
      and retry-scheduled cases.
- [x] Reorder or reshape the actuation builder so follow-up-required states win
      over terminal prior-operation completion on the touched path.
- [x] Preserve the existing last-progress and workflow-phase evidence without
      leaking contradictory top-level actuation meaning.
- [x] Tighten touched contract assertions so the contradiction cannot regress
      silently.
- [x] Update the architecture record if the durable actuation semantics become
      materially sharper.

## Residual Closure Inventory

- [x] Owner-path actuation and decision semantics are consistent on the touched
      terminal follow-up seam.
- [x] Observation-path consumers preserve the corrected actuation answer
      without local workaround logic.
- [x] Harness/reporting pressure-shaped dominant-reason work is split
      explicitly to
      [Priority-recovery harness progress-summary pressure dominant-reason closure](./done-20260423-priority-recovery-harness-progress-summary-pressure-dominant-reason-closure.md).
- [x] The deferred scenario confirmation remains owned by
      [Runtime-grammar pilot harness confirmation](./done-20260422-runtime-grammar-pilot-harness-confirmation.md).
- [x] Required focused proof is complete before the package is renamed
      `done-...`.

## Execution Notes

1. Reproduced the contradiction directly on
   `buildPriorityRecoveryDecisionSnapshot(...)` for terminal prior-operation
   follow-up cases:
   plain missing work,
   pressure-blocked persistence,
   and retry-scheduled persistence.
2. Reordered the shared actuation builder so
   `eligible_but_no_operation_created`
   follow-up outcomes now dominate terminal prior-operation completion on the
   touched path.
3. Preserved terminal prior-operation evidence through
   `workflowProgressPhaseId` and `lastProgressAtMs` while keeping the top-level
   actuation answer forward-looking.
4. Tightened the active architecture record so `completed` is explicitly
   reserved for snapshots that no longer require a new recovery action.

## Validation

1. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
2. Focused observation-path preservation verified through the same snapshot
   suite on the shared witness contract

## Done When

1. A touched partition cannot require a new recovery action while the shared
   actuation contract reports `completed` or `no_action_needed`.
2. Terminal follow-up plain, pressure-blocked, and retry-scheduled cases are
   covered by focused regressions.
3. Any remaining consumer/reporting ambiguity is split explicitly to the
   harness follow-on package instead of left implicit.
