import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {CONVERGENCE_PROBES_SHARD_PATH}
  from '../../scripts/checks/test-primary-classification-constants.js';
import {
  labConvergenceCertificationFiles, labNamedCertificationFiles, runLabTest,
  runLabTestRepetitions,
} from '../../scripts/lab/probe.js';
import {
  planClassifiedTestFiles,
  runClassifiedTestFiles,
} from '../../scripts/run-classified-test-files.js';

const FAST_TEST = 'test/query/distributed-merge-engine.test.js';
const LAB_NAME = 'tv-dator';
const ORDINARY = 'ordinary';
const RESULTS = 'test-output/reports/test-results.ndjson';
const COPIED_RESULTS = 'test-output/reports/test-results-tv-dator.ndjson';
const SHA = 'a'.repeat(40);
const UTF8 = 'utf8';
const LAB_CLI = 'scripts/lab.js';
const EXIT_FAILURE = 1;

function labRunnerLog(files) {
  const lines = [];
  const status = runClassifiedTestFiles(files, {
    root: process.cwd(), env: {}, write: (text) => lines.push(text),
    thermalSources: {sensors: () => ({'coretemp-isa-0000':
      {'Package id 0': {temp1_input: 61}}, 'nvme-pci-0200':
      {'Sensor 2': {temp3_input: 50}}})},
    thermalSleep: () => {},
    spawn(command, args) {
      for (const file of args.slice(2)) lines.push(`ok ${file} (1 assertions, 5ms)\n`);
      return {status: 0};
    },
  });
  return {status, log: lines.join('').trimEnd()};
}

test('certification profiles name one file or consume the canonical convergence shard', () => {
  assert.deepEqual(labNamedCertificationFiles(FAST_TEST), [FAST_TEST]);
  const canonical = fs.readFileSync(path.join(process.cwd(), CONVERGENCE_PROBES_SHARD_PATH),
    UTF8).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(labConvergenceCertificationFiles(process.cwd()), canonical,
    'the profile consumes the curated owner instead of naming an SLO file');
  const plan = planClassifiedTestFiles(process.cwd(), canonical, []);
  assert.deepEqual(plan.flatMap((lane) => lane.files).sort(), [...canonical].sort(),
    'the canonical profile is accepted whole by the existing classified planner');
});

test('certification CLI refuses incomplete or cross-profile requests before discovery', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-certification-cli-'));
  t.after(() => fs.rmSync(home, {recursive: true, force: true}));
  for (const [args, refusal] of [
    [['test', 'file', 'test/a.test.js', '--on', LAB_NAME],
      'lab: exact lab certification needs --sha COMMIT'],
    [['test', 'file', 'test/a.test.js', '--sha', 'HEAD'],
      'lab: exact lab certification needs --on NAME'],
    [['test', 'file', '--sha', 'HEAD', '--on', LAB_NAME],
      'lab: the file profile needs TEST_FILE'],
    [['test', 'file', 'test/a.test.js', 'test/b.test.js', '--sha', 'HEAD', '--on', LAB_NAME],
      'lab: the file profile takes exactly one TEST_FILE'],
    [['test', 'convergence-probes', 'test/a.test.js', '--sha', 'HEAD', '--on', LAB_NAME],
      'lab: the convergence-probes profile takes no TEST_FILE'],
    [['test', 'convergence-probes', '--sha', 'HEAD', '--on', LAB_NAME, '--repeat', '0'],
      'lab: --repeat must be a positive integer no greater than 100'],
    [['test', 'convergence-probes', '--sha', 'HEAD', '--on', LAB_NAME, '--repeat', '101'],
      'lab: --repeat must be a positive integer no greater than 100'],
    [['test', 'convergence-probes', '--sha', 'HEAD', '--on', LAB_NAME,
      '--stop-on-first-red', 'yes'], 'lab: --stop-on-first-red takes no value'],
    [['test', 'convergence-probes', '--sha', 'HEAD', '--on', LAB_NAME, '--lane', 'exclusive'],
      'lab: exact lab certification selects its profile: it takes no --lane'],
    [['test', 'convergence-probes', '--sha', 'HEAD', '--on', LAB_NAME, '--base-sha', 'main'],
      'lab: --base-sha measures the change cone: it takes the changed profile'],
    [['test', 'all', '--lane', 'all', '--repeat', '2'],
      'lab: --repeat takes the file or convergence-probes profile'],
  ]) {
    const result = spawnSync(process.execPath, [LAB_CLI, ...args],
      {encoding: UTF8, env: {...process.env, LAGRANGE_LAB_HOME: home}});
    assert.equal(result.status, EXIT_FAILURE, `${args.join(' ')} exits non-zero`);
    assert.equal(result.stderr, `${refusal}\n`, args.join(' '));
    assert.equal(result.stdout, '', 'and runs nothing');
  }
});

