# Spec-Led Runtime Modularization Projection Readiness Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "none",
  "playback": "none",
  "owner": "projection_readiness_owner",
  "boundary": "serve_repair_internal_readiness",
  "dominantReason": "readiness_consumers_can_still_conflate_projection_lanes",
  "currentState": "Projection readiness has newer contract pieces, but consumers can still conflate internal repair readiness, serve readiness, publication freshness, and startup active-gate presentation.",
  "nextAction": "Rewrite projection readiness as a consumer of publication streams and owner outcomes with explicit internal, repair, and serve readiness lanes.",
  "proof": [
    "Focused active-node projection tests",
    "Focused control-plane readiness service tests",
    "Focused admin readiness method tests",
    "Touched-file decision-boundary and literal guardrails"
  ],
  "touchedFiles": [
    "src/control-plane/active-node-projection.js",
    "src/control-plane/control-plane-readiness-service*.js",
    "src/control-plane/startup-authority-snapshot-owner.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/control-plane/projection-readiness-*.js",
    "test/control-plane/*readiness*.test.js",
    "test/admin/*readiness*.test.js",
    "work/packages/active-20260509-spec-led-runtime-modularization-projection-readiness-contract.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-publication-owner-stream.md"
}
-->

## Why

Readiness is where owner truth becomes operator and harness visibility. It must
not collapse repair eligibility, internal topology progress, serve eligibility,
publication freshness, and startup gate state into one cache-derived signal.
This package gives readiness explicit lanes fed by publication and owner
contracts.

## Scope Basis

Spec-led runtime modularization design, publication stream package, and core
topology readiness contract closure evidence.

## In Scope

1. Define projection readiness evidence from publication stream state,
   operation outcomes, placement intents, node liveness, and local projection
   revision.
2. Maintain separate internal, repair, serve, and operator visibility lanes.
3. Rewrite admin/readiness surfaces to consume readiness outcomes.
4. Preserve fail-closed behavior where required owner evidence is missing.
5. Add tests for stale projection, publication lag, repair-only readiness,
   serve readiness, and startup active gate consumption.

## Out Of Scope

1. Publication stream implementation.
2. Operation or placement owner rewrites.
3. Product UX beyond existing admin/readiness surfaces.
4. Harness diagnostics rewrite except for compatibility tests.

## Invariants

1. Readiness consumes owner contracts; it does not own publication or operation
   progress.
2. Internal, repair, and serve lanes stay distinct.
3. Missing owner evidence fails closed with a named reason.
4. Admin and harness consumers use readiness outcomes, not raw projection cache
   details.

## Tactical Inspiration

1. Kubernetes conditions: keep readiness conditions stable, named, and
   independently explainable.
2. etcd watch revisions: local projection readiness depends on observed stream
   revision and freshness fence.
3. Service mesh endpoint readiness: serving and repair/control readiness are
   separate consumer promises.

## Hotspots

1. `src/control-plane/active-node-projection.js`
2. `src/control-plane/control-plane-readiness-service*.js`
3. `src/control-plane/startup-authority-snapshot-owner.js`
4. `src/admin/admin-service-discovery-readiness-methods.js`
5. `test/control-plane/*readiness*.test.js`
6. `test/admin/*readiness*.test.js`

## Shared Boundary Contract

Semantic owner: `projection_readiness_owner`.

Canonical contract shape / vocabulary: readiness evidence, projection revision,
publication revision, internal lane, repair lane, serve lane, operator lane,
canonical reason list, and downstream active-gate state.

Allowed consumers: admin readiness methods, startup active gate, diagnostics,
harness analyzers, and readiness tests.

Prohibited reinterpretations: consumers cannot collapse readiness lanes or
derive serve readiness directly from cache presence, publication pending ACK
count, or priority recovery symptoms.

Primary diagnostics / proof surfaces: active-node projection tests,
control-plane readiness tests, admin readiness tests, and static guardrails.

## Detection / Analysis Tasks

- [ ] Inventory every readiness consumer and raw input.
- [ ] Map each input to publication stream, operation outcome, placement intent,
      local liveness, or deletion.
- [ ] Identify lane conflations and old active-gate aliases.
- [ ] Record downstream presentation changes for the diagnostics package.

## Implementation Tasks

- [ ] Add projection readiness constants, evidence, state, and decision modules.
- [ ] Implement separate internal, repair, serve, and operator lanes.
- [ ] Cut readiness services and admin methods to the new outcome.
- [ ] Add lane-specific fixtures.
- [ ] Delete stale cache-derived readiness helpers.

## Validation

1. Focused active-node projection tests.
2. Focused control-plane readiness service tests.
3. Focused admin readiness method tests.
4. Touched-file decision-boundary and literal guardrails.

## Done When

1. Readiness lanes are explicit and tested.
2. Admin and harness-facing readiness surfaces consume readiness outcomes.
3. Old cache-derived readiness shortcuts are removed or guarded.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Franklin (`019e0bf6-6828-72c0-82f8-d8ee72803a97`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-publication-owner-stream.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Sagan (`019e0bfb-ba69-7312-ba2f-0e0d199e6724`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-publication-owner-stream.md`.
