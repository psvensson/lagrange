# Priority-Recovery Harness Progress-Summary Pressure Dominant-Reason Closure

## Why

Once the shared actuation contract stops contradicting the decision layer,
the harness still needs to summarize that contract without flattening
pressure-shaped persistence states back into a generic stalled reason.

Today the retained progress summary can still:

1. pick a dominant witness from `waitMode` and `contractState` only
2. derive a dominant reason from `blockingBoundary` plus `waitMode`
3. hide the distinction between plain missing work,
   pressure-blocked persistence,
   and retry-scheduled persistence

That weakens the whole runtime-grammar amendment because the harness can still
erase canonical actuation meaning exactly where operators need it most.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Production guarantees`

Sprint umbrella:

1. [Runtime grammar hierarchy and actuation closure sprint](../../../sprints/archived/done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

Sequencing dependency:

1. [Priority-recovery terminal follow-up actuation consistency closure](./done-20260423-priority-recovery-terminal-followup-actuation-consistency-closure.md)

## In Scope

1. Make retained priority-recovery progress summaries actuation-aware where the
   actuation state materially changes the blocker story.
2. Tighten dominant-witness selection so pressure-shaped or retry-shaped
   scheduling blockers are not lost behind a generic stalled tie-break.
3. Tighten dominant-reason generation so the harness can distinguish plain
   scheduling blockage from pressure-blocked or retry-scheduled persistence on
   the shared contract.
4. Add focused harness/report-writer/failure-bundle regressions for the new
   pressure-shaped cases.
5. Keep the existing shared priority-recovery witness vocabulary; do not invent
   a reporting-only grammar.

## Out Of Scope

1. New runtime scheduling behavior beyond consuming the corrected shared
   contract
2. Broad report layout redesign
3. The deferred `node-join-under-load` rerun before this consumer fix is green

## Invariants

1. Harness and reporting surfaces may summarize the shared contract, but they
   must not replace it with a weaker local interpretation.
2. Pressure-blocked and retry-scheduled persistence must stay distinguishable
   from plain action-required scheduling on the touched path.
3. Existing non-pressure dominant-reason tests must remain stable unless the
   shared contract itself changed.

## Hotspots

1. `test/distributed/harness/priority-recovery-summary-normalization.js`
2. `test/distributed/harness/failure-bundle-segment-1.js`
3. `test/distributed/harness/failure-bundle-segment-5.js`
4. `test/distributed/harness/__tests__/failure-bundle.test.js`

## Shared Boundary Contract

- Semantic owner:
  harness/reporting consumers of the shared priority-recovery witness contract
- Canonical contract shape / vocabulary:
  `PriorityRecoveryProgressSummary { dominantWitness, actuationStateCounts, currentOwnerCounts, blockingBoundaryCounts, waitModeCounts, nextRequiredActionCounts, progressContractStateCounts, pressureStateCounts }`
  derived from the canonical partition witnesses
- Allowed consumers:
  failure bundles,
  triage summaries,
  report-writer summaries,
  and focused harness tests
- Prohibited reinterpretations:
  flattening `persist_blocked_by_pressure` or `persist_failed_retryable` back
  into an undifferentiated stalled scheduling reason,
  or selecting a weaker dominant witness when a more specific actuation answer
  is already present
- Primary diagnostics / proof surfaces:
  focused report-writer and failure-bundle tests plus the deferred scenario
  confirmation package

## Detection / Analysis Tasks

- [x] Reproduce the retained harness summary shapes for plain, pressure-blocked,
      and retry-scheduled scheduling blockers.
- [x] Record where dominant-witness precedence still ignores actuation-specific
      meaning.
- [x] Record which dominant-reason shapes should stay stable versus which
      should become more specific.

## Implementation Tasks

- [x] Add failing harness/report tests first for pressure-blocked and
      retry-scheduled scheduling blockers.
- [x] Make dominant-witness selection actuation-aware on the touched path.
- [x] Make dominant-reason generation consume the shared actuation state when
      it materially sharpens the blocker meaning.
- [x] Preserve existing generic stalled reasons where the actuation state does
      not add real new information.

## Residual Closure Inventory

- [x] Harness/report dominant-reason output matches the shared actuation
      contract on the touched path.
- [x] Dominant-witness selection no longer hides pressure-shaped scheduling
      blockers behind weaker tie-breaks.
- [x] The deferred `node-join-under-load` confirmation remains explicitly owned
      by
      [Runtime-grammar pilot harness confirmation](./done-20260422-runtime-grammar-pilot-harness-confirmation.md).
- [x] Required focused proof is complete before the package is renamed
      `done-...`.

## Execution Notes

1. Added pressure-shaped and retry-shaped failure-bundle/report-writer
   regressions so the retained harness summaries now prove the shared
   actuation contract instead of flattening it.
2. Tightened dominant-reason generation to prefer actuation states such as
   `persist_blocked_by_pressure` and `persist_failed_retryable` when they
   materially sharpen the blocker story.
3. Added one actuation-aware dominant-witness tie-break so same-rank retained
   witnesses no longer fall back to timestamps before considering the more
   specific actuation answer.
4. Kept existing generic stalled-reason behavior unchanged where the actuation
   state does not add real new information.

## Validation

1. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`
2. `npx tap test/distributed/harness/__tests__/node-join-under-load-scenario.test.js`
3. Focused report-writer/failure-bundle regressions inside the same harness
   suite

## Done When

1. Pressure-blocked and retry-scheduled scheduling blockers remain visible in
   the harness dominant reason when the shared actuation contract says they are
   materially different from plain stalled work.
2. The next deferred `node-join-under-load` rerun can confirm a narrowed
   runtime or workflow-owner defect instead of another consumer-side grammar
   flattening.
