# Node-State Update Decoupling And Control-Plane Pressure Relief

## Why

`NODE_STATE_UPDATE` is still both a liveness signal and a durable metadata
write path. During restart and rejoin storms that keeps feeding the same
control-plane bottleneck, while residual late-response churn still adds noise
and pressure.

## Scope Basis

Phase 0.1 roadmap scope: recovery robustness and transport-pressure stability.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

## In Scope

1. Separate cheap liveness heartbeats from durable participation mutation.
2. Coalesce repeated READY publications when no material participation change
   occurred.
3. Ensure deferred dispatch and retry paths remain bounded under storms.
4. Finish pressure relief on the late-response side where signaling still
   amplifies load.

## Out Of Scope

1. The node participation state model itself.
2. Observation/repair separation outside signaling pressure.
3. Priority spread completion semantics.

## Invariants

1. Liveness signaling must remain cheap and bounded.
2. Durable participation mutation must stay canonical and explicit.
3. Join and rejoin storms must not amplify control-plane pressure linearly.

## Hotspots

1. `src/bootstrap/node-joining-service.js`
2. `src/control-plane/replica-dispatch-service.js`
3. `src/transport/message-router.js`
4. Control-plane ingress and deferred retry paths

## Detection / Analysis Tasks

- [x] Inventory which `NODE_STATE_UPDATE` fields require durable mutation and
      which are heartbeat-only.
- [x] Define the split between liveness heartbeat and participation mutation.
- [x] Identify retry and defer loops that amplify pressure during storms.
- [x] Measure where late-response churn still reflects upstream signaling
      design rather than transport-only behavior.

## Implementation Tasks

- [x] Introduce a bounded liveness-only heartbeat path.
- [x] Coalesce or suppress redundant READY mutation writes.
- [x] Tighten deferred retry behavior for repeated node-state publications.
- [x] Add guardrail tests for restart/rejoin storms and late-response volume.

## Validation

1. Targeted unit tests for heartbeat vs mutation behavior.
2. Integration tests for deferred retry and coalescing behavior.
3. Distributed scenarios: `rolling-restart`, `seed-restart-under-load`,
   `partition-kill-heal-under-load`.

## Done When

1. READY heartbeats no longer imply repeated durable metadata mutation.
2. Signaling pressure is bounded under restart and rejoin storms.
3. Remaining late-response warnings are materially lower and easier to
   interpret.
4. Follow-on work, if any, is split into separate packages.
