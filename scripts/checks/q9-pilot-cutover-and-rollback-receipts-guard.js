#!/usr/bin/env node

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTokenCheckGuard} from
  './q2-call-selector-typed-parameter-narrowing-guard.js';

const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const CURRENT_DIR_PATH = path.dirname(CURRENT_FILE_PATH);
const ROOT_DIR_PATH = path.resolve(CURRENT_DIR_PATH, '../..');

const CONTRACT_REL_PATH =
  'src/control-plane/owners/pilot-cutover-workflow-contract.js';
const OWNER_REL_PATH =
  'src/control-plane/owners/pilot-cutover-workflow-owner.js';
const ROUTER_REL_PATH = 'src/cli/cutover-router.js';
const TEST_REL_PATH =
  'test/control-plane/q9-pilot-cutover-and-rollback-receipts.test.js';

const CONTRACT_REQUIRED_TOKENS = Object.freeze([
  'CUTOVER_WORKFLOW_STATE',
  'CUTOVER_RECEIPT_STEP',
  'CUTOVER_DECISION_VERDICT',
  'CUTOVER_ERROR_CODE',
  'PilotCutoverError',
  'ALLOWED_CUTOVER_TRANSITIONS',
  'validateMigrationPlan',
  'validateChangeFeedRecord',
  'assertLegalCutoverTransition',
  'POSITION_REGRESSION',
  'OUT_OF_ORDER_CHANGE',
  'SCHEMA_DRIFT',
  'TARGET_OUTAGE',
  'PARITY_MISMATCH',
  'CUTOVER_TIMEOUT',
  '_pilot_cutover_plans',
  '_pilot_cutover_receipts',
]);

const OWNER_REQUIRED_TOKENS = Object.freeze([
  'CUTOVER_TABLES',
  'PilotCutoverWorkflowOwner',
  'createPilotCutoverWorkflowOwner',
  'sealMigrationPlan',
  'completeInitialLoad',
  'ingestChangeFeedBatch',
  'runParityVerification',
  'executeTrafficCutover',
  'recordPostCutoverTargetWrite',
  'executeRollback',
  'recoverPlanStatus',
  'disableReceiptDurability',
  'disableParityChecks',
  'disableDivergenceAccounting',
]);

const ROUTER_REQUIRED_TOKENS = Object.freeze([
  'CUTOVER_CLI_EXIT_CODE',
  'CUTOVER_SUBCOMMAND',
  'parseCutoverCommand',
  'runCutoverCommand',
  'createPilotCutoverWorkflowOwner',
]);

const TEST_REQUIRED_TOKENS = Object.freeze([
  'PostgresWireRuntimeModule',
  'runBulkLoad',
  'sealMigrationPlan',
  'completeInitialLoad',
  'ingestChangeFeedBatch',
  'runParityVerification',
  'executeTrafficCutover',
  'recordPostCutoverTargetWrite',
  'executeRollback',
  'recoverPlanStatus',
  'disableReceiptDurability',
  'disableParityChecks',
  'disableDivergenceAccounting',
]);

const FAILURE_CONTRACT =
  'pilot-cutover-workflow-contract-missing-or-incomplete';
const FAILURE_OWNER =
  'pilot-cutover-workflow-owner-missing-or-incomplete';
const FAILURE_ROUTER =
  'cutover-router-missing-or-incomplete';
const FAILURE_TEST =
  'q9-pilot-cutover-and-rollback-receipts-test-missing-or-incomplete';

const FILE_TOKEN_CHECKS = Object.freeze([
  [CONTRACT_REL_PATH, CONTRACT_REQUIRED_TOKENS, FAILURE_CONTRACT],
  [OWNER_REL_PATH, OWNER_REQUIRED_TOKENS, FAILURE_OWNER],
  [ROUTER_REL_PATH, ROUTER_REQUIRED_TOKENS, FAILURE_ROUTER],
  [TEST_REL_PATH, TEST_REQUIRED_TOKENS, FAILURE_TEST],
]);

runTokenCheckGuard(ROOT_DIR_PATH, FILE_TOKEN_CHECKS);
