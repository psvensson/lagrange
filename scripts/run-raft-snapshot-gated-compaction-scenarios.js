#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'raft-snapshot-gated-compaction': [
    'test/raft/snapshot-gated-compaction-contract.test.js',
    'test/raft/snapshot-gated-compaction-catchup.test.js',
    'test/raft/snapshot-gated-compaction-malformed-index.test.js',
    'test/raft/in-memory-log-adapter-contract.test.js',
    'test/raft/raft-log-write-owner.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
