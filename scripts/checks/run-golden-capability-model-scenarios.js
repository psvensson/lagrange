#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const MODEL_TLC_MODE_SELECTION_TESTS = [
  'test/scripts/model-tlc-mode-selection.test.js',
];
const SCENARIOS = {
  'model-tlc-mode-selection': MODEL_TLC_MODE_SELECTION_TESTS,
};

runGuardTestScenarios(SCENARIOS);
