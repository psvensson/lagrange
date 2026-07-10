#!/usr/bin/env node

import {
  runGuardTestScenarios,
} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'project-hardening-proof-integrity-cutover': [
    'test/scripts/run-test-files.test.js',
    'test/release/public-api-side-effect-boundary.test.js',
    'test/release/project-hardening-contracts.test.js',
    'test/admin/admin-websocket-external-bind-policy.test.js',
    'test/runtime/pgwire-protocol-ordering.test.js',
    'test/compatibility/pgwire-client-compat.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
