# Requirements

## Summary

The system needs one node-local owner for pressure admission so transport,
control-plane, query, join, CDC, and rebalance paths stop inventing local
backpressure behavior. The owner must consume canonical resource signals,
classify work by importance, and return one admission decision that callers
apply through their existing owner paths.

## Requirements

### 1. Single Owner For Pressure Admission

1.1 The codebase MUST expose one shared node-local `PressureGovernor` owner for
pressure admission decisions.

1.2 Current callers that gate on local router pressure MUST route that decision
through `PressureGovernor` instead of directly calling
`messageRouter.getOutboundPressureSummary()`.

1.3 `PressureGovernor` MUST support generic resource keys so future chokepoints
can register under the same admission contract without creating a second
pressure policy path.

### 2. Canonical Decision Contract

2.1 `PressureGovernor` MUST accept a work request that includes `workClass`,
`resourceKeys`, and optional degrade/defer allowances.

2.2 `PressureGovernor` MUST return a typed decision with exactly one action:
`allow`, `degrade`, `defer`, or `reject`.

2.3 `PressureGovernor` MUST preserve canonical pressure diagnostics, including
the current transport saturation summary when transport is the active sensor.

2.4 Critical work MUST remain admissible during transport pressure unless a
future resource-specific owner explicitly defines a stricter policy.

2.5 Background work MUST be eligible for degradation or defer under transport
pressure so hot nodes stop amplifying their own chokepoints.

### 3. Control-Plane Read Degradation

3.1 `ControlPlaneSystemTableGateway` MUST use `PressureGovernor` for
control-plane read admission.

3.2 When pressure policy returns `degrade`, control-plane reads MUST stay on the
authoritative owner path but disable routed SQL fallback.

3.3 When a degraded authoritative read cannot complete locally,
`ControlPlaneSystemTableGateway` MUST fail with a typed pressure result instead
of issuing a routed SQL fallback wave.

3.4 `AuthoritativeControlPlaneView` MUST apply the same degrade contract for its
direct authoritative read owner path.

### 4. Shared Pressure Summary Reuse

4.1 Current pressure-sensitive owner paths in join readiness, CDC retry,
rebalancing, and bootstrap backfill MUST reuse `PressureGovernor` instead of
duplicating router-pressure queries.

4.2 Callers that need diagnostic detail rather than a simple boolean MUST be
able to retrieve the same canonical pressure summary from `PressureGovernor`.

### 5. Verification

5.1 Unit tests MUST cover `PressureGovernor` decision behavior for critical and
background work under transport pressure.

5.2 Unit tests MUST prove control-plane gateway and authoritative view degrade
to no-SQL-fallback behavior under transport pressure.

5.3 Focused regression suites for join readiness, CDC propagation, rebalance
pressure gating, and control-plane reads MUST pass after the change.
