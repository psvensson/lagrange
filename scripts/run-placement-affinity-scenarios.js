#!/usr/bin/env node
/**
 * Runner for the service↔data affinity placement quest scenarios
 * (epic: solve/epics/service-data-affinity-placement.md).
 *
 * Executes each scenario's deterministic guard-test suite (the committed
 * proof of the quest statement) and writes a scenario-harness report for
 * the Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests:
 *   service-read-locality-policy
 *     - test/query/service-read-locality-routing.test.js
 *       (service_definitions.read_locality column end-to-end: schema +
 *        serialize/deserialize + create/update validation + engine
 *        policy resolution + executeSelect threading + candidate
 *        ordering local-node/same-group first, policy-off unchanged)
 *   placement-data-affinity-tier1b
 *     - test/convergence/dt-placement-affinity-tier1b-kernel.test.js
 *       (DATA_AFFINITY dimension + in-score incumbent movement-cost in
 *        the real placement kernel, driven through the REAL MovePlanner:
 *        gradient above the margin moves the service toward its data,
 *        gradient below is damped to zero moves, gated-off output
 *        unchanged)
 *
 * Usage: node scripts/run-placement-affinity-scenarios.js [scenario]
 *   (default: run all scenarios)
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'service-read-locality-policy': [
    'test/query/service-read-locality-routing.test.js',
  ],
  'placement-data-affinity-tier1b': [
    'test/convergence/dt-placement-affinity-tier1b-kernel.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
