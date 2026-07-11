#!/usr/bin/env node

import {runGuardTestScenarios} from './checks/guard-test-scenario-runner.js';

const SCENARIOS = {
  'durable-provisioning-job-owner': [
    'test/bootstrap/schema-operations-table-schema.test.js',
    'test/workflow/durable-workflow-storage-ownership.test.js',
    'test/query/schema-provisioning-job-owner.test.js',
    'test/query/durable-provisioning-job-owner-directed.test.js',
    'test/query/durable-provisioning-job-owner-guard.test.js',
    'test/query/table-creation-service.test.js',
    'test/query/sql-query-engine-provision-partition-waits.test.js',
    'test/rebalancer/rebalance-coordinator-operation-ownership.test.js',
    'test/admin/admin-websocket-api.test.js',
    'test/runtime/pgwire-protocol-handler.test.js',
    'test/runtime/pgwire-schema-provisioning-job.test.js',
  ],
};

runGuardTestScenarios(SCENARIOS);
