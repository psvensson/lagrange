#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'control-plane-mutation-replica-config-consumers': [
    'test/control-plane/control-plane-mutation-outcome-classifier.test.js',
    'test/config/dynamic-config-service.test.js',
    'test/node/replica-local-only-row-convergence.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
