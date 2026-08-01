#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// The callback-axis accretion census guard: the legacy partition_callback
// axis is frozen — production references stay inside the sealed allowlist
// and WasmCallAdapter stays test-only — per the retirement conditions in
// solve/epics/callback-axis-retirement.md.
const SCENARIOS = {
  'callback-axis-accretion-census-v2': [
    'test/contract/callback-axis-accretion.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
