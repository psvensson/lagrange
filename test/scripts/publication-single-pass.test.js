// Existing entry paths: run-test-files CLI and runPlacedTestFiles. The CLI
// fixture runs a real child; placement substitutes transport/execution while
// retaining the production assignment and settlement decisions. These controls
// prove neither physical fleet capacity nor GitHub publication authority.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {THERMAL_REFUSAL, THERMAL_REFUSAL_EXIT}
  from '../../scripts/checks/wait-for-thermal-headroom.js';
import {PLACEMENT_EXIT, runPlacedTestFiles} from '../../scripts/lab/probe.js';
import {reportLocalCorpus, startLocalCorpus} from '../../scripts/publish-head.js';
import {EXECUTION_SECTIONS_ENV, readExecutionRuns} from '../../scripts/test-execution-report.js';
import {fakeInventory, lab, placementRunFixture} from './test-placement-fixtures.js';

const RUNNER = path.resolve('scripts/run-test-files.js');
const FILES = Array.from({length: 8}, (_, index) => `test/single-pass-${index}.test.js`);
const green = (file, assertions = 1) => `ok ${file} (${assertions} assertions, 5ms)`;
const red = (file) => `not ok ${file} (1 assertions, 5ms)`;

function runnerFixture(t, initialCount = 0) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-single-pass-'));
  t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
  const root = path.join(scratch, 'source');
  fs.mkdirSync(path.join(root, 'test'), {recursive: true});
  const counter = path.join(scratch, 'attempts');
  fs.writeFileSync(counter, String(initialCount));
  const file = 'test/finite-failure.test.mjs';
  fs.writeFileSync(path.join(root, file), [
    'import assert from \'node:assert/strict\';',
    'import fs from \'node:fs\';',
    'import {test} from \'node:test\';',
    `const counter = ${JSON.stringify(counter)};`,
    'test(\'finite first failure\', () => {',
    '  const count = Number(fs.readFileSync(counter, \'utf8\')) + 1;',
    '  fs.writeFileSync(counter, String(count));',
    '  assert.ok(count > 1, \'the first execution fails\');',
    '});',
    '',
  ].join('\n'));
  const env = gitProcessEnvironment();
  for (const args of [['init', '--quiet'], ['config', 'user.name', 'Single Pass Fixture'],
    ['config', 'user.email', 'single-pass@example.invalid'], ['add', 'test'],
    ['commit', '--quiet', '-m', 'finite failure']]) {
    execGit(args, {cwd: root, env, encoding: 'utf8'});
  }
  const sections = path.join(scratch, 'sections.ndjson');
  env[EXECUTION_SECTIONS_ENV] = sections;
  // An obsolete caller setting must not restore the removed execution path.
  env.LAGRANGE_RETRY_FAILED_ONCE = '1';
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [RUNNER, '--jobs=1', file],
    {cwd: root, env, encoding: 'utf8'});
  return {result, count: Number(fs.readFileSync(counter, 'utf8')),
    runs: readExecutionRuns(sections), file};
}

test('run-test-files retains the first failure without executing the file again', (t) => {
  const observed = runnerFixture(t);
  assert.equal(observed.result.status, 1, observed.result.stdout + observed.result.stderr);
  assert.equal(observed.count, 1, 'the real child executes exactly once');
  assert.equal(observed.runs.length, 1);
  const [run] = observed.runs;
  assert.equal(run.complete, true, 'the failure closes its execution record');
  assert.equal(run.exitStatus, 1);
  assert.deepEqual(run.results[0].attempts.map((attempt) => attempt.ok), [false]);
  assert.equal(run.results[0].file, observed.file);
  assert.match(observed.result.stdout, /the first execution fails/u);
});

test('run-test-files still accepts a clean single execution', (t) => {
  const observed = runnerFixture(t, 1);
  assert.equal(observed.result.status, 0, observed.result.stdout + observed.result.stderr);
  assert.equal(observed.count, 2, 'one execution advances the initial count once');
  assert.equal(observed.runs.length, 1);
  assert.equal(observed.runs[0].complete, true);
  assert.equal(observed.runs[0].exitStatus, 0);
  assert.deepEqual(observed.runs[0].results[0].attempts.map((attempt) => attempt.ok), [true]);
});

async function observePlacement(outcome, overrides = {}) {
  const assigned = [];
  const fixture = placementRunFixture({
    runLocal: (files) => {
      assigned.push({host: 'controller', files: [...files]});
      return 0;
    },
    runRemote: (shard) => {
      assigned.push({host: shard.machine.name, files: [...shard.files]});
      return {done: Promise.resolve(outcome(shard.files))};
    },
    ...overrides,
  });
  const status = await runPlacedTestFiles(FILES, fixture.deps);
  return {status, assigned, ...fixture};
}

function assertAssignedOnce(observed) {
  const given = observed.assigned.flatMap((entry) => entry.files).sort();
  assert.deepEqual(given, [...FILES].sort(), 'every planned file is assigned exactly once');
  assert.ok(observed.assigned.some((entry) => entry.host === 'lab'),
    'the control reaches remote settlement');
  assert.deepEqual(observed.calls.record, [], 'failure does not create routing avoidance');
}

test('runPlacedTestFiles accepts complete clean assignments once', async () => {
  const observed = await observePlacement((files) =>
    ({status: 0, log: files.map((file) => green(file)).join('\n')}));
  assert.equal(observed.status, 0);
  assertAssignedOnce(observed);
});

