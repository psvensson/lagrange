#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const EMPTY_TEXT = '';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const PROCESS_ARG_SCRIPT_INDEX = 1;
const CLI_FLAG_STRICT = '--strict';
const CLI_FLAG_TOP = '--top';
const CLI_FLAG_OWNER_BOUNDARY_GUIDANCE = '--owner-boundary-guidance';
const CLI_FLAG_PREFIX = '--';
const DIRECTORY_SRC = 'src';
const DIRECTORY_TEST = 'test';
const JAVASCRIPT_EXTENSION = '.js';
const SOURCE_LINE_THRESHOLD = 800;
const TEST_LINE_THRESHOLD = 1200;
const DEFAULT_TOP_COUNT = 25;
const SEGMENT_FILE_PATTERN =
  /(?:^|\/)[^/]+-segment-\d+(?:-stage-\d+)?\.js$/u;
const OWNER_BOUNDARY_GUIDANCE_TITLE = 'Owner-boundary extraction guidance:';
const OWNER_BOUNDARY_GUIDANCE_EMPTY =
  'No oversized segment files matched the owner-boundary guidance pattern.';
const OWNER_BOUNDARY_GUIDANCE_ACTION =
  'extract one named owner/boundary helper behind the existing entrypoint; keep the public seam stable and move only one decision table, state model, or evidence-normalization concern.';

const FILE_SIZE_SCOPE = Object.freeze({
  SOURCE: 'source',
  TEST: 'test',
});

const FILE_SIZE_THRESHOLDS = Object.freeze({
  [FILE_SIZE_SCOPE.SOURCE]: SOURCE_LINE_THRESHOLD,
  [FILE_SIZE_SCOPE.TEST]: TEST_LINE_THRESHOLD,
});

function parseTopCount(args) {
  const optionIndex = args.indexOf(CLI_FLAG_TOP);
  if (optionIndex < NUM_ZERO) {
    return DEFAULT_TOP_COUNT;
  }
  const value = Number(args[optionIndex + NUM_ONE]);
  return Number.isInteger(value) && value > NUM_ZERO ? value : DEFAULT_TOP_COUNT;
}

function parseExplicitFilePaths(args) {
  const filePaths = [];
  for (let index = NUM_ZERO; index < args.length; index += NUM_ONE) {
    const arg = args[index];
    if (arg === CLI_FLAG_TOP) {
      index += NUM_ONE;
      continue;
    }
    if (arg.startsWith(CLI_FLAG_PREFIX)) {
      continue;
    }
    filePaths.push(arg);
  }
  return filePaths;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listJavaScriptFiles(directoryPath) {
  if (!(await fileExists(directoryPath))) {
    return [];
  }
  const entries = await fs.readdir(directoryPath, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJavaScriptFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(JAVASCRIPT_EXTENSION)) {
      files.push(entryPath);
    }
  }
  return files;
}

async function countLines(filePath) {
  const content = await fs.readFile(filePath, ENCODING_UTF8);
  if (content.length === NUM_ZERO) {
    return NUM_ZERO;
  }
  return content.split(NEWLINE).length;
}

function inferScope(filePath) {
  return filePath.startsWith(`${DIRECTORY_TEST}${path.sep}`) ?
    FILE_SIZE_SCOPE.TEST :
    FILE_SIZE_SCOPE.SOURCE;
}

async function buildEntry(filePath, scope = inferScope(filePath)) {
  return {
    filePath,
    scope,
    lines: await countLines(filePath),
    threshold: FILE_SIZE_THRESHOLDS[scope],
  };
}

async function buildFileSizeEntries(scope, directoryPath) {
  const files = await listJavaScriptFiles(directoryPath);
  const entries = await Promise.all(files.map((filePath) => buildEntry(filePath, scope)));
  return entries.filter((entry) => entry.lines > entry.threshold);
}

async function buildExplicitEntries(filePaths) {
  const entries = await Promise.all(filePaths.map((filePath) => buildEntry(filePath)));
  return entries.filter((entry) => entry.lines > entry.threshold);
}

function formatEntry(entry) {
  return `${entry.lines} ${entry.filePath} (threshold ${entry.threshold})`;
}

function buildOwnerBoundaryGuidanceEntries(entries) {
  return entries
    .filter((entry) => SEGMENT_FILE_PATTERN.test(entry.filePath))
    .map((entry) => ({...entry, guidance: OWNER_BOUNDARY_GUIDANCE_ACTION}));
}

function printSummary(sourceEntries, testEntries, topCount) {
  console.log(
    `Source oversized-file ratchet: ${sourceEntries.length} over ` +
    `${SOURCE_LINE_THRESHOLD} lines.`,
  );
  console.log(
    `Test oversized-file ratchet: ${testEntries.length} over ` +
    `${TEST_LINE_THRESHOLD} lines.`,
  );
  const largestEntries = [...sourceEntries, ...testEntries]
    .sort((left, right) => right.lines - left.lines)
    .slice(NUM_ZERO, topCount);
  if (largestEntries.length === NUM_ZERO) {
    return;
  }
  console.log(EMPTY_TEXT);
  console.log(`Largest oversized files (${topCount} max):`);
  console.log(largestEntries.map(formatEntry).join(NEWLINE));
}

function printOwnerBoundaryGuidance(entries) {
  const guidanceEntries = buildOwnerBoundaryGuidanceEntries(entries);
  console.log(EMPTY_TEXT);
  console.log(OWNER_BOUNDARY_GUIDANCE_TITLE);
  if (guidanceEntries.length === NUM_ZERO) {
    console.log(OWNER_BOUNDARY_GUIDANCE_EMPTY);
    return;
  }
  console.log(
    guidanceEntries
      .map((entry) => `${formatEntry(entry)} - ${entry.guidance}`)
      .join(NEWLINE),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const strictMode = args.includes(CLI_FLAG_STRICT);
  const topCount = parseTopCount(args);
  const ownerBoundaryGuidance = args.includes(CLI_FLAG_OWNER_BOUNDARY_GUIDANCE);
  const explicitFilePaths = parseExplicitFilePaths(args);
  const explicitEntries = explicitFilePaths.length > NUM_ZERO ?
    await buildExplicitEntries(explicitFilePaths) :
    [];
  const sourceEntries = explicitFilePaths.length > NUM_ZERO ?
    explicitEntries.filter((entry) => entry.scope === FILE_SIZE_SCOPE.SOURCE) :
    await buildFileSizeEntries(FILE_SIZE_SCOPE.SOURCE, DIRECTORY_SRC);
  const testEntries = explicitFilePaths.length > NUM_ZERO ?
    explicitEntries.filter((entry) => entry.scope === FILE_SIZE_SCOPE.TEST) :
    await buildFileSizeEntries(FILE_SIZE_SCOPE.TEST, DIRECTORY_TEST);
  printSummary(sourceEntries, testEntries, topCount);
  if (ownerBoundaryGuidance) {
    printOwnerBoundaryGuidance([...sourceEntries, ...testEntries]);
  }
  if (strictMode && (sourceEntries.length > NUM_ZERO || testEntries.length > NUM_ZERO)) {
    process.exit(EXIT_FAILURE);
  }
  process.exit(EXIT_SUCCESS);
}

function isDirectRun() {
  return path.resolve(process.argv[PROCESS_ARG_SCRIPT_INDEX] || EMPTY_TEXT) ===
    fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(EXIT_FAILURE);
  });
}

export {
  buildOwnerBoundaryGuidanceEntries,
};
