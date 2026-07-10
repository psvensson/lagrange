#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'solver-terminal-integrity-cutover': [
    'test/solve/solver-terminal-integrity-cutover.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
