#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// Fixture-liveness guard for the priority-spread cure admission hold. The
// unavailable-read twin stays green because the hold fails open; the new
// available-read twin returns the real [A,A,A,B] rows and therefore reaches
// the over-target decision. Against d999ca2d4^, only that twin's admission
// and persistence assertions fail, proving the fixture exercises the hold's
// exemption instead of bypassing it.
const SCENARIOS = {
  'priority-spread-cure-available-read-guard': [
    'test/rebalancer/critical-spread-terminal-stall-repro.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
