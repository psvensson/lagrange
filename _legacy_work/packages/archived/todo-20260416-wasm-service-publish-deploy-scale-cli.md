# WASM Service Publish Deploy And Scale CLI

## Why

The runtime already has lower-level pieces for manifest validation, registry
resolution, and service lifecycle orchestration, but the roadmap rows for
`CLI wasm publish`, `CLI wasm deploy`, and `CLI wasm scale` are still open.

That leaves the service-author workflow below the product boundary: the engine
can host WASM services, but the user path to publish, deploy, and scale them is
still missing.

## Scope Basis

Roadmap Phase `0.5 — External Usability`:

1. `Developer Workflow`

This row is AGPL-scoped in `edition-matrix.md`.

## In Scope

1. Define CLI contracts for `wasm publish`, `wasm deploy`, and `wasm scale`.
2. Reuse the canonical manifest-validation and registry-resolution owners
   rather than adding CLI-local validation logic.
3. Route deploy and scale through one desired-state owner path instead of
   writing ad hoc lifecycle mutations from the CLI.
4. Emit structured success, deferred, and failure responses suitable for
   operator use and documentation.

## Out Of Scope

1. `lagrange service init`.
2. `lagrange service dev-install`.
3. OCI container install UX.
4. Registry auth and trust-policy expansion beyond what the command path
   immediately requires.

## Invariants

1. Publish must reuse the canonical manifest-validation and capability-policy
   path.
2. Deploy and scale must not bypass the service catalog / reconciler owner
   boundary.
3. The CLI must expose one stable vocabulary for retryable versus terminal
   failures instead of shell-only error text.

## Hotspots

1. `src/cli/`
2. `src/wasm-service/meta-command-handlers.js`
3. `src/wasm-service/meta-validation-pipeline.js`
4. `src/wasm-service/registry-resolver.js`
5. `src/service/`
6. `architecture/lagrange-service-registry.md`

## Detection / Analysis Tasks

- [ ] Inventory the current low-level publish and deployment entry points.
- [ ] Define the command I/O contract for publish, deploy, and scale.
- [ ] Confirm which desired-state owner the deploy and scale commands must
      target.
- [ ] Identify the minimum focused test ladder for the new command surfaces.

## Implementation Tasks

- [ ] Add the three CLI commands and shared argument normalization.
- [ ] Reuse the existing manifest-validation and registry-resolution owners.
- [ ] Add the canonical deploy and scale submission path.
- [ ] Add focused command, lifecycle, and failure-path tests.
- [ ] Update operator-facing command documentation.

## Validation

1. Targeted CLI tests.
2. Targeted `src/wasm-service/` validation and command-handler tests.
3. Targeted service lifecycle / reconciler tests for deploy and scale.
4. One focused end-to-end smoke covering publish -> deploy -> scale.

## Done When

1. A WASM service author can publish, deploy, and scale through documented CLI
   commands.
2. The commands reuse the canonical validation and desired-state owners.
3. Failure and retry behavior is explicit enough to serve as the supported UX
   surface.

