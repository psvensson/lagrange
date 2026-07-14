#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-portability-claims-surface';
const GUARD_TEST = 'test/scripts/service-portability-claims-contract.test.js';
const REPORT_DIR = 'test-output/reports/service-portability-claims-surface';

runGuardTestScenarios({
  [SCENARIO]: Object.freeze([GUARD_TEST]),
}, {reportDir: REPORT_DIR});