for (const [name, outcome] of [
  ['remote red with a green controller', (files) =>
    ({status: 1, log: [red(files[0]), ...files.slice(1).map((file) => green(file))].join('\n')})],
  ['red followed by an obsolete retry-pass marker', (files) => ({status: 0, log: [
    red(files[0]), `# retried-once pass ${files[0]}`,
    ...files.slice(1).map((file) => green(file)),
  ].join('\n')})],
  ['red followed by an ordinary green verdict', (files) => ({status: 0, log: [
    red(files[0]), ...files.map((file) => green(file)),
  ].join('\n')})],
  ['zero assertions followed by positive assertions', (files) => ({status: 0, log: [
    green(files[0], 0), ...files.map((file) => green(file)),
  ].join('\n')})],
  ['nonzero exit after all green verdicts', (files) =>
    ({status: 137, log: files.map((file) => green(file)).join('\n')})],
  ['missing exit after all green verdicts', (files) =>
    ({status: null, log: files.map((file) => green(file)).join('\n')})],
  ['one missing verdict', (files) =>
    ({status: 0, log: files.slice(1).map((file) => green(file)).join('\n')})],
  ['no planned verdicts', () => ({status: 0, log: green('test/unrelated.test.js')})],
  ['verdicts only on stderr', (files) =>
    ({status: 0, log: '', errors: files.map((file) => green(file)).join('\n')})],
]) {
  test(`runPlacedTestFiles retains ${name} without reassignment`, async () => {
    const observed = await observePlacement(outcome);
    assert.notEqual(observed.status, 0, name);
    assertAssignedOnce(observed);
    assert.ok(observed.calls.lines.some((line) => line.startsWith('[lab] ')),
      'the original remote stream remains visible');
  });
}

for (const [name, outcome] of [
  ['busy', {status: PLACEMENT_EXIT.BUSY, log: 'lab-lock: busy'}],
  ['thermal refusal', {status: THERMAL_REFUSAL_EXIT, log: `thermal: ${THERMAL_REFUSAL}`}],
]) {
  test(`runPlacedTestFiles retains ${name} even with a spare host`, async () => {
    const observed = await observePlacement(() => outcome, {
      // The spare fits the long files, but initially receives only short work
      // below its setup cost and is omitted by the real initial planner.
      planCosts: (files) => files.map((file, index) =>
        ({file, ms: index < 2 ? 260000 : 1000, jobs: 1, lane: 'ordinary'})),
      discover: async () => ({fleet: fakeInventory().fleet, machines: [lab('lab', 1), lab('spare', 1.1)],
        record: () => assert.fail('refusal does not change routing history')}),
    });
    assert.notEqual(observed.status, 0);
    assertAssignedOnce(observed);
    assert.ok(observed.assigned.every((entry) => entry.host !== 'spare'),
      'a refused share never moves to the unused spare');
  });
}

for (const state of ['red', 'lost', 'superseded']) {
  test(`startLocalCorpus preserves an existing ${state} attempt instead of replacing it`, (t) => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-first-evidence-'));
    t.after(() => fs.rmSync(stateDir, {recursive: true, force: true}));
    const head = 'a'.repeat(40);
    const originals = new Map([
      ['.json', JSON.stringify({sha: head, state, startedAt: 1, reason: 'original outcome'})],
      ['.log', 'original first failure\n'],
      ['.sections.ndjson', '{"kind":"start","runId":"original"}\n'],
      ['.report.json', '{"original":"retained"}\n'],
    ]);
    for (const [suffix, bytes] of originals) {
      fs.writeFileSync(path.join(stateDir, head + suffix), bytes);
    }
    let spawned = 0;
    assert.throws(() => startLocalCorpus({root: stateDir, stateDir, head, files: FILES,
      spawnProcess: () => {
        spawned += 1; return {pid: 4242};
      }}), /already recorded/u);
    assert.equal(spawned, 0, 'no replacement process starts');
    for (const [suffix, bytes] of originals) {
      assert.equal(fs.readFileSync(path.join(stateDir, head + suffix), 'utf8'), bytes,
        `${suffix} remains byte-identical`);
    }
  });
}

test('reportLocalCorpus retains old evidence when a later head is green', (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-evidence-history-'));
  t.after(() => fs.rmSync(stateDir, {recursive: true, force: true}));
  const originals = new Map();
  for (let index = 1; index <= 22; index += 1) {
    const sha = index.toString(16).padStart(40, '0');
    const file = path.join(stateDir, `${sha}.json`);
    const bytes = JSON.stringify({sha, state: index === 22 ? 'green' : 'red',
      receipt: index === 22 ? 'corpus-full-v1' : undefined, startedAt: index,
      log: path.join(stateDir, `${sha}.log`)});
    originals.set(file, bytes);
    originals.set(path.join(stateDir, `${sha}.log`), `original ${sha}\n`);
  }
  for (const [file, bytes] of originals) fs.writeFileSync(file, bytes);
  reportLocalCorpus(stateDir, () => {});
  for (const [file, bytes] of originals) {
    assert.ok(fs.existsSync(file), `reporting retained original evidence ${path.basename(file)}`);
    assert.equal(fs.readFileSync(file, 'utf8'), bytes, 'reporting never deletes evidence');
  }
});

for (const [name, overrides] of [
  ['source commit unavailable', {commitAt: () => null}],
  ['fleet unavailable', {discover: async () => {
    throw new Error('inventory unavailable');
  }}],
  ['empty fleet', {discover: async () => ({fleet: fakeInventory().fleet, machines: []})}],
  ['proof base unavailable', {checkBase: () => {
    throw new Error('base unavailable');
  }}],
]) {
  test(`runPlacedTestFiles refuses ${name} without local execution`, async () => {
    const observed = await observePlacement(() => assert.fail('no remote run'), overrides);
    assert.notEqual(observed.status, 0);
    assert.deepEqual(observed.assigned, []);
    assert.ok(observed.calls.lines.some((line) => line.startsWith('placement: ')),
      'unavailability is reported');
  });
}
