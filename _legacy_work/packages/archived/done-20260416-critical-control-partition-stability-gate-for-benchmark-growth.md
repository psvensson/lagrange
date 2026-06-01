# Critical Control-Partition Stability Gate For Benchmark Growth

## Why

The benchmark scenario now creates meaningful load, but it still expects
partition growth while critical control-plane partitions are already spread-
short or visibility-pressured. That couples benchmark growth to a control-plane
state the harness does not yet name explicitly.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define one critical-control-partition stability prerequisite for benchmark
   partition growth and load escalation.
2. Reuse existing critical-partition and readiness owners where possible.
3. Let harness planning throttle or hold steady when that prerequisite is not
   met instead of driving the system over the same cliff.

## Out Of Scope

1. Generic benchmark throttling unrelated to control-plane health.
2. New load-generator policies that duplicate existing readiness or critical-
   partition ownership.

## Invariants

1. Benchmark growth must consume a shared control-plane stability contract, not
   invent a scheduler-local proxy.
2. The prerequisite must be explicit in diagnostics and triage artifacts.
3. The gate must degrade progress smoothly rather than hiding the control-plane
   blocker behind `nodeSlotUnavailable` alone.

## Hotspots

1. `test/distributed/harness/benchmark-partition-convergence.js`
2. `test/distributed/scenarios/table-distribution-helpers.js`
3. `src/control-plane/` critical-partition owners
4. `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`

## Analysis Tasks

- [x] Confirm which critical control partitions must be stable before benchmark
  growth can safely escalate.
- [x] Confirm the current harness still lacks that explicit prerequisite.

## Implementation Tasks

- [x] Define the shared prerequisite snapshot and consume it in benchmark
  growth/planning.
- [x] Emit the prerequisite state in diagnostics.
- [x] Add focused harness and scenario tests.

## Progress Notes

1. Added one shared critical-control-plane stability prerequisite to the
   benchmark convergence/admission owner path in
   `test/distributed/harness/benchmark-partition-convergence.js` and
   `test/distributed/harness/cluster.js`.
2. Partition-growth planning now preserves and consumes that prerequisite in
   `test/distributed/scenarios/table-distribution-helpers.js`, holding
   dispatch on the bootstrap contributor set while the shared control-plane
   gate is still pending.
3. The failure-bundle/triage path now emits
   `criticalControlPlaneStability` directly so artifact-first triage can see
   the gate state and reason codes before sampling raw logs.
4. Focused coverage is green in
   `test/distributed/harness/__tests__/benchmark-partition-convergence.test.js`,
   `test/distributed/harness/__tests__/cluster.test.js`,
   `test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js`,
   `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`,
   and `test/distributed/harness/__tests__/failure-bundle.test.js`.
5. The package remains active until the next checkpoint rerun confirms the
   new gate is visible end-to-end in a live seven-node artifact, but the
   owner surface and diagnostics slice are implemented.

## Validation

1. Passed: `node test/distributed/harness/__tests__/benchmark-partition-convergence.test.js`
2. Passed: `node test/distributed/harness/__tests__/cluster.test.js`
3. Passed: `node test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js`
4. Passed: `node test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`
5. Passed: `node test/distributed/harness/__tests__/failure-bundle.test.js`
6. The next checkpoint rerun is still pending after the triage-surface update.

## Done When

1. Benchmark growth waits or throttles on an explicit critical control-plane
   prerequisite instead of blindly escalating into the same failure loop.
2. Failure artifacts expose that prerequisite directly.
