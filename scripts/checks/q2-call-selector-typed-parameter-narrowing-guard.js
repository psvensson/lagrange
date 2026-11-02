#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arraySlice = Function.call.bind(Array.prototype.slice);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8_ENCODING = 'utf8';
const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const CURRENT_DIR_PATH = path.dirname(CURRENT_FILE_PATH);
const ROOT_DIR_PATH = path.resolve(CURRENT_DIR_PATH, '../..');
const METRIC_FLAG = '--metric';
const NEWLINE = '\n';
const EMPTY_STRING = '';
const ARGV_SCRIPT_INDEX = 1;
const ARGV_SLICE_START = 2;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

const SELECTOR_PARAM_CONTRACT_REL_PATH =
  'src/service/call-selector-parameter-contract.js';
const BATCH_EXECUTOR_REL_PATH =
  'src/service/call-cell-batch-executor.js';
const CALL_INVOKER_REL_PATH =
  'src/service/call-cell-invoker.js';
const CALL_HANDLER_REL_PATH =
  'src/node/runtime-service-call-cell-handler.js';
const Q2_TEST_REL_PATH =
  'test/service/q2-call-selector-typed-parameter-narrowing.test.js';

const SELECTOR_PARAM_CONTRACT_TOKENS = Object.freeze([
  'CALL_SELECTOR_PARAM_TYPE',
  'normalizeCallSelectorParameterSchema',
  'normalizeCallSelectorInvocationParameters',
  'assertSelectorParameterCorrespondence',
]);

const BATCH_EXECUTOR_TOKENS = Object.freeze([
  'normalizeCallSelectorInvocationParameters',
  'parametersDigest',
  'boundParameters',
]);

const CALL_INVOKER_TOKENS = Object.freeze([
  'parametersDigest',
  '_assertInvocationParameterFence',
]);

const CALL_HANDLER_TOKENS = Object.freeze([
  'assertDispatchedSelectorParameters',
  'boundParameters',
]);

const Q2_TEST_TOKENS = Object.freeze([
  'call-selector-typed-parameter-narrowing',
  'CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS',
  'CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE',
]);

const ISSUE_SELECTOR_PARAM_CONTRACT =
  'call-selector-parameter-contract-missing-or-incomplete';
const ISSUE_BATCH_EXECUTOR =
  'call-cell-batch-executor-missing-q2-parameter-narrowing';
const ISSUE_CALL_INVOKER =
  'call-cell-invoker-missing-q2-parameter-digest-or-fence';
const ISSUE_CALL_HANDLER =
  'runtime-service-call-cell-handler-missing-q2-bound-parameters';
const ISSUE_Q2_TEST =
  'q2-call-selector-typed-parameter-narrowing-test-missing-or-incomplete';

const FILE_TOKEN_CHECKS = Object.freeze([
  [
    SELECTOR_PARAM_CONTRACT_REL_PATH,
    SELECTOR_PARAM_CONTRACT_TOKENS,
    ISSUE_SELECTOR_PARAM_CONTRACT,
  ],
  [BATCH_EXECUTOR_REL_PATH, BATCH_EXECUTOR_TOKENS, ISSUE_BATCH_EXECUTOR],
  [CALL_INVOKER_REL_PATH, CALL_INVOKER_TOKENS, ISSUE_CALL_INVOKER],
  [CALL_HANDLER_REL_PATH, CALL_HANDLER_TOKENS, ISSUE_CALL_HANDLER],
  [Q2_TEST_REL_PATH, Q2_TEST_TOKENS, ISSUE_Q2_TEST],
]);

function readTextIfPresent(rootDirPath, relPath) {
  const fullPath = path.join(rootDirPath, relPath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, UTF8_ENCODING);
}

function checkRequiredTokens(
  rootDirPath,
  relPath,
  requiredTokens,
  issueCode,
  issues,
) {
  const content = readTextIfPresent(rootDirPath, relPath);
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

export function runTokenCheckGuard(
  rootDirPath,
  fileTokenChecks,
  argv = process.argv,
) {
  const issues = [];
  for (const [relPath, tokens, issueCode] of fileTokenChecks) {
    checkRequiredTokens(rootDirPath, relPath, tokens, issueCode, issues);
  }
  const isMetric = arrayIncludes(
    arraySlice(argv, ARGV_SLICE_START),
    METRIC_FLAG,
  );
  if (isMetric) {
    process.stdout.write(`${issues.length}${NEWLINE}`);
    process.exit(EXIT_SUCCESS);
  }
  if (issues.length > EXIT_SUCCESS) {
    process.stderr.write(`${arrayJoin(issues, NEWLINE)}${NEWLINE}`);
    process.exit(EXIT_FAILURE);
  }
  process.stdout.write(`${EXIT_SUCCESS}${NEWLINE}`);
}

if (
  path.resolve(process.argv[ARGV_SCRIPT_INDEX] || EMPTY_STRING) ===
  CURRENT_FILE_PATH
) {
  runTokenCheckGuard(ROOT_DIR_PATH, FILE_TOKEN_CHECKS);
}
