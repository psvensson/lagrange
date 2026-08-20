#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'terminal-create-runtime-lifecycle-fence-v2': [
    'test/node/replica-handler-owner-path-bypass.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
