#!/usr/bin/env node

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'operation-dispatch-completion-owner-cutover': Object.freeze([
    'test/control-plane/replica-dispatch-add-creating-owner-rearm.test.js',
    'test/control-plane/replica-dispatch-runtime-target-progress-retained-verification.test.js',
    'test/rebalancer/operation-workflow-delivered-create-progress-retention.test.js',
    'test/scripts/check-operation-dispatch-completion-owner.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
