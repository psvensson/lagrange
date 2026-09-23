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
  PLACEMENT_EXIT, formatLabDecision, labTestCommit, labTestDeps, placeLabLanes,
  placeTestFiles, placementDeps, placementMachines, recordPlacementMisses, runLabTest,
  runPlacedTestFiles, startRemoteShard,
} from '../../scripts/lab/probe.js';

const MINUTE = 60000;
const CONTROLLER = Object.freeze({name: '(controller)', controller: true, speed: 1});
// A pure unit file of about 50 ms: the witnesses below wait on events, not on
// wall-clock budgets, because the hosted runner is several times slower
// (2026-09-18: a repository-scanning file took over a minute there).
const FAST_TEST = 'test/query/distributed-merge-engine.test.js';
const SLOW_TEST = 'test/scripts/check-operation-dispatch-completion-owner.test.js';
const OTHER_FAST_TEST = 'test/query/budget-limit-error.test.js';

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

// Keep-going is the one policy, placed or local: the runner is handed no
// policy but the explicit fail-fast opt-in, and a fail-fast run is never
// placed, because a placed run reports the whole plan by construction.
test('only an explicit fail-fast reaches the runner, and it is never placed', async () => {
  const policies = [];
  let run = fakeDeps({runLocal: (files, options) => {
    policies.push(options);
    return 0;
  }});
  assert.equal(await runPlacedTestFiles(MANY, run.deps), 0);
  assert.equal(run.calls.remote.length, 1, 'the default run is placed');
  assert.deepEqual(policies, [{}], 'the controller shard runs the default policy');

  policies.length = 0;
  run = fakeDeps({failFast: true, runLocal: (files, options) => {
    policies.push(options);
    return 0;
  }});
  assert.equal(await runPlacedTestFiles(MANY, run.deps), 0);
  assert.deepEqual(policies, [{failFast: true}]);
  assert.equal(run.calls.discover, 0, 'a fail-fast run never asks the fleet');
  assert.match(run.calls.lines[0], /^placement: local - fail-fast asks for the first red/u);
});

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
  for (let poll = 0; poll < 600 && !out.includes('local-started'); poll += 1) {
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
  assert.ok(Date.now() - signalledAt < 5000, 'at once, not after the controller\'s files');
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

test('a hang-up stops a placed run like an interrupt', async () => {
  // Closing the terminal: the controller child and the lab wrappers are
  // detached, so nothing but this handler would stop them.
  const signals = new EventEmitter();
  const aborted = [];
  let exited = null;
  let started = false;
  const run = fakeDeps({
    signals,
    exit: (code) => {
      exited = code;
    },
    runLocalChild: () => {
      started = true;
      return {done: new Promise(() => {}), abort: () => aborted.push('controller')};
    },
    runRemote: () => ({done: new Promise(() => {}), abort: () => aborted.push('lab')}),
  });
  runPlacedTestFiles(MANY, run.deps);
  for (let tick = 0; tick < 20 && !started; tick += 1) await new Promise(setImmediate);
  signals.emit('SIGHUP');
  assert.deepEqual(aborted.sort(), ['controller', 'lab']);
  assert.equal(exited, 130);
});

test('a second hang-up during the abort neither kills it nor repeats it', async () => {
  // A real hang-up arrives twice - the shell resends it, then the kernel -
  // and the second lands while the first is still aborting. The handler must
  // still be installed then, or the default action kills the controller and
  // leaves the detached shards running. Every lab shell is asked to stop
  // before any is cut, so all of them share one grace.
  const signals = new EventEmitter();
  const order = [];
  const exits = [];
  let started = false;
  let installed = null;
  const run = fakeDeps({
    signals,
    exit: (code) => exits.push(code),
    discover: async () => ({machines: [lab('lab1', 1), lab('lab2', 1)],
      record: async () => {}}),
    runLocalChild: () => {
      started = true;
      return {done: new Promise(() => {}), abort: () => order.push('controller')};
    },
    runRemote: (shard) => ({done: new Promise(() => {}), interrupt: () => {
      installed = signals.listenerCount('SIGHUP');
      signals.emit('SIGHUP');
      order.push(`ask ${shard.machine.name}`);
      return {pid: null, cut: () => order.push(`cut ${shard.machine.name}`)};
    }}),
  });
  runPlacedTestFiles(MANY, run.deps);
  for (let tick = 0; tick < 20 && !started; tick += 1) await new Promise(setImmediate);
  assert.ok(started, 'the controller\'s files are running');
  signals.emit('SIGHUP');
  assert.ok(installed > 0, 'the handler is still installed while it aborts');
  assert.deepEqual(order, ['controller', 'ask lab1', 'ask lab2', 'cut lab1', 'cut lab2'],
    'once each: the controller child first, then every lab shell asked before any is cut');
  assert.deepEqual(exits, [130]);
});

// The runner's pid once the lab shard's log names it.
async function runnerPidFrom(logFile) {
  for (let poll = 0; poll < 1200; poll += 1) {
    const pid = /^placement-pid=(\d+)$/mu.exec(fs.readFileSync(logFile, 'utf8'))?.[1];
    if (pid) return Number(pid);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return assert.fail('the runner never started');
}

test('an aborted lab shard cleans up before it is cut', async (t) => {
  const {node, controller, start} = labFixture(t);
  const running = start([SLOW_TEST], {runId: 'aborted'});
  const runner = await runnerPidFrom(
    path.join(controller, 'test-output', 'placement', 'aborted-lab.log'));
  running.abort();
  const outcome = await running.done;
  assert.equal(outcome.reason, 'interrupted');
  assert.deepEqual(leftovers(node), {worktrees: 1, refs: '', files: []},
    'the lab shell removed its worktree, ref, bundle and file list before being cut');
  let alive = true;
  for (let poll = 0; poll < 100 && alive; poll += 1) {
    try {
      process.kill(-runner, 0);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch {
      alive = false;
    }
  }
  assert.equal(alive, false, 'and its runner group is gone');
});

test('the controller child runs with placement switched off', async (t) => {
  // Its own files are the controller's shard: placing them again would
  // rediscover a fleet that is busy with this very run.
  const local = placementDeps({root: process.cwd(), env: gitProcessEnvironment()})
    .runLocalChild([SLOW_TEST]);
  t.after(() => local.abort());
  assert.doesNotThrow(() => process.kill(-local.group, 0), 'it leads its own group');
  if (fs.existsSync(`/proc/${local.group}/environ`)) {
    const environ = fs.readFileSync(`/proc/${local.group}/environ`, 'utf8').split('\0');
    assert.ok(environ.includes('LAGRANGE_PLACEMENT=local'), 'placement is off in it');
  }
  local.abort();
  assert.notEqual(await local.done, 0, 'and an abort ends it');
});

const GATE_TEST = 'test/scripts/lab-stream-gate.test.js';
const RESULTS_FILE = 'test-output/reports/test-results.ndjson';
const RESULTS_TEXT = '{"file":"a","ok":true}\n{"file":"b","ok":false}\n';

// Waits, bounded, for the witness to create the gate file.
function gateTestSource(gate) {
  return [
    'import assert from \'node:assert/strict\';',
    'import fs from \'node:fs\';',
    'import {test} from \'node:test\';',
    'test(\'waits for the witness\', async () => {',
    `  for (let poll = 0; poll < 2400 && !fs.existsSync(${JSON.stringify(gate)}); poll += 1) {`,
    '    await new Promise((resolve) => setTimeout(resolve, 50));',
    '  }',
    `  assert.ok(fs.existsSync(${JSON.stringify(gate)}));`,
    '});',
    '',
  ].join('\n');
}

test('the controller child gets its file list even while this process is busy', async () => {
  // Its list used to go down a socket written from this event loop; a child
  // that read it first - this process blocked after the spawn, as a placed
  // run is while it bundles and starts lab shards - found the non-blocking
  // socket empty and died with EAGAIN before running anything (found
  // 2026-09-23, eight of eight children under a 300 ms block).
  // Not inside node:test's own stream protocol, as a real controller is not.
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  // Streamed, so its output does not land in this file's own TAP; the list
  // reaches an inherited-output child the same way.
  const lines = [];
  const streamed = labTestDeps({root: process.cwd(), env}).runLocalChild([OTHER_FAST_TEST],
    {onLine: (line) => lines.push(line)});
  const until = Date.now() + 300;
  while (Date.now() < until) {
    // Busy, as the controller is between starting its child and returning.
  }
  assert.equal(await streamed.done, 0, lines.join('\n'));
  assert.ok(lines.some((line) => line.startsWith(`ok ${OTHER_FAST_TEST} `)), lines.join('\n'));
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
  for (let poll = 0; poll < 1200 && !runnerPid; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    runnerPid = /^placement-pid=(\d+)$/mu.exec(fs.readFileSync(logFile, 'utf8'))?.[1];
  }
  assert.ok(runnerPid, 'the runner started');
  if (!fs.existsSync(`/proc/${runnerPid}/fd`)) return;
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

// A lab machine's checkout at this commit, and a controller one commit on,
// in scratch repositories; `start` places files there in local-sh mode.
function labFixture(t) {
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
  git(controller, 'add', '-f', GATE_TEST, RESULTS_FILE);
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
    {sha, deadlineMs: 10 * MINUTE, root: controller, env, ...options});
  return {node, controller, parent, machine, sha, env, start,
    releaseGate: () => fs.writeFileSync(gate, 'go')};
}

test('a lab machine proves the exact commit in a throwaway worktree and leaves nothing behind',
  async (t) => {
    const {node, controller, parent, machine, sha, env, start} = labFixture(t);
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
    const blocked = start([FAST_TEST], {runId: 'blocked', deadlineMs: 1000});
    // Block until the shard has finished - its file reported and its lab
    // shell gone - however long that takes on this machine.
    const blockedLog = path.join(controller, 'test-output', 'placement', 'blocked-lab.log');
    spawnSync('sh', ['-c', `until grep -q '^placement-shell=' '${blockedLog}'; do sleep 0.1; done; ` +
      `shell=$(sed -n 's/^placement-shell=//p' '${blockedLog}'); ` +
      'while kill -0 "$shell" 2>/dev/null; do sleep 0.1; done; sleep 1'], {timeout: 10 * MINUTE});
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
    // Stopped once its runner is running - the same stop a deadline makes,
    // which the stalled upload above already exercised on its timer.
    const running = start([SLOW_TEST], {runId: 'deadline-run'});
    // While it runs, the machine lock is held by the shell alone: the runner
    // and its tests do not carry it (Linux, where /proc shows descriptors).
    await assertRunnerFreeOfLock(
      path.join(controller, 'test-output', 'placement', 'deadline-run-lab.log'));
    running.stop();
    const stopped = await running.done;
    assert.equal(stopped.reason, 'interrupted');
    const runner = /^placement-pid=(\d+)$/mu.exec(stopped.log)?.[1];
    assert.ok(runner, 'the stop fell while the runner ran');
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
      // Held, not merely created: flock makes the file before it locks it.
      for (let poll = 0; poll < 600 && spawnSync('flock', ['-n', lock, 'true']).status === 0;
        poll += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
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

// ---------------------------------------------------------------------------
// The hand verb: `lab test <profile> --lane <lane> [--on NAME] [--sha COMMIT]
// [--split]` sends the exact commit through the same shard path, streams each
// file's verdict as it lands, and prints the runner's own summary.

const LANE = Object.freeze({ORDINARY: 'ordinary', EXCLUSIVE: 'exclusive',
  BOOTSTRAP: 'bootstrap', EXTERNAL: 'external-toolchain'});

// A fake inventory: the machines, their measured facts and the controller's.
function fakeInventory() {
  const ready = {ready: true, missing: [], gaps: []};
  const cap = (extra = {}) => ({repoPath: '/srv/lagrange', cpuSampleMs: 260, cores: 12,
    memKiB: 16 * 1024 * 1024, nodeVersion: 'v22.22.3', repo: {head: 'c'.repeat(40)}, ...extra});
  const fleet = [
    {name: '(controller)', controller: true,
      capability: {cpuSampleMs: 200, cores: 20, memKiB: 32 * 1024 * 1024}, readiness: ready},
    {name: 'alpha', capability: cap(), readiness: ready},
    {name: 'beta', capability: cap({cpuSampleMs: 150, cores: 8}), readiness: ready},
    {name: 'gamma', capability: cap(), readiness: {ready: false, missing: ['no-repository'],
      gaps: []}},
  ];
  const nodes = Object.fromEntries(fleet.filter((entry) => !entry.controller)
    .map((entry) => [entry.name, {name: entry.name, ssh: `peer@${entry.name}`}]));
  return {fleet, state: {nodes}};
}

const LANE_PLAN = Object.freeze([
  {resourceClass: LANE.ORDINARY, files: ['o1', 'o2'], jobs: 4},
  {resourceClass: LANE.EXTERNAL, files: ['t1'], jobs: 1},
  {resourceClass: LANE.BOOTSTRAP, files: ['b1'], jobs: 2},
  {resourceClass: LANE.EXCLUSIVE, files: ['x1'], jobs: 1},
]);

test('a hand lab run takes its machine from measured facts, never a written host', () => {
  const {fleet, state} = fakeInventory();
  const machines = placementMachines(fleet, state);
  assert.deepEqual(machines.map((machine) => [machine.name, machine.cores, machine.memKiB]),
    [['alpha', 12, 16 * 1024 * 1024], ['beta', 8, 16 * 1024 * 1024]],
    'each machine carries its measured capacity');
  const controller = {name: '(controller)', controller: true, speed: 1, cores: 20,
    memKiB: 32 * 1024 * 1024};
  const names = (assignments) => assignments.map((one) =>
    [one.machine.name, one.lanes.map((lane) => lane.resourceClass)]);

  // One lane, nowhere named: the fastest ready machine, measured this run.
  assert.deepEqual(names(placeLabLanes([LANE_PLAN[3]], machines, {controller})),
    [['beta', [LANE.EXCLUSIVE]]]);
  assert.deepEqual(names(placeLabLanes(LANE_PLAN, machines, {on: 'alpha', controller})),
    [['alpha', LANE_PLAN.map((lane) => lane.resourceClass)]], '--on names the machine');
  assert.throws(() => placeLabLanes(LANE_PLAN, machines, {on: 'gamma', controller}),
    /gamma is not a ready lab machine/u);
  assert.throws(() => placeLabLanes(LANE_PLAN, [], {controller}), /no lab machine is ready/u);

  // Split: the exclusive lane alone on the fastest lab machine; the rest on
  // whichever is measured faster of the controller and the next lab machine.
  assert.deepEqual(names(placeLabLanes(LANE_PLAN, machines, {split: true, controller})),
    [['beta', [LANE.EXCLUSIVE]],
      ['(controller)', [LANE.ORDINARY, LANE.EXTERNAL, LANE.BOOTSTRAP]]],
    'a second machine slower than the controller is not used');
  const quick = [...machines, {...machines[0], name: 'delta', speed: 0.5}];
  assert.deepEqual(names(placeLabLanes(LANE_PLAN, quick, {split: true, controller})),
    [['delta', [LANE.EXCLUSIVE]], ['beta', [LANE.ORDINARY, LANE.EXTERNAL, LANE.BOOTSTRAP]]],
    'a second lab machine faster than the controller takes the other lanes');
  assert.deepEqual(names(placeLabLanes(LANE_PLAN, machines,
    {split: true, on: 'alpha', controller})),
  [['alpha', [LANE.EXCLUSIVE]], ['beta', [LANE.ORDINARY, LANE.EXTERNAL, LANE.BOOTSTRAP]]],
  'the next lab machine, measured faster than the controller, takes the rest');

  // The decision is printed with the capacities it was made from.
  const lines = formatLabDecision(placeLabLanes(LANE_PLAN, machines, {split: true, controller}));
  assert.deepEqual(lines, [
    'lab test: beta: exclusive (1 files) cores=8 mem=16.0GiB speed x0.75',
    'lab test: (controller): ordinary, external-toolchain, bootstrap (4 files) ' +
      'cores=20 mem=32.0GiB speed x1.00',
  ]);
});

test('a lab shard streams its lines while it runs and relays its results ledger', async (t) => {
  const {start, releaseGate} = labFixture(t);
  const streamed = [];
  let settled = false;
  const shard = start([FAST_TEST, GATE_TEST], {runId: 'streamed',
    results: RESULTS_FILE, onLine: (line, stream) => streamed.push({line, stream})});
  shard.done.then(() => {
    settled = true;
  });
  // Hooks run in the order they were added, after the fixture's removal: a
  // failed witness stops its shard, and the gate file has nowhere to go.
  t.after(() => shard.stop());
  const fastVerdict = new RegExp(`^ok ${FAST_TEST} `, 'u');
  for (let poll = 0; poll < 2400 && !streamed.some(({line}) => fastVerdict.test(line));
    poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(streamed.some(({line}) => fastVerdict.test(line)), 'a file verdict was streamed');
  assert.equal(settled, false, 'while its shard was still running');
  releaseGate();
  const outcome = await shard.done;
  assert.equal(outcome.status, 0, outcome.log + outcome.errors);
  const out = streamed.filter(({stream}) => stream === 'out').map(({line}) => line);
  assert.deepEqual(out, outcome.log.split('\n').filter(Boolean),
    'every line of the log was streamed, once, in order');
  const relayed = out.filter((line) => line.startsWith('placement-results='))
    .map((line) => line.slice('placement-results='.length));
  assertLedgerCameBack(relayed, [FAST_TEST, GATE_TEST]);
});

// The ledger in the throwaway worktree came back whole before it was
// removed: the commit's own records first, then the runner's record of every
// file the shard ran (the runner appends one per attempt).
function assertLedgerCameBack(records, files) {
  const committed = RESULTS_TEXT.trim().split('\n');
  assert.deepEqual(records.slice(0, committed.length), committed,
    'the results ledger left in the throwaway worktree comes back before it is removed');
  const ran = records.slice(committed.length).map((record) => JSON.parse(record));
  for (const file of files) {
    assert.ok(ran.some((record) => record.file === file && record.ok === true),
      `with the runner's own record of ${file}: ${records.join('\n')}`);
  }
}

test('a split lab run sends the exclusive lane away, runs the rest here and merges', async (t) => {
  const {controller, machine, sha, env} = labFixture(t);
  fs.symlinkSync(path.join(process.cwd(), 'node_modules'),
    path.join(controller, 'node_modules'));
  const {fleet} = fakeInventory();
  const lab = {...machine, controller: false, speed: 0.9, cores: 12, memKiB: 1024 * 1024,
    avoid: []};
  const lines = [];
  const deps = {...labTestDeps({root: controller, env}),
    discover: async () => ({fleet, machines: [lab]})};
  const plan = [
    {resourceClass: LANE.ORDINARY, files: [OTHER_FAST_TEST], jobs: 4},
    {resourceClass: LANE.EXCLUSIVE, files: [FAST_TEST], jobs: 1},
  ];
  const commit = labTestCommit({root: controller});
  t.after(() => commit.release());
  assert.equal(commit.sha, sha);
  const status = await runLabTest({plan, commit, split: true, root: controller,
    write: (line) => lines.push(line)}, deps);
  assert.equal(status, 0, lines.join('\n'));
  assert.ok(lines.includes('lab test: lab: exclusive (1 files) cores=12 mem=1.0GiB speed x0.90'),
    lines.join('\n'));
  assert.ok(lines.some((line) => line.startsWith(`[lab] ok ${FAST_TEST} `)), 'streamed there');
  assert.ok(lines.some((line) => line.startsWith(`[(controller)] ok ${OTHER_FAST_TEST} `)),
    'and here');
  assert.ok(!lines.some((line) => line.includes('placement-results=')),
    'the ledger is copied, not printed');
  const merged = lines.at(-1);
  assert.match(merged, /^# test-files total=2 pass=2 fail=0 assertions=\d+$/u,
    'the local runner\'s own summary, merged over both machines');
  const assertions = lines.filter((line) => /^\[[^\]]+\] ok /u.test(line))
    .reduce((sum, line) => sum + Number(/\((\d+) assertions/u.exec(line)[1]), 0);
  assert.equal(merged, `# test-files total=2 pass=2 fail=0 assertions=${assertions}`);
  const copied = fs.readFileSync(path.join(controller, 'test-output', 'reports',
    'test-results-lab.ndjson'), 'utf8');
  assert.ok(copied.endsWith('\n'), 'copied back under the machine\'s name, whole');
  assertLedgerCameBack(copied.trim().split('\n'), [FAST_TEST]);
  commit.release();
  assert.equal(fs.existsSync(commit.gitRoot), false, 'the planning checkout is gone');

  // A share for the controller needs this tree to be exactly the commit.
  await assert.rejects(runLabTest({plan, commit: {sha: 'f'.repeat(40), gitRoot: controller,
    release: () => {}}, split: true, root: controller, write: () => {}}, deps),
  /the controller runs its lanes in this tree, which is not exactly f{40}/u);
});

test('a hand lab run sends only a commit, and a named one from any tree', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-test-commit-'));
  t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
  git(repo, 'init', '-q');
  fs.mkdirSync(path.join(repo, 'test'));
  fs.writeFileSync(path.join(repo, 'test', 'a.test.js'), 'first\n');
  fs.writeFileSync(path.join(repo, 'package.json'), '{}\n');
  fs.writeFileSync(path.join(repo, 'other.txt'), 'x\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'one');
  const first = git(repo, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(repo, 'test', 'a.test.js'), 'second\n');
  git(repo, 'commit', '-qam', 'two');
  const head = git(repo, 'rev-parse', 'HEAD');
  const worktrees = () => git(repo, 'worktree', 'list').split('\n').length;

  const clean = labTestCommit({root: repo});
  assert.equal(clean.sha, head);
  assert.equal(git(clean.gitRoot, 'rev-parse', 'HEAD'), head, 'planned at that commit');
  clean.release();
  clean.release();
  assert.equal(worktrees(), 1, 'released once, and again harmlessly');

  fs.writeFileSync(path.join(repo, 'test', 'b.test.js'), 'untracked\n');
  assert.throws(() => labTestCommit({root: repo}),
    /the tree is not exactly a commit, and only a commit is sent/u);
  assert.throws(() => labTestCommit({root: repo, sha: 'no-such-commit'}),
    /no-such-commit is not a commit here/u);
  const named = labTestCommit({root: repo, sha: first.slice(0, 10)});
  t.after(() => named.release());
  assert.equal(named.sha, first, 'a named commit is resolved in full');
  assert.equal(fs.readFileSync(path.join(named.gitRoot, 'test', 'a.test.js'), 'utf8'),
    'first\n', 'and planned from its own test tree, not the working one');
  assert.equal(fs.existsSync(path.join(named.gitRoot, 'test', 'b.test.js')), false);
  assert.equal(fs.existsSync(path.join(named.gitRoot, 'other.txt')), false,
    'only what planning reads is checked out');
  named.release();
  assert.equal(worktrees(), 1);
});
