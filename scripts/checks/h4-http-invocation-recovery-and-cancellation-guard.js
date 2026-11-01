#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8_ENCODING = 'utf8';
const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const CURRENT_DIR_PATH = path.dirname(CURRENT_FILE_PATH);
const ROOT_DIR_PATH = path.resolve(CURRENT_DIR_PATH, '../..');
const METRIC_FLAG = '--metric';
const NEWLINE = '\n';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

const ROUTING_CONTRACT_REL_PATH =
  'src/service/request-cell-routing-contract.js';
const HTTP_ADAPTER_REL_PATH = 'src/service/request-cell-http-adapter.js';
const INVOCATION_OWNER_REL_PATH =
  'src/runtime/request-cell-invocation-owner.js';
const REQUEST_HANDLER_REL_PATH =
  'src/node/runtime-service-request-cell-handler.js';
const H4_TEST_REL_PATH =
  'test/service/h4-http-invocation-recovery-and-cancellation.test.js';

const ROUTING_CONTRACT_TOKENS = Object.freeze([
  'CANCELLED',
  'INVOCATION_EXPIRED',
  'DEFAULT_INVOCATION_RETENTION_WINDOW_MS',
  'createScopedInvocationKey',
  'createSemanticInvocationIntentDigest',
]);

const HTTP_ADAPTER_TOKENS = Object.freeze([
  '_pinnedRevisionsByKeyScope',
  '_inFlightKeyedWaiters',
  'cancelInvocation',
  'createSemanticInvocationIntentDigest',
]);

const INVOCATION_OWNER_TOKENS = Object.freeze([
  'INVOCATION_EXPIRED',
  'cancelInvocation',
  'attachWaiterToInFlightInvocation',
  'resolveDurableInvocationKey',
]);

const REQUEST_HANDLER_TOKENS = Object.freeze([
  'pinnedBindingVersionId',
  'semanticIntentDigest',
  'fetchMode',
]);

const H4_TEST_TOKENS = Object.freeze([
  'request-call-lifecycle',
  'INVOCATION_CONFLICT',
  'INVOCATION_EXPIRED',
  'INVOCATION_AMBIGUOUS',
  'CANCELLED',
]);

const ISSUE_ROUTING_CONTRACT =
  'request-cell-routing-contract-missing-h4-scoped-key-or-retention';
const ISSUE_HTTP_ADAPTER =
  'request-cell-http-adapter-missing-h4-pinned-revision-or-waiter-ownership';
const ISSUE_INVOCATION_OWNER =
  'request-cell-invocation-owner-missing-h4-durable-recovery-or-waiter-cancel';
const ISSUE_REQUEST_HANDLER =
  'runtime-service-request-cell-handler-missing-h4-pinned-revision-threading';
const ISSUE_H4_TEST =
  'h4-http-invocation-recovery-and-cancellation-test-missing-or-incomplete';

const FILE_TOKEN_CHECKS = Object.freeze([
  [ROUTING_CONTRACT_REL_PATH, ROUTING_CONTRACT_TOKENS, ISSUE_ROUTING_CONTRACT],
  [HTTP_ADAPTER_REL_PATH, HTTP_ADAPTER_TOKENS, ISSUE_HTTP_ADAPTER],
  [INVOCATION_OWNER_REL_PATH, INVOCATION_OWNER_TOKENS, ISSUE_INVOCATION_OWNER],
  [REQUEST_HANDLER_REL_PATH, REQUEST_HANDLER_TOKENS, ISSUE_REQUEST_HANDLER],
  [H4_TEST_REL_PATH, H4_TEST_TOKENS, ISSUE_H4_TEST],
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
  for (const [relPath, tokens, issueCode] of FILE_TOKEN_CHECKS) {
    checkRequiredTokens(relPath, tokens, issueCode, issues);
  }
  return issues;
}

const detectedIssues = evaluateGuard();
const isMetricMode = arrayIncludes(process.argv, METRIC_FLAG);
if (isMetricMode) {
  process.stdout.write(`${detectedIssues.length}${NEWLINE}`);
} else if (detectedIssues.length > 0) {
  process.stderr.write(`${detectedIssues.join(NEWLINE)}${NEWLINE}`);
}
process.exitCode = detectedIssues.length === 0 ? EXIT_SUCCESS : EXIT_FAILURE;
