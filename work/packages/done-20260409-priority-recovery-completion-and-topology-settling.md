# Priority Recovery Completion And Topology-Settling Invariants

## Why

The remaining reds show priority partitions stuck in `recovering_in_flight`
with `REPLACE` operations already at `ACTIVE`, while published spread is still
unsatisfied and planning continues to block on `topology_operations_in_flight`.

The system needs one explicit owner for the invariant "does this in-flight
operation still satisfy the spread obligation?"

## Scope Basis

Phase 0.1 roadmap scope: topology workflow stabilization and deterministic
control-plane recovery.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-CP-007`

## In Scope

1. Define explicit completion semantics for in-flight priority recovery
   operations.
2. Distinguish "in flight and satisfying spread" from "in flight but still
   blocking spread".
3. Rework topology-settling blockers to consume that invariant instead of raw
   operation presence.
4. Re-arm or demote stale recovery operations deterministically.

## Out Of Scope

1. The node participation state model.
2. Read-path observation and repair separation.
3. Transport pressure and READY-heartbeat decoupling.

## Invariants

1. Spread obligations must have a single completion owner.
2. In-flight `ACTIVE` operations are not automatically equivalent to recovered
   spread.
3. Failed or stale recovery operations must become explicit next actions, not
   limbo.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/rebalancer/unified-rebalancer.js`
3. `src/rebalancer/rebalance-coordinator.js`
4. `src/rebalancer/operation-workflow-owner.js`
5. `src/rebalancer/replica-operation-repository.js`

## Detection / Analysis Tasks

- [x] Extract the current spread-completion rules for in-flight priority ops.
- [x] Define the explicit completion invariant and reason codes.
- [x] Identify where topology-settling currently blocks on raw op presence.
- [x] Identify rearm and demotion paths for stale or ineffective recovery ops.

## Implementation Tasks

- [x] Introduce the explicit priority-recovery completion invariant.
- [x] Route topology-settling and recovery diagnostics through it.
- [x] Rework rearm and demotion behavior for stale recovery ops.
- [x] Add guardrail tests for `ACTIVE` replace operations that do and do not
      satisfy spread.

## Validation

1. Targeted unit tests for completion and blocker classification.
2. Integration tests for rearm and stale-operation handling.
3. Distributed scenarios: `rolling-restart`, `seed-restart-under-load`,
   `sustained-write-throughput`.

## Done When

1. Priority recovery spread has an explicit completion invariant.
2. Topology-settling uses that invariant instead of raw op presence.
3. Stale recovery ops become deterministic next actions.
4. Follow-on work, if any, is split into separate packages.
