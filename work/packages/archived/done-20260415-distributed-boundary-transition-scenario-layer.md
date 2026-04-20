# Distributed Boundary-Transition Scenario Layer

## Why

The current validation ladder has a recurring gap:

1. focused unit tests are cheap and deterministic
2. full seven-node harness runs are truthful but expensive
3. the most important failures happen in the missing middle, where a shared
   owner boundary transitions under pressure

That gap slows debugging and encourages over-reliance on long distributed
reruns for questions that should be answerable by a narrower owner-boundary
scenario.

This package exists to add a dedicated scenario-test layer for distributed
owner-state transitions, positioned between local unit tests and full harness
validation.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define a middle validation layer for distributed owner-boundary transitions
   under pressure.
2. Reuse existing harness fixtures and helpers instead of inventing a second
   fake distributed test framework.
3. Add targeted scenarios for boundaries such as:
   - usable spread versus raw spread
   - routed admission versus local usability
   - structured deferred outcome versus timeout-shaped silence
   - dispatch contribution versus nominal admission
4. Update stable testing guidance so these boundary-transition scenarios become
   an explicit preferred validation layer when a failure sits between unit and
   full harness scope.
5. Make active packages name this middle layer when it is the right closure
   surface.

## Out Of Scope

1. Replacing the full distributed harness.
2. Scenario multiplication without a named owner boundary.
3. New synthetic mocks that bypass the real shared owner contracts.
4. Broad integration suites that recreate the cost of the seven-node run
   without the same truthfulness.

## Invariants

1. Boundary-transition scenarios must still consume the real shared owners
   under test.
2. The new layer exists to narrow scope, not to add another unrelated test
   pyramid tier with vague purpose.
3. Each new scenario must name the owner boundary and the expected canonical
   state transitions.
4. Full harness reruns remain required for package closure when the package
   explicitly depends on real distributed validation.

## Hotspots

1. `test/distributed/harness/__tests__/`
2. `test/distributed/scenarios/`
3. `test/distributed/README.local.md`
4. `.kiro/steering/testing-guidelines.md`
5. `work/packages/archived/done-20260417-benchmark-usable-spread-owner-collapse.md`
6. `work/packages/archived/done-20260417-canonical-convergence-diagnostics-emission.md`

## Analysis Tasks

- [x] Confirm the current gap between focused unit tests and full seven-node
  harness reruns is slowing structural debugging.
- [x] Confirm existing harness fixtures are strong enough to support a middle
  layer without inventing a second distributed framework.
- [x] Identify the most important boundary-transition scenarios for the current
  failure family.

## Implementation Tasks

- [x] Define the boundary-transition scenario test pattern and add it to stable
  testing guidance.
- [x] Add the first focused scenarios for usable spread, structured deferred
  outcomes, and dispatch contribution under pressure.
- [x] Reuse existing harness fixtures and helpers to keep the new layer thin.
- [x] Update package validation sections where this middle layer is now the
  correct focused test surface.
- [x] Update local distributed README guidance for running and interpreting the
  new boundary-transition scenarios.

## Progress Notes

1. Validation-ladder enforcement now treats this suite as the default middle
   loop between targeted owner tests and any full `7node` checkpoint rerun.
2. The reusable ladder helper is `scripts/run-distributed-validation-ladder.js`,
   which stops at the first red owner or boundary stage before a checkpoint
   rerun can begin.
3. The new middle-layer suite lives in
   `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`.
4. It exercises real shared owners together at three current hotspot
   boundaries:
   - usable spread versus raw spread
   - authority-establishment deferred outcomes during benchmark table
     preparation
   - dispatch contribution versus slot-stalled pressure
5. Stable testing guidance and the distributed local README now point at this
   layer explicitly before another full seven-node rerun.

## Documentation Decision

1. `.kiro/steering/testing-guidelines.md` should define when to use this layer.
2. `test/distributed/README.local.md` should document how to run the scenarios
   locally.
3. Work packages should reference this layer in their validation sections when
   it is the correct closure boundary.

## Validation

1. Focused new scenario tests under `test/distributed/harness/__tests__/`
2. `node test/distributed/harness/__tests__/report-writer.test.js` when the new
   scenarios feed diagnostics output
3. Unit-only gate for touched tests
4. One seven-node distributed rerun to confirm the middle layer predicts the
   same owner-boundary outcome

## Done When

1. The repository has a documented and reusable boundary-transition scenario
   layer between unit tests and full harness reruns.
2. The current distributed failure family is covered by at least one focused
   middle-layer scenario.
3. New work packages can name this layer explicitly instead of jumping straight
   from local unit tests to full seven-node validation.
