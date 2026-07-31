#!/usr/bin/env node

import {
  runGuardTestScenarios,
} from './guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'cold-node-authority-reacquisition-pressure': Object.freeze([
    'test/bootstrap/cold-node-authority-reacquisition-pressure.test.js',
    'test/distributed/harness/__tests__/failure-bundle.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
