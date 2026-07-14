#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-lifecycle-pgwire-executor-handoff';
const REPORT_DIR =
  'test-output/reports/service-lifecycle-pgwire-executor-handoff';
const TEST_FILES = Object.freeze([
  'test/runtime/service-lifecycle-pgwire-executor-handoff.test.js',
  'test/runtime/service-runtime-lifecycle.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
