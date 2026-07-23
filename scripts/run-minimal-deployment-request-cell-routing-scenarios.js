#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO = 'minimal-deployment-request-cell-routing';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/service/minimal-deployment-request-cell-routing.test.js',
  'test/service/service-dispatcher.test.js',
  'test/node/runtime-service-handler.test.js',
  'test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js',
  'test/transport/message-router-late-response-classification.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
