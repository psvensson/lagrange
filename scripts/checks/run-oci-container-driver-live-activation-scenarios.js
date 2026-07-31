#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const REPORT_DIR =
  'test-output/reports/oci-container-driver-live-activation';
// C1.
const SCENARIOS = Object.freeze({
  'oci-host-agent-protocol-admission': Object.freeze([
    'test/runtime/oci-host-agent-protocol-admission.test.js',
  ]),
  'oci-host-agent-durable-state': Object.freeze([
    'test/runtime/oci-host-agent-admission-table.test.js',
    'test/runtime/oci-host-agent-receipt-ledger.test.js',
    'test/runtime/oci-host-agent-enrollment.test.js',
    'test/runtime/oci-host-agent-tpm-counter.test.js',
  ]),
  'oci-host-agent-engine-translation': Object.freeze([
    'test/runtime/oci-host-agent-engine-translation.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS, {reportDir: REPORT_DIR});
