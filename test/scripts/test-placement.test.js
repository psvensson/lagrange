// Placement runs one classified plan across the lab machines discovery finds
// ready, chosen at test time from measured facts (owner direction,
// 2026-09-18: an ordinary push proves itself locally and in parallel, and no
// host belongs in any setup). A lab machine can only make a green faster:
// what is red there is decided on the controller.

import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {
  PLACEMENT_EXIT, placeTestFiles, placementDeps, placementMachines,
  recordPlacementMisses, runPlacedTestFiles, startRemoteShard,
} from '../../scripts/lab/probe.js';

const MINUTE = 60000;
const CONTROLLER = Object.freeze({name: '(controller)', controller: true, speed: 1});
const FAST_TEST = 'test/scripts/closed-quest-shape.test.js';
const SLOW_TEST = 'test/scripts/check-operation-dispatch-completion-owner.test.js';

function lab(name, speed, extra = {}) {
  return {name, controller: false, speed, avoid: [], gapsKey: 'k', ...extra};
}

function machineOf(shards, file) {
  return shards.find((shard) => shard.files.includes(file))?.machine.name;
}

test('placement spreads files by measured duration and machine speed', () => {
  const costs = [
    {file: 'serial-a', ms: 3 * MINUTE, jobs: 1},
    {file: 'serial-b', ms: 3 * MINUTE, jobs: 1},
    {file: 'serial-c', ms: 2 * MINUTE, jobs: 1},
    ...Array.from({length: 40}, (_, index) =>
      ({file: `ordinary-${String(index).padStart(2, '0')}`, ms: 40000, jobs: 4})),
  ];
  const machines = [CONTROLLER, lab('fast', 1.3), lab('slow', 2.2)];
  const shards = placeTestFiles(costs, machines);
  const placed = shards.flatMap((shard) => shard.files);
  assert.equal(placed.length, costs.length, 'every file placed once');
  assert.equal(new Set(placed).size, costs.length, 'and only once');
  const alone = costs.reduce((sum, cost) => sum + cost.ms / cost.jobs, 0);
  const makespan = Math.max(...shards.map((shard) => shard.loadMs));
  assert.ok(makespan < alone * 0.6, `the run shortens (${makespan} of ${alone} ms)`);
  assert.notEqual(machineOf(shards, 'serial-a'), machineOf(shards, 'serial-b'),
    'the two longest serial files run on different machines');
  const slow = shards.find((shard) => shard.machine.name === 'slow');
  assert.ok(slow.loadMs >= 30000, 'a lab machine is charged its setup');
  const referenceWork = (name) => shards.find((shard) => shard.machine.name === name).files
    .reduce((sum, file) => {
      const cost = costs.find((entry) => entry.file === file);
      return sum + cost.ms / cost.jobs;
    }, 0);
  assert.ok(referenceWork('slow') < referenceWork('fast') &&
    referenceWork('fast') < referenceWork('(controller)'),
  'a slower machine is given less of the work');
  assert.deepEqual(placeTestFiles(costs, machines), shards, 'the same facts, the same split');

  // A file a machine is known to fail is never sent there.
  const avoiding = placeTestFiles(costs,
    [CONTROLLER, lab('fast', 1.3, {avoid: ['serial-a', 'serial-b']})]);
  assert.equal(machineOf(avoiding, 'serial-a'), '(controller)');
  assert.equal(machineOf(avoiding, 'serial-b'), '(controller)');

  // A file that would take a lab machine near its per-file timeout stays
  // here. Without the rule the second of two four-minute serial files would
  // go to the lab machine, which finishes it first (30 s + 5.2 min against
  // 8 min here), and run 5.2 minutes against a 10-minute timeout there.
  const long = placeTestFiles([
    {file: 'long-1', ms: 4 * MINUTE, jobs: 1},
    {file: 'long-2', ms: 4 * MINUTE, jobs: 1},
    ...costs.slice(3),
  ], [CONTROLLER, lab('lab', 1.3)]);
  assert.equal(machineOf(long, 'long-1'), '(controller)');
  assert.equal(machineOf(long, 'long-2'), '(controller)',
    'a file past half the per-file timeout there stays on the controller');
  assert.ok(long.some((shard) => shard.machine.name === 'lab'), 'the rest still spreads');

  // A lab machine that would not repay its setup is left out: it would take
  // y and finish first, but with less work than its own setup.
  const small = placeTestFiles([{file: 'x', ms: 40000, jobs: 1}, {file: 'y', ms: 20000, jobs: 1}],
    [CONTROLLER, lab('fast', 1.3)]);
  assert.deepEqual(small.map((shard) => shard.machine.name), ['(controller)']);
  assert.deepEqual(small[0].files, ['x', 'y']);
});

