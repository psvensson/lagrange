#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const DOCUMENTATION_CURRENT_STATE_GUARDS = Object.freeze([
  'test/scripts/check-documentation-current-state.test.js',
]);
const ROADMAP_AUTHORITY_GUARDS = Object.freeze([
  'test/scripts/check-doc-audience.test.js',
  'test/scripts/check-documentation-current-state.test.js',
  'test/scripts/check-roadmap-authority.test.js',
]);
const SCENARIOS = Object.freeze({
  'documentation-current-state-contract': DOCUMENTATION_CURRENT_STATE_GUARDS,
  'documentation-current-state-clean-replay': DOCUMENTATION_CURRENT_STATE_GUARDS,
  'roadmap-audience-authority-cutover': ROADMAP_AUTHORITY_GUARDS,
});

runGuardTestScenarios(SCENARIOS);
