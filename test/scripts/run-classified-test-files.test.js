import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  lastResultsRoots,
  orderLaneFiles,
  planClassifiedTestFiles,
  runClassifiedTestFiles,
} from '../../scripts/run-classified-test-files.js';
import {
  RESOURCE_CLASS_EXCLUSIVE,
  RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
  RESOURCE_CLASS_JOBS,
  RESOURCE_CLASS_ORDINARY,
} from '../../scripts/checks/test-resource-classification-constants.js';

const root = process.cwd();
const ORDINARY = 'test/address/address-manager.test.js';
const TOOLCHAIN = 'test/examples/service-compiler-account-summary-parity.test.js';
const INTEGRATION = 'test/integration/admin-cdc-propagation.integration.test.js';
const BOOTSTRAP = 'test/bootstrap/_min-test.test.js';
const BOOTSTRAP_LANE = 'bootstrap';
const SHARED_OUTPUT =
  'test/scripts/exact-election-evidence-same-turn-model-contract.test.js';
const UTF8 = 'utf8';
// Readings go in through the thermal owner's own reader: an lm-sensors
// document (`sensors -j`) and a sysfs root. A cool machine lets every batch
// run, so these witnesses never wait on this machine's real temperature.
function sensorsJson(cpuCelsius, nvmeCelsius) {
  return {
    'coretemp-isa-0000': {'Package id 0': {temp1_input: cpuCelsius}},
    'nvme-pci-0200': {'Composite': {temp1_input: 20}, 'Sensor 2': {temp3_input: nvmeCelsius}},
  };
}
const COOL = Object.freeze({
  thermalSources: Object.freeze({sensors: () => sensorsJson(40, 50)}),
});

test('one classified plan owns concurrency for every test source', () => {
  const plan = planClassifiedTestFiles(root,
    [SHARED_OUTPUT, INTEGRATION, TOOLCHAIN, ORDINARY], []);
  const byClass = Object.fromEntries(plan.map((lane) =>
    [lane.resourceClass, lane]));

  assert.deepEqual(byClass[RESOURCE_CLASS_ORDINARY].files, [ORDINARY]);
  assert.equal(byClass[RESOURCE_CLASS_ORDINARY].jobs,
    RESOURCE_CLASS_JOBS[RESOURCE_CLASS_ORDINARY]);
  assert.deepEqual(byClass[RESOURCE_CLASS_EXTERNAL_TOOLCHAIN].files,
    [TOOLCHAIN]);
  assert.equal(byClass[RESOURCE_CLASS_EXTERNAL_TOOLCHAIN].jobs, 1);
  assert.deepEqual(byClass[RESOURCE_CLASS_EXCLUSIVE].files,
    [INTEGRATION, SHARED_OUTPUT].sort());
  assert.equal(byClass[RESOURCE_CLASS_EXCLUSIVE].jobs, 1);
});

test('the executor runs classified lanes serially with their owned budgets', () => {
  const calls = [];
  const status = runClassifiedTestFiles(
    [INTEGRATION, TOOLCHAIN, ORDINARY], {
      ...COOL,
      root,
      spawn(command, args, options) {
        calls.push({args, command, tapTimeout: options.env.TAP_TIMEOUT,
          tapTimeoutFloor: options.env.TAP_TIMEOUT_FLOOR});
        return {status: 0};
      },
    });

  assert.equal(status, 0);
  assert.deepEqual(calls.map((call) => call.args[1]),
    ['--jobs=4', '--jobs=1', '--jobs=1']);
  assert.deepEqual(calls.map((call) => call.args.at(-1)),
    [ORDINARY, TOOLCHAIN, INTEGRATION]);
  // The exclusive lane advises a floor and never sets TAP_TIMEOUT itself:
  // the runner owns the final value and lifts it to a file's declared
  // budget, so a 480s declaration is never cut to the lane default. The
  // ambient TAP_TIMEOUT and TAP_TIMEOUT_FLOOR (both unset locally; ci.yml
  // and release.yml export TAP_TIMEOUT_FLOOR='120') flow through every
  // lane unchanged — assert against them, not against fixed values, so the
  // test is hermetic under the CI lane's environment.
  assert.equal(calls[2].tapTimeout, process.env.TAP_TIMEOUT);
  assert.equal(calls[0].tapTimeout, process.env.TAP_TIMEOUT);
  assert.equal(calls[2].tapTimeoutFloor, '120');
  assert.equal(calls[0].tapTimeoutFloor, process.env.TAP_TIMEOUT_FLOOR);
});

