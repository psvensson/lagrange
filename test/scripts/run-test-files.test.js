import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';
import {
  RETRY_FAILED_ONCE_ENABLED,
  RETRY_FAILED_ONCE_ENV,
  TEST_NODE_ARGS,
  analyzeTapOutput,
  filterTestFiles,
  parseOptions,
  retryFailedOnce,
  runTestFiles,
} from '../../scripts/run-test-files.js';

const FIXTURE_DIRECTORY = 'test/scripts/__fixtures__/run-test-files';
const TAP_PASS_FIXTURE = `${FIXTURE_DIRECTORY}/tap-pass.fixture.mjs`;
const TAP_SKIP_FIXTURE = `${FIXTURE_DIRECTORY}/tap-skip.fixture.mjs`;
const NODE_TEST_PASS_FIXTURE = `${FIXTURE_DIRECTORY}/node-test-pass.fixture.mjs`;
const NODE_TEST_SKIP_FIXTURE = `${FIXTURE_DIRECTORY}/node-test-skip.fixture.mjs`;
const NODE_TEST_FAILURE_FIXTURE = `${FIXTURE_DIRECTORY}/node-test-failure.fixture.mjs`;
const EMPTY_FIXTURE = `${FIXTURE_DIRECTORY}/empty.fixture.mjs`;

describe('run-test-files', () => {
  const temporaryDirectories = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true})));
  });

  async function runFixtures(files) {
    const resultsDirectory = await mkdtemp(path.join(tmpdir(), 'run-test-files-'));
    temporaryDirectories.push(resultsDirectory);
    return runTestFiles(files, {
      jobs: 2,
      print: false,
      resultsDirectory,
    });
  }

  it('parses explicit concurrency and timeout options', () => {
    assert.deepEqual(parseOptions([
      '--jobs=3',
      '--timeout-ms',
      '1200',
      TAP_PASS_FIXTURE,
    ]), {
      files: [TAP_PASS_FIXTURE],
      filter: null,
      jobs: 3,
      timeoutMs: 1200,
    });
  });

  it('parses --filter in both option styles and rejects an empty value', () => {
    assert.equal(parseOptions(['--filter', 'tap-pass', TAP_PASS_FIXTURE]).filter,
      'tap-pass');
    assert.equal(parseOptions(['--filter=node-test', TAP_PASS_FIXTURE]).filter,
      'node-test');
    assert.throws(() => parseOptions(['--filter']),
      /--filter requires a non-empty value/);
    assert.throws(() => parseOptions(['--filter=']),
      /--filter requires a non-empty value/);
  });

  it('filters test files by path substring', () => {
    const files = [TAP_PASS_FIXTURE, NODE_TEST_PASS_FIXTURE];
    assert.deepEqual(filterTestFiles(files, 'node-test'),
      [NODE_TEST_PASS_FIXTURE]);
    assert.deepEqual(filterTestFiles(files, null), files,
      'no filter keeps every file');
    assert.deepEqual(filterTestFiles(files, 'no-such-substring'), [],
      'a non-matching filter selects nothing (main fails closed on this)');
  });

  it('runs only the files selected by the filter', async () => {
    const summary = await runFixtures(
      filterTestFiles([TAP_PASS_FIXTURE, NODE_TEST_FAILURE_FIXTURE], 'tap-pass'));

    assert.equal(summary.ok, true);
    assert.equal(summary.total, 1);
    assert.equal(summary.results[0].file, TAP_PASS_FIXTURE);
  });

  it('runs Tap and node:test files with assertions and Tap plugins intact', async () => {
    const summary = await runFixtures([TAP_PASS_FIXTURE, NODE_TEST_PASS_FIXTURE]);

    assert.equal(summary.ok, true);
    assert.equal(summary.passed, 2);
    assert.equal(summary.failed, 0);
    assert.ok(summary.assertions >= 2);
    assert.ok(summary.results.every((result) => result.output.length > 0));
  });

  it('fails closed when a test file emits no assertions', async () => {
    const summary = await runFixtures([EMPTY_FIXTURE]);

    assert.equal(summary.ok, false);
    assert.match(summary.results[0].reasons.join(' '), /no assertions executed/);
  });

  it('fails closed when no test files are provided', async () => {
    const summary = await runTestFiles([]);

    assert.equal(summary.ok, false);
    assert.equal(summary.total, 0);
    assert.match(summary.reasons.join(' '), /no test files provided/);
  });

  it('fails closed on skipped Tap and node:test tests', async () => {
    const summary = await runFixtures([TAP_SKIP_FIXTURE, NODE_TEST_SKIP_FIXTURE]);

    assert.equal(summary.ok, false);
    assert.equal(summary.failed, 2);
    assert.ok(summary.results.every((result) =>
      /skipped assertion/.test(result.reasons.join(' '))));
  });

  it('preserves assertion failures', async () => {
    const summary = await runFixtures([NODE_TEST_FAILURE_FIXTURE]);

    assert.equal(summary.ok, false);
    assert.match(summary.results[0].reasons.join(' '), /TAP assertions failed/);
    assert.notEqual(summary.results[0].status, 0);
  });

  it('rejects an empty TAP stream structurally', () => {
    const analysis = analyzeTapOutput('');

    assert.equal(analysis.parserOk, true);
    assert.equal(analysis.assertions, 0);
    assert.match(analysis.reasons.join(' '), /no assertions executed/);
  });
});

