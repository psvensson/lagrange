#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Guard for the owner-boundary frontier: no parallel topology cache
// (stateless pass-through resolution), no second scheduler (the invoker
// exposes invocation only; activation demand is a bounded lease row the
// placement planner consumes), no caller placement (the invoke request
// carries no node input), and capacity stays pinned to the immutable
// Binding artifact through the existing route re-assert.
const SCENARIOS = {
  'data-local-call-owner-boundaries': [
    'test/service/data-local-owner-boundaries.test.js',
    'test/bootstrap/call-cell-invocation-setup.test.js',
    'test/rebalancer/call-activation-pin-planning.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
