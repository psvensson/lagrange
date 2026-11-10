// Real Linux process trees only; these are isolated lifetime tests, not MCP observations.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {run, service} from '../../scripts/agent-tooling/process.js';

const COMMAND_TIMEOUT_MS = 1500;
const COMMAND_OPTIONS = {timeout: COMMAND_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe']};
const OBSERVATION_TIMEOUT_MS = 12000;
const POLL_MS = 25;
const PROCESS_MODULE = new URL('../../scripts/agent-tooling/process.js', import.meta.url).href;
const IDENTITY_SOURCE = `
  function identity() {
    const fields = fs.readFileSync('/proc/self/stat', 'utf8')
      .slice(fs.readFileSync('/proc/self/stat', 'utf8').lastIndexOf(')') + 2).split(' ');
    return {pid: process.pid, group: Number(fields[2]), started: fields[19]};
  }
`;

function observedProcess(identity) {
  let stat;
  try {
    stat = fs.readFileSync(`/proc/${identity.pid}/stat`, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return {live: false};
    throw error;
  }
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return {pid: identity.pid, group: Number(fields[2]), state: fields[0],
    live: fields[19] === identity.started && !['Z', 'X'].includes(fields[0])};
}

async function waitFor(t, predicate) {
  const deadline = Date.now() + OBSERVATION_TIMEOUT_MS;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'real process observation arrived within its bound');
    await managedSleep({teardown: (callback) => t.after(callback)}, POLL_MS);
  }
}

function fixture(t, {launcher = 'wait', output = 'ignore', term = 'ignore', exitCode = 7} = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tooling-process-test-')));
  const treeFile = path.join(root, 'tree.json');
  const descendant = path.join(root, 'descendant.cjs');
  const entry = path.join(root, 'launcher.cjs');
  fs.mkdirSync(path.join(root, '.codex/quest-tooling'), {recursive: true});
  fs.writeFileSync(descendant, `
    const fs = require('node:fs');
    ${IDENTITY_SOURCE}
    process.on('SIGTERM', () => {
      fs.writeFileSync(${JSON.stringify(path.join(root, 'term'))}, 'received');
      if (${JSON.stringify(term)} === 'exit') process.exit(0);
    });
    setInterval(() => {}, 1000);
    setTimeout(() => process.exit(90), 30000);
    process.send(identity());
  `);
  fs.writeFileSync(entry, `
    const fs = require('node:fs');
    const {spawn} = require('node:child_process');
    ${IDENTITY_SOURCE}
    const child = spawn(process.execPath, [${JSON.stringify(descendant)}],
      {stdio: ['ignore', ${JSON.stringify(output)}, ${JSON.stringify(output)}, 'ipc']});
    child.once('message', (descendantIdentity) => {
      fs.writeFileSync(${JSON.stringify(treeFile)}, JSON.stringify({
        launcher: identity(), descendant: descendantIdentity,
      }));
      child.disconnect();
      child.unref();
      if (${JSON.stringify(launcher)} === 'exit') process.exitCode = ${exitCode};
      else if (${JSON.stringify(launcher)} === 'overflow') {
        fs.writeSync(1, Buffer.alloc(65536, 'x'));
        setInterval(() => {}, 1000);
      } else setInterval(() => {}, 1000);
    });
  `);
  t.after(async () => {
    if (fs.existsSync(treeFile)) {
      const identities = Object.values(JSON.parse(fs.readFileSync(treeFile, 'utf8')));
      for (const identity of identities) {
        if (observedProcess(identity).live) {
          try {
            process.kill(identity.pid, 'SIGKILL');
          } catch (error) {
            if (error.code !== 'ESRCH') throw error;
          }
        }
      }
      await waitFor(t, () => identities.every((identity) => !observedProcess(identity).live));
    }
    fs.rmSync(root, {recursive: true});
  });
  return {root, entry, treeFile, lock: path.join(root, '.codex/quest-tooling/test.lock')};
}

