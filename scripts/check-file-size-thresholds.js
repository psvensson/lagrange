#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ENCODING_UTF8 = 'utf8';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const DIRECTORY_SRC = 'src';
const DIRECTORY_TEST = 'test';
const JAVASCRIPT_EXTENSION = '.js';
const CLI_FLAG_STRICT = '--strict';
const CLI_FLAG_TOP = '--top';
const NEWLINE = '\n';
const SOURCE_LINE_THRESHOLD = 800;
const TEST_LINE_THRESHOLD = 1200;
const SOURCE_BASELINE_COUNT = 144;
const TEST_BASELINE_COUNT = 159;
const DEFAULT_TOP_COUNT = 25;
const FILE_SIZE_SCOPE = Object.freeze({
  SOURCE: 'source',
  TEST: 'test',
});
const FILE_SIZE_THRESHOLDS = Object.freeze({
  [FILE_SIZE_SCOPE.SOURCE]: SOURCE_LINE_THRESHOLD,
  [FILE_SIZE_SCOPE.TEST]: TEST_LINE_THRESHOLD,
});
const FILE_SIZE_BASELINES = Object.freeze({
  [FILE_SIZE_SCOPE.SOURCE]: SOURCE_BASELINE_COUNT,
  [FILE_SIZE_SCOPE.TEST]: TEST_BASELINE_COUNT,
});

function parseTopCount(args) {
  const optionIndex = args.indexOf(CLI_FLAG_TOP);
  if (optionIndex < NUM_ZERO) {
    return DEFAULT_TOP_COUNT;
  }
  const value = Number(args[optionIndex + NUM_ONE]);
  return Number.isInteger(value) && value > NUM_ZERO ? value : DEFAULT_TOP_COUNT;
}

function normalizeRelativePath(filePath) {
  return path.relative(process.cwd(), filePath);
}

async function listJavaScriptFiles(directoryPath) {
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

function countLines(content) {
  if (content.length === NUM_ZERO) {
    return NUM_ZERO;
  }
  return content.split(/\r?\n/u).length;
}

async function buildFileSizeEntries(scope, directoryPath) {
  const threshold = FILE_SIZE_THRESHOLDS[scope];
  const filePaths = await listJavaScriptFiles(directoryPath);
  const entries = [];
  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath, ENCODING_UTF8);
    const lines = countLines(content);
    if (lines > threshold) {
      entries.push({
        scope,
        path: normalizeRelativePath(filePath),
        lines,
        threshold,
      });
    }
  }
  return entries.sort((left, right) => right.lines - left.lines);
}

function formatEntry(entry) {
  return `${entry.lines} ${entry.path} (threshold ${entry.threshold})`;
}

function buildRatchetErrors(sourceEntries, testEntries, strictMode) {
  if (strictMode) {
    return [
      ...sourceEntries,
      ...testEntries,
    ].map((entry) => `Oversized ${entry.scope} file: ${formatEntry(entry)}`);
  }
  const errors = [];
  if (sourceEntries.length > FILE_SIZE_BASELINES[FILE_SIZE_SCOPE.SOURCE]) {
    errors.push(
      `Source oversized-file count ${sourceEntries.length} exceeds baseline ` +
      `${FILE_SIZE_BASELINES[FILE_SIZE_SCOPE.SOURCE]}.`,
    );
  }
  if (testEntries.length > FILE_SIZE_BASELINES[FILE_SIZE_SCOPE.TEST]) {
    errors.push(
      `Test oversized-file count ${testEntries.length} exceeds baseline ` +
      `${FILE_SIZE_BASELINES[FILE_SIZE_SCOPE.TEST]}.`,
    );
  }
  return errors;
}

function printSummary(sourceEntries, testEntries, topCount) {
  console.log(
    `Source oversized-file ratchet: ${sourceEntries.length}/` +
    `${FILE_SIZE_BASELINES[FILE_SIZE_SCOPE.SOURCE]} over ` +
    `${SOURCE_LINE_THRESHOLD} lines.`,
  );
  console.log(
    `Test oversized-file ratchet: ${testEntries.length}/` +
    `${FILE_SIZE_BASELINES[FILE_SIZE_SCOPE.TEST]} over ` +
    `${TEST_LINE_THRESHOLD} lines.`,
  );
  const largestEntries = [...sourceEntries, ...testEntries]
    .sort((left, right) => right.lines - left.lines)
    .slice(NUM_ZERO, topCount);
  if (largestEntries.length === NUM_ZERO) {
    return;
  }
  console.log('');
  console.log(`Largest oversized files (${topCount} max):`);
  console.log(largestEntries.map(formatEntry).join(NEWLINE));
}

async function main() {
  const args = process.argv.slice(2);
  const strictMode = args.includes(CLI_FLAG_STRICT);
  const topCount = parseTopCount(args);
  const sourceEntries = await buildFileSizeEntries(
    FILE_SIZE_SCOPE.SOURCE,
    DIRECTORY_SRC,
  );
  const testEntries = await buildFileSizeEntries(
    FILE_SIZE_SCOPE.TEST,
    DIRECTORY_TEST,
  );
  printSummary(sourceEntries, testEntries, topCount);
  const errors = buildRatchetErrors(sourceEntries, testEntries, strictMode);
  if (errors.length > NUM_ZERO) {
    console.error('');
    console.error(errors.join(NEWLINE));
    process.exit(EXIT_FAILURE);
  }
  process.exit(EXIT_SUCCESS);
}

await main();
