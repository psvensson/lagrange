# Membership Publication Runtime Owner Unification

## Status

Closed on 2026-04-20. Four slices are landed:

1. node-state publication delivery, deferral, and mesh-reconciliation
   semantics now live under a dedicated runtime owner, with
   `NodeJoiningService` reduced to wiring and intent submission for that path.
2. bootstrap/join admission now routes `nodes`, `node_endpoints`, and
   `service_endpoints` publication through `MembershipPublicationRuntimeOwner`,
   with `node_endpoints` promoted to a first-class system-metadata owner and
   the endpoint-owner duplication collapsed behind a shared owner base.
3. steady-state membership publication now resolves
   `control_plane_publications` through the same runtime owner surface, so the
   coordinator no longer needs a separate top-level publication-owner wiring
   story.
4. publication diagnostics and harness-facing readiness evidence now route
   through one readiness-owned control-plane publication story that carries
   metadata publication, node-state publication, and membership publication
   together for bootstrap, write-health, and admin consumers.

Sprint-level scenario confirmation remains downstream and is not a package-local
closure gate.

## Why

Node join, heartbeat-driven publication, restart recovery, and membership
publication still share one concern across several local owners. The system
needs one runtime owner for node membership and endpoint publication so phase
code stops carrying long-lived publication semantics.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Unify `nodes`, `node_endpoints`, `service_endpoints`, and
   `control_plane_publications` publication under one runtime owner.
2. Make bootstrap/join/heartbeat paths submit intent instead of reproducing
   publication semantics locally.
3. Align publication diagnostics to one owner vocabulary.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Residual Closure Inventory

- [x] Node-state publication now runs through one dedicated runtime owner.
- [x] `NodeJoiningService` no longer acts as the long-lived publication owner
      for node-state update delivery semantics.
- [x] Join admission writes for `nodes`, `node_endpoints`, and
      `service_endpoints` now flow through one membership publication runtime
      owner instead of raw table-name publication helpers.
- [x] `control_plane_publications` steady-state coordinator mutation paths are
      wired through the same publication owner story.
- [x] Diagnostics use one readiness-owned publication story.
- [x] Package-local closure no longer waits on named harness evidence.
