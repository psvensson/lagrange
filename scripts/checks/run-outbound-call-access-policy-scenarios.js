#!/usr/bin/env node

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

// doneWhen guard for the outbound-call-access-policy quest: the schema-v2
// calls allowlist (normalization, bounds, wildcard/self-reference/duplicate
// refusals, v1 compatibility with empty outbound calls, byte-identical
// replay idempotency, conflicting replay fail-closed) across the policy
// owner, the lifecycle SQL control surface, the command-owner result row,
// the live CONFIGURE SERVICE ACCESS path, and the untouched v1 example
// contracts.
const SCENARIOS = {
  'outbound-call-access-policy': [
    'test/control-plane/runtime-access-policy-owner.test.js',
    'test/query/service-lifecycle-sql-control-surface.test.js',
    'test/service/service-lifecycle-command-owner.test.js',
    'test/integration/minimal-deployment-runtime-access-policy-live-validation.integration.test.js',
    'test/examples/js-request-binding-example.test.js',
    'test/examples/minimal-deployment-request-binding-example.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
