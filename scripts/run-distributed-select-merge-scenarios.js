#!/usr/bin/env node
/**
 * Runner for the `distributed-select-global-merge-correctness` quest
 * scenario.
 *
 * Executes the committed guard suites proving distributed SELECT
 * global-merge semantics — combinable partial aggregates, GROUP BY /
 * HAVING combination, and exactly-once LIMIT/OFFSET — against real
 * per-partition SQLite execution of the delivered SQL, and writes a
 * scenario-harness report for the Solver's probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the machinery.
 *
 * Scenario -> guard tests:
 *   distributed-select-global-merge-correctness
 *     - test/query/distributed-select-global-merge-correctness.test.js
 *       (real-SQLite partition execution of delivered SQL; the
 *        raw-row-mock fidelity gap shipped COUNT(*)=partition-count)
 *     - test/query/aggregate-function-correctness.property.test.js
 *       (property suite, now routed through the SQL-honoring mock)
 *     - test/query/distributed-merge-engine.test.js
 *       (merge-engine global ORDER/LIMIT semantics)
 *
 * Usage: node scripts/run-distributed-select-merge-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'distributed-select-global-merge-correctness': [
    'test/query/distributed-select-global-merge-correctness.test.js',
    'test/query/aggregate-function-correctness.property.test.js',
    'test/query/distributed-merge-engine.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
