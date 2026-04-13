# Recovery-Pressure Containment and Admin Visibility Stability

## Why

Two focused reruns survive startup, then collapse later when owner-RPC
pressure, WebSocket reconnect failures, discovery-repair churn, CDC retries,
and admin visibility queries amplify each other. The result is table-visibility
timeout and control-snapshot failure rather than bounded degraded behavior.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Convergence Ownership and Stability Sprint](../sprints/done-2026-q2-runtime-convergence-ownership-and-stability.md)

## In Scope

1. Identify the shared pressure signals that currently drive owner-RPC,
   transport reconnect, discovery repair, CDC retry, and admin query collapse.
2. Install one bounded pressure policy so these subsystems degrade predictably
   instead of recursively amplifying each other.
3. Stabilize table-visibility and control-snapshot reads under sustained
   recovery pressure.
4. Reduce duplicate repair and retry work when the control plane is already
   signaling pressure.
5. Surface pressure state and degraded-mode cause in harness artifacts.

## Out Of Scope

1. New networking stack work.
2. Blanket retry-budget increases without owner-path pressure control.
3. Broad performance tuning unrelated to control-plane survivability.

## Invariants

1. Control-plane pressure is explicit and shared across affected subsystems.
2. Admin visibility paths degrade behind bounded policy rather than recursive
   retry storms.
3. Recovery work cannot amplify transport and discovery collapse indefinitely.

## Hotspots

1. `src/admin/admin-control-snapshot.js`
2. `src/control-plane/control-plane-readiness-service.js`
3. `src/control-plane/membership-publication-coordinator.js`
4. `test/distributed/scenarios/`
5. `test/distributed/harness/cluster.js`

## Status

Closed on 2026-04-11 after the exploratory owner pass. The useful remaining
work is now carried by the active pressure-owned visibility and repair
containment package under the runtime-completion sprint, so this package no
longer needs to remain open separately.

Implemented:

1. authoritative discovery repair now aborts after the first timeout-shaped or
   control-plane-backpressure failure instead of reading every remaining table
2. non-forced control-snapshot repair now degrades behind ready local query
   transport when the repair failure is explicitly backpressure- or
   timeout-shaped
3. focused regression coverage now pins both behaviors

Observed outcome:

1. `seven-node-read-write-load-transaction-recovery` still fails with
   `table_id` visibility timeout after a 15000ms control-lane timeout
2. `seven-node-read-write-load-distribution` now fails in split-policy visibility
   after distributed participant failures
3. `seven-node-postgres-baseline-partition-split` emitted explicit
   `control_plane_backpressure` on authoritative discovery repair during the
   failure path, which confirms the pressure signal is now visible even though
   the runtime still does not stabilize

## Detection / Analysis Tasks

- [x] Trace the first shared pressure signal across owner-RPC, reconnect,
      discovery repair, CDC retry, and table-visibility timeout.
- [x] Identify duplicate retry and repair loops that continue after pressure is
      already explicit.
- [x] Confirm where admin visibility should switch from normal query semantics
      to bounded degraded semantics.

## Implementation Tasks

- [ ] Define one shared pressure state contract consumed by the affected control
      plane and admin paths.
- [x] Collapse duplicate repair and retry amplification behind one bounded
      policy.
- [x] Add bounded degraded-mode behavior for control-snapshot and table-visibility
      queries.
- [x] Add focused regression coverage for the transaction-recovery and
      table-partition-distribution failure families.

## Validation

1. The late-phase rerun family no longer times out on `table_id` visibility
   after admin-control lane collapse.
2. Pressure state is visible and consistent across runtime artifacts.
3. Recovery pressure either stabilizes or fails behind explicit degraded-mode
   semantics.

## Done When

1. Recovery pressure has one shared containment policy across the affected
   subsystems.
2. Admin visibility and control-snapshot reads survive pressure or fail
   explicitly behind bounded policy.
3. Late runtime collapse is no longer an emergent retry storm.
