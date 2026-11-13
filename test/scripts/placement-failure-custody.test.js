// The real placement lifecycle with finite execution collaborators: ownership
// survives a setup or settlement failure, including a failing cleanup callback.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {PLACEMENT_EXIT, placementDeps, runPlacedTestFiles, startRemoteShard}
  from '../../scripts/lab/probe.js';
import {lab, placementRunFixture} from './test-placement-fixtures.js';

const FILES = Array.from({length: 8}, (_, index) => `test/lifecycle-${index}.test.js`);
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const verdicts = (files) => files.map((file) => `ok ${file} (1 assertions, 1ms)`).join('\n');

test('a failed remote acquisition closes acquired siblings and preserves the original error',
  async () => {
    const signals = new EventEmitter();
    const primary = new Error('second host failed while opening its output');
    const acquired = [];
    const closed = [];
    const fixture = placementRunFixture({
      signals,
      discover: async () => ({machines: [lab('first', 1), lab('second', 1)]}),
      runRemote: async (shard) => {
        if (shard.machine.name === 'second') {
          await new Promise(setImmediate);
          throw primary;
        }
        acquired.push(shard.machine.name);
        let finish;
        const done = new Promise((resolve) => { finish = resolve; });
        return {done, abort: () => {
          closed.push(shard.machine.name);
          finish({status: null, reason: 'interrupted', log: ''});
        }};
      },
    });
    await assert.rejects(runPlacedTestFiles(FILES, fixture.deps), (error) => error === primary);
    assert.deepEqual(acquired, ['first'], 'one child was acquired before the other start failed');
    assert.deepEqual(closed, acquired, 'the acquired child settled before the caller rejected');
    assert.deepEqual(fixture.calls.local, [], 'no controller share starts after failed acquisition');
    assert.ok(SIGNALS.every((signal) => signals.listenerCount(signal) === 0));
  });

for (const cleanupThrows of [false, true]) {
  test(`a rejected settlement closes every acquired child with cleanupThrows=${cleanupThrows}`,
    async () => {
      const signals = new EventEmitter();
      const primary = new Error('first host output could not be read');
      const secondary = new Error('first host cleanup unavailable');
      const assigned = [];
      const closed = [];
      let rejectFirst;
      const fixture = placementRunFixture({
        signals,
        discover: async () => ({machines: [lab('first', 1), lab('second', 1)]}),
        runRemote: (shard) => {
          assigned.push(...shard.files);
          let finish;
          const done = new Promise((resolve, reject) => {
            finish = resolve;
            if (shard.machine.name === 'first') rejectFirst = reject;
          });
          return {done, abort: () => {
            closed.push(shard.machine.name);
            finish({status: null, reason: 'interrupted', log: ''});
            if (cleanupThrows && shard.machine.name === 'first') throw secondary;
          }};
        },
        runLocalChild: (files) => {
          assigned.push(...files);
          let finish;
          const done = new Promise((resolve) => { finish = resolve; });
          rejectFirst(primary);
          return {done, abort: () => {
            closed.push('controller');
            finish(PLACEMENT_EXIT.INTERRUPTED);
          }};
        },
      });
      await assert.rejects(runPlacedTestFiles(FILES, fixture.deps), (error) => error === primary);
      assert.deepEqual(assigned.sort(), [...FILES].sort(), 'every file was assigned exactly once');
      assert.deepEqual(closed, ['controller', 'first', 'second'],
        'a throwing first cleanup cannot strand a later sibling');
      assert.ok(SIGNALS.every((signal) => signals.listenerCount(signal) === 0));
      assert.equal(fixture.calls.lines.some((line) => /cleanup incomplete/u.test(line)),
        cleanupThrows, 'incomplete cleanup is explicit and is never reported as quiescent');
      if (cleanupThrows) {
        assert.ok(fixture.calls.lines.some((line) => line.includes(secondary.message)),
          'the secondary cleanup cause remains visible beside the original rejection');
      }
    });
}

for (const status of [null, undefined]) {
  test(`an unmeasured controller outcome ${status} cannot become a passing placed run`, async () => {
    const assigned = [];
    const fixture = placementRunFixture({
      runRemote: (shard) => {
        assigned.push(...shard.files);
        return {done: Promise.resolve({status: 0, log: verdicts(shard.files)})};
      },
      runLocalChild: (files) => {
        assigned.push(...files);
        return {done: Promise.resolve(status)};
      },
    });
    assert.equal(await runPlacedTestFiles(FILES, fixture.deps), PLACEMENT_EXIT.SETUP);
    assert.deepEqual(assigned.sort(), [...FILES].sort());
    const local = placementRunFixture({env: {LAGRANGE_PLACEMENT: 'local'},
      runLocal: () => status});
    assert.equal(await runPlacedTestFiles(FILES, local.deps), PLACEMENT_EXIT.SETUP);
  });
}

function finiteRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-acquisition-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const env = gitProcessEnvironment();
  execGit(['init', '--quiet'], {cwd: root, env});
  fs.writeFileSync(path.join(root, 'README'), 'finite descriptor acquisition control\n');
  execGit(['add', 'README'], {cwd: root, env});
  execGit(['-c', 'commit.gpgsign=false',
    '-c', 'user.name=Placement Fixture', '-c', 'user.email=placement@example.invalid',
    'commit', '--quiet', '-m', 'finite source'], {cwd: root, env});
  const basis = execGit(['rev-parse', 'HEAD'], {cwd: root, env, encoding: 'utf8'}).trim();
  fs.appendFileSync(path.join(root, 'README'), 'candidate source\n');
  execGit(['add', 'README'], {cwd: root, env});
  execGit(['-c', 'commit.gpgsign=false',
    '-c', 'user.name=Placement Fixture', '-c', 'user.email=placement@example.invalid',
    'commit', '--quiet', '-m', 'candidate source'], {cwd: root, env});
  const sha = execGit(['rev-parse', 'HEAD'], {cwd: root, env, encoding: 'utf8'}).trim();
  const machine = {name: 'finite', repoHead: basis, repoPath: root, factor: 1, sshTarget: null};
  return {root, sha, machine, env};
}

for (const fault of ['second output open', 'wrapper spawn']) {
  test(`remote ${fault} failure closes the descriptors it acquired`, (t) => {
    const {root, sha, machine, env} = finiteRepository(t);
    const runId = 'failed-acquisition';
    const base = path.join(root, 'test-output', 'placement', `${runId}-finite`);
    fs.mkdirSync(path.dirname(base), {recursive: true});
    if (fault === 'second output open') fs.mkdirSync(`${base}.err`);
    else env.INVALID_PLACEMENT_VALUE = '\u0000';
    const opened = [];
    const inputObservations = [];
    const open = fs.openSync;
    const observedOpen = t.mock.method(fs, 'openSync', (...args) => {
      const descriptor = open(...args);
      if (args[0] === `${base}.log` || args[0] === `${base}.err`) {
        opened.push(descriptor);
        inputObservations.push(['.sh', '.bundle'].map((suffix) => fs.existsSync(base + suffix)));
      }
      return descriptor;
    });
    assert.throws(() => startRemoteShard({machine, files: ['test/never-executed.test.js']},
      {root, sha, env, runId, deadlineMs: 60000,
        holder: {purpose: 'finite acquisition control', expectedMs: 60000}}),
    (error) => error.code === (fault === 'second output open' ? 'EISDIR' : 'ERR_INVALID_ARG_VALUE'));
    observedOpen.mock.restore();
    assert.equal(opened.length, fault === 'second output open' ? 1 : 2,
      'the control reached the actual descriptor acquisition boundary');
    assert.ok(inputObservations.every(([script, bundle]) => script && bundle),
      'the real two-commit bundle and wrapper existed before acquisition failed');
    for (const descriptor of opened) {
      assert.throws(() => fs.fstatSync(descriptor), {code: 'EBADF'},
        'every acquired stdout or stderr descriptor is closed');
    }
    assert.ok(fs.existsSync(`${base}.log`), 'the original partial output remains available');
    assert.ok(['.sh', '.bundle'].every((suffix) => !fs.existsSync(base + suffix)),
      'both transient execution inputs are removed without deleting the output evidence');
  });
}

for (const signalled of [false, true]) {
  test(`the real controller child preserves signalled=${signalled} execution`, async (t) => {
    const {root, env} = finiteRepository(t);
    const runner = path.join(root, 'scripts', 'run-classified-test-files.js');
    fs.mkdirSync(path.dirname(runner), {recursive: true});
    const marker = path.join(root, 'child-started');
    fs.writeFileSync(runner,
      'const fs = require("node:fs");\n' +
      `fs.writeFileSync(${JSON.stringify(marker)}, "started");\n` +
      (signalled ? 'process.kill(process.pid, "SIGTERM");\n' : 'process.exit(0);\n'));
    const child = placementDeps({root, env}).runLocalChild(['test/finite.test.js']);
    t.after(() => child.abort());
    assert.equal(await child.done, signalled ? PLACEMENT_EXIT.SETUP : 0);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'started',
      'the actual child ran before its exit was normalized');
  });
}

