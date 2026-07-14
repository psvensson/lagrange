#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-lifecycle-authoritative-sql-handoff';
const REPORT_DIR =
  'test-output/reports/service-lifecycle-authoritative-sql-handoff';
const TEST_FILES = Object.freeze([
  'test/bootstrap/shared/startup-sql-runtime-handoff.test.js',
  'test/bootstrap/bootstrap-sequence.test.js',
  'test/bootstrap/node-joining-service-join-lifecycle-resume.test.js',
  'test/query/service-lifecycle-sql-control-surface.test.js',
  'test/runtime/service-lifecycle-pgwire-executor-handoff.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
