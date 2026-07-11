#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const GUARD_TESTS = Object.freeze([
  'test/admin/admin-control-snapshot-priority-recovery-authority.test.js',
]);

runGuardTestScenarios({
  'priority-recovery-admin-control-plane-admission-publication-single-engaged-authority':
    GUARD_TESTS,
});