function assertStopped(t, fixture, result) {
  const tree = JSON.parse(fs.readFileSync(fixture.treeFile, 'utf8'));
  const observed = Object.fromEntries(Object.entries(tree)
    .map(([name, identity]) => [name, observedProcess(identity)]));
  t.diagnostic(JSON.stringify({result: {exitCode: result.exitCode, signal: result.signal,
    error: result.error}, tree, observed}));
  assert.equal(observed.launcher.live, false, 'launcher stopped before completion');
  assert.equal(observed.descendant.live, false, 'descendant stopped before completion');
}

test('run preserves synchronous output, descriptor input, cwd, environment and exit status', (t) => {
  const {root} = fixture(t);
  const inputFile = path.join(root, 'input');
  fs.writeFileSync(inputFile, 'actual stdin');
  const input = fs.openSync(inputFile, 'r');
  t.after(() => fs.closeSync(input));
  const result = run(root, process.execPath, ['-e', `
    const fs = require('node:fs');
    fs.writeSync(1, JSON.stringify({cwd: process.cwd(), value: process.env.PROCESS_TEST_VALUE,
      input: fs.readFileSync(0, 'utf8')}));
    fs.writeSync(2, 'actual stderr');
    process.exitCode = 7;
  `], {...COMMAND_OPTIONS, stdio: [input, 'pipe', 'pipe'],
    env: {...process.env, PROCESS_TEST_VALUE: 'isolated'}});
  assert.equal(result.exitCode, 7);
  assert.equal(result.error, null);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, 'actual stderr');
  assert.deepEqual(JSON.parse(result.stdout), {cwd: root, value: 'isolated', input: 'actual stdin'});
  assert.equal(result.cwd, root);
  assert.equal(result.command[0], process.execPath);
  assert.ok(Date.parse(result.endedAt) >= Date.parse(result.startedAt));
});

for (const override of [{cwd: '/tmp'}, {shell: true}, {shell: '/bin/sh'}, {argv0: 'other-command'}]) {
  test(`run keeps explicit invocation identity despite ${JSON.stringify(override)}`, (t) => {
    const {root} = fixture(t);
    const entry = path.join(root, 'identity.cjs');
    fs.writeFileSync(entry, `
      require('node:fs').writeSync(1, JSON.stringify({cwd: process.cwd(),
        argv0: process.argv0, args: process.argv.slice(2)}));
    `);
    const args = [entry, 'two words', '*'];
    const result = run(root, process.execPath, args, {...COMMAND_OPTIONS, ...override});
    t.diagnostic(JSON.stringify({override, result}));
    assert.equal(result.error, null);
    assert.equal(result.exitCode, 0);
    const actual = JSON.parse(result.stdout);
    assert.equal(result.cwd, root, 'explicit owner root is reported');
    assert.deepEqual(result.command, [process.execPath, ...args]);
    assert.deepEqual(actual, {cwd: result.cwd, argv0: result.command[0], args: args.slice(1)},
      'actual cwd and argv agree with the reported direct invocation');
  });
}

test('run keeps its UTF-8 observation shape despite an encoding override', (t) => {
  const {root} = fixture(t);
  const result = run(root, process.execPath,
    ['-e', 'require(\'node:fs\').writeSync(1, \'actual output\')'],
    {...COMMAND_OPTIONS, encoding: 'buffer'});
  t.diagnostic(JSON.stringify({result}));
  assert.equal(result.error, null);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'actual output');
});

for (const output of ['ignore', 'inherit']) {
  test(`run timeout disposes the descendant with ${output} stdio`, (t) => {
    const f = fixture(t, {output});
    const result = run(f.root, process.execPath, [f.entry], COMMAND_OPTIONS);
    assert.match(result.error, /ETIMEDOUT/u);
    assert.equal(result.signal, 'SIGKILL');
    assertStopped(t, f, result);
  });
}

for (const exitCode of [0, 7]) {
  test(`run disposes descendants when the launcher exits first with code ${exitCode}`, (t) => {
    const f = fixture(t, {launcher: 'exit', exitCode});
    const result = run(f.root, process.execPath, [f.entry], COMMAND_OPTIONS);
    assert.equal(result.exitCode, exitCode);
    assert.equal(result.error, null);
    assertStopped(t, f, result);
  });
}

