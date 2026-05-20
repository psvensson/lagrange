#!/usr/bin/env node

import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';

const CHECK_EMPTY_TEXT = '';
const CHECK_ENCODING_UTF8 = 'utf8';
const CHECK_EXIT_FAILURE = 1;
const CHECK_FILE_EXTENSION_JS = '.js';
const CHECK_NEWLINE = '\n';
const CHECK_OWNER_MAP_PATH = 'architecture/current-owner-maps.md';
const CHECK_SCAN_ROOT_SRC = 'src';
const CHECK_SCAN_ROOT_TEST = 'test';
const CHECK_REBALANCER_DIR = 'src/rebalancer';
const CHECK_SUMMARY_OK =
  'operation progress authority guard passed';
const CHECK_ERROR_PREFIX = 'operation progress authority guard failed:';

const RETIRED_SOURCE_TOKEN_PARTS = Object.freeze([
  Object.freeze(['witness', 'Source']),
  Object.freeze(['Witness', 'Source']),
  Object.freeze(['WITNESS', '_SOURCE']),
  Object.freeze(['witness', '_source']),
  Object.freeze(['topologyOperator', 'Witness', 'Source']),
]);

const LEGACY_OPERATION_PROGRESS_TOKEN_PARTS = Object.freeze([
  Object.freeze(['operation', '-progress-']),
  Object.freeze(['operation', '-lifecycle']),
  Object.freeze(['operationProgressRecord']),
  Object.freeze(['operationProgressEvents']),
  Object.freeze(['operationProgressStore']),
  Object.freeze(['advance', 'OperationLifecycle']),
]);

const REBALANCER_ORDINAL_FILE_PATTERN =
  /(?:^|\/)[^/]+(?:segment|stage|part)[^/]*\.js$/u;

const LEGACY_REBALANCER_ORDINAL_FILES = Object.freeze([
  'src/rebalancer/operation-workflow-owner-segment-1.js',
  'src/rebalancer/operation-workflow-owner-segment-2.js',
  'src/rebalancer/operation-workflow-owner-segment-3.js',
  'src/rebalancer/operation-workflow-owner-segment-4.js',
  'src/rebalancer/operation-workflow-owner-segment-5-stage-1.js',
  'src/rebalancer/operation-workflow-owner-segment-5-stage-2.js',
  'src/rebalancer/operation-workflow-owner-segment-5-stage-3.js',
  'src/rebalancer/operation-workflow-owner-segment-5-stage-4.js',
  'src/rebalancer/operation-workflow-owner-segment-5-stage-5.js',
  'src/rebalancer/operation-workflow-owner-segment-5-stage-shared.js',
  'src/rebalancer/operation-workflow-owner-segment-5.js',
  'src/rebalancer/operation-workflow-owner-segment-6.js',
  'src/rebalancer/operation-workflow-owner-segment-7-stage-1.js',
  'src/rebalancer/operation-workflow-owner-segment-7-stage-2.js',
  'src/rebalancer/operation-workflow-owner-segment-7-stage-3.js',
  'src/rebalancer/operation-workflow-owner-segment-7-stage-4.js',
  'src/rebalancer/operation-workflow-owner-segment-7-stage-5.js',
  'src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js',
  'src/rebalancer/operation-workflow-owner-segment-7.js',
  'src/rebalancer/rebalance-coordinator-segment-1.js',
  'src/rebalancer/rebalance-coordinator-segment-2.js',
  'src/rebalancer/rebalance-coordinator-segment-3.js',
  'src/rebalancer/rebalance-coordinator-segment-4.js',
  'src/rebalancer/rebalance-coordinator-segment-5.js',
  'src/rebalancer/unified-rebalancer-segment-1.js',
  'src/rebalancer/unified-rebalancer-segment-2.js',
  'src/rebalancer/unified-rebalancer-segment-3.js',
  'src/rebalancer/unified-rebalancer-segment-4-stage-1.js',
  'src/rebalancer/unified-rebalancer-segment-4-stage-2.js',
  'src/rebalancer/unified-rebalancer-segment-4-stage-3.js',
  'src/rebalancer/unified-rebalancer-segment-4-stage-4.js',
  'src/rebalancer/unified-rebalancer-segment-4-stage-5.js',
  'src/rebalancer/unified-rebalancer-segment-4-stage-shared.js',
  'src/rebalancer/unified-rebalancer-segment-4.js',
  'src/rebalancer/unified-rebalancer-segment-5.js',
]);

