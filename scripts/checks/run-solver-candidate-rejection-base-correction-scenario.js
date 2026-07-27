#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'solver-candidate-rejection-base-correction': Object.freeze([
    'test/solve/attempt-base-correction.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
