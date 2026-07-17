#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'service-portability-claims-example-fixture-alignment';
const GUARD_TEST =
  'test/distributed/harness/__tests__/examples-catalog-scenario.test.js';
const REPORT_DIR =
  'test-output/reports/service-portability-claims-example-fixture-alignment';

runGuardTestScenarios({
  [SCENARIO]: Object.freeze([GUARD_TEST]),
}, {reportDir: REPORT_DIR});
