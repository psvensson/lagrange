# Bootstrap Join Ingress And Peer-Mesh Fallback Reduction

## Why

Join/bootstrap still uses several transitional fallback mechanisms:

1. peer-mesh continuation after seed websocket exhaustion
2. local or hinted READY-state update targets
3. bootstrap-hint peer-location bridges
4. local message-group selection fallback

Those may not all disappear at once, but they should be reduced under one
package so the whole bootstrap/join fallback surface is not left half-finished.

## Scope Basis

Phase 0.1 roadmap scope: bootstrap-to-runtime handoff, topology workflow
stability, and transport/discovery correctness under failure.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../../sprints/archived/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-BS-005`
2. `FB-BS-006`
3. `FB-BS-007`
4. `FB-MG-001`

## In Scope

1. Reduce seed-websocket-to-peer-mesh degraded flow where a more canonical path
   can exist.
2. Reduce local and hinted READY publication targeting.
3. Remove or narrow bootstrap-hint peer-location bridges.
4. Collapse bootstrap message-group selection fallback behind one owner.

## Out Of Scope

1. Transport reconnect-authority ownership itself.
2. Bootstrap topology snapshot cutover.
3. Authoritative control-plane ingress shaping.

## Invariants

1. Bootstrap/join degraded transport remains bounded where still necessary.
2. READY-state publication targeting must converge on one owner.
3. Peer-location dissemination must become runtime-owned before bootstrap
   bridges disappear.

## Hotspots

1. `src/bootstrap/node-joining-service.js`
2. `src/bootstrap/phases/connect-websocket-phase.js`
3. `src/bootstrap/owners/bootstrap-join-admission-owner.js`
4. `src/bootstrap/shared/message-group-selection.js`
5. `src/message-group/message-group-service.js`
6. `src/message-group/message-group-forwarding-owner.js`

## Detection / Analysis Tasks

- [x] Inventory every remaining bootstrap/join fallback trigger and whether it
      is still needed.
- [x] Separate peer-location bridges from READY-state publication targeting.
- [x] Define the steady-state owner path each bridge should collapse into.

## Implementation Tasks

- [x] Reduce seed websocket fallback and peer-mesh continuation where
      unnecessary.
- [x] Collapse READY-state update targeting behind one owner.
- [x] Remove bootstrap-hint peer-location dependence from steady-state paths.
- [x] Add tests for bounded degraded bootstrap behavior and steady-state
      handoff.

## Validation

1. Node-joining and connect-websocket tests.
2. Message-group service/forwarding owner tests.
3. Distributed scenarios: `rolling-restart`, `node-join-under-load`,
   `seed-restart-under-load`.

## Done When

1. Bootstrap/join fallback mechanisms are materially smaller and more explicit.
2. READY publication targeting has one owner path.
3. Peer-location bootstrap-hint bridges no longer leak into steady-state
   routing.