for (const fault of ['close input', 'unlink input']) {
  test(`a controller ${fault} exception closes its acquired child before rejecting`, async (t) => {
    const {root, env} = finiteRepository(t);
    const runner = path.join(root, 'scripts', 'run-classified-test-files.js');
    fs.mkdirSync(path.dirname(runner), {recursive: true});
    const completed = path.join(root, 'completed-normally');
    fs.writeFileSync(runner, 'const fs = require("node:fs");\n' +
      `setTimeout(() => { fs.writeFileSync(${JSON.stringify(completed)}, "normal"); ` +
      'process.exit(0); }, 1000);\n');
    const primary = new Error(`original ${fault} failure`);
    let input;
    let list;
    let injected = false;
    const open = fs.openSync;
    const close = fs.closeSync;
    const remove = fs.rmSync;
    const observedOpen = t.mock.method(fs, 'openSync', (...args) => {
      const descriptor = open(...args);
      if (String(args[0]).endsWith('.files') && args[1] === 'r') {
        input = descriptor;
        list = args[0];
      }
      return descriptor;
    });
    const observedClose = t.mock.method(fs, 'closeSync', (descriptor) => {
      close(descriptor);
      if (descriptor === input && fault === 'close input' && !injected) {
        injected = true;
        throw primary;
      }
    });
    const observedRemove = t.mock.method(fs, 'rmSync', (...args) => {
      remove(...args);
      if (args[0] === list && fault === 'unlink input' && !injected) {
        injected = true;
        throw primary;
      }
    });
    const child = placementDeps({root, env}).runLocalChild(['test/finite.test.js']);
    t.after(() => child.abort());
    observedOpen.mock.restore();
    observedClose.mock.restore();
    observedRemove.mock.restore();
    assert.ok(injected, 'the fault follows the real child acquisition');
    await assert.rejects(child.done, (error) => error === primary);
    assert.throws(() => fs.fstatSync(input), {code: 'EBADF'});
    assert.equal(fs.existsSync(list), false, 'closing and unlinking were both attempted');
    assert.throws(() => process.kill(-child.group, 0), {code: 'ESRCH'},
      'the returned child group is closed before the original error escapes');
    assert.equal(fs.existsSync(completed), false,
      'the owner cancelled its child instead of waiting for ordinary completion');
  });
}

test('a controller input-open failure removes the list it already acquired', (t) => {
  const {root, env} = finiteRepository(t);
  const primary = new Error('original controller input-open failure');
  let list;
  const open = fs.openSync;
  const observedOpen = t.mock.method(fs, 'openSync', (...args) => {
    if (String(args[0]).endsWith('.files') && args[1] === 'r') {
      list = args[0];
      assert.ok(fs.existsSync(list), 'the real input list exists before the open failure');
      throw primary;
    }
    return open(...args);
  });
  assert.throws(() => placementDeps({root, env}).runLocalChild(['test/finite.test.js']),
    (error) => error === primary);
  observedOpen.mock.restore();
  assert.ok(list, 'the control reached input acquisition');
  assert.equal(fs.existsSync(list), false, 'the transient list is removed before rejection');
});

test('a remote wrapper refuses missing timeout before any transport starts', async (t) => {
  const {root, sha, machine, env} = finiteRepository(t);
  const bin = path.join(root, 'finite-bin');
  fs.mkdirSync(bin);
  fs.symlinkSync('/bin/sh', path.join(bin, 'sh'));
  const transported = path.join(root, 'transport-started');
  fs.writeFileSync(path.join(bin, 'ssh'), '#!/bin/sh\n' +
    `printf started >> '${transported}'\n`, {mode: 0o755});
  const child = startRemoteShard({machine: {...machine, sshTarget: 'finite-transport'},
    files: ['test/never-executed.test.js']}, {root, sha, env: {...env, PATH: bin},
    deadlineMs: 60000, holder: {purpose: 'finite timeout refusal', expectedMs: 60000}});
  t.after(() => child.abort());
  const outcome = await child.done;
  assert.equal(outcome.status, PLACEMENT_EXIT.SETUP);
  assert.match(outcome.errors, /bounded timeout command unavailable/u);
  assert.equal(fs.existsSync(transported), false,
    'neither upload nor execution begins without the declared timeout owner');
});
