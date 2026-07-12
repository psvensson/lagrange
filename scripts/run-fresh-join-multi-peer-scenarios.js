#!/usr/bin/env node
/**
 * Runner for the `fresh-join-multi-peer-contact` quest scenario.
 *
 * Executes the committed guard suite proving the quest statement and writes
 * a scenario-harness report for the Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests:
 *   fresh-join-multi-peer-contact
 *     - test/bootstrap/fresh-join-multi-peer-contact.test.js
 *       (candidate-list parsing, probe fallback selection, decision shape,
 *        ContactSeedPhase retry rotation across candidates)
 *     - test/bootstrap/fresh-join-via-non-seed-node.integration.test.js
 *       (in-process cluster: fresh join with a dead first candidate
 *        completes through the second, non-seed node)
 *
 * Usage: node scripts/run-fresh-join-multi-peer-scenarios.js
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'fresh-join-multi-peer-contact': [
    'test/bootstrap/fresh-join-multi-peer-contact.test.js',
    'test/bootstrap/fresh-join-via-non-seed-node.integration.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
