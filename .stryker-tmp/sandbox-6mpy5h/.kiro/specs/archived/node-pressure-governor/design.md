# Design

## Overview

The current code has one real signal source, `MessageRouter`, but several local
policy implementations. That violates the single-owner rule. The fix is to add
one node-local `PressureGovernor` that consumes canonical resource signals and
returns admission decisions. Existing owners keep owning their work, but they no
longer decide pressure policy independently.

## Owner Model

- `MessageRouter` remains the owner of transport queue state and saturation
  metrics.
- `PressureGovernor` becomes the owner of pressure admission policy.
- `ControlPlaneSystemTableGateway` remains the owner of control-plane read/write
  execution.
- `AuthoritativeControlPlaneView` remains the owner of authoritative control-
  plane read composition and in-flight read coalescing.

This keeps sensing, policy, and execution separate without parallel fallbacks.

## PressureGovernor Contract

`PressureGovernor` exposes:

- `getShared(options)` for one shared instance per `nodeId`
- `evaluate(request)` returning `{action, reason, retryAfterMs, summary}`
- `isBackpressured(request)` for boolean gates
- `getPressureSummary(resourceKeys)` for logging and diagnostics

### Request Shape

- `workClass`: `critical`, `interactive`, `background`
- `resourceKeys`: array of generic keys such as:
  - `transport:outbound`
  - `control-plane:read`
  - `control-plane:write`
  - `join:repair`
  - `cdc:retry`
  - `rebalancer:schedule`
- `allowDegrade`
- `allowDefer`

### Sensor Resolution

For this tranche, all current resource keys resolve to the existing local
transport pressure sensor. The resource-key contract is still generic so future
resource owners can attach different sensors without changing callers.

### Admission Policy

- No active pressure: `allow`
- Active pressure + `critical`: `allow`
- Active pressure + `interactive` + degrade allowed: `degrade`
- Active pressure + `background` + degrade allowed: `degrade`
- Active pressure + no degrade but defer allowed: `defer`
- Active pressure + neither allowed: `reject`

## Gateway/View Integration

### ControlPlaneSystemTableGateway

For `readRows()`:

1. Ask `PressureGovernor` for admission.
2. If `allow`, keep existing authoritative-read then SQL-fallback behavior.
3. If `degrade`, call the authoritative owner path with `allowSqlFallback=false`.
4. If that degraded read fails, return a typed pressure result instead of
   routing SQL through the cluster.

Writes remain owner-routed through the gateway, but this tranche focuses on the
read chokepoint because that is the current harness hotspot.

### AuthoritativeControlPlaneView

`readRows()` uses the same admission decision:

- `allow`: existing behavior
- `degrade`: authoritative read only, no SQL fallback
- degraded miss: typed pressure result

The view keeps its existing in-flight dedupe because that coalescing belongs to
the read owner path, not to the governor.

## Reused Gates

Current owners that only need a yes/no decision switch from direct router
inspection to `PressureGovernor.isBackpressured()`:

- join readiness repair
- join authoritative backfill pressure mode
- CDC background retry pacing
- rebalance operation gating
- periodic rebalance scheduling

## Diagnostics

`PressureGovernor.getPressureSummary()` returns the transport summary object so
existing logs can keep their current fields while reading them from the new
owner.
