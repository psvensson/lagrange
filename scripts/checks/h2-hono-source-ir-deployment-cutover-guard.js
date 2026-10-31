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

const DEFINE_SERVICE_REL_PATH = 'src/authoring/define-service.js';
const SOURCE_CONTRACT_REL_PATH = 'src/service/service-source-contract.js';
const ENTRY_GENERATOR_REL_PATH = 'src/service/service-entry-generator.js';
const RECORD_GENERATOR_REL_PATH =
  'src/service/service-deployment-record-generator.js';
const BINDING_CONTRACT_REL_PATH =
  'src/control-plane/owners/deployment-binding-contract.js';
const BINDING_OWNER_REL_PATH =
  'src/control-plane/owners/deployment-binding-owner.js';
const ROUTE_RESOLVER_REL_PATH =
  'src/service/request-binding-route-resolver.js';
const H2_TEST_REL_PATH =
  'test/service/h2-hono-source-ir-deployment-cutover.test.js';

const DEFINE_SERVICE_TOKENS = Object.freeze([
  'fetch',
  'mount',
  'dependencies',
]);

const SOURCE_CONTRACT_TOKENS = Object.freeze([
  'LEGACY_HANDLERS_UNSUPPORTED',
  'MISSING_FETCH',
  'INVALID_MOUNT',
  'INVALID_DEPENDENCIES',
  'IR_ENTRY_KIND',
]);

const ENTRY_GENERATOR_TOKENS = Object.freeze([
  'service.fetch',
  'decodeBase64Bytes',
  'encodeBase64Bytes',
  'getSetCookie',
]);

const RECORD_GENERATOR_TOKENS = Object.freeze([
  'LEGACY_ARTIFACT_ABI_UNSUPPORTED',
  'assertSuccessorServiceArtifact',
  'path_prefix',
]);

const BINDING_CONTRACT_TOKENS = Object.freeze([
  'path_prefix',
  'matchesMountPathPrefix',
  'mountsOverlap',
  'canonicalizeAdmittedRequestUrl',
]);

const BINDING_OWNER_TOKENS = Object.freeze([
  'mountsOverlap',
  'assertNoOverlappingRequestMount',
]);

const ROUTE_RESOLVER_TOKENS = Object.freeze([
  'canonicalizeAdmittedRequestUrl',
  'matchesMountPathPrefix',
]);

const H2_TEST_TOKENS = Object.freeze([
  'service-capability-boundary',
  'assertSuccessorServiceArtifact',
  'canonicalizeAdmittedRequestUrl',
  'mountsOverlap',
]);

const ISSUE_DEFINE_SERVICE = 'define-service-missing-fetch-mount-dependencies';
const ISSUE_SOURCE_CONTRACT =
  'service-source-contract-missing-fetch-mount-or-legacy-refusal';
const ISSUE_ENTRY_GENERATOR =
  'service-entry-generator-missing-async-fetch-v2-adapter';
const ISSUE_RECORD_GENERATOR =
  'service-deployment-record-generator-missing-mount-or-legacy-artifact-refusal';
const ISSUE_BINDING_CONTRACT =
  'deployment-binding-contract-missing-mount-or-url-canonicalization';
const ISSUE_BINDING_OWNER =
  'deployment-binding-owner-missing-overlapping-mount-guard';
const ISSUE_ROUTE_RESOLVER =
  'request-binding-route-resolver-missing-mount-prefix-or-url-guard';
const ISSUE_H2_TEST =
  'h2-hono-source-ir-deployment-cutover-test-missing-or-incomplete';

const FILE_TOKEN_CHECKS = Object.freeze([
  [DEFINE_SERVICE_REL_PATH, DEFINE_SERVICE_TOKENS, ISSUE_DEFINE_SERVICE],
  [SOURCE_CONTRACT_REL_PATH, SOURCE_CONTRACT_TOKENS, ISSUE_SOURCE_CONTRACT],
  [ENTRY_GENERATOR_REL_PATH, ENTRY_GENERATOR_TOKENS, ISSUE_ENTRY_GENERATOR],
  [RECORD_GENERATOR_REL_PATH, RECORD_GENERATOR_TOKENS, ISSUE_RECORD_GENERATOR],
  [BINDING_CONTRACT_REL_PATH, BINDING_CONTRACT_TOKENS, ISSUE_BINDING_CONTRACT],
  [BINDING_OWNER_REL_PATH, BINDING_OWNER_TOKENS, ISSUE_BINDING_OWNER],
  [ROUTE_RESOLVER_REL_PATH, ROUTE_RESOLVER_TOKENS, ISSUE_ROUTE_RESOLVER],
  [H2_TEST_REL_PATH, H2_TEST_TOKENS, ISSUE_H2_TEST],
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
