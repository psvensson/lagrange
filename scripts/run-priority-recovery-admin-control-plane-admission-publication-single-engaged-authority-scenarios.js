#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

runGuardTestScenarios({
  'priority-recovery-admin-control-plane-admission-publication-single-engaged-authority': [
    'test/admin/admin-control-snapshot-priority-recovery-authority.test.js',
  ],
});
