#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'helm-admin-default-deny-contract': [
    'test/helm/lagrange-node-admin-default-deny.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