test('certification repetitions retain red and optionally stop before the next run', async () => {
  const lines = [];
  let calls = 0;
  const status = await runLabTestRepetitions({repeat: 3, stopOnFirstRed: true,
    write: (line) => lines.push(line)}, async () => [0, 1, 0][calls++]);
  assert.equal(status, 1);
  assert.equal(calls, 2, 'the third repetition never starts after the first red');
  assert.deepEqual(lines, ['lab test: repetition 1/3', 'lab test: repetition 2/3']);

  calls = 0;
  assert.equal(await runLabTestRepetitions({repeat: 3, write: () => {}},
    async () => [0, 1, 0][calls++]), 1, 'keep-going retains the red aggregate');
  assert.equal(calls, 3, 'without the stop flag every requested repetition runs');

  lines.length = 0;
  assert.equal(await runLabTestRepetitions({repeat: 1, write: (line) => lines.push(line)},
    async () => 0), 0);
  assert.deepEqual(lines, [], 'one normal lab run keeps its existing output surface');
});

test('each certification repetition uses the normal named-machine lab path', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-certification-placement-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const machine = {name: LAB_NAME, controller: false, speed: 1, avoid: [], gapsKey: 'k',
    cores: 12, memKiB: 1024 * 1024};
  const runs = [];
  const copies = [];
  let repetition = 0;
  const deps = {
    discover: async () => ({fleet: [], machines: [machine]}),
    commitAt: () => SHA,
    runRemote: (shard, options) => {
      runs.push({shard, options});
      repetition += 1;
      const output = labRunnerLog(shard.files).log.split('\n');
      output.push(`placement-results={"file":"${FAST_TEST}","ok":true,` +
        `"repetition":${repetition}}`);
      for (const line of output) options.onLine(line, 'out');
      return {done: Promise.resolve({status: 0, log: '', errors: ''})};
    },
  };
  const runOnce = async () => {
    const status = await runLabTest({
      plan: [{resourceClass: ORDINARY, files: [FAST_TEST], jobs: 4}],
      commit: {sha: SHA, gitRoot: root, release: () => {}},
      on: LAB_NAME, root, write: () => {},
    }, deps);
    copies.push(fs.readFileSync(path.join(root, COPIED_RESULTS), UTF8));
    return status;
  };
  assert.equal(await runLabTestRepetitions({repeat: 2, write: () => {}}, runOnce), 0);
  assert.equal(runs.length, 2);
  for (const run of runs) {
    assert.equal(run.shard.machine.name, LAB_NAME, 'the exact named machine is placed');
    assert.equal(run.options.sha, SHA, 'the exact commit is forwarded to the existing shard');
    assert.equal(run.options.holder.purpose, `test:${ORDINARY}`,
      'the normal lab lock purpose is used');
    assert.equal(run.options.results, RESULTS, 'the normal runner result ledger is requested');
  }
  assert.deepEqual(copies, [1, 2].map((one) =>
    `{"file":"${FAST_TEST}","ok":true,"repetition":${one}}\n`),
  'the normal result-copy path runs after each distinct repetition');
});
