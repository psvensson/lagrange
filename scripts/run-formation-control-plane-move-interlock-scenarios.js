#!/usr/bin/env node
/**
 * Runner for the `formation-control-plane-move-interlock` quest scenario.
 *
 * Executes the scenario's deterministic guard-test suite (the committed proof
 * of the quest statement) and writes a scenario-harness report for the
 * Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests (root cause pinned from affinity-demo run-20
 * forensics, data/examples/service-data-affinity-demo-archive/):
 *   formation-control-plane-move-interlock
 *     - test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js
 *       (the run-20 interlock: the replica_operations LEDGER partition's own
 *        REPLACE co-scheduled with sibling control-plane moves pins every
 *        operation non-terminal — zero completions, client CREATE TABLE
 *        starved. The fix serializes the ledger self-move at operation
 *        admission: a synchronous coordinator interlock closes the
 *        concurrent-create race between parallel per-entity rebalancer loops,
 *        and the async observation lane covers cross-source/cross-cycle
 *        admission. Guarded shapes: sequential storm both dispatch orders,
 *        fully CONCURRENT dispatch, serialized-control completion under the
 *        identical ledger fault model, determinism, real workflow chains.)
 *
 * Usage: node scripts/run-formation-control-plane-move-interlock-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'formation-control-plane-move-interlock': [
    'test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
