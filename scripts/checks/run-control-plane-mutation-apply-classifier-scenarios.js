#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const TEST_FILES = Object.freeze([
  'test/control-plane/control-plane-mutation-outcome-classifier.test.js',
  'test/node/replica-local-only-row-convergence.test.js',
  'test/config/dynamic-config-service.test.js',
  'test/bootstrap/node-registration-owner.test.js',
  'test/raft/authoritative-row-mutation-outcome-classifier.test.js',
  'test/raft/authoritative-row-mutation-helper.test.js',
]);

const SCENARIOS = Object.freeze({
  'control-plane-mutation-apply-classifier': TEST_FILES,
  'control-plane-mutation-aggregate-guard': TEST_FILES,
});

runGuardTestScenarios(SCENARIOS);
