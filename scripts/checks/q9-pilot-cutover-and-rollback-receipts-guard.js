#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8_ENCODING = 'utf8';
const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const CURRENT_DIR_PATH = path.dirname(CURRENT_FILE_PATH);
const ROOT_DIR_PATH = path.resolve(CURRENT_DIR_PATH, '../..');
const METRIC_FLAG = '--metric';
const NEWLINE = '\n';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

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

function readTextIfPresent(relPath) {
  const fullPath = path.join(ROOT_DIR_PATH, relPath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, UTF8_ENCODING);
}

function checkRequiredTokens(relPath, requiredTokens, issueCode, issues) {
  const content = readTextIfPresent(relPath);
  if (content === null) {
    issues.push(issueCode);
    return;
  }
  for (const token of requiredTokens) {
    if (!stringIncludes(content, token)) {
      issues.push(issueCode);
      return;
    }
  }
}

function evaluateGuard() {
  const issues = [];
  checkRequiredTokens(
    CONTRACT_REL_PATH,
    CONTRACT_REQUIRED_TOKENS,
    FAILURE_CONTRACT,
    issues,
  );
  checkRequiredTokens(
    OWNER_REL_PATH,
    OWNER_REQUIRED_TOKENS,
    FAILURE_OWNER,
    issues,
  );
  checkRequiredTokens(
    ROUTER_REL_PATH,
    ROUTER_REQUIRED_TOKENS,
    FAILURE_ROUTER,
    issues,
  );
  checkRequiredTokens(
    TEST_REL_PATH,
    TEST_REQUIRED_TOKENS,
    FAILURE_TEST,
    issues,
  );
  return issues;
}

const detectedIssues = evaluateGuard();
if (arrayIncludes(process.argv, METRIC_FLAG)) {
  process.stdout.write(`${detectedIssues.length}${NEWLINE}`);
  process.exit(EXIT_SUCCESS);
}
if (detectedIssues.length > EXIT_SUCCESS) {
  process.stderr.write(`${arrayJoin(detectedIssues, NEWLINE)}${NEWLINE}`);
  process.exit(EXIT_FAILURE);
}
process.stdout.write(`${EXIT_SUCCESS}${NEWLINE}`);