// Keep-going is the one policy (process change 2026-09-23): a red batch never
// ends the run, so a gate, npm test, the local corpus and a placed shard all
// report every red file in one pass; the exit status is still the first
// failure. Fail-fast is the explicit opt-in, for a hand-run that wants the
// first red and nothing else.
test('every batch runs by default; fail-fast is the explicit opt-in', () => {
  const failing = ORDINARY;
  const spawnFailingOrdinary = (calls) => (command, args) => {
    calls.push(args.at(-1));
    return {status: args.at(-1) === failing ? 3 : 0};
  };

  const defaultCalls = [];
  const defaultStatus = runClassifiedTestFiles([INTEGRATION, ORDINARY],
    {...COOL, root, spawn: spawnFailingOrdinary(defaultCalls)});
  assert.equal(defaultStatus, 3, 'the first failure is still the exit status');
  assert.deepEqual(defaultCalls, [ORDINARY, INTEGRATION],
    'a red ordinary batch never hides the exclusive lane');

  const failFastCalls = [];
  const failFastStatus = runClassifiedTestFiles([INTEGRATION, ORDINARY],
    {...COOL, root, failFast: true, spawn: spawnFailingOrdinary(failFastCalls)});
  assert.equal(failFastStatus, 3);
  assert.deepEqual(failFastCalls, [ORDINARY],
    'fail-fast, asked for, stops at the first red batch');

  assert.throws(() => runClassifiedTestFiles([ORDINARY],
    {root, failFast: 'yes', spawn: () => ({status: 0})}),
  /own-data options record/u);
});

// failed-gate-keeps-evidence: a reader of this stream calls a run complete
// only when summaries cover every planned file, so the plan is written before
// any batch, and a batch ended by a signal (an OOM kill) says so - its files
// may have no verdict, and the run keeps going.
test('the run states its plan and a batch ended by a signal', () => {
  const lines = [];
  const calls = [];
  const status = runClassifiedTestFiles([INTEGRATION, ORDINARY], {...COOL, root,
    write: (text) => lines.push(text),
    spawn(command, args) {
      calls.push(args.at(-1));
      return args.at(-1) === ORDINARY ? {status: null, signal: 'SIGKILL'} : {status: 0};
    }});
  assert.equal(status, 1, 'a signalled batch is a failed batch');
  assert.deepEqual(calls, [ORDINARY, INTEGRATION], 'and the run keeps going');
  assert.equal(lines[0], '# test-files planned=2\n', 'the plan comes first');
  assert.ok(lines.includes(
    '# test-files batch ended by SIGKILL: 1 file(s) may have no verdict\n'), lines.join(''));
});

// The same policy through the real runner: two red files in two batches (the
// ordinary and the exclusive lane) are both reported, by name, in one run.
test('two red files in different batches are both reported', (t) => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'lagrange-classified-keep-going-'));
  t.after(() => fs.rmSync(fixtureRoot, {recursive: true, force: true}));
  const redOrdinary = 'test/unit/red-ordinary.test.js';
  const redExclusive = 'test/integration/red-exclusive.integration.test.js';
  const redSource = 'import {test} from \'node:test\';\n' +
    'test(\'red\', () => { throw new Error(\'red on purpose\'); });\n';
  for (const file of [redOrdinary, redExclusive]) {
    fs.mkdirSync(path.dirname(path.join(fixtureRoot, file)), {recursive: true});
    fs.writeFileSync(path.join(fixtureRoot, file), redSource);
  }
  const plan = planClassifiedTestFiles(fixtureRoot, [redOrdinary, redExclusive], []);
  assert.deepEqual(plan.map((lane) => lane.files),
    [[redOrdinary], [redExclusive]], 'the two files run in different batches');

  let output = '';
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  delete env.LAGRANGE_RETRY_FAILED_ONCE;
  const status = runClassifiedTestFiles([redOrdinary, redExclusive], {
    ...COOL,
    root: fixtureRoot,
    env,
    spawn(command, args, options) {
      const result = spawnSync(command,
        [path.join(root, args[0]), ...args.slice(1)],
        {...options, stdio: 'pipe', encoding: UTF8, timeout: 60000});
      output += result.stdout;
      return result;
    },
  });
  assert.notEqual(status, 0, 'the run is red');
  assert.match(output, new RegExp(`^not ok ${redOrdinary} `, 'mu'));
  assert.match(output, new RegExp(`^not ok ${redExclusive} `, 'mu'),
    'the second batch ran and its red is reported too');
});

test('the classified plan fails closed on duplicates and unknown paths', () => {
  assert.throws(() => planClassifiedTestFiles(root, [ORDINARY, ORDINARY]),
    /duplicate/u);
  assert.throws(() => planClassifiedTestFiles(
    root, ['test/not-present.test.js']), /unclassified or missing/u);
});

test('inherited classifications cannot admit an unknown executable path', () => {
  const unknown = 'test/not-present.test.js';
  try {
    Reflect.defineProperty(Object.prototype, unknown, {
      configurable: true,
      enumerable: true,
      value: RESOURCE_CLASS_ORDINARY,
    });
    assert.throws(() => planClassifiedTestFiles(root, [unknown]),
      /unclassified or missing/u);
  } finally {
    Reflect.deleteProperty(Object.prototype, unknown);
  }
});

