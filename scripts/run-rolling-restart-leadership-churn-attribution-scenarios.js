#!/usr/bin/env node

import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'rolling-restart-leadership-churn-attribution': Object.freeze([
    'test/distributed/harness/__tests__/full-node-log-capture.test.js',
    'test/distributed/harness/__tests__/docker-provider.test.js',
    'test/distributed/harness/__tests__/' +
      'cluster-log-incarnation-restart-order.test.js',
    'test/distributed/harness/__tests__/' +
      'cluster-quiescence-observer-cohort.test.js',
    'test/partition/partition-service-raft-transition-evidence.test.js',
    'test/scripts/' +
      'rolling-restart-leadership-churn-attribution.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
