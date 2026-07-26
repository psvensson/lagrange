#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'scale-certification-evidence-contract': [
    'test/distributed/harness/__tests__/scale-evidence-contract.test.js',
    'test/distributed/harness/__tests__/snapshot-live-rebuild-scenario-shape.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
