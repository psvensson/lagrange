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

const PACKAGE_JSON_REL_PATH = 'package.json';
const SERVICE_COMPONENT_BUILD_REL_PATH = 'src/service/service-component-build.js';
const HONO_QUALIFICATION_REL_PATH = 'src/service/hono-component-qualification.js';
const HONO_PROOF_TEST_REL_PATH = 'test/service/h1-pinned-hono-component-proof.test.js';

const EXPECTED_DEPENDENCIES = Object.freeze([
  ['hono', '4.13.14'],
  ['@bytecodealliance/componentize-js', '0.21.0'],
  ['@bytecodealliance/jco-transpile', '0.4.2'],
  ['esbuild', '0.27.2'],
]);
const EXPECTED_AUTHORING_SUBPATH = './authoring';
const EXPECTED_AUTHORING_TARGET = './src/authoring/index.js';

const BUILD_REQUIRED_TOKENS = Object.freeze([
  'PINNED_HONO_TOOLCHAIN_VERSIONS',
  'bundleGuestEntry',
  'lagrange-server/authoring',
  'FORBIDDEN_GUEST_ROOT_IMPORT',
]);

const QUALIFICATION_REQUIRED_TOKENS = Object.freeze([
  'PINNED_TOOLCHAIN_HONO_COMPONENT_RECEIPT_ID',
  'pinned-toolchain-hono-component',
  'QUALIFIED_HONO_GUEST_FACILITIES',
  'UNSUPPORTED_HONO_GUEST_FACILITIES',
  'buildPinnedHonoComponentReceipt',
  'validatePinnedHonoComponentReceipt',
]);

const TEST_REQUIRED_TOKENS = Object.freeze([
  'pinned-toolchain-hono-component',
  'buildPinnedHonoComponentReceipt',
  'validatePinnedHonoComponentReceipt',
  'not_available_in_call_mode',
  'operations: {}',
]);

const FAILURE_PACKAGE_JSON =
  'package-json-missing-pinned-hono-esbuild-or-authoring-export';
const FAILURE_COMPONENT_BUILD =
  'service-component-build-missing-guest-esbuild-bundling-or-toolchain-metadata';
const FAILURE_QUALIFICATION_OWNER =
  'hono-component-qualification-owner-missing-or-incomplete';
const FAILURE_PROOF_TEST =
  'h1-pinned-hono-component-proof-test-missing-or-incomplete';

function readTextIfPresent(relPath) {
  const fullPath = path.join(ROOT_DIR_PATH, relPath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, UTF8_ENCODING);
}

function hasExpectedDependencies(deps) {
  for (const [pkgName, expectedVersion] of EXPECTED_DEPENDENCIES) {
    if (deps[pkgName] !== expectedVersion) {
      return false;
    }
  }
  return true;
}

function checkPackageJson(issues) {
  const raw = readTextIfPresent(PACKAGE_JSON_REL_PATH);
  if (raw === null) {
    issues.push(FAILURE_PACKAGE_JSON);
    return;
  }
  const pkg = JSON.parse(raw);
  const deps = pkg?.dependencies ?? {};
  const authoringExport = pkg?.exports?.[EXPECTED_AUTHORING_SUBPATH];
  if (
    !hasExpectedDependencies(deps) ||
    authoringExport !== EXPECTED_AUTHORING_TARGET
  ) {
    issues.push(FAILURE_PACKAGE_JSON);
  }
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
  checkPackageJson(issues);
  checkRequiredTokens(
    SERVICE_COMPONENT_BUILD_REL_PATH,
    BUILD_REQUIRED_TOKENS,
    FAILURE_COMPONENT_BUILD,
    issues,
  );
  checkRequiredTokens(
    HONO_QUALIFICATION_REL_PATH,
    QUALIFICATION_REQUIRED_TOKENS,
    FAILURE_QUALIFICATION_OWNER,
    issues,
  );
  checkRequiredTokens(
    HONO_PROOF_TEST_REL_PATH,
    TEST_REQUIRED_TOKENS,
    FAILURE_PROOF_TEST,
    issues,
  );
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
