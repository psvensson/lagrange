#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

runGuardTestScenarios({
  'priority-recovery-control-plane-normalize-distinct-string-array-authority': [
    'test/control-plane/publication-recovery-normalization-authority.test.js',
  ],
});
