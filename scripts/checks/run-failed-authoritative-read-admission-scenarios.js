#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'failed-authoritative-read-admission-invariant': [
    'test/rebalancer/failed-authoritative-read-admission-verdict.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
