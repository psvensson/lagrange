#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIO =
  'owner-complexity-rebalancer-planning-owner-placement-rebalance-planning';
const GUARD_TESTS = Object.freeze([
  'test/rebalancer/interlock-skip-label-fidelity.test.js',
  'test/rebalancer/priority-recovery-stale-planning-visibility.test.js',
  'test/rebalancer/priority-recovery-follow-up-count-aware-add-gate.test.js',
  'test/rebalancer/priority-recovery-surrogate-single-followup.test.js',
  'test/rebalancer/cl-036-publications-quorum-escape.test.js',
  'test/rebalancer/formation-runtime-service-create-lane-budget-starvation.test.js',
  'test/rebalancer/safety-check-delegation.property.test.js',
  'test/rebalancer/rebalancer-pre-execution-handoff-diagnostic.test.js',
]);

runGuardTestScenarios({[SCENARIO]: GUARD_TESTS});
