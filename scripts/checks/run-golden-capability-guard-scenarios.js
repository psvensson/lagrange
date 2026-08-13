#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// CI-owned regression tier for the historical flip-flop contracts named by
// the golden-capability epic. These are deliberately the real owning tests,
// not copied assertions: the tier makes every push re-execute the guard that
// originally proved each capability and emits scenario-harness receipts.
const SCENARIOS = {
  'golden-capability-guard-scenario-gate-wiring': [
    // Gate ownership: removing the command from either acceptance manifest
    // makes the first guard red before the historical contracts execute.
    'test/release/project-hardening-contracts.test.js',
    // CL-016 / CL-021: durable priority-row publication and retry ownership.
    'test/node/replica-local-only-row-convergence.test.js',
    // CL-035: voter-ready role publication.
    'test/control-plane/cl-035-voter-ready-row-seed.test.js',
    // CL-038: removed-source handoff termination.
    'test/rebalancer/cl-038-source-removed-handoff-terminalizes.test.js',
    // CL-043: stale-operation and completed-election escape shapes.
    'test/rebalancer/operation-workflow-remove-safety-concurrent-stale-phantom.test.js',
    'test/rebalancer/cl-043-surplus-drain-completed-election-terminalizes.test.js',
    // 814f547e0: over-target hold and spread-cure admission premise.
    'test/rebalancer/rebalance-coordinator-topology-guard.test.js',
    'test/rebalancer/replica-placement-cure-policy.test.js',
    'test/rebalancer/critical-spread-terminal-stall-repro.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
