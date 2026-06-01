# Local Distributed Harness Timing Budget Reduction

## Why

The local distributed Docker harness still carries several timing budgets that
were sized for slower or less predictable environments.

On the canonical local profiles, those budgets stretch scenario runtime and
failure tails even though the nodes share one machine and use the fast local
harness path.

## Scope Basis

Phase 0.1 roadmap scope: failure-simulation robustness and local validation
discipline for control-plane recovery work.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../../sprints/archived/done-2026-q2-control-plane-recovery-architecture.md)

## In Scope

1. Reduce local distributed scenario timing budgets where the extra wait does
   not change the scenario's recovery intent.
2. Route direct harness admin-query defaults through the same local benchmark
   control-timeout owner used by the NodeClient policy path.
3. Preserve recovery assertions, convergence gates, and consistency checks.

## Out Of Scope

1. Production control-plane timing changes.
2. GCP or remote-host harness timing budgets.
3. Weakening scenario acceptance thresholds to compensate for shorter waits.

## Invariants

1. Local runtime reduction must come from smaller harness waits, not weaker
   correctness assertions.
2. One local control-query timeout owner must drive both NodeClient and direct
   harness admin requests.
3. Scenario load windows must still cover the intended failure or recovery
   interval.

## Hotspots

1. `test/distributed/config/local.json`
2. `test/distributed/config/local-three-node.json`
3. `test/distributed/harness/cluster.js`
4. `test/distributed/harness/__tests__/cluster.test.js`

## Detection / Analysis Tasks

- [x] Measure the major fixed waits and timeout tails in the local recovery
      scenarios.
- [x] Identify which waits are config-owned versus hard-coded inside the
      harness.

## Implementation Tasks

- [x] Reduce canonical local scenario timing budgets for the 5-node and 3-node
      Docker configs.
- [x] Route direct harness admin requests through the local benchmark
      control-timeout owner.
- [x] Add regression coverage for the shared timeout owner path and the local
      timing overrides.

## Validation

- [x] `node test/distributed/harness/__tests__/cluster.test.js`
- [x] `node test/distributed/harness/__tests__/config-parser.test.js`
- [x] `node test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
- [x] `node test/distributed/harness/__tests__/seed-restart-under-load-scenario.test.js`
- [x] `node test/distributed/harness/__tests__/node-join-under-load-scenario.test.js`
- [x] Distributed scenarios: `rolling-restart`, `seed-restart-under-load`,
      `node-join-under-load`

## Results

1. Direct harness admin requests now inherit `benchmark.controlQueryTimeoutMs`,
   so NodeClient and raw `NodeHandle` control probes share one local timeout
   owner. The finalized local owner remains `15000ms`; the shorter `8000ms`
   trial changed live failure classification and was discarded.
2. Tightened local timing budgets reduced fixed runtime materially without
   relaxing assertions:
   `rolling-restart` dropped from `613943ms` to `497207ms`,
   `seed-restart-under-load` dropped from `124195ms` to `92940ms`,
   and `node-join-under-load` dropped from `406143ms` to `304859ms`.
3. `rolling-restart` and `node-join-under-load` both pass on the reduced
   profile.
4. `seed-restart-under-load` remains red, but with full snapshot coverage and
   published membership
   (`snapshotCoverage=5/5`,
   `publication=PUBLISHED`,
   `priority_control_plane_spread_pending`,
   `priorityRecoveryState=recovering_in_flight`), which keeps the failure in
   the live recovery/topology-settling lane instead of a harness-timeout lane.

## Done When

1. The canonical local configs finish faster because explicit harness waits are
   smaller, not because assertions were relaxed.
2. One local control-query timeout owner drives NodeClient and direct harness
   admin probes.
3. The local recovery scenarios preserve or improve their live verdicts under
   the reduced timing budgets, and any remaining failures keep the pre-existing
   recovery signatures instead of new harness-timeout regressions.
