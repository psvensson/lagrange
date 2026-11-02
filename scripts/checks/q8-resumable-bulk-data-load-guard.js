#!/usr/bin/env node

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTokenCheckGuard} from
  './q2-call-selector-typed-parameter-narrowing-guard.js';

const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const CURRENT_DIR_PATH = path.dirname(CURRENT_FILE_PATH);
const ROOT_DIR_PATH = path.resolve(CURRENT_DIR_PATH, '../..');

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

const FILE_TOKEN_CHECKS = Object.freeze([
  [
    MANIFEST_CONTRACT_REL_PATH,
    MANIFEST_CONTRACT_REQUIRED_TOKENS,
    FAILURE_MANIFEST_CONTRACT,
  ],
  [
    BULK_LOAD_COMMAND_REL_PATH,
    BULK_LOAD_COMMAND_REQUIRED_TOKENS,
    FAILURE_BULK_LOAD_COMMAND,
  ],
  [
    BULK_LOAD_ROUTER_REL_PATH,
    BULK_LOAD_ROUTER_REQUIRED_TOKENS,
    FAILURE_BULK_LOAD_ROUTER,
  ],
  [
    BULK_LOAD_TEST_REL_PATH,
    BULK_LOAD_TEST_REQUIRED_TOKENS,
    FAILURE_BULK_LOAD_TEST,
  ],
]);

runTokenCheckGuard(ROOT_DIR_PATH, FILE_TOKEN_CHECKS);
