import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {nativeThermalFixture} from './native-thermal-fixture.js';
import {runTestFiles} from '../../scripts/run-test-files.js';

import {
  planClassifiedTestFiles,
  runClassifiedTestFiles,
} from '../../scripts/run-classified-test-files.js';
import {LANE_JOBS_CAP_ENV}
  from '../../scripts/checks/test-resource-classification-constants.js';
import {FAST_TEST, MINUTE, labFixture} from './test-placement-execution-fixture.js';

// Candidate adaptation of the measured original controls at 5f951340.
// Real file membership, closure and fresh-observation assertions are unchanged;
// the collaborator now supplies the current pinned native endpoint contract.
function fixture(t, count) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thermal-admission-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'test', 'unit'), {recursive: true});
  const files = Array.from({length: count}, (_, index) =>
    `test/unit/admission-${String(index).padStart(3, '0')}.test.js`);
  for (const file of files) fs.writeFileSync(path.join(root, file), '');
  const sysRoot = path.join(root, 'empty-sys');
  fs.mkdirSync(sysRoot);
  assert.equal(planClassifiedTestFiles(root, files, []).length, 1);
  return {root, files, sysRoot};
}

test('each of 101 actual file executions has its own thermal admission',
  {timeout: 6 * MINUTE}, (t) => {
    const {root, files} = fixture(t, 101);
    const ledger = path.join(root, 'admission.ndjson');
    const runnerRoot = process.cwd();
    for (const [index, file] of files.entries()) {
      const source = [
        'import assert from \'node:assert/strict\';',
        'import {appendFileSync} from \'node:fs\';',
        'import {test} from \'node:test\';',
        `const ledger = ${JSON.stringify(ledger)};`,
        `const file = ${JSON.stringify(file)};`,
        'const record = (kind) => appendFileSync(ledger, JSON.stringify({kind, file}) + \'\\n\');',
        'record(\'start\');',
        'test(\'finite admitted child\', () => {',
        '  try {',
        `    assert.notEqual(${index}, 0, 'intentional original child failure');`,
        '  } finally { record(\'end\'); }',
        '});',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(root, file), source);
    }
    const native = nativeThermalFixture(t, {ledger,
      policy: {mode: 'sensor-required', cadence_ms: 0, max_concurrency: 1}});
    const env = {...native.env, [LANE_JOBS_CAP_ENV]: '1'};
    let output = '';
    const status = runClassifiedTestFiles(files, {
      root,
      env,
      write() {},
      spawn(command, args, options) {
        assert.equal(args[1], '--jobs=1');
        const result = spawnSync(command,
          [path.join(runnerRoot, args[0]), ...args.slice(1)],
          {...options, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], encoding: 'utf8',
            maxBuffer: 1024 * 1024, timeout: 4 * MINUTE});
        assert.ifError(result.error);
        assert.equal(result.signal, null, result.stderr);
        output += result.stdout;
        return result;
      },
    });
    const events = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(JSON.parse);
    const started = events.filter((event) => event.kind === 'start').map((event) => event.file);
    const ended = events.filter((event) => event.kind === 'end').map((event) => event.file);
    assert.deepEqual([...started].sort(), [...files].sort(), 'all real files started once');
    assert.deepEqual([...ended].sort(), [...files].sort(), 'all real file bodies settled once');
    assert.equal(new Set(started).size, files.length);
    assert.equal(status, 1, 'the actual first failed child remains the final failure');
    const lines = output.split('\n');
    assert.ok(lines.some((line) => line.startsWith(`not ok ${files[0]} `)), output);
    assert.ok(lines.some((line) => line.startsWith(`ok ${files.at(-1)} `)), output);
    const summaries = [...output.matchAll(
      /^# test-files total=(\d+) pass=(\d+) fail=(\d+) assertions=(\d+)$/gmu)];
    const totals = summaries.reduce((sum, match) =>
      sum.map((value, index) => value + Number(match[index + 1])), [0, 0, 0, 0]);
    assert.deepEqual(totals, [101, 100, 1, 101],
      'actual settled summaries retain exactly one intentional child failure');
    let observationAvailable = false;
    const unobserved = [];
    for (const event of events) {
      if (event.kind === 'observe') observationAvailable = true;
      if (event.kind === 'start') {
        if (!observationAvailable) unobserved.push(event.file);
        observationAvailable = false;
      }
    }
    t.diagnostic(JSON.stringify({started: started.length, ended: ended.length,
      observations: events.filter((event) => event.kind === 'observe').length, unobserved}));
    assert.deepEqual(unobserved, [],
      'each actual file start needs an observation; parent transport batching is irrelevant');
  });

test('unavailable native sensor-required observation admits no file', async (t) => {
  const {root, files} = fixture(t, 2);
  const native = nativeThermalFixture(t, {outcomes: ['UNAVAILABLE']});
  const result = await runTestFiles(files, {print: false, cwd: root, env: native.env, write() {}});
  assert.equal(result.total, 0);
  assert.deepEqual(result.notRun, files);
  assert.notEqual(result.exitStatus, 0);
  assert.equal(fs.readFileSync(native.counter, 'utf8'), '1');
});

test('the actual placed shell preserves an explicit one-worker cap',
  {timeout: 12 * MINUTE}, async (t) => {
    const placed = labFixture(t);
    const native = nativeThermalFixture(t);
    placed.machine.thermalEndpoint = native.endpoint;
    placed.env[LANE_JOBS_CAP_ENV] = '1';
    // Substitute only the declared processor-count producer, not the shell,
    // lock, bundle, checkout, runner or output. Eight CPUs discriminate 1 vs7
    // deterministically on every qualified host without claiming its CPU count.
    const stubs = placed.env.PATH.split(path.delimiter)[0];
    fs.writeFileSync(path.join(stubs, 'getconf'),
      '#!/bin/sh\n[ "$#" = 1 ] && [ "$1" = _NPROCESSORS_ONLN ] || exit 64\n' +
      'printf "8\\n"\n', {mode: 0o755});
    const result = await placed.start([FAST_TEST], {
      runId: 'thermal-explicit-cap',
      forward: {tapTimeout: '900', checkBase: placed.basis, laneJobsCap: '1'},
    }).done;
    assert.equal(result.status, 0, result.log + result.errors);
    assert.match(result.log, new RegExp(`^placement-head=${placed.sha}$`, 'mu'));
    assert.ok(result.log.split('\n').some((line) => line.startsWith(`ok ${FAST_TEST} `)),
      'the real classified child completed before the negative policy assertion');
    const policy = result.log.split('\n').find((line) => line.startsWith('placement-env='));
    t.diagnostic(policy);
    assert.match(policy, / lanecap:1 /u,
      'peer processor count cannot overwrite the explicit requested cap');
  });

test('HOLD drains the actual admitted file before waiting or admitting another', async (t) => {
  const {root, files} = fixture(t, 2);
  const ledger = path.join(root, 'close-ledger');
  for (const file of files) {
    fs.writeFileSync(path.join(root, file), [
      'import {test} from \'node:test\';',
      'import {appendFileSync} from \'node:fs\';',
      `test('finite body', () => appendFileSync(${JSON.stringify(ledger)}, ` +
        'String(process.pid) + \'\\n\'));',
    ].join('\n'));
  }
  const native = nativeThermalFixture(t);
  const policy = {mode: 'sensor-required', cadence_ms: 0, max_concurrency: 2};
  let reads = 0;
  const result = await runTestFiles(files, {print: false, cwd: root, env: native.env, jobs: 2,
    write() {}, async thermalRead() {
      reads += 1;
      if (reads === 2) return {outcome: 'HOLD', execution_policy: policy};
      if (reads === 3) {
        const pid = Number(fs.readFileSync(ledger, 'utf8').trim());
        assert.ok(Number.isSafeInteger(pid) && pid > 1);
        assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'},
          'the actual admitted child is reaped before the fresh observation');
      }
      return {outcome: 'READY', execution_policy: policy};
    }});
  assert.equal(result.ok, true);
  assert.equal(result.total, 2);
  assert.ok(reads >= 3);
});

test('a true first child failure survives refusal and later batches stay undelegated', (t) => {
  const {root, files} = fixture(t, 101);
  for (const file of files) {
    fs.writeFileSync(path.join(root, file),
      'import {test} from \'node:test\';\ntest(\'red\', () => { throw new Error(\'first red\'); });\n');
  }
  const native = nativeThermalFixture(t, {outcomes: ['READY', 'UNAVAILABLE'],
    policy: {mode: 'sensor-required', cadence_ms: 0, max_concurrency: 1}});
  const batches = [];
  const status = runClassifiedTestFiles(files, {root, env: native.env, write() {},
    spawn(command, args, options) {
      batches.push(args.slice(2));
      const result = spawnSync(command, [path.join(process.cwd(), args[0]), ...args.slice(1)],
        {...options, stdio: ['ignore', 'pipe', 'pipe', 'pipe'], encoding: 'utf8',
          maxBuffer: 1024 * 1024, timeout: MINUTE});
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      const terminal = JSON.parse(result.output[3]);
      assert.equal(terminal.refused, true);
      assert.equal(terminal.exitStatus, 1);
      return result;
    }});
  assert.equal(status, 1);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 100);
});
