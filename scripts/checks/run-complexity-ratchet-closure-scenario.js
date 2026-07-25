#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const COMPLEXITY_RATCHET_GUARDS = Object.freeze([
  'test/scripts/complexity-ratchet-closure.test.js',
]);
const SCENARIOS = Object.freeze({
  'complexity-ratchet-closure-wave1-v2': COMPLEXITY_RATCHET_GUARDS,
});

runGuardTestScenarios(SCENARIOS);
