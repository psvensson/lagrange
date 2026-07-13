#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'llm-steering-operator-orientation-isolated-evidence': Object.freeze([
    'test/solve/doctor.test.js',
    'test/solve/agent-executor.test.js',
    'test/solve/next.test.js',
  ]),
  'llm-steering-supervisor-actions-isolated-evidence': Object.freeze([
    'test/solve/continuation.test.js',
    'test/solve/loop.test.js',
  ]),
  'llm-steering-authoring-contract-isolated-evidence': Object.freeze([
    'test/solve/quest-lint.test.js',
    'test/solve/honesty.test.js',
    'test/solve/seal-freshness.test.js',
    'test/solve/cli.test.js',
  ]),
  'llm-steering-complete-rule-surface': Object.freeze([
    'test/scripts/generate-steering-llm-pack.test.js',
    'test/scripts/lookup-rule.test.js',
  ]),
  'llm-steering-verification-handoff': Object.freeze([
    'test/solve/verification-handoff.test.js',
    'test/solve/audit.test.js',
    'test/solve/handoff.test.js',
    'test/solve/findings.test.js',
    'test/solve/next.test.js',
  ]),
  'llm-steering-canon-legacy-report': Object.freeze([
    'test/solve/steering-canon.test.js',
    'test/solve/quest-lint.test.js',
    'test/scripts/generate-steering-llm-pack.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS, {
  reportDir: 'test-output/reports/llm-steering-usability',
});
