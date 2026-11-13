// The real placement lifecycle with finite execution collaborators: ownership
// survives a setup or settlement failure, including a failing cleanup callback.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {PLACEMENT_EXIT, labTestDeps, placementDeps, runPlacedTestFiles, startRemoteShard}
  from '../../scripts/lab/probe.js';
import {fakeInventory, lab, placementRunFixture} from './test-placement-fixtures.js';

const FILES = Array.from({length: 8}, (_, index) => `test/lifecycle-${index}.test.js`);
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const verdicts = (files) => files.map((file) => `ok ${file} (1 assertions, 1ms)`).join('\n');

for (const runLocalChild of [undefined, null, 'unavailable']) {
  test(`parallel placement refuses an unavailable controller child ${runLocalChild}`,
    async () => {
      const fixture = placementRunFixture({runLocalChild});
      assert.equal(await runPlacedTestFiles(FILES, fixture.deps), PLACEMENT_EXIT.SETUP);
      assert.deepEqual(fixture.calls.local, [], 'no synchronous controller substitute ran');
      assert.deepEqual(fixture.calls.remote, [], 'no remote child was admitted');
      assert.ok(fixture.calls.lines.some((line) =>
        line === 'placement: unavailable - the parallel controller child executor is unavailable'));
    });
}

test('a failed remote acquisition closes acquired siblings and preserves the original error',
  async () => {
    const signals = new EventEmitter();
    const primary = new Error('second host failed while opening its output');
    const acquired = [];
    const closed = [];
    const fixture = placementRunFixture({
      signals,
      discover: async () => ({fleet: fakeInventory().fleet, machines: [lab('first', 1), lab('second', 1)]}),
      runRemote: async (shard) => {
        if (shard.machine.name === 'second') {
          await new Promise(setImmediate);
          throw primary;
        }
        acquired.push(shard.machine.name);
        let finish;
        const done = new Promise((resolve) => {
          finish = resolve;
        });
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
        discover: async () => ({fleet: fakeInventory().fleet, machines: [lab('first', 1), lab('second', 1)]}),
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
          const done = new Promise((resolve) => {
            finish = resolve;
          });
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
    const failedDestination = path.join(root, 'finite-output-open-directory');
    if (fault === 'second output open') fs.mkdirSync(failedDestination);
    else env.INVALID_PLACEMENT_VALUE = '\u0000';
    const opened = [];
    const inputObservations = [];
    let originalFailure = null;
    const open = fs.openSync;
    const observedOpen = t.mock.method(fs, 'openSync', (...args) => {
      // An existing attempt is now refused before mutation. Keep this
      // separate acquisition witness at the real second-open boundary:
      // the OS still produces EISDIR, after the first descriptor is owned.
      if (fault === 'second output open' && args[0] === `${base}.err`) {
        try {
          return open(failedDestination, 'w');
        } catch (error) {
          originalFailure = error;
          throw error;
        }
      }
      const descriptor = open(...args);
      if (args[0] === `${base}.log` || args[0] === `${base}.err`) {
        opened.push(descriptor);
        inputObservations.push(['.sh', '.bundle'].map((suffix) => fs.existsSync(base + suffix)));
      }
      return descriptor;
    });
    try {
      assert.throws(() => startRemoteShard({machine, files: ['test/never-executed.test.js']},
        {root, sha, env, runId, deadlineMs: 60000,
          holder: {purpose: 'finite acquisition control', expectedMs: 60000}}),
      (error) => fault === 'second output open' ?
        error === originalFailure && error.code === 'EISDIR' :
        error.code === 'ERR_INVALID_ARG_VALUE');
    } finally {
      observedOpen.mock.restore();
    }
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

const STREAMED_CONTROL_BOUND_MS = 5000;
const STREAMED_CONTROL_POLL_MS = 20;
const STREAMED_DESCENDANT_MS = 12000;
const STREAMED_IDENTITY_FIELDS = 'pid=,ppid=,pgid=,sid=,stat=';

function streamedControllerProcesses() {
  const observed = spawnSync('ps', ['-eo', STREAMED_IDENTITY_FIELDS], {encoding: 'utf8'});
  assert.equal(observed.status, 0, observed.stderr);
  return observed.stdout.trim().split('\n').map((line) => {
    const [pid, parent, group, session, state] = line.trim().split(/\s+/u);
    return {pid: Number(pid), parent: Number(parent), group: Number(group),
      session: Number(session), state};
  });
}

function liveStreamedControllerGroup(group) {
  assert.ok(Number.isInteger(group) && group > 1, 'the controller acquired a positive group');
  const live = streamedControllerProcesses()
    .filter((entry) => entry.group === group && !entry.state.startsWith('Z'));
  assert.ok(live.every((entry) => entry.session === group),
    'only the detached session this controller acquired is addressed');
  return live;
}

function boundedStreamedController(promise, label) {
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(label)), STREAMED_CONTROL_BOUND_MS);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function waitForStreamedController(predicate, label) {
  const deadline = Date.now() + STREAMED_CONTROL_BOUND_MS;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, STREAMED_CONTROL_POLL_MS));
  }
  assert.ok(predicate(), label);
}

test('controller abort closes inherited output after direct exit and keeps the first status',
  {timeout: 20000}, async (t) => {
    const fileCleanups = [];
    let child = null;
    let closed = null;
    let terminal = null;
    t.after(async () => {
      const errors = [];
      const attempt = async (action) => {
        try {
          await action();
        } catch (error) {
          errors.push(error);
        }
      };
      if (child) {
        await attempt(() => child.abort());
        await attempt(() => {
          if (liveStreamedControllerGroup(child.group).length === 0) return;
          try {
            process.kill(-child.group, 'SIGKILL');
          } catch (error) {
            if (error.code !== 'ESRCH') throw error;
          }
        });
        await attempt(() => boundedStreamedController(closed,
          'finite controller fixture did not close after independent cleanup'));
        await attempt(() => waitForStreamedController(
          () => liveStreamedControllerGroup(child.group).length === 0,
          'independent fixture cleanup leaves no live owned group'));
      }
      if (errors.length) {
        throw new AggregateError(errors, 'streamed controller cleanup unavailable');
      }
      for (const close of fileCleanups) await close();
    });
    const {root, env} = finiteRepository({after: (close) => fileCleanups.push(close)});
    const runner = path.join(root, 'scripts', 'run-classified-test-files.js');
    const ready = path.join(root, 'controller-ready');
    const descendantReady = path.join(root, 'descendant-ready');
    const normal = path.join(root, 'descendant-completed-normally');
    const input = path.join(root, 'actual-controller-input');
    fs.mkdirSync(path.dirname(runner), {recursive: true});
    const identitySource = [
      'function identity() {',
      `  const observed = spawnSync('ps', ['-o', ${JSON.stringify(STREAMED_IDENTITY_FIELDS)},`,
      '    \'-p\', String(process.pid)], {encoding: \'utf8\'});',
      '  if (observed.status !== 0) throw new Error(observed.stderr);',
      '  const [pid, parent, group, session, state] = observed.stdout.trim().split(/\\s+/u);',
      '  return {pid: Number(pid), parent: Number(parent), group: Number(group),',
      '    session: Number(session), state};',
      '}',
      'function mark(file) {',
      '  fs.writeFileSync(file + \'.tmp\', JSON.stringify(identity()));',
      '  fs.renameSync(file + \'.tmp\', file);',
      '}',
    ].join('\n');
    const preamble = 'const fs = require(\'node:fs\');\n' +
      'const {spawn, spawnSync} = require(\'node:child_process\');\n';
    const descendant = [preamble, identitySource,
      `setTimeout(() => {fs.writeFileSync(${JSON.stringify(normal)}, 'natural completion');`,
      `  process.exit(0);}, ${STREAMED_DESCENDANT_MS});`,
      `mark(${JSON.stringify(descendantReady)});`,
      'fs.writeSync(1, \'descendant owns inherited output\\n\');',
      '',
    ].join('\n');
    fs.writeFileSync(runner, [preamble, identitySource,
      `fs.writeFileSync(${JSON.stringify(input)}, fs.readFileSync(0, 'utf8'));`,
      `mark(${JSON.stringify(ready)});`,
      `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}],`,
      '  {stdio: [\'ignore\', \'inherit\', \'inherit\']});',
      'descendant.on(\'error\', (error) => {',
      '  process.stderr.write(String(error)); process.exit(91);',
      '});',
      `const bound = setTimeout(() => process.exit(92), ${STREAMED_CONTROL_BOUND_MS});`,
      'const poll = setInterval(() => {',
      `  if (!fs.existsSync(${JSON.stringify(descendantReady)})) return;`,
      '  clearInterval(poll); clearTimeout(bound);',
      '  fs.writeSync(1, \'direct-controller-exit=42\\n\');',
      '  process.exit(42);',
      `}, ${STREAMED_CONTROL_POLL_MS});`,
      '',
    ].join('\n'));
    const lines = [];
    child = labTestDeps({root, env}).runLocalChild(['test/finite-streamed.test.js'],
      {onLine: (line) => lines.push(line)});
    closed = child.done.then((status) => {
      terminal = {status};
      return terminal;
    }, (error) => {
      terminal = {error};
      return terminal;
    });
    await waitForStreamedController(() => fs.existsSync(ready) && fs.existsSync(descendantReady),
      'the actual controller and its inherited-output descendant both acquired their markers');
    const direct = JSON.parse(fs.readFileSync(ready, 'utf8'));
    const remaining = JSON.parse(fs.readFileSync(descendantReady, 'utf8'));
    assert.equal(direct.pid, child.group);
    assert.equal(direct.parent, process.pid);
    assert.deepEqual([direct.group, direct.session], [child.group, child.group]);
    assert.ok(Number.isInteger(remaining.pid) && remaining.pid > 1);
    assert.deepEqual([remaining.parent, remaining.group, remaining.session],
      [direct.pid, child.group, child.group], 'the real descendant belongs to this acquired group');
    await waitForStreamedController(() => !streamedControllerProcesses()
      .some((one) => one.pid === direct.pid && !one.state.startsWith('Z')),
    'the actual direct controller exited before cancellation');
    await new Promise(setImmediate);
    assert.equal(terminal, null, 'owned output remains open after the observed direct exit');
    assert.ok(liveStreamedControllerGroup(child.group).some(({pid}) => pid === remaining.pid),
      'cancellation targets a still-live descendant, not an already absent group');
    assert.equal(fs.existsSync(normal), false, 'the natural ceiling has not ended the descendant');
    child.abort();
    const outcome = await boundedStreamedController(closed,
      'explicit abort must close inherited output while its finite descendant is still alive');
    if (outcome.error) throw outcome.error;
    assert.equal(outcome.status, 42,
      'the first actual nonzero exit survives descendant cancellation');
    assert.deepEqual(liveStreamedControllerGroup(child.group), [],
      'no live group member remains when the owner reports done');
    assert.equal(fs.existsSync(normal), false, 'owner cancellation preceded natural completion');
    assert.equal(fs.readFileSync(input, 'utf8'), 'test/finite-streamed.test.js\n');
    assert.ok(lines.includes('direct-controller-exit=42'),
      'the actual direct child reported its exit');
  });
