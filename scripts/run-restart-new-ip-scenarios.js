#!/usr/bin/env node
/**
 * Runner for the two `restart-new-ip-*` quest scenarios.
 *
 * Executes each scenario's deterministic guard-test suite (the committed
 * proof of the quest statement) and writes a scenario-harness report for
 * the Solver's `scenario-harness` probe; see
 * `scripts/checks/guard-test-scenario-runner.js` for the shared machinery.
 *
 * Scenario -> guard tests:
 *   restart-new-ip-name-first-advertising
 *     - test/transport/node-address-resolution.test.js
 *       (explicit advertised hostname preserved under wildcard bind; stale
 *        bootstrap seed loses to the fresher canonical node_endpoints row)
 *   restart-new-ip-peer-reconnect-unwedge
 *     - test/transport/message-router-endpoint-address-change-redial.test.js
 *       (defect 1: node_endpoints address change triggers close+redial;
 *        defect 2: keepalive pong deadline severs stale-but-open connections)
 *     - test/bootstrap/mesh-reconcile-terminal-revive.test.js
 *       (defect 1: mesh reconcile revives terminal connections on a new address)
 *     - test/transport/node-address-resolution.test.js
 *       (defect 3: stale seedNodeWsAddress vs canonical row precedence)
 *
 * Usage: node scripts/run-restart-new-ip-scenarios.js [scenario]
 *   (default: run both scenarios)
 */

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'restart-new-ip-name-first-advertising': [
    'test/transport/node-address-resolution.test.js',
    'test/transport/name-first-advertising-publication.test.js',
  ],
  'restart-new-ip-peer-reconnect-unwedge': [
    'test/transport/message-router-endpoint-address-change-redial.test.js',
    'test/bootstrap/mesh-reconcile-terminal-revive.test.js',
    'test/transport/node-address-resolution.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
