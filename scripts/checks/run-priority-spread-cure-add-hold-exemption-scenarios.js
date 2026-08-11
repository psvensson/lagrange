#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Priority-spread cure-ADD hold-exemption guard: the critical-partition
// create-lane over-target hold must admit exactly the planner-retained
// spread-cure ADD (ADD-only, spread_replicas typed, non-ledger priority
// partition, unoccupied target node, alive-distinct coverage below
// target) and keep holding every other over-target add-like shape —
// otherwise planner and admission encode contradictory policies at one
// knob and priority spread deadlocks at 2/3 on a cold boot (live
// witness public-path-multinode-baseline-20260811T135503Z: 700 held
// cycles alternating with retain_spread_cure_adds, all run).
const SCENARIOS = {
  'priority-spread-cure-add-hold-exemption': [
    'test/rebalancer/rebalance-coordinator-topology-guard.test.js',
    'test/rebalancer/replica-placement-cure-policy.test.js',
    'test/rebalancer/cl-038-surplus-drain-retains-leader-node.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
