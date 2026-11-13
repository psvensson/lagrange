import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  planClassifiedTestFiles,
  runClassifiedTestFiles,
} from '../../scripts/run-classified-test-files.js';
import {LANE_JOBS_CAP_ENV}
  from '../../scripts/checks/test-resource-classification-constants.js';
import {FAST_TEST, MINUTE, labFixture} from './test-placement-execution-fixture.js';

// Original-compatible controls through the real classification and file runner.
// Sensor documents are controlled observations, not native readiness proof.
// Actual finite child files write the event ledger; parent batch shape is not
// the assertion. Candidate native observer wiring needs explicit adaptation.
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

function coolSensors() {
  return {
    'coretemp-isa-0000': {'Package id 0': {temp1_input: 40}},
    'nvme-pci-0200': {'Sensor 2': {temp3_input: 40}},
  };
}

test('each of 101 actual file executions has its own thermal admission',
  {timeout: 6 * MINUTE}, (t) => {
    const {root, files, sysRoot} = fixture(t, 101);
    const ledger = path.join(root, 'admission.ndjson');
    const runnerRoot = process.cwd();
    for (const [index, file] of files.entries()) {
      const source = [
        "import assert from 'node:assert/strict';",
        "import {appendFileSync} from 'node:fs';",
        "import {test} from 'node:test';",
        `const ledger = ${JSON.stringify(ledger)};`,
        `const file = ${JSON.stringify(file)};`,
        "const record = (kind) => appendFileSync(ledger, JSON.stringify({kind, file}) + '\\n');",
        "record('start');",
        "test('finite admitted child', () => {",
        '  try {',
        `    assert.notEqual(${index}, 0, 'intentional original child failure');`,
        "  } finally { record('end'); }",
        '});',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(root, file), source);
    }
    const env = {...process.env, [LANE_JOBS_CAP_ENV]: '1'};
    delete env.NODE_TEST_CONTEXT;
    delete env.LAGRANGE_SKIP_THERMAL_GATE;
    let output = '';
    const status = runClassifiedTestFiles(files, {
      root,
      env,
      thermalSources: {sysRoot, sensors() {
        fs.appendFileSync(ledger, JSON.stringify({kind: 'observe'}) + '\n');
        return coolSensors();
      }},
      thermalSleep() { assert.fail('a cool observation needs no sleep'); },
      write() {},
      spawn(command, args, options) {
        assert.equal(args[1], '--jobs=1');
        const result = spawnSync(command,
          [path.join(runnerRoot, args[0]), ...args.slice(1)],
          {...options, stdio: 'pipe', encoding: 'utf8', timeout: 4 * MINUTE});
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

test('unavailable thermal observation admits no file', (t) => {
  const {root, files, sysRoot} = fixture(t, 2);
  const admitted = [];
  const lines = [];
  let reads = 0;
  const status = runClassifiedTestFiles(files, {
    root,
    env: {},
    thermalSources: {sysRoot, sensors() { reads += 1; return null; }},
    thermalSleep() { assert.fail('unavailable is not a cooling wait'); },
    write(line) { lines.push(line); },
    spawn(_command, args) {
      admitted.push(...args.slice(2));
      return {status: 0};
    },
  });
  assert.ok(reads > 0, 'the actual observation owner was reached');
  t.diagnostic(JSON.stringify({status, admitted, output: lines.join('')}));
  assert.deepEqual(admitted, [], 'missing observation cannot grant admission');
  assert.notEqual(status, 0, 'unavailable is never successful execution');
});

test('the actual placed shell preserves an explicit one-worker cap',
  {timeout: 12 * MINUTE}, async (t) => {
  const placed = labFixture(t);
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
    forward: {tapTimeout: '900', checkBase: placed.basis},
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
