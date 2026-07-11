#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'control-plane-readiness-trust-cutover': [
    'test/control-plane/readiness-cycle-cut-dependency-guard.test.js',
    'test/control-plane/node-trust-state.test.js',
    'test/control-plane/canonical-readiness-consumption.test.js',
    'test/query/provision-target-live-transport-rescue.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
