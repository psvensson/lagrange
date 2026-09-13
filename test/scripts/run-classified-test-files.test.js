import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
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
const SHARED_OUTPUT =
  'test/scripts/exact-election-evidence-same-turn-model-contract.test.js';
const UTF8 = 'utf8';

test('one classified plan owns concurrency for every test source', () => {
  const plan = planClassifiedTestFiles(root,
    [SHARED_OUTPUT, INTEGRATION, TOOLCHAIN, ORDINARY]);
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

test('a red batch stops the executor unless it is told to keep going', () => {
  const failing = ORDINARY;
  const spawnFailingOrdinary = (calls) => (command, args) => {
    calls.push(args.at(-1));
    return {status: args.at(-1) === failing ? 3 : 0};
  };

  const gateCalls = [];
  const gateStatus = runClassifiedTestFiles([INTEGRATION, ORDINARY],
    {root, spawn: spawnFailingOrdinary(gateCalls)});
  assert.equal(gateStatus, 3);
  assert.deepEqual(gateCalls, [ORDINARY],
    'a gate fails fast: the exclusive lane never starts');

  // The canary is a finder: every lane still runs and the first failure is
  // what it reports, so a red ordinary batch cannot hide the exclusive lane
  // that holds every integration and bootstrap file.
  const canaryCalls = [];
  const canaryStatus = runClassifiedTestFiles([INTEGRATION, ORDINARY],
    {root, keepGoing: true, spawn: spawnFailingOrdinary(canaryCalls)});
  assert.equal(canaryStatus, 3, 'the red is still reported');
  assert.deepEqual(canaryCalls, [ORDINARY, INTEGRATION]);

  assert.throws(() => runClassifiedTestFiles([ORDINARY],
    {root, keepGoing: 'yes', spawn: () => ({status: 0})}),
  /own-data options record/u);
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
    assert.equal(runClassifiedTestFiles([fixture], {root: fixtureRoot}), 0);
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
