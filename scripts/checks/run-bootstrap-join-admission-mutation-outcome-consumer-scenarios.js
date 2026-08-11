#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'bootstrap-join-admission-mutation-outcome-consumer': [
    'test/control-plane/control-plane-mutation-outcome-classifier.test.js',
    'test/bootstrap/node-registration-owner.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
