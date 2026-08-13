#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = {
  // Guards the owner-scope classification fix: a solve/epics/*.md planning
  // memo must classify as documentation, not workflow tooling, so a runtime
  // process Quest that cites it in links.planDoc is not mis-scoped.
  'solver-scope-classification-epic-citation': [
    'test/solve/audit.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
