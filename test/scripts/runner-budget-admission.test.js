import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {after, afterEach, before, describe, it} from 'node:test';
import {resolveTapTimeout, runTestFiles} from '../../scripts/run-test-files.js';

const FIXTURE_DIRECTORY = 'test/scripts/__fixtures__/run-test-files';
const TWO_TOP_LEVEL_TIMED_FIXTURE =
  `${FIXTURE_DIRECTORY}/tap-two-top-level-timed.fixture.mjs`;
const HANGS_FIXTURE = `${FIXTURE_DIRECTORY}/hangs.fixture.mjs`;

const DEFAULT_WATCHDOG_MS = 600000;

// Strip any ambient lane- or host-owned budget policy for the whole suite (T1):
// CI lanes legitimately export TAP_TIMEOUT_FLOOR and a placed lab run exports
// LAGRANGE_TEST_MACHINE_FACTOR, and every admissions case must observe the
// runner's own derived decision for the reference machine unless the case
// supplies its own env. Unrelated variables pass through untouched.
const AMBIENT_BUDGET_KEYS = [
  'TAP_TIMEOUT',
  'TAP_TIMEOUT_FLOOR',
  'LAGRANGE_TEST_MACHINE_FACTOR',
];

describe('runner budget admission', () => {
  const ambientBudgetValues = {};
  const temporaryDirectories = [];

  before(() => {
    for (const key of AMBIENT_BUDGET_KEYS) {
      ambientBudgetValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  after(() => {
    for (const key of AMBIENT_BUDGET_KEYS) {
      if (ambientBudgetValues[key] === undefined) delete process.env[key];
      else process.env[key] = ambientBudgetValues[key];
    }
  });

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {recursive: true, force: true})));
  });

  // Dynamically generated fixtures beneath the gitignored test-output/ tree:
  // inside the checkout the runner requires, outside the tracked test corpus,
  // and removed with the temporary directories.
  async function makeFixture(body) {
    const directory = await mkdtemp(path.join('test-output',
      'budget-admission-'));
    temporaryDirectories.push(directory);
    const fixtureFile = path.join(directory, 'fixture.mjs');
    const marker = JSON.stringify(
      `file://${path.resolve(directory, 'body-ran.marker')}`);
    fs.writeFileSync(fixtureFile, body({
      marker, tap: JSON.stringify('../../src/test-helpers/tap.js'),
      nodeTest: JSON.stringify('node:test'),
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
    const artifact = path.join(resultsDirectory, `${file}.tap`);
    return {
      summary,
      result,
      reasons: JSON.stringify(result?.reasons ?? []),
      artifact,
      stderr: `${artifact}.stderr`,
    };
  }

  function assertRefusal(admitted, {requestedRootSeconds, marginSeconds}) {
    assert.equal(admitted.result?.failureCode, 'BUDGET_UNFIT',
      `the refusal is typed: ${admitted.reasons}`);
    assert.equal(admitted.result?.status, 'not_started',
      'a refused file never started a process');
    if (requestedRootSeconds !== undefined) {
      assert.equal(admitted.result?.requestedRootSeconds, requestedRootSeconds,
        `the refusal names the requested root: ${admitted.reasons}`);
    }
    if (marginSeconds !== undefined) {
      assert.equal(admitted.result?.marginSeconds, marginSeconds,
        `the refusal names the available margin: ${admitted.reasons}`);
    }
    assert.equal(admitted.summary.ok, false, 'an unfit configuration is a refusal');
    assert.match(admitted.reasons, /BUDGET_UNFIT/,
      `the reason carries the machine-readable code: ${admitted.reasons}`);
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
    assertRefusal(admitted, {requestedRootSeconds: 600, marginSeconds: 540});
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
    assertRefusal(admitted, {requestedRootSeconds: 591, marginSeconds: 540});
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
    assertRefusal(admitted, {requestedRootSeconds: 900, marginSeconds: 540});
    assert.equal(fs.existsSync(marker), false,
      'an explicit value cannot start a file the watchdog cannot bound');
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
    assertRefusal(admitted, {requestedRootSeconds: 30, marginSeconds: 18});
    assert.equal(fs.existsSync(marker), false,
      'the default root timer cannot be armed under this watchdog');
  });

  it('F5 refusal happens before the output files are opened, created or truncated', async () => {
    const {fixtureFile, marker} = await makeFixture(({marker, tap}) => `
import fs from 'node:fs';
import {test} from ${tap};
test('declared 600s', {timeout: 600000}, async () => {
  fs.writeFileSync(new URL(${marker}), 'ran', 'utf8');
});
`);
    const resultsDirectory = await mkdtemp(path.join(tmpdir(), 'admission-'));
    temporaryDirectories.push(resultsDirectory);
    const artifact = path.join(resultsDirectory, `${fixtureFile}.tap`);
    // Both artifacts are pre-seeded: a refusal must leave exactly what was
    // there before - no truncation through an opened 'w' descriptor, no
    // directory creation through the results path.
    fs.mkdirSync(path.dirname(artifact), {recursive: true});
    fs.writeFileSync(artifact, 'sentinel-tap', 'utf8');
    fs.writeFileSync(`${artifact}.stderr`, 'sentinel-stderr', 'utf8');
    const summary = await runTestFiles([fixtureFile], {
      jobs: 1, print: false, resultsDirectory,
    });
    const result = summary.results?.[0];
    const admitted = {summary, result, artifact,
      reasons: JSON.stringify(result?.reasons ?? [])};
    assertRefusal(admitted, {requestedRootSeconds: 600, marginSeconds: 540});
    assert.equal(fs.readFileSync(admitted.artifact, 'utf8'), 'sentinel-tap',
      'an existing TAP artifact must survive a refusal untruncated');
    assert.equal(
      fs.readFileSync(`${admitted.artifact}.stderr`, 'utf8'),
      'sentinel-stderr',
      'an existing stderr artifact must survive a refusal untruncated');
    assert.equal(fs.existsSync(marker), false,
      'no pre-execution side effect reaches the fixture');
  });

  it('control: the derived top-level sum is the root the runner exports', () => {
    assert.equal(resolveTapTimeout(TWO_TOP_LEVEL_TIMED_FIXTURE, {},
      DEFAULT_WATCHDOG_MS), '80');
  });

  it('control: an explicit short TAP_TIMEOUT stays an intentional in-test override', async () => {
    assert.equal(resolveTapTimeout(TWO_TOP_LEVEL_TIMED_FIXTURE,
      {TAP_TIMEOUT: '1'}, DEFAULT_WATCHDOG_MS), '1',
    'a fitting explicit value remains authoritative over its own declarations');
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

  it('control: node:test files run under configurations a TAP file must refuse', async () => {
    const nodeTestCases = [
      {name: 'an explicit 900s TAP_TIMEOUT under a 600s watchdog', options: {
        env: {TAP_TIMEOUT: '900'},
      }},
      {name: 'a 20s watchdog where TAP itself would refuse, and a 600s declaration',
        options: {timeoutMs: 20000}},
    ];
    for (const nodeTestCase of nodeTestCases) {
      const {fixtureFile, marker} = await makeFixture(({marker, nodeTest}) => `
import fs from 'node:fs';
import {test} from ${nodeTest};
test('node test body', {timeout: 600000}, () => {
  fs.writeFileSync(new URL(${marker}), 'ran', 'utf8');
});
`);
      const admitted = await admit(fixtureFile, nodeTestCase.options);
      assert.equal(admitted.summary.ok, true,
        `${nodeTestCase.name}: node:test is not a TAP budget consumer: ` +
        `${admitted.reasons}`);
      assert.doesNotMatch(admitted.reasons, /BUDGET_UNFIT/,
        `${nodeTestCase.name}: no TAP refusal reaches node:test: ` +
        `${admitted.reasons}`);
      assert.equal(fs.existsSync(marker), true,
        `${nodeTestCase.name}: the node:test body ran`);
    }
  });

  it('control: the outer-watchdog failure classification is unchanged', async () => {
    const admitted = await admit(HANGS_FIXTURE, {timeoutMs: 2000});
    assert.equal(admitted.summary.ok, false, 'a hang is caught by the watchdog');
    assert.match(admitted.reasons, /timed out after \d+ms of a \d+ms budget/,
      `the watchdog reports its own classification: ${admitted.reasons}`);
  });

  it('CN1 canonical grammar: an explicit value is admitted and exported as the number tap consumes', () => {
    assert.equal(resolveTapTimeout(TWO_TOP_LEVEL_TIMED_FIXTURE,
      {TAP_TIMEOUT: '1.5'}, DEFAULT_WATCHDOG_MS), '1.5');
    assert.equal(resolveTapTimeout(TWO_TOP_LEVEL_TIMED_FIXTURE,
      {TAP_TIMEOUT: ' 7 '}, DEFAULT_WATCHDOG_MS), '7',
    'number-parsed whitespace, as tap itself consumes it');
  });

  it('CN2 boundary: a root exactly at the margin fits; one second more is refused', () => {
    assert.equal(resolveTapTimeout(TWO_TOP_LEVEL_TIMED_FIXTURE, {},
      DEFAULT_WATCHDOG_MS), '80', 'sanity: the reference fixture stays at 80s');
    assert.equal(resolveTapTimeout(TWO_TOP_LEVEL_TIMED_FIXTURE,
      {TAP_TIMEOUT: '540'}, DEFAULT_WATCHDOG_MS), '540',
    'equal to the margin is a fit, not a refusal');
    assert.throws(() => resolveTapTimeout(TWO_TOP_LEVEL_TIMED_FIXTURE,
      {TAP_TIMEOUT: '541'}, DEFAULT_WATCHDOG_MS),
    (error) => error.failureCode === 'BUDGET_UNFIT' &&
      error.requestedRootSeconds === 541 && error.marginSeconds === 540);
  });

  it('CN3 fail-closed grammar: zero, nonnumeric and malformed explicit values are typed refusals', async () => {
    for (const malformed of ['0', 'abc', '-5', 'NaN']) {
      const {fixtureFile} = await makeFixture(({tap}) => `
import {test} from ${tap};
test('undeclared', async () => {});
`);
      const admitted = await admit(fixtureFile, {env: {TAP_TIMEOUT: malformed}});
      assert.equal(admitted.result?.failureCode, 'TAP_TIMEOUT_INVALID',
        `${malformed} must fail closed typed: ${admitted.reasons}`);
      assert.equal(admitted.result?.status, 'not_started',
        `${malformed} never starts a process`);
      assert.equal(admitted.summary.ok, false);
      assert.match(admitted.reasons, /TAP_TIMEOUT_INVALID/);
    }
  });

  it('CN4 empty explicit value is the tap language itself, not a value', async () => {
    assert.equal(resolveTapTimeout(`${FIXTURE_DIRECTORY}/empty.fixture.mjs`,
      {TAP_TIMEOUT: ''}, DEFAULT_WATCHDOG_MS), undefined,
    'tap reads an empty TAP_TIMEOUT as its own default');
  });

  it('CN5 an unfit fractional explicit value refuses with its canonical number', async () => {
    const {fixtureFile} = await makeFixture(({tap}) => `
import {test} from ${tap};
test('undeclared', async () => {});
`);
    const admitted = await admit(fixtureFile, {env: {TAP_TIMEOUT: '900.5'}});
    assert.equal(admitted.result?.failureCode, 'BUDGET_UNFIT');
    assert.equal(admitted.result?.requestedRootSeconds, 900.5,
      `the canonical fraction, not a parse-int truncation: ${admitted.reasons}`);
    assert.equal(admitted.result?.marginSeconds, 540);
  });

  it('L1 the results ledger keeps the structured refusal as machine-readable evidence', async () => {
    const {fixtureFile} = await makeFixture(({tap}) => `
import {test} from ${tap};
test('declared 600s', {timeout: 600000}, async () => {});
`);
    const resultsDirectory = await mkdtemp(path.join(tmpdir(), 'admission-'));
    temporaryDirectories.push(resultsDirectory);
    const ledgerFile = path.join(resultsDirectory, 'results.ndjson');
    const summary = await runTestFiles([fixtureFile], {
      jobs: 1, print: false, resultsDirectory, ledgerFile,
    });
    assert.equal(summary.ok, false);
    const lines = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n')
      .map((line) => JSON.parse(line));
    const refusals = lines.filter((line) => line.failureCode !== undefined);
    assert.equal(refusals.length, 1,
      `exactly one refusal record: ${JSON.stringify(lines)}`);
    assert.equal(refusals[0].failureCode, 'BUDGET_UNFIT');
    assert.equal(refusals[0].requestedRootSeconds, 600);
    assert.equal(refusals[0].marginSeconds, 540);
    assert.equal(refusals[0].status, 'not_started');
  });

  it('R1 a dynamic import of the tap runner is a TAP consumer and must be admitted', async () => {
    const {fixtureFile, marker} = await makeFixture(({marker, tap}) => `
import fs from 'node:fs';
const mod = await import(${tap});
const test = (mod.default ?? mod).test;
test('dynamically imported tap', {timeout: 600000}, async () => {
  fs.writeFileSync(new URL(${marker}), 'ran', 'utf8');
});
`);
    const admitted = await admit(fixtureFile);
    assert.ok(admitted.reasons.includes('BUDGET_UNFIT'),
      `a dynamic tap import budgets like a static one: ${admitted.reasons}`);
    assert.equal(admitted.result?.failureCode, 'BUDGET_UNFIT');
    assert.equal(admitted.result?.requestedRootSeconds, 600);
    assert.equal(fs.existsSync(marker), false,
      'an unadmitted dynamic consumer must not run');
  });

  it('R2 a dynamic import of node:test stays exempt from TAP admission', async () => {
    const {fixtureFile, marker} = await makeFixture(({marker, nodeTest}) => `
import fs from 'node:fs';
const {test} = await import(${nodeTest});
test('dynamic node test', {timeout: 600000}, () => {
  fs.writeFileSync(new URL(${marker}), 'ran', 'utf8');
});
`);
    const admitted = await admit(fixtureFile);
    assert.equal(admitted.summary.ok, true,
      `node:test via dynamic import is not a TAP consumer: ${admitted.reasons}`);
    assert.doesNotMatch(admitted.reasons, /BUDGET_UNFIT/);
    assert.equal(fs.existsSync(marker), true,
      'the dynamic node:test body ran');
  });
});