test('inherited runner options cannot replace the root or child launcher', () => {
  let calls = 0;
  try {
    Reflect.defineProperty(Object.prototype, 'root', {
      configurable: true,
      value: '/not-the-repository',
    });
    const status = runClassifiedTestFiles([ORDINARY], {
      ...COOL,
      spawn() {
        calls += 1;
        return {status: 0};
      },
    });
    assert.equal(status, 0);
    assert.equal(calls, 1,
      'an inherited root must not redirect classification');
  } finally {
    Reflect.deleteProperty(Object.prototype, 'root');
  }

  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'lagrange-classified-runner-'));
  const fixture = 'test/fixture.test.js';
  let inheritedCalls = 0;
  try {
    fs.mkdirSync(path.join(fixtureRoot, 'test'), {recursive: true});
    fs.mkdirSync(path.join(fixtureRoot, 'scripts'), {recursive: true});
    fs.writeFileSync(path.join(fixtureRoot, fixture), '');
    fs.writeFileSync(path.join(fixtureRoot, 'scripts', 'run-test-files.js'), '');
    Reflect.defineProperty(Object.prototype, 'spawn', {
      configurable: true,
      value() {
        inheritedCalls += 1;
        return {status: 0};
      },
    });
    assert.equal(runClassifiedTestFiles([fixture], {...COOL, root: fixtureRoot}), 0);
    assert.equal(inheritedCalls, 0,
      'an inherited launcher must not replace the real child process');
  } finally {
    Reflect.deleteProperty(Object.prototype, 'spawn');
    fs.rmSync(fixtureRoot, {recursive: true, force: true});
  }
});

test('runner option accessors are rejected without execution', () => {
  let getterReads = 0;
  const options = {root};
  Reflect.defineProperty(options, 'spawn', {
    configurable: true,
    enumerable: true,
    get() {
      getterReads += 1;
      return () => ({status: 0});
    },
  });
  assert.throws(() => runClassifiedTestFiles([ORDINARY], options),
    /own-data options/u);
  assert.equal(getterReads, 0);
});

test('post-import collection replacement cannot erase executable delivery', () => {
  const source = `
    import {runClassifiedTestFiles} from './scripts/run-classified-test-files.js';
    const input = '${ORDINARY}';
    const replacements = [
      ['array-filter', Array.prototype, 'filter', function filter() { return []; }],
      ['array-map', Array.prototype, 'map', function map() { return []; }],
      ['array-push', Array.prototype, 'push', function push() { return this.length; }],
      ['array-slice', Array.prototype, 'slice', function slice() { return []; }],
      ['array-sort', Array.prototype, 'sort', function sort() { return []; }],
      ['array-iterator', Array.prototype, Symbol.iterator, function iterator() {
        return {next: () => ({done: true})};
      }],
      ['object-from-entries', Object, 'fromEntries', () => ({})],
      ['set-has', Set.prototype, 'has', () => true],
      ['set-iterator', Set.prototype, Symbol.iterator, function iterator() {
        return {next: () => ({done: true})};
      }],
      ['map-get', Map.prototype, 'get', () => 'occupied'],
      ['map-set', Map.prototype, 'set', function set() { return this; }],
    ];
    const outcomes = [];
    for (let index = 0; index < replacements.length; index += 1) {
      const [name, owner, key, replacement] = replacements[index];
      const original = owner[key];
      const calls = [];
      try {
        Reflect.set(owner, key, replacement);
        const status = runClassifiedTestFiles([input], {
          thermalSources: {sensors: () => ({'coretemp-isa-0000':
            {'Package id 0': {temp1_input: 40}}})},
          root: process.cwd(),
          spawn(command, args) {
            calls[calls.length] = {command, args};
            return {status: 0};
          },
        });
        outcomes[outcomes.length] = {calls, name, status};
      } catch (error) {
        outcomes[outcomes.length] = {error: error.message, name};
      } finally {
        Reflect.set(owner, key, original);
      }
    }
    process.stdout.write(JSON.stringify(outcomes));
  `;
  const result = spawnSync(process.execPath,
    ['--input-type=module', '--eval', source],
    {cwd: root, encoding: UTF8});
  assert.equal(result.status, 0, result.stderr);
  const outcomes = JSON.parse(result.stdout.split('\n').at(-1));
  for (const outcome of outcomes) {
    if (outcome.error) continue;
    assert.equal(outcome.status, 0, outcome.name);
    assert.equal(outcome.calls.length, 1,
      `${outcome.name}: success must deliver the admitted test`);
    assert.equal(outcome.calls[0].args.at(-1), ORDINARY, outcome.name);
  }
  const filterOutcome = outcomes.find(({name}) => name === 'array-filter');
  assert.equal(filterOutcome.status, 0);
  assert.equal(filterOutcome.calls.length, 1,
    'the verifier falsifier must execute rather than merely fail closed');
});

test('the library refuses an empty explicit test set', () => {
  assert.throws(() => runClassifiedTestFiles([], {
    root,
    spawn() {
      throw new Error('an empty plan must fail before spawn');
    },
  }), /no test files/u);
});

// Dispatch order comes from the last results: red or unknown first, then
// longest-first on a parallel lane and shortest-first on a serial one. The
// set never changes; only the order and so the batch composition does.
function writeLastResult(resultsRoot, file, output) {
  const target = path.join(resultsRoot, '.tap/test-results', `${file}.tap`);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, output);
}

