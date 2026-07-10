import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';
import {
  analyzeTapOutput,
  parseOptions,
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
      jobs: 3,
      timeoutMs: 1200,
    });
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
