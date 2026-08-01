#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'rolling-restart-fresh-formation-node-authority-deferred-read':
    Object.freeze([
      'test/control-plane/system-metadata-owner-modules.test.js',
      'test/control-plane/replica-dispatch-node-authority-deferred-read.test.js',
    ]),
});

runGuardTestScenarios(SCENARIOS);
