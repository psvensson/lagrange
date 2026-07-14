#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'pgwire-authentication-cutover';
const REPORT_DIR = 'test-output/reports/pgwire-authentication-cutover';
const TEST_FILES = Object.freeze([
  'test/runtime/pgwire-password-authentication-cutover.test.js',
  'test/runtime/pgwire-descriptor.test.js',
  'test/runtime/pgwire-auth-handler.test.js',
  'test/runtime/pgwire-protocol-handler.test.js',
  'test/runtime/pgwire-runtime-module.test.js',
  'test/runtime/runtime-startup-wiring.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: TEST_FILES,
}, {reportDir: REPORT_DIR});
