# Control-Plane Pressure Amplification Boundary-Transition Scenarios

## Why

The current missing-middle layer now exists, but it does not yet cover the
exact late failure chain from the latest seven-node checkpoint:

1. background backlog stays high
2. node-state recovery publications churn
3. operation visibility times out
4. critical control partitions stall
5. benchmark growth remains at one partition

This package captures that exact chain in the cheaper boundary-transition layer
before another full distributed checkpoint rerun.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Add middle-layer scenarios for transport saturation with critical reserve
   preservation.
2. Add scenarios for coalesced node-state recovery publication.
3. Add scenarios for pending/deferred operation visibility under pressure.
4. Add scenarios for benchmark gating on critical control-plane stability.

## Out Of Scope

1. Replacing the existing boundary-transition layer.
2. Another generic integration tier.
3. Seven-node reruns as the primary iteration loop.

## Invariants

1. Scenarios must consume the real shared owners created by the runtime work.
2. Each scenario must name one boundary and one expected canonical transition.
3. The layer must stay materially cheaper than the seven-node checkpoint.

## Hotspots

1. `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`
2. `test/distributed/README.local.md`
3. `work/packages/active-20260415-distributed-boundary-transition-scenario-layer.md`

## Analysis Tasks

- [x] Confirm the current scenario layer does not yet cover the late pressure-
  amplification chain.

## Implementation Tasks

- [x] Add targeted boundary-transition scenarios for the new load-stability
  packages.
- [x] Update validation guidance and package references where needed.

## Progress Notes

1. Extended the middle-layer suite in
   `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`
   so it now covers both the critical control-plane prerequisite gate for
   benchmark growth and the canonical deferred
   `replica_operations` visibility outcome consumed by the rebalancer.
2. Updated the local harness guidance in
   `test/distributed/README.local.md` so artifact-first triage names the new
   `criticalControlPlaneStability` field directly.
3. Focused validation is green via
   `npm run test:distributed:boundary:transition` and
   `node test/distributed/harness/__tests__/failure-bundle.test.js`.
4. The package remains active only in the broadest sense that the full seven-node
   chain is still red; the explicit missing-middle scenarios for the latest
   pressure-amplification boundaries are now in place.

## Validation

1. Passed: `npm run test:distributed:boundary:transition`
2. Passed: `node test/distributed/harness/__tests__/failure-bundle.test.js`

## Done When

1. The late pressure-amplification chain is reproducible and explainable in the
   middle test layer before another seven-node checkpoint rerun.
