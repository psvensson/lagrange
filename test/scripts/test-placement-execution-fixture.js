// Finite execution fixtures for placement: owned scratch repositories, real
// Git/process/lock observations, and isolated runner/remote-session lifetimes.
// Scenario assertions and registrations remain in test-placement.test.js.

import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {spawnGit} from '../../scripts/checks/git-invocation.js';
import {startRemoteShard} from '../../scripts/lab/probe.js';
import {managedSleep, managedTimeout} from '../../src/test-helpers/managed-timers.js';
import {
  IMPORT_GRAPH_PRODUCER, PRODUCER_STUB, gateTestSource, sealPlacedCommit,
} from './test-placement-fixtures.js';

const MINUTE = 60000;
// A pure unit file of about 50 ms: the witnesses below wait on events, not on
// wall-clock budgets, because the hosted runner is several times slower
// (2026-09-18: a repository-scanning file took over a minute there).
const FAST_TEST = 'test/query/distributed-merge-engine.test.js';
// Fixture test files only a runner fixture has: one that runs until it is
// stopped (bounded at a minute) and one that passes at once.
const RUNNER_SLOW_FIXTURE = 'test/scripts/placement-runner-slow.test.js';
const RUNNER_FAST_FIXTURE = 'test/scripts/placement-runner-fast.test.js';
const RUNNER_FIXTURE_HEAD = 'import assert from \'node:assert/strict\';\n' +
  'import {test} from \'node:test\';\n';

// A throwaway checkout of this commit whose own root the real runner runs in
// and records its results under - never this worktree, never a corpus file.
function runnerFixture(t) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-runner-'));
  t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
  const root = path.join(scratch, 'checkout');
  git(scratch, 'clone', '-q', '--shared', process.cwd(), root);
  fs.symlinkSync(path.join(process.cwd(), 'node_modules'), path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, RUNNER_SLOW_FIXTURE), `${RUNNER_FIXTURE_HEAD}` +
    'process.stdout.write(\'# started\\n\');\n' +
    'test(\'runs until stopped\', async () => {\n' +
    '  await new Promise((resolve) => setTimeout(resolve, 60000));\n  assert.ok(true);\n});\n');
  fs.writeFileSync(path.join(root, RUNNER_FAST_FIXTURE),
    `${RUNNER_FIXTURE_HEAD}test('passes', () => assert.ok(true));\n`);
  return {root, tap: (file) => path.join(root, '.tap', 'test-results', `${file}.tap`)};
}

