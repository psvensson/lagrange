#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const UTF8_ENCODING = 'utf8';
const METRIC_FLAG = '--metric';
const NEWLINE = '\n';
const ZERO_ISSUES = 0;

const ACCEPTANCE_CONTRACT_PATH =
  'src/service/standard-http-service-acceptance-contract.js';
const CAPABILITIES_JSON_PATH = 'docs/current-capabilities.json';
const CHECK_CAPABILITIES_PATH = 'scripts/check-current-capabilities.js';
const REFERENCE_DOC_PATH = 'docs/reference/javascript-service-reference.md';
const GUARD_TEST_PATH =
  'test/service/h6-successor-contract-and-evidence-cutover.test.js';

const REQUIRED_ACCEPTANCE_MARKERS = Object.freeze([
  'STANDARD_HTTP_ACCEPTANCE_SCENARIO_ID',
  'STANDARD_HTTP_REQUIRED_RECEIPT_IDS',
  'validateStandardHttpAcceptanceReport',
  'pinned-toolchain-hono-component',
  'fetch-http-semantics',
  'service-capability-boundary',
  'request-call-lifecycle',
  'compiled-public-hono-journey',
  'successor-contract-cutover',
]);

const REQUIRED_CAPABILITIES_MARKERS = Object.freeze([
  'hono_fetch_entry_with_scoped_client',
  'service_cell_v2_zero_one_or_many_operations',
  'single_table_select_with_typed_positional_parameters',
  'bounded_recoverable_page_accumulator',
  'bounded_canonical_finite_json_v1',
  'semantic_group_keys_with_distinct_delivery_identity',
  'bounded_sequential_calls',
  'invocation_owned_with_waiter_detach',
]);

const REQUIRED_REFERENCE_MARKERS = Object.freeze([
  'lagrange-server/authoring',
  'c.env.lagrange.call',
  'legacy_artifact_rebuild_required',
]);

function readRepoFile(relativePath) {
  const fullPath = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, UTF8_ENCODING);
}

function checkMarkers(relativePath, markers, issues) {
  const source = readRepoFile(relativePath);
  if (source === null) {
    issues.push(`missing ${relativePath}`);
    return;
  }
  for (const marker of markers) {
    if (!stringIncludes(source, marker)) {
      issues.push(`${relativePath} missing marker: ${marker}`);
    }
  }
}

function collectMissingMarkers() {
  const issues = [];
  checkMarkers(ACCEPTANCE_CONTRACT_PATH, REQUIRED_ACCEPTANCE_MARKERS, issues);
  checkMarkers(CAPABILITIES_JSON_PATH, REQUIRED_CAPABILITIES_MARKERS, issues);
  checkMarkers(CHECK_CAPABILITIES_PATH, REQUIRED_CAPABILITIES_MARKERS, issues);
  checkMarkers(REFERENCE_DOC_PATH, REQUIRED_REFERENCE_MARKERS, issues);
  if (readRepoFile(GUARD_TEST_PATH) === null) {
    issues.push(`missing ${GUARD_TEST_PATH}`);
  }
  return issues;
}

const issues = collectMissingMarkers();
if (arrayIncludes(process.argv, METRIC_FLAG)) {
  process.stdout.write(`${issues.length}${NEWLINE}`);
} else if (issues.length > ZERO_ISSUES) {
  process.stderr.write(`${issues.join(NEWLINE)}${NEWLINE}`);
  process.exitCode = 1;
} else {
  process.stdout.write(`h6-successor-contract-and-evidence-cutover-guard: ok${NEWLINE}`);
}
