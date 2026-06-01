#!/usr/bin/env node

// work:test:regression — run the work-tooling test slice and fail only on
// failures that are NOT already recorded in work/test-baseline.json. This
// replaces the manual "stash, run, eyeball which failures are pre-existing,
// pop" dance when proving a change introduces zero new test failures.
//
// Usage:
//   node scripts/work-test-regression.js              compare against baseline
//   node scripts/work-test-regression.js --update     rewrite the baseline
//   node scripts/work-test-regression.js --run-only   stream the slice, no gate
//   node scripts/work-test-regression.js <file...>    override the slice files

import {spawnSync} from 'node:child_process';
import {readdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const SLICE_DIR = path.join('test', 'scripts');
const TEST_SUFFIX = '.test.js';
const BASELINE_PATH = path.join('work', 'test-baseline.json');
const FLAG_UPDATE = '--update';
const FLAG_RUN_ONLY = '--run-only';
const NOT_OK_PATTERN = /^not ok \d+ - (.+?)(?:\s+#.*)?$/u;
const SUMMARY_PASS_PATTERN = /^# pass (\d+)$/u;
const SUMMARY_FAIL_PATTERN = /^# fail (\d+)$/u;
const SUMMARY_TESTS_PATTERN = /^# tests (\d+)$/u;

function resolveSliceFiles(args) {
  const explicit = args.filter((arg) => !arg.startsWith('--'));
  if (explicit.length > NUM_ZERO) {
    return explicit;
  }
  return readdirSync(SLICE_DIR)
    .filter((name) => name.endsWith(TEST_SUFFIX))
    .sort()
    .map((name) => path.join(SLICE_DIR, name));
}

function runSlice(files, {stream}) {
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', ...files],
    {encoding: ENCODING_UTF8, stdio: stream ? 'inherit' : 'pipe'},
  );
  return result;
}

function parseFailingNames(output) {
  const names = [];
  for (const line of output.split(NEWLINE)) {
    const match = NOT_OK_PATTERN.exec(line.trim());
    if (match) {
      names.push(match[NUM_ONE].trim());
    }
  }
  return names.sort();
}

function parseSummary(output) {
  const summary = {tests: null, pass: null, fail: null};
  for (const line of output.split(NEWLINE)) {
    const trimmed = line.trim();
    const tests = SUMMARY_TESTS_PATTERN.exec(trimmed);
    const pass = SUMMARY_PASS_PATTERN.exec(trimmed);
    const fail = SUMMARY_FAIL_PATTERN.exec(trimmed);
    if (tests) {
      summary.tests = Number(tests[NUM_ONE]);
    }
    if (pass) {
      summary.pass = Number(pass[NUM_ONE]);
    }
    if (fail) {
      summary.fail = Number(fail[NUM_ONE]);
    }
  }
  return summary;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    return {knownFailures: []};
  }
  return JSON.parse(readFileSync(BASELINE_PATH, ENCODING_UTF8));
}

function toMultiset(names) {
  const counts = new Map();
  for (const name of names) {
    counts.set(name, (counts.get(name) || NUM_ZERO) + NUM_ONE);
  }
  return counts;
}

function multisetDifference(current, baseline) {
  const currentCounts = toMultiset(current);
  const baselineCounts = toMultiset(baseline);
  const extra = [];
  for (const [name, count] of currentCounts) {
    const allowed = baselineCounts.get(name) || NUM_ZERO;
    for (let index = allowed; index < count; index += NUM_ONE) {
      extra.push(name);
    }
  }
  return extra.sort();
}

function writeBaseline(slice, failing) {
  const payload = {
    description:
      'Known-failing work-tooling tests. work:test:regression fails only on ' +
      'failures not listed here. Regenerate with `npm run ' +
      'work:test:regression -- --update` from a clean tree.',
    slice,
    generatedAt: new Date().toISOString(),
    knownFailures: failing,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, NUM_ONE + NUM_ONE)}${NEWLINE}`, ENCODING_UTF8);
}

function main() {
  const args = process.argv.slice(NUM_ONE + NUM_ONE);
  const files = resolveSliceFiles(args);
  const sliceLabel = args.some((arg) => !arg.startsWith('--')) ?
    files.join(' ') :
    `${SLICE_DIR}/*${TEST_SUFFIX}`;

  if (args.includes(FLAG_RUN_ONLY)) {
    const result = runSlice(files, {stream: true});
    process.exit(result.status === NUM_ZERO ? EXIT_SUCCESS : EXIT_FAILURE);
  }

  const result = runSlice(files, {stream: false});
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const failing = parseFailingNames(output);
  const summary = parseSummary(output);

  if (args.includes(FLAG_UPDATE)) {
    writeBaseline(sliceLabel, failing);
    process.stdout.write(
      `Recorded ${failing.length} known failure(s) to ${BASELINE_PATH} ` +
      `(slice ${sliceLabel}; ${summary.fail ?? '?'} failing assertions).${NEWLINE}`,
    );
    process.exit(EXIT_SUCCESS);
  }

  const baseline = loadBaseline();
  const newFailures = multisetDifference(failing, baseline.knownFailures || []);
  const fixed = multisetDifference(baseline.knownFailures || [], failing);

  process.stdout.write(
    `Slice ${sliceLabel}: ${summary.pass ?? '?'} passing, ` +
    `${failing.length} failing test(s); baseline allows ` +
    `${(baseline.knownFailures || []).length}.${NEWLINE}`,
  );
  if (fixed.length > NUM_ZERO) {
    process.stdout.write(
      `${fixed.length} previously-failing test(s) now pass; refresh the ` +
      `baseline with --update:${NEWLINE}  - ${fixed.join(`${NEWLINE}  - `)}${NEWLINE}`,
    );
  }
  if (newFailures.length > NUM_ZERO) {
    process.stderr.write(
      `${NEWLINE}${newFailures.length} NEW failing test(s) not in the ` +
      `baseline:${NEWLINE}  - ${newFailures.join(`${NEWLINE}  - `)}${NEWLINE}`,
    );
    process.exit(EXIT_FAILURE);
  }
  process.stdout.write(`No new failures versus baseline.${NEWLINE}`);
  process.exit(EXIT_SUCCESS);
}

main();