// The runner's pid once the lab shard's log names it.
async function runnerPidFrom(logFile) {
  for (let poll = 0; poll < 1200; poll += 1) {
    const pid = /^placement-pid=(\d+)$/mu.exec(fs.readFileSync(logFile, 'utf8'))?.[1];
    if (pid) return Number(pid);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return assert.fail('the runner never started');
}

const GATE_TEST = 'test/scripts/lab-stream-gate.test.js';

// push-gate-change-proof's precondition, as a file a fixture commit carries:
// the sealed import graph loads in the checkout the file runs in.
const SEALED_GRAPH_TEST = 'test/scripts/lab-sealed-graph.test.js';
const SEALED_GRAPH_TEST_SOURCE = [
  'import assert from \'node:assert/strict\';',
  'import {test} from \'node:test\';',
  'import {loadSealedImporters} from \'../../scripts/checks/helper-import-closure.js\';',
  'test(\'the sealed import graph loads here\', () => {',
  '  const sealed = loadSealedImporters(process.cwd());',
  '  assert.ok(sealed.ok, `the sealed import graph: ${sealed.problem}`);',
  '});',
  '',
].join('\n');
// What the change taxonomy enumerates in a lab machine's checkout: none of
// the placement's workspace links (a linked tools/alloy-* directory was).
const LINK_UNIVERSE_TEST = 'test/scripts/lab-link-universe.test.js';
const LINK_UNIVERSE_TEST_SOURCE = [
  'import assert from \'node:assert/strict\';',
  'import fs from \'node:fs\';',
  'import {test} from \'node:test\';',
  'import {candidatePaths} from \'../../scripts/checks/change-selection.js\';',
  'test(\'no workspace link is a candidate\', () => {',
  '  assert.deepEqual(candidatePaths(process.cwd()).untracked',
  '    .filter((file) => fs.lstatSync(file).isSymbolicLink()), []);',
  '});',
  '',
].join('\n');
const RESULTS_FILE = 'test-output/reports/test-results.ndjson';
const RESULTS_TEXT = '{"file":"a","ok":true}\n{"file":"b","ok":false}\n';

function git(cwd, ...args) {
  const result = spawnGit(['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    {cwd, encoding: 'utf8', env: gitProcessEnvironment()});
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

// Processes whose working directory lies under dir (Linux; elsewhere none).
function processesUnder(dir) {
  if (!fs.existsSync('/proc/self/cwd')) return [];
  return fs.readdirSync('/proc').filter((entry) => /^\d+$/u.test(entry)).filter((pid) => {
    try {
      return fs.readlinkSync(`/proc/${pid}/cwd`).startsWith(dir);
    } catch {
      return false;
    }
  });
}

function exitOf(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', resolve);
  });
}

function leftovers(repo) {
  const parent = path.join(repo, 'test-output', 'placement-worktrees');
  return {
    worktrees: git(repo, 'worktree', 'list', '--porcelain').split('\n')
      .filter((line) => line.startsWith('worktree ')).length,
    refs: git(repo, 'for-each-ref', 'refs/lagrange-placement'),
    files: fs.existsSync(parent) ? fs.readdirSync(parent) : [],
  };
}

// What a fixture shard tells other agents it is doing, unless a witness says.
const FIXTURE_HOLDER = Object.freeze({purpose: 'test:ordinary', expectedMs: MINUTE});

// The machine-wide lock in a scratch directory the shard's shell is pointed
// at, and a `flock` first on its PATH that records how it was called.
function labLockFixture(scratch, env) {
  const dir = path.join(scratch, 'lab-lock');
  const calls = path.join(scratch, 'flock-calls');
  const real = spawnSync('sh', ['-c', 'command -v flock'], {encoding: 'utf8'}).stdout.trim();
  const stubs = path.join(scratch, 'stub-bin');
  fs.mkdirSync(stubs);
  fs.writeFileSync(path.join(stubs, 'flock'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\nexec '${real}' "$@"\n`, {mode: 0o755});
  env.PATH = `${stubs}${path.delimiter}${env.PATH}`;
  env.LAB_LOCK_DIR = dir;
  env.LAGRANGE_LAB_AGENT = 'claude:placement-witness';
  return {dir, lock: path.join(dir, 'machine.lock'),
    holder: path.join(dir, 'machine.holder.json'),
    calls: () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : [])};
}

// A lab machine's checkout at this commit, and a controller one commit on,
// in scratch repositories; `start` places files there in local-sh mode.
function labFixture(t, {realProducer = false} = {}) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-remote-'));
  t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
  const node = path.join(scratch, 'node');
  const controller = path.join(scratch, 'controller');
  git(scratch, 'clone', '-q', '--shared', process.cwd(), node);
  git(scratch, 'clone', '-q', '--shared', process.cwd(), controller);
  fs.symlinkSync(path.join(process.cwd(), 'node_modules'), path.join(node, 'node_modules'));
  // An ignored workspace entry the worktree should get, and a tracked one
  // the placed commit deletes, which it must not get back from the lab's
  // older checkout.
  fs.mkdirSync(path.join(node, 'data', 'examples'), {recursive: true});
  fs.writeFileSync(path.join(node, 'data', 'examples', 'witness.txt'), 'x');
  // A fetched model checker: tools/ is untracked, its entries ignored one by one.
  fs.mkdirSync(path.join(node, 'tools'), {recursive: true});
  fs.writeFileSync(path.join(node, 'tools', 'tla2tools.jar'), 'x');
  fs.mkdirSync(path.join(node, 'tools', 'alloy-6.2.0'));
  // What an earlier, interrupted run left behind.
  const parent = path.join(node, 'test-output', 'placement-worktrees');
  fs.mkdirSync(path.join(parent, 'old-run'), {recursive: true});
  fs.writeFileSync(path.join(parent, 'old-run.bundle'), 'x');
  fs.writeFileSync(path.join(parent, 'old-run.files'), 'x');
  const basis = git(node, 'rev-parse', 'HEAD');
  git(node, 'update-ref', 'refs/lagrange-placement/old-run', basis);
  fs.appendFileSync(path.join(controller, 'README.md'), '\nplacement witness\n');
  git(controller, 'rm', '-q', '-r', 'data/storage-load');
  // A file that finishes only when the witness releases it, so a line can be
  // shown to arrive while its shard still runs; and a results ledger at the
  // path a runner leaves one, which a hand run copies back.
  const gate = path.join(scratch, 'release-gate');
  fs.writeFileSync(path.join(controller, GATE_TEST), gateTestSource(gate));
  fs.mkdirSync(path.join(controller, 'test-output', 'reports'), {recursive: true});
  fs.writeFileSync(path.join(controller, RESULTS_FILE), RESULTS_TEXT);
  if (!realProducer) fs.writeFileSync(path.join(controller, IMPORT_GRAPH_PRODUCER), PRODUCER_STUB);
  fs.writeFileSync(path.join(controller, SEALED_GRAPH_TEST), SEALED_GRAPH_TEST_SOURCE);
  fs.writeFileSync(path.join(controller, LINK_UNIVERSE_TEST), LINK_UNIVERSE_TEST_SOURCE);
  git(controller, 'add', '-f', GATE_TEST, RESULTS_FILE, SEALED_GRAPH_TEST, LINK_UNIVERSE_TEST);
  if (realProducer) sealPlacedCommit(controller);
  git(controller, 'commit', '-qam', 'placement witness');
  const sha = git(controller, 'rev-parse', 'HEAD');
  const machine = {name: 'lab', sshTarget: null, repoPath: node, repoHead: basis,
    nodeMajor: '', factor: 1.5};
  // Run from inside node:test, the shell here would hand its runner
  // NODE_TEST_CONTEXT and switch tap to the serialized stream, and inside a
  // push hook a GIT_DIR naming the pusher's repository; a lab machine's ssh
  // session carries neither.
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  // The lab's machine-wide lock lives in the fixture, never in this
  // machine's own $HOME/.lab, and every flock call is recorded on its way to
  // the real one.
  const labLock = labLockFixture(scratch, env);
  const start = (files, options = {}) => startRemoteShard({machine, files},
    {sha, deadlineMs: 10 * MINUTE, root: controller, env, holder: FIXTURE_HOLDER, ...options});
  return {node, controller, parent, machine, sha, basis, env, start, labLock,
    releaseGate: () => fs.writeFileSync(gate, 'go')};
}

// Holds a lock file from a process group of its own until released.
async function holdLock(t, lock) {
  const holder = spawn('flock', [lock, 'sleep', '60'], {stdio: 'ignore', detached: true});
  const release = async () => {
    try {
      process.kill(-holder.pid, 'SIGKILL');
    } catch {
      // already gone
    }
    await exitOf(holder);
  };
  t.after(release);
  for (let poll = 0; poll < 600 && spawnSync('flock', ['-n', lock, 'true']).status === 0;
    poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return {pid: holder.pid, release};
}

function lockIsFree(lock) {
  return spawnSync('flock', ['-n', lock, 'true']).status === 0;
}

const CUSTODY_TAP = '.tap/test-results/test/placement-custody.test.js.tap';
const CUSTODY_STDERR = '.tap/test-results/test/placement-custody.test.js.stderr';
const CUSTODY_TAP_BYTES = 'original finite child stdout before cleanup\n';
const CUSTODY_STDERR_BYTES = 'original finite child stderr before cleanup\n';

// The real placement shell, bundle, worktree and Git removal own these
// witnesses. Only the classified runner is a finite child: it writes its
// original artifacts, optionally locks its actual checkout, and exits with
// the requested status. It does not claim to have run a behavioral corpus.
function custodyShardFixture(t, {status, lock}) {
  const fixture = labFixture(t);
  const runner = [
    'import fs from \'node:fs\';',
    'import path from \'node:path\';',
    'import {execGit} from \'./checks/git-invocation.js\';',
    'import {gitProcessEnvironment} from \'./checks/git-process-environment.js\';',
    'const checkout = fs.realpathSync(process.cwd());',
    'const options = {cwd: checkout, env: gitProcessEnvironment(), encoding: \'utf8\'};',
    'const input = fs.readFileSync(0, \'utf8\');',
    `fs.mkdirSync(path.dirname(${JSON.stringify(CUSTODY_TAP)}), {recursive: true});`,
    `fs.writeFileSync(${JSON.stringify(CUSTODY_TAP)}, ${JSON.stringify(CUSTODY_TAP_BYTES)});`,
    `fs.writeFileSync(${JSON.stringify(CUSTODY_STDERR)}, ${JSON.stringify(CUSTODY_STDERR_BYTES)});`,
    'process.stdout.write(`custody-child-head=${execGit([\'rev-parse\', \'HEAD\'], options).trim()}\\n`);',
    'process.stdout.write(`custody-child-input=${JSON.stringify(input)}\\n`);',
    ...(lock ? [
      'execGit([\'worktree\', \'lock\', \'--reason\', \'finite cleanup witness\', checkout], options);',
      'process.stdout.write(`custody-child-locked=${checkout}\\n`);',
    ] : []),
    `process.stdout.write('custody-child-exit=${status}\\n');`,
    `process.exitCode = ${status};`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(fixture.controller, 'scripts/run-classified-test-files.js'), runner);
  git(fixture.controller, '-c', 'commit.gpgsign=false', 'commit', '-qam',
    'finite placement cleanup witness');
  const sha = git(fixture.controller, 'rev-parse', 'HEAD');
  return {...fixture, sha, start: (runId) => fixture.start([FAST_TEST],
    {sha, runId, deadlineMs: MINUTE})};
}

const REMOTE_CLOSE_MS = 5000;
const REMOTE_MARKER_MS = 10000;
const REMOTE_POLL_MS = 25;
const REMOTE_NATURAL_MS = 20000;
const REMOTE_DESCENDANT_MS = 25000;
const NATIVE_IDENTITY_FIELDS = 'pid=,ppid=,pgid=,sid=,stat=';
const NATIVE_IDENTITY_SOURCE = [
  'function identity(pid) {',
  `  const result = spawnSync('ps', ['-o', ${JSON.stringify(NATIVE_IDENTITY_FIELDS)},`,
  '    \'-p\', String(pid)], {encoding: \'utf8\'});',
  '  if (result.status !== 0) throw new Error(`identity unavailable: ${result.stderr}`);',
  '  const [actual, parent, group, session, state] = result.stdout.trim().split(/\\s+/u);',
  '  return {pid: Number(actual), parent: Number(parent), group: Number(group),',
  '    session: Number(session), state};',
  '}',
].join('\n');

function nativeIdentity(pid) {
  assert.ok(Number.isInteger(pid) && pid > 1, `an acquired positive PID is required: ${pid}`);
  const observed = spawnSync('ps', ['-o', NATIVE_IDENTITY_FIELDS, '-p', String(pid)],
    {encoding: 'utf8'});
  if (observed.status === 1 && observed.stdout.trim() === '') return null;
  assert.equal(observed.status, 0, observed.stderr);
  const [actual, parent, group, session, state] = observed.stdout.trim().split(/\s+/u);
  assert.equal(Number(actual), pid);
  return {pid, parent: Number(parent), group: Number(group), session: Number(session), state};
}

function liveGroupMembers(owned) {
  assert.ok(Number.isInteger(owned.group) && owned.group > 1);
  assert.ok(Number.isInteger(owned.session) && owned.session > 1);
  const observed = spawnSync('ps', ['-eo', NATIVE_IDENTITY_FIELDS], {encoding: 'utf8'});
  assert.equal(observed.status, 0, observed.stderr);
  return observed.stdout.trim().split('\n').map((line) => {
    const [pid, parent, group, session, state] = line.trim().split(/\s+/u);
    return {pid: Number(pid), parent: Number(parent), group: Number(group),
      session: Number(session), state};
  }).filter((entry) => entry.group === owned.group && entry.session === owned.session &&
    !entry.state.startsWith('Z'));
}

function ownedPhaseMarker(run, file) {
  const identity = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const field of ['pid', 'parent', 'group', 'session']) {
    assert.ok(Number.isInteger(identity[field]) && identity[field] > 1,
      `${field} is an actual acquired process identity`);
  }
  assert.equal(identity.checkout, run.checkout,
    'the marker belongs to this exact fixture checkout');
  return identity;
}

async function waitForRemoteMarker(run, file) {
  const deadline = Date.now() + REMOTE_MARKER_MS;
  while (!fs.existsSync(file) && !run.terminal && Date.now() < deadline) {
    await managedSleep(run.timers, REMOTE_POLL_MS);
  }
  assert.ok(fs.existsSync(file),
    `finite remote phase did not acquire ${file}: ${JSON.stringify(run.terminal)}`);
}

async function joinRemoteFixture(run) {
  const expired = Symbol('remote fixture did not close');
  let timer;
  const deadline = new Promise((resolve) => {
    timer = managedTimeout(run.timers, () => resolve(expired), REMOTE_CLOSE_MS);
  });
  try {
    const outcome = await Promise.race([run.closed, deadline]);
    assert.notEqual(outcome, expired, 'the finite remote wrapper must settle');
    if (outcome.error) throw outcome.error;
    return outcome.value;
  } finally {
    clearTimeout(timer);
  }
}

async function cleanupRemoteFixture(run) {
  const errors = [];
  const attempt = async (close) => {
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  };
  await attempt(() => run.started?.abort());
  const groups = new Map();
  for (const file of [run.ready, run.descendantReady].filter(Boolean)) {
    if (!fs.existsSync(file)) continue;
    await attempt(() => {
      const owned = ownedPhaseMarker(run, file);
      groups.set(`${owned.group}:${owned.session}`, owned);
    });
  }
  if (run.transport && fs.existsSync(run.transport)) {
    await attempt(() => {
      const transport = JSON.parse(fs.readFileSync(run.transport, 'utf8'));
      assert.equal(transport.marker, run.transport, 'the adapter marker belongs to this fixture');
      const owned = nativeIdentity(transport.remotePid);
      if (!owned) return;
      assert.equal(owned.group, transport.remotePid, 'setsid acquired the transport group');
      assert.equal(owned.session, transport.remotePid, 'setsid acquired the transport session');
      groups.set(`${owned.group}:${owned.session}`, owned);
    });
  }
  for (const owned of groups.values()) {
    await attempt(() => {
      if (liveGroupMembers(owned).length === 0) return;
      try {
        process.kill(-owned.group, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    });
  }
  for (const owned of groups.values()) {
    await attempt(async () => {
      const deadline = Date.now() + REMOTE_CLOSE_MS;
      while (liveGroupMembers(owned).length > 0 && Date.now() < deadline) {
        await managedSleep(run.timers, REMOTE_POLL_MS);
      }
      assert.deepEqual(liveGroupMembers(owned), [], 'fixture cleanup closed its acquired group');
    });
  }
  if (run.closed) await attempt(() => joinRemoteFixture(run));
  for (const close of [...run.timerCleanups, ...run.fileCleanups]) await attempt(close);
  if (errors.length > 0) throw new AggregateError(errors, 'finite remote fixture cleanup failed');
}

function remotePhaseSource(run, {preparation}) {
  const marker = (file, extra = '') => [
    `fs.writeFileSync(${JSON.stringify(file + '.tmp')}, JSON.stringify({`,
    `  ...identity(process.pid), checkout: fs.realpathSync(process.cwd())${extra}}));`,
    `fs.renameSync(${JSON.stringify(file + '.tmp')}, ${JSON.stringify(file)});`,
  ].join('\n');
  const common = [
    'import fs from \'node:fs\';',
    'import {spawn, spawnSync} from \'node:child_process\';',
    NATIVE_IDENTITY_SOURCE,
  ];
  const descendant = [...common,
    'process.on(\'SIGTERM\', () => ' +
      `fs.writeFileSync(${JSON.stringify(run.descendantAck)}, 'SIGTERM'));`,
    marker(run.descendantReady),
    `setTimeout(() => {fs.writeFileSync(${JSON.stringify(run.descendantNormal)}, ` +
      `'natural descendant completion'); process.exit(0);}, ${REMOTE_DESCENDANT_MS});`,
  ].join('\n');
  return [...common,
    `fs.mkdirSync(${JSON.stringify(path.posix.dirname(CUSTODY_TAP))}, {recursive: true});`,
    `fs.writeFileSync(${JSON.stringify(CUSTODY_TAP)}, ${JSON.stringify(CUSTODY_TAP_BYTES)});`,
    `fs.writeFileSync(${JSON.stringify(CUSTODY_STDERR)}, ${JSON.stringify(CUSTODY_STDERR_BYTES)});`,
    'process.on(\'SIGTERM\', () => {' +
      `fs.writeFileSync(${JSON.stringify(run.ack)}, 'SIGTERM');` +
      `${preparation ? 'process.exit(0);' : ''}});`,
    `setTimeout(() => {fs.writeFileSync(${JSON.stringify(run.normal)}, ` +
      `'natural phase completion'); process.exit(0);}, ${REMOTE_NATURAL_MS});`,
    ...(preparation ? [marker(run.ready)] : [
      'fs.readFileSync(0, \'utf8\');',
      `const descendant = spawn(process.execPath, ['--input-type=module', '-e', ` +
        `${JSON.stringify(descendant)}], {stdio: 'ignore'});`,
      'descendant.on(\'error\', (error) => {process.stderr.write(String(error)); process.exit(1);});',
      marker(run.ready, ', descendant: descendant.pid'),
    ]),
    '',
  ].join('\n');
}

// The only substitute is transport: the existing remoteCommand text reaches
// real `setsid sh`, with unchanged stdin/stdio, in another session. This
// prevents killing the controller wrapper from masquerading as remote phase
// cancellation. Real Git, worktree, lock, shell and process groups remain.
function startRemoteCancellationFixture(t, {preparation}) {
  const run = {timerCleanups: [], fileCleanups: [], terminal: null, started: null};
  run.timers = {teardown: (close) => run.timerCleanups.push(close)};
  t.after(() => cleanupRemoteFixture(run));
  const fixture = labFixture({after: (close) => run.fileCleanups.push(close)});
  run.fixture = fixture;
  const controls = path.join(path.dirname(fixture.node), 'finite-remote-cancellation');
  fs.mkdirSync(controls, {mode: 0o700});
  for (const name of ['ready', 'ack', 'normal', 'descendantReady', 'descendantAck',
    'descendantNormal', 'admitted', 'transport']) run[name] = path.join(controls, name);
  const runId = preparation ? 'cancel-producer' : 'cancel-ignoring-runner';
  run.checkout = path.join(fs.realpathSync(fixture.node), 'test-output/placement-worktrees', runId);
  const phase = preparation ? IMPORT_GRAPH_PRODUCER : 'scripts/run-classified-test-files.js';
  fs.writeFileSync(path.join(fixture.controller, phase), remotePhaseSource(run, {preparation}));
  if (preparation) {
    fs.writeFileSync(path.join(fixture.controller, 'scripts/run-classified-test-files.js'),
      `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(run.admitted)}, ` +
      `'later runner started');\n`);
  }
  git(fixture.controller, '-c', 'commit.gpgsign=false', 'commit', '-qam',
    'finite isolated remote cancellation witness');
  const sha = git(fixture.controller, 'rev-parse', 'HEAD');
  const adapter = [
    '#!/usr/bin/env node',
    'const fs = require(\'node:fs\');',
    'const {spawn, spawnSync} = require(\'node:child_process\');',
    NATIVE_IDENTITY_SOURCE,
    'if (!process.argv.includes(\'finite-session@fixture\')) process.exit(99);',
    'const command = process.argv.at(-1);',
    'const child = spawn(\'setsid\', [\'sh\', \'-c\', command], {stdio: \'inherit\'});',
    'child.on(\'error\', (error) => {process.stderr.write(String(error)); process.exitCode = 1;});',
    'child.on(\'close\', (code, signal) => {',
    '  if (signal) process.kill(process.pid, signal);',
    '  else process.exitCode = code === null ? 1 : code;',
    '});',
    'if (command.startsWith(\'sh -s -- \')) {',
    `  fs.writeFileSync(${JSON.stringify(run.transport + '.tmp')}, JSON.stringify({`,
    `    marker: ${JSON.stringify(run.transport)}, client: identity(process.pid),`,
    '    remotePid: child.pid}));',
    `  fs.renameSync(${JSON.stringify(run.transport + '.tmp')}, ` +
      `${JSON.stringify(run.transport)});`,
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(path.dirname(fixture.node), 'stub-bin', 'ssh'), adapter, {mode: 0o755});
  // signalLabShell deliberately uses the caller's environment, so the same
  // finite transport must own both start and stop. Restore it only after all
  // acquired groups and the wrapper have been joined.
  const originalPath = process.env.PATH;
  run.fileCleanups.unshift(() => {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  });
  process.env.PATH = fixture.env.PATH;
  fixture.machine.sshTarget = 'finite-session@fixture';
  run.started = fixture.start([FAST_TEST], {sha, runId, deadlineMs: MINUTE});
  run.closed = run.started.done.then((value) => {
    run.terminal = {value};
    return run.terminal;
  }, (error) => {
    run.terminal = {error};
    return run.terminal;
  });
  run.logFile = path.join(fixture.controller, 'test-output', 'placement', `${runId}-lab.log`);
  return run;
}

export {
  CUSTODY_STDERR, CUSTODY_STDERR_BYTES, CUSTODY_TAP, CUSTODY_TAP_BYTES,
  FAST_TEST, FIXTURE_HOLDER, GATE_TEST, LINK_UNIVERSE_TEST, MINUTE,
  REMOTE_CLOSE_MS, RESULTS_FILE, RESULTS_TEXT, RUNNER_FAST_FIXTURE,
  RUNNER_SLOW_FIXTURE, SEALED_GRAPH_TEST, custodyShardFixture, exitOf, git,
  holdLock, joinRemoteFixture, labFixture, leftovers, liveGroupMembers,
  lockIsFree, nativeIdentity, ownedPhaseMarker, processesUnder, runnerFixture,
  runnerPidFrom, startRemoteCancellationFixture, waitForRemoteMarker,
};
