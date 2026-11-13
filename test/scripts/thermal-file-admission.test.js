import assert from 'node:assert/strict';
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

// Original-compatible owner controls. The classification and thermal owners
// are real; sensor documents and the subprocess admission sink are controlled.
// This measures delegated file admission, not execution of 101 test children
// or physical sensor readiness. The separate placement witness runs its child.
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

test('each of 101 delegated files has its own thermal admission', (t) => {
  const {root, files, sysRoot} = fixture(t, 101);
  const events = [];
  const admitted = [];
  let first = true;
  const status = runClassifiedTestFiles(files, {
    root,
    env: {[LANE_JOBS_CAP_ENV]: '1'},
    thermalSources: {sysRoot, sensors() {
      events.push({kind: 'observe'});
      return coolSensors();
    }},
    thermalSleep() { assert.fail('a cool observation needs no sleep'); },
    write() {},
    spawn(_command, args) {
      assert.equal(args[1], '--jobs=1');
      for (const file of args.slice(2)) {
        admitted.push(file);
        events.push({kind: 'admit', file});
      }
      const result = {status: first ? 7 : 0};
      first = false;
      return result;
    },
  });
  assert.equal(status, 7, 'later green delegation preserves the first failure');
  assert.deepEqual([...admitted].sort(), [...files].sort(), 'all files admitted once');
  assert.equal(new Set(admitted).size, files.length);
  const gaps = [];
  let pending = 0;
  for (const event of events) {
    if (event.kind === 'observe') {
      gaps.push(pending);
      pending = 0;
    } else {
      pending += 1;
    }
  }
  gaps.push(pending);
  t.diagnostic(JSON.stringify({files: admitted.length,
    observations: events.filter((event) => event.kind === 'observe').length, gaps}));
  assert.equal(Math.max(...gaps), 1,
    'no observation delegates multiple file starts without fresh admission');
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
