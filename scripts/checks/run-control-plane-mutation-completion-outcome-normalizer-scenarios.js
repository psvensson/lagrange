#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'control-plane-mutation-completion-outcome-normalizer': [
    'test/control-plane/control-plane-mutation-outcome-classifier.test.js',
    'test/control-plane/control-plane-system-table-gateway.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