test('only a ready, distinct, reachable machine receives files', () => {
  const ready = {ready: true, missing: [], gaps: ['no-helm']};
  const cap = (extra = {}) => ({repoPath: '/srv/lagrange', cpuSampleMs: 260,
    nodeVersion: 'v22.22.3', repo: {head: 'c'.repeat(40)}, ...extra});
  const fleet = [
    {name: '(controller)', controller: true, capability: {cpuSampleMs: 200}, readiness: ready},
    {name: 'good', capability: cap(), readiness: ready},
    {name: 'faster', capability: cap({cpuSampleMs: 150}), readiness: ready},
    {name: 'not-ready', capability: cap(), readiness: {ready: false, missing: ['x'], gaps: []}},
    {name: 'down', capability: null, error: 'ssh: refused', readiness: ready},
    {name: 'twice', capability: cap(), sameMachineAs: '(controller)', readiness: ready},
    {name: 'no-ssh', capability: cap(), readiness: ready},
    {name: 'no-head', capability: cap({repo: {head: null}}), readiness: ready},
    {name: 'no-sample', capability: cap({cpuSampleMs: null}), readiness: ready},
  ];
  const nodes = Object.fromEntries(fleet.filter((entry) => !entry.controller)
    .map((entry) => [entry.name, {name: entry.name, ssh: `peer@${entry.name}`}]));
  delete nodes['no-ssh'].ssh;
  const state = {nodes};
  const machines = placementMachines(fleet, state);
  assert.deepEqual(machines.map((machine) => machine.name), ['good', 'faster']);
  const [good, faster] = machines;
  assert.equal(good.speed, 1.3);
  assert.equal(good.factor, 1.3, 'budgets scale by the measured speed');
  assert.equal(faster.factor, 1, 'never below the reference');
  assert.equal(placementMachines(fleet, state, {controllerFactor: 3})[0].factor, 3.9,
    'and by the factor the controller itself runs under');
  assert.equal(good.nodeMajor, '22');
  assert.equal(good.sshTarget, 'peer@good');
  assert.equal(good.repoPath, '/srv/lagrange');

  // Misses are remembered against the machine's gaps and node, and forgotten
  // when those change.
  recordPlacementMisses(state, 'good', good.gapsKey, ['b.test.js', 'a.test.js']);
  recordPlacementMisses(state, 'good', good.gapsKey, ['a.test.js']);
  assert.deepEqual(state.nodes.good.placement.avoid, ['a.test.js', 'b.test.js']);
  assert.deepEqual(placementMachines(fleet, state)[0].avoid, ['a.test.js', 'b.test.js']);
  const installed = fleet.map((entry) => entry.name === 'good' ?
    {...entry, readiness: {...ready, gaps: []}} : entry);
  assert.deepEqual(placementMachines(installed, state)[0].avoid, [],
    'a machine whose gaps changed starts clean');
});

function fakeDeps(overrides = {}) {
  const calls = {local: [], discover: 0, commit: 0, remote: [], record: [], lines: [],
    order: [], options: []};
  const deps = {
    env: {},
    write: (line) => calls.lines.push(line),
    planCosts: (files) => files.map((file) => ({file, ms: 2 * MINUTE, jobs: 1})),
    runLocal: (files) => {
      calls.order.push('local');
      calls.local.push([...files]);
      return 0;
    },
    lastGreen: () => true,
    commitAt: () => {
      calls.commit += 1;
      return 'a'.repeat(40);
    },
    discover: async () => {
      calls.discover += 1;
      return {machines: [lab('lab', 1)], record: async (...args) => calls.record.push(args)};
    },
    runRemote: (shard, options) => {
      calls.order.push('remote');
      calls.remote.push(shard.files);
      calls.options.push({shard, options});
      return {done: Promise.resolve({status: 0,
        log: shard.files.map((file) => `ok ${file} (1 assertions, 5ms)`).join('\n')})};
    },
    ...overrides,
  };
  return {deps, calls};
}

