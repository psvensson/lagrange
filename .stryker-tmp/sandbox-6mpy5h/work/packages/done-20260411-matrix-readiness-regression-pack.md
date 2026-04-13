# Matrix Readiness Regression Pack for Timeout and Fault Separation

## Why

Behavioral changes to timeout semantics and shared policy needed regression
coverage before scaling matrix breadth, otherwise the same ambiguity could be
reintroduced by later refactors.

## Scope Basis

Roadmap and matrix rows in AGPL scope:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Matrix Stability and Readiness Semantics Sprint](../sprints/done-2026-q2-matrix-stability-timeout-and-readiness-unification.md)

## In Scope

1. Capture a focused matrix profile using the dominant local load scenarios from the prior run.
2. Add assertions that differentiate recoverable readiness delay from terminal no-progress failure.
3. Add regression fixtures for snapshot timeout, snapshot coverage loss, and delayed recovery under load.
4. Add artifact checks for structured reason reporting in triage output.
5. Keep a pre and post comparison trail for the stability pass.

## Out Of Scope

1. Full scenario matrix expansion beyond the focused target set.
2. New infrastructure for non-distributed CI.
3. Production behavior changes not tied to distributed harness signals.

## Invariants

1. Regression coverage captures reason-classification output and convergence exit mode.
2. A run is not interpreted as stable-fail simply for bounded recoverable delay.
3. Terminal outcomes require explicit non-recoverable evidence.

## Hotspots

1. `test-output/reports/` triage fixtures and summary parsers
2. `test/distributed/scenarios/*`
3. Failure-bundle and triage scripts used by matrix runs

## Implementation Tasks

- [x] Extend fixture and playback coverage for the focused scenario signatures.
- [x] Add triage assertions for explicit failure-code fields and recoverability.
- [x] Capture rerun summary artifacts under `test-output/reports/` for comparison.
- [x] Keep the gating distinction between timeout-shaped delay and terminal failure.

## Outcome

Completed as the regression and evidence pack. The harness now has fixture-level
assertions for the new readiness taxonomy, and the focused rerun set writes
structured reports that can be compared against the prior ambiguous timeout-only
behavior.

## Validation

- [x] Focused failure-bundle playback regressions
- [x] Startup witness regressions in `cluster.test.js`
- [x] Distributed reruns for the previously failing local scenarios

## Done When

1. The regression pack can execute the core lifecycle scenarios and verify the new taxonomy.
2. Run-diff checks show intentional interpretation of delay versus failure.
3. Regressions are attributable to explicit evidence-class changes rather than ambiguous timeouts.
