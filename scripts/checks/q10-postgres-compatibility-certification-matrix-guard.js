#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8_ENCODING = 'utf8';
const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const CURRENT_DIR_PATH = path.dirname(CURRENT_FILE_PATH);
const ROOT_DIR_PATH = path.resolve(CURRENT_DIR_PATH, '../..');
const METRIC_FLAG = '--metric';
const NEWLINE = '\n';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const ARGV_START_INDEX = 2;
const ZERO_ISSUES = 0;

const CATALOG_REL_PATH = 'src/query/pg/postgres-compatibility-catalog.js';
const MATRIX_REL_PATH = 'src/query/pg/postgres-compatibility-matrix.js';
const MATRIX_JSON_REL_PATH = 'docs/postgres-compatibility-matrix.json';
const Q10_TEST_REL_PATH =
  'test/query/q10-postgres-compatibility-certification-matrix.test.js';

const CATALOG_TOKENS = Object.freeze([
  'PG_COMPAT_CLIENT_ID',
  'PG_COMPAT_DIMENSION',
  'PG_COMPAT_CELL_STATUS',
  'PG_COMPAT_MATRIX_ERROR_CODE',
  'PG_COMPAT_DECLARED_CELLS',
  'PostgresCompatibilityMatrixError',
]);

const MATRIX_TOKENS = Object.freeze([
  'createCompatibilityCellReceipt',
  'createNegativeControlReceipt',
  'generatePostgresCompatibilityMatrix',
  'verifyCompatibilityMatrixRegression',
  'computeCompatibilityMatrixDigest',
]);

const MATRIX_JSON_TOKENS = Object.freeze([
  '"schema": "lagrange-postgres-compatibility-matrix/2"',
  '"ormCompatibilityClaimed": false',
  '"clients":',
  '"dimensions":',
  '"cells":',
  '"matrixDigest":',
]);

const Q10_TEST_TOKENS = Object.freeze([
  'PostgresWireRuntimeModule',
  'createSqlitePartitionSqlEngine',
  'generatePostgresCompatibilityMatrix',
  'verifyCompatibilityMatrixRegression',
  'MATRIX_RECEIPT_DIGEST_MISMATCH',
  'MISSING_CELL_RECEIPT',
  'SUPPORTED_CELL_REGRESSION',
  'UNSUPPORTED_CELL_OMITTED',
  'ORM_OVERCLAIM_FORBIDDEN',
  'NEGATIVE_CONTROL_BREACH',
]);

const ISSUE_CATALOG =
  'postgres-compatibility-catalog-missing-or-incomplete';
const ISSUE_MATRIX =
  'postgres-compatibility-matrix-missing-or-incomplete';
const ISSUE_MATRIX_JSON =
  'postgres-compatibility-matrix-json-missing-or-invalid';
const ISSUE_Q10_TEST =
  'q10-postgres-compatibility-certification-matrix-test-missing-or-incomplete';

const FILE_TOKEN_CHECKS = Object.freeze([
  [CATALOG_REL_PATH, CATALOG_TOKENS, ISSUE_CATALOG],
  [MATRIX_REL_PATH, MATRIX_TOKENS, ISSUE_MATRIX],
  [MATRIX_JSON_REL_PATH, MATRIX_JSON_TOKENS, ISSUE_MATRIX_JSON],
  [Q10_TEST_REL_PATH, Q10_TEST_TOKENS, ISSUE_Q10_TEST],
]);

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
    arrayPush(issues, issueCode);
    return;
  }
  for (const token of requiredTokens) {
    if (!stringIncludes(content, token)) {
      arrayPush(issues, issueCode);
      return;
    }
  }
}

function evaluateIssues() {
  const issues = [];
  for (const [relPath, tokens, issueCode] of FILE_TOKEN_CHECKS) {
    checkRequiredTokens(relPath, tokens, issueCode, issues);
  }
  return issues;
}

const issues = evaluateIssues();
const cliArgs = arraySlice(process.argv, ARGV_START_INDEX);
const isMetric = arrayIncludes(cliArgs, METRIC_FLAG);
if (isMetric) {
  process.stdout.write(`${issues.length}${NEWLINE}`);
  process.exit(EXIT_SUCCESS);
}
if (issues.length > ZERO_ISSUES) {
  process.stderr.write(`${arrayJoin(issues, NEWLINE)}${NEWLINE}`);
  process.exit(EXIT_FAILURE);
}
process.stdout.write(`${ZERO_ISSUES}${NEWLINE}`);
