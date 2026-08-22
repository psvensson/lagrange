/**
 * Scenario runner for the failed-replica-removal-transition-tolerance quest.
 *
 * Binds the contract that a replica stranded in SYNCING (failed ADD,
 * voter-ready timeout) accepts its cleanup removal transition while FAILED
 * stays terminal for lifecycle writes, plus the state-machine suites that pin
 * the whole transition matrix and the handler paths that consume it.
 */

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const TOLERANCE_GUARDS = Object.freeze([
  'test/node/failed-replica-removal-transition-tolerance.test.js',
  'test/node/replica-state-machine.test.js',
  'test/node/replica-state-machine-transitions.property.test.js',
  'test/node/replica-state-delegation.test.js',
  'test/node/replica-lifecycle-manager.test.js',
]);

const SCENARIOS = Object.freeze({
  'failed-replica-removal-transition-tolerance-main': TOLERANCE_GUARDS,
  'failed-replica-removal-transition-tolerance': TOLERANCE_GUARDS,
});

runGuardTestScenarios(SCENARIOS);
