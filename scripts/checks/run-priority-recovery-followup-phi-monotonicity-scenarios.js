#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIO = 'priority-recovery-followup-phi-monotonicity';
const GUARD_TESTS = [
  'test/convergence/dt-priority-recovery-followup-stabilization-phi.test.js',
];
const REPORT_DIR =
  'test-output/reports/priority-recovery-followup-phi-monotonicity';

runGuardTestScenarios({
  [SCENARIO]: Object.freeze(GUARD_TESTS),
}, {reportDir: REPORT_DIR});
