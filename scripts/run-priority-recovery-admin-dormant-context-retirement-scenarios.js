#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const GUARD_TESTS = Object.freeze([
  'test/admin/admin-control-snapshot-priority-recovery-authority.test.js',
  'test/admin/admin-control-snapshot-priority-recovery-dormant-context-retirement.test.js',
]);

runGuardTestScenarios({
  'priority-recovery-admin-dormant-context-retirement': GUARD_TESTS,
});
