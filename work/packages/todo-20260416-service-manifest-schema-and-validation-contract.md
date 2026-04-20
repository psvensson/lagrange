# Service Manifest Schema And Validation Contract

## Why

`architecture/lagrange-service-manifest.md` defines the intended installable
service manifest, but the roadmap rows for manifest schema definition and
validation rules remain open. The codebase already contains WASM-specific
manifest and runtime validators, yet there is not one canonical external
service-manifest contract spanning `wasm_component` and `oci_container`.

That gap blocks every higher-level service-platform surface behind it.

## Scope Basis

Roadmap Phase `1.0 — Real Product`:

1. `Service manifest schema definition`
2. `Manifest validation rules`

Architecture basis:

1. `architecture/lagrange-service-manifest.md`

These rows are AGPL-scoped in `edition-matrix.md`.

## In Scope

1. Define one canonical service-manifest schema and field-owner module set.
2. Implement validation for identity, artifact, runtime, replication,
   capability, compatibility, configuration, and dependency sections.
3. Normalize legacy or partial external manifest inputs at ingress before they
   enter runtime logic.
4. Reject unsupported external runtime kinds such as `native_js`.

## Out Of Scope

1. Service catalog system tables.
2. Installation reconciler behavior.
3. CLI publish/deploy UX.
4. Runtime activation or placement policy beyond manifest validation.

## Invariants

1. Installable services must have one versioned manifest contract.
2. Manifest validation must have one canonical ingress rather than separate
   WASM-only and service-only public validators.
3. Runtime-specific detail may exist inside the manifest, but the external
   contract must stay smaller than the combined internal owner state.

## Hotspots

1. `architecture/lagrange-service-manifest.md`
2. `src/service/service-descriptor.js`
3. `src/wasm-service/service-definition-validator.js`
4. `src/wasm-service/manifest-runtime-validator.js`
5. `src/wasm-service/module-manifest-constants.js`
6. `test/wasm-service/`
7. `test/service/`

## Detection / Analysis Tasks

- [ ] Inventory the current manifest-shaped validators and field vocabularies.
- [ ] Map the gaps between code and `architecture/lagrange-service-manifest.md`.
- [ ] Identify which current validators should become the canonical external
      ingress and which should remain internal helpers.
- [ ] Define the compatibility and legacy-normalization boundary explicitly.

## Implementation Tasks

- [ ] Add the canonical installable service-manifest model and constants.
- [ ] Implement one validation ingress that reuses existing owners where
      possible.
- [ ] Cut current callers over to that ingress.
- [ ] Add focused regression coverage for valid, invalid, and legacy manifest
      shapes.

## Validation

1. Targeted manifest-model and runtime-validator tests.
2. Targeted service descriptor tests.
3. Any touched CLI or publish-path tests that consume the manifest contract.
4. Static guardrails needed to keep one manifest vocabulary.

## Done When

1. Installable services use one canonical manifest schema and validation path.
2. `wasm_component` and `oci_container` share one external contract with
   runtime-specific detail expressed explicitly.
3. External manifests cannot enter runtime logic through partial or conflicting
   validators.