test('run options cannot disable ownership or weaken timeout termination', (t) => {
  const f = fixture(t);
  const result = run(f.root, process.execPath, [f.entry],
    {...COMMAND_OPTIONS, detached: false, killSignal: 'SIGTERM'});
  assert.match(result.error, /ETIMEDOUT/u);
  assert.equal(result.signal, 'SIGKILL');
  assertStopped(t, f, result);
});

test('run rejects a disabled lifetime bound before executing a command', (t) => {
  const f = fixture(t, {launcher: 'exit'});
  assert.throws(() => run(f.root, process.execPath, [f.entry], {...COMMAND_OPTIONS, timeout: 0}),
    /tooling_command_timeout_invalid/u);
  assert.equal(fs.existsSync(f.treeFile), false);
});

test('run output overflow disposes the whole owned group', (t) => {
  const f = fixture(t, {launcher: 'overflow'});
  const result = run(f.root, process.execPath, [f.entry],
    {...COMMAND_OPTIONS, maxBuffer: 1024});
  assert.match(result.error, /ENOBUFS/u);
  assertStopped(t, f, result);
});

test('run missing executable retains the actual spawn failure', (t) => {
  const {root} = fixture(t);
  const result = run(root, path.join(root, 'absent-command'), [], COMMAND_OPTIONS);
  assert.equal(result.exitCode, null);
  assert.match(result.error, /ENOENT/u);
});

for (const term of ['exit', 'ignore']) {
  test(`service cleans up an early-exiting launcher with a ${term} SIGTERM descendant`, async (t) => {
    const f = fixture(t, {launcher: 'exit', term});
    const before = ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal));
    const pending = service(f.root, 'test', process.execPath, [f.entry], process.env);
    assert.ok(fs.existsSync(f.lock), 'ownership is acquired before launch');
    assert.throws(() => service(f.root, 'test', process.execPath, [f.entry], process.env), /EEXIST/u);
    const result = await pending;
    assert.deepEqual(result, {exitCode: 7, signal: null});
    assertStopped(t, f, result);
    assert.ok(fs.existsSync(path.join(f.root, 'term')), 'descendant received real SIGTERM');
    assert.equal(fs.existsSync(f.lock), false, 'ownership released after group disposal');
    assert.deepEqual(['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)), before);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`service forwards actual ${signal} cancellation and drains its descendants`, async (t) => {
    const f = fixture(t);
    const resultFile = path.join(f.root, 'result.json');
    const wrapper = spawn(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs';
      import {service} from ${JSON.stringify(PROCESS_MODULE)};
      const before = ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal));
      const result = await service(${JSON.stringify(f.root)}, 'test', process.execPath,
        [${JSON.stringify(f.entry)}], process.env);
      const after = ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal));
      fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({result, before, after}));
    `], {stdio: 'ignore'});
    const exited = once(wrapper, 'exit');
    t.after(async () => {
      if (wrapper.exitCode === null && wrapper.signalCode === null) wrapper.kill('SIGKILL');
      await exited;
    });
    await waitFor(t, () => fs.existsSync(f.treeFile));
    assert.ok(fs.existsSync(f.lock));
    wrapper.kill(signal);
    await waitFor(t, () => fs.existsSync(path.join(f.root, 'term')));
    assert.ok(fs.existsSync(f.lock), 'lock remains while the descendant ignores SIGTERM');
    await waitFor(t, () => fs.existsSync(resultFile));
    const {result, before, after} = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    assert.deepEqual(result, {exitCode: null, signal: 'SIGTERM'});
    assertStopped(t, f, result);
    assert.deepEqual(after, before, 'signal listeners restored');
    assert.equal(fs.existsSync(f.lock), false);
    assert.deepEqual(await exited, [0, null], 'service owner exits without a surviving timer');
  });
}

test('service spawn failure releases its lock and listeners for a real subsequent launch', async (t) => {
  const f = fixture(t);
  const before = ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal));
  await assert.rejects(service(f.root, 'test', path.join(f.root, 'absent-command'), [], process.env),
    {code: 'ENOENT'});
  assert.equal(fs.existsSync(f.lock), false);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)), before);
  assert.deepEqual(await service(f.root, 'test', process.execPath, ['-e', ''], process.env),
    {exitCode: 0, signal: null});
  assert.equal(fs.existsSync(f.lock), false);
});
