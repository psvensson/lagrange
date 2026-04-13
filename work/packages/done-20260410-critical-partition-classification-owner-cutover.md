# Critical Partition Classification Owner Cutover

## Why

Move planning still keeps an older fallback detector for critical partitions
when the newer provider contract is unavailable.

That compatibility branch may be temporary, but classification for this concern
should still converge on one owner contract.

## Scope Basis

Phase 0.1 roadmap scope: topology workflow stabilization and control-plane
recovery correctness.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-RB-007`

## In Scope

1. Define the canonical critical-partition classifier contract.
2. Route move planning through that contract.
3. Remove the older priority-control-plane fallback detector.

## Out Of Scope

1. Query provisioning degraded cohort policy.
2. Repository read-policy collapse.
3. Bootstrap leader-identity bridges.

## Invariants

1. Critical partition classification has one owner contract.
2. Move planning does not keep two semantic detectors alive.
3. Compatibility branches are removed rather than normalized.

## Hotspots

1. `src/rebalancer/move-planner.js`
2. Critical-partition provider/consumer tests

## Detection / Analysis Tasks

- [x] Enumerate current classifier providers and consumers.
- [x] Define the canonical provider contract move planning should require.
- [x] Confirm whether any remaining callers still depend on the older detector.

## Implementation Tasks

- [x] Cut move planning over to the canonical classifier contract.
- [x] Remove the older fallback detector.
- [x] Add guardrail tests for critical and non-critical partition planning.

## Validation

1. Move planner unit tests.
2. Rebalancer integration tests covering critical partition behavior.
3. Distributed recovery scenarios that exercise critical partitions.

## Done When

1. Critical partition classification uses one owner contract.
2. The older fallback detector is removed.
3. Move planning behavior remains deterministic and tested.
