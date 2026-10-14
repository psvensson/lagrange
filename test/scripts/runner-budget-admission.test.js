import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';
import {resolveTapTimeout, runTestFiles} from '../../scripts/run-test-files.js';

const FIXTURE_DIRECTORY = 'test/scripts/__fixtures__/run-test-files';
const TWO_TOP_LEVEL_TIMED_FIXTURE =
  `${FIXTURE_DIRECTORY}/tap-two-top-level-timed.fixture.mjs`;
const NODE_TEST_PASS_FIXTURE = `${FIXTURE_DIRECTORY}/node-test-pass.fixture.mjs`;
const HANGS_FIXTURE = `${FIXTURE_DIRECTORY}/hangs.fixture.mjs`;

const DEFAULT_WATCHDOG_MS = 600000;

describe('runner budget admission', () => {
  const temporaryDirectories = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true})));
  });

  // Dynamically generated fixtures under a per-test directory of test/,
  // cleaned by afterEach — nothing tracked, nothing run corpus-wide.
  async function makeFixture(body) {
    const directory = await mkdtemp(path.join('test', 'admission-'));
    temporaryDirectories.push(directory);
    const fixtureFile = path.join(directory, 'fixture.mjs');
    const marker = JSON.stringify(
      `file://${path.resolve(directory, 'body-ran.marker')}`);
    fs.writeFileSync(fixtureFile, body({
      marker, tap: JSON.stringify('../../src/test-helpers/tap.js'),
    }));
    return {fixtureFile, marker: path.join(directory, 'body-ran.marker')};
  }

  async function admit(file, options = {}) {
    const resultsDirectory = await mkdtemp(path.join(tmpdir(), 'admission-'));
    temporaryDirectories.push(resultsDirectory);
    const summary = await runTestFiles([file], {
      jobs: 1, print: false, resultsDirectory, ...options,
    });
    const result = summary.results?.[0];
    return {
      summary,
      result,
      reasons: JSON.stringify(result?.reasons ?? []),
      artifact: path.join(resultsDirectory, `${file}.tap`),
      stderr: `${path.join(resultsDirectory, `${file}.tap`)}.stderr`,
    };
  }

  it('F1 refuses a declared 600s budget that cannot fit the default watchdog, before execution', async () => {
    const {fixtureFile, marker} = await makeFixture(({marker, tap}) => `
import fs from 'node:fs';
import {test} from ${tap};
test('declared 600s', {timeout: 600000}, async () => {
  fs.writeFileSync(new URL(${marker}), 'ran', 'utf8');
});
`);
    const admitted = await admit(fixtureFile);
    assert.match(admitted.reasons, /BUDGET_UNFIT/,
      `the runner must refuse a root budget that cannot fit: ${admitted.reasons}`);
    assert.equal(admitted.summary.ok, false, 'an unfit configuration is a refusal');
    assert.match(admitted.reasons, /600/,
      `the refusal names the requested root: ${admitted.reasons}`);
    assert.match(admitted.reasons, /540/,
      `the refusal names the available margin: ${admitted.reasons}`);
    assert.equal(fs.existsSync(marker), false,
      'the test body must never execute under a refusal');
  });

  it('F2 refuses a TAP_TIMEOUT_FLOOR that would outlive the watchdog reporting margin', async () => {
    const {fixtureFile, marker} = await makeFixture(({marker, tap}) => `
import fs from 'node:fs';
import {test} from ${tap};
test('undeclared', async () => {
  fs.writeFileSync(new URL(${marker}), 'ran', 'utf8');
});
`);
    const admitted = await admit(fixtureFile, {env: {TAP_TIMEOUT_FLOOR: '591'}});
    assert.match(admitted.reasons, /BUDGET_UNFIT/,
      'a floor above the margin must refuse, ' +
      `not arm an unreportable timer: ${admitted.reasons}`);
    assert.equal(admitted.summary.ok, false, 'an unfit configuration is a refusal');
    assert.equal(fs.existsSync(marker), false,
      'the floor must not silently start the file beyond the margin');
  });

  it('F3 refuses an explicit TAP_TIMEOUT that could override the physical process bound', async () => {
    const {fixtureFile, marker} = await makeFixture(({marker, tap}) => `
import fs from 'node:fs';
import {test} from ${tap};
test('undeclared', async () => {
  fs.writeFileSync(new URL(${marker}), 'ran', 'utf8');
});
`);
    const admitted = await admit(fixtureFile, {env: {TAP_TIMEOUT: '900'}});
    assert.match(admitted.reasons, /BUDGET_UNFIT/,
      'an explicit 900s timeout must refuse ' +
      `against a 600s watchdog: ${admitted.reasons}`);
    assert.equal(admitted.summary.ok, false, 'an unfit explicit value is a refusal');
    assert.equal(fs.existsSync(marker), false,
      'the explicit value cannot start a file the watchdog cannot bound');
  });

  it('F4 refuses a watchdog shorter than the TAP default root timer it reports through', async () => {
    const {fixtureFile, marker} = await makeFixture(({marker, tap}) => `
import fs from 'node:fs';
import {test} from ${tap};
test('undeclared', async () => {
  fs.writeFileSync(new URL(${marker}), 'ran', 'utf8');
});
`);
    const admitted = await admit(fixtureFile, {timeoutMs: 20000});
    assert.match(admitted.reasons, /BUDGET_UNFIT/,
      `a 20s watchdog cannot honour the 30s TAP default: ${admitted.reasons}`);
    assert.equal(admitted.summary.ok, false, 'an unfit watchdog is a refusal');
    assert.equal(fs.existsSync(marker), false,
      'the default root timer cannot be armed under this watchdog');
  });

  it('F5 refusal happens before the output files are opened or the process spawned', async () => {
    const {fixtureFile} = await makeFixture(({marker, tap}) => `
import fs from 'node:fs';
import {test} from ${tap};
test('declared 600s', {timeout: 600000}, async () => {
  fs.writeFileSync(new URL(${marker}), 'ran', 'utf8');
});
`);
    const admitted = await admit(fixtureFile);
    assert.match(admitted.reasons, /BUDGET_UNFIT/, `the refusal is typed: ${admitted.reasons}`);
    assert.equal(admitted.summary.ok, false, 'an unfit configuration is a refusal');
    assert.equal(fs.existsSync(admitted.artifact), false,
      'no TAP result file may be created for a refused file');
    assert.equal(fs.existsSync(admitted.stderr), false,
      'no stderr file may be created for a refused file');
  });

  it('control: the derived top-level sum is the root the runner exports', () => {
    assert.equal(resolveTapTimeout(TWO_TOP_LEVEL_TIMED_FIXTURE, {},
      DEFAULT_WATCHDOG_MS), '80');
  });

  it('control: an explicit short TAP_TIMEOUT stays an intentional in-test override', async () => {
    const {summary, reasons} = await admit(TWO_TOP_LEVEL_TIMED_FIXTURE, {
      env: {TAP_TIMEOUT: '1'},
    });
    assert.doesNotMatch(reasons, /BUDGET_UNFIT/,
      `a fitting explicit timeout is admitted, never refused: ${reasons}`);
    assert.equal(summary.ok, false, 'the short timeout fails the file as designed');
  });

  it('control: an ordinary fitting floor lifts without refusal', () => {
    assert.equal(resolveTapTimeout(`${FIXTURE_DIRECTORY}/empty.fixture.mjs`,
      {TAP_TIMEOUT_FLOOR: '120'}, DEFAULT_WATCHDOG_MS), '120');
  });

  it('control: a node:test file is never subject to TAP admission', async () => {
    const {summary, reasons} = await admit(NODE_TEST_PASS_FIXTURE, {});
    assert.equal(summary.ok, true, `node:test files run as before: ${reasons}`);
    assert.doesNotMatch(reasons, /BUDGET_UNFIT/);
  });

  it('control: the outer-watchdog failure classification is unchanged', async () => {
    const admitted = await admit(HANGS_FIXTURE, {timeoutMs: 2000});
    assert.equal(admitted.summary.ok, false, 'a hang is caught by the watchdog');
    assert.match(admitted.reasons, /timed out after \d+ms of a \d+ms budget/,
      `the watchdog reports its own classification: ${admitted.reasons}`);
  });
});
