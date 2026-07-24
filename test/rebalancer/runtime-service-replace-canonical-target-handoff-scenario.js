#!/usr/bin/env node

import {fileURLToPath} from 'node:url';

import {runGuardTestScenarios} from
  '../../scripts/checks/guard-test-scenario-runner.js';

const RUNTIME_SERVICE_REPLACE_CANONICAL_TARGET_HANDOFF_SCENARIO =
  'runtime-service-replace-canonical-target-handoff';
const REPORT_DIR = 'test-output/reports';
const TEST_FILES = Object.freeze([
  'test/rebalancer/runtime-service-replace-canonical-target-handoff.test.js',
  'test/rebalancer/runtime-service-target-claim.test.js',
  'test/partition/replica-operations-target-claim-schema-migration.test.js',
  'test/rebalancer/runtime-service-legacy-target-reconciliation.test.js',
  'test/rebalancer/operation-workflow-active-cache-handoff.test.js',
  'test/node/runtime-service-handler.test.js',
  'test/rebalancer/replace-replica-workflow.test.js',
]);

function runRuntimeServiceReplaceCanonicalTargetHandoffScenario() {
  runGuardTestScenarios({
    [RUNTIME_SERVICE_REPLACE_CANONICAL_TARGET_HANDOFF_SCENARIO]: TEST_FILES,
  }, {reportDir: REPORT_DIR});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRuntimeServiceReplaceCanonicalTargetHandoffScenario();
}

export {
  RUNTIME_SERVICE_REPLACE_CANONICAL_TARGET_HANDOFF_SCENARIO,
  runRuntimeServiceReplaceCanonicalTargetHandoffScenario,
};
