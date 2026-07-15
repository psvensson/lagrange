#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const REPORT_DIR =
  'test-output/reports/oci-container-driver-live-activation';
// C1.
const SCENARIOS = Object.freeze({
  'oci-host-agent-protocol-admission': Object.freeze([
    'test/runtime/oci-host-agent-protocol-admission.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS, {reportDir: REPORT_DIR});
