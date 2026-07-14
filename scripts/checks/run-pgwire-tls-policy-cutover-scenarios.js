#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'pgwire-tls-policy-cutover';
const REPORT_DIR = 'test-output/reports/pgwire-tls-policy-cutover';
const TEST_FILES = Object.freeze([
  'test/runtime/pgwire-tls-policy-cutover.test.js',
  'test/runtime/pgwire-descriptor.test.js',
  'test/runtime/pgwire-protocol-handler.test.js',
  'test/runtime/pgwire-runtime-module.test.js',
  'test/runtime/runtime-startup-wiring.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
