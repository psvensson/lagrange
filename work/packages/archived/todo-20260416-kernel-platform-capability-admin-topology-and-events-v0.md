# Kernel Platform Capability Admin Topology And Events V0

## Why

The remaining service-platform control surfaces are still only architectural
intent. The roadmap rows for capability enforcement, admin surface
registration, topology API, and event emission API remain open, even though
the repo already has internal capability-policy logic, admin infrastructure,
and topology owners.

Those surfaces need one stable service-facing contract before the platform can
externalize them safely.

## Scope Basis

Roadmap Phase `1.0 — Real Product`:

1. `Admin surface registration`
2. `Capability enforcement`
3. `Topology API`
4. `Event emission API`

Roadmap Phase `2.0 — Distributed Execution Platform`:

1. `Stable admin surface registration`
2. `Stable capability model`
3. `External topology API`
4. `External event emission API`

Architecture basis:

1. `architecture/lagrange-kernel-platform-api-v0.md`

These rows are AGPL-scoped in `edition-matrix.md`.

## In Scope

1. Define the service-facing capability contract and its enforcement owner.
2. Define the service-facing admin registration API for SQL, CLI, and HTTP
   control surfaces.
3. Define a read-only topology API and a structured event-emission contract
   suitable for installable services.
4. Exercise the contract with one or more first-party service consumers.

## Out Of Scope

1. Enterprise policy-provider integrations.
2. Secrets or KMS integrations.
3. Dashboard or admin UI redesign.
4. Broad commercial edition control surfaces.

## Invariants

1. Capability checks must be enforced by the kernel, not trusted to service
   self-declaration alone.
2. Topology APIs must remain read-only and must not expose raw internal state
   that bypasses canonical owners.
3. Admin registration and event emission must flow through one canonical owner
   path each rather than per-service special cases.

## Hotspots

1. `architecture/lagrange-kernel-platform-api-v0.md`
2. `src/wasm-service/capability-policy.js`
3. `src/service/service-dispatcher.js`
4. `src/admin/`
5. `src/control-plane/`
6. `src/service/`
7. `test/service/`
8. `test/wasm-service/`
9. `test/admin/`

## Detection / Analysis Tasks

- [ ] Inventory the current internal capability, admin, topology, and event
      surfaces.
- [ ] Identify the canonical owners that must back each public service-facing
      contract.
- [ ] Define the smallest stable API that gives services useful control
      surfaces without leaking internal machinery.
- [ ] Define the focused tests needed to prove enforcement and registration.

## Implementation Tasks

- [ ] Add the versioned capability-enforcement and admin-registration
      contracts.
- [ ] Add the read-only topology and structured event-emission contracts.
- [ ] Route first-party service consumers through the new APIs.
- [ ] Add focused enforcement, registration, and contract tests.

## Validation

1. Targeted capability-policy tests.
2. Targeted service dispatcher and service-context tests.
3. Targeted admin registration tests.
4. Focused topology and event-contract tests for the first service consumers.

## Done When

1. Services consume one stable capability/admin/topology/event surface.
2. The kernel remains the sole enforcement owner for privileged operations.
3. First-party service consumers prove the contracts are real and not only
   architectural placeholders.