function withResultsRoot(run) {
  const resultsRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'lagrange-last-results-'));
  try {
    return run(resultsRoot);
  } finally {
    fs.rmSync(resultsRoot, {recursive: true, force: true});
  }
}

function writeMixedResults(resultsRoot) {
  writeLastResult(resultsRoot, 'test/a.test.js', 'ok 1 - a\n# time=100ms\n');
  writeLastResult(resultsRoot, 'test/b.test.js',
    'ok 1 - b # time=5.2ms\n# time=900.4ms\n');
  writeLastResult(resultsRoot, 'test/c.test.js',
    'not ok 1 - c # time=3ms\n# time=50ms\n');
  writeLastResult(resultsRoot, 'test/e.test.js', 'ok 1 - e # time=7ms\n');
  // A crash at import writes no TAP; the runner still appends its time.
  writeLastResult(resultsRoot, 'test/f.test.js', '# time=20ms\n');
}

const MIXED_FILES = Object.freeze(['test/a.test.js', 'test/b.test.js',
  'test/c.test.js', 'test/d.test.js', 'test/e.test.js', 'test/f.test.js']);

test('a parallel lane dispatches red and unknown files first, then longest-first', () => {
  withResultsRoot((resultsRoot) => {
    writeMixedResults(resultsRoot);
    assert.deepEqual(orderLaneFiles(MIXED_FILES, [resultsRoot], 4), [
      'test/c.test.js', 'test/d.test.js', 'test/e.test.js', 'test/f.test.js',
      'test/b.test.js', 'test/a.test.js',
    ]);
  });
});

test('a serial lane dispatches red and unknown files first, then shortest-first', () => {
  withResultsRoot((resultsRoot) => {
    writeMixedResults(resultsRoot);
    assert.deepEqual(orderLaneFiles(MIXED_FILES, [resultsRoot], 1), [
      'test/c.test.js', 'test/d.test.js', 'test/e.test.js', 'test/f.test.js',
      'test/a.test.js', 'test/b.test.js',
    ]);
  });
});

test('a fresh linked worktree reads the main checkout last results', () => {
  withResultsRoot((scratch) => {
    const main = path.join(scratch, 'main');
    const linked = path.join(scratch, 'linked');
    const gitDir = path.join(main, '.git', 'worktrees', 'linked');
    fs.mkdirSync(gitDir, {recursive: true});
    fs.mkdirSync(linked, {recursive: true});
    fs.writeFileSync(path.join(gitDir, 'commondir'), '../..\n');
    fs.writeFileSync(path.join(linked, '.git'), `gitdir: ${gitDir}\n`);
    assert.deepEqual(lastResultsRoots(linked), [linked, main]);
    assert.deepEqual(lastResultsRoots(main), [main],
      'a plain checkout reads only its own results');

    writeLastResult(main, 'test/a.test.js', 'ok 1 - a\n# time=100ms\n');
    writeLastResult(main, 'test/b.test.js', 'ok 1 - b\n# time=900ms\n');
    writeLastResult(linked, 'test/a.test.js', 'ok 1 - a\n# time=2000ms\n');
    assert.deepEqual(orderLaneFiles(['test/a.test.js', 'test/b.test.js'],
      lastResultsRoots(linked), 4), ['test/a.test.js', 'test/b.test.js'],
    'the worktree own result wins; the main checkout fills the gap');
  });
});

test('the classified plan keeps every lane set and orders it from the last results', () => {
  withResultsRoot((resultsRoot) => {
    writeLastResult(resultsRoot, INTEGRATION, 'ok 1 - i\n# time=100ms\n');
    writeLastResult(resultsRoot, SHARED_OUTPUT,
      'not ok 1 - s\n# time=10ms\n');
    const plan = planClassifiedTestFiles(root,
      [INTEGRATION, SHARED_OUTPUT, ORDINARY], [resultsRoot]);
    const byClass = Object.fromEntries(plan.map((lane) =>
      [lane.resourceClass, lane]));
    assert.deepEqual(byClass[RESOURCE_CLASS_EXCLUSIVE].files,
      [SHARED_OUTPUT, INTEGRATION], 'the previously red file dispatches first');
    assert.deepEqual(byClass[RESOURCE_CLASS_ORDINARY].files, [ORDINARY]);
    assert.throws(() => planClassifiedTestFiles(root, [ORDINARY], 'x'),
      /results roots/u);
  });
});

