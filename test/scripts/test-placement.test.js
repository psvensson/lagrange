// Placement runs one classified plan across the lab machines discovery finds
// ready, chosen at test time from measured facts (owner direction,
// 2026-09-18: an ordinary push proves itself locally and in parallel, and no
// host belongs in any setup). Every assigned file executes once; a failed or
// unmeasured share remains a failed or unavailable result of that run.

import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {nativeThermalFixture} from './native-thermal-fixture.js';

import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {
  DISCOVERY_FAILURE, PLACEMENT_EXIT, labTestCommit, labTestDeps,
  placeTestFiles, placementDeps, placementMachines, runLabTest,
  runPlacedTestFiles, startRemoteShard,
} from '../../scripts/lab/probe.js';
import {
  CONTROLLER, IMPORT_GRAPH_PRODUCER, LANE, PLANNING_ENDPOINT, READY_LINE, SENSOR_POLICY,
  fakeInventory, lab, labRunnerLog,
  placementRunFixture as fakeDeps, waitForNonEmptyFile, worktreeTap,
} from './test-placement-fixtures.js';
import {spawnGit} from '../../scripts/checks/git-invocation.js';
import {
  CUSTODY_STDERR, CUSTODY_STDERR_BYTES, CUSTODY_TAP, CUSTODY_TAP_BYTES,
  FAST_TEST, FIXTURE_HOLDER, GATE_TEST, LINK_UNIVERSE_TEST, MINUTE,
  REMOTE_CLOSE_MS, RESULTS_FILE, RESULTS_TEXT, RUNNER_FAST_FIXTURE,
  RUNNER_SLOW_FIXTURE, SEALED_GRAPH_TEST, custodyShardFixture, exitOf, git,
  holdLock, joinRemoteFixture, labFixture, leftovers, liveGroupMembers,
  lockIsFree, nativeIdentity, ownedPhaseMarker, processesUnder, runnerFixture,
  runnerPidFrom, startRemoteCancellationFixture, waitForRemoteMarker,
} from './test-placement-execution-fixture.js';

const SLOW_TEST = 'test/scripts/check-operation-dispatch-completion-owner.test.js';
const OTHER_FAST_TEST = 'test/query/budget-limit-error.test.js';

// This worktree's own recorded result for each file: a witness that drives
// the real runner must never write here, where the corpus writes the same
// path concurrently (a NUL-filled .tap there was a false red, 2026-09-23).
function worktreeResults(files) {
  return files.map((file) => {
    const tap = path.join(process.cwd(), '.tap', 'test-results', `${file}.tap`);
    return fs.existsSync(tap) ? `${file} ${fs.statSync(tap).mtimeMs}` : `${file} absent`;
  });
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
    thermalEndpoint: PLANNING_ENDPOINT,
    thermalDecision: {outcome: 'READY', execution_policy: SENSOR_POLICY},
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

  assert.equal(Object.hasOwn(good, 'avoid'), false,
    'placement describes current capability without excluding earlier failures');
});

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

