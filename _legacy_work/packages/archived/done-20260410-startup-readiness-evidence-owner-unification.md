# Startup Readiness Evidence Owner Unification

## Status

Closed on 2026-04-11 without a standalone implementation pass. The useful
normalization work was absorbed by later readiness unification and startup
authority work, so no separate value remains in keeping this package open.

## Why

Startup activeness currently answers the same question from two semantic sources:
`cluster.js` and `active-gate-closure-classification.js` each maintain
independent transient-admin and probe classification logic. This is a source of
false-positive readiness and non-deterministic active transitions.

## Scope Basis

In-scope by existing roadmap and matrix entries:

1. `Topology workflow stabilization` (Roadmap / `edition-matrix.md`, AGPL repo)
2. `Operational visibility basics` (Roadmap / `edition-matrix.md`, AGPL repo)
3. `Failure simulations` (Roadmap / `edition-matrix.md`, AGPL repo)

## Sprint Umbrella

[Startup Gate Evidence Foundation Sprint](../../sprints/archived/done-2026-q2-startup-gate-evidence-foundation.md)

## In Scope

1. Introduce one shared startup evidence normalizer module under the distributed
   harness.
2. Move `STARTUP_ACTIVE_PROJECTION_ADMIN_ERROR_FRAGMENTS`,
   `STARTUP_ADMIN_REACHABILITY_TRANSIENT_ERROR_FRAGMENTS`, and equivalent
   matching logic out of distributed callsites into this module.
3. Emit a normalized evidence object with explicit strength (`none|transient|strong`)
   and witnessability fields consumed by both active projection and closure
   classification.
4. Rewire `test/distributed/harness/cluster.js` and
   `test/distributed/harness/active-gate-closure-classification.js` to use the
   same owner API.
5. Add a migration note documenting any intentional temporary differences in
   behavior.

## Out Of Scope

1. Production cluster runtime (non-test) control-plane control path.
2. Non-startup active-liveness or liveness-probe behavior.
3. New distributed scenario coverage outside startup/admission.

## Invariants

1. A correctness-critical question has one canonical owner implementation.
2. Shared evidence type is stable and versioned through one module API.
3. Duplicate semantic matching code between harness modules is eliminated.
4. Evidence classification output is deterministic for identical probe telemetry.

## Hotspots

1. `test/distributed/harness/cluster.js`
2. `test/distributed/harness/active-gate-closure-classification.js`

## Detection / Analysis Tasks

- [ ] Confirm every caller of startup readiness projection in both modules.
- [ ] Build a decision table for admin/snapshot/reachability evidence strength.
- [ ] Identify all existing assumptions about timeout/transient behavior in tests.
- [ ] Verify whether classification behavior changes are intentional or regressions.

## Implementation Tasks

- [ ] Add shared module file (for example
  `test/distributed/harness/startup-readiness-evidence.js`).
- [ ] Move fragment lists and transient-check helpers into shared module.
- [ ] Define a canonical result shape with:
  - direct readiness signal
  - admin confidence score
  - snapshot/publication signal
  - `canProjectStartupActive`
  - `canEmitSoftWitness`
- [ ] Update callsites in both target files to consume normalized evidence.
- [ ] Remove duplicated ad-hoc checks after migration.

## Validation

1. Targeted distributed unit tests for normalization table coverage.
2. Targeted integration of startup probe path in
   `test/distributed/harness/__tests__/cluster.test.js`.
3. Harness scenario checks for startup-related modes (`diag-admin-discovery`,
   startup + restart pressure shape).

## Done When

1. One module owns startup evidence normalization.
2. No duplicated transient-admin classification remains across the two target
   modules.
3. Test outcomes in startup scenarios are explainable from shared evidence output.
4. Any temporary behavior deltas are documented and approved.