// The bootstrap class runs two-up in a lane of its own: cluster tests with
// wall-clock budgets, so never beside the ordinary lane, but measured over 13
// runs on three hosts to take contention at two workers without a failure.
// Integration and the convergence probes stay strictly serial - overlapping
// THEM reds five contention-sensitive SLOs, which is a different question.
test('the bootstrap class owns a two-worker lane, and the serial classes keep theirs', () => {
  const plan = planClassifiedTestFiles(root,
    [BOOTSTRAP, INTEGRATION, ORDINARY, SHARED_OUTPUT], []);
  const byLane = Object.fromEntries(plan.map((lane) => [lane.resourceClass, lane]));

  assert.deepEqual(byLane[BOOTSTRAP_LANE].files, [BOOTSTRAP],
    'a bootstrap file leaves the exclusive lane');
  assert.equal(byLane[BOOTSTRAP_LANE].jobs, 2, 'and runs two-up');
  assert.deepEqual(byLane[RESOURCE_CLASS_EXCLUSIVE].files,
    [INTEGRATION, SHARED_OUTPUT].sort(),
    'integration and the resource-exclusive file stay serial');
  assert.equal(byLane[RESOURCE_CLASS_EXCLUSIVE].jobs, 1);
  assert.deepEqual(byLane[RESOURCE_CLASS_ORDINARY].files, [ORDINARY]);

  // Order matters: the bootstrap lane runs before the serial one, so a
  // contention-free class never waits behind the longest lane in the corpus.
  const lanes = plan.map((lane) => lane.resourceClass);
  assert.ok(lanes.indexOf(BOOTSTRAP_LANE) < lanes.indexOf(RESOURCE_CLASS_EXCLUSIVE));
  assert.ok(lanes.indexOf(RESOURCE_CLASS_ORDINARY) < lanes.indexOf(BOOTSTRAP_LANE));
});

test('the bootstrap lane advises the cluster timeout floor, as the serial lane does', () => {
  const calls = [];
  const status = runClassifiedTestFiles([BOOTSTRAP, INTEGRATION, ORDINARY], {
    ...COOL,
    root,
    spawn(command, args, options) {
      calls.push({jobs: args[1], lane: args.at(-1),
        floor: options.env.TAP_TIMEOUT_FLOOR});
      return {status: 0};
    },
  });

  assert.equal(status, 0);
  const bootstrap = calls.find((call) => call.lane === BOOTSTRAP);
  assert.equal(bootstrap.jobs, '--jobs=2');
  assert.equal(bootstrap.floor, '120',
    'a bootstrap file keeps its cluster budget floor, two-up or not');
  const ordinary = calls.find((call) => call.lane === ORDINARY);
  assert.equal(ordinary.floor, process.env.TAP_TIMEOUT_FLOOR,
    'and the ordinary lane is untouched');
});

// The negative half of that assertion is vacuous wherever the environment
// already exports TAP_TIMEOUT_FLOOR - ci.yml, full-gate.yml and the canary all
// do, so a lane wrongly added to the floor list passes there (verifier round
// 1). Asserted against an environment with the ambient value removed, it bites
// everywhere.
test('no ordinary lane is given the cluster floor, ambient value or not', () => {
  const ambient = {...process.env};
  delete ambient.TAP_TIMEOUT_FLOOR;
  const floors = new Map();
  runClassifiedTestFiles([BOOTSTRAP, ORDINARY, TOOLCHAIN], {
    ...COOL,
    root,
    spawn(command, args, options) {
      floors.set(args.at(-1), options.env.TAP_TIMEOUT_FLOOR);
      return {status: 0};
    },
    env: ambient,
  });
  assert.equal(floors.get(BOOTSTRAP), '120');
  assert.equal(floors.get(ORDINARY), undefined,
    'the ordinary lane carries no floor of its own');
  assert.equal(floors.get(TOOLCHAIN), undefined);
});

// A bootstrap test that also carries a curated resource class would have its
// shard entry silently ignored, in the less conservative direction: two
// workers where the curator asked for one. No such file exists; the refusal
// is what tells the next curator (verifier round 1).
test('a bootstrap test may not also carry a curated resource class', () => {
  const unknown = 'test/bootstrap/curated.test.js';
  try {
    Reflect.defineProperty(Object.prototype, unknown, {
      configurable: true,
      enumerable: true,
      value: RESOURCE_CLASS_EXCLUSIVE,
    });
    assert.throws(() => planClassifiedTestFiles(root, [unknown], []),
      /unclassified or missing/u,
      'an inherited classification is refused before any lane decides');
  } finally {
    Reflect.deleteProperty(Object.prototype, unknown);
  }
});

// ---------------------------------------------------------------------------
// Thermal headroom is the runner's to gate, on every host it runs on (owner
// directive 2026-09-23: a lab node rebooted under test load). Before EVERY
// lane batch the runner asks the one thermal owner; a hold waits with the
// owner's poll, an unmeasurable host says so once and proceeds, and a host
// still hot when the owner's attempt budget is spent ends the run with the
// typed refusal, never a batch started hot.

function thermalRun(files, {readings, env = {}, sysRoot, sleep} = {}) {
  const events = [];
  const lines = [];
  let reads = 0;
  const status = runClassifiedTestFiles(files, {
    root,
    env,
    write: (text) => {
      lines.push(text);
      events.push(`line ${text.trimEnd()}`);
    },
    thermalSources: {
      sensors: () => {
        reads += 1;
        events.push('read');
        return readings(reads);
      },
      ...(sysRoot ? {sysRoot} : {}),
    },
    thermalSleep: sleep || ((ms) => events.push(`sleep ${ms}`)),
    spawn(command, args, options) {
      events.push(`spawn ${args.at(-1)}`);
      events.push({env: options.env});
      return {status: 0};
    },
  });
  const spawned = events.filter((event) => typeof event === 'string' &&
    event.startsWith('spawn ')).map((event) => event.slice('spawn '.length));
  return {status, events, text: lines.join(''), reads: () => reads, spawned};
}

function emptySysRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-thermal-sys-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

test('a hot machine holds the batch with the owner poll, then the batch runs', (t) => {
  const run = thermalRun([ORDINARY], {sysRoot: emptySysRoot(t),
    readings: (read) => (read === 1 ? sensorsJson(80, 50) : sensorsJson(60, 50))});
  assert.match(run.text,
    /^thermal: hold cpu 80C \(coretemp\/Package id 0\) nvme 50C \(nvme\/Sensor 2\) - CPU package 80C >= 75C, waiting 30s \(poll 1\/20\)$/mu,
    'the hot reading holds the batch, observably in the stream');
  assert.match(run.text, /^thermal: ok cpu 60C \(coretemp\/Package id 0\) nvme 50C \(nvme\/Sensor 2\)$/mu, 'then headroom is reported');
  const order = run.events.filter((event) => typeof event === 'string')
    .map((event) => event.replace(/ .*$/u, ''));
  assert.deepEqual(order.filter((event) => event !== 'line'),
    ['read', 'sleep', 'read', 'spawn'], 'it waited before the batch started, never during it');
  assert.ok(run.events.includes('sleep 30000'), 'with the owner\'s own poll');
  assert.equal(run.status, 0);
  assert.deepEqual(run.spawned, [ORDINARY]);
});

test('the gate runs before every lane batch, and a gated batch never gates again', (t) => {
  const run = thermalRun([INTEGRATION, ORDINARY], {sysRoot: emptySysRoot(t),
    readings: () => sensorsJson(61, 66)});
  assert.equal(run.reads(), 2, 'one gate per batch, two lanes');
  const order = run.events.filter((event) => event === 'read' ||
    (typeof event === 'string' && event.startsWith('spawn ')));
  assert.deepEqual(order, ['read', `spawn ${ORDINARY}`, 'read', `spawn ${INTEGRATION}`]);
  assert.equal(run.text.match(/^thermal: ok cpu 61C \(coretemp\/Package id 0\) nvme 66C \(nvme\/Sensor 2\)$/gmu).length, 2,
    'one line per gate decision');
  const batchEnvs = run.events.filter((event) => typeof event === 'object');
  assert.ok(batchEnvs.every(({env}) => env.LAGRANGE_SKIP_THERMAL_GATE === '1'),
    'a runner nested inside a gated batch inherits the skip, so it does not gate twice');
});

test('an unmeasurable host says so once and every batch runs', (t) => {
  const run = thermalRun([INTEGRATION, ORDINARY], {sysRoot: emptySysRoot(t),
    readings: () => null});
  assert.equal(run.text.match(/^thermal: unmeasurable \(no sensors\)$/gmu)?.length, 1,
    'the typed line, once, never silent');
  assert.equal(run.reads(), 2, 'it still asks before every batch');
  assert.deepEqual(run.spawned, [ORDINARY, INTEGRATION]);
  assert.equal(run.status, 0);

  const skipped = thermalRun([INTEGRATION, ORDINARY], {sysRoot: emptySysRoot(t),
    env: {LAGRANGE_SKIP_THERMAL_GATE: '1'}, readings: () => sensorsJson(99, 99)});
  assert.equal(skipped.text.match(/^thermal: skipped \(LAGRANGE_SKIP_THERMAL_GATE set\)$/gmu)
    ?.length, 1, 'the one skip, said once');
  assert.equal(skipped.reads(), 0, 'and nothing is read');
  assert.deepEqual(skipped.spawned, [ORDINARY, INTEGRATION]);
});

test('a host still hot after the owner budget refuses the run, typed, and starts nothing hot',
  (t) => {
    const hot = thermalRun([INTEGRATION, ORDINARY], {sysRoot: emptySysRoot(t),
      readings: () => sensorsJson(50, 81)});
    assert.match(hot.text, /^thermal: thermal-headroom-exhausted - still over the hold threshold after 20 polls of 30s: NVMe 81C >= 78C$/mu,
      'the typed refusal');
    assert.deepEqual(hot.spawned, [], 'no test process started for the refused batch');
    assert.notEqual(hot.status, 0, 'a refused run is never green');
    assert.match(hot.text, new RegExp('^# thermal-headroom-exhausted: 2 file\\(s\\) not run: ' +
      `${ORDINARY} ${INTEGRATION}$`, 'mu'), 'the summary names every file not run');
    assert.equal(hot.reads(), 20, 'the owner\'s attempt budget, spent once');

    const later = thermalRun([INTEGRATION, ORDINARY], {sysRoot: emptySysRoot(t),
      readings: (read) => (read === 1 ? sensorsJson(50, 50) : sensorsJson(90, 50))});
    assert.deepEqual(later.spawned, [ORDINARY], 'what ran before the machine heated ran');
    assert.match(later.text, new RegExp('^# thermal-headroom-exhausted: 1 file\\(s\\) not run: ' +
      `${INTEGRATION}$`, 'mu'), 'and only the rest is reported not run');
    assert.notEqual(later.status, 0);
  });

