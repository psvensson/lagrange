# Kernel Platform Lifecycle State And CDC Context V0

## Why

`architecture/lagrange-kernel-platform-api-v0.md` defines the intended stable
kernel substrate for installable services, but the roadmap rows for the service
lifecycle API, replicated service state API, CDC subscription API, and
consistent snapshot API are still open. The current lifecycle manager and
dispatcher are internal implementation pieces, not a stable service-facing
context.

The platform needs one explicit service context before external services can
depend on it.

## Scope Basis

Roadmap Phase `1.0 — Real Product`:

1. `Service lifecycle API`
2. `Replicated service state API`
3. `CDC subscription API`
4. `Consistent snapshot API`

Roadmap Phase `2.0 — Distributed Execution Platform`:

1. `Stable service lifecycle API`
2. `Stable replicated service state API`
3. `Stable CDC subscription API`

Architecture basis:

1. `architecture/lagrange-kernel-platform-api-v0.md`

These rows are AGPL-scoped in `edition-matrix.md`.

## In Scope

1. Define the versioned service-facing context for lifecycle hooks.
2. Define the service-facing replicated-state, CDC-subscription, and
   snapshot-barrier interfaces.
3. Route first-party services through that context where it is safe to do so,
   so the platform API is exercised by real owners instead of documentation
   alone.
4. Add contract tests proving the public context stays stable while the
   internals remain hidden.

## Out Of Scope

1. Admin surface registration.
2. Topology API.
3. Event emission API.
4. Capability-model expansion beyond the minimum needed to gate these context
   methods.

## Invariants

1. Services must consume a stable context, not raw planner, cache, or Raft
   internals.
2. Lifecycle, state, CDC, and snapshot semantics must each have one canonical
   owner path.
3. First-party and external services should converge on the same context
   vocabulary rather than forking internal-only and public-only APIs.

## Hotspots

1. `architecture/lagrange-kernel-platform-api-v0.md`
2. `src/service/service-lifecycle-manager.js`
3. `src/service/service-dispatcher.js`
4. `src/query/execution-context.js`
5. `src/cdc/`
6. `src/wasm-service/meta-service-lifecycle.js`
7. `src/wasm-service/meta-service-router.js`
8. `test/service/`
9. `test/wasm-service/`

## Detection / Analysis Tasks

- [ ] Inventory the current internal context objects and lifecycle hook shapes.
- [ ] Define the smallest stable public context that covers lifecycle, state,
      CDC, and snapshot needs.
- [ ] Identify which first-party services should become the first contract
      consumers.
- [ ] Define the contract-test surface that will freeze this API boundary.

## Implementation Tasks

- [ ] Add the versioned service context types and owners.
- [ ] Wire lifecycle hooks through the new context.
- [ ] Add the replicated-state, CDC, and snapshot adapters behind that
      context.
- [ ] Cut one or more first-party services over as proof consumers.
- [ ] Add focused contract and regression tests.

## Validation

1. Targeted service lifecycle and dispatcher tests.
2. Targeted WASM service context tests.
3. Targeted CDC and snapshot contract tests.
4. Any focused integration coverage needed to prove first-party service
   cutover.

## Done When

1. Services consume one versioned lifecycle/state/CDC/snapshot context.
2. The public context is backed by real owners rather than ad hoc wrappers.
3. At least one real service path proves the contract is executable.

