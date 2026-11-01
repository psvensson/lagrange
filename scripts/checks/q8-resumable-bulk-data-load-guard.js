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

const MANIFEST_CONTRACT_REL_PATH = 'src/cli/bulk-load-manifest-contract.js';
const BULK_LOAD_COMMAND_REL_PATH = 'src/cli/bulk-load-command.js';
const BULK_LOAD_ROUTER_REL_PATH = 'src/cli/bulk-load-router.js';
const BULK_LOAD_TEST_REL_PATH = 'test/cli/q8-resumable-bulk-data-load.test.js';

const MANIFEST_CONTRACT_REQUIRED_TOKENS = Object.freeze([
  'BULK_LOAD_ERROR_CODE',
  'BULK_LOAD_REJECT_REASON',
  'BulkLoadError',
  'computeSchemaDigest',
  'computeSourceDigest',
  'computeBatchChecksum',
  'validateLoadManifest',
  'readBoundedNdjsonBatches',
  'SCHEMA_DRIFT',
  'SOURCE_TRUNCATED',
  'OFFSET_REGRESSION',
  'BATCH_CHECKSUM_MISMATCH',
  'RECONCILIATION_MISMATCH',
]);

const BULK_LOAD_COMMAND_REQUIRED_TOKENS = Object.freeze([
  'BULK_LOAD_TABLES',
  '_bulk_load_checkpoints',
  '_bulk_load_rejects',
  'ensureBulkLoadTables',
  'readCheckpointChain',
  'runBulkLoad',
  'verifyBulkLoadCompleteness',
  'ON CONFLICT',
  'skipIdempotentReplay',
  'skipCheckpointPersistence',
]);

const BULK_LOAD_ROUTER_REQUIRED_TOKENS = Object.freeze([
  'BULK_LOAD_CLI_EXIT_CODE',
  'parseBulkLoadCommand',
  'runBulkLoadCommand',
  'runBulkLoad',
  'verifyBulkLoadCompleteness',
]);

const BULK_LOAD_TEST_REQUIRED_TOKENS = Object.freeze([
  'PostgresWireRuntimeModule',
  'runBulkLoad',
  'verifyBulkLoadCompleteness',
  'SCHEMA_DRIFT',
  'SOURCE_TRUNCATED',
  'BATCH_CHECKSUM_MISMATCH',
  'RECONCILIATION_MISMATCH',
  'skipIdempotentReplay',
  'skipCheckpointPersistence',
]);

const FAILURE_MANIFEST_CONTRACT =
  'bulk-load-manifest-contract-missing-or-incomplete';
const FAILURE_BULK_LOAD_COMMAND =
  'bulk-load-command-owner-missing-or-incomplete';
const FAILURE_BULK_LOAD_ROUTER =
  'bulk-load-router-missing-or-incomplete';
const FAILURE_BULK_LOAD_TEST =
  'q8-resumable-bulk-data-load-test-missing-or-incomplete';

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
    MANIFEST_CONTRACT_REL_PATH,
    MANIFEST_CONTRACT_REQUIRED_TOKENS,
    FAILURE_MANIFEST_CONTRACT,
    issues,
  );
  checkRequiredTokens(
    BULK_LOAD_COMMAND_REL_PATH,
    BULK_LOAD_COMMAND_REQUIRED_TOKENS,
    FAILURE_BULK_LOAD_COMMAND,
    issues,
  );
  checkRequiredTokens(
    BULK_LOAD_ROUTER_REL_PATH,
    BULK_LOAD_ROUTER_REQUIRED_TOKENS,
    FAILURE_BULK_LOAD_ROUTER,
    issues,
  );
  checkRequiredTokens(
    BULK_LOAD_TEST_REL_PATH,
    BULK_LOAD_TEST_REQUIRED_TOKENS,
    FAILURE_BULK_LOAD_TEST,
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
