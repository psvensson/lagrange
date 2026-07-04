#!/usr/bin/env node
/**
 * Runner for the `sql-statement-parser-coverage` quest scenario.
 *
 * Executes the coverage-matrix guard suite (the committed proof of the
 * quest statement) and writes a scenario-harness report for the Solver's
 * `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests:
 *   sql-statement-parser-coverage
 *     - test/partition/sql-statement-parser-coverage-matrix.test.js
 *       (every emitted INSERT variant x every SQL-text parser seam —
 *        run-18 witness: one seam missing OR IGNORE emitted '?' garbage)
 *     - test/partition/partition-cdc-parameterized-insert-or-ignore.test.js
 *       (the original run-18 regression guard)
 *
 * Usage: node scripts/run-sql-parser-coverage-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'sql-statement-parser-coverage': [
    'test/partition/sql-statement-parser-coverage-matrix.test.js',
    'test/partition/partition-cdc-parameterized-insert-or-ignore.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