const MANY = Array.from({length: 8}, (_, index) => `test/f${index}.test.js`);

test('a small plan, a tree that is not a commit or an empty fleet runs locally', async () => {
  let run = fakeDeps({env: {LAGRANGE_PLACEMENT: 'local'}});
  assert.equal(await runPlacedTestFiles(MANY, run.deps), 0);
  assert.deepEqual(run.calls.local, [MANY]);
  assert.equal(run.calls.discover, 0, 'placement switched off asks nothing');

  run = fakeDeps({planCosts: (files) => files.map((file) => ({file, ms: 1000, jobs: 1}))});
  await runPlacedTestFiles(MANY, run.deps);
  assert.deepEqual(run.calls.local, [MANY]);
  assert.equal(run.calls.commit + run.calls.discover, 0,
    'a plan cheaper than a setup never probes the fleet');
  assert.deepEqual(run.calls.lines, [], 'and says nothing');

  run = fakeDeps({commitAt: () => null});
  await runPlacedTestFiles(MANY, run.deps);
  assert.deepEqual(run.calls.local, [MANY]);
  assert.equal(run.calls.discover, 0, 'a working tree is never sent anywhere');
  assert.match(run.calls.lines[0], /^placement: local - the tree is not exactly a commit/u);

  run = fakeDeps({discover: async () => ({machines: [], record: async () => {}})});
  await runPlacedTestFiles(MANY, run.deps);
  assert.deepEqual(run.calls.local, [MANY]);
  assert.match(run.calls.lines[0], /no lab machine is ready/u);

  run = fakeDeps({discover: async () => {
    throw new Error('Unsupported lab inventory at /x/inventory.json');
  }});
  assert.equal(await runPlacedTestFiles(MANY, run.deps), 0);
  assert.deepEqual(run.calls.local, [MANY], 'an unreadable inventory is no fleet, not a red run');
  assert.match(run.calls.lines[0], /the lab inventory could not be read: Unsupported/u);

  // The real commit check: clean is a commit, modified or untracked is not.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-commit-'));
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t',
      ...args], {cwd: repo, encoding: 'utf8', env: gitProcessEnvironment()});
    git('init', '-q');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
    git('add', 'a.txt');
    git('commit', '-qm', 'a');
    const head = git('rev-parse', 'HEAD').stdout.trim();
    const commitAt = placementDeps({root: repo}).commitAt;
    assert.equal(commitAt(), head);
    // Inside pre-push, git exports GIT_DIR for the hook's repository; the
    // check still asks the checkout it was given.
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(process.cwd(), '.git-not-this-one');
    try {
      assert.equal(commitAt(), head, 'an inherited repository pointer is ignored');
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
    fs.writeFileSync(path.join(repo, 'a.txt'), 'b\n');
    assert.equal(commitAt(), null, 'a modified file');
    git('checkout', '-q', 'a.txt');
    fs.writeFileSync(path.join(repo, 'new.txt'), 'n\n');
    assert.equal(commitAt(), null, 'an untracked file');
  } finally {
    fs.rmSync(repo, {recursive: true, force: true});
  }
});