// The owner reads lm-sensors first and the Linux sysfs where it is absent, so
// a lab host without lm-sensors installed is still measured.
test('a host without lm-sensors is measured through sysfs', (t) => {
  const sysRoot = emptySysRoot(t);
  const put = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(sysRoot, relative)), {recursive: true});
    fs.writeFileSync(path.join(sysRoot, relative), `${text}\n`);
  };
  put('class/thermal/thermal_zone0/type', 'acpitz');
  put('class/thermal/thermal_zone0/temp', '97000');
  put('class/thermal/thermal_zone1/type', 'x86_pkg_temp');
  put('class/thermal/thermal_zone1/temp', '46000');
  put('class/hwmon/hwmon1/name', 'nvme');
  put('class/hwmon/hwmon1/temp1_label', 'Composite');
  put('class/hwmon/hwmon1/temp1_input', '28850');
  put('class/hwmon/hwmon1/temp3_label', 'Sensor 2');
  put('class/hwmon/hwmon1/temp3_input', '67850');
  put('class/hwmon/hwmon2/name', 'coretemp');
  put('class/hwmon/hwmon2/temp1_input', '99000');
  const sysfs = thermalRun([ORDINARY], {sysRoot, readings: () => null});
  assert.match(sysfs.text, /^thermal: ok cpu 46C \(thermal_zone\/x86_pkg_temp\) nvme 68C \(nvme\/Sensor 2\)$/mu,
    'the package zone and the NVMe Sensor 2, nothing else');

  const partial = thermalRun([ORDINARY], {sysRoot,
    readings: () => ({'coretemp-isa-0000': {'Package id 0': {temp1_input: 77}}})});
  assert.match(partial.text, /^thermal: hold cpu 77C \(coretemp\/Package id 0\) nvme 68C \(nvme\/Sensor 2\) - CPU package 77C >= 75C/mu,
    'a sensor lm-sensors lacks is taken from sysfs');

  put('class/thermal/thermal_zone1/type', 'cpu-thermal');
  put('class/thermal/thermal_zone1/temp', '79000');
  const arm = thermalRun([ORDINARY], {sysRoot, readings: () => null});
  assert.match(arm.text, /^thermal: hold cpu 79C \(thermal_zone\/cpu-thermal\) nvme 68C \(nvme\/Sensor 2\)/mu, 'an ARM cpu-thermal zone counts');
});

// The CPU package is read whatever the vendor (coordinator, 2026-09-23: the
// host that rebooted has an unknown CPU). Each reading names the source that
// answered, from one ordered table in the owner.
function sysTree(t, files) {
  const sysRoot = emptySysRoot(t);
  for (const [relative, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(sysRoot, relative)), {recursive: true});
    fs.writeFileSync(path.join(sysRoot, relative), `${text}\n`);
  }
  return sysRoot;
}

const NVME_SENSOR_2 = Object.freeze({'nvme-pci-0100': {'Composite': {temp1_input: 30},
  'Sensor 2': {temp3_input: 50}}});

test('an AMD package is read from lm-sensors k10temp Tctl', (t) => {
  const run = thermalRun([ORDINARY], {sysRoot: emptySysRoot(t),
    readings: () => ({'k10temp-pci-00c3': {'Tctl': {temp1_input: 77},
      'Tccd1': {temp3_input: 90}}, ...NVME_SENSOR_2})});
  assert.match(run.text, /^thermal: hold /mu, 'a hot Tctl holds the batch');
  assert.match(run.text, /^thermal: hold cpu 77C \(k10temp\/Tctl\) nvme 50C \(nvme\/Sensor 2\) - CPU package 77C >= 75C/mu,
    'the package reading, named by its source; a core die is not the package');
});

test('an AMD package is read from the sysfs k10temp hwmon, labelled or not', (t) => {
  const labelled = thermalRun([ORDINARY], {readings: () => null, sysRoot: sysTree(t, {
    'class/hwmon/hwmon0/name': 'k10temp',
    'class/hwmon/hwmon0/temp1_label': 'Tctl',
    'class/hwmon/hwmon0/temp1_input': '76000',
    'class/hwmon/hwmon0/temp3_label': 'Tccd1',
    'class/hwmon/hwmon0/temp3_input': '88000',
  })});
  assert.match(labelled.text, /^thermal: hold /mu, 'a hot Tctl in sysfs holds the batch');
  assert.match(labelled.text, /^thermal: hold cpu 76C \(k10temp\/Tctl\) nvme unmeasured - /mu);

  const unlabelled = thermalRun([ORDINARY], {readings: () => null, sysRoot: sysTree(t, {
    'class/hwmon/hwmon3/name': 'k10temp',
    'class/hwmon/hwmon3/temp1_input': '52000',
    'class/hwmon/hwmon3/temp2_input': '81000',
  })});
  assert.match(unlabelled.text, /^thermal: hold cpu 81C \(k10temp\/temp2\) /mu,
    'without a Tctl label, the hottest of its inputs');
});