function buildTokens(tokenParts) {
  return Object.freeze(tokenParts.map((parts) =>
    parts.join(CHECK_EMPTY_TEXT),
  ));
}

async function collectFiles(rootDir) {
  const entries = await readdir(rootDir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const path = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
      continue;
    }
    if (entry.isFile() && path.endsWith(CHECK_FILE_EXTENSION_JS)) {
      files.push(path);
    }
  }
  return files;
}

async function readUtf8(path) {
  return readFile(path, CHECK_ENCODING_UTF8);
}

function collectTokenViolations({
  files,
  contentByFile,
  tokens,
  reason,
}) {
  const violations = [];
  for (const file of files) {
    const content = contentByFile.get(file) || CHECK_EMPTY_TEXT;
    for (const token of tokens) {
      if (content.includes(token)) {
        violations.push(`${file}: ${reason}: ${token}`);
      }
    }
  }
  return violations;
}

function collectOrdinalFileViolations(rebalancerFiles) {
  const allowed = new Set(LEGACY_REBALANCER_ORDINAL_FILES);
  const actual = rebalancerFiles
    .filter((file) => REBALANCER_ORDINAL_FILE_PATTERN.test(file))
    .sort();
  const actualSet = new Set(actual);
  const unexpected = actual.filter((file) => !allowed.has(file));
  const missing = LEGACY_REBALANCER_ORDINAL_FILES.filter((file) =>
    !actualSet.has(file),
  );
  return Object.freeze([
    ...unexpected.map((file) => `${file}: new ordinal rebalancer file`),
    ...missing.map((file) => `${file}: owner-map legacy file missing`),
  ]);
}

function collectOwnerMapViolations(ownerMapContent) {
  return LEGACY_REBALANCER_ORDINAL_FILES
    .filter((file) => !ownerMapContent.includes(file))
    .map((file) => `${CHECK_OWNER_MAP_PATH}: missing removal ledger row for ${file}`);
}

async function main() {
  const sourceFiles = await collectFiles(CHECK_SCAN_ROOT_SRC);
  const testFiles = await collectFiles(CHECK_SCAN_ROOT_TEST);
  const scannedFiles = Object.freeze([...sourceFiles, ...testFiles]);
  const contentEntries = await Promise.all(scannedFiles.map(async (file) => [
    file,
    await readUtf8(file),
  ]));
  const contentByFile = new Map(contentEntries);
  const rebalancerFiles = sourceFiles.filter((file) =>
    file.startsWith(CHECK_REBALANCER_DIR),
  );
  const legacyContentByFile = new Map(
    [...contentByFile.entries()].filter(([file]) =>
      LEGACY_REBALANCER_ORDINAL_FILES.includes(file),
    ),
  );
  const ownerMapContent = await readUtf8(CHECK_OWNER_MAP_PATH);
  const violations = Object.freeze([
    ...collectTokenViolations({
      files: scannedFiles,
      contentByFile,
      tokens: buildTokens(RETIRED_SOURCE_TOKEN_PARTS),
      reason: 'retired lifecycle source vocabulary',
    }),
    ...collectOrdinalFileViolations(rebalancerFiles),
    ...collectTokenViolations({
      files: LEGACY_REBALANCER_ORDINAL_FILES,
      contentByFile: legacyContentByFile,
      tokens: buildTokens(LEGACY_OPERATION_PROGRESS_TOKEN_PARTS),
      reason: 'operation_progress implementation belongs in named files',
    }),
    ...collectOwnerMapViolations(ownerMapContent),
  ]);

  if (violations.length > Number(CHECK_EMPTY_TEXT.length)) {
    throw new Error([
      CHECK_ERROR_PREFIX,
      ...violations,
    ].join(CHECK_NEWLINE));
  }
  process.stdout.write(`${CHECK_SUMMARY_OK}${CHECK_NEWLINE}`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}${CHECK_NEWLINE}`);
  process.exitCode = CHECK_EXIT_FAILURE;
});