test('a file red on a lab machine is decided on the controller and routed away after', async () => {
  const redLog = (files) => files.map((file, index) => index === 0 ?
    `not ok ${file} (1 assertions, 5ms)\n# failed\nnot ok 1 - a subtest` :
    `ok ${file} (1 assertions, 5ms)`).join('\n');
  let remoteFiles = [];
  let run = fakeDeps({
    runRemote: async (shard) => {
      remoteFiles = shard.files;
      return {done: Promise.resolve({status: 1, log: redLog(shard.files)})};
    },
  });
  assert.equal(await runPlacedTestFiles(MANY, run.deps), 0,
    'red there, green here: green');
  const [controllerShard, rerun] = run.calls.local;
  assert.ok(controllerShard.length > 0 && remoteFiles.length > 0, 'both machines ran files');
  assert.deepEqual(rerun, [remoteFiles[0]], 'only the red file is run again, here');
  assert.deepEqual(run.calls.record, [['lab', 'k', [remoteFiles[0]]]],
    'and it is routed away from that machine next time');
  assert.ok(run.calls.lines.some((line) => line.startsWith(`[lab] not ok ${remoteFiles[0]}`)),
    'the lab machine\'s own lines are shown');
  assert.ok(run.calls.lines.some((line) => /1 passed on the controller: routed away from lab/u
    .test(line)), 'the miss is reported, never hidden');

  // Red on the controller too: red, and nothing is remembered.
  run = fakeDeps({
    runRemote: async (shard) => ({done: Promise.resolve({status: 1, log: redLog(shard.files)})}),
    runLocal: (files) => (files.length === 1 ? 1 : 0),
    lastGreen: () => false,
  });
  assert.equal(await runPlacedTestFiles(MANY, run.deps), 1);
  assert.deepEqual(run.calls.record, []);

  // The lab machine is handed the controller's own retry and timeout policy,
  // gets its deadline from its estimate, and is started before the
  // controller's lanes block.
  run = fakeDeps({env: {LAGRANGE_RETRY_FAILED_ONCE: '1', TAP_TIMEOUT: '900'}});
  await runPlacedTestFiles(MANY, run.deps);
  assert.deepEqual(run.calls.options[0].options.forward, {retry: '1', tapTimeout: '900'});
  assert.equal(run.calls.options[0].options.deadlineMs, 30 * MINUTE,
    'never under half an hour');
  assert.deepEqual(run.calls.order, ['remote', 'local'], 'lab shards first, then this one');
  run = fakeDeps({planCosts: (files) => files.map((file) => ({file, ms: 4 * MINUTE, jobs: 1}))});
  await runPlacedTestFiles(MANY, run.deps);
  const {shard, options} = run.calls.options[0];
  assert.ok(shard.loadMs * 3 > 30 * MINUTE);
  assert.equal(options.deadlineMs, 3 * shard.loadMs, 'three times its estimate');

  // Past the cap it is breakage: red, and nothing runs twice.
  const many = Array.from({length: 60}, (_, index) => `test/g${index}.test.js`);
  run = fakeDeps({
    runRemote: async (shard) => ({done: Promise.resolve({status: 1,
      log: shard.files.map((file) => `not ok ${file} (1 assertions, 5ms)`).join('\n')})}),
  });
  assert.equal(await runPlacedTestFiles(many, run.deps), 1);
  assert.equal(run.calls.local.length, 1, 'only the controller\'s own shard ran here');
});

test('a shard its machine could not run is run on the controller', async () => {
  const ok = (file) => `ok ${file} (1 assertions, 5ms)`;
  const notOk = (file) => `not ok ${file} (1 assertions, 5ms)`;
  for (const [why, outcome] of [
    ['setup failed', () => ({status: PLACEMENT_EXIT.SETUP, log: '',
      reason: 'shares no history with this commit'})],
    ['busy', () => ({status: PLACEMENT_EXIT.BUSY, log: ''})],
    ['connection failed', () => ({status: PLACEMENT_EXIT.SSH, log: '',
      errors: 'ssh: connect to host timed out'})],
    ['deadline', () => ({status: null, log: 'ok x (1 assertions, 5ms)', reason: 'deadline'})],
    ['runner crashed at start', () => ({status: 1, log: '', errors: 'node: out of memory'})],
    // Whatever the exit status, only a file's own verdict line proves it
    // there: a runner killed after one red, a script cut off in its file list
    // or a lost connection leave the rest unproved (verifier round 1).
    ['runner killed after a red', (files) => ({status: 137, log: notOk(files[0])})],
    ['exit 1 after a red', (files) => ({status: 1, log: notOk(files[0])})],
    ['exit 0 with nothing reported', () => ({status: 0, log: 'placement-head=abc'})],
    ['exit 0 with half reported', (files) => ({status: 0,
      log: files.slice(0, 1).map(ok).join('\n')})],
    ['a verdict only on stderr', (files) => ({status: 0, log: '',
      errors: files.map(ok).join('\n')})],
  ]) {
    let remoteFiles = [];
    let given = null;
    const run = fakeDeps({
      runRemote: (shard) => {
        remoteFiles = shard.files;
        given = outcome(shard.files);
        return {done: Promise.resolve(given)};
      },
    });
    assert.equal(await runPlacedTestFiles(MANY, run.deps), 0, why);
    const proved = new Set(String(given.log).split('\n').filter((line) => line.startsWith('ok '))
      .map((line) => line.split(' ')[1]));
    const [, ...afterwards] = run.calls.local;
    assert.deepEqual(afterwards.flat().sort(),
      remoteFiles.filter((file) => !proved.has(file)).sort(),
      `${why}: every file not proved there runs here, and only those`);
    assert.ok(run.calls.lines.some((line) =>
      /^placement: lab: \d+ file\(s\) with no result from there run on the controller/u
        .test(line)), `${why}: and says so`);
  }

  // A retried-once pass there is the controller's own policy: proved.
  const retried = fakeDeps({
    runRemote: (shard) => ({done: Promise.resolve({status: 0, log: [
      notOk(shard.files[0]), `# retried-once pass ${shard.files[0]}`,
      ...shard.files.slice(1).map(ok)].join('\n')})}),
  });
  await runPlacedTestFiles(MANY, retried.deps);
  assert.equal(retried.calls.local.length, 1, 'nothing runs twice');
});

