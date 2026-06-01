# Active Gate Harness Regression Pack

## Status

Closed on 2026-04-11 without a standalone implementation pass. Startup-gate
regression coverage was absorbed by later harness regression and readiness
classification work, so there is no separate value left in keeping this package
open.

## Why

The distributed matrix has already exposed startup active-gate ambiguity. A direct
regression package is needed to lock the systemic changes and prevent drift during
subsequent recovery architecture work.

## Scope Basis

AGPL-in-scope rows:

1. `Failure simulations` (roadmap, `edition-matrix.md`)
2. `Operational visibility basics` (roadmap, `edition-matrix.md`)
3. `Topology workflow stabilization` (roadmap, `edition-matrix.md`)

## Sprint Umbrella

[Startup Gate Admission and Witness Hardening Sprint](../../sprints/archived/done-2026-q2-startup-gate-admission-hardening.md)

## In Scope

1. Add regression fixtures for known fragile startup active-gate shapes:
   - transient admin reachability
   - snapshot incompleteness timeout
   - publication lag with incomplete snapshots
2. Convert `diag-admin-discovery`-class expectations into explicit,
   non-ambiguous pass/fail contracts.
3. Add a matrix-wide check that active transitions and CL witness outputs are
   internally consistent.
4. Add a fast smoke path that validates no duplicate semantic paths are used
   after evidence unification.

## Out Of Scope

1. Full distributed matrix expansion to all scenarios.
2. Production-only failure simulation tooling outside the existing harness.
3. Rewriting scenario DSL broadly; only targeted regression scaffolding.

## Invariants

1. Startup completion conditions are explicit and testable in one location.
2. Each regression path must assert both active-state outcome and witness outcome.
3. No test may pass via a weaker witness while contradicting stronger active-state
   invariants.

## Hotspots

1. `test/distributed/harness/__tests__/cluster.test.js`
2. `test/distributed/scenarios/diag-admin-discovery.js`
3. `test/distributed/harness/failure-bundle.js`

## Detection / Analysis Tasks

- [ ] Build a reduced scenario matrix for startup admission and witness consistency.
- [ ] Capture baseline traces for baseline pass/fail expectations.
- [ ] Identify brittle assertions tied to now-removed duplicate logic.

## Implementation Tasks

- [ ] Add or update targeted harness tests for startup active admission.
- [ ] Add explicit assertion helper for expected witness sequence in startup mode.
- [ ] Add diagnostic-state assertion helper to separate “active” and “degraded”
  acceptance.
- [ ] Ensure test package names and comments track active/witness semantics clearly.
- [ ] Add scenario-specific markers so matrix runs can filter startup-gate-focused
  regression jobs.

## Validation

1. Unit-level cluster-active and witness classifier tests.
2. Regression-only harness run for startup + startup-admission-sensitive scenarios.
3. Stable assertions for `CL-004` and `CL-006` behavior.
4. Negative tests proving transient-admin-only states do not auto-pass startup.

## Done When

1. Known failure signatures are locked by regression tests.
2. Future startup changes cannot regress witness/active consistency without breaking
   harness checks.
3. The harness clearly distinguishes terminal acceptance from degraded continuation.
