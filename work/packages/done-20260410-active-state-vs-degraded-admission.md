# Active State vs Degraded Admission Hardening

## Status

Closed on 2026-04-11 without a standalone implementation pass. The remaining
useful admission semantics are now carried through later selected-seed and
shared-readiness work rather than this exploratory package.

## Why

Startup currently allows conditions to be treated as terminal-active while only
partially validated. This can collapse active-state and diagnostic degradation into
one boolean and hide incomplete convergence.

## Scope Basis

Roadmap / matrix entries in AGPL scope:

1. `Topology workflow stabilization`
2. `Operational visibility basics`
3. `Failure simulations`

## Sprint Umbrella

[Startup Gate Admission and Witness Hardening Sprint](../sprints/done-2026-q2-startup-gate-admission-hardening.md)

## In Scope

1. Introduce explicit admission states in startup gating:
   - `isStrongActive`
   - `isDegradedButProceeding`
   - `isBlocked`
2. Move projection from `_probeClusterActiveState` into an explicit
   adjudication function with one return object.
3. Update `_waitForAllActive` and related loops to transition cluster state only
   from strong active paths.
4. Preserve degraded/waiting states as non-terminal markers with bounded retry and
   diagnostic visibility.
5. Keep snapshot/publication convergence tracking but separate it from the active
   transition gate.

## Out Of Scope

1. General membership algorithm redesign.
2. Publication selection and planning correctness beyond active admission.
3. Non-startup modes (load/rebalance admission policy).

## Invariants

1. A node cannot become “active” in startup mode without strong admission evidence.
2. Degraded states are explicit and distinguishable from terminal success.
3. No stronger-than-policy transition due to soft-success witness alone.
4. Timeout behavior is visible and does not silently widen active truth.

## Hotspots

1. `test/distributed/harness/cluster.js`
2. `test/distributed/harness/__tests__/cluster.test.js` (CL-004/CL-006 tests)
3. `test/distributed/harness/failure-bundle.js`

## Detection / Analysis Tasks

- [ ] Map current startup active transitions and their call graph.
- [ ] Identify which diagnostics are consumed as terminal proof versus progress
  metadata.
- [ ] Enumerate state machine branches where soft-success currently returns success.

## Implementation Tasks

- [ ] Define a `StartupAdmissionDecision` type with evidence strength and
  readiness class.
- [ ] Refactor active probing to return typed decision object.
- [ ] Update wait-loop acceptance logic:
  - strong active proof -> terminal admission
  - degraded evidence -> continue with warning and progress state
  - weak evidence -> retry/fail depending on timeout policy
- [ ] Add explicit transition logs/events to disambiguate admission state in test
  artifacts.
- [ ] Remove assumptions in tests that collapse soft-success into terminal active.

## Validation

1. Targeted unit tests for the state machine and transition conditions.
2. Integration tests for startup + diagnostics scenarios under transient admin
   failure.
3. Distributed scenario checks that demonstrate `CL-004`/`CL-006` do not drive
   terminal active transitions.

## Done When

1. Startup admission has explicit, machine-like states.
2. Terminal active transition requires high-confidence evidence.
3. Soft-success paths are kept diagnosable and cannot hide incomplete convergence.
