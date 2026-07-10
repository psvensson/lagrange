#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'provisioning-parent-deadline-cutover': [
    'test/query/sql-query-engine-provisioning-parent-deadline.test.js',
    'test/query/provisioning-parent-deadline-dependency-guard.test.js',
    'test/query/sql-query-engine-provision-progress-gated-rewait.test.js',
    'test/query/sql-query-engine-provision-ledger-hold-transient-wait.test.js',
    'test/query/table-creation-service.test.js',
    'test/query/sql-query-engine-partition-readiness-waits.test.js',
    'test/admin/admin-websocket-api.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