test('local execution is planned explicitly; missing placement facts refuse execution', async () => {
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
  assert.equal(await runPlacedTestFiles(MANY, run.deps), PLACEMENT_EXIT.SETUP);
  assert.deepEqual(run.calls.local, []);
  assert.equal(run.calls.discover, 0, 'a working tree is never sent anywhere');
  assert.match(run.calls.lines[0], /^placement: unavailable - the tree is not exactly a commit/u);

  run = fakeDeps({discover: async () => ({fleet: fakeInventory().fleet, machines: []})});
  assert.equal(await runPlacedTestFiles(MANY, run.deps), PLACEMENT_EXIT.SETUP);
  assert.deepEqual(run.calls.local, []);
  assert.match(run.calls.lines[0], /no lab machine is ready/u);

  // Discovery that fails is unavailable, and the line names which
  // part failed (the real discovery's codes are witnessed against a real
  // repository in lab-fleet-discovery.test.js).
  for (const [code, message, line] of [
    [DISCOVERY_FAILURE.INVENTORY_UNREADABLE, 'Unsupported lab inventory at /x/inventory.json',
      /^placement: unavailable - the lab inventory could not be read: Unsupported/u],
    [DISCOVERY_FAILURE.REQUIREMENT_UNREADABLE, 'no requirement: cannot read package.json at f',
      /^placement: unavailable - the placed commit's requirement could not be read: no requirement/u],
    [DISCOVERY_FAILURE.REQUIREMENT_TOO_LARGE, 'package-lock.json at f is larger than the bound',
      /^placement: unavailable - the placed commit's requirement could not be read: package-lock/u],
    [undefined, 'something else', /^placement: unavailable - lab discovery failed: something else$/u],
  ]) {
    run = fakeDeps({discover: async () => {
      throw Object.assign(new Error(message), {code});
    }});
    assert.equal(await runPlacedTestFiles(MANY, run.deps), PLACEMENT_EXIT.SETUP);
    assert.deepEqual(run.calls.local, [], `${code}: no measurement was started`);
    assert.match(run.calls.lines[0], line, `${code}: named`);
  }

  // The real commit check: clean is a commit, modified or untracked is not.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-commit-'));
  try {
    const git = (...args) => spawnGit(['-c', 'user.name=t', '-c', 'user.email=t@t',
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

test('a red lab file remains red and every assigned file executes once', async () => {
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
  assert.equal(await runPlacedTestFiles(MANY, run.deps), 1,
    'the first failed lab execution remains the result');
  const [controllerShard] = run.calls.local;
  assert.ok(controllerShard.length > 0 && remoteFiles.length > 0, 'both machines ran files');
  assert.equal(run.calls.local.length, 1, 'the controller executes only its assigned shard');
  assert.deepEqual([...controllerShard, ...remoteFiles].sort(), [...MANY].sort(),
    'every planned file was assigned once');
  assert.deepEqual(run.calls.record, [], 'a failure never changes future placement eligibility');
  assert.ok(run.calls.lines.some((line) => line.startsWith(`[lab] not ok ${remoteFiles[0]}`)),
    'the lab machine\'s own lines are shown');

  // The lab machine is handed the controller's timeout policy and check
  // base, gets its deadline from its estimate, and starts before the controller's lanes.
  run = fakeDeps({env: {TAP_TIMEOUT: '900'}, checkBase: () => 'c0'});
  await runPlacedTestFiles(MANY, run.deps);
  assert.deepEqual(run.calls.options[0].options.forward,
    {tapTimeout: '900', checkBase: 'c0', laneJobsCap: ''});
  assert.equal(run.calls.options[0].options.deadlineMs, 30 * MINUTE,
    'never under half an hour');
  assert.deepEqual(run.calls.order, ['remote', 'local'], 'lab shards first, then this one');
  run = fakeDeps({planCosts: (files) => files.map((file) => ({file, ms: 4 * MINUTE, jobs: 1}))});
  await runPlacedTestFiles(MANY, run.deps);
  const {shard, options} = run.calls.options[0];
  assert.ok(shard.loadMs * 3 > 30 * MINUTE);
  assert.equal(options.deadlineMs, 3 * shard.loadMs, 'three times its estimate');

  run = fakeDeps({checkBase: () => assert.fail('no commit: nope')});
  assert.equal(await runPlacedTestFiles(MANY, run.deps), PLACEMENT_EXIT.SETUP);
  assert.deepEqual([run.calls.remote, run.calls.local], [[], []]);
  assert.ok(run.calls.lines.some((line) => /is unresolved: no commit: nope$/u.test(line)));

  // The number of failed files does not change the single-execution policy.
  const many = Array.from({length: 60}, (_, index) => `test/g${index}.test.js`);
  run = fakeDeps({
    runRemote: async (shard) => ({done: Promise.resolve({status: 1,
      log: shard.files.map((file) => `not ok ${file} (1 assertions, 5ms)`).join('\n')})}),
  });
  assert.equal(await runPlacedTestFiles(many, run.deps), 1);
  assert.equal(run.calls.local.length, 1, 'only the controller\'s own shard ran here');
});

test('an unavailable or incomplete lab shard blocks acceptance without reassignment', async () => {
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
    const run = fakeDeps({
      runRemote: (shard) => {
        remoteFiles = shard.files;
        return {done: Promise.resolve(outcome(shard.files))};
      },
    });
    assert.notEqual(await runPlacedTestFiles(MANY, run.deps), 0, why);
    assert.equal(run.calls.local.length, 1, `${why}: only the original controller shard runs`);
    assert.deepEqual([...run.calls.local[0], ...remoteFiles].sort(), [...MANY].sort(),
      `${why}: each file was assigned once`);
    assert.ok(run.calls.lines.some((line) =>
      /^placement: lab: \d+ file\(s\) without a completed result/u
        .test(line)), `${why}: unavailable measurements stay visible`);
  }

  // A historical retry marker does not erase the original failed verdict.
  const retried = fakeDeps({
    runRemote: (shard) => ({done: Promise.resolve({status: 0, log: [
      notOk(shard.files[0]), `# retried-once pass ${shard.files[0]}`,
      ...shard.files.slice(1).map(ok)].join('\n')})}),
  });
  assert.equal(await runPlacedTestFiles(MANY, retried.deps), 1);
  assert.equal(retried.calls.local.length, 1, 'nothing runs twice');
});

// The thermal gate is the runner's, on whichever host it runs (process change
// 2026-09-23). A lab shard's log is its runner's stream: the gate's lines come
// back unchanged and are never verdicts, and a host whose runner refused as
// too hot is a typed unavailable outcome of this scheduled run.
const REAL_FILES = Object.freeze([FAST_TEST, SLOW_TEST, OTHER_FAST_TEST]);
test('a lab runner\'s thermal lines are relayed unchanged and are never verdicts', async () => {
  let given = null;
  const run = fakeDeps({
    runRemote: (shard) => {
      given = labRunnerLog(shard.files, false);
      return {done: Promise.resolve({status: given.status, log: given.log})};
    },
  });
  assert.equal(await runPlacedTestFiles([...REAL_FILES], run.deps), 0);
  const thermal = given.log.split('\n').filter((line) => line.startsWith('thermal: '));
  assert.deepEqual(thermal, [READY_LINE],
    'the child thermal line remains intact');
  assert.ok(run.calls.lines.includes(`[lab] ${READY_LINE}`),
    'relayed with the machine\'s name and nothing else changed');
  assert.equal(run.calls.local.length, 1, 'every lab file was proved by its own verdict line');

  // Thermal lines contain no per-file verdicts and cannot prove the shard.
  const gateOnly = fakeDeps({
    runRemote: (shard) => {
      return {done: Promise.resolve({status: 0,
        log: labRunnerLog(shard.files, false).log.split('\n')
          .filter((line) => line.startsWith('thermal: ')).join('\n')})};
    },
  });
  assert.equal(await runPlacedTestFiles([...REAL_FILES], gateOnly.deps), PLACEMENT_EXIT.SETUP);
  assert.equal(gateOnly.calls.local.length, 1, 'unmeasured files are never rerun');
});

test('a lab host too hot to run is reported thermal-unfit without moving its files',
  async () => {
    let remoteCalls = 0;
    let given = null;
    const run = fakeDeps({
      runRemote: (shard) => {
        remoteCalls += 1;
        given = {files: shard.files, ...labRunnerLog(shard.files, true)};
        return {done: Promise.resolve({status: given.status,
          log: `placement-head=${'a'.repeat(40)}\n${given.log}`})};
      },
    });
    assert.notEqual(await runPlacedTestFiles([...REAL_FILES], run.deps), 0,
      'the thermal refusal blocks acceptance');
    assert.deepEqual(given.spawned, [], 'the hot host started no test process');
    assert.ok(run.calls.lines.includes('placement: host-thermal-unfit lab'),
      `a typed placement outcome: ${run.calls.lines.join('\n')}`);
    assert.ok(run.calls.lines.some((line) =>
      line.startsWith('[lab] thermal: thermal-headroom-exhausted ')),
    'the refusal itself is relayed');
    assert.equal(remoteCalls, 1, 'never retried on the same host in this invocation');
    assert.equal(run.calls.local.length, 1, 'only the assigned controller files execute');

    // A ready spare does not turn an unavailable original assignment green.
    const tried = [];
    const moved = fakeDeps({
      discover: async () => ({fleet: fakeInventory().fleet,
        machines: [lab('lab', 1), lab('spare', 2)],
        record: async () => {}}),
      runRemote: (shard) => {
        tried.push({name: shard.machine.name, files: [...shard.files]});
        const ran = labRunnerLog(shard.files, shard.machine.name === 'lab');
        return {done: Promise.resolve({status: ran.status, log: ran.log})};
      },
    });
    assert.notEqual(await runPlacedTestFiles([...REAL_FILES], moved.deps), 0);
    assert.deepEqual(tried.map((one) => one.name), ['lab'],
      'the unfit host is the only assigned remote host');
    assert.equal(moved.calls.local.length, 1, 'the controller runs only its own shard');
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
  const thermal = nativeThermalFixture(t);
  const fixture = runnerFixture(t);
  const before = worktreeResults([RUNNER_SLOW_FIXTURE]);
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import {spawn} from 'node:child_process';
    import {placementDeps, runPlacedTestFiles} from ${JSON.stringify(probe)};
    import {fakeInventory, lab} from ${JSON.stringify(path.join(process.cwd(), 'test/scripts/test-placement-fixtures.js'))};
    const fleet = fakeInventory().fleet;
    fleet[0].capability.thermalEndpoint = JSON.parse(process.env.LAGRANGE_NATIVE_THERMAL_ENDPOINT);
    const group = () => {
      const sleeper = spawn('sleep', ['60'], {detached: true, stdio: 'ignore'});
      console.log('group=' + sleeper.pid);
      return sleeper;
    };
    const real = placementDeps({root: ${JSON.stringify(fixture.root)}, env: process.env});
    await runPlacedTestFiles(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], {
      env: {}, write: () => {},
      planCosts: (files) => files.map((file) => ({file, ms: 120000, jobs: 1})), runLocal: () => 1,
      commitAt: () => 'a'.repeat(40), checkBase: () => 'b'.repeat(40),
      discover: async () => ({fleet, machines: [lab('lab', 1)]}),
      controllerHeadroom: async () => ({fit: true, reason: null}),
      runRemote: () => {
        const lab = group();
        return {done: new Promise(() => {}), abort: () => process.kill(-lab.pid, 'SIGKILL')};
      },
      runLocalChild: (files, options) => {
        const local = real.runLocalChild(['${RUNNER_SLOW_FIXTURE}'], options);
        console.log('local-group=' + local.group);
        console.log('local-started');
        return local;
      },
    });
  `], {cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], env: gitProcessEnvironment(thermal.env)});
  t.after(() => child.kill('SIGKILL'));
  let out = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  for (let poll = 0; poll < 600 && !out.includes('local-started'); poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await waitForNonEmptyFile(fixture.tap(RUNNER_SLOW_FIXTURE));
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
  assert.deepEqual(worktreeResults([RUNNER_SLOW_FIXTURE]), before,
    'the worktree\'s results root is untouched');
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
    discover: async () => ({fleet: fakeInventory().fleet,
      machines: [lab('lab1', 1), lab('lab2', 1)],
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

test('an aborted lab shard closes its group and retains the original attempt', async (t) => {
  const fixture = labFixture(t);
  const {parent, controller, start} = fixture;
  const running = start([GATE_TEST], {runId: 'aborted'});
  const runner = await runnerPidFrom(
    path.join(controller, 'test-output', 'placement', 'aborted-lab.log'));
  const tap = worktreeTap(parent, 'aborted', GATE_TEST);
  await waitForNonEmptyFile(tap);
  const original = fs.readFileSync(tap);
  running.abort();
  const outcome = await running.done;
  assert.equal(outcome.reason, 'interrupted');
  assertRetainedRemoteAttempt(fixture, 'aborted', fixture.sha, [GATE_TEST]);
  assert.deepEqual(fs.readFileSync(tap).subarray(0, original.length), original,
    'the original pre-interruption transcript remains intact');
  assertEarlierPlacement(fixture);
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
  const fixture = runnerFixture(t);
  const before = worktreeResults([RUNNER_SLOW_FIXTURE]);
  const thermal = nativeThermalFixture(t);
  const local = placementDeps({root: fixture.root, env: gitProcessEnvironment(thermal.env)})
    .runLocalChild([RUNNER_SLOW_FIXTURE],
      {thermalEndpoint: thermal.endpoint, deadlineMs: MINUTE});
  t.after(() => local.abort());
  await waitForNonEmptyFile(fixture.tap(RUNNER_SLOW_FIXTURE));
  assert.ok(fs.existsSync(fixture.tap(RUNNER_SLOW_FIXTURE)), 'the fixture root holds the result');
  assert.doesNotThrow(() => process.kill(-local.group, 0), 'it leads its own group');
  if (fs.existsSync(`/proc/${local.group}/environ`)) {
    const environ = fs.readFileSync(`/proc/${local.group}/environ`, 'utf8').split('\0');
    assert.ok(environ.includes('LAGRANGE_PLACEMENT=local'), 'placement is off in it');
  }
  local.abort();
  assert.notEqual(await local.done, 0, 'and an abort ends it');
  assert.deepEqual(worktreeResults([RUNNER_SLOW_FIXTURE]), before,
    'the worktree\'s results root is untouched');
});

test('the controller child gets its file list even while this process is busy', async (t) => {
  // Its list used to go down a socket written from this event loop; a child
  // that read it first - this process blocked after the spawn, as a placed
  // run is while it bundles and starts lab shards - found the non-blocking
  // socket empty and died with EAGAIN before running anything (found
  // 2026-09-23, eight of eight children under a 300 ms block).
  // Not inside node:test's own stream protocol, as a real controller is not.
  const thermal = nativeThermalFixture(t);
  const env = gitProcessEnvironment(thermal.env);
  delete env.NODE_TEST_CONTEXT;
  // Streamed, so its output does not land in this file's own TAP; the list
  // reaches an inherited-output child the same way.
  const lines = [];
  const fixture = runnerFixture(t);
  const before = worktreeResults([RUNNER_FAST_FIXTURE]);
  const streamed = labTestDeps({root: fixture.root, env}).runLocalChild([RUNNER_FAST_FIXTURE],
    {onLine: (line) => lines.push(line), thermalEndpoint: thermal.endpoint,
      deadlineMs: MINUTE});
  const until = Date.now() + 300;
  while (Date.now() < until) {
    // Busy, as the controller is between starting its child and returning.
  }
  assert.equal(await streamed.done, 0, lines.join('\n'));
  assert.ok(lines.some((line) => line.startsWith(`ok ${RUNNER_FAST_FIXTURE} `)),
    lines.join('\n'));
  assert.ok(fs.existsSync(fixture.tap(RUNNER_FAST_FIXTURE)), 'the fixture root holds the result');
  assert.deepEqual(worktreeResults([RUNNER_FAST_FIXTURE]), before,
    'the worktree\'s results root is untouched');
});

// The descriptors a started runner holds, read from /proc once its pid is in
// the log: neither the machine-wide lock nor the checkout lock may be one of
// them. Returns the runner's pid.
async function assertRunnerFreeOfLock(logFile) {
  let runnerPid = null;
  for (let poll = 0; poll < 1200 && !runnerPid; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    runnerPid = /^placement-pid=(\d+)$/mu.exec(fs.readFileSync(logFile, 'utf8'))?.[1];
  }
  assert.ok(runnerPid, 'the runner started');
  if (!fs.existsSync(`/proc/${runnerPid}/fd`)) return runnerPid;
  const held = fs.readdirSync(`/proc/${runnerPid}/fd`).map((fd) => {
    try {
      return fs.readlinkSync(`/proc/${runnerPid}/fd/${fd}`);
    } catch {
      return '';
    }
  });
  assert.ok(!held.some((target) => target.endsWith('lagrange-placement.lock') ||
    target.endsWith('machine.lock')), 'the runner holds neither lock');
  return runnerPid;
}

// Current custody policy supersedes the old deletion/purge expectations.
// These helpers inspect only the actual scope each scenario acquired; a
// refused upload never claims a checkout or source ref it did not acquire.
function assertEarlierPlacement({node, parent, basis}) {
  assert.equal(fs.statSync(path.join(parent, 'old-run')).isDirectory(), true);
  assert.equal(fs.readFileSync(path.join(parent, 'old-run.files'), 'utf8'), 'x');
  assert.equal(fs.readFileSync(path.join(parent, 'old-run.bundle'), 'utf8'), 'x');
  assert.equal(git(node, 'rev-parse', 'refs/lagrange-placement/old-run'), basis,
    'an earlier attempt remains outside the current owner\'s cleanup scope');
}

function assertRetainedRemoteAttempt({node, parent}, runId, sha, files) {
  const checkout = fs.realpathSync(path.join(parent, runId));
  assert.ok(git(node, 'worktree', 'list', '--porcelain').includes(`worktree ${checkout}\n`),
    `the original failed checkout stays registered at ${checkout}`);
  assert.equal(git(checkout, 'rev-parse', 'HEAD'), sha, 'its exact source remains available');
  assert.equal(git(node, 'rev-parse', `refs/lagrange-placement/${runId}`), sha);
  assert.equal(fs.readFileSync(path.join(parent, `${runId}.files`), 'utf8'),
    `${files.join('\n')}\n`, 'the original selection remains available');
  assert.match(git(node, 'bundle', 'list-heads', path.join(parent, `${runId}.bundle`)),
    new RegExp(`^${sha} `, 'mu'), 'the original uploaded bundle still names this source');
}

test('a lab machine proves the exact commit and cleans only its successful attempt',
  async (t) => {
    const fixture = labFixture(t);
    const {node, controller, parent, machine, sha, basis, env, start} = fixture;
    const earlier = leftovers(node);
    const started = start([FAST_TEST], {runId: 'capped',
      forward: {tapTimeout: '900', checkBase: basis, laneJobsCap: '1'}});
    assert.equal(typeof started.then, 'undefined', 'a shard is started, not awaited');
    // The lab-side script as sent, read before its shard removes it and
    // asserted once the shard has settled, so a red leaves nothing running.
    const sent = fs.readFileSync(path.join(controller, 'test-output', 'placement',
      'capped-lab.sh'), 'utf8');
    const green = await started.done;
    assert.match(sent, /export LAGRANGE_LANE_JOBS_CAP="\$lane_cap"/u,
      'the remote shell forwards the declared lane cap');
    assert.match(sent, /case "\$lane_cap" in 0\|\*\[!0-9\]\*\)/u,
      'zero or malformed supplied caps refuse admission');
    assert.doesNotMatch(sent, /\b(?:getconf|nproc)\b/u,
      'a processor census cannot replace explicit policy');
    // The lab convention's default lock directory is `$HOME/.lab` on every
    // host; the fixture's machine is also called lab.
    assert.doesNotMatch(sent.replaceAll('$HOME/.lab', ''), /\blab\b/u,
      'and no machine is named in what it runs');
    assert.equal(green.status, 0, green.log + green.errors);
    assert.match(green.log, new RegExp(`^placement-head=${sha}$`, 'mu'),
      'the worktree is at the commit the controller holds, sent as a bundle');
    assert.match(green.log, new RegExp(`^ok ${FAST_TEST} `, 'mu'));
    assert.match(green.log, new RegExp('^placement-env=factor:1\\.5 mode:local ' +
      `timeout:900 lanecap:1 base:${basis}$`, 'mu'),
    'its own budgets scaled, the controller\'s timeout policy and check base, ' +
      'never placed again, and the explicit one-worker cap preserved');
    assert.match(sent, /else unset LAGRANGE_CHECK_BASE; fi$/mu, 'none forwarded, none kept');
    assert.match(green.log, /^placement-link=node_modules$/mu);
    assert.match(green.log, /^placement-link=data\/examples$/mu, 'an ignored entry is linked');
    assert.match(green.log, /^placement-link=tools\/tla2tools\.jar$/mu,
      'a fetched model checker is linked');
    assert.doesNotMatch(green.log, /^placement-link=data\/storage-load$/mu,
      'a tracked entry the commit deleted stays deleted');
    assert.deepEqual(leftovers(node), earlier,
      'its own worktree and inputs are removed; the earlier attempt stays untouched');
    assertEarlierPlacement(fixture);

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

    // This preexisting FIFO formerly acted as a stalled upload. Exclusive
    // attempt admission now refuses it before upload. It is collision proof,
    // not a measurement of the unchanged transport timeout.
    fs.mkdirSync(parent, {recursive: true});
    const fifo = path.join(parent, 'stalled.bundle');
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    const originalFifo = fs.lstatSync(fifo);
    const stalledAt = Date.now();
    const stalledRun = start([FAST_TEST], {runId: 'stalled', deadlineMs: 1500});
    const stalledInputs = ['.sh', '.bundle'].map((suffix) => {
      const file = path.join(controller, 'test-output', 'placement', `stalled-lab${suffix}`);
      return [file, fs.readFileSync(file)];
    });
    const stalled = await stalledRun.done;
    assert.equal(stalled.status, PLACEMENT_EXIT.SETUP, stalled.log + stalled.errors);
    assert.match(stalled.errors, /placement: unavailable - attempt already exists:/u);
    assert.ok(stalled.errors.includes(fifo), 'the refusal identifies the actual collision');
    assert.ok(Date.now() - stalledAt < 15000, 'collision admission is bounded');
    const retainedFifo = fs.lstatSync(fifo);
    assert.equal(retainedFifo.isFIFO(), true, 'the unacquired original FIFO remains');
    assert.deepEqual([retainedFifo.dev, retainedFifo.ino], [originalFifo.dev, originalFifo.ino],
      'the original FIFO was never removed or replaced');
    assert.doesNotMatch(stalled.log, /placement-shell=|placement-pid=/u,
      'neither remote checkout nor runner was admitted');
    let uploading = true;
    for (let poll = 0; poll < 40 && uploading; poll += 1) {
      uploading = spawnSync('pgrep', ['-f', fifo]).status === 0;
      if (uploading) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(uploading, false, 'no upload process remains for the refused collision');
    for (const [file, original] of stalledInputs) {
      assert.deepEqual(fs.readFileSync(file), original,
        'the refused attempt retains each exact controller input');
    }

    // Stopped mid-run: the runner's group closes and its original checkout,
    // inputs and transcript remain available.
    // Stop only after the actual runner has started. This exercises the
    // public stop owner, not expiry of the upload timeout.
    const running = start([GATE_TEST], {runId: 'deadline-run'});
    // While it runs, the machine lock is held by the shell alone: the runner
    // and its tests do not carry it (Linux, where /proc shows descriptors).
    await assertRunnerFreeOfLock(
      path.join(controller, 'test-output', 'placement', 'deadline-run-lab.log'));
    const stoppedTap = worktreeTap(parent, 'deadline-run', GATE_TEST);
    await waitForNonEmptyFile(stoppedTap);
    const originalTap = fs.readFileSync(stoppedTap);
    running.stop();
    const stopped = await running.done;
    assert.equal(stopped.reason, 'interrupted');
    const runner = /^placement-pid=(\d+)$/mu.exec(stopped.log)?.[1];
    assert.ok(runner, 'the stop fell while the runner ran');
    assert.throws(() => process.kill(Number(runner), 0),
      'the shell waited for its runner before completing');
    assert.doesNotMatch(stopped.log, new RegExp(`^ok ${GATE_TEST} `, 'mu'),
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
    assertRetainedRemoteAttempt(fixture, 'deadline-run', sha, [GATE_TEST]);
    assert.deepEqual(fs.readFileSync(stoppedTap).subarray(0, originalTap.length), originalTap,
      'stopping never erases the original transcript');
    assertEarlierPlacement(fixture);

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
      const beforeBusy = leftovers(node);
      const busy = await start([FAST_TEST], {runId: 'checkout-busy'}).done;
      assert.equal(busy.status, PLACEMENT_EXIT.BUSY);
      release();
      await exitOf(holder);
      assert.deepEqual(leftovers(node), {...beforeBusy,
        files: [...beforeBusy.files, 'checkout-busy.bundle'].sort()},
      'only its successfully uploaded bundle was acquired; earlier custody remains');
      assert.match(git(node, 'bundle', 'list-heads', path.join(parent, 'checkout-busy.bundle')),
        new RegExp(`^${sha} `, 'mu'));
    }

    // A commit the machine does not hold although its checkout claims it:
    // its setup refuses and earlier retained attempts remain intact.
    fs.appendFileSync(path.join(controller, 'README.md'), 'a second witness line\n');
    git(controller, 'commit', '-qam', 'placement witness two');
    const unsent = git(controller, 'rev-parse', 'HEAD');
    const unreachable = await (await startRemoteShard({machine: {...machine, repoHead: unsent},
      files: [FAST_TEST]}, {sha: unsent, deadlineMs: MINUTE, root: controller, env,
      holder: FIXTURE_HOLDER, runId: 'unreachable'})).done;
    assert.equal(unreachable.status, PLACEMENT_EXIT.SETUP);
    assertEarlierPlacement(fixture);
    assertRetainedRemoteAttempt(fixture, 'deadline-run', sha, [GATE_TEST]);
    assert.deepEqual(fs.readFileSync(stoppedTap).subarray(0, originalTap.length), originalTap,
      'later unavailable setup cannot erase the earlier failure transcript');
    const untouchedFifo = fs.lstatSync(fifo);
    assert.deepEqual([untouchedFifo.dev, untouchedFifo.ino], [originalFifo.dev, originalFifo.ino]);
  });

// ---------------------------------------------------------------------------
// Sharing the lab (owner directive 2026-09-23): a placed shard takes the one
// machine-wide lock every agent in every project takes, waits for it no longer
// than its own budget, and keeps a holder record beside it for as long as it
// holds it. A host found held is a typed outcome, and its shard goes on to the
// next ready host before the controller.

const SECOND = 1000;
// The lab's cap on any lock wait, in seconds.
const LOCK_WAIT_CAP_SECONDS = 30 * 60;
const HOLDER_FIELDS = Object.freeze(['project', 'agent', 'controller', 'purpose', 'sha',
  'startedAt', 'expectedMinutes', 'pid']);
// Another project's holder of a lab machine.
const OTHER_HOLDER = Object.freeze({project: 'other-project', agent: 'codex:task-7',
  controller: 'laptop', purpose: 'formation:rolling-restart', sha: 'e'.repeat(40),
  startedAt: '2026-09-23T10:00:00Z', expectedMinutes: 25, pid: 4242});
const HOST_BUSY_LINE = 'placement: host-busy b held-by codex:task-7 since 2026-09-23T10:00:00Z';

test('a lab shard takes the machine-wide lock for its budget and records who holds it',
  async (t) => {
    const {start, parent, controller, sha, labLock} = labFixture(t);
    const running = start([GATE_TEST], {runId: 'held',
      holder: {purpose: 'test:cpu-heavy', expectedMs: 90 * SECOND}});
    const logFile = path.join(controller, 'test-output', 'placement', 'held-lab.log');
    await assertRunnerFreeOfLock(logFile);
    assert.deepEqual(labLock.calls(), ['-w 90 9', '-n 8'],
      'the machine-wide lock, waited for no longer than the shard budget, then the checkout ' +
        'lock inside it');
    const shell = Number(/^placement-shell=(\d+)$/mu.exec(fs.readFileSync(logFile, 'utf8'))[1]);
    const record = JSON.parse(fs.readFileSync(labLock.holder, 'utf8'));
    assert.deepEqual(Object.keys(record), HOLDER_FIELDS, 'the holder record has all eight fields');
    assert.deepEqual({...record, startedAt: null}, {project: 'lagrange',
      agent: 'claude:placement-witness', controller: os.hostname(), purpose: 'test:cpu-heavy',
      sha, startedAt: null, expectedMinutes: 2, pid: shell},
    'written by the lab shell that holds the lock, from the shard\'s own estimate');
    assert.match(record.startedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u);
    assert.equal(lockIsFree(labLock.lock), false, 'held while the shard runs');
    await waitForNonEmptyFile(worktreeTap(parent, 'held', GATE_TEST));
    running.stop();
    assert.equal((await running.done).reason, 'interrupted');
    assert.equal(fs.existsSync(labLock.holder), false, 'a stopped shard removes its record');
    assert.equal(lockIsFree(labLock.lock), true, 'and frees the machine');

    const long = await start([FAST_TEST], {runId: 'long',
      holder: {purpose: 'test:ordinary', expectedMs: 10 * 60 * MINUTE}}).done;
    assert.equal(long.status, 0, long.log + long.errors);
    assert.equal(labLock.calls().at(-2), `-w ${LOCK_WAIT_CAP_SECONDS} 9`,
      'a shard of hours still waits no longer than the lab\'s cap');
    assert.equal(fs.existsSync(labLock.holder), false, 'a finished shard removes its record');
  });

test('a lab shard finding the machine held waits its budget, then refuses naming the holder',
  async (t) => {
    const {start, node, machine, labLock} = labFixture(t);
    fs.mkdirSync(labLock.dir, {recursive: true});
    const other = await holdLock(t, labLock.lock);
    const record = `${JSON.stringify({...OTHER_HOLDER, pid: other.pid})}\n`;
    fs.writeFileSync(labLock.holder, record);
    const startedAt = Date.now();
    const busy = await start([FAST_TEST], {runId: 'busy',
      holder: {purpose: 'test:ordinary', expectedMs: 1500}}).done;
    assert.equal(busy.status, PLACEMENT_EXIT.BUSY, busy.log + busy.errors);
    assert.equal(labLock.calls()[0], '-w 2 9', 'a budget under two seconds waits two');
    assert.ok(Date.now() - startedAt >= 1900, 'it waited its budget before refusing');
    assert.ok(busy.log.split('\n').includes(`machine-lock-busy=${record.trim()}`),
      `and named who holds the machine: ${busy.log}`);
    assert.equal(fs.readFileSync(labLock.holder, 'utf8'), record,
      'the holder\'s own record is left exactly as it was');
    assert.deepEqual(leftovers(node), {worktrees: 1,
      refs: `${machine.repoHead} commit\trefs/lagrange-placement/old-run`,
      files: ['busy.bundle', 'old-run', 'old-run.bundle', 'old-run.files']},
    'its upload is retained without claiming a checkout or touching the other attempt');
    assert.match(git(node, 'bundle', 'list-heads',
      path.join(node, 'test-output', 'placement-worktrees', 'busy.bundle')),
    / HEAD$/mu, 'the actual uploaded Git bundle remains available');
  });

test('discovery keeps a machine another agent holds out of placement before it is tried', () => {
  const ready = {ready: true, missing: [], gaps: []};
  const cap = (machineLock) => ({repoPath: '/srv/lagrange', cpuSampleMs: 260,
    thermalEndpoint: PLANNING_ENDPOINT,
    thermalDecision: {outcome: 'READY', execution_policy: SENSOR_POLICY},
    nodeVersion: 'v22.22.3', repo: {head: 'c'.repeat(40)}, machineLock});
  const fleet = [
    {name: '(controller)', controller: true, capability: {cpuSampleMs: 200}, readiness: ready},
    {name: 'held', capability: cap({state: 'busy', holder: OTHER_HOLDER}), readiness: ready},
    {name: 'stale', capability: cap({state: 'stale-record', holder: OTHER_HOLDER,
      holderPidAlive: false}), readiness: ready},
    {name: 'free', capability: cap({state: 'free', holder: null}), readiness: ready},
  ];
  const nodes = Object.fromEntries(fleet.filter((entry) => !entry.controller)
    .map((entry) => [entry.name, {name: entry.name, ssh: `peer@${entry.name}`}]));
  assert.deepEqual(placementMachines(fleet, {nodes}).map((machine) => machine.name),
    ['stale', 'free'], 'a held machine is skipped; a stale record is evidence, not a lock');
});

// Six one-minute files over the controller, `b` and a slow `c` that the
// split leaves idle. A refusal on `b` never reassigns its files to `c`.
function busyFleetDeps(busyHosts) {
  const tried = [];
  const run = fakeDeps({
    planCosts: (files) => files.map((file) => ({file, ms: MINUTE, jobs: 1, lane: 'ordinary'})),
    discover: async () => ({fleet: fakeInventory().fleet,
      machines: [lab('b', 1), lab('c', 4)], record: async () => {}}),
    runRemote: (shard, options) => {
      tried.push({name: shard.machine.name, files: [...shard.files], options});
      const holder = busyHosts[shard.machine.name];
      return {done: Promise.resolve(holder === undefined ?
        {status: 0, log: shard.files.map((file) => `ok ${file} (1 assertions, 5ms)`).join('\n')} :
        {status: PLACEMENT_EXIT.BUSY,
          log: `placement-shell=1\nmachine-lock-busy=${holder ? JSON.stringify(holder) : ''}`})};
    },
  });
  return {...run, tried};
}

test('a held lab host is reported and its assigned shard remains unavailable',
  async () => {
    const six = MANY.slice(0, 6);
    const run = busyFleetDeps({b: OTHER_HOLDER});
    assert.equal(await runPlacedTestFiles(six, run.deps), PLACEMENT_EXIT.BUSY);
    assert.ok(run.calls.lines.includes(HOST_BUSY_LINE),
      `a typed placement outcome naming the holder: ${run.calls.lines.join('\n')}`);
    assert.deepEqual(run.tried.map((one) => one.name), ['b'],
      'the held host receives its one assignment');
    assert.deepEqual(run.tried[0].options.holder, {purpose: 'test:ordinary',
      expectedMs: 3.5 * MINUTE}, 'each shard tells others its lanes and its own estimate');
    assert.equal(run.calls.local.length, 1, 'the controller runs only its own shard');

    assert.deepEqual([...run.calls.local[0], ...run.tried[0].files].sort(), [...six].sort(),
      'every planned file was assigned exactly once');
  });

test('a hand lab run on a held host reports it and never counts its files as passed',
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-test-busy-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const {fleet} = fakeInventory();
    const lines = [];
    let given = null;
    const status = await runLabTest({
      plan: [{resourceClass: 'ordinary', files: [FAST_TEST], jobs: 4}],
      costs: [{file: FAST_TEST, ms: MINUTE, jobs: 4, lane: LANE.ORDINARY}],
      commit: {sha: 'a'.repeat(40), gitRoot: root, release: () => {}},
      on: 'alpha', root, write: (line) => lines.push(line),
    }, {
      discover: async () => ({fleet, machines: [{...lab('alpha', 1), cores: 12, memKiB: 1}]}),
      commitAt: () => 'a'.repeat(40),
      runRemote: (shard, options) => {
        given = options;
        options.onLine(`machine-lock-busy=${JSON.stringify(OTHER_HOLDER)}`, 'out');
        return {done: Promise.resolve({status: PLACEMENT_EXIT.BUSY, log: '', errors: ''})};
      },
    });
    assert.ok(lines.includes('placement: host-busy alpha held-by codex:task-7 since ' +
      '2026-09-23T10:00:00Z'), lines.join('\n'));
    assert.equal(status, 1, 'a file never run is never a pass');
    assert.equal(given.holder.purpose, 'test:ordinary', 'the share names its lanes');
  });

// ---------------------------------------------------------------------------
// The hand verb: `lab test <profile> --lane <lane> [--on NAME] [--sha COMMIT]
// [--split]` sends the exact commit through the same shard path, streams each
// file's verdict as it lands, and prints the runner's own summary.

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

test('a lab machine generates the placed commit\'s import graph before its files run',
  async (t) => {
    const fixture = labFixture(t);
    const {start, sha, env} = fixture;
    const ran = await start([FAST_TEST], {runId: 'graph'}).done;
    assert.equal(ran.status, 0, ran.log + ran.errors);
    assert.match(ran.errors, new RegExp(`^producer --refresh-import-graph-only at ${sha}$`, 'mu'),
      'its own producer, in the worktree at the placed commit');
    assert.match(ran.log, /^placement-prepared=import-graph$/mu);
    assert.ok(ran.log.indexOf('placement-prepared=') < ran.log.indexOf('placement-pid='),
      'before the runner starts');
    env.PRODUCER_FAILS = '1';
    const failed = await start([FAST_TEST], {runId: 'graph-failed'}).done;
    assert.equal(failed.status, PLACEMENT_EXIT.SETUP, 'a graph it cannot make is a setup failure');
    assert.match(failed.errors, /placement: the import graph could not be generated/u);
    assertRetainedRemoteAttempt(fixture, 'graph-failed', sha, [FAST_TEST]);
    delete env.PRODUCER_FAILS;
    env.PRODUCER_REWRITES = 'README.md';
    const stale = await start([FAST_TEST], {runId: 'graph-stale'}).done;
    assert.equal(stale.status, PLACEMENT_EXIT.SETUP,
      'a producer that rewrites tracked metadata is a setup failure, as in the gate');
    // Git porcelain retains both index/worktree status columns in the diagnostic.
    assert.match(stale.errors,
      /^placement: the commit's generated metadata is stale; regenerate and commit {2}M README\.md$/mu);
    assert.doesNotMatch(stale.log, /placement-pid=/u, 'no runner started');
    assertRetainedRemoteAttempt(fixture, 'graph-stale', sha, [FAST_TEST]);
    assertRetainedRemoteAttempt(fixture, 'graph-failed', sha, [FAST_TEST]);
    assertEarlierPlacement(fixture);
  });

test('the change proof\'s sealed-graph precondition holds in a lab machine\'s checkout',
  async (t) => {
    const {start} = labFixture(t, {realProducer: true});
    const ran = await start([SEALED_GRAPH_TEST, LINK_UNIVERSE_TEST], {runId: 'sealed'}).done;
    assert.equal(ran.status, 0, ran.log + ran.errors);
    assert.match(ran.log, new RegExp(`^ok ${SEALED_GRAPH_TEST} `, 'mu'));
    assert.match(ran.log, /^placement-link=tools\/alloy-6\.2\.0$/mu, 'a model checker is linked');
    assert.match(ran.log, new RegExp(`^ok ${LINK_UNIVERSE_TEST} `, 'mu'), 'and no candidate');
  });

test('a lab checkout without its required producer refuses before starting the runner',
  async (t) => {
    const fixture = labFixture(t);
    const {controller, start} = fixture;
    git(controller, 'rm', '-q', IMPORT_GRAPH_PRODUCER);
    git(controller, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'missing required producer');
    const sha = git(controller, 'rev-parse', 'HEAD');
    const ran = await start([FAST_TEST], {sha, runId: 'missing-producer'}).done;
    assert.match(ran.log, new RegExp(`^placement-head=${sha}$`, 'mu'),
      'the actual shell prepared the deliberately missing-producer commit');
    assert.equal(ran.status, PLACEMENT_EXIT.SETUP,
      'the declared producer is required for remote exact-checkout preparation');
    assert.match(ran.errors, new RegExp('placement: required import-graph producer unavailable: ' +
      IMPORT_GRAPH_PRODUCER, 'u'));
    assert.doesNotMatch(ran.log, /placement-pid=/u, 'no classified runner started');
    assert.doesNotMatch(ran.log, /^(?:not )?ok test\//mu, 'no file verdict was produced');
    assertRetainedRemoteAttempt(fixture, 'missing-producer', sha, [FAST_TEST]);
    assertEarlierPlacement(fixture);
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

test('a split lab run spreads its files by cost and merges what each ran', async (t) => {
  const {controller, machine, sha, env} = labFixture(t);
  fs.symlinkSync(path.join(process.cwd(), 'node_modules'),
    path.join(controller, 'node_modules'));
  const {fleet} = fakeInventory();
  fleet[0].capability.thermalEndpoint = machine.thermalEndpoint;
  const lab = {...machine, controller: false, speed: 0.5, cores: 12, memKiB: 1024 * 1024,
    avoid: []};
  const lines = [];
  const deps = {...labTestDeps({root: controller, env}),
    discover: async () => ({fleet, machines: [lab]}), controllerHeadroom: () => ({fit: true})};
  // Four minutes serial there finishes before here; a minute's share of the
  // ordinary lane finishes here first.
  const costs = [{file: FAST_TEST, ms: 4 * MINUTE, jobs: 1},
    {file: OTHER_FAST_TEST, ms: 4 * MINUTE, jobs: 4}];
  const plan = [
    {resourceClass: LANE.ORDINARY, files: [OTHER_FAST_TEST], jobs: 4},
    {resourceClass: LANE.EXCLUSIVE, files: [FAST_TEST], jobs: 1},
  ];
  const commit = labTestCommit({root: controller});
  t.after(() => commit.release());
  assert.equal(commit.sha, sha);
  const status = await runLabTest({plan, commit, costs, split: true, root: controller,
    write: (line) => lines.push(line)}, deps);
  assert.equal(status, 0, lines.join('\n'));
  assert.ok(lines.includes('lab test: lab: exclusive (1 files) cores=12 mem=1.0GiB speed x0.50 ' +
  '~2.5 min'), lines.join('\n'));
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

  // A controller whose tree is not exactly the commit takes no share, and
  // a file only it could take is refused.
  const other = {sha: 'f'.repeat(40), gitRoot: controller, release: () => {}};
  const elsewhere = [];
  const stubbed = {...deps, runRemote: () => ({done: Promise.resolve({status: 0, log: '',
    errors: ''})})};
  await runLabTest({plan, commit: other, costs, split: true, root: controller,
    write: (line) => elsewhere.push(line)}, stubbed);
  assert.ok(elsewhere.includes('lab test: skipped (controller): the controller runs its ' +
  `lanes in this tree, which is not exactly ${'f'.repeat(40)}`), elsewhere.join('\n'));
  await assert.rejects(runLabTest({plan, commit: other, split: true, root: controller,
    costs: costs.map((cost) => ({...cost, ms: 20 * MINUTE})), write: () => {}}, stubbed),
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

// A hand lab run keeps what ran: the typed outcome is reported, its results
// ledger comes back, and the files it never ran are failures, never passes.
test('a hand lab run on a host too hot reports it and keeps the ledger of what ran',
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-test-thermal-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const {fleet} = fakeInventory();
    const labMachine = {...lab('alpha', 1), cores: 12, memKiB: 1024 * 1024};
    const lines = [];
    const status = await runLabTest({
      plan: [{resourceClass: LANE.ORDINARY, files: [FAST_TEST, OTHER_FAST_TEST], jobs: 4}],
      costs: [FAST_TEST, OTHER_FAST_TEST].map((file) =>
        ({file, ms: MINUTE, jobs: 4, lane: LANE.ORDINARY})),
      commit: {sha: 'a'.repeat(40), gitRoot: root, release: () => {}},
      on: 'alpha', root, write: (line) => lines.push(line),
    }, {
      discover: async () => ({fleet, machines: [labMachine]}),
      commitAt: () => 'a'.repeat(40),
      runRemote: (shard, options) => {
        const ran = labRunnerLog([shard.files[0]], false).log.split('\n');
        const refused = labRunnerLog([shard.files[1]], true).log.split('\n');
        for (const line of [...ran, ...refused,
          `placement-results={"file":"${shard.files[0]}","ok":true}`]) {
          options.onLine(line, 'out');
        }
        return {done: Promise.resolve({status: 75, log: '', errors: ''})};
      },
    });
    assert.equal(status, 1, 'a file never run is never a pass');
    assert.ok(lines.includes('placement: host-thermal-unfit alpha'), lines.join('\n'));
    const copied = fs.readFileSync(path.join(root, 'test-output', 'reports',
      'test-results-alpha.ndjson'), 'utf8');
    assert.equal(copied, `{"file":"${FAST_TEST}","ok":true}\n`, 'the ledger keeps what ran');
    assert.ok(lines.includes('lab test: alpha: # test-files total=2 pass=1 fail=1 ' +
      'assertions=1'), lines.join('\n'));
  });

function assertOriginalPlacementBytes(fixture, checkout) {
  assert.ok(fs.existsSync(checkout), `original checkout retained at ${checkout}`);
  assert.equal(fs.readFileSync(path.join(checkout, CUSTODY_TAP), 'utf8'), CUSTODY_TAP_BYTES,
    'the exact original stdout artifact survives');
  assert.equal(fs.readFileSync(path.join(checkout, CUSTODY_STDERR), 'utf8'), CUSTODY_STDERR_BYTES,
    'the exact original stderr artifact survives');
  const registered = git(fixture.node, 'worktree', 'list', '--porcelain');
  assert.ok(registered.includes(`worktree ${fs.realpathSync(checkout)}\n`),
    `the retained checkout remains registered: ${registered}`);
}

for (const status of [0, 42]) {
  test(`remote cleanup retains a real locked checkout after child exit ${status}`,
    {timeout: 2 * MINUTE}, async (t) => {
      const fixture = custodyShardFixture(t, {status, lock: true});
      const runId = `locked-custody-${status}`;
      const checkout = path.join(fixture.parent, runId);
      const started = fixture.start(runId);
      t.after(() => started.abort());
      const outcome = await started.done;
      const detail = `${outcome.log}\n${outcome.errors}`;
      assert.match(outcome.log, new RegExp(`^placement-head=${fixture.sha}$`, 'mu'), detail);
      assert.match(outcome.log, new RegExp(`^custody-child-head=${fixture.sha}$`, 'mu'), detail);
      assert.ok(outcome.log.includes(`custody-child-input=${JSON.stringify(`${FAST_TEST}\n`)}`),
        'the finite child consumed the actual assigned input');
      assert.match(outcome.log, /^custody-child-locked=.+$/mu, detail);
      assert.match(outcome.log, new RegExp(`^custody-child-exit=${status}$`, 'mu'), detail);
      assert.equal(outcome.status, status === 0 ? PLACEMENT_EXIT.SETUP : status,
        `cleanup cannot turn a refusal into green or replace an earlier exit: ${detail}`);
      assertOriginalPlacementBytes(fixture, checkout);
      assert.ok(detail.includes(checkout), 'the owner names the actual retained checkout');
      if (status === 0) {
        assert.match(detail, /placement: cleanup unavailable/u,
          'ordinary success becomes unavailable when canonical Git removal refuses');
        assert.match(detail, /locked/u, 'the original Git refusal remains visible');
      } else {
        assert.match(detail, /placement: retained original checkout/u,
          'a failed execution retains evidence without another removal attempt');
      }
    });
}

test('a new remote assignment cannot purge a retained sibling checkout or its inputs',
  {timeout: 2 * MINUTE}, async (t) => {
    const fixture = custodyShardFixture(t, {status: 0, lock: false});
    const retainedId = 'retained-original-failure';
    const checkout = path.join(fixture.parent, retainedId);
    const retainedRef = `refs/lagrange-placement/${retainedId}`;
    git(fixture.node, 'worktree', 'add', '--detach', '--quiet', checkout, fixture.basis);
    fs.mkdirSync(path.dirname(path.join(checkout, CUSTODY_TAP)), {recursive: true});
    fs.writeFileSync(path.join(checkout, CUSTODY_TAP), CUSTODY_TAP_BYTES);
    fs.writeFileSync(path.join(checkout, CUSTODY_STDERR), CUSTODY_STDERR_BYTES);
    git(fixture.node, 'worktree', 'lock', '--reason', 'retained original failure', checkout);
    git(fixture.node, 'update-ref', retainedRef, fixture.basis);
    const input = `${FAST_TEST}\n`;
    fs.writeFileSync(`${checkout}.files`, input);
    git(fixture.node, 'bundle', 'create', `${checkout}.bundle`, 'HEAD^..HEAD');
    const bundle = fs.readFileSync(`${checkout}.bundle`);
    const started = fixture.start('later-clean-assignment');
    t.after(() => started.abort());
    const outcome = await started.done;
    assert.equal(outcome.status, 0, `${outcome.log}\n${outcome.errors}`);
    assert.match(outcome.log, /^custody-child-exit=0$/mu,
      'the later real assignment completed its finite child');
    assert.equal(fs.existsSync(path.join(fixture.parent, 'later-clean-assignment')), false,
      'successful cleanup still removes its own checkout');
    assertOriginalPlacementBytes(fixture, checkout);
    assert.equal(git(fixture.node, 'rev-parse', retainedRef), fixture.basis,
      'the earlier source reference is outside this run\'s cleanup ownership');
    assert.equal(fs.readFileSync(`${checkout}.files`, 'utf8'), input,
      'the earlier exact assigned input remains');
    assert.deepEqual(fs.readFileSync(`${checkout}.bundle`), bundle,
      'the earlier real Git bundle remains byte-identical');
  });

test('a colliding controller attempt refuses before overwriting its original inputs or logs',
  {timeout: 2 * MINUTE}, async (t) => {
    const fixture = custodyShardFixture(t, {status: 0, lock: false});
    const runId = 'existing-controller-attempt';
    const local = path.join(fixture.controller, 'test-output', 'placement', `${runId}-lab`);
    fs.mkdirSync(path.dirname(local), {recursive: true});
    for (const suffix of ['.log', '.err', '.sh']) {
      fs.writeFileSync(local + suffix, `original ${suffix} bytes\n`);
    }
    git(fixture.controller, 'bundle', 'create', `${local}.bundle`, 'HEAD^..HEAD');
    const originals = new Map(['.log', '.err', '.sh', '.bundle']
      .map((suffix) => [local + suffix, fs.readFileSync(local + suffix)]));
    const started = fixture.start(runId);
    t.after(() => started.abort());
    const outcome = await started.done;
    const detail = `${outcome.reason || ''}\n${outcome.log}\n${outcome.errors}`;
    assert.equal(outcome.status, PLACEMENT_EXIT.SETUP, detail);
    assert.match(detail, /placement: unavailable - attempt already exists:/u);
    assert.ok([...originals.keys()].some((file) => detail.includes(file)),
      'the refusal names an actual colliding path');
    assert.doesNotMatch(outcome.log || '', /placement-shell=|custody-child-exit=/u,
      'the collision refuses before any remote shell or runner is started');
    for (const [file, bytes] of originals) {
      assert.ok(fs.existsSync(file), `unacquired original remains at ${file}`);
      assert.deepEqual(fs.readFileSync(file), bytes, `original bytes unchanged at ${file}`);
    }
  });

test('a colliding remote attempt preserves its unacquired checkout, source and inputs',
  {timeout: 2 * MINUTE}, async (t) => {
    const fixture = custodyShardFixture(t, {status: 0, lock: false});
    const runId = 'existing-remote-attempt';
    const checkout = path.join(fixture.parent, runId);
    const ref = `refs/lagrange-placement/${runId}`;
    git(fixture.node, 'worktree', 'add', '--detach', '--quiet', checkout, fixture.basis);
    fs.mkdirSync(path.dirname(path.join(checkout, CUSTODY_TAP)), {recursive: true});
    fs.writeFileSync(path.join(checkout, CUSTODY_TAP), CUSTODY_TAP_BYTES);
    fs.writeFileSync(path.join(checkout, CUSTODY_STDERR), CUSTODY_STDERR_BYTES);
    git(fixture.node, 'worktree', 'lock', '--reason', 'original colliding attempt', checkout);
    git(fixture.node, 'update-ref', ref, fixture.basis);
    fs.writeFileSync(`${checkout}.files`, `${OTHER_FAST_TEST}\n`);
    git(fixture.node, 'bundle', 'create', `${checkout}.bundle`, 'HEAD^..HEAD');
    const bundle = fs.readFileSync(`${checkout}.bundle`);
    const started = fixture.start(runId);
    t.after(() => started.abort());
    const outcome = await started.done;
    const detail = `${outcome.reason || ''}\n${outcome.log}\n${outcome.errors}`;
    assert.equal(outcome.status, PLACEMENT_EXIT.SETUP, detail);
    assert.match(detail, /placement: unavailable - attempt already exists:/u);
    assert.ok(detail.includes(checkout), 'the refusal identifies the colliding remote scope');
    assert.doesNotMatch(outcome.log || '', /custody-child-exit=/u,
      'no runner executes against an unacquired checkout');
    assertOriginalPlacementBytes(fixture, checkout);
    assert.equal(git(fixture.node, 'rev-parse', ref), fixture.basis,
      'the old source ref is not advanced to the incoming candidate');
    assert.equal(fs.readFileSync(`${checkout}.files`, 'utf8'), `${OTHER_FAST_TEST}\n`);
    assert.deepEqual(fs.readFileSync(`${checkout}.bundle`), bundle,
      'upload admission cannot overwrite the earlier real bundle');
  });

for (const preparation of [true, false]) {
  test(preparation ? 'remote cancellation owns the live producer group and forbids later runner' :
    'remote cancellation closes a TERM-ignoring runner and descendant before done',
  {timeout: 2 * MINUTE}, async (t) => {
    const run = startRemoteCancellationFixture(t, {preparation});
    await waitForRemoteMarker(run, run.ready);
    if (!preparation) await waitForRemoteMarker(run, run.descendantReady);
    const phase = ownedPhaseMarker(run, run.ready);
    const descendant = preparation ? null : ownedPhaseMarker(run, run.descendantReady);
    const transport = JSON.parse(fs.readFileSync(run.transport, 'utf8'));
    assert.equal(transport.marker, run.transport);
    const shellPid = Number(/^placement-shell=(\d+)$/mu
      .exec(fs.readFileSync(run.logFile, 'utf8'))?.[1]);
    const shell = nativeIdentity(shellPid);
    assert.ok(shell, 'the actual remote shell remains live at interruption');
    assert.equal(shell.group, transport.remotePid, 'the real shell is in the acquired SSH session');
    assert.equal(shell.session, transport.remotePid);
    assert.equal(phase.parent, shell.pid, 'the remote shell acquired the active phase');
    const live = nativeIdentity(phase.pid);
    assert.ok(live && !live.state.startsWith('Z'), 'cancellation targets a live phase');
    assert.equal(live.group, phase.group);
    assert.equal(live.session, phase.session);
    const startedAt = Date.now();
    run.started.abort();
    const outcome = await joinRemoteFixture(run);
    const elapsed = Date.now() - startedAt;
    assert.equal(outcome.status, PLACEMENT_EXIT.TERMINATED,
      `the actual interruption survives cleanup: ${JSON.stringify(outcome)}`);
    assert.equal(outcome.reason, 'interrupted');
    assert.ok(elapsed < REMOTE_CLOSE_MS, `the existing shell-close envelope is kept: ${elapsed}ms`);
    assert.equal(phase.group, phase.pid, 'the phase owns its acquired process group');
    assert.notEqual(phase.group, shell.group, 'the phase group is independent of the remote shell');
    assert.notEqual(phase.group, transport.client.group,
      'a controller wrapper cut cannot masquerade as phase cancellation');
    assert.equal(fs.readFileSync(run.ack, 'utf8'), 'SIGTERM',
      'the active phase actually received cancellation');
    assert.equal(fs.existsSync(run.normal), false, 'natural completion did not close the phase');
    assert.deepEqual(liveGroupMembers(phase), [], 'no live phase-group member remains at done');
    assertOriginalPlacementBytes(run.fixture, run.checkout);
    if (preparation) {
      assert.equal(fs.existsSync(run.admitted), false, 'the runner was never admitted');
      assert.doesNotMatch(outcome.log, /placement-pid=/u, 'no later runner group was acquired');
    } else {
      assert.equal(descendant.pid, phase.descendant, 'the marker identifies the acquired descendant');
      assert.equal(descendant.parent, phase.pid);
      assert.equal(descendant.group, phase.group);
      assert.equal(descendant.session, phase.session);
      assert.equal(fs.readFileSync(run.descendantAck, 'utf8'), 'SIGTERM');
      assert.equal(fs.existsSync(run.descendantNormal), false,
        'the descendant did not disappear by reaching its own natural ceiling');
    }
  });
}