test('an Intel package is read from the sysfs coretemp hwmon by its label', (t) => {
  const run = thermalRun([ORDINARY], {readings: () => null, sysRoot: sysTree(t, {
    'class/hwmon/hwmon4/name': 'coretemp',
    'class/hwmon/hwmon4/temp1_label': 'Package id 0',
    'class/hwmon/hwmon4/temp1_input': '78000',
    'class/hwmon/hwmon4/temp2_label': 'Core 0',
    'class/hwmon/hwmon4/temp2_input': '90000',
  })});
  assert.match(run.text, /^thermal: hold /mu, 'a hot package in the coretemp hwmon holds');
  assert.match(run.text, /^thermal: hold cpu 78C \(coretemp\/Package id 0\) nvme unmeasured - /mu,
    'the package label, not the hottest core');
});

test('an NVMe drive with only a Composite sensor is measured', (t) => {
  const cpu = {'coretemp-isa-0000': {'Package id 0': {temp1_input: 50}}};
  const sensors = thermalRun([ORDINARY], {sysRoot: emptySysRoot(t),
    readings: () => ({...cpu, 'nvme-pci-0200': {'Composite': {temp1_input: 79}}})});
  assert.match(sensors.text, /^thermal: hold /mu, 'a hot Composite-only drive holds');
  assert.match(sensors.text, /^thermal: hold cpu 50C \(coretemp\/Package id 0\) nvme 79C \(nvme\/Composite\) - NVMe 79C >= 78C/mu);

  const sysfs = thermalRun([ORDINARY], {readings: () => cpu, sysRoot: sysTree(t, {
    'class/hwmon/hwmon1/name': 'nvme',
    'class/hwmon/hwmon1/temp1_label': 'Composite',
    'class/hwmon/hwmon1/temp1_input': '80000',
  })});
  assert.match(sysfs.text, /^thermal: hold cpu 50C \(coretemp\/Package id 0\) nvme 80C \(nvme\/Composite\) - NVMe 80C >= 78C/mu,
    'in sysfs too');

  const preferred = thermalRun([ORDINARY], {sysRoot: emptySysRoot(t),
    readings: () => ({...cpu, 'nvme-pci-0200': {'Composite': {temp1_input: 85},
      'Sensor 2': {temp3_input: 60}}})});
  assert.match(preferred.text, /^thermal: ok cpu 50C \(coretemp\/Package id 0\) nvme 60C \(nvme\/Sensor 2\)$/mu,
    'Sensor 2, where a drive has one, is what the thresholds were set against');
});

test('a host with a CPU sensor and no NVMe sensor gates on the CPU alone', (t) => {
  const cpuOnly = (celsius) => () => ({'coretemp-isa-0000': {'Package id 0': {temp1_input: celsius}}});
  const hot = thermalRun([ORDINARY], {sysRoot: emptySysRoot(t),
    readings: (read) => (read === 1 ? cpuOnly(80)() : cpuOnly(60)())});
  assert.match(hot.text, /^thermal: hold cpu 80C \(coretemp\/Package id 0\) nvme unmeasured - CPU package 80C >= 75C/mu,
    'the CPU alone holds, and the NVMe prints as unmeasured');
  assert.match(hot.text, /^thermal: ok cpu 60C \(coretemp\/Package id 0\) nvme unmeasured$/mu);
  assert.doesNotMatch(hot.text, /^thermal: unmeasurable/mu, 'partial measurement is measurement');
  assert.deepEqual(hot.spawned, [ORDINARY]);
});

// A lab host's ordinary lane is capped by its own processor count, which the
// remote wrapper discovers at run time and hands over in one runner-owned env.
test('a lane jobs cap lowers a lane, never raises one, and refuses garbage', () => {
  const batchEnvs = [];
  const jobsOf = (files, cap) => {
    const calls = [];
    runClassifiedTestFiles(files, {...COOL, root, write: () => {},
      env: {LAGRANGE_LANE_JOBS_CAP: cap},
      spawn(command, args, options) {
        calls.push([args.at(-1), args[1]]);
        batchEnvs.push(options.env);
        return {status: 0};
      }});
    return Object.fromEntries(calls);
  };
  assert.deepEqual(jobsOf([ORDINARY, BOOTSTRAP], '3'),
    {[ORDINARY]: '--jobs=3', [BOOTSTRAP]: '--jobs=2'}, 'ordinary 4 -> 3; bootstrap stays 2');
  assert.deepEqual(jobsOf([ORDINARY, BOOTSTRAP], '1'),
    {[ORDINARY]: '--jobs=1', [BOOTSTRAP]: '--jobs=1'}, 'a two-thread host runs one-up');
  assert.deepEqual(jobsOf([ORDINARY], '19'), {[ORDINARY]: '--jobs=4'}, 'never raised');
  assert.ok(batchEnvs.every((env) => !Object.hasOwn(env, 'LAGRANGE_LANE_JOBS_CAP')),
    'the runner consumes its cap: a batch\'s tests never inherit the host\'s ceiling');
  for (const garbage of ['0', 'x', '2.5', '-1']) {
    assert.throws(() => jobsOf([ORDINARY], garbage), /LAGRANGE_LANE_JOBS_CAP/u, garbage);
  }
});
