#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  'raft-authoritative-row-mutation-outcome-classifier': [
    'test/control-plane/control-plane-mutation-outcome-classifier.test.js',
    'test/raft/authoritative-row-mutation-outcome-classifier.test.js',
    'test/raft/authoritative-row-mutation-helper.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
