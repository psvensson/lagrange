#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const DOCUMENTATION_CURRENT_STATE_GUARDS = Object.freeze([
  'test/scripts/check-documentation-current-state.test.js',
]);
const SCENARIOS = Object.freeze({
  'documentation-current-state-contract': DOCUMENTATION_CURRENT_STATE_GUARDS,
  'documentation-current-state-clean-replay': DOCUMENTATION_CURRENT_STATE_GUARDS,
});

runGuardTestScenarios(SCENARIOS);
