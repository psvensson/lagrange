#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'cl-planning-memo-invalidation';
const GUARD_TESTS = [
  'test/control-plane/cl-033-planning-projection-memo.test.js',
  'test/control-plane/cl-034-planning-snapshot-merge-memo.test.js',
];
const REPORT_DIR = 'test-output/reports/cl-planning-memo-invalidation';

runGuardTestScenarios({
  [SCENARIO]: Object.freeze(GUARD_TESTS),
}, {reportDir: REPORT_DIR});
