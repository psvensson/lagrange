#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'comparative-efficiency-opportunity-calculator': [
    'test/diagnostics/comparative-efficiency-opportunity-calculator.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
