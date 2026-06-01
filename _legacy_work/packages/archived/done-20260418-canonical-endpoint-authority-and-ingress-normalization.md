# Canonical Endpoint Authority And Ingress Normalization

## Why

The current transport and bootstrap paths still let one peer be described by
several overlapping address surfaces:

1. raw `node_address`
2. canonical `node_endpoints`
3. transport-observed address
4. join-time derived websocket address

That overlap keeps reintroducing the same bugs:

1. wrong peer address gets published or reused
2. reconnect logic treats an observation as identity
3. bootstrap inputs remain runtime authority after normalization should have
   ended

The peer-routing contract needs one canonical endpoint authority and one clear
boundary for ingress normalization.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `architecture/current-owner-maps.md`
2. `work/packages/archived/done-20260410-transport-reconnect-authority-cleanup.md`
3. `work/packages/archived/done-20260413-node-address-resolution-complexity-reduction.md`

## Sprint Umbrella

[Runtime Boundary Simplification And Contract Unification Sprint](../../sprints/archived/done-2026-q2-runtime-boundary-simplification-and-contract-unification.md)

## In Scope

1. Define one canonical peer endpoint authority surface for runtime routing.
2. Restrict raw node-address inputs to ingress normalization only.
3. Make transport-observed addresses explicit observations, not peer identity.
4. Replace touched endpoint-state runtime contracts with named explicit
   variants.
5. Align bootstrap, heartbeat, routing, and diagnostics around the same
   endpoint contract.

## Out Of Scope

1. Adding a new transport protocol family.
2. Broad admin API endpoint redesign.
3. Non-peer discovery surfaces not involved in runtime routing.

## Invariants

1. Peer routing and reconnect decisions must consume one canonical endpoint
   authority surface.
2. Raw bootstrap or storage inputs may be normalized at ingress, but must not
   remain runtime peer authority.
3. Transport observations may inform retry and diagnostics, but must not
   silently overwrite canonical endpoint identity.
4. Endpoint state must not use `null` or protocol-specific field absence as a
   semantic runtime contract.

## Hotspots

1. `src/transport/node-address-resolution.js`
2. `src/transport/message-router.js`
3. `src/control-plane/heartbeat-service.js`
4. `src/bootstrap/phases/connect-websocket-phase.js`
5. `test/transport/node-address-resolution.test.js`
6. `test/transport/message-router.test.js`
7. `test/bootstrap/register-node-in-cluster.test.js`

## Detection / Analysis Tasks

- [ ] Inventory the current endpoint-shaped inputs, observations, and published
      authorities.
- [ ] Detect where raw node address or observed transport address still acts as
      runtime peer authority.
- [ ] Define one canonical endpoint-state model and allowed consumers.
- [ ] Detect stale tests or helpers that still encode overlapping endpoint
      authority semantics.

## Implementation Tasks

- [ ] Cut touched routing and reconnect logic over to one canonical endpoint
      authority.
- [ ] Normalize raw bootstrap and registration inputs exactly once at ingress.
- [ ] Contain transport-observed addresses to diagnostics and bounded retry
      logic.
- [ ] Replace touched endpoint-state models with explicit named variants.
- [ ] Update architecture and boundary-catalog records for the endpoint
      boundary.
- [ ] Perform the required closure deep dive across the touched endpoint owner
      paths before closure.

## Validation

1. Targeted transport, bootstrap, and heartbeat tests.
2. Focused integration checks for peer reconnect and join publication.
3. Distributed reruns that exercise reconnect under topology change.

## Done When

1. Peer routing uses one canonical endpoint authority surface.
2. Raw input and observed-address paths no longer act as second endpoint
   authorities on the touched area.
3. Touched endpoint-state contracts use named explicit variants.
4. Diagnostics still expose observations without confusing them with identity.
