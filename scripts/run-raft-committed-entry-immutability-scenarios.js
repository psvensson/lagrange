#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'raft-committed-entry-immutability': [
    'test/raft/committed-entry-immutability-contract.test.js',
    'test/raft/committed-entry-immutability.property.test.js',
    'test/raft/sqlite-log-adapter-committed-write-paths.test.js',
    'test/raft/raft-log-write-owner.test.js',
    'test/raft/liferaft-committed-entry-conflict.test.js',
    'test/raft/in-memory-log-adapter-committed-clamp.test.js',
    'test/raft/sqlite-log-adapter-committed-truncation-guard.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
