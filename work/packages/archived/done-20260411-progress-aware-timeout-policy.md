# Progress-Aware Timeout Policy for Bounded Convergence

## Why

Wait behavior did not consistently preserve the distinction between taking
longer to stabilize and never stabilizing, which could either over-fail or
over-wait under load.

## Scope Basis

AGPL-in-scope roadmap rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Matrix Stability and Readiness Semantics Sprint](../../sprints/archived/done-2026-q2-matrix-stability-timeout-and-readiness-unification.md)

## In Scope

1. Track convergence progress while waiting for startup and readiness in active wait loops.
2. Preserve the policy split between progress-carrying delay and bounded no-progress failure.
3. Keep hard global timeout caps while surfacing progress context on exit.
4. Add per-phase visibility for boot, join, rejoin, rebalance, and partition-heal modes.
5. Emit explicit reason on timeout exit instead of a generic timeout bucket.

## Out Of Scope

1. Removing all startup deadlines.
2. Generic retry behavior outside startup and readiness phases.
3. Non-harness production scheduler policy.

## Invariants

1. A hard deadline always exists for each readiness stage.
2. No-path-advance with zero progress for extended windows fails terminally.
3. Progress-driven delays cannot continue past configured policy maxima.

## Hotspots

1. `test/distributed/harness/cluster.js`
2. `test/distributed/harness/startup-readiness-evidence.js`
3. `test/distributed/harness/active-gate-closure-classification.js`
4. Scenario-level load-admission loops

## Implementation Tasks

- [x] Carry shared convergence-progress evidence through active wait gates.
- [x] Normalize policy states into explicit recoverable-delay versus terminal no-progress exits.
- [x] Keep bounded budget guards in the active wait path.
- [x] Update loop exits and logs to include phase and progress metrics.
- [x] Remove timeout fallback branches that discarded progress context.

## Outcome

Completed as the bounded-timeout pass. Timeout exits now retain explicit
progress and no-progress context, and terminal no-progress paths are classified
through a stable reason code instead of being mistaken for ordinary delay.

## Validation

- [x] Unit assertions for no-progress terminal classification in active wait paths
- [x] Integration coverage through startup witness fixtures with explicit progress state
- [x] Focused matrix reruns showing progress-aware fields in generated reports

## Done When

1. Timeout exits carry explicit convergence-progress context.
2. Hard deadlines remain bounded with no unbounded waiting.
3. The policy avoids early terminal decisions when the evidence still shows progress.
