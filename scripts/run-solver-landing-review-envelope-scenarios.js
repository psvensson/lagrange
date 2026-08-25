#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIO = 'solver-landing-review-envelope';
const SUCCESSOR_SCENARIO = 'solver-landing-review-envelope-v3';
const OWNERSHIP_SUCCESSOR_SCENARIO = 'solver-landing-review-envelope-v4';
const IMMUTABLE_RUNTIME_SUCCESSOR_SCENARIO =
  'solver-landing-review-envelope-v5';
const ORDERED_SOURCE_SUCCESSOR_SCENARIO =
  'solver-landing-review-envelope-v6';
const CLEAN_ORDERED_SUCCESSOR_SCENARIO =
  'solver-landing-review-envelope-v7';
const GUARD_FILES = Object.freeze([
  'test/solve/landing-envelope-contract.test.js',
  'test/solve/operator-workflow.test.js',
  'test/solve/coupled-pair-review-binding.test.js',
  'test/solve/next.test.js',
  'test/solve/quest-lint.test.js',
  'test/solve/honesty.test.js',
  'test/solve/verification-template-suggest.test.js',
]);

runGuardTestScenarios({
  [SCENARIO]: GUARD_FILES,
  [SUCCESSOR_SCENARIO]: GUARD_FILES,
  [OWNERSHIP_SUCCESSOR_SCENARIO]: GUARD_FILES,
  [IMMUTABLE_RUNTIME_SUCCESSOR_SCENARIO]: GUARD_FILES,
  [ORDERED_SOURCE_SUCCESSOR_SCENARIO]: GUARD_FILES,
  [CLEAN_ORDERED_SUCCESSOR_SCENARIO]: GUARD_FILES,
});
