#!/usr/bin/env node
/**
 * Runner for the `cross-partition-join-pushdown` quest scenario.
 *
 * Executes the committed guard suites proving cross-partition JOIN
 * pushdown — join-table WHERE conjuncts, column projection, and the
 * join-key IN semi-filter delivered in the per-partition SQL with
 * oracle-identical join results and reduced join-table row transfer —
 * and writes a scenario-harness report for the Solver's probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the machinery.
 *
 * Scenario -> guard tests:
 *   cross-partition-join-pushdown
 *     - test/query/cross-partition-join-pushdown.test.js
 *       (real-SQLite partition execution of the delivered join-table
 *        SQL: pushed WHERE/IN/projection assertions, LEFT JOIN
 *        no-push semantics, row-transfer reduction, oracle equality)
 *     - test/query/cross-partition-join.property.test.js
 *       (property suite over the cross-partition JOIN execution path)
 *
 * Usage: node scripts/run-cross-partition-join-pushdown-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'cross-partition-join-pushdown': [
    'test/query/cross-partition-join-pushdown.test.js',
    'test/query/cross-partition-join.property.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