// Git addresses these scratch repositories only, never one a push hook
// exported GIT_DIR for.
test('an interrupted placed run stops every machine at once', async (t) => {
  // In process: the handler runs while the controller's files are running,
  // aborting each lab shard and the local child before it exits.
  const signals = new EventEmitter();
  const aborted = [];
  let exited = null;
  let releaseLocal;
  const run = fakeDeps({
    signals,
    exit: (code) => {
      exited = code;
    },
    runLocalChild: () => ({
      done: new Promise((resolve) => {
        releaseLocal = resolve;
      }),
      abort: () => aborted.push('controller'),
    }),
    runRemote: () => ({done: new Promise(() => {}), abort: () => aborted.push('lab')}),
  });
  runPlacedTestFiles(MANY, run.deps);
  for (let tick = 0; tick < 20 && !releaseLocal; tick += 1) await new Promise(setImmediate);
  assert.ok(releaseLocal, 'the controller\'s files are running');
  signals.emit('SIGTERM');
  assert.deepEqual(aborted.sort(), ['controller', 'lab']);
  assert.equal(exited, 130);

  // For real: a SIGTERM to a placed run whose controller files are running
  // ends it at once, and nothing either side started survives.
  const probe = path.join(process.cwd(), 'scripts', 'lab', 'probe.js');
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import {spawn} from 'node:child_process';
    import {placementDeps, runPlacedTestFiles} from ${JSON.stringify(probe)};
    const group = () => {
      const sleeper = spawn('sleep', ['60'], {detached: true, stdio: 'ignore'});
      console.log('group=' + sleeper.pid);
      return sleeper;
    };
    const real = placementDeps({root: process.cwd()});
    await runPlacedTestFiles(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], {
      env: {}, write: () => {},
      planCosts: (files) => files.map((file) => ({file, ms: 120000, jobs: 1})),
      commitAt: () => 'a'.repeat(40), lastGreen: () => true, runLocal: () => 1,
      discover: async () => ({machines: [{name: 'lab', controller: false, speed: 1,
        avoid: []}], record: async () => {}}),
      runRemote: () => {
        const lab = group();
        return {done: new Promise(() => {}), abort: () => process.kill(-lab.pid, 'SIGKILL')};
      },
      runLocalChild: (files) => {
        const local = real.runLocalChild(['${SLOW_TEST}']);
        console.log('local-group=' + local.group);
        console.log('local-started');
        return local;
      },
    });
  `], {cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], env: gitProcessEnvironment()});
  t.after(() => child.kill('SIGKILL'));
  let out = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  for (let poll = 0; poll < 100 && !out.includes('local-started'); poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  // The runner leads a live group of its own - or the check below that the
  // group is gone would pass without it ever having existed (verifier round 4).
  const localGroup = Number(/^local-group=(\d+)$/mu.exec(out)[1]);
  assert.doesNotThrow(() => process.kill(-localGroup, 0),
    'the controller runner leads its own live group');
  const signalledAt = Date.now();
  child.kill('SIGTERM');
  const code = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(code, 130, out);
  assert.ok(Date.now() - signalledAt < 3000, 'at once, not after the controller\'s files');
  const lab = Number(/^group=(\d+)$/mu.exec(out)[1]);
  assert.throws(() => process.kill(-lab, 0), 'the lab shard is stopped');
  // Exactly the group this run started: the same file may be running in
  // this checkout for another reason (a land runs its lanes in parallel).
  let slowAlive = true;
  for (let poll = 0; poll < 40 && slowAlive; poll += 1) {
    try {
      process.kill(-localGroup, 0);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch {
      slowAlive = false;
    }
  }
  assert.equal(slowAlive, false, 'and the controller\'s own runner group is gone');
});

function git(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
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

// The descriptors a started runner holds, read from /proc once its pid is in
// the log: the machine lock must not be one of them.
async function assertRunnerFreeOfLock(logFile) {
  let runnerPid = null;
  for (let poll = 0; poll < 60 && !runnerPid; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    runnerPid = /^placement-pid=(\d+)$/mu.exec(fs.readFileSync(logFile, 'utf8'))?.[1];
  }
  if (!runnerPid || !fs.existsSync(`/proc/${runnerPid}/fd`)) return;
  const held = fs.readdirSync(`/proc/${runnerPid}/fd`).map((fd) => {
    try {
      return fs.readlinkSync(`/proc/${runnerPid}/fd/${fd}`);
    } catch {
      return '';
    }
  });
  assert.ok(!held.some((target) => target.endsWith('lagrange-placement.lock')),
    'the runner does not hold the machine lock');
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

test('a lab machine proves the exact commit in a throwaway worktree and leaves nothing behind',
  async (t) => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-remote-'));
    t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
    // A lab machine's checkout at this commit, and a controller one commit on.
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
    // What an earlier, interrupted run left behind.
    const parent = path.join(node, 'test-output', 'placement-worktrees');
    fs.mkdirSync(path.join(parent, 'old-run'), {recursive: true});
    fs.writeFileSync(path.join(parent, 'old-run.bundle'), 'x');
    fs.writeFileSync(path.join(parent, 'old-run.files'), 'x');
    const basis = git(node, 'rev-parse', 'HEAD');
    git(node, 'update-ref', 'refs/lagrange-placement/old-run', basis);
    fs.appendFileSync(path.join(controller, 'README.md'), '\nplacement witness\n');
    git(controller, 'rm', '-q', '-r', 'data/storage-load');
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
    const start = (files, options = {}) => startRemoteShard({machine, files},
      {sha, deadlineMs: MINUTE, root: controller, env, ...options});

    const started = start([FAST_TEST], {forward: {retry: '1', tapTimeout: '900'}});
    assert.equal(typeof started.then, 'undefined', 'a shard is started, not awaited');
    const green = await started.done;
    assert.equal(green.status, 0, green.log + green.errors);
    assert.match(green.log, new RegExp(`^placement-head=${sha}$`, 'mu'),
      'the worktree is at the commit the controller holds, sent as a bundle');
    assert.match(green.log, new RegExp(`^ok ${FAST_TEST} `, 'mu'));
    assert.match(green.log, /^placement-env=factor:1\.5 mode:local retry:1 timeout:900$/mu,
      'its own budgets scaled, the controller\'s retry and timeout policy, never placed again');
    assert.match(green.log, /^placement-link=node_modules$/mu);
    assert.match(green.log, /^placement-link=data\/examples$/mu, 'an ignored entry is linked');
    assert.doesNotMatch(green.log, /^placement-link=data\/storage-load$/mu,
      'a tracked entry the commit deleted stays deleted');
    assert.deepEqual(leftovers(node), {worktrees: 1, refs: '', files: []},
      'no worktree, ref, bundle or file list is left behind, nor an earlier run\'s');

    // A shard that finished while this process was blocked past its deadline
    // is green, not stopped (verifier round 1).
    const blocked = start([FAST_TEST], {deadlineMs: 1000});
    spawnSync('sleep', ['8']);
    const finished = await blocked.done;
    assert.equal(finished.reason, undefined, finished.log);
    assert.equal(finished.status, 0);

    // A machine that takes the upload and then stalls holds nothing: the
    // shard is already started, and its deadline stops it.
    fs.mkdirSync(parent, {recursive: true});
    spawnSync('mkfifo', [path.join(parent, 'stalled.bundle')]);
    const stalledAt = Date.now();
    const stalled = await start([FAST_TEST], {runId: 'stalled', deadlineMs: 1500}).done;
    assert.equal(stalled.reason, 'deadline');
    assert.ok(Date.now() - stalledAt < 15000, 'stopped at its deadline');
    // And the stalled upload itself is gone, not left to its own 300 s bound
    // (a plain `timeout` would take it out of the wrapper's group).
    const fifo = path.join(parent, 'stalled.bundle');
    let uploading = true;
    for (let poll = 0; poll < 40 && uploading; poll += 1) {
      uploading = spawnSync('pgrep', ['-f', fifo]).status === 0;
      if (uploading) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(uploading, false, 'the upload was stopped with its shard');
    assert.deepEqual(fs.readdirSync(path.join(controller, 'test-output', 'placement'))
      .filter((file) => file.startsWith('stalled') && !/\.(log|err)$/u.test(file)), [],
    'and its local script and bundle are gone');

    // Stopped mid-run by the deadline: the runner's group dies and the shell
    // still cleans up.
    const running = start([SLOW_TEST], {runId: 'deadline-run', deadlineMs: 4000});
    // While it runs, the machine lock is held by the shell alone: the runner
    // and its tests do not carry it (Linux, where /proc shows descriptors).
    await assertRunnerFreeOfLock(
      path.join(controller, 'test-output', 'placement', 'deadline-run-lab.log'));
    const stopped = await running.done;
    assert.equal(stopped.reason, 'deadline');
    const runner = /^placement-pid=(\d+)$/mu.exec(stopped.log)?.[1];
    assert.ok(runner, 'the deadline fell while the runner ran');
    assert.throws(() => process.kill(Number(runner), 0),
      'the shell waited for its runner before cleaning up');
    assert.doesNotMatch(stopped.log, new RegExp(`^ok ${SLOW_TEST} `, 'mu'),
      'and stopped it before its file finished');
    let groupAlive = true;
    for (let poll = 0; poll < 100 && groupAlive; poll += 1) {
      try {
        process.kill(-Number(runner), 0);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch {
        groupAlive = false;
      }
    }
    assert.equal(groupAlive, false, 'the runner\'s whole group is gone');
    assert.deepEqual(processesUnder(node), [], 'and nothing it started still runs there');
    assert.deepEqual(leftovers(node), {worktrees: 1, refs: '', files: []});

    // One placed run per machine: a busy machine is refused at once.
    if (spawnSync('sh', ['-c', 'command -v flock']).status === 0) {
      const lock = path.join(node, '.git', 'lagrange-placement.lock');
      // Its own group: flock's `sleep` child inherits the lock, so the whole
      // group is released afterwards.
      const holder = spawn('flock', [lock, 'sleep', '30'], {stdio: 'ignore', detached: true});
      const release = () => {
        try {
          process.kill(-holder.pid, 'SIGKILL');
        } catch {
          // already gone
        }
      };
      t.after(release);
      for (let poll = 0; poll < 50 && !fs.existsSync(lock); poll += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const busy = await (await start([FAST_TEST])).done;
      assert.equal(busy.status, PLACEMENT_EXIT.BUSY);
      release();
      await exitOf(holder);
      assert.deepEqual(leftovers(node), {worktrees: 1, refs: '', files: []});
    }

    // A commit the machine does not hold although its checkout claims it:
    // nothing is set up, and the shard falls back.
    fs.appendFileSync(path.join(controller, 'README.md'), 'a second witness line\n');
    git(controller, 'commit', '-qam', 'placement witness two');
    const unsent = git(controller, 'rev-parse', 'HEAD');
    const unreachable = await (await startRemoteShard({machine: {...machine, repoHead: unsent},
      files: [FAST_TEST]}, {sha: unsent, deadlineMs: MINUTE, root: controller, env})).done;
    assert.equal(unreachable.status, PLACEMENT_EXIT.SETUP);
    assert.deepEqual(leftovers(node), {worktrees: 1, refs: '', files: []});
  });