// The lane-scoped retry-failed-once policy (owner decision 2026-08-23), held
// as a witness now that `solve land` runs under it as CI does: a rerun
// happens only under the declared environment and under the cap, every
// rerun is REPORTED, a standalone pass classifies an intermittent, a
// standalone failure stays red.
describe('retry-failed-once policy', () => {
  const FAILED = 'test/a-red.test.js';
  const GREEN = 'test/b-green.test.js';
  const RETRY_ENV = {[RETRY_FAILED_ONCE_ENV]: RETRY_FAILED_ONCE_ENABLED};
  const summaryWith = (failedFiles) => ({
    failed: failedFiles.length,
    ok: false,
    results: [
      {file: GREEN, ok: true},
      ...failedFiles.map((file) => ({file, ok: false})),
    ],
  });
  const harness = (rerunOk) => {
    const lines = [];
    const reruns = [];
    const runFile = (file) => {
      reruns.push(file);
      return Promise.resolve({file, ok: rerunOk});
    };
    return {lines, reruns, seams: {env: RETRY_ENV, runFile, write: (l) => lines.push(l)}};
  };

  it('does not rerun without the declared environment: a red stays red', async () => {
    const {reruns, seams} = harness(true);
    const exitCode = await retryFailedOnce(summaryWith([FAILED]), {},
      {...seams, env: {}});
    assert.equal(exitCode, 1);
    assert.deepEqual(reruns, [], 'nothing reran');
  });

  it('reruns each failed file once, reports it, and a standalone pass is green', async () => {
    const {lines, reruns, seams} = harness(true);
    const exitCode = await retryFailedOnce(summaryWith([FAILED]), {}, seams);
    assert.equal(exitCode, 0);
    assert.deepEqual(reruns, [FAILED], 'only the failed file reran, once');
    assert.match(lines[0], /^# retry-failed-once: rerunning 1 failed file/u,
      'the rerun is announced');
    assert.equal(lines[1], `# retried-once pass ${FAILED}\n`,
      'the outcome is reported, never hidden');
  });

  it('a standalone failure stays red and is reported as such', async () => {
    const {lines, seams} = harness(false);
    const exitCode = await retryFailedOnce(summaryWith([FAILED]), {}, seams);
    assert.equal(exitCode, 1);
    assert.equal(lines[1], `# retried-once fail ${FAILED}\n`);
  });

  it('is capped: a run with many failed files is breakage and never reruns', async () => {
    const {reruns, seams} = harness(true);
    const many = Array.from({length: 6}, (_, index) => `test/red-${index}.test.js`);
    const exitCode = await retryFailedOnce(summaryWith(many), {}, seams);
    assert.equal(exitCode, 1);
    assert.deepEqual(reruns, [], 'six failed files is over the cap of five');
  });
});

// Every test process pays the loaders at start-up, ~1700 times per corpus.
// Only the mock plugin serves anything; the typescript and processinfo
// loaders served no .ts file, no coverage and no reader (2026-09-17: 530 ms
// -> 207 ms idle start-up per process without them).
describe('test process loaders', () => {
  const loaders = TEST_NODE_ARGS.filter((argument) => argument.startsWith('--import='));

  it('loads the mock plugin and nothing that serves no file', () => {
    assert.equal(loaders.length, 1, 'exactly one loader');
    assert.match(loaders[0], /@tapjs\/mock\//u);
    for (const argument of TEST_NODE_ARGS) {
      assert.doesNotMatch(argument, /@tapjs\/(typescript|processinfo)\//u,
        `${argument}: a loader that serves nothing is not paid for`);
    }
  });

  it('keeps the V8 compilation cache off (3bac105f1) and the heap bound', () => {
    assert.ok(TEST_NODE_ARGS.includes('--no-compilation-cache'));
    assert.ok(TEST_NODE_ARGS.some((argument) => argument.startsWith('--max-old-space-size=')));
  });
});
